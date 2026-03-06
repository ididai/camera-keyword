import { useEffect, useMemo, useRef, useState } from "react";
import { buildSubjectObject } from "./buildSubjectObject";
import { resolveKeywords } from "./keywordResolver";
import { ANGLE_PRESETS, AR_PRESETS, DEFAULT_SUBJECT_PROMPTS, SUBJECT_TYPES } from "./cameraGlossary";
import {
  SEGMENT_COLORS,
  buildPromptSegments,
  hasKorean,
  toPromptText,
  validatePromptInput,
} from "./promptBuilder";
import { detectAwkwardExpressions } from "./promptQuality";

function getGazeKeyword(subjectId, theta, isKorean) {
  if (subjectId !== "person") return "";
  const abs = Math.abs(theta);
  const right = theta > 0;

  if (abs > 150) return "";
  if (abs < 12) return isKorean ? "카메라 정면 응시" : "looking directly at camera";
  if (abs >= 80) return right ? (isKorean ? "오른쪽 측면 시선" : "facing right") : (isKorean ? "왼쪽 측면 시선" : "facing left");
  return right ? (isKorean ? "오른쪽 비스듬히" : "angled right") : (isKorean ? "왼쪽 비스듬히" : "angled left");
}

export default function InteractiveMode() {
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1440,
  );

  const [subjectIdx, setSubjectIdx] = useState(0);
  const subject = SUBJECT_TYPES[subjectIdx];

  const [subjectText, setSubjectText] = useState("");
  const [subjectKorean, setSubjectKorean] = useState("");
  const [subjectEnglish, setSubjectEnglish] = useState("");
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState("");
  const [promptLang, setPromptLang] = useState("en");

  const [activePreset, setActivePreset] = useState(null);
  const [arPresetId, setArPresetId] = useState("ar916");

  const [phi, setPhi] = useState(65);
  const [theta, setTheta] = useState(0);
  const [r, setR] = useState(0.72);

  const [copied, setCopied] = useState(false);

  const mountRef = useRef(null);
  const frameRef = useRef(null);
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const phiRef = useRef(phi);
  const thetaRef = useRef(theta);
  const rRef = useRef(r);

  const isMobile = viewportWidth <= 860;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setViewportWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    setSubjectText("");
    setSubjectKorean("");
    setSubjectEnglish("");
    setTranslateError("");
    setActivePreset(null);
  }, [subjectIdx]);

  useEffect(() => {
    phiRef.current = phi;
  }, [phi]);

  useEffect(() => {
    thetaRef.current = theta;
  }, [theta]);

  useEffect(() => {
    rRef.current = r;
  }, [r]);

  const applyPreset = (preset) => {
    setActivePreset(preset.id);

    const startPhi = phi;
    const startTheta = theta;
    const startR = r;

    const endPhi = preset.phi;
    const endTheta = preset.theta;
    const endR = preset.r;

    const duration = 420;
    const startTime = performance.now();

    if (frameRef.current) cancelAnimationFrame(frameRef.current);

    const animate = (now) => {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      setPhi(startPhi + (endPhi - startPhi) * ease);
      setTheta(startTheta + (endTheta - startTheta) * ease);
      setR(startR + (endR - startR) * ease);

      if (t < 1) frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);
  };

  const selectedAr = AR_PRESETS.find((item) => item.id === arPresetId);

  const resolved = useMemo(() => resolveKeywords(phi, theta, r, subject), [phi, theta, r, subject]);
  const isPromptKR = promptLang === "kr";
  const gazeKr = useMemo(() => getGazeKeyword(subject.id, theta, true), [subject.id, theta]);
  const gazeEn = useMemo(() => getGazeKeyword(subject.id, theta, false), [subject.id, theta]);
  const subjectForPrompt = isPromptKR
    ? (subjectKorean || subjectText.trim())
    : subjectEnglish;

  const promptValidationError = validatePromptInput({
    promptLang,
    subjectKorean: subjectKorean || subjectText,
    subjectEnglish,
  });

  const promptSegments = useMemo(
    () =>
      buildPromptSegments({
        subjectText: subjectForPrompt,
        shot: isPromptKR ? resolved.shot.kr : resolved.shot.en,
        height: isPromptKR ? resolved.height.kr : resolved.height.en,
        direction: isPromptKR ? resolved.direction.kr : resolved.direction.en,
        gaze: isPromptKR ? gazeKr : gazeEn,
        arValue: selectedAr?.value || "",
      }),
    [subjectForPrompt, isPromptKR, resolved, gazeKr, gazeEn, selectedAr],
  );

  const displayPrompt = toPromptText(promptSegments);
  const awkwardWords = isPromptKR ? [] : detectAwkwardExpressions(displayPrompt);

  const translateSubject = async () => {
    const value = subjectText.trim();

    if (!value) {
      setTranslateError("주체를 먼저 입력해 주세요.");
      return;
    }

    if (!hasKorean(value)) {
      setSubjectKorean(value);
      setSubjectEnglish(value);
      setSubjectText("");
      setTranslateError("");
      setPromptLang("en");
      return;
    }

    setTranslating(true);
    setTranslateError("");

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "번역 요청 실패");
      }

      const translated = (data?.translatedText || "").trim();
      if (!translated) throw new Error("번역 결과가 비어 있습니다.");

      setSubjectKorean(value);
      setSubjectEnglish(translated);
      setSubjectText("");
      setTranslateError("");
      setPromptLang("en");
    } catch (error) {
      setTranslateError(error?.message || "번역 중 오류가 발생했습니다.");
    }

    setTranslating(false);
  };

  const copyPrompt = async () => {
    if (!displayPrompt || promptValidationError) return;

    try {
      await navigator.clipboard.writeText(displayPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      const el = document.createElement("textarea");
      el.value = displayPrompt;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.focus();
      el.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch {
        setTranslateError("복사에 실패했어요. 다시 시도해 주세요.");
      }
      document.body.removeChild(el);
    }
  };

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const onWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.04 : -0.04;
      setR((prev) => Math.min(1, Math.max(0, prev + delta)));
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    let cleanup = () => {};
    let mounted = true;

    const init = async () => {
      const THREE = await import("three");
      if (!mounted || !mountRef.current) return;

      const width = mountRef.current.clientWidth || 320;
      const height = mountRef.current.clientHeight || 320;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1a1a1a);
      scene.fog = new THREE.Fog(0x1a1a1a, 10, 30);

      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
      camera.position.set(0, 0, 6);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      mountRef.current.appendChild(renderer.domElement);

      scene.add(new THREE.AmbientLight(0x334466, 1.0));
      const key = new THREE.DirectionalLight(0xffffff, 1.2);
      key.position.set(3, 5, 4);
      scene.add(key);

      const rim = new THREE.DirectionalLight(0x4466ff, 0.5);
      rim.position.set(-3, 2, -4);
      scene.add(rim);

      const sphereGeo = new THREE.SphereGeometry(2.2, 24, 18);
      const sphereMat = new THREE.MeshBasicMaterial({
        color: 0x1a3a6a,
        wireframe: true,
        transparent: true,
        opacity: 0.25,
      });
      scene.add(new THREE.Mesh(sphereGeo, sphereMat));

      const innerMat = new THREE.MeshBasicMaterial({
        color: 0x0a1a3a,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
      });
      scene.add(new THREE.Mesh(new THREE.SphereGeometry(2.2, 24, 18), innerMat));

      buildSubjectObject(THREE, subject.object, scene);

      const updateCamera = () => {
        const pRad = (phiRef.current * Math.PI) / 180;
        const tRad = (thetaRef.current * Math.PI) / 180;
        const viewR = 3 + (1 - rRef.current) * 7;

        const x = viewR * Math.sin(pRad) * Math.sin(tRad);
        const y = viewR * Math.cos(pRad);
        const z = viewR * Math.sin(pRad) * Math.cos(tRad);

        camera.position.set(x, y, z);
        if (phiRef.current < 5 || phiRef.current > 175) {
          camera.up.set(0, 0, phiRef.current < 90 ? -1 : 1);
        } else {
          camera.up.set(0, 1, 0);
        }
        camera.lookAt(0, 0, 0);
      };

      const onResize = () => {
        if (!mountRef.current) return;
        const w = mountRef.current.clientWidth || 320;
        const h = mountRef.current.clientHeight || 320;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };

      const getPos = (e) => {
        if (e.touches) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        return { x: e.clientX, y: e.clientY };
      };

      const onDown = (e) => {
        isDragging.current = true;
        lastMouse.current = getPos(e);
        e.preventDefault();
      };

      const onMove = (e) => {
        if (!isDragging.current) return;
        const pos = getPos(e);
        const dx = pos.x - lastMouse.current.x;
        const dy = pos.y - lastMouse.current.y;
        lastMouse.current = pos;

        thetaRef.current = ((thetaRef.current + dx * 0.6 + 180) % 360) - 180;
        phiRef.current = Math.max(1, Math.min(179, phiRef.current + dy * 0.5));

        setTheta(Math.round(thetaRef.current));
        setPhi(Math.round(phiRef.current));

        e.preventDefault();
      };

      const onUp = () => {
        isDragging.current = false;
      };

      const animate = () => {
        frameRef.current = requestAnimationFrame(animate);
        updateCamera();
        renderer.render(scene, camera);
      };

      window.addEventListener("resize", onResize);
      renderer.domElement.addEventListener("mousedown", onDown);
      renderer.domElement.addEventListener("mousemove", onMove);
      renderer.domElement.addEventListener("mouseup", onUp);
      renderer.domElement.addEventListener("touchstart", onDown, { passive: false });
      renderer.domElement.addEventListener("touchmove", onMove, { passive: false });
      renderer.domElement.addEventListener("touchend", onUp);
      window.addEventListener("mouseup", onUp);

      animate();

      cleanup = () => {
        cancelAnimationFrame(frameRef.current);
        window.removeEventListener("resize", onResize);
        renderer.domElement.removeEventListener("mousedown", onDown);
        renderer.domElement.removeEventListener("mousemove", onMove);
        renderer.domElement.removeEventListener("mouseup", onUp);
        renderer.domElement.removeEventListener("touchstart", onDown);
        renderer.domElement.removeEventListener("touchmove", onMove);
        renderer.domElement.removeEventListener("touchend", onUp);
        window.removeEventListener("mouseup", onUp);

        scene.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
            else obj.material.dispose();
          }
        });

        renderer.dispose();
        if (mountRef.current && renderer.domElement.parentNode === mountRef.current) {
          mountRef.current.removeChild(renderer.domElement);
        }
      };
    };

    init();

    return () => {
      mounted = false;
      cleanup();
    };
  }, [subject.object]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 130px)",
        minHeight: 560,
        background: "#1a1a1a",
      }}
    >
      <div style={{ display: "flex", gap: 0, background: "#1a1a1a", borderBottom: "2px solid #f19eb8" }}>
        {SUBJECT_TYPES.map((item, idx) => (
          <button
            key={item.id}
            onClick={() => setSubjectIdx(idx)}
            style={{
              flex: 1,
              padding: "10px 4px",
              border: "none",
              cursor: "pointer",
              borderRight: idx < SUBJECT_TYPES.length - 1 ? "1px solid #1a1a1a" : "none",
              background: idx === subjectIdx ? "#f19eb8" : "transparent",
              color: idx === subjectIdx ? "#1a1a1a" : "#555",
              fontFamily: "'Arial Black','Helvetica Neue',sans-serif",
              fontSize: 12,
              fontWeight: 900,
            }}
          >
            <div style={{ fontSize: 17, marginBottom: 2 }}>{item.icon}</div>
            <div>{item.kr}</div>
          </button>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: isMobile ? "wrap" : "nowrap",
          padding: "10px 16px",
          background: "#1a1a1a",
          borderBottom: "1px solid #1a2a4a",
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: "#666",
            fontFamily: "sans-serif",
            letterSpacing: "0.12em",
            whiteSpace: "nowrap",
            fontWeight: 700,
          }}
        >
          SUBJECT
        </span>

        <div style={{ flex: 1, minWidth: isMobile ? "100%" : 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: isMobile ? "wrap" : "nowrap" }}>
            <input
              type="text"
              value={subjectText}
              onChange={(e) => {
                setSubjectText(e.target.value);
                setSubjectKorean("");
                setSubjectEnglish("");
                setTranslateError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") translateSubject();
              }}
              placeholder={DEFAULT_SUBJECT_PROMPTS[subject.id]}
              style={{
                flex: 1,
                minWidth: isMobile ? "100%" : 0,
                background: "#252525",
                border: "1px solid #2a3a6a",
                borderRadius: 8,
                padding: "8px 12px",
                color: "#e0ddd4",
                fontSize: 13,
                fontFamily: "sans-serif",
                outline: "none",
              }}
            />

            <button
              onClick={translateSubject}
              disabled={translating}
              style={{
                background: translating ? "#252525" : "#f19eb8",
                border: "none",
                borderRadius: 7,
                color: translating ? "#777" : "#1a1a1a",
                fontSize: 12,
                fontWeight: 800,
                padding: "7px 12px",
                cursor: translating ? "default" : "pointer",
                fontFamily: "sans-serif",
                whiteSpace: "nowrap",
              }}
            >
              {translating ? "번역중..." : "번역"}
            </button>

            <button
              onClick={() => {
                setSubjectText("");
                setSubjectKorean("");
                setSubjectEnglish("");
                setTranslateError("");
              }}
              style={{
                background: "#252525",
                border: "1px solid #2a3a6a",
                borderRadius: 6,
                color: "#888",
                fontSize: 12,
                padding: "7px 10px",
                cursor: "pointer",
                fontFamily: "sans-serif",
                whiteSpace: "nowrap",
              }}
            >
              초기화
            </button>
          </div>

          {(subjectKorean || subjectEnglish) ? (
            <div
              style={{
                background: "#0d2a1a",
                border: "1px solid #1a5a2a",
                borderRadius: 6,
                padding: "5px 10px",
                fontSize: 12,
                color: "#88ffaa",
                fontFamily: "sans-serif",
              }}
            >
              <div style={{ color: "#7cc78f", fontWeight: 700, marginBottom: 2 }}>입력 요약</div>
              {subjectKorean ? (
                <div style={{ color: "#b8ffd1", fontFamily: "sans-serif" }}>KR: {subjectKorean}</div>
              ) : null}
              {subjectEnglish ? (
                <div style={{ color: "#88ffaa", fontFamily: "monospace" }}>EN: {subjectEnglish}</div>
              ) : null}
            </div>
          ) : null}

          {translateError ? (
            <div style={{ fontSize: 12, color: "#ff9ab6", fontFamily: "sans-serif" }}>{translateError}</div>
          ) : null}
        </div>
      </div>

      <div
        style={{
          padding: "7px 12px",
          background: "#111",
          borderBottom: "1px solid #222",
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 5,
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: "#f19eb8",
            fontFamily: "'Arial Black',sans-serif",
            fontWeight: 900,
            letterSpacing: "0.18em",
            marginRight: 4,
          }}
        >
          ✦ RATIO
        </span>
        {AR_PRESETS.map((preset) => {
          const isOn = arPresetId === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => setArPresetId(preset.id)}
              style={{
                background: isOn ? "#5ce8ff" : "transparent",
                color: isOn ? "#000" : "#888",
                border: `1px solid ${isOn ? "#5ce8ff" : "#333"}`,
                borderRadius: 3,
                padding: "2px 7px",
                cursor: "pointer",
                fontFamily: "'Arial Black',sans-serif",
                fontSize: 10,
                fontWeight: 900,
              }}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div
        style={{
          flex: 1,
          minHeight: isMobile ? 300 : 420,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div ref={mountRef} style={{ width: "100%", height: "100%", cursor: "grab" }} />

        <div
          style={{
            position: "absolute",
            top: 10,
            left: "50%",
            transform: "translateX(-50%)",
            color: "#666",
            fontSize: 12,
            fontFamily: "sans-serif",
            letterSpacing: "0.08em",
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          드래그로 앵글 조정 · 휠로 거리 조정
        </div>

        <div
          style={{
            position: "absolute",
            top: 36,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 4,
            zIndex: 10,
            flexWrap: "wrap",
            justifyContent: "center",
            maxWidth: "94%",
          }}
        >
          {ANGLE_PRESETS.map((preset) => {
            const isActive = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset)}
                style={{
                  background: isActive ? "#f19eb8" : "rgba(10,12,26,0.72)",
                  border: `1px solid ${isActive ? "#f19eb8" : "rgba(255,255,255,0.10)"}`,
                  borderRadius: 14,
                  padding: "3px 9px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                <span style={{ fontSize: 12 }}>{preset.icon}</span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: isActive ? 800 : 500,
                    fontFamily: "sans-serif",
                    color: isActive ? "#1a1a1a" : "rgba(255,255,255,0.55)",
                  }}
                >
                  {preset.label}
                </span>
              </button>
            );
          })}
        </div>

        <div
          style={{
            position: "absolute",
            right: isMobile ? 8 : 12,
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span style={{ fontSize: 9, color: "#f19eb8", fontFamily: "sans-serif", fontWeight: 700 }}>멀리</span>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round((1 - r) * 100)}
            onChange={(e) => setR(1 - e.target.value / 100)}
            style={{
              writingMode: "vertical-lr",
              direction: "rtl",
              width: 20,
              height: 120,
              cursor: "pointer",
              accentColor: "#f19eb8",
            }}
          />
          <span style={{ fontSize: 9, color: "#f19eb8", fontFamily: "sans-serif", fontWeight: 700 }}>
            {Math.round(r * 100)}%
          </span>
        </div>

        <div
          style={{
            position: "absolute",
            left: 10,
            bottom: 10,
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            maxWidth: isMobile ? "calc(100% - 28px)" : 420,
          }}
        >
          {[
            { label: "SHOT", value: isPromptKR ? resolved.shot.kr : resolved.shot.en },
            { label: "ANGLE", value: isPromptKR ? resolved.height.kr : resolved.height.en },
            { label: "DIRECTION", value: isPromptKR ? resolved.direction.kr : resolved.direction.en },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                background: "rgba(8,18,34,0.82)",
                border: "1px solid rgba(92,232,255,0.28)",
                borderRadius: 8,
                padding: "6px 8px",
              }}
            >
              <div style={{ fontSize: 9, color: "#5ce8ff", fontFamily: "sans-serif", letterSpacing: "0.08em" }}>
                {item.label}
              </div>
              <div style={{ fontSize: 12, color: "#e0ddd4", fontFamily: "sans-serif", fontWeight: 700 }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          background: "#111",
          padding: "10px 16px",
          borderTop: "2px solid #f19eb8",
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "flex-start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 72 }}>
          <span
            style={{
              fontSize: 10,
              color: "#f19eb8",
              fontFamily: "'Arial Black',sans-serif",
              letterSpacing: "0.2em",
              fontWeight: 900,
            }}
          >
            PROMPT
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => setPromptLang("kr")}
              style={{
                background: isPromptKR ? "#f19eb8" : "transparent",
                color: isPromptKR ? "#111" : "#777",
                border: `1px solid ${isPromptKR ? "#f19eb8" : "#333"}`,
                borderRadius: 4,
                padding: "2px 6px",
                cursor: "pointer",
                fontSize: 11,
                fontFamily: "sans-serif",
                fontWeight: 700,
              }}
            >
              KR
            </button>
            <button
              onClick={() => setPromptLang("en")}
              style={{
                background: !isPromptKR ? "#f19eb8" : "transparent",
                color: !isPromptKR ? "#111" : "#777",
                border: `1px solid ${!isPromptKR ? "#f19eb8" : "#333"}`,
                borderRadius: 4,
                padding: "2px 6px",
                cursor: "pointer",
                fontSize: 11,
                fontFamily: "sans-serif",
                fontWeight: 700,
              }}
            >
              EN
            </button>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 200, fontFamily: "monospace", lineHeight: 1.7 }}>
          {promptSegments.length ? (
            <>
              {promptSegments
                .filter((segment) => segment.type !== "ratio")
                .map((segment, idx, arr) => (
                  <span
                    key={`${segment.type}-${segment.text}-${idx}`}
                    style={{
                      color: SEGMENT_COLORS[segment.type] || "#e0ddd4",
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    {segment.text}
                    {idx < arr.length - 1 ? ", " : ""}
                  </span>
                ))}
              {promptSegments.find((segment) => segment.type === "ratio") ? (
                <span style={{ color: SEGMENT_COLORS.ratio, fontSize: 13, fontWeight: 800 }}>
                  {" "}
                  {promptSegments.find((segment) => segment.type === "ratio")?.text}
                </span>
              ) : null}
            </>
          ) : (
            <span style={{ color: "#666", fontSize: 13, fontFamily: "sans-serif" }}>
              주체를 입력하고 번역하면 프롬프트가 생성됩니다. (KR/EN 토글 가능)
            </span>
          )}

          {promptValidationError ? (
            <div style={{ marginTop: 6, color: "#ff9ab6", fontSize: 12, fontFamily: "sans-serif" }}>
              {promptValidationError}
            </div>
          ) : null}

          {awkwardWords.length > 0 ? (
            <div style={{ marginTop: 6, color: "#f7b267", fontSize: 12, fontFamily: "sans-serif" }}>
              어색할 수 있는 표현 감지: {awkwardWords.join(", ")}
            </div>
          ) : null}
        </div>

        <button
          onClick={copyPrompt}
          disabled={!displayPrompt || Boolean(promptValidationError)}
          style={{
            background: copied ? "#7bd389" : "#f19eb8",
            color: copied ? "#0b2a14" : "#1a1a1a",
            border: "none",
            borderRadius: 8,
            padding: "10px 16px",
            cursor: !displayPrompt || promptValidationError ? "default" : "pointer",
            fontFamily: "'Arial Black','Helvetica Neue',sans-serif",
            fontSize: 12,
            fontWeight: 900,
            whiteSpace: "nowrap",
            opacity: !displayPrompt || promptValidationError ? 0.45 : 1,
          }}
        >
          {copied ? "복사 완료" : "복사 COPY"}
        </button>
      </div>
    </div>
  );
}
