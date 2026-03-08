import { useEffect, useMemo, useRef, useState } from "react";
import { buildSubjectObject } from "./buildSubjectObject";
import { resolveKeywords } from "./keywordResolver";
import { AR_PRESETS, DEFAULT_SUBJECT_PROMPTS, SUBJECT_TYPES } from "./cameraGlossary";
import {
  SEGMENT_COLORS as BASE_SEGMENT_COLORS,
  buildUpgradedPromptSegments,
  buildPromptSegments,
  hasKorean,
  toPromptText,
  validatePromptInput,
} from "./promptBuilder";
import { detectAwkwardExpressions } from "./promptQuality";
import {
  didLastHistoryWriteFail,
  getPromptHistory,
  removePromptHistory,
  savePromptHistory,
} from "./historyStore";
import {
  clearUserPresets,
  didLastUserPresetWriteFail,
  getUserPresets,
  removeUserPreset,
  renameUserPreset,
  saveUserPreset,
} from "./userPresetStore";
import { getInteractiveSettings, patchInteractiveSettings } from "./stores/interactiveSettingsStore";
import { initAnalytics, trackEvent } from "../analytics/eventLogger";
import { UI_DESIGN_SEGMENT_COLORS, UI_DESIGN_TOKENS } from "./uiDesignTokens";
import { requestPromptRefine, requestSubjectTranslate } from "./promptApiClient";
import { loadThreeRuntime } from "./threeRuntime";

const SEGMENT_COLORS = { ...BASE_SEGMENT_COLORS, ...UI_DESIGN_SEGMENT_COLORS };
const UI = UI_DESIGN_TOKENS;
const SHOT_ACCENT = SEGMENT_COLORS.shot;
const POSITION_ACCENT = SEGMENT_COLORS.composition;
const GAZE_ACCENT = SEGMENT_COLORS.gaze;
const RATIO_ACCENT = SEGMENT_COLORS.ratio;

const PERSON_SUBJECT = SUBJECT_TYPES.find((item) => item.id === "person") ?? SUBJECT_TYPES[0];
const POSITION_ACCENT_SOFT = withAlpha(POSITION_ACCENT, 0.36);
const FACE_ANCHOR_OFFSET = 0.24;
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

function toColorInt(hexColor, fallback) {
  const raw = String(hexColor || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return fallback;
  return Number.parseInt(raw, 16);
}

function parseRatio(value) {
  const [w, h] = String(value || "9:16").split(":").map(Number);
  if (!w || !h) return 9 / 16;
  return w / h;
}

function getGazeRadius(frameRect) {
  return clamp(Math.min(frameRect.width, frameRect.height) * 0.2, GAZE_RADIUS_MIN, GAZE_RADIUS_MAX);
}

function getGazeKeyword(gazeVector, isKorean, theta = 0) {
  const x = clamp(gazeVector?.x ?? 0, -1, 1);
  const y = clamp(gazeVector?.y ?? 0, -1, 1);
  const mag = Math.hypot(x, y);
  const backFacing = Math.abs(theta) >= 105;

  if (mag < 0.16) {
    if (backFacing) return isKorean ? "뒤돌아 카메라를 응시" : "looking back at camera";
    return isKorean ? "카메라 정면 응시" : "looking directly at camera";
  }

  // Keep on-screen drag direction consistent when subject is back-facing.
  const nx = (backFacing ? -x : x) / mag;
  const ny = y / mag;
  const h = nx > 0.45 ? "right" : nx < -0.45 ? "left" : "";
  const v = ny < -0.45 ? "up" : ny > 0.45 ? "down" : "";

  if (backFacing) {
    if (isKorean) {
      if (v === "up" && h === "right") return "뒤돌아 오른쪽 위를 응시";
      if (v === "up" && h === "left") return "뒤돌아 왼쪽 위를 응시";
      if (v === "down" && h === "right") return "뒤돌아 오른쪽 아래를 응시";
      if (v === "down" && h === "left") return "뒤돌아 왼쪽 아래를 응시";
      if (v === "up") return "뒤돌아 위를 응시";
      if (v === "down") return "뒤돌아 아래를 응시";
      if (h === "right") return "뒤돌아 오른쪽을 응시";
      if (h === "left") return "뒤돌아 왼쪽을 응시";
      return "뒤돌아 카메라를 응시";
    }

    if (v === "up" && h === "right") return "looking back up-right";
    if (v === "up" && h === "left") return "looking back up-left";
    if (v === "down" && h === "right") return "looking back down-right";
    if (v === "down" && h === "left") return "looking back down-left";
    if (v === "up") return "looking back up";
    if (v === "down") return "looking back down";
    if (h === "right") return "looking back to the right";
    if (h === "left") return "looking back to the left";
    return "looking back at camera";
  }

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

export default function InteractiveModeDesign({ accessToken = "" }) {
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1440,
  );

  const [subjectText, setSubjectText] = useState("");
  const [subjectKorean, setSubjectKorean] = useState("");
  const [subjectEnglish, setSubjectEnglish] = useState("");
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState("");
  const [isSubjectLocked, setIsSubjectLocked] = useState(false);
  const [isSubjectPanelOpen, setIsSubjectPanelOpen] = useState(false);
  const [lockedSubject, setLockedSubject] = useState({ kr: "", en: "" });

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
  const [promptVariant, setPromptVariant] = useState("base");
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [apiUpgradeResult, setApiUpgradeResult] = useState(null);
  const [upgradeNotice, setUpgradeNotice] = useState("");
  const [promptHistory, setPromptHistory] = useState([]);
  const [userPresets, setUserPresets] = useState([]);
  const [presetName, setPresetName] = useState("");
  const [isViewerActive, setIsViewerActive] = useState(
    typeof window === "undefined" ? true : window.innerWidth > 860,
  );

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
    if (!isMobile && !isViewerActive) {
      setIsViewerActive(true);
    }
  }, [isMobile, isViewerActive]);

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

  const gazeKr = useMemo(() => getGazeKeyword(gazeVector, true, theta), [gazeVector, theta]);
  const gazeEn = useMemo(() => getGazeKeyword(gazeVector, false, theta), [gazeVector, theta]);

  const compositionKr = useMemo(() => getCompositionKeyword(subjectPos, true), [subjectPos]);
  const compositionEn = useMemo(() => getCompositionKeyword(subjectPos, false), [subjectPos]);

  const activeSubjectKorean = isSubjectLocked ? lockedSubject.kr : subjectKorean || subjectText.trim();
  const activeSubjectEnglish = isSubjectLocked ? lockedSubject.en : subjectEnglish;
  const subjectForPrompt = isPromptKR
    ? activeSubjectKorean || activeSubjectEnglish
    : activeSubjectEnglish || activeSubjectKorean;
  const shotText = isPromptKR ? resolved.shot.kr : resolved.shot.en;
  const heightText = isPromptKR ? resolved.height.kr : resolved.height.en;
  const directionText = isPromptKR ? resolved.direction.kr : resolved.direction.en;
  const gazeText = isPromptKR ? gazeKr : gazeEn;
  const compositionText = isPromptKR ? compositionKr : compositionEn;
  const ratioFramingText = isPromptKR ? selectedAr.krFraming : selectedAr.enFraming;

  const upgradeContextKey = useMemo(
    () =>
      JSON.stringify({
        promptLang,
        subjectForPrompt,
        shotText,
        heightText,
        directionText,
        gazeText,
        compositionText,
        customPromptHint,
        ratioFramingText,
        arValue: selectedAr.value,
        includeAngleInPrompt,
      }),
    [
      promptLang,
      subjectForPrompt,
      shotText,
      heightText,
      directionText,
      gazeText,
      compositionText,
      customPromptHint,
      ratioFramingText,
      selectedAr.value,
      includeAngleInPrompt,
    ],
  );

  const promptValidationError = validatePromptInput({
    promptLang,
    subjectKorean: activeSubjectKorean,
    subjectEnglish: activeSubjectEnglish,
  });

  const promptSegments = useMemo(
    () =>
      buildPromptSegments({
        subjectText: subjectForPrompt,
        shot: shotText,
        height: heightText,
        direction: directionText,
        gaze: gazeText,
        composition: compositionText,
        custom: customPromptHint,
        ratioFraming: ratioFramingText,
        arValue: selectedAr.value,
        includeAngle: includeAngleInPrompt,
      }),
    [
      subjectForPrompt,
      shotText,
      heightText,
      directionText,
      gazeText,
      compositionText,
      customPromptHint,
      ratioFramingText,
      selectedAr.value,
      includeAngleInPrompt,
    ],
  );

  const localUpgradedPromptSegments = useMemo(
    () =>
      buildUpgradedPromptSegments({
        subjectText: subjectForPrompt,
        shot: shotText,
        height: heightText,
        direction: directionText,
        gaze: gazeText,
        composition: compositionText,
        custom: customPromptHint,
        ratioFraming: ratioFramingText,
        arValue: selectedAr.value,
        includeAngle: includeAngleInPrompt,
      }),
    [
      subjectForPrompt,
      shotText,
      heightText,
      directionText,
      gazeText,
      compositionText,
      customPromptHint,
      ratioFramingText,
      selectedAr.value,
      includeAngleInPrompt,
    ],
  );

  const upgradedPromptSegments = useMemo(() => {
    if (!apiUpgradeResult || apiUpgradeResult.contextKey !== upgradeContextKey) {
      return localUpgradedPromptSegments;
    }
    return buildPromptSegments({
      subjectText: apiUpgradeResult.subjectText || subjectForPrompt,
      shot: shotText,
      height: heightText,
      direction: directionText,
      gaze: gazeText,
      composition: compositionText,
      custom: apiUpgradeResult.customText,
      ratioFraming: ratioFramingText,
      arValue: selectedAr.value,
      includeAngle: includeAngleInPrompt,
    });
  }, [
    apiUpgradeResult,
    upgradeContextKey,
    localUpgradedPromptSegments,
    subjectForPrompt,
    shotText,
    heightText,
    directionText,
    gazeText,
    compositionText,
    ratioFramingText,
    selectedAr.value,
    includeAngleInPrompt,
  ]);

  const displayPrompt = toPromptText(promptSegments);
  const upgradedDisplayPrompt = toPromptText(upgradedPromptSegments);
  const canUpgradePrompt = Boolean(
    displayPrompt &&
      upgradedDisplayPrompt &&
      displayPrompt.toLowerCase() !== upgradedDisplayPrompt.toLowerCase(),
  );
  const isUpgradedPromptSelected = promptVariant === "upgraded" && canUpgradePrompt;
  const activePromptSegments = isUpgradedPromptSelected ? upgradedPromptSegments : promptSegments;
  const activeDisplayPrompt = isUpgradedPromptSelected ? upgradedDisplayPrompt : displayPrompt;
  const awkwardWords = isPromptKR ? [] : detectAwkwardExpressions(activeDisplayPrompt);

  useEffect(() => {
    if (promptVariant === "upgraded" && !canUpgradePrompt) {
      setPromptVariant("base");
    }
  }, [promptVariant, canUpgradePrompt]);

  useEffect(() => {
    setPromptVariant("base");
    setUpgradeNotice("");
  }, [upgradeContextKey]);

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

    const faceY = clamp(subjectPosRef.current.y - FACE_ANCHOR_OFFSET, -1, 1);
    const anchorX = rect.left + ((subjectPosRef.current.x + 1) / 2) * rect.width;
    const anchorY = rect.top + ((faceY + 1) / 2) * rect.height;
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
    if (isSubjectLocked) {
      setTranslateError("주체 고정이 켜져 있어 번역할 수 없습니다.");
      trackEvent("subject_translate_blocked", { reason: "subject_locked" });
      return;
    }

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
      const translated = await requestSubjectTranslate({
        text: value,
        accessToken,
      });

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
    if (!activeDisplayPrompt || promptValidationError) {
      trackEvent("prompt_copy_blocked", {
        reason: !activeDisplayPrompt ? "empty_prompt" : "validation_error",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(activeDisplayPrompt);
      const nextHistory = savePromptHistory({
        text: activeDisplayPrompt,
        lang: promptLang,
        source: "auto",
      });
      setPromptHistory(nextHistory);
      if (didLastHistoryWriteFail()) {
        setTranslateError("저장 공간 제한으로 히스토리를 저장하지 못했습니다.");
      }
      trackEvent("prompt_history_saved", {
        source: "auto",
        count: nextHistory.length,
        lang: promptLang,
      });
      trackEvent("prompt_copied", {
        method: "clipboard_api",
        lang: promptLang,
        variant: isUpgradedPromptSelected ? "upgraded" : "base",
      });
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      const el = document.createElement("textarea");
      el.value = activeDisplayPrompt;
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
          text: activeDisplayPrompt,
          lang: promptLang,
          source: "auto",
        });
        setPromptHistory(nextHistory);
        if (didLastHistoryWriteFail()) {
          setTranslateError("저장 공간 제한으로 히스토리를 저장하지 못했습니다.");
        }
        trackEvent("prompt_history_saved", {
          source: "auto",
          count: nextHistory.length,
          lang: promptLang,
        });
        trackEvent("prompt_copied", {
          method: "exec_command",
          lang: promptLang,
          variant: isUpgradedPromptSelected ? "upgraded" : "base",
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
    if (!activeDisplayPrompt || promptValidationError) {
      trackEvent("prompt_history_save_blocked", {
        reason: !activeDisplayPrompt ? "empty_prompt" : "validation_error",
      });
      return;
    }
    const nextHistory = savePromptHistory({
      text: activeDisplayPrompt,
      lang: promptLang,
      source: "manual",
    });
    setPromptHistory(nextHistory);
    if (didLastHistoryWriteFail()) {
      setTranslateError("저장 공간 제한으로 히스토리를 저장하지 못했습니다.");
    }
    trackEvent("prompt_history_saved", {
      source: "manual",
      count: nextHistory.length,
      lang: promptLang,
      variant: isUpgradedPromptSelected ? "upgraded" : "base",
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
    if (didLastUserPresetWriteFail()) {
      setTranslateError("저장 공간 제한으로 프리셋 저장에 실패했습니다.");
      return;
    }
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
    if (didLastUserPresetWriteFail()) {
      setTranslateError("저장 공간 제한으로 프리셋 이름 변경에 실패했습니다.");
      return;
    }
    trackEvent("preset_renamed", {
      presetId: preset.id,
      presetNameLength: String(nextName || "").trim().length,
    });
  };

  const handleRemovePreset = (presetId) => {
    const next = removeUserPreset(presetId);
    setUserPresets(next);
    if (didLastUserPresetWriteFail()) {
      setTranslateError("저장 공간 제한으로 프리셋 삭제에 실패했습니다.");
      return;
    }
    trackEvent("preset_removed", {
      presetId,
      count: next.length,
    });
  };

  const handleResetAllPresets = () => {
    const next = clearUserPresets();
    setUserPresets(next);
    if (didLastUserPresetWriteFail()) {
      setTranslateError("저장 공간 제한으로 프리셋 초기화에 실패했습니다.");
      return;
    }
    trackEvent("preset_reset_all", {
      count: next.length,
    });
  };

  const handleRemoveHistoryItem = (itemId) => {
    const next = removePromptHistory(itemId);
    setPromptHistory(next);
    if (didLastHistoryWriteFail()) {
      setTranslateError("저장 공간 제한으로 히스토리 삭제에 실패했습니다.");
      return;
    }
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

  const handleUpgradePrompt = async () => {
    if (!displayPrompt || promptValidationError) {
      setUpgradeNotice(isPromptKR ? "먼저 유효한 프롬프트를 생성해 주세요." : "Generate a valid prompt first.");
      return;
    }
    if (upgradeLoading) {
      return;
    }

    const startedAt = Date.now();
    setUpgradeLoading(true);
    setUpgradeNotice(isPromptKR ? "다듬기 API 실행 중..." : "Refining with API...");

    try {
      const data = await requestPromptRefine({
        accessToken,
        payload: {
          lang: promptLang,
          subjectText: subjectForPrompt,
          customText: customPromptHint,
          shot: shotText,
          height: heightText,
          direction: directionText,
          gaze: gazeText,
          composition: compositionText,
          ratioFraming: ratioFramingText,
          arValue: selectedAr.value,
          includeAngle: includeAngleInPrompt,
        },
      });

      const refinedSubjectText = String(data?.subjectText || subjectForPrompt).trim();
      const refinedCustomText = String(data?.customText ?? customPromptHint).trim();
      const refinedSegments = buildPromptSegments({
        subjectText: refinedSubjectText,
        shot: shotText,
        height: heightText,
        direction: directionText,
        gaze: gazeText,
        composition: compositionText,
        custom: refinedCustomText,
        ratioFraming: ratioFramingText,
        arValue: selectedAr.value,
        includeAngle: includeAngleInPrompt,
      });
      const refinedPrompt = toPromptText(refinedSegments);
      const changed = Boolean(refinedPrompt && refinedPrompt.toLowerCase() !== displayPrompt.toLowerCase());

      setApiUpgradeResult({
        contextKey: upgradeContextKey,
        subjectText: refinedSubjectText,
        customText: refinedCustomText,
      });

      if (changed) {
        setPromptVariant("upgraded");
        setUpgradeNotice(
          isPromptKR
            ? "다듬기 완료: 업그레이드 프롬프트가 적용되었습니다."
            : "Refine complete: upgraded prompt applied.",
        );
      } else {
        setPromptVariant("base");
        setUpgradeNotice(
          isPromptKR
            ? "다듬기 완료: 변경사항이 없어 현재 프롬프트를 유지합니다."
            : "Refine complete: no changes needed; keeping current prompt.",
        );
      }

      trackEvent("prompt_upgraded", {
        lang: promptLang,
        provider: "api",
        changed,
        latencyMs: Date.now() - startedAt,
      });
    } catch (error) {
      setPromptVariant("base");
      setUpgradeNotice(
        isPromptKR
          ? `다듬기 API 실패: ${error?.message || "알 수 없는 오류"}`
          : `Prompt refine API failed: ${error?.message || "unknown error"}`,
      );
      trackEvent("prompt_upgrade_failed", {
        lang: promptLang,
        provider: "api",
        latencyMs: Date.now() - startedAt,
        message: error?.message || "unknown_error",
      });
    } finally {
      setUpgradeLoading(false);
    }
  };

  const handleRevertPromptUpgrade = () => {
    setPromptVariant("base");
    setUpgradeNotice(isPromptKR ? "원본 프롬프트로 되돌렸습니다." : "Reverted to original prompt.");
    trackEvent("prompt_upgrade_reverted", { lang: promptLang });
  };

  const handlePromptLangChange = (nextLang) => {
    if (!nextLang || nextLang === promptLang) return;
    setPromptLang(nextLang);
    setApiUpgradeResult(null);
    setUpgradeNotice("");
    trackEvent("prompt_language_changed", { lang: nextLang });
  };

  const handleToggleSubjectLock = () => {
    if (!isSubjectLocked) {
      const kr = String(subjectKorean || subjectText || "").trim();
      const en = String(subjectEnglish || (!hasKorean(kr) ? kr : "")).trim();
      setLockedSubject({ kr, en });
      setIsSubjectLocked(true);
      setTranslateError("");
      trackEvent("subject_lock_changed", {
        locked: true,
        hasKoreanSubject: Boolean(kr),
        hasEnglishSubject: Boolean(en),
      });
      return;
    }

    setIsSubjectLocked(false);
    setTranslateError("");
    trackEvent("subject_lock_changed", { locked: false });
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
    if (!isViewerActive) return;

    let cleanup = () => {};
    let mounted = true;

    const init = async () => {
      const THREE = await loadThreeRuntime();
      if (!mounted || !mountRef.current) return;

      const width = mountRef.current.clientWidth || 320;
      const height = mountRef.current.clientHeight || 320;

      const scene = new THREE.Scene();

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
        color: toColorInt(SEGMENT_COLORS.shot, 0x1a3a6a),
        wireframe: true,
        transparent: true,
        opacity: 0.25,
      });
      scene.add(new THREE.Mesh(sphereGeo, sphereMat));

      const innerMat = new THREE.MeshBasicMaterial({
        color: toColorInt(SEGMENT_COLORS.shot, 0x0a1a3a),
        transparent: true,
        opacity: 0.15,
        side: 2,
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
  }, [isViewerActive]);

  const gazeRadius = useMemo(() => getGazeRadius(frameRect), [frameRect]);
  const positionPercentX = ((subjectPos.x + 1) / 2) * 100;
  const positionPercentY = ((subjectPos.y + 1) / 2) * 100;
  const faceAnchorY = clamp(subjectPos.y - FACE_ANCHOR_OFFSET, -1, 1);
  const facePercentX = positionPercentX;
  const facePercentY = ((faceAnchorY + 1) / 2) * 100;
  const gazeDx = gazeVector.x * gazeRadius;
  const gazeDy = gazeVector.y * gazeRadius;
  const gazeLength = Math.hypot(gazeDx, gazeDy);
  const gazeAngle = (Math.atan2(gazeDy, gazeDx) * 180) / Math.PI;
  const subjectSummaryText = String(subjectText || subjectKorean || subjectEnglish || "").trim();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: isMobile ? "auto" : "calc(100dvh - 130px)",
        minHeight: isMobile ? 0 : 580,
        background: UI.neutral.bg,
        overflowY: "auto",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: isMobile ? "100%" : 1360,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          padding: isMobile ? "10px 10px 12px" : "16px 20px 24px",
          gap: UI.spacing.section,
        }}
      >

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: UI.spacing.control,
          padding: "16px 18px",
          background: UI.neutral.panel,
          border: `1px solid ${UI.neutral.borderSoft}`,
          borderRadius: 14,
        }}
      >
        <div style={{ width: "100%", maxWidth: isMobile ? "100%" : 760, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 12,
                color: UI.text.muted,
                fontFamily: "sans-serif",
                letterSpacing: "0.12em",
                whiteSpace: "nowrap",
                fontWeight: 700,
              }}
            >
              SUBJECT
            </span>
            <button
              type="button"
              onClick={() => setIsSubjectPanelOpen((prev) => !prev)}
              aria-expanded={isSubjectPanelOpen}
              style={{
                background: "transparent",
                border: `1px solid ${UI.neutral.borderStrong}`,
                borderRadius: 10,
                color: isSubjectPanelOpen ? UI.text.strong : UI.text.main,
                fontSize: 12,
                fontWeight: 800,
                fontFamily: "sans-serif",
                padding: "7px 10px",
                cursor: "pointer",
              }}
            >
              {isSubjectPanelOpen ? "주체 접기" : "주체 펼치기"}
            </button>
          </div>

          {isSubjectPanelOpen ? (
            <>
              <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: isMobile ? "wrap" : "nowrap" }}>
                <input
                  type="text"
                  value={subjectText}
                  onChange={(event) => {
                    if (isSubjectLocked) return;
                    const value = event.target.value;
                    setSubjectText(value);
                    setSubjectKorean(value.trim());
                    setSubjectEnglish("");
                    setTranslateError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") translateSubject();
                  }}
                  readOnly={isSubjectLocked}
                  placeholder={DEFAULT_SUBJECT_PROMPTS.person}
                  style={{
                    flex: isMobile ? "1 1 100%" : "0 0 440px",
                    width: isMobile ? "100%" : 440,
                    maxWidth: "100%",
                    background: isSubjectLocked ? UI.neutral.panelSoft : UI.neutral.panelRaised,
                    border: `1px solid ${UI.neutral.borderStrong}`,
                    borderRadius: 10,
                    padding: "10px 12px",
                    color: isSubjectLocked ? UI.text.main : UI.text.strong,
                    fontSize: 13,
                    fontFamily: "sans-serif",
                    outline: "none",
                  }}
                />

                <button
                  onClick={translateSubject}
                  disabled={translating || isSubjectLocked}
                  style={{
                    background: translating || isSubjectLocked
                      ? UI.neutral.panelSoft
                      : withAlpha(UI.accents.subject, UI.alpha.hover),
                    border: `1px solid ${translating || isSubjectLocked ? UI.neutral.borderSoft : UI.accents.subject}`,
                    borderRadius: 10,
                    color: translating || isSubjectLocked ? UI.text.dim : "#111",
                    fontSize: 12,
                    fontWeight: 800,
                    padding: "9px 12px",
                    cursor: translating || isSubjectLocked ? "default" : "pointer",
                    fontFamily: "sans-serif",
                    whiteSpace: "nowrap",
                  }}
                >
                  {translating ? "번역중..." : "번역"}
                </button>

                <button
                  onClick={handleToggleSubjectLock}
                  style={{
                    background: isSubjectLocked ? withAlpha(SEGMENT_COLORS.subject, 0.22) : UI.neutral.panelSoft,
                    border: `1px solid ${isSubjectLocked ? SEGMENT_COLORS.subject : UI.neutral.borderStrong}`,
                    borderRadius: 10,
                    color: isSubjectLocked ? SEGMENT_COLORS.subject : UI.text.main,
                    fontSize: 12,
                    padding: "9px 10px",
                    cursor: "pointer",
                    fontFamily: "sans-serif",
                    whiteSpace: "nowrap",
                    fontWeight: 700,
                  }}
                >
                  {isSubjectLocked ? "주체 고정 ON" : "주체 고정 OFF"}
                </button>

                <button
                  onClick={() => {
                    if (isSubjectLocked) return;
                    setSubjectText("");
                    setSubjectKorean("");
                    setSubjectEnglish("");
                    setTranslateError("");
                  }}
                  disabled={isSubjectLocked}
                  style={{
                    background: UI.neutral.panelSoft,
                    border: `1px solid ${UI.neutral.borderStrong}`,
                    borderRadius: 10,
                    color: isSubjectLocked ? UI.text.dim : UI.text.main,
                    fontSize: 12,
                    padding: "9px 10px",
                    cursor: isSubjectLocked ? "default" : "pointer",
                    fontFamily: "sans-serif",
                    whiteSpace: "nowrap",
                    opacity: isSubjectLocked ? 0.55 : 1,
                  }}
                >
                  초기화
                </button>
              </div>

              <div style={{ textAlign: "center", fontSize: 11, color: UI.text.muted, fontFamily: "sans-serif" }}>
                {isSubjectLocked
                  ? "주체 고정 상태에서는 카메라/구도만 바꿔 프롬프트를 조정할 수 있습니다."
                  : isPromptKR
                    ? "한글 주체를 입력한 뒤 번역하면 EN 프롬프트가 자동 정리됩니다."
                    : "Enter subject, then translate Korean text to keep EN prompt clean."}
              </div>

              {translateError ? (
                <div style={{ textAlign: "center", fontSize: 12, color: UI.accents.error, fontFamily: "sans-serif" }}>{translateError}</div>
              ) : null}
            </>
          ) : (
            <div
              style={{
                border: `1px solid ${UI.neutral.borderStrong}`,
                borderRadius: 10,
                background: UI.neutral.panelSoft,
                padding: "9px 10px",
                color: UI.text.main,
                fontSize: 12,
                fontFamily: "sans-serif",
                lineHeight: 1.3,
              }}
            >
              {subjectSummaryText
                ? subjectSummaryText.length > 40
                  ? `${subjectSummaryText.slice(0, 40)}...`
                  : subjectSummaryText
                : "주체 입력 영역이 접혀 있습니다."}
            </div>
          )}
        </div>
      </div>

      <div
        ref={viewerRef}
        style={{
          flex: 1,
          minHeight: isMobile ? 300 : 360,
          position: "relative",
          overflow: "hidden",
          background: UI.neutral.panel,
          border: `1px solid ${UI.neutral.borderSoft}`,
          borderRadius: 14,
        }}
      >
        <div ref={mountRef} style={{ width: "100%", height: "100%", cursor: isViewerActive ? "grab" : "default" }} />

        {!isViewerActive ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 20,
              background: "rgba(10,12,18,0.84)",
              display: "grid",
              placeItems: "center",
              padding: 16,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setIsViewerActive(true);
                trackEvent("viewer_activated", { source: "mobile_gate" });
              }}
              style={{
                border: `1px solid ${withAlpha(RATIO_ACCENT, 0.6)}`,
                background: withAlpha(RATIO_ACCENT, 0.16),
                color: RATIO_ACCENT,
                borderRadius: 10,
                padding: "10px 14px",
                fontFamily: "'Arial Black',sans-serif",
                fontSize: 12,
                letterSpacing: "0.02em",
                cursor: "pointer",
                fontWeight: 900,
              }}
            >
              {isPromptKR ? "3D 뷰 시작" : "Start 3D view"}
            </button>
          </div>
        ) : null}

        <div
          style={{
            position: "absolute",
            top: 10,
            left: "50%",
            transform: "translateX(-50%)",
            color: UI.text.muted,
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
            borderRadius: 12,
            border: `1px solid ${withAlpha(RATIO_ACCENT, 0.34)}`,
            background: "rgba(12,14,22,0.72)",
            backdropFilter: "blur(2px)",
            zIndex: 12,
            maxWidth: "94%",
          }}
        >
          <span
            style={{
              fontSize: 10,
              color: RATIO_ACCENT,
              fontFamily: "'Arial Black',sans-serif",
              fontWeight: 900,
              letterSpacing: "0.18em",
              marginRight: 4,
            }}
          >
            ✦ RATIO
          </span>
          <span style={{ fontSize: 11, color: UI.text.muted, fontFamily: "sans-serif", marginRight: 4 }}>
            {isPromptKR ? "비율 프레임 + 피사체 위치 드래그" : "ratio frame + subject drag"}
          </span>

          {AR_PRESETS.map((preset) => {
            const isOn = arPresetId === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => handleAspectRatioChange(preset.id)}
                style={{
                  background: isOn ? RATIO_ACCENT : "transparent",
                  color: isOn ? UI.neutral.bg : UI.text.muted,
                  border: `1px solid ${isOn ? RATIO_ACCENT : "rgba(255,255,255,0.20)"}`,
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
              border: `2px dashed ${RATIO_ACCENT}`,
              borderRadius: 8,
              boxShadow: `0 0 0 1px rgba(0,0,0,0.35) inset, 0 0 20px ${withAlpha(RATIO_ACCENT, 0.18)}`,
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
                left: `${positionPercentX}%`,
                top: `${positionPercentY}%`,
                transform: "translate(-50%, -50%)",
                width: 22,
                height: 22,
                borderRadius: "50%",
                border: `3px solid ${POSITION_ACCENT}`,
                background: withAlpha(POSITION_ACCENT, 0.26),
                boxShadow: `0 0 16px ${withAlpha(POSITION_ACCENT, 0.88)}, 0 0 0 4px rgba(10,19,30,0.65)`,
                display: "grid",
                placeItems: "center",
              }}
            >
              <div style={{ width: 10, height: 2, borderRadius: 99, background: POSITION_ACCENT }} />
              <div
                style={{
                  position: "absolute",
                  width: 2,
                  height: 10,
                  borderRadius: 99,
                  background: POSITION_ACCENT,
                }}
              />
            </div>
            <div
              style={{
                position: "absolute",
                left: `${positionPercentX}%`,
                top: `${positionPercentY}%`,
                transform: "translate(-50%, -50%)",
                width: 34,
                height: 34,
                borderRadius: "50%",
                border: `1px solid ${POSITION_ACCENT_SOFT}`,
                boxShadow: `0 0 14px ${POSITION_ACCENT_SOFT}`,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: `${facePercentX}%`,
                top: `${facePercentY}%`,
                transform: "translate(-50%, -50%)",
                width: 12,
                height: 12,
                borderRadius: "50%",
                border: `2px solid ${GAZE_ACCENT}`,
                background: withAlpha(GAZE_ACCENT, 0.22),
                boxShadow: `0 0 12px ${withAlpha(GAZE_ACCENT, 0.85)}`,
              }}
            />
            {gazeLength > 2 ? (
              <div
                style={{
                  position: "absolute",
                  left: `${facePercentX}%`,
                  top: `${facePercentY}%`,
                  transform: `translate(-50%, -50%) rotate(${gazeAngle}deg)`,
                  width: `${gazeLength}px`,
                  height: 2,
                  background: GAZE_ACCENT,
                  boxShadow: `0 0 8px ${withAlpha(GAZE_ACCENT, 0.85)}`,
                  transformOrigin: "0 50%",
                  pointerEvents: "none",
                }}
              />
            ) : null}
            {gazeLength > 2 ? (
              <div
                style={{
                  position: "absolute",
                  left: `calc(${facePercentX}% + ${gazeDx}px)`,
                  top: `calc(${facePercentY}% + ${gazeDy}px)`,
                  width: 0,
                  height: 0,
                  borderTop: "6px solid transparent",
                  borderBottom: "6px solid transparent",
                  borderLeft: `10px solid ${GAZE_ACCENT}`,
                  transform: `translate(-50%, -50%) rotate(${gazeAngle}deg)`,
                  filter: `drop-shadow(0 0 6px ${withAlpha(GAZE_ACCENT, 0.86)})`,
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
                left: `calc(${facePercentX}% + ${gazeDx}px)`,
                top: `calc(${facePercentY}% + ${gazeDy}px)`,
                transform: "translate(-50%, -50%)",
                width: 16,
                height: 16,
                borderRadius: "50%",
                border: `2px solid ${GAZE_ACCENT}`,
                background: "rgba(7,20,28,0.95)",
                boxShadow: `0 0 10px ${withAlpha(GAZE_ACCENT, 0.9)}`,
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
                background: POSITION_ACCENT_SOFT,
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
                background: POSITION_ACCENT_SOFT,
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
            <span style={{ fontSize: 9, color: SHOT_ACCENT, fontFamily: "sans-serif", fontWeight: 700 }}>멀리</span>
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
                accentColor: SHOT_ACCENT,
              }}
            />
            <span style={{ fontSize: 9, color: SHOT_ACCENT, fontFamily: "sans-serif", fontWeight: 700 }}>
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
            { label: "샷", type: "shot", value: isPromptKR ? resolved.shot.kr : resolved.shot.en },
            {
              label: "앵글",
              type: "height",
              value: isPromptKR ? resolved.height.kr : resolved.height.en,
              disabled: !includeAngleInPrompt,
            },
            {
              label: "방향",
              type: "direction",
              value: isPromptKR ? resolved.direction.kr : resolved.direction.en,
              disabled: !includeAngleInPrompt,
            },
            { label: "포지션", type: "composition", value: isPromptKR ? compositionKr : compositionEn },
          ].map((item) => {
            const color = item.disabled ? UI.text.dim : SEGMENT_COLORS[item.type] || UI.text.main;
            return (
            <div
              key={item.label}
              style={{
                background: withAlpha(color, item.disabled ? 0.05 : 0.1),
                border: `1px solid ${withAlpha(color, item.disabled ? 0.3 : 0.6)}`,
                borderRadius: 10,
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
                <div style={{ fontSize: 9, color: UI.text.dim, fontFamily: "sans-serif", marginTop: 2 }}>
                  {isPromptKR ? "프롬프트 제외" : "excluded"}
                </div>
              ) : null}
            </div>
            );
          })}
          <div
            style={{
              background: withAlpha(
                includeAngleInPrompt ? SEGMENT_COLORS.gaze : UI.text.dim,
                includeAngleInPrompt ? 0.1 : 0.05,
              ),
              border: `1px solid ${withAlpha(
                includeAngleInPrompt ? SEGMENT_COLORS.gaze : UI.text.dim,
                includeAngleInPrompt ? 0.6 : 0.3,
              )}`,
              borderRadius: 10,
              padding: "6px 8px",
            }}
          >
            <div
              style={{
                fontSize: 9,
                color: includeAngleInPrompt ? SEGMENT_COLORS.gaze : UI.text.dim,
                fontFamily: "sans-serif",
                letterSpacing: "0.08em",
              }}
            >
              시선
            </div>
            <div
              style={{
                fontSize: 12,
                color: includeAngleInPrompt ? SEGMENT_COLORS.gaze : UI.text.dim,
                fontFamily: "sans-serif",
                fontWeight: 700,
              }}
            >
              {isPromptKR ? gazeKr : gazeEn}
            </div>
            {!includeAngleInPrompt ? (
              <div style={{ fontSize: 9, color: UI.text.dim, fontFamily: "sans-serif", marginTop: 2 }}>
                {isPromptKR ? "프롬프트 제외" : "excluded"}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div
        style={{
          background: UI.neutral.panel,
          padding: "14px 16px",
          border: `1px solid ${UI.neutral.borderSoft}`,
          borderRadius: 14,
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 72 }}>
          <span
            style={{
              fontSize: 10,
              color: UI.text.main,
              fontFamily: "'Arial Black',sans-serif",
              letterSpacing: "0.2em",
              fontWeight: 900,
            }}
          >
            PROMPT
          </span>

          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <button
              onClick={() => handlePromptLangChange("kr")}
              style={{
                background: isPromptKR ? UI.neutral.panelRaised : "transparent",
                color: isPromptKR ? UI.text.strong : UI.text.dim,
                border: `1px solid ${isPromptKR ? UI.neutral.borderStrong : UI.neutral.borderSoft}`,
                borderRadius: 8,
                padding: "4px 8px",
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
                background: !isPromptKR ? UI.neutral.panelRaised : "transparent",
                color: !isPromptKR ? UI.text.strong : UI.text.dim,
                border: `1px solid ${!isPromptKR ? UI.neutral.borderStrong : UI.neutral.borderSoft}`,
                borderRadius: 8,
                padding: "4px 8px",
                cursor: "pointer",
                fontSize: 11,
                fontFamily: "sans-serif",
                fontWeight: 700,
              }}
            >
              EN
            </button>
            <button
              type="button"
              onClick={handleToggleAngleInPrompt}
              style={{
                background: "transparent",
                color: includeAngleInPrompt ? SEGMENT_COLORS.height : UI.text.dim,
                border: `1px solid ${includeAngleInPrompt ? withAlpha(SEGMENT_COLORS.height, 0.9) : UI.neutral.borderSoft}`,
                borderRadius: 999,
                padding: "4px 8px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 10,
                fontFamily: "sans-serif",
                fontWeight: 800,
              }}
            >
              <span>앵글</span>
              <span
                style={{
                  position: "relative",
                  display: "inline-block",
                  width: 28,
                  height: 14,
                  borderRadius: 999,
                  border: `1px solid ${includeAngleInPrompt ? withAlpha(SEGMENT_COLORS.height, 0.9) : UI.neutral.borderSoft}`,
                  background: includeAngleInPrompt ? withAlpha(SEGMENT_COLORS.height, 0.2) : UI.neutral.panelRaised,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 1,
                    left: includeAngleInPrompt ? 15 : 1,
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: includeAngleInPrompt ? SEGMENT_COLORS.height : UI.text.muted,
                    transition: "left 160ms ease, background 160ms ease",
                  }}
                />
              </span>
              <span style={{ minWidth: 22, textAlign: "left" }}>{includeAngleInPrompt ? "ON" : "OFF"}</span>
            </button>
          </div>

          <textarea
            rows={2}
            value={customPromptHint}
            onChange={(event) => handleCustomPromptHintChange(event.target.value)}
            onBlur={() => {
              trackEvent("prompt_custom_hint_updated", {
                length: String(customPromptHint || "").trim().length,
              });
            }}
            placeholder="추가 프롬프트를 입력하세요 예:질감, 무드, 조명"
            style={{
              width: isMobile ? "100%" : 250,
              maxWidth: "100%",
              background: UI.neutral.panelRaised,
              border: `1px solid ${UI.neutral.borderStrong}`,
              borderRadius: 10,
              padding: "6px 8px",
              color: SEGMENT_COLORS.custom,
              fontSize: 11,
              fontFamily: "sans-serif",
              lineHeight: 1.35,
              minHeight: 44,
              resize: "none",
            }}
          />

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
            <button
              type="button"
              onClick={handleUpgradePrompt}
              disabled={!displayPrompt || Boolean(promptValidationError) || upgradeLoading}
              style={{
                background: isUpgradedPromptSelected
                  ? withAlpha(SEGMENT_COLORS.custom, 0.28)
                  : canUpgradePrompt
                  ? withAlpha(SEGMENT_COLORS.custom, 0.2)
                  : "transparent",
                color: canUpgradePrompt ? SEGMENT_COLORS.custom : UI.text.dim,
                border: `1px solid ${canUpgradePrompt ? withAlpha(SEGMENT_COLORS.custom, 0.9) : UI.neutral.borderSoft}`,
                borderRadius: 8,
                padding: "6px 10px",
                cursor: !displayPrompt || promptValidationError || upgradeLoading ? "default" : "pointer",
                fontSize: 11,
                fontFamily: "sans-serif",
                fontWeight: 800,
                opacity: !displayPrompt || promptValidationError || upgradeLoading ? 0.55 : 1,
              }}
            >
              {upgradeLoading ? "다듬기 중..." : isUpgradedPromptSelected ? "다듬기 적용됨" : "다듬기 업그레이드"}
            </button>
            {isUpgradedPromptSelected ? (
              <button
                type="button"
                onClick={handleRevertPromptUpgrade}
                style={{
                  background: "transparent",
                  color: UI.text.main,
                  border: `1px solid ${UI.neutral.borderSoft}`,
                  borderRadius: 8,
                  padding: "6px 10px",
                  cursor: "pointer",
                  fontSize: 11,
                  fontFamily: "sans-serif",
                  fontWeight: 700,
                }}
              >
                원본 되돌리기
              </button>
            ) : null}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 220, fontFamily: "monospace", lineHeight: 1.7 }}>
          {activePromptSegments.length ? (
            <>
              {activePromptSegments
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
              {activePromptSegments.find((segment) => segment.type === "ratio") ? (
                <span style={{ color: SEGMENT_COLORS.ratio, fontSize: 13, fontWeight: 800 }}>
                  {" "}
                  {activePromptSegments.find((segment) => segment.type === "ratio")?.text}
                </span>
              ) : null}
            </>
          ) : (
            <span style={{ color: UI.text.dim, fontSize: 13, fontFamily: "sans-serif" }}>
              주체 없이도 프롬프트를 생성할 수 있습니다.
            </span>
          )}

          {promptValidationError ? (
            <div style={{ marginTop: 6, color: UI.accents.error, fontSize: 12, fontFamily: "sans-serif" }}>
              {promptValidationError}
            </div>
          ) : null}

          {awkwardWords.length > 0 ? (
            <div style={{ marginTop: 6, color: UI.accents.warning, fontSize: 12, fontFamily: "sans-serif" }}>
              어색할 수 있는 표현 감지: {awkwardWords.join(", ")}
            </div>
          ) : null}

          {upgradeNotice ? (
            <div style={{ marginTop: 6, color: UI.text.main, fontSize: 11, fontFamily: "sans-serif" }}>
              {upgradeNotice}
            </div>
          ) : null}

          {canUpgradePrompt ? (
            <div
              style={{
                marginTop: 8,
                border: `1px solid ${UI.neutral.borderSoft}`,
                borderRadius: 10,
                padding: "7px 8px",
                display: "grid",
                gap: 4,
                fontFamily: "sans-serif",
              }}
            >
              <div style={{ fontSize: 10, color: UI.text.muted }}>
                원본 {isUpgradedPromptSelected ? "" : "(현재 적용)"}
              </div>
              <div style={{ fontSize: 11, color: UI.text.main, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {displayPrompt}
              </div>
              <div style={{ fontSize: 10, color: SEGMENT_COLORS.custom }}>
                업그레이드 {isUpgradedPromptSelected ? "(현재 적용)" : ""}
              </div>
              <div style={{ fontSize: 11, color: UI.text.strong, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {upgradedDisplayPrompt}
              </div>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => libraryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          style={{
            background: "transparent",
            color: UI.text.main,
            border: `1px solid ${UI.neutral.borderSoft}`,
            borderRadius: 10,
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
          disabled={!activeDisplayPrompt || Boolean(promptValidationError)}
          style={{
            background: copied ? UI.accents.success : SHOT_ACCENT,
            color: copied ? "#0b2a14" : "#071a2a",
            border: "none",
            borderRadius: 10,
            padding: "10px 16px",
            cursor: !activeDisplayPrompt || promptValidationError ? "default" : "pointer",
            fontFamily: "'Arial Black','Helvetica Neue',sans-serif",
            fontSize: 12,
            fontWeight: 900,
            whiteSpace: "nowrap",
            opacity: !activeDisplayPrompt || promptValidationError ? 0.45 : 1,
          }}
        >
          {copied ? "복사 완료" : isUpgradedPromptSelected ? "업그레이드 복사" : "복사 COPY"}
        </button>
      </div>

      <div
        ref={libraryRef}
        style={{
          background: UI.neutral.panel,
          border: `1px solid ${UI.neutral.borderSoft}`,
          borderRadius: 14,
          padding: "14px 16px 16px",
          display: "grid",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 10,
              color: UI.text.main,
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
              background: UI.neutral.panelRaised,
              border: `1px solid ${UI.neutral.borderStrong}`,
              borderRadius: 10,
              padding: "8px 8px",
              color: UI.text.strong,
              fontSize: 12,
              fontFamily: "sans-serif",
            }}
          />
          <button
            type="button"
            onClick={saveCurrentPreset}
            style={{
              background: UI.neutral.panelRaised,
              border: `1px solid ${UI.neutral.borderStrong}`,
              borderRadius: 10,
              padding: "8px 10px",
              color: UI.text.strong,
              fontSize: 12,
              fontWeight: 800,
              fontFamily: "sans-serif",
              cursor: "pointer",
            }}
          >
            현재값 저장
          </button>
          <button
            type="button"
            onClick={handleResetAllPresets}
            style={{
              background: "transparent",
              border: `1px solid ${withAlpha(UI.accents.error, 0.5)}`,
              borderRadius: 10,
              padding: "8px 10px",
              color: UI.accents.error,
              fontSize: 12,
              fontWeight: 700,
              fontFamily: "sans-serif",
              cursor: "pointer",
            }}
          >
            프리셋 초기화
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
                  border: `1px solid ${UI.neutral.borderStrong}`,
                  borderRadius: 999,
                  padding: "4px 8px",
                  background: UI.neutral.panelRaised,
                }}
              >
                <button
                  type="button"
                  onClick={() => applyUserPreset(preset)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: UI.text.strong,
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
                    color: UI.text.main,
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
                    color: UI.accents.error,
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
          <div style={{ color: UI.text.dim, fontSize: 12, fontFamily: "sans-serif" }}>
            저장된 프리셋이 없습니다.
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 10,
              color: UI.text.main,
              fontFamily: "'Arial Black',sans-serif",
              letterSpacing: "0.14em",
            }}
          >
            PROMPT HISTORY
          </span>
          <button
            type="button"
            onClick={saveCurrentPromptToHistory}
            disabled={!activeDisplayPrompt || Boolean(promptValidationError)}
            style={{
              background: UI.neutral.panelRaised,
              border: `1px solid ${UI.neutral.borderStrong}`,
              borderRadius: 10,
              padding: "8px 10px",
              color: UI.text.strong,
              fontSize: 12,
              fontWeight: 800,
              fontFamily: "sans-serif",
              cursor: !activeDisplayPrompt || promptValidationError ? "default" : "pointer",
              opacity: !activeDisplayPrompt || promptValidationError ? 0.5 : 1,
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
                  background: UI.neutral.panelRaised,
                  border: `1px solid ${UI.neutral.borderSoft}`,
                  borderRadius: 10,
                  padding: "7px 8px",
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
                    color: UI.text.main,
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
                <span style={{ color: UI.text.dim, fontSize: 10, fontFamily: "sans-serif" }}>
                  {item.lang?.toUpperCase?.() || "EN"}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveHistoryItem(item.id)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: UI.accents.error,
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
          <div style={{ color: UI.text.dim, fontSize: 12, fontFamily: "sans-serif" }}>
            저장된 프롬프트 히스토리가 없습니다.
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
