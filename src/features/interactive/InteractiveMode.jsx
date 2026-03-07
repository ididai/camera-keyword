import { useEffect, useMemo, useRef, useState } from "react";
import { buildSubjectObject } from "./buildSubjectObject";
import { resolveKeywords } from "./keywordResolver";
import { AR_PRESETS, DEFAULT_SUBJECT_PROMPTS, SUBJECT_TYPES } from "./cameraGlossary";
import {
  SEGMENT_COLORS,
  buildPromptSegments,
  hasKorean,
  toPromptText,
  validatePromptInput,
} from "./promptBuilder";
import { detectAwkwardExpressions } from "./promptQuality";
import { getPromptHistory, removePromptHistory, savePromptHistory } from "./historyStore";
import { getUserPresets, removeUserPreset, renameUserPreset, saveUserPreset } from "./userPresetStore";
import { getInteractiveSettings, patchInteractiveSettings } from "./stores/interactiveSettingsStore";
import { initAnalytics, trackEvent } from "../analytics/eventLogger";

const PERSON_SUBJECT = SUBJECT_TYPES.find((item) => item.id === "person") ?? SUBJECT_TYPES[0];
const ANCHOR_ACCENT = "#3df6ff";
const ANCHOR_ACCENT_SOFT = "rgba(61,246,255,0.28)";
const GAZE_RADIUS_MIN = 28;
const GAZE_RADIUS_MAX = 84;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function withAlpha(hexColor, alpha) {
  const raw = String(hexColor || "").replace("#", "");
  if (raw.length !== 6) return `rgba(255,255,255,${alpha})`;

  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function parseRatio(value) {
  const [w, h] = String(value || "9:16").split(":").map(Number);
  if (!w || !h) return 9 / 16;
  return w / h;
}

function getGazeRadius(frameRect) {
  return clamp(Math.min(frameRect.width, frameRect.height) * 0.2, GAZE_RADIUS_MIN, GAZE_RADIUS_MAX);
}

function getGazeKeyword(gazeVector, isKorean) {
  const x = clamp(gazeVector?.x ?? 0, -1, 1);
  const y = clamp(gazeVector?.y ?? 0, -1, 1);
  const mag = Math.hypot(x, y);
  if (mag < 0.16) return isKorean ? "카메라 정면 응시" : "looking directly at camera";

  const nx = x / mag;
  const ny = y / mag;
  const h = nx > 0.45 ? "right" : nx < -0.45 ? "left" : "";
  const v = ny < -0.45 ? "up" : ny > 0.45 ? "down" : "";

  if (isKorean) {
    if (v === "up" && h === "right") return "오른쪽 위를 응시";
    if (v === "up" && h === "left") return "왼쪽 위를 응시";
    if (v === "down" && h === "right") return "오른쪽 아래를 응시";
    if (v === "down" && h === "left") return "왼쪽 아래를 응시";
    if (v === "up") return "위를 응시";
    if (v === "down") return "아래를 응시";
    if (h === "right") return "오른쪽을 응시";
    if (h === "left") return "왼쪽을 응시";
    return "카메라 정면 응시";
  }

  if (v === "up" && h === "right") return "looking up-right";
  if (v === "up" && h === "left") return "looking up-left";
  if (v === "down" && h === "right") return "looking down-right";
  if (v === "down" && h === "left") return "looking down-left";
  if (v === "up") return "looking up";
  if (v === "down") return "looking down";
  if (h === "right") return "looking right";
  if (h === "left") return "looking left";
  return "looking directly at camera";
}

function getCompositionKeyword(position, isKorean) {
  const threshold = 0.28;
  const col = position.x < -threshold ? "left" : position.x > threshold ? "right" : "center";
  const row = position.y < -threshold ? "top" : position.y > threshold ? "bottom" : "middle";

  if (isKorean) {
    if (col === "center" && row === "middle") return "중앙 배치";
    if (row === "middle") return col === "left" ? "좌측 1/3 배치" : "우측 1/3 배치";
    if (col === "center") return row === "top" ? "상단 1/3 배치" : "하단 1/3 배치";

    if (row === "top" && col === "left") return "좌상단 1/3 교차점 배치";
    if (row === "top" && col === "right") return "우상단 1/3 교차점 배치";
    if (row === "bottom" && col === "left") return "좌하단 1/3 교차점 배치";
    return "우하단 1/3 교차점 배치";
  }

  if (col === "center" && row === "middle") return "subject centered in frame";
  if (row === "middle") return col === "left" ? "subject at left third" : "subject at right third";
  if (col === "center") return row === "top" ? "subject at upper third" : "subject at lower third";

  if (row === "top" && col === "left") return "subject at upper-left third intersection";
  if (row === "top" && col === "right") return "subject at upper-right third intersection";
  if (row === "bottom" && col === "left") return "subject at lower-left third intersection";
  return "subject at lower-right third intersection";
}

export default function InteractiveMode() {
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1440,
  );

  const [subjectText, setSubjectText] = useState("");
  const [subjectKorean, setSubjectKorean] = useState("");
  const [subjectEnglish, setSubjectEnglish] = useState("");
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState("");

  const [promptLang, setPromptLang] = useState("en");
  const [includeAngleInPrompt, setIncludeAngleInPrompt] = useState(true);
  const [customPromptHint, setCustomPromptHint] = useState("");
  const [arPresetId, setArPresetId] = useState("ar916");

  const [phi, setPhi] = useState(65);
  const [theta, setTheta] = useState(0);
  const [r, setR] = useState(0.72);
  const [subjectPos, setSubjectPos] = useState({ x: 0, y: 0 });
  const [gazeVector, setGazeVector] = useState({ x: 0, y: 0 });

  const [viewerSize, setViewerSize] = useState({ width: 0, height: 0 });
  const [copied, setCopied] = useState(false);
  const [promptHistory, setPromptHistory] = useState([]);
  const [userPresets, setUserPresets] = useState([]);
  const [presetName, setPresetName] = useState("");

  const viewerRef = useRef(null);
  const mountRef = useRef(null);
  const frameRef = useRef(null);
  const libraryRef = useRef(null);

  const frameAnimRef = useRef(null);
  const isDraggingCamera = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const distanceTrackReadyRef = useRef(false);
  const settingsHydratedRef = useRef(false);

  const phiRef = useRef(phi);
  const thetaRef = useRef(theta);
  const rRef = useRef(r);
  const subjectPosRef = useRef(subjectPos);
  const gazeVectorRef = useRef(gazeVector);

  const isMobile = viewportWidth <= 860;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setViewportWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    setPromptHistory(getPromptHistory());
    setUserPresets(getUserPresets());
  }, []);

  useEffect(() => {
    initAnalytics();
    trackEvent("interactive_mode_opened", { mode: "person_single" });
  }, []);

  useEffect(() => {
    const persisted = getInteractiveSettings();
    if (persisted.customPromptHint) {
      setCustomPromptHint(persisted.customPromptHint);
    }
    settingsHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!settingsHydratedRef.current) return;
    const timeout = setTimeout(() => {
      patchInteractiveSettings({ customPromptHint });
    }, 180);
    return () => clearTimeout(timeout);
  }, [customPromptHint]);

  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;

    const update = () => {
      setViewerSize({ width: el.clientWidth, height: el.clientHeight });
    };

    update();

    let observer;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(update);
      observer.observe(el);
    } else {
      window.addEventListener("resize", update);
    }

    return () => {
      if (observer) observer.disconnect();
      else window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    phiRef.current = phi;
  }, [phi]);

  useEffect(() => {
    thetaRef.current = theta;
  }, [theta]);

  useEffect(() => {
    rRef.current = r;
  }, [r]);

  useEffect(() => {
    subjectPosRef.current = subjectPos;
  }, [subjectPos]);

  useEffect(() => {
    gazeVectorRef.current = gazeVector;
  }, [gazeVector]);

  useEffect(() => {
    if (!distanceTrackReadyRef.current) {
      distanceTrackReadyRef.current = true;
      return;
    }

    const timeout = setTimeout(() => {
      trackEvent("camera_distance_changed", {
        distance: Number(r.toFixed(3)),
        distancePercent: Math.round(r * 100),
      });
    }, 280);

    return () => clearTimeout(timeout);
  }, [r]);

  const selectedAr = AR_PRESETS.find((item) => item.id === arPresetId) || AR_PRESETS[0];
  const selectedAspectRatio = parseRatio(selectedAr.value);

  const frameRect = useMemo(() => {
    const safeTop = isMobile ? 76 : 92;
    const safeBottom = isMobile ? 82 : 98;
    const safeSide = isMobile ? 16 : 34;

    const availableWidth = Math.max(180, (viewerSize.width || 680) - safeSide * 2);
    const availableHeight = Math.max(180, (viewerSize.height || 420) - safeTop - safeBottom);

    let width = availableWidth;
    let height = width / selectedAspectRatio;

    if (height > availableHeight) {
      height = availableHeight;
      width = height * selectedAspectRatio;
    }

    return {
      width: Math.round(width),
      height: Math.round(height),
    };
  }, [viewerSize, selectedAspectRatio, isMobile]);

  const resolved = useMemo(() => resolveKeywords(phi, theta, r, PERSON_SUBJECT), [phi, theta, r]);
  const isPromptKR = promptLang === "kr";

  const gazeKr = useMemo(() => getGazeKeyword(gazeVector, true), [gazeVector]);
  const gazeEn = useMemo(() => getGazeKeyword(gazeVector, false), [gazeVector]);

  const compositionKr = useMemo(() => getCompositionKeyword(subjectPos, true), [subjectPos]);
  const compositionEn = useMemo(() => getCompositionKeyword(subjectPos, false), [subjectPos]);

  const subjectForPrompt = isPromptKR ? (subjectKorean || subjectText.trim()) : subjectEnglish;

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
        composition: isPromptKR ? compositionKr : compositionEn,
        custom: customPromptHint,
        ratioFraming: isPromptKR ? selectedAr.krFraming : selectedAr.enFraming,
        arValue: selectedAr.value,
        includeAngle: includeAngleInPrompt,
      }),
    [
      subjectForPrompt,
      isPromptKR,
      resolved,
      gazeKr,
      gazeEn,
      compositionKr,
      compositionEn,
      customPromptHint,
      selectedAr,
      includeAngleInPrompt,
    ],
  );

  const displayPrompt = toPromptText(promptSegments);
  const awkwardWords = isPromptKR ? [] : detectAwkwardExpressions(displayPrompt);

  const updateSubjectPositionFromPointer = (clientX, clientY) => {
    if (!frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const normalizedX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const normalizedY = ((clientY - rect.top) / rect.height) * 2 - 1;

    setSubjectPos({
      x: clamp(normalizedX, -1, 1),
      y: clamp(normalizedY, -1, 1),
    });
  };

  const updateGazeFromPointer = (clientX, clientY) => {
    if (!frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const anchorX = rect.left + ((subjectPosRef.current.x + 1) / 2) * rect.width;
    const anchorY = rect.top + ((subjectPosRef.current.y + 1) / 2) * rect.height;
    const radius = getGazeRadius({ width: rect.width, height: rect.height });

    let dx = clientX - anchorX;
    let dy = clientY - anchorY;
    const distance = Math.hypot(dx, dy);
    if (distance > radius && distance > 0) {
      const scale = radius / distance;
      dx *= scale;
      dy *= scale;
    }

    setGazeVector({
      x: clamp(dx / radius, -1, 1),
      y: clamp(dy / radius, -1, 1),
    });
  };

  const onFramePointerDown = (event) => {
    event.preventDefault();
    updateSubjectPositionFromPointer(event.clientX, event.clientY);

    const onMove = (moveEvent) => {
      updateSubjectPositionFromPointer(moveEvent.clientX, moveEvent.clientY);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const onGazePointerDown = (event) => {
    event.preventDefault();
    event.stopPropagation();
    updateGazeFromPointer(event.clientX, event.clientY);

    const onMove = (moveEvent) => {
      updateGazeFromPointer(moveEvent.clientX, moveEvent.clientY);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const translateSubject = async () => {
    const value = subjectText.trim();

    if (!value) {
      setTranslateError("주체를 먼저 입력해 주세요.");
      trackEvent("subject_translate_blocked", { reason: "empty_subject" });
      return;
    }

    if (!hasKorean(value)) {
      setSubjectKorean(value);
      setSubjectEnglish(value);
      setSubjectText("");
      setTranslateError("");
      setPromptLang("en");
      trackEvent("subject_translate_skipped", {
        reason: "non_korean_input",
        textLength: value.length,
      });
      return;
    }

    const startedAt = Date.now();
    setTranslating(true);
    setTranslateError("");
    trackEvent("subject_translate_started", { textLength: value.length });

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
      trackEvent("subject_translate_succeeded", {
        textLength: value.length,
        translatedLength: translated.length,
        latencyMs: Date.now() - startedAt,
      });
    } catch (error) {
      setTranslateError(error?.message || "번역 중 오류가 발생했습니다.");
      trackEvent("subject_translate_failed", {
        latencyMs: Date.now() - startedAt,
        message: error?.message || "unknown_error",
      });
    }

    setTranslating(false);
  };

  const copyPrompt = async () => {
    if (!displayPrompt || promptValidationError) {
      trackEvent("prompt_copy_blocked", {
        reason: !displayPrompt ? "empty_prompt" : "validation_error",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(displayPrompt);
      const nextHistory = savePromptHistory({
        text: displayPrompt,
        lang: promptLang,
        source: "auto",
      });
      setPromptHistory(nextHistory);
      trackEvent("prompt_history_saved", {
        source: "auto",
        count: nextHistory.length,
        lang: promptLang,
      });
      trackEvent("prompt_copied", {
        method: "clipboard_api",
        lang: promptLang,
      });
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
        const copiedByCommand = document.execCommand("copy");
        if (!copiedByCommand) {
          throw new Error("copy_command_failed");
        }
        const nextHistory = savePromptHistory({
          text: displayPrompt,
          lang: promptLang,
          source: "auto",
        });
        setPromptHistory(nextHistory);
        trackEvent("prompt_history_saved", {
          source: "auto",
          count: nextHistory.length,
          lang: promptLang,
        });
        trackEvent("prompt_copied", {
          method: "exec_command",
          lang: promptLang,
        });
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch {
        setTranslateError("복사에 실패했어요. 다시 시도해 주세요.");
        trackEvent("prompt_copy_failed", { method: "fallback" });
      }
      document.body.removeChild(el);
    }
  };

  const saveCurrentPromptToHistory = () => {
    if (!displayPrompt || promptValidationError) {
      trackEvent("prompt_history_save_blocked", {
        reason: !displayPrompt ? "empty_prompt" : "validation_error",
      });
      return;
    }
    const nextHistory = savePromptHistory({
      text: displayPrompt,
      lang: promptLang,
      source: "manual",
    });
    setPromptHistory(nextHistory);
    trackEvent("prompt_history_saved", {
      source: "manual",
      count: nextHistory.length,
      lang: promptLang,
    });
  };

  const saveCurrentPreset = () => {
    const fallbackName = `프리셋 ${userPresets.length + 1}`;
    const resolvedName = (presetName || "").trim() || fallbackName;
    const next = saveUserPreset({
      name: resolvedName,
      phi,
      theta,
      r,
      subjectPos,
      gazeVector,
      arPresetId,
    });
    setUserPresets(next);
    setPresetName("");
    trackEvent("preset_saved", {
      presetNameLength: resolvedName.length,
      count: next.length,
    });
  };

  const applyUserPreset = (preset) => {
    setPhi(preset.phi);
    setTheta(preset.theta);
    setR(preset.r);
    setSubjectPos(preset.subjectPos || { x: 0, y: 0 });
    setGazeVector(preset.gazeVector || { x: 0, y: 0 });
    setArPresetId(preset.arPresetId || "ar916");
    trackEvent("preset_applied", {
      presetId: preset.id,
      ratioId: preset.arPresetId || "ar916",
    });
  };

  const handleRenamePreset = (preset) => {
    if (typeof window === "undefined") return;
    const nextName = window.prompt("프리셋 이름", preset.name || "");
    if (nextName == null) return;
    const renamed = renameUserPreset(preset.id, nextName);
    setUserPresets(renamed);
    trackEvent("preset_renamed", {
      presetId: preset.id,
      presetNameLength: String(nextName || "").trim().length,
    });
  };

  const handleRemovePreset = (presetId) => {
    const next = removeUserPreset(presetId);
    setUserPresets(next);
    trackEvent("preset_removed", {
      presetId,
      count: next.length,
    });
  };

  const handleRemoveHistoryItem = (itemId) => {
    const next = removePromptHistory(itemId);
    setPromptHistory(next);
    trackEvent("prompt_history_removed", {
      itemId,
      count: next.length,
    });
  };

  const handleCopyHistoryItem = async (item) => {
    try {
      await navigator.clipboard.writeText(item.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
      trackEvent("prompt_history_copied", {
        itemId: item.id,
        lang: item.lang || "en",
      });
    } catch {
      setTranslateError("히스토리 복사에 실패했어요.");
      trackEvent("prompt_history_copy_failed", { itemId: item.id });
    }
  };

  const handlePromptLangChange = (nextLang) => {
    if (!nextLang || nextLang === promptLang) return;
    setPromptLang(nextLang);
    trackEvent("prompt_language_changed", { lang: nextLang });
  };

  const handleToggleAngleInPrompt = () => {
    setIncludeAngleInPrompt((prev) => {
      const next = !prev;
      trackEvent("prompt_angle_toggle_changed", { enabled: next });
      return next;
    });
  };

  const handleCustomPromptHintChange = (value) => {
    setCustomPromptHint(value);
  };

  const handleAspectRatioChange = (nextPresetId) => {
    if (!nextPresetId || nextPresetId === arPresetId) return;
    const nextPreset = AR_PRESETS.find((item) => item.id === nextPresetId);
    setArPresetId(nextPresetId);
    trackEvent("ratio_changed", {
      ratioId: nextPresetId,
      ratioValue: nextPreset?.value || "",
    });
  };

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

      const ambient = new THREE.AmbientLight(0x334466, 1.0);
      scene.add(ambient);
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

      const subjectObject = buildSubjectObject(THREE, PERSON_SUBJECT.object, scene);

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

      const updateSubjectOffset = () => {
        subjectObject.position.x = subjectPosRef.current.x * 1.1;
        subjectObject.position.y = -subjectPosRef.current.y * 1.1;
      };

      const onResize = () => {
        if (!mountRef.current) return;
        const w = mountRef.current.clientWidth || 320;
        const h = mountRef.current.clientHeight || 320;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };

      const getPos = (event) => {
        if (event.touches) return { x: event.touches[0].clientX, y: event.touches[0].clientY };
        return { x: event.clientX, y: event.clientY };
      };

      const onDown = (event) => {
        if (event.button !== undefined && event.button !== 0) return;
        isDraggingCamera.current = true;
        lastMouse.current = getPos(event);
        event.preventDefault();
      };

      const onMove = (event) => {
        if (!isDraggingCamera.current) return;

        const pos = getPos(event);
        const dx = pos.x - lastMouse.current.x;
        const dy = pos.y - lastMouse.current.y;
        lastMouse.current = pos;

        thetaRef.current = ((thetaRef.current + dx * 0.6 + 180) % 360) - 180;
        phiRef.current = clamp(phiRef.current + dy * 0.5, 1, 179);

        setTheta(Math.round(thetaRef.current));
        setPhi(Math.round(phiRef.current));

        event.preventDefault();
      };

      const onUp = () => {
        isDraggingCamera.current = false;
      };

      const onWheel = (event) => {
        event.preventDefault();
        const delta = event.deltaY > 0 ? -0.04 : 0.04;
        setR((prev) => clamp(prev + delta, 0, 1));
      };

      const animate = () => {
        frameAnimRef.current = requestAnimationFrame(animate);
        ambient.intensity = 1.0;
        key.intensity = 1.2;
        rim.intensity = 0.5;
        updateSubjectOffset();
        updateCamera();
        renderer.render(scene, camera);
      };

      window.addEventListener("resize", onResize);
      renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
      renderer.domElement.addEventListener("contextmenu", (event) => event.preventDefault());
      renderer.domElement.addEventListener("mousedown", onDown);
      renderer.domElement.addEventListener("mousemove", onMove);
      renderer.domElement.addEventListener("mouseup", onUp);
      renderer.domElement.addEventListener("touchstart", onDown, { passive: false });
      renderer.domElement.addEventListener("touchmove", onMove, { passive: false });
      renderer.domElement.addEventListener("touchend", onUp);
      window.addEventListener("mouseup", onUp);

      animate();

      cleanup = () => {
        cancelAnimationFrame(frameAnimRef.current);
        window.removeEventListener("resize", onResize);
        renderer.domElement.removeEventListener("wheel", onWheel);
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
  }, []);

  const gazeRadius = useMemo(() => getGazeRadius(frameRect), [frameRect]);
  const anchorPercentX = ((subjectPos.x + 1) / 2) * 100;
  const anchorPercentY = ((subjectPos.y + 1) / 2) * 100;
  const gazeDx = gazeVector.x * gazeRadius;
  const gazeDy = gazeVector.y * gazeRadius;
  const gazeLength = Math.hypot(gazeDx, gazeDy);
  const gazeAngle = (Math.atan2(gazeDy, gazeDx) * 180) / Math.PI;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 130px)",
        minHeight: 580,
        background: "#1a1a1a",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 56,
          background: "#f19eb8",
          borderBottom: "2px solid #1a1a1a",
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 900, color: "#111", fontFamily: "sans-serif" }}>
          👤 인물 모드 (단일)
        </span>
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: isMobile ? "100%" : 1360,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          padding: isMobile ? "0 0 10px" : "0 14px 14px",
          gap: 0,
        }}
      >

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px",
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

        <div style={{ width: "100%", maxWidth: isMobile ? "100%" : 760, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: isMobile ? "wrap" : "nowrap" }}>
            <input
              type="text"
              value={subjectText}
              onChange={(event) => {
                const value = event.target.value;
                setSubjectText(value);
                setSubjectKorean(value.trim());
                setSubjectEnglish("");
                setTranslateError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") translateSubject();
              }}
              placeholder={DEFAULT_SUBJECT_PROMPTS.person}
              style={{
                flex: isMobile ? "1 1 100%" : "0 0 440px",
                width: isMobile ? "100%" : 440,
                maxWidth: "100%",
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

          <div style={{ textAlign: "center", fontSize: 11, color: "#7a808a", fontFamily: "sans-serif" }}>
            {isPromptKR
              ? "한글 주체를 입력한 뒤 번역하면 EN 프롬프트가 자동 정리됩니다."
              : "Enter subject, then translate Korean text to keep EN prompt clean."}
          </div>

          {translateError ? (
            <div style={{ textAlign: "center", fontSize: 12, color: "#ff9ab6", fontFamily: "sans-serif" }}>{translateError}</div>
          ) : null}
        </div>
      </div>

      <div
        ref={viewerRef}
        style={{
          flex: 1,
          minHeight: isMobile ? 300 : 360,
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
          드래그로 카메라 조정 · 휠로 거리 조정
        </div>

        <div
          style={{
            position: "absolute",
            top: 36,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 5,
            flexWrap: "wrap",
            justifyContent: "center",
            padding: "6px 10px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(12,14,22,0.72)",
            backdropFilter: "blur(2px)",
            zIndex: 12,
            maxWidth: "94%",
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
          <span style={{ fontSize: 11, color: "#9aa0ac", fontFamily: "sans-serif", marginRight: 4 }}>
            {isPromptKR ? "비율 프레임 + 피사체 위치 드래그" : "ratio frame + subject drag"}
          </span>

          {AR_PRESETS.map((preset) => {
            const isOn = arPresetId === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => handleAspectRatioChange(preset.id)}
                style={{
                  background: isOn ? "#5ce8ff" : "transparent",
                  color: isOn ? "#000" : "#9aa0ac",
                  border: `1px solid ${isOn ? "#5ce8ff" : "rgba(255,255,255,0.20)"}`,
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
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            pointerEvents: "none",
          }}
        >
          <div
            ref={frameRef}
            onPointerDown={onFramePointerDown}
            style={{
              width: `${frameRect.width}px`,
              height: `${frameRect.height}px`,
              border: `2px dashed ${ANCHOR_ACCENT}`,
              borderRadius: 8,
              boxShadow: "0 0 0 1px rgba(0,0,0,0.35) inset, 0 0 20px rgba(61,246,255,0.16)",
              pointerEvents: "auto",
              position: "relative",
              touchAction: "none",
              cursor: "crosshair",
              background: "rgba(12,12,18,0.06)",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: `${anchorPercentX}%`,
                top: `${anchorPercentY}%`,
                transform: "translate(-50%, -50%)",
                width: 22,
                height: 22,
                borderRadius: "50%",
                border: `3px solid ${ANCHOR_ACCENT}`,
                background: "rgba(61,246,255,0.22)",
                boxShadow: "0 0 16px rgba(61,246,255,0.9), 0 0 0 4px rgba(10,19,30,0.65)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <div style={{ width: 10, height: 2, borderRadius: 99, background: ANCHOR_ACCENT }} />
              <div
                style={{
                  position: "absolute",
                  width: 2,
                  height: 10,
                  borderRadius: 99,
                  background: ANCHOR_ACCENT,
                }}
              />
            </div>
            <div
              style={{
                position: "absolute",
                left: `${anchorPercentX}%`,
                top: `${anchorPercentY}%`,
                transform: "translate(-50%, -50%)",
                width: 34,
                height: 34,
                borderRadius: "50%",
                border: `1px solid ${ANCHOR_ACCENT_SOFT}`,
                boxShadow: `0 0 14px ${ANCHOR_ACCENT_SOFT}`,
              }}
            />
            {gazeLength > 2 ? (
              <div
                style={{
                  position: "absolute",
                  left: `${anchorPercentX}%`,
                  top: `${anchorPercentY}%`,
                  transform: `translate(-50%, -50%) rotate(${gazeAngle}deg)`,
                  width: `${gazeLength}px`,
                  height: 2,
                  background: ANCHOR_ACCENT,
                  boxShadow: "0 0 8px rgba(61,246,255,0.8)",
                  transformOrigin: "0 50%",
                  pointerEvents: "none",
                }}
              />
            ) : null}
            {gazeLength > 2 ? (
              <div
                style={{
                  position: "absolute",
                  left: `calc(${anchorPercentX}% + ${gazeDx}px)`,
                  top: `calc(${anchorPercentY}% + ${gazeDy}px)`,
                  width: 0,
                  height: 0,
                  borderTop: "6px solid transparent",
                  borderBottom: "6px solid transparent",
                  borderLeft: `10px solid ${ANCHOR_ACCENT}`,
                  transform: `translate(-50%, -50%) rotate(${gazeAngle}deg)`,
                  filter: "drop-shadow(0 0 6px rgba(61,246,255,0.8))",
                  pointerEvents: "none",
                }}
              />
            ) : null}
            <button
              type="button"
              onPointerDown={onGazePointerDown}
              onDoubleClick={() => setGazeVector({ x: 0, y: 0 })}
              title={isPromptKR ? "시선 화살표 드래그" : "Drag gaze arrow"}
              style={{
                position: "absolute",
                left: `calc(${anchorPercentX}% + ${gazeDx}px)`,
                top: `calc(${anchorPercentY}% + ${gazeDy}px)`,
                transform: "translate(-50%, -50%)",
                width: 16,
                height: 16,
                borderRadius: "50%",
                border: `2px solid ${ANCHOR_ACCENT}`,
                background: "rgba(7,20,28,0.95)",
                boxShadow: "0 0 10px rgba(61,246,255,0.9)",
                cursor: "grab",
                pointerEvents: "auto",
                zIndex: 3,
                padding: 0,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                width: 2,
                height: "100%",
                background: ANCHOR_ACCENT_SOFT,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 0,
                top: "50%",
                transform: "translateY(-50%)",
                width: "100%",
                height: 2,
                background: ANCHOR_ACCENT_SOFT,
              }}
            />
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            right: isMobile ? 8 : 12,
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 9, color: "#f19eb8", fontFamily: "sans-serif", fontWeight: 700 }}>멀리</span>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round((1 - r) * 100)}
              onChange={(event) => setR(1 - event.target.value / 100)}
              style={{
                writingMode: "vertical-lr",
                direction: "rtl",
                width: 20,
                height: 140,
                cursor: "pointer",
                accentColor: "#f19eb8",
              }}
            />
            <span style={{ fontSize: 9, color: "#f19eb8", fontFamily: "sans-serif", fontWeight: 700 }}>
              {Math.round(r * 100)}%
            </span>
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            left: 10,
            bottom: 10,
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            maxWidth: isMobile ? "calc(100% - 124px)" : 740,
          }}
        >
          {[
            { label: "SHOT", type: "shot", value: isPromptKR ? resolved.shot.kr : resolved.shot.en },
            {
              label: "ANGLE",
              type: "angle",
              value: isPromptKR ? resolved.height.kr : resolved.height.en,
              disabled: !includeAngleInPrompt,
            },
            {
              label: "DIRECTION",
              type: "angle",
              value: isPromptKR ? resolved.direction.kr : resolved.direction.en,
              disabled: !includeAngleInPrompt,
            },
            { label: "POSITION", type: "composition", value: isPromptKR ? compositionKr : compositionEn },
          ].map((item) => {
            const color = item.disabled ? "#6f7787" : SEGMENT_COLORS[item.type] || "#5ce8ff";
            return (
            <div
              key={item.label}
              style={{
                background: withAlpha(color, item.disabled ? 0.05 : 0.08),
                border: `1px solid ${withAlpha(color, item.disabled ? 0.36 : 0.5)}`,
                borderRadius: 8,
                padding: "6px 8px",
              }}
            >
              <div style={{ fontSize: 9, color, fontFamily: "sans-serif", letterSpacing: "0.08em" }}>
                {item.label}
              </div>
              <div style={{ fontSize: 12, color, fontFamily: "sans-serif", fontWeight: 700 }}>
                {item.value}
              </div>
              {item.disabled ? (
                <div style={{ fontSize: 9, color: "#8a94a7", fontFamily: "sans-serif", marginTop: 2 }}>
                  {isPromptKR ? "프롬프트 제외" : "excluded"}
                </div>
              ) : null}
            </div>
            );
          })}
          <div
            style={{
              background: withAlpha(
                includeAngleInPrompt ? SEGMENT_COLORS.gaze || SEGMENT_COLORS.angle : "#6f7787",
                includeAngleInPrompt ? 0.08 : 0.05,
              ),
              border: `1px solid ${withAlpha(
                includeAngleInPrompt ? SEGMENT_COLORS.gaze || SEGMENT_COLORS.angle : "#6f7787",
                includeAngleInPrompt ? 0.5 : 0.36,
              )}`,
              borderRadius: 8,
              padding: "6px 8px",
            }}
          >
            <div
              style={{
                fontSize: 9,
                color: includeAngleInPrompt ? SEGMENT_COLORS.gaze || SEGMENT_COLORS.angle : "#6f7787",
                fontFamily: "sans-serif",
                letterSpacing: "0.08em",
              }}
            >
              GAZE
            </div>
            <div
              style={{
                fontSize: 12,
                color: includeAngleInPrompt ? SEGMENT_COLORS.gaze || SEGMENT_COLORS.angle : "#6f7787",
                fontFamily: "sans-serif",
                fontWeight: 700,
              }}
            >
              {isPromptKR ? gazeKr : gazeEn}
            </div>
            {!includeAngleInPrompt ? (
              <div style={{ fontSize: 9, color: "#8a94a7", fontFamily: "sans-serif", marginTop: 2 }}>
                {isPromptKR ? "프롬프트 제외" : "excluded"}
              </div>
            ) : null}
          </div>
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
              onClick={() => handlePromptLangChange("kr")}
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
              onClick={() => handlePromptLangChange("en")}
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

          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <button
              onClick={handleToggleAngleInPrompt}
              style={{
                background: includeAngleInPrompt ? withAlpha(SEGMENT_COLORS.angle, 0.22) : "transparent",
                color: includeAngleInPrompt ? SEGMENT_COLORS.angle : "#7a8394",
                border: `1px solid ${includeAngleInPrompt ? withAlpha(SEGMENT_COLORS.angle, 0.88) : "#364054"}`,
                borderRadius: 4,
                padding: "2px 6px",
                cursor: "pointer",
                fontSize: 10,
                fontFamily: "sans-serif",
                fontWeight: 700,
              }}
            >
              {includeAngleInPrompt ? "ANGLE ON" : "ANGLE OFF"}
            </button>
          </div>

          <input
            type="text"
            value={customPromptHint}
            onChange={(event) => handleCustomPromptHintChange(event.target.value)}
            onBlur={() => {
              trackEvent("prompt_custom_hint_updated", {
                length: String(customPromptHint || "").trim().length,
              });
            }}
            placeholder={isPromptKR ? "추가 키워드(선택) 예: 재질 디테일 강조" : "Optional extra hint e.g. accurate material texture"}
            style={{
              width: isMobile ? "100%" : 250,
              maxWidth: "100%",
              background: "#161a22",
              border: "1px solid #2c3444",
              borderRadius: 6,
              padding: "5px 8px",
              color: SEGMENT_COLORS.custom,
              fontSize: 11,
              fontFamily: "sans-serif",
            }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 220, fontFamily: "monospace", lineHeight: 1.7 }}>
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
              주체를 입력하고 번역하면 프롬프트가 생성됩니다.
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
          type="button"
          onClick={() => libraryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          style={{
            background: "transparent",
            color: "#88a8b5",
            border: "1px solid #2b3f48",
            borderRadius: 8,
            padding: "10px 12px",
            cursor: "pointer",
            fontFamily: "sans-serif",
            fontSize: 12,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          프리셋/히스토리
        </button>

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

      <div
        ref={libraryRef}
        style={{
          background: "#0d0d0d",
          borderTop: "1px solid #222",
          padding: "10px 16px 14px",
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 10,
              color: "#7bdff2",
              fontFamily: "'Arial Black',sans-serif",
              letterSpacing: "0.14em",
            }}
          >
            USER PRESET
          </span>
          <input
            type="text"
            value={presetName}
            onChange={(event) => setPresetName(event.target.value)}
            placeholder="프리셋 이름"
            style={{
              width: isMobile ? "100%" : 180,
              background: "#1a1a1a",
              border: "1px solid #2e4154",
              borderRadius: 6,
              padding: "6px 8px",
              color: "#e0ddd4",
              fontSize: 12,
              fontFamily: "sans-serif",
            }}
          />
          <button
            type="button"
            onClick={saveCurrentPreset}
            style={{
              background: "#7bdff2",
              border: "none",
              borderRadius: 6,
              padding: "6px 10px",
              color: "#111",
              fontSize: 12,
              fontWeight: 800,
              fontFamily: "sans-serif",
              cursor: "pointer",
            }}
          >
            현재값 저장
          </button>
        </div>

        {userPresets.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {userPresets.map((preset) => (
              <div
                key={preset.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  border: "1px solid #2e4154",
                  borderRadius: 999,
                  padding: "3px 6px",
                  background: "#12161a",
                }}
              >
                <button
                  type="button"
                  onClick={() => applyUserPreset(preset)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#c9ecf3",
                    fontSize: 11,
                    fontFamily: "sans-serif",
                    cursor: "pointer",
                  }}
                >
                  {preset.name}
                </button>
                <button
                  type="button"
                  onClick={() => handleRenamePreset(preset)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#91a4af",
                    fontSize: 10,
                    cursor: "pointer",
                    fontFamily: "sans-serif",
                  }}
                >
                  이름
                </button>
                <button
                  type="button"
                  onClick={() => handleRemovePreset(preset.id)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#ff9ab6",
                    fontSize: 10,
                    cursor: "pointer",
                    fontFamily: "sans-serif",
                  }}
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: "#666", fontSize: 12, fontFamily: "sans-serif" }}>
            저장된 프리셋이 없습니다.
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 10,
              color: "#ffd166",
              fontFamily: "'Arial Black',sans-serif",
              letterSpacing: "0.14em",
            }}
          >
            PROMPT HISTORY
          </span>
          <button
            type="button"
            onClick={saveCurrentPromptToHistory}
            disabled={!displayPrompt || Boolean(promptValidationError)}
            style={{
              background: "#ffd166",
              border: "none",
              borderRadius: 6,
              padding: "6px 10px",
              color: "#1a1a1a",
              fontSize: 12,
              fontWeight: 800,
              fontFamily: "sans-serif",
              cursor: !displayPrompt || promptValidationError ? "default" : "pointer",
              opacity: !displayPrompt || promptValidationError ? 0.5 : 1,
            }}
          >
            현재 프롬프트 저장
          </button>
        </div>

        {promptHistory.length ? (
          <div style={{ display: "grid", gap: 6 }}>
            {promptHistory.slice(0, 8).map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "#121212",
                  border: "1px solid #2b2b2b",
                  borderRadius: 8,
                  padding: "6px 8px",
                }}
              >
                <button
                  type="button"
                  onClick={() => handleCopyHistoryItem(item)}
                  style={{
                    flex: 1,
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    color: "#d8d8d8",
                    fontSize: 12,
                    fontFamily: "monospace",
                    cursor: "pointer",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={item.text}
                >
                  {item.text}
                </button>
                <span style={{ color: "#666", fontSize: 10, fontFamily: "sans-serif" }}>
                  {item.lang?.toUpperCase?.() || "EN"}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveHistoryItem(item.id)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#ff9ab6",
                    fontSize: 10,
                    cursor: "pointer",
                    fontFamily: "sans-serif",
                  }}
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: "#666", fontSize: 12, fontFamily: "sans-serif" }}>
            저장된 프롬프트 히스토리가 없습니다.
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
