import { useEffect, useRef, useState } from "react";
import {
  ANGLE_PRESETS,
  DATA,
  DEFAULT_SUBJECT_PROMPTS,
  LIGHTING_GROUPS,
  MJ_AR_PRESETS,
  MJ_PARAM_GROUPS,
  MJ_PARAM_PRESETS,
  MOOD_GROUPS,
  QUALITY_CHIPS,
  STYLE_GROUPS,
  SUBJECT_TYPES,
} from "./constants";
import { buildSubjectObject } from "./buildSubjectObject";
import { resolveKeywords } from "./keywordResolver";
import { TipIcon, Tooltip } from "./Tooltip";

export default function InteractiveMode({ langKR }) {
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1440
  );
  const [subjectIdx, setSubjectIdx] = useState(0);
  const subject = SUBJECT_TYPES[subjectIdx];
  const [subjectText, setSubjectText] = useState(DEFAULT_SUBJECT_PROMPTS["person"]);
  const [drawerOpen, setDrawerOpen] = useState(null);
  const [selectedLighting, setSelectedLighting] = useState([]);
  const [selectedQuality, setSelectedQuality] = useState([]);
  const [activePreset, setActivePreset] = useState(null);
  const [mjSelectedParams, setMjSelectedParams] = useState(new Set()); // Set of param IDs
  const [selectedLens, setSelectedLens] = useState(null);
  const [selectedFocus, setSelectedFocus] = useState(null);
  const [selectedComposition, setSelectedComposition] = useState(null);
  const [selectedMovementKw, setSelectedMovementKw] = useState(null);
  const [selectedRigKw, setSelectedRigKw] = useState(null);
  const [kwPanelTab, setKwPanelTab] = useState("shot"); // shot | lens | focus | comp | move | rig // { groupName: itemId }
  const [mjArParam, setMjArParam] = useState(null); // AR preset id
  const [mjCustomParam, setMjCustomParam] = useState("");
  const animRef = useRef(null);

  // 프리셋 클릭 → 부드러운 애니메이션으로 이동
  const applyPreset = (preset) => {
    setActivePreset(preset.id);
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const startPhi = phi, startTheta = theta, startR = r;
    const endPhi = preset.phi, endTheta = preset.theta, endR = preset.r;
    const duration = 500;
    const startTime = performance.now();
    const animate = (now) => {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
      setPhi(startPhi + (endPhi - startPhi) * ease);
      setTheta(startTheta + (endTheta - startTheta) * ease);
      setR(startR + (endR - startR) * ease);
      if (t < 1) animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
  };
  const [bookmarks, setBookmarks] = useState([]);
  const [showBookmarks, setShowBookmarks] = useState(false);

  // ── 커스텀 앵글 프리셋 ──
  const [customPresets, setCustomPresets] = useState([]);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState("");

  // ── 앱 시작 시 저장된 북마크 불러오기 ──
  useEffect(() => {
    const loadBookmarks = async () => {
      try {
        const result = await window.storage.get("ck_bookmarks");
        if (result?.value) {
          const parsed = JSON.parse(result.value);
          if (Array.isArray(parsed)) setBookmarks(parsed);
        }
      } catch (e) { /* 없으면 빈 배열 유지 */ }
      try {
        const result2 = await window.storage.get("ck_custom_presets");
        if (result2?.value) {
          const parsed2 = JSON.parse(result2.value);
          if (Array.isArray(parsed2)) setCustomPresets(parsed2);
        }
      } catch (e) {}
    };
    if (window.storage) loadBookmarks();
  }, []);

  const saveBookmark = async () => {
    if (!displayPrompt.trim()) return;
    const entry = {
      id: Date.now(),
      prompt: displayPrompt,
      subject: subject.kr,
      phi: Math.round(phi),
      theta: Math.round(theta),
      ts: new Date().toLocaleString("ko-KR", {month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}),
    };
    const updated = [entry, ...bookmarks].slice(0, 50);
    setBookmarks(updated);
    try { await window.storage.set("ck_bookmarks", JSON.stringify(updated)); } catch(e) {}
  };

  const deleteBookmark = async (id) => {
    const updated = bookmarks.filter(b => b.id !== id);
    setBookmarks(updated);
    try { await window.storage.set("ck_bookmarks", JSON.stringify(updated)); } catch(e) {}
  };

  const clearAllBookmarks = async () => {
    setBookmarks([]);
    try { await window.storage.delete("ck_bookmarks"); } catch(e) {}
  };

  // ── 커스텀 프리셋 저장/삭제 ──
  const saveCustomPreset = async (name) => {
    if (!name.trim()) return;
    const entry = {
      id: Date.now(),
      label: name.trim(),
      icon: "⭐",
      phi: Math.round(phi),
      theta: Math.round(theta),
      r: Math.round(r * 100) / 100,
      subject: subject.id,
      desc: `φ${Math.round(phi)}° θ${Math.round(theta)}° ${Math.round(r*100)}%`,
      extraKw: "",
    };
    const updated = [entry, ...customPresets].slice(0, 20);
    setCustomPresets(updated);
    try { await window.storage.set("ck_custom_presets", JSON.stringify(updated)); } catch(e) {}
    setShowSavePreset(false);
    setPresetNameInput("");
  };

  const deleteCustomPreset = async (id) => {
    const updated = customPresets.filter(p => p.id !== id);
    setCustomPresets(updated);
    try { await window.storage.set("ck_custom_presets", JSON.stringify(updated)); } catch(e) {}
  };

  const [selectedMoods, setSelectedMoods] = useState([]);
  const [selectedStyles, setSelectedStyles] = useState([]);
  const [translating, setTranslating] = useState(false);
  const [translatedText, setTranslatedText] = useState(""); // 번역된 영문 (프롬프트에 실제 사용)
  const [showTranslated, setShowTranslated] = useState(false);
  const [translateError, setTranslateError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setViewportWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isNarrow = viewportWidth <= 1220;
  const isMobile = viewportWidth <= 900;

  // 한글 포함 여부 체크
  const hasKorean = (str) => /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(str);

  // Google Translate API로 번역
  const translateSubject = async (text) => {
    if (!text.trim()) return;
    if (!hasKorean(text)) {
      setTranslatedText(text);
      setShowTranslated(false);
      setTranslateError("");
      return;
    }
    setTranslating(true);
    setTranslateError("");
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Translation request failed");
      }

      const translated = data?.translatedText?.trim() || text;
      setTranslatedText(translated);
      setShowTranslated(Boolean(data?.translatedText));
      // 번역 성공 시 PROMPT를 영어로 즉시 강제 전환
      setPromptLang("en");
      // 사용자 요구사항: 번역 성공 후 SUBJECT 입력칸 비우기
      setSubjectText("");
      setTranslateError("");
    } catch(e) {
      console.error("translateSubject error:", e);
      setTranslatedText(text);
      setShowTranslated(false);
      setTranslateError(e?.message || "번역 실패");
    }
    setTranslating(false);
  };

  // 카메라 구면좌표: phi(수직0~180), theta(수평-180~180), r(0~1 정규화)
  const [phi, setPhi]     = useState(65);   // 아이레벨
  const [theta, setTheta] = useState(0);    // 정면
  const [r, setR]         = useState(0.72); // 미디엄샷

  // 피사체 바뀌면 기본 주체 자동 세팅 + 서랍 닫기
  // 피사체 변경시만 초기화 (비율 변경은 포함 안 함)
  useEffect(() => {
    setSubjectText(DEFAULT_SUBJECT_PROMPTS[subject.id] || "");
    setDrawerOpen(null);
    setSelectedMoods([]);
    setSelectedStyles([]);
    setSelectedLighting([]);
    setSelectedQuality([]);
    setShowTranslated(false);
    setActivePreset(null);
    setShowBookmarks(false);
  }, [subjectIdx]);

  const resolved = resolveKeywords(phi, theta, r, subject);
  const activePresetData = ANGLE_PRESETS.find(p => p.id === activePreset);
  const presetKwStr = (activePresetData?.extraKw && !langKR) ? ", " + activePresetData.extraKw : "";

  // 파라미터값 계산 (다중 선택)
  const mjParamStr = (() => {
    const parts = [];
    mjSelectedParams.forEach(id => {
      const found = MJ_PARAM_PRESETS.find(p => p.id === id);
      if (found?.params) parts.push(found.params);
    });
    if (mjArParam) {
      const ar = MJ_AR_PRESETS.find(a => a.id === mjArParam);
      if (ar) parts.push(ar.params);
    }
    if (mjCustomParam.trim()) parts.push(mjCustomParam.trim());
    return parts.length > 0 ? " " + parts.join(" ") : "";
  })();

  // ── 미드저니 최적 프롬프트 순서 ──
  // [피사체] + [샷/앵글] + [시선] + [렌즈] + [조명] + [구도] + [무드] + [스타일] + [심도/포커스] + [무브] + [장비] + [품질] + [MJ params]
  // 프롬프트 바 전용 언어 토글 (UI langKR과 독립)
  // "kr" | "en" | null(=UI 따라감)
  const [promptLang, setPromptLang] = useState(null);
  const promptIsKR = promptLang !== null ? promptLang === "kr" : langKR;

  // promptIsKR 기준으로 프롬프트 재생성
  const buildPromptForLang = (isKR) => {
    const kws = isKR
      ? [resolved.height.kr, resolved.direction.kr, resolved.shot.kr]
      : [resolved.height.en, resolved.direction.en, resolved.shot.en];

    const gaze = (() => {
      if (subject.id !== "person") return "";
      const abs = Math.abs(theta); const right = theta > 0;
      if (abs > 150) return "";
      if (abs < 12) return isKR ? "카메라 정면 응시" : "looking directly at camera";
      if (abs >= 80) return right ? (isKR ? "오른쪽 측면 시선" : "facing right") : (isKR ? "왼쪽 측면 시선" : "facing left");
      return right ? (isKR ? "오른쪽 비스듬히" : "angled right") : (isKR ? "왼쪽 비스듬히" : "angled left");
    })();

    const parts = [];
    // subject 규칙
    // - KR 모드: 원문 subjectText
    // - EN 모드: 번역 성공(showTranslated) 시 translatedText 우선, 없으면 subjectText
    const subj = isKR
      ? subjectText
      : ((showTranslated && translatedText) ? translatedText : subjectText);
    if (subj.trim()) parts.push(subj.trim());
    parts.push(...kws);
    if (gaze) parts.push(gaze);
    if (!isKR && presetKwStr) parts.push(presetKwStr.replace(/^, /, ""));
    if (selectedLens) parts.push(isKR ? selectedLens.kr.split(" — ")[0] : selectedLens.en.split(",")[0]);
    if (selectedLighting.length > 0) parts.push(...selectedLighting.map(l => isKR ? l.kr.split(" — ")[0] : l.en));
    if (selectedComposition) parts.push(isKR ? selectedComposition.kr : selectedComposition.en.split(",")[0]);
    if (selectedMoods.length > 0) parts.push(...selectedMoods);
    if (selectedStyles.length > 0) parts.push(...selectedStyles);
    if (selectedFocus) parts.push(isKR ? selectedFocus.kr.split(" — ")[0] : selectedFocus.en.split(",")[0]);
    if (selectedMovementKw) parts.push(isKR ? selectedMovementKw.kr : selectedMovementKw.en.split(",")[0]);
    if (selectedRigKw) parts.push(isKR ? selectedRigKw.kr : selectedRigKw.en.split(",")[0]);
    if (selectedQuality.length > 0) parts.push(...selectedQuality.map(q => isKR ? q.kr : q.en));
    return parts.join(", ") + (isKR ? "" : mjParamStr);
  };

  const displayPrompt = buildPromptForLang(promptIsKR);

  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const copyPrompt = () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(displayPrompt).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }).catch(() => fallbackCopy());
      } else {
        fallbackCopy();
      }
    } catch(e) { fallbackCopy(); }
  };
  const fallbackCopy = () => {
    const el = document.createElement('textarea');
    el.value = displayPrompt;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.focus(); el.select();
    try { document.execCommand('copy'); } catch(e) {}
    document.body.removeChild(el);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Three.js 구 뷰어 ──
  const mountRef   = useRef(null);
  const frameRef   = useRef(null);
  const isDragging = useRef(false);
  const lastMouse  = useRef({ x:0, y:0 });
  const phiRef     = useRef(phi);
  const thetaRef   = useRef(theta);
  const rRef       = useRef(r);

  // 마우스 휠 줌 — native 이벤트 (passive:false로 스크롤 막기)
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.04 : -0.04;
      setR(prev => Math.min(1, Math.max(0, prev + delta)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // phi/theta/r ref sync
  useEffect(() => { phiRef.current = phi; },   [phi]);
  useEffect(() => { thetaRef.current = theta; },[theta]);
  useEffect(() => { rRef.current = r; },        [r]);

  // ── Three.js 초기화 ──
  useEffect(() => {
    const initScene = (THREE) => {
      if (!mountRef.current) return () => {};
      const W = mountRef.current.clientWidth  || 320;
      const H = mountRef.current.clientHeight || 320;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1a1a1a);
      scene.fog = new THREE.Fog(0x1a1a1a, 10, 30);

      const camera = new THREE.PerspectiveCamera(45, W/H, 0.1, 100);
      camera.position.set(0, 0, 6);
      camera.lookAt(0,0,0);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(W, H);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      mountRef.current.appendChild(renderer.domElement);

      // 조명
      scene.add(new THREE.AmbientLight(0x334466, 1.0));
      const key = new THREE.DirectionalLight(0xffffff, 1.2);
      key.position.set(3,5,4); scene.add(key);
      const rim = new THREE.DirectionalLight(0x4466ff, 0.5);
      rim.position.set(-3,2,-4); scene.add(rim);

      // 구 (와이어프레임)
      const sphereGeo = new THREE.SphereGeometry(2.2, 24, 18);
      const sphereMat = new THREE.MeshBasicMaterial({
        color: 0x1a3a6a, wireframe: true, transparent: true, opacity: 0.25
      });
      scene.add(new THREE.Mesh(sphereGeo, sphereMat));

      // 구 내부 solid (반투명)
      const innerMat = new THREE.MeshBasicMaterial({
        color: 0x0a1a3a, transparent: true, opacity: 0.15, side: 1
      });
      scene.add(new THREE.Mesh(new THREE.SphereGeometry(2.2,24,18), innerMat));

      // 축선 (세로)
      const axisMat = new THREE.LineBasicMaterial({ color: 0x2244aa, transparent:true, opacity:0.4 });
      const axisGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0,-2.4,0), new THREE.Vector3(0,2.4,0)
      ]);
      scene.add(new THREE.Line(axisGeo, axisMat));

      // 적도선
      const eqPoints = [];
      for (let i=0; i<=64; i++) {
        const a = (i/64)*Math.PI*2;
        eqPoints.push(new THREE.Vector3(Math.cos(a)*2.2, 0, Math.sin(a)*2.2));
      }
      scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(eqPoints),
        new THREE.LineBasicMaterial({ color: 0x3355bb, transparent:true, opacity:0.5 })
      ));

      // 피사체 오브젝트
      buildSubjectObject(THREE, subject.object, scene);

      // 카메라 위치 업데이트 함수
      // ★ 아이콘 위치 + 뷰어 카메라 동기화
      const updateCamPos = () => {
        const pRad = (phiRef.current * Math.PI) / 180;
        const tRad = (thetaRef.current * Math.PI) / 180;
        // r(0~1): 거리값 → 뷰어 카메라 거리 3~10
        const viewR = 3 + (1 - rRef.current) * 7;

        const vx = viewR * Math.sin(pRad) * Math.sin(tRad);
        const vy = viewR * Math.cos(pRad);
        const vz = viewR * Math.sin(pRad) * Math.cos(tRad);

        // ★ 뷰어 카메라 실제 이동 (아이콘 없음 — 카메라 시점 자체가 이동)
        camera.position.set(vx, vy, vz);
        if (phiRef.current < 5 || phiRef.current > 175) {
          camera.up.set(0, 0, phiRef.current < 90 ? -1 : 1);
        } else {
          camera.up.set(0, 1, 0);
        }
        camera.lookAt(0, 0, 0);
      };
      updateCamPos();

      // 애니메이션
      const animate = () => {
        frameRef.current = requestAnimationFrame(animate);
        updateCamPos();
        renderer.render(scene, camera);
      };
      animate();

      // ── 드래그 이벤트 ──
      const el = renderer.domElement;

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
        // theta: 좌우 드래그
        thetaRef.current = ((thetaRef.current + dx * 0.6) + 180) % 360 - 180;
        setTheta(Math.round(thetaRef.current));
        // phi: 상하 드래그
        phiRef.current = Math.max(1, Math.min(179, phiRef.current + dy * 0.5));
        setPhi(Math.round(phiRef.current));
        e.preventDefault();
      };
      const onUp = () => { isDragging.current = false; };

      el.addEventListener('mousedown', onDown);
      el.addEventListener('mousemove', onMove);
      el.addEventListener('mouseup', onUp);
      el.addEventListener('touchstart', onDown, { passive:false });
      el.addEventListener('touchmove', onMove, { passive:false });
      el.addEventListener('touchend', onUp);
      window.addEventListener('mouseup', onUp);

      return () => {
        cancelAnimationFrame(frameRef.current);
        el.removeEventListener('mousedown', onDown);
        el.removeEventListener('mousemove', onMove);
        el.removeEventListener('mouseup', onUp);
        el.removeEventListener('touchstart', onDown);
        el.removeEventListener('touchmove', onMove);
        el.removeEventListener('touchend', onUp);
        window.removeEventListener('mouseup', onUp);
        scene.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach(m=>m.dispose());
            else obj.material.dispose();
          }
        });
        renderer.dispose();
        if (mountRef.current && renderer.domElement.parentNode === mountRef.current)
          mountRef.current.removeChild(renderer.domElement);
      };
    };

    let cleanup = () => {};
    let mounted = true;

    const run = async () => {
      const THREE = await import("three");
      if (!mounted) return;
      const c = initScene(THREE);
      cleanup = typeof c === "function" ? c : () => {};
    };

    run();

    return () => {
      mounted = false;
      cleanup();
    };
  }, [subject.object]);

  // 피사체 바뀌면 씬 재초기화 (subjectIdx dep로 처리됨)

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"calc(100vh - 130px)", minHeight:560, background:"#1a1a1a" }}>

      {/* 피사체 선택 */}
      <div style={{ display:"flex", gap:0, background:"#1a1a1a", borderBottom:"2px solid #f19eb8" }}>
        {SUBJECT_TYPES.map((s,i) => (
          <button key={s.id} onClick={() => setSubjectIdx(i)} style={{
            flex:1, padding:"10px 4px", border:"none", cursor:"pointer",
            borderRight: i < SUBJECT_TYPES.length-1 ? "1px solid #1a1a1a" : "none",
            background: i===subjectIdx ? "#f19eb8" : "transparent",
            color: i===subjectIdx ? "#1a1a1a" : "#555",
            fontFamily:"'Arial Black','Helvetica Neue',sans-serif",
            fontSize: 12, fontWeight:900,
            transition:"all 0.15s",
            letterSpacing:"-0.02em",
          }}>
            <div style={{ fontSize: 17, marginBottom:2 }}>{s.icon}</div>
            <div>{s.kr}</div>
          </button>
        ))}
      </div>

      {/* 주체 입력창 */}
      <div style={{
        display:"flex", alignItems:"center", gap:10, flexWrap:isMobile ? "wrap" : "nowrap",
        padding:"10px 16px", background:"#1a1a1a",
        borderBottom:"1px solid #1a2a4a",
      }}>
        <span style={{
          fontSize: 11, color:"#444", fontFamily:"sans-serif",
          letterSpacing:"0.12em", whiteSpace:"nowrap", fontWeight:700,
        }}>SUBJECT</span>
        <div style={{ flex:1, minWidth:isMobile ? "100%" : 0, display:"flex", flexDirection:"column", gap:5 }}>
          <div style={{ display:"flex", gap:6, flexWrap:isMobile ? "wrap" : "nowrap" }}>
            <input
              type="text"
              value={subjectText}
              onChange={e => {
                setSubjectText(e.target.value);
                setShowTranslated(false);
                setTranslatedText("");
                setTranslateError("");
              }}
              onKeyDown={e => { if(e.key === "Enter") translateSubject(subjectText); }}
              placeholder={DEFAULT_SUBJECT_PROMPTS[subject.id]}
              style={{
                flex:1, background:"#252525", border:"1px solid #2a3a6a",
                borderRadius:8, padding:"7px 12px",
                color:"#e0ddd4", fontSize: 13, fontFamily:"monospace",
                outline:"none", minWidth:isMobile ? "100%" : 0,
              }}
            />
            {hasKorean(subjectText) && (
              <button onClick={() => translateSubject(subjectText)} disabled={translating} style={{
                background: translating ? "#252525" : "#f19eb8",
                border:"none", borderRadius:7,
                color:"#e0ddd4", fontSize: 12, fontWeight:700,
                padding:"6px 12px", cursor: translating ? "default" : "pointer",
                fontFamily:"sans-serif", whiteSpace:"nowrap", minWidth:60,
              }}>
                {translating ? "번역중..." : "🌐 번역"}
              </button>
            )}
            <button onClick={() => { setSubjectText(DEFAULT_SUBJECT_PROMPTS[subject.id]); setShowTranslated(false); setTranslatedText(""); }} style={{
              background:"#252525", border:"1px solid #2a3a6a", borderRadius:6,
              color:"#444", fontSize: 12, padding:"6px 10px", cursor:"pointer",
              fontFamily:"sans-serif", whiteSpace:"nowrap",
            }}>초기화</button>
          </div>
          {showTranslated && translatedText && (
            <div style={{
              display:"flex", alignItems:"center", gap:6,
              background:"#0d2a1a", border:"1px solid #1a5a2a",
              borderRadius:6, padding:"5px 10px",
            }}>
              <span style={{ fontSize: 11, color:"#2a9a4a", fontFamily:"sans-serif", fontWeight:700, whiteSpace:"nowrap" }}>🌐 번역됨</span>
              <span style={{ fontSize: 13, color:"#88ffaa", fontFamily:"monospace", flex:1 }}>{translatedText}</span>
              <button onClick={() => { setSubjectText(translatedText); setShowTranslated(false); }} style={{
                background:"none", border:"1px solid #2a5a3a", borderRadius:4,
                color:"#2a9a4a", fontSize: 11, padding:"2px 7px", cursor:"pointer",
                fontFamily:"sans-serif",
              }}>적용</button>
            </div>
          )}
          {translateError ? (
            <div style={{
              fontSize: 13,
              color: "#ff9ab6",
              fontFamily: "sans-serif",
              padding: "2px 4px",
            }}>
              번역 오류: {translateError}
            </div>
          ) : null}
        </div>
      </div>


      {/* 미드저니 파라미터 프리셋 */}
      <div style={{
        padding:"6px 12px 7px", background:"#111",
        borderBottom:"1px solid #222", flexShrink:0,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap", rowGap:3, marginBottom:3 }}>
          <span style={{
            fontSize: 10, color:"#f19eb8",
            fontFamily:"'Arial Black',sans-serif",
            fontWeight:900, letterSpacing:"0.18em", marginRight:3,
          }}>✦ MJ PARAMS</span>
          {/* AR 비율 — 맨 앞 */}
          {MJ_AR_PRESETS.map(a => {
            const isOn = mjArParam === a.id;
            return (
              <button key={a.id} onClick={() => setMjArParam(isOn ? null : a.id)} style={{
                background: isOn ? "#5ce8ff" : "transparent",
                color: isOn ? "#000" : "#888",
                border: "1px solid " + (isOn ? "#5ce8ff" : "#333"),
                borderRadius:3, padding:"2px 6px", cursor:"pointer",
                fontFamily:"'Arial Black',sans-serif", fontSize: 10, fontWeight:900,
                transition:"all 0.12s", whiteSpace:"nowrap",
              }}>{a.label}</button>
            );
          })}
          <span style={{ fontSize: 9, color:"#333" }}>│</span>
          {MJ_PARAM_GROUPS.map(g =>
            g.items.map(p => {
              const isOn = mjSelectedParams.has(p.id);
              return (
                <Tooltip key={p.id} text={p.tip || p.label}>
                  <button onClick={() => setMjSelectedParams(prev => {
                    const next = new Set(prev);
                    next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                    return next;
                  })} style={{
                    background: isOn ? "#f19eb8" : "transparent",
                    color: isOn ? "#1a1a1a" : "#555",
                    border: "1px solid " + (isOn ? "#f19eb8" : "#2a2a2a"),
                    borderRadius:3, padding:"2px 6px", cursor:"pointer",
                    fontFamily:"'Arial Black',sans-serif", fontSize: 10, fontWeight:900,
                    transition:"all 0.12s", whiteSpace:"nowrap",
                  }}>{p.label}</button>
                </Tooltip>
              );
            })
          )}
          <button onClick={() => { setMjSelectedParams(new Set()); setMjArParam(null); setMjCustomParam(""); }} style={{
            background:"transparent", color:"#333", border:"1px solid #222",
            borderRadius:3, padding:"2px 6px", cursor:"pointer",
            fontFamily:"sans-serif", fontSize: 10, transition:"all 0.12s",
          }}>✕ 초기화</button>
        </div>
        {mjParamStr.trim() && (
          <div style={{ fontSize: 11, color:"#f19eb8", fontFamily:"monospace", background:"#1a1a1a", padding:"2px 8px", borderRadius:4, display:"inline-block" }}>
            {mjParamStr.trim()}
          </div>
        )}
      </div>

      {/* 메인 영역 */}
      <div style={{
        display:"flex",
        flex:1,
        overflowX:"hidden",
        overflowY:isNarrow ? "auto" : "hidden",
        flexDirection:isNarrow ? "column" : "row",
      }}>

        {/* 3D 구 뷰어 */}
        <div style={{
          flex: isNarrow ? "0 0 auto" : 1,
          height: isNarrow
            ? (isMobile ? "clamp(280px, 46vh, 380px)" : "clamp(320px, 50vh, 520px)")
            : "auto",
          minHeight: isNarrow ? 280 : (isMobile ? 320 : 380),
          position:"relative",
        }}>
          <div ref={mountRef} style={{ width:"100%", height:"100%", cursor:"grab" }} />
          <div style={{
            position:"absolute", top:10, left:"50%", transform:"translateX(-50%)",
            color:"#555", fontSize: 12, fontFamily:"sans-serif", letterSpacing:"0.1em",
            pointerEvents:"none", whiteSpace:"nowrap",
          }}>
            드래그하여 카메라 앵글 조정
          </div>

          {/* ── 앵글 프리셋 버튼 바 — 구 상단 ── */}
          <div style={{
            position:"absolute", top:8, left:"50%", transform:"translateX(-50%)",
            display:"flex", gap:4, zIndex:10, flexWrap:"wrap", justifyContent:"center",
            maxWidth:isMobile ? "96%" : "90%",
          }}>
            {ANGLE_PRESETS.map(preset => {
              const isActive = activePreset === preset.id;
              return (
                <button key={preset.id} onClick={() => applyPreset(preset)}
                  title={preset.desc} style={{
                    background: isActive ? "#f19eb8" : "rgba(10,12,26,0.72)",
                    border: `1px solid ${isActive ? "#f19eb8" : "rgba(255,255,255,0.10)"}`,
                    borderRadius:14, padding:"3px 9px", cursor:"pointer",
                    backdropFilter:"blur(6px)", transition:"all 0.18s",
                    display:"flex", alignItems:"center", gap:3,
                  }}>
                  <span style={{ fontSize: 12 }}>{preset.icon}</span>
                  <span style={{
                    fontSize: 10, fontWeight: isActive ? 800 : 500,
                    fontFamily:"sans-serif", letterSpacing:"0.04em",
                    color: isActive ? "#e0ddd4" : "rgba(255,255,255,0.45)",
                  }}>{preset.label}</span>
                </button>
              );
            })}

            {/* 구분선 */}
            {customPresets.length > 0 && (
              <div style={{ width:1, height:20, background:"rgba(255,255,255,0.15)", alignSelf:"center" }} />
            )}

            {/* 커스텀 프리셋 버튼들 */}
            {customPresets.map(preset => {
              const isActive = activePreset === preset.id;
              return (
                <div key={preset.id} style={{ position:"relative", display:"flex" }}>
                  <button onClick={() => applyPreset(preset)}
                    title={preset.desc} style={{
                      background: isActive ? "#5ce8ff" : "rgba(10,12,26,0.82)",
                      border: `1px solid ${isActive ? "#5ce8ff" : "rgba(92,232,255,0.25)"}`,
                      borderRadius:14, padding:"3px 9px 3px 7px", cursor:"pointer",
                      backdropFilter:"blur(6px)", transition:"all 0.18s",
                      display:"flex", alignItems:"center", gap:3,
                    }}>
                    <span style={{ fontSize: 11 }}>📌</span>
                    <span style={{
                      fontSize: 10, fontWeight: isActive ? 800 : 500,
                      fontFamily:"sans-serif", letterSpacing:"0.04em",
                      color: isActive ? "#000" : "rgba(92,232,255,0.8)",
                    }}>{preset.label}</span>
                  </button>
                  {/* 삭제 버튼 */}
                  <button onClick={() => deleteCustomPreset(preset.id)} style={{
                    position:"absolute", top:-5, right:-5,
                    background:"#222", border:"1px solid #444",
                    borderRadius:"50%", width:13, height:13,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    cursor:"pointer", fontSize: 9, color:"#888", lineHeight:1,
                    zIndex:2,
                  }}>✕</button>
                </div>
              );
            })}

            {/* 현재 앵글 저장 버튼 */}
            {showSavePreset ? (
              <div style={{ display:"flex", gap:3, alignItems:"center", background:"rgba(10,12,26,0.92)", border:"1px solid #5ce8ff", borderRadius:14, padding:"2px 6px", backdropFilter:"blur(6px)" }}>
                <input
                  value={presetNameInput}
                  onChange={e => setPresetNameInput(e.target.value)}
                  onKeyDown={e => { if(e.key==="Enter") saveCustomPreset(presetNameInput); if(e.key==="Escape") setShowSavePreset(false); }}
                  placeholder="프리셋 이름..."
                  autoFocus
                  style={{
                    background:"transparent", border:"none", outline:"none",
                    color:"#5ce8ff", fontSize: 11, fontFamily:"sans-serif",
                    width:80,
                  }}
                />
                <button onClick={() => saveCustomPreset(presetNameInput)} style={{
                  background:"#5ce8ff", border:"none", borderRadius:8,
                  padding:"2px 7px", cursor:"pointer", fontSize: 10,
                  color:"#000", fontWeight:800, fontFamily:"sans-serif",
                }}>저장</button>
                <button onClick={() => setShowSavePreset(false)} style={{
                  background:"none", border:"none", color:"#666",
                  cursor:"pointer", fontSize: 12, padding:"0 2px",
                }}>✕</button>
              </div>
            ) : (
              <button onClick={() => setShowSavePreset(true)} title="현재 앵글을 프리셋으로 저장" style={{
                background:"rgba(10,12,26,0.72)",
                border:"1px dashed rgba(92,232,255,0.35)",
                borderRadius:14, padding:"3px 9px", cursor:"pointer",
                backdropFilter:"blur(6px)", transition:"all 0.18s",
                display:"flex", alignItems:"center", gap:3,
              }}>
                <span style={{ fontSize: 11, color:"rgba(92,232,255,0.6)" }}>＋</span>
                <span style={{ fontSize: 10, color:"rgba(92,232,255,0.6)", fontFamily:"sans-serif" }}>저장</span>
              </button>
            )}
          </div>


          {/* QUALITY 플로팅 칩 — 좌측 하단 미니맵 위 */}
          <div style={{
            position:"absolute", left:10, bottom:isMobile ? 68 : 80,
            display:"flex", flexDirection:"column", gap:5,
            pointerEvents:"all",
          }}>
            {QUALITY_CHIPS.map(chip => {
              const isOn = selectedQuality.some(q => q.id === chip.id);
              return (
                <button key={chip.id} onClick={() => setSelectedQuality(prev =>
                  isOn ? prev.filter(q => q.id !== chip.id) : [...prev, chip]
                )} style={{
                  background: isOn ? "rgba(255,255,255,0.92)" : "rgba(13,16,32,0.75)",
                  border: `1px solid ${isOn ? "#e0ddd4" : "rgba(255,255,255,0.15)"}`,
                  borderRadius:20, padding:"4px 11px",
                  cursor:"pointer", backdropFilter:"blur(8px)",
                  display:"flex", alignItems:"center", gap:5,
                  transition:"all 0.15s",
                }}>
                  <span style={{
                    fontSize: 11, fontWeight:800, fontFamily:"sans-serif",
                    letterSpacing:"0.1em",
                    color: isOn ? "#1a1a1a" : "rgba(255,255,255,0.5)",
                  }}>{chip.label}</span>
                  <span style={{
                    fontSize: 10, fontFamily:"sans-serif",
                    color: isOn ? "#333" : "rgba(255,255,255,0.3)",
                  }}>{chip.kr}</span>
                </button>
              );
            })}
          </div>

          {/* 미니맵: 좌측 하단 */}
          <svg width="90" height="54" style={{
            position:"absolute", left:10, bottom:10,
            pointerEvents:"none",
          }}>
            <text x="0" y="8" fontSize="7" fill="#444" fontFamily="sans-serif" letterSpacing="0.08em">TOP</text>
            <circle cx="18" cy="28" r="16" fill="none" stroke="#1a3a6a" strokeWidth="1.5" opacity="0.7"/>
            <circle cx="18" cy="28" r="2" fill="#2244aa" opacity="0.8"/>
            <circle
              cx={18 + Math.round(14 * Math.sin((theta * Math.PI) / 180))}
              cy={28 - Math.round(14 * Math.cos((theta * Math.PI) / 180))}
              r="4.5" fill="#f19eb8" opacity="0.9"
            />
            <text x="48" y="8" fontSize="7" fill="#444" fontFamily="sans-serif" letterSpacing="0.08em">SIDE</text>
            <circle cx="66" cy="28" r="16" fill="none" stroke="#1a3a6a" strokeWidth="1.5" opacity="0.7"/>
            <circle cx="66" cy="28" r="2" fill="#2244aa" opacity="0.8"/>
            <circle
              cx={66 + Math.round(14 * Math.sin((phi * Math.PI) / 180))}
              cy={28 - Math.round(14 * Math.cos((phi * Math.PI) / 180))}
              r="4.5" fill="#f19eb8" opacity="0.9"
            />
          </svg>

          {/* 거리 슬라이더 (오른쪽) */}
          <div style={{
            position:"absolute", right:isMobile ? 8 : 12, top:"50%", transform:"translateY(-50%)",
            display:"flex", flexDirection:"column", alignItems:"center", gap:6,
          }}>
            <span style={{ fontSize: 9, color:"#f19eb8", fontFamily:"sans-serif", letterSpacing:"0.04em", fontWeight:700, textAlign:"center", lineHeight:1.3 }}>멀리</span>
            <input type="range" min="0" max="100" value={Math.round((1-r)*100)}
              onChange={e => setR(1 - e.target.value/100)}
              style={{
                writingMode:"vertical-lr", direction:"rtl",
                width:20, height:120, cursor:"pointer", accentColor:"#f19eb8",
              }}
            />
            <span style={{ fontSize: 9, color:"#f19eb8", fontFamily:"sans-serif", textAlign:"center", lineHeight:1.2 }}>{Math.round(r*100)}%<br/><span style={{fontSize: 8}}>가까이</span></span>
          </div>
        </div>

        {/* 키워드 패널 */}
        <div style={{
          width:isNarrow ? "100%" : 240,
          maxHeight:"none",
          minHeight:isNarrow ? (isMobile ? 250 : 280) : 0,
          background:"#111122",
          borderLeft:isNarrow ? "none" : "1px solid #1a2a4a",
          borderTop:isNarrow ? "1px solid #1a2a4a" : "none",
          display:"flex", flexDirection:"column", overflowY:"hidden", flexShrink:0,
        }}>
          {/* 탭 */}
          <div style={{ display:"flex", flexWrap:"wrap", gap:2, padding:"8px 8px 4px", borderBottom:"1px solid #1a2a4a" }}>
            {[
              { id:"shot",  label:"📐 샷",  tip:"3D 조작 결과 — 높이·방향·거리가 자동으로 카메라 앵글 키워드로 변환됩니다." },
              { id:"lens",  label:"🔭 렌즈", tip:"렌즈 화각 선택 — 14mm 광각(왜곡·넓음)부터 200mm 망원(배경 압축)까지. 이미지 분위기를 크게 바꿉니다." },
              { id:"focus", label:"🎯 심도", tip:"초점과 심도 — 배경이 얼마나 흐려지는지, 어디에 초점이 맺히는지 제어합니다." },
              { id:"comp",  label:"🖼 구도", tip:"화면 구성법 — 삼분할·대칭·대각선 등 피사체를 어디에 배치할지 결정합니다." },
              { id:"move",  label:"🎬 무브", tip:"카메라 움직임 — 영상 AI(Kling·Hailuo)에서 카메라가 어떻게 움직일지 지정합니다." },
              { id:"rig",   label:"🎥 장비", tip:"촬영 장비 — 드론·짐벌·핸드헬드 등 장비 특유의 흔들림과 느낌을 표현합니다." },
            ].map(t => (
              <Tooltip key={t.id} text={t.tip}>
                <button onClick={() => setKwPanelTab(t.id)} style={{
                  background: kwPanelTab===t.id ? "#f19eb8" : "transparent",
                  color: kwPanelTab===t.id ? "#111" : "#555",
                  border: "1px solid " + (kwPanelTab===t.id ? "#f19eb8" : "#222"),
                  borderRadius:4, padding:"2px 6px", cursor:"pointer",
                  fontFamily:"sans-serif", fontSize: 11, fontWeight: kwPanelTab===t.id ? 700 : 400,
                  transition:"all 0.12s",
                }}>{t.label}</button>
              </Tooltip>
            ))}
          </div>

          <div style={{ flex:1, overflowY:"auto", padding:"8px 8px" }}>
            {/* 샷 탭: 기존 3개 카드 */}
            {kwPanelTab === "shot" && (<>
              <div style={{ background:"#0d1a2e", borderRadius:7, padding:"8px", marginBottom:6 }}>
                <div style={{ fontSize: 9, color:"#2563eb", fontFamily:"sans-serif", letterSpacing:"0.1em", marginBottom:3 }}>HEIGHT · φ{Math.round(phi)}°</div>
                <div style={{ fontSize: 13, color:"#e0ddd4", fontFamily:"sans-serif", fontWeight:700, lineHeight:1.3 }}>
                  {langKR ? resolved.height.kr : resolved.height.en}
                </div>
              </div>
              <div style={{ background:"#0d1a2e", borderRadius:7, padding:"8px", marginBottom:6 }}>
                <div style={{ fontSize: 9, color:"#10b981", fontFamily:"sans-serif", letterSpacing:"0.1em", marginBottom:3 }}>DIRECTION · θ{Math.round(theta)}°</div>
                <div style={{ fontSize: 13, color:"#e0ddd4", fontFamily:"sans-serif", fontWeight:700, lineHeight:1.3 }}>
                  {langKR ? resolved.direction.kr : resolved.direction.en}
                </div>
              </div>
              {/* 시선 방향 카드 — 인물 피사체만 */}
              {subject.id === "person" && (() => {
                const absTheta = Math.abs(theta);
                const isRight = theta > 0;
                if (absTheta > 150) return null;
                let gazeLabel, gazeIcon;
                if (absTheta < 12) {
                  gazeIcon = "👁"; gazeLabel = langKR ? "카메라 정면 응시" : "looking at camera";
                } else if (absTheta >= 80) {
                  gazeIcon = isRight ? "👉" : "👈";
                  gazeLabel = isRight ? (langKR ? "오른쪽 측면 시선" : "facing right") : (langKR ? "왼쪽 측면 시선" : "facing left");
                } else {
                  gazeIcon = isRight ? "↗️" : "↖️";
                  gazeLabel = isRight ? (langKR ? "오른쪽 비스듬히" : "angled right") : (langKR ? "왼쪽 비스듬히" : "angled left");
                }
                return (
                  <div style={{ background:"#0d2a1a", borderRadius:7, padding:"8px", marginBottom:6, border:"1px solid #1a4a2a" }}>
                    <div style={{ fontSize: 9, color:"#34d399", fontFamily:"sans-serif", letterSpacing:"0.1em", marginBottom:3 }}>GAZE · 시선방향</div>
                    <div style={{ fontSize: 13, color:"#e0ddd4", fontFamily:"sans-serif", fontWeight:700, display:"flex", alignItems:"center", gap:5 }}>
                      <span style={{ fontSize: 16 }}>{gazeIcon}</span>
                      {gazeLabel}
                    </div>
                  </div>
                );
              })()}
              <div style={{ background:"#0d1a2e", borderRadius:7, padding:"8px" }}>
                <div style={{ fontSize: 9, color:"#f19eb8", fontFamily:"sans-serif", letterSpacing:"0.1em", marginBottom:3 }}>SHOT · {Math.round(r*100)}%</div>
                <div style={{ fontSize: 13, color:"#e0ddd4", fontFamily:"sans-serif", fontWeight:700, lineHeight:1.3 }}>
                  {langKR ? resolved.shot.kr : resolved.shot.en}
                </div>
              </div>
            </>)}

            {/* 렌즈 탭 */}
            {kwPanelTab === "lens" && (
              <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                {DATA.lens.map(item => {
                  const isOn = selectedLens?.id === item.id;
                  const label = langKR ? item.kr : item.en.split(",")[0];
                  return (
                    <button key={item.id} onClick={() => setSelectedLens(isOn ? null : item)} style={{
                      background: isOn ? "#f19eb8" : "#0d1a2e",
                      border: "1px solid " + (isOn ? "#f19eb8" : "#1a2a4a"),
                      borderRadius:6, padding:"7px 10px", cursor:"pointer",
                      textAlign:"left", transition:"all 0.12s",
                      display:"flex", alignItems:"center", gap:4,
                    }}>
                      <span style={{ fontSize: 12, color: isOn ? "#111" : "#e0ddd4", fontWeight:700, fontFamily:"sans-serif", flex:1 }}>{label}</span>
                      <TipIcon tip={item.desc} />
                    </button>
                  );
                })}
              </div>
            )}

            {/* 심도 탭 */}
            {kwPanelTab === "focus" && (
              <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                {DATA.focus.map(item => {
                  const isOn = selectedFocus?.id === item.id;
                  const label = langKR ? item.kr : item.en.split(",")[0];
                  return (
                    <button key={item.id} onClick={() => setSelectedFocus(isOn ? null : item)} style={{
                      background: isOn ? "#f19eb8" : "#0d1a2e",
                      border: "1px solid " + (isOn ? "#f19eb8" : "#1a2a4a"),
                      borderRadius:6, padding:"7px 10px", cursor:"pointer",
                      textAlign:"left", transition:"all 0.12s",
                      display:"flex", alignItems:"center", gap:4,
                    }}>
                      <span style={{ fontSize: 12, color: isOn ? "#111" : "#e0ddd4", fontWeight:700, fontFamily:"sans-serif", flex:1 }}>{label}</span>
                      <TipIcon tip={item.desc} />
                    </button>
                  );
                })}
              </div>
            )}

            {/* 구도 탭 */}
            {kwPanelTab === "comp" && (
              <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                {DATA.composition.map(item => {
                  const isOn = selectedComposition?.id === item.id;
                  const label = langKR ? item.kr : item.en.split(",")[0];
                  return (
                    <button key={item.id} onClick={() => setSelectedComposition(isOn ? null : item)} style={{
                      background: isOn ? "#f19eb8" : "#0d1a2e",
                      border: "1px solid " + (isOn ? "#f19eb8" : "#1a2a4a"),
                      borderRadius:6, padding:"7px 10px", cursor:"pointer",
                      textAlign:"left", transition:"all 0.12s",
                      display:"flex", alignItems:"center", gap:4,
                    }}>
                      <span style={{ fontSize: 12, color: isOn ? "#111" : "#e0ddd4", fontWeight:700, fontFamily:"sans-serif", flex:1 }}>{label}</span>
                      <TipIcon tip={item.desc} />
                    </button>
                  );
                })}
              </div>
            )}

            {/* 무브먼트 탭 */}
            {kwPanelTab === "move" && (
              <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                {DATA.movement.map(item => {
                  const isOn = selectedMovementKw?.id === item.id;
                  const label = langKR ? item.kr : item.en.split(",")[0];
                  return (
                    <button key={item.id} onClick={() => setSelectedMovementKw(isOn ? null : item)} style={{
                      background: isOn ? "#f19eb8" : "#0d1a2e",
                      border: "1px solid " + (isOn ? "#f19eb8" : "#1a2a4a"),
                      borderRadius:6, padding:"7px 10px", cursor:"pointer",
                      textAlign:"left", transition:"all 0.12s",
                      display:"flex", alignItems:"center", gap:4,
                    }}>
                      <span style={{ fontSize: 12, color: isOn ? "#111" : "#e0ddd4", fontWeight:700, fontFamily:"sans-serif", flex:1 }}>{label}</span>
                      <TipIcon tip={item.desc} />
                    </button>
                  );
                })}
              </div>
            )}

            {/* 장비 탭 */}
            {kwPanelTab === "rig" && (
              <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                {DATA.rig.map(item => {
                  const isOn = selectedRigKw?.id === item.id;
                  const label = langKR ? item.kr : item.en.split(",")[0];
                  return (
                    <button key={item.id} onClick={() => setSelectedRigKw(isOn ? null : item)} style={{
                      background: isOn ? "#f19eb8" : "#0d1a2e",
                      border: "1px solid " + (isOn ? "#f19eb8" : "#1a2a4a"),
                      borderRadius:6, padding:"7px 10px", cursor:"pointer",
                      textAlign:"left", transition:"all 0.12s",
                      display:"flex", alignItems:"center", gap:4,
                    }}>
                      <span style={{ fontSize: 12, color: isOn ? "#111" : "#e0ddd4", fontWeight:700, fontFamily:"sans-serif", flex:1 }}>{label}</span>
                      <TipIcon tip={item.desc} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MOOD/STYLE 하단 서랍 */}
      <div style={{ position:"relative" }}>
        {/* 서랍 탭 버튼 */}
        <div style={{
          display:"flex", gap:0,
          background:"#111", borderTop:"1px solid #1a2a4a",
          padding:"0 16px",
        }}>
          {[
            { id:"lighting", label:"🔦 LIGHT", count: selectedLighting.length },
            { id:"mood",    label:"🎭 MOOD",  count: selectedMoods.length },
            { id:"style", label:"✨ STYLE", count: selectedStyles.length },
          ].map(tab => (
            <button key={tab.id} onClick={() => setDrawerOpen(drawerOpen === tab.id ? null : tab.id)} style={{
              background: drawerOpen===tab.id ? "#f19eb8" : "transparent",
              border:"none", borderTop:"none",
              color: drawerOpen===tab.id ? "#e0ddd4" : "#444",
              padding:"10px 18px", cursor:"pointer",
              fontWeight:900,
              fontFamily:"sans-serif", fontSize: 12,
              letterSpacing:"0.1em", display:"flex", alignItems:"center", gap:5,
              transition:"all 0.15s",
            }}>
              {tab.label}
              {tab.count > 0 && (
                <span style={{
                  background:"#f19eb8", color:"#e0ddd4", borderRadius:10,
                  fontSize: 11, padding:"1px 6px", fontWeight:800,
                }}>{tab.count}</span>
              )}
            </button>
          ))}
          <div style={{ flex:1 }} />
          {(selectedMoods.length > 0 || selectedStyles.length > 0) && (
            <button onClick={() => { setSelectedMoods([]); setSelectedStyles([]); }} style={{
              background:"none", border:"none", color:"#444",
              fontSize: 11, cursor:"pointer", fontFamily:"sans-serif", padding:"8px",
            }}>전체 초기화</button>
          )}
          {/* ✕ 닫기 버튼 */}
          {drawerOpen && (
            <button onClick={() => setDrawerOpen(null)} style={{
              marginLeft:"auto", background:"none", border:"none",
              color:"#556", fontSize: 17, cursor:"pointer",
              padding:"6px 12px", lineHeight:1,
              transition:"color 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.color="#aaa"}
            onMouseLeave={e => e.currentTarget.style.color="#556"}
            >✕</button>
          )}
        </div>

        {/* 서랍 내용 */}
        {drawerOpen && (
          <div style={{ background:"#111", borderTop:"1px solid #1a2a4a", padding:"10px 16px" }}>
            {(drawerOpen === "lighting" ? LIGHTING_GROUPS : drawerOpen === "mood" ? MOOD_GROUPS : STYLE_GROUPS).map(group => {
              const isMood = drawerOpen === "mood";
              const isLightTab = drawerOpen === "lighting";
              const activeColor = isLightTab ? "#f19eb8" : isMood ? "#f19eb8" : "#f19eb8";
              return (
                <div key={group.id} style={{ marginBottom:10 }}>
                  {/* 그룹 라벨 */}
                  <div style={{
                    fontSize: 10, fontWeight:800, color:"#f19eb8", letterSpacing:"0.12em",
                    fontFamily:"sans-serif", marginBottom:6,
                  }}>{group.en} · {group.label}</div>
                  {/* 태그들 */}
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                    {group.tags.map(tag => {
                      const locked = tag.free === false;
                      const isOn = isLightTab
                        ? selectedLighting.some(l => l.en === tag.en)
                        : isMood
                          ? selectedMoods.includes(tag.en)
                          : selectedStyles.includes(tag.en);
                      return (
                        <button key={tag.en} onClick={() => {
                          if(locked) return;
                          if(isLightTab) {
                            setSelectedLighting(prev => isOn ? prev.filter(l=>l.en!==tag.en) : [...prev, tag]);
                          } else if(isMood) {
                            setSelectedMoods(prev => isOn ? prev.filter(m=>m!==tag.en) : [...prev, tag.en]);
                          } else {
                            setSelectedStyles(prev => isOn ? prev.filter(s=>s!==tag.en) : [...prev, tag.en]);
                          }
                        }} style={{
                          background: locked ? "#1a1a1a" : isOn ? activeColor : "#252525",
                          border: `1px solid ${locked ? "#181828" : isOn ? activeColor : "#2a2a2a"}`,
                          borderRadius:16, padding:"4px 11px", cursor: locked ? "default" : "pointer",
                          color: locked ? "#252535" : isOn ? "#e0ddd4" : "#888",
                          fontFamily:"sans-serif", fontSize: 13, fontWeight: isOn ? 700 : 400,
                          transition:"all 0.15s", opacity: locked ? 0.6 : 1,
                          display:"flex", alignItems:"center", gap:4,
                        }}>
                          {locked && <span style={{fontSize: 10}}>🔒</span>}
                          <span>{langKR ? tag.kr : tag.en}</span>
                          {!langKR && <span style={{ fontSize: 9, color: isOn ? "#4a4a4a" : "rgba(200,200,200,0.28)", marginLeft:2, fontWeight:400 }}>{tag.kr}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 하단 프롬프트 바 */}
      <div style={{
        background:"#111", padding:"10px 20px",
        display:"flex", alignItems:"flex-start", gap:10, flexWrap:"wrap",
        borderTop:"2px solid #f19eb8", position:"relative", zIndex:10,
      }}>
        {/* PROMPT 라벨 + 언어 토글 */}
        <div style={{ display:"flex", flexDirection:"column", gap:4, alignItems:"flex-start", flexShrink:0, paddingTop:2 }}>
          <span style={{ fontSize: 10, color:"#f19eb8", fontFamily:"'Arial Black',sans-serif", letterSpacing:"0.2em", fontWeight:900 }}>PROMPT</span>
          <div style={{ display:"flex", gap:2 }}>
            {[["kr","KR"],["en","EN"]].map(([val, label]) => {
              const isActive = promptLang === val || (promptLang === null && (val === "kr") === langKR);
              return (
                <button key={val} onClick={() => setPromptLang(promptLang === val ? null : val)} style={{
                  background: isActive ? "#f19eb8" : "transparent",
                  color: isActive ? "#111" : "#444",
                  border: "1px solid " + (isActive ? "#f19eb8" : "#333"),
                  borderRadius:3, padding:"1px 5px", cursor:"pointer",
                  fontSize: 10, fontWeight:900, fontFamily:"'Arial Black',sans-serif",
                  transition:"all 0.12s",
                }}>{label}</button>
              );
            })}
          </div>
        </div>
        <div style={{
          flex:1, minWidth:200, fontSize: 13, color:"#e0ddd4", fontFamily:"monospace",
          whiteSpace:"pre-wrap", wordBreak:"break-all", lineHeight:1.6,
        }}>{displayPrompt}</div>
        <button onClick={copyPrompt} style={{
          background:"#f19eb8", color:"#1a1a1a", border:"none",
          borderRadius:0, padding:"10px 20px", cursor:"pointer",
          fontFamily:"'Arial Black','Helvetica Neue',sans-serif",
          fontSize: 13, fontWeight:900, whiteSpace:"nowrap",
          letterSpacing:"0.05em", textTransform:"uppercase", alignSelf:"flex-start",
        }}>{copied ? "✓ 복사됨" : "복사 COPY"}</button>

        {/* 북마크 저장 */}
        <button onClick={async () => { await saveBookmark(); setSaved(true); setTimeout(() => setSaved(false), 1200); }} title="북마크 저장" style={{
          background: saved ? "#f19eb8" : "#252525", border:"1px solid #2a3a6a",
          borderRadius:8, color: saved ? "#1a1a1a" : "#f19eb8", fontSize: saved ? 11 : 18,
          padding:"7px 12px", cursor:"pointer", transition:"all 0.15s",
          lineHeight:1, fontWeight: saved ? 900 : 400, fontFamily:"sans-serif",
        }}>{saved ? "✓ 저장됨" : "⭐"}</button>

        {/* 북마크 목록 */}
        <button onClick={() => setShowBookmarks(v => !v)} style={{
          background: showBookmarks ? "#f19eb8" : "#252525",
          border:"1px solid #2a3a6a", borderRadius:8,
          color: showBookmarks ? "#1a1a1a" : "#666",
          fontSize: 13, fontWeight:700, padding:"7px 11px",
          cursor:"pointer", fontFamily:"sans-serif",
          whiteSpace:"nowrap", position:"relative",
        }}>
          📋
          {bookmarks.length > 0 && (
            <span style={{
              position:"absolute", top:-5, right:-5,
              background:"#f19eb8", color:"#e0ddd4", borderRadius:8,
              fontSize: 10, padding:"1px 4px", fontWeight:800,
            }}>{bookmarks.length}</span>
          )}
        </button>
      </div>

      {/* 북마크 패널 — 프롬프트 바 위로 펼침 */}
      {showBookmarks && (
        <div style={{
          position:"absolute", bottom:52, left:0, right:0,
          background:"#141414", borderTop:"2px solid #f19eb8",
          maxHeight:260, overflowY:"auto", zIndex:300,
        }}>
          <div style={{
            display:"flex", alignItems:"center", justifyContent:"space-between",
            padding:"7px 14px", borderBottom:"1px solid #1a2a4a", position:"sticky", top:0,
            background:"#1a1a1a",
          }}>
            <span style={{ fontSize: 11, color:"#f19eb8", fontFamily:"sans-serif", fontWeight:800, letterSpacing:"0.1em" }}>
              ⭐ BOOKMARKS · {bookmarks.length}개
            </span>
            {bookmarks.length > 0 && (
              <button onClick={clearAllBookmarks} style={{
                background:"none", border:"none", color:"#444", fontSize: 11,
                cursor:"pointer", fontFamily:"sans-serif",
              }}>전체삭제</button>
            )}
          </div>

          {bookmarks.length === 0 ? (
            <div style={{ padding:"18px", textAlign:"center", color:"#444", fontSize: 13, fontFamily:"sans-serif" }}>
              ⭐ 눌러서 현재 프롬프트 저장
            </div>
          ) : bookmarks.map(bm => (
            <div key={bm.id}
              onClick={() => { try{navigator.clipboard?.writeText(bm.prompt)}catch{} setShowBookmarks(false); }}
              style={{
                padding:"8px 14px", borderBottom:"1px solid #0d0d1a",
                display:"flex", gap:8, alignItems:"flex-start",
                cursor:"pointer", transition:"background 0.1s",
              }}
              onMouseEnter={e => e.currentTarget.style.background="#111130"}
              onMouseLeave={e => e.currentTarget.style.background="transparent"}
            >
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", gap:5, marginBottom:3, alignItems:"center" }}>
                  <span style={{
                    fontSize: 10, color:"#f19eb8", fontFamily:"sans-serif", fontWeight:700,
                    background:"rgba(241,158,184,0.15)", padding:"1px 6px", borderRadius:6,
                  }}>{bm.subject}</span>
                  <span style={{ fontSize: 10, color:"#444", fontFamily:"sans-serif" }}>{bm.ts}</span>
                  <span style={{ fontSize: 10, color:"#444", fontFamily:"sans-serif", marginLeft:"auto" }}>클릭시 복사</span>
                </div>
                <div style={{
                  fontSize: 12, color:"#777", fontFamily:"monospace", lineHeight:1.5,
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                }}>{bm.prompt}</div>
              </div>
              <button onClick={e => { e.stopPropagation(); deleteBookmark(bm.id); }} style={{
                background:"none", border:"none", color:"#444",
                fontSize: 15, cursor:"pointer", flexShrink:0, padding:"0 2px",
              }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
