import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildSubjectObject } from "./buildSubjectObject";
import { resolveKeywords } from "./keywordResolver";
import { AR_PRESETS, DEFAULT_SUBJECT_PROMPTS, SUBJECT_TYPES } from "./cameraGlossary";
import {
  buildDisplayPromptSegments,
  SEGMENT_COLORS,
  buildUpgradedPromptSegments,
  buildPromptSegments,
  hasKorean,
  inferPromptLanguageFromText,
  splitCustomQualityText,
  toSentenceText,
  toPromptText,
  validatePromptInput,
} from "./promptBuilder";
import { detectAwkwardExpressions } from "./promptQuality";
import {
  clearPromptHistory,
  didLastHistoryWriteFail,
  getPromptHistory,
  replacePromptHistory,
  removePromptHistory,
  savePromptHistory,
} from "./historyStore";
import {
  clearUserPresets,
  didLastUserPresetWriteFail,
  getUserPresets,
  replaceUserPresets,
  removeUserPreset,
  renameUserPreset,
  saveUserPreset,
} from "./userPresetStore";
import { initAnalytics, trackEvent } from "../analytics/eventLogger";
import { PRODUCT_ANALYTICS_EVENTS } from "../analytics/productEvents";
import {
  DEFAULT_ACCOUNT_CAMERA_DEFAULTS,
  getEnvironmentCameraDefaults,
  getEnvironmentDefaultCustomPromptHint,
  hasSavedAccountCameraDefaults,
  resolvePromptLanguagePreference,
  shouldAutoImportLegacyData,
  shouldShowLegacyImportSurface,
} from "../account/accountEnvironmentUtils";
import { requestPromptRefine, requestSubjectTranslate } from "./promptApiClient";
import { loadThreeRuntime } from "./threeRuntime";
import { getGazeKeyword, toShotDistancePercent } from "./cameraLabelUtils";
import {
  getLegacyImportSummary,
  mergeHistoryItems,
  mergePresetItems,
} from "./legacyLocalData";
import { getViewerRenderConfig } from "./viewerRenderConfig";
import { shouldCaptureViewerWheel } from "./viewerWheelIntent";
import { distancePercentToRadius, stepDistancePercent } from "./distanceControlUtils";
import {
  fetchRemotePromptHistory,
  fetchRemoteUserPresets,
  getUserStorageScope,
  saveRemotePromptHistory,
  saveRemoteUserPresets,
} from "./userDataSync";
import { getInteractiveDensitySettings } from "./interactiveDensity";

const PERSON_SUBJECT = SUBJECT_TYPES.find((item) => item.id === "person") ?? SUBJECT_TYPES[0];
const SHOT_ACCENT = SEGMENT_COLORS.shot || "#4da3ff";
const RATIO_ACCENT = SEGMENT_COLORS.ratio || "#ffffff";
const POSITION_ACCENT = SEGMENT_COLORS.composition || "#b388ff";
const POSITION_ACCENT_SOFT = withAlpha(POSITION_ACCENT, 0.36);
const HEIGHT_ACCENT = SEGMENT_COLORS.height || "#ff5d8f";
const GAZE_ACCENT = SEGMENT_COLORS.gaze || "#3df6d0";
const TRANSLATE_ACTION_BG = "#ffeb79";
const DIRECTION_UI_ACCENT = "#f1a3e7";
const DIRECTION_TEXT_COLOR = "#edafdb";
const SUBJECT_PROMPT_TEXT_COLOR = "#ffeb79";
const CUSTOM_PROMPT_TEXT_COLOR = "#f1ce40";
const QUALITY_PRESET_PROMPT_COLOR = "#9aa3ad";
const PROMPT_HELPER_TEXT_COLOR = "#bcc5d4";
const FACE_FALLBACK_OFFSET = 0.38;
const FACE_MODEL_ANCHOR = { x: 0, y: 0.85, z: 0.18 };
const SUBJECT_POSITION_SCALE = 1.1;
const SUBJECT_POS_MIN = -1.8;
const SUBJECT_POS_MAX = 1.8;
const CAMERA_FOV_DEG = 45;
const CAMERA_DISTANCE_NEAR = 1.45;
const CAMERA_DISTANCE_FAR = 7.4;
const CAMERA_DISTANCE_CURVE = 1.8;
const CAMERA_LOOKAT_Y_NEAR = 0.48;
const CAMERA_LOOKAT_Y_FAR = 0.0;
const CAMERA_LOOKAT_Y_CURVE = 1.1;
const SPHERE_RADIUS = 1.9;
const GAZE_RADIUS_MIN = 28;
const GAZE_RADIUS_MAX = 84;
const QUALITY_PRESET_HINTS = {
  1: {
    kr: "8k photograph, ultra high resolution, sharp focus, hyper detailed, fine details",
    en: "8k photograph, ultra high resolution, sharp focus, hyper detailed, fine details",
  },
  2: {
    kr: "cinematic film still, shot on ARRI Alexa, 35mm lens, shallow depth of field, film grain",
    en: "cinematic film still, shot on ARRI Alexa, 35mm lens, shallow depth of field, film grain",
  },
  3: {
    kr: "hyperrealistic, photorealistic, realistic lighting, natural skin texture, detailed materials",
    en: "hyperrealistic, photorealistic, realistic lighting, natural skin texture, detailed materials",
  },
  4: {
    kr: "surrealism, dreamlike atmosphere, impossible geometry, symbolic imagery, uncanny visuals",
    en: "surrealism, dreamlike atmosphere, impossible geometry, symbolic imagery, uncanny visuals",
  },
  5: {
    kr: "dreamcore aesthetic, nostalgic atmosphere, liminal space, soft haze, analog dream texture",
    en: "dreamcore aesthetic, nostalgic atmosphere, liminal space, soft haze, analog dream texture",
  },
};
const QUALITY_PRESET_TOOLTIPS = {
  1: "1 해상도",
  2: "2 시네마틱",
  3: "3 하이퍼리얼리즘",
  4: "4 슈리얼리즘",
  5: "5 드림코어",
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function dot3(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross3(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize3(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (length <= 1e-6) return null;
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
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

function getAspectFitRect(containerWidth, containerHeight, aspectRatio) {
  const safeWidth = Math.max(1, containerWidth || 1);
  const safeHeight = Math.max(1, containerHeight || 1);
  const safeAspect = Math.max(0.01, aspectRatio || 1);

  let width = safeWidth;
  let height = width / safeAspect;

  if (height > safeHeight) {
    height = safeHeight;
    width = height * safeAspect;
  }

  return {
    width: Math.round(width),
    height: Math.round(height),
  };
}

function getCameraDistance(r) {
  const t = clamp(1 - r, 0, 1);
  const curved = Math.pow(t, CAMERA_DISTANCE_CURVE);
  return CAMERA_DISTANCE_NEAR + curved * (CAMERA_DISTANCE_FAR - CAMERA_DISTANCE_NEAR);
}

function getCameraLookAtY(r) {
  const t = clamp(1 - r, 0, 1);
  const curved = Math.pow(t, CAMERA_LOOKAT_Y_CURVE);
  return CAMERA_LOOKAT_Y_FAR + curved * (CAMERA_LOOKAT_Y_NEAR - CAMERA_LOOKAT_Y_FAR);
}

function getGazeRadius(frameRect) {
  return clamp(Math.min(frameRect.width, frameRect.height) * 0.2, GAZE_RADIUS_MIN, GAZE_RADIUS_MAX);
}

function getCameraBasis({ phi, theta, r }) {
  const pRad = (phi * Math.PI) / 180;
  const tRad = (theta * Math.PI) / 180;
  const viewR = getCameraDistance(r);

  const cameraPos = {
    x: viewR * Math.sin(pRad) * Math.sin(tRad),
    y: viewR * Math.cos(pRad),
    z: viewR * Math.sin(pRad) * Math.cos(tRad),
  };
  const target = { x: 0, y: getCameraLookAtY(r), z: 0 };

  const upHint =
    phi < 5 || phi > 175
      ? { x: 0, y: 0, z: phi < 90 ? -1 : 1 }
      : { x: 0, y: 1, z: 0 };

  const forward = normalize3({
    x: target.x - cameraPos.x,
    y: target.y - cameraPos.y,
    z: target.z - cameraPos.z,
  });
  if (!forward) return null;

  let right = normalize3(cross3(forward, upHint));
  if (!right) {
    right = { x: 1, y: 0, z: 0 };
  }

  let cameraUp = normalize3(cross3(right, forward));
  if (!cameraUp) {
    cameraUp = upHint;
  }

  return { cameraPos, forward, right, cameraUp };
}

function projectWorldToNdc({ point, phi, theta, r, aspect }) {
  const basis = getCameraBasis({ phi, theta, r });
  if (!basis) return null;

  const { cameraPos, forward, right, cameraUp } = basis;

  const rel = {
    x: point.x - cameraPos.x,
    y: point.y - cameraPos.y,
    z: point.z - cameraPos.z,
  };

  const zCam = dot3(rel, forward);
  if (zCam <= 1e-3) return null;

  const xCam = dot3(rel, right);
  const yCam = dot3(rel, cameraUp);
  const f = 1 / Math.tan(((CAMERA_FOV_DEG || 45) * Math.PI) / 360);
  const safeAspect = Math.max(0.01, aspect || 1);

  return {
    x: (xCam * f) / (safeAspect * zCam),
    y: (yCam * f) / zCam,
  };
}

function getProjectedFramePercent({ worldPoint, phi, theta, r, viewerSize, frameRect, fallback }) {
  if (!viewerSize.width || !viewerSize.height || !frameRect.width || !frameRect.height) {
    return fallback || { x: 50, y: 50 };
  }

  const ndc = projectWorldToNdc({
    point: worldPoint,
    phi,
    theta,
    r,
    aspect: viewerSize.width / viewerSize.height,
  });
  if (!ndc) return fallback || { x: 50, y: 50 };

  const viewerX = ((ndc.x + 1) / 2) * viewerSize.width;
  const viewerY = ((1 - ndc.y) / 2) * viewerSize.height;
  const frameLeft = (viewerSize.width - frameRect.width) / 2;
  const frameTop = (viewerSize.height - frameRect.height) / 2;

  const x = ((viewerX - frameLeft) / frameRect.width) * 100;
  const y = ((viewerY - frameTop) / frameRect.height) * 100;

  return {
    x: clamp(x, -25, 125),
    y: clamp(y, -25, 125),
  };
}

function getWorldPointOnSubjectPlane({ percentX, percentY, phi, theta, r, viewerSize, frameRect }) {
  if (!viewerSize.width || !viewerSize.height || !frameRect.width || !frameRect.height) return null;

  const frameLeft = (viewerSize.width - frameRect.width) / 2;
  const frameTop = (viewerSize.height - frameRect.height) / 2;
  const viewerX = frameLeft + (clamp(percentX, 0, 100) / 100) * frameRect.width;
  const viewerY = frameTop + (clamp(percentY, 0, 100) / 100) * frameRect.height;

  const ndcX = (viewerX / viewerSize.width) * 2 - 1;
  const ndcY = 1 - (viewerY / viewerSize.height) * 2;
  const safeAspect = Math.max(0.01, viewerSize.width / viewerSize.height);
  const f = 1 / Math.tan((CAMERA_FOV_DEG * Math.PI) / 360);

  const basis = getCameraBasis({ phi, theta, r });
  if (!basis) return null;

  const { cameraPos, forward, right, cameraUp } = basis;
  const ray = normalize3({
    x: forward.x + right.x * ((ndcX * safeAspect) / f) + cameraUp.x * (ndcY / f),
    y: forward.y + right.y * ((ndcX * safeAspect) / f) + cameraUp.y * (ndcY / f),
    z: forward.z + right.z * ((ndcX * safeAspect) / f) + cameraUp.z * (ndcY / f),
  });

  if (!ray || Math.abs(ray.z) < 1e-5) return null;
  const t = -cameraPos.z / ray.z;
  if (!Number.isFinite(t) || t <= 0) return null;

  return {
    x: cameraPos.x + ray.x * t,
    y: cameraPos.y + ray.y * t,
    z: 0,
  };
}

function getFaceAnchorPercent({ subjectPos, phi, theta, r, viewerSize, frameRect }) {
  const fallbackY = clamp(subjectPos.y - FACE_FALLBACK_OFFSET, -1, 1);
  const fallback = {
    x: ((subjectPos.x + 1) / 2) * 100,
    y: ((fallbackY + 1) / 2) * 100,
  };

  const subjectWorld = {
    x: subjectPos.x * SUBJECT_POSITION_SCALE,
    y: -subjectPos.y * SUBJECT_POSITION_SCALE,
    z: 0,
  };
  const faceWorld = {
    x: subjectWorld.x + FACE_MODEL_ANCHOR.x,
    y: subjectWorld.y + FACE_MODEL_ANCHOR.y,
    z: subjectWorld.z + FACE_MODEL_ANCHOR.z,
  };

  return getProjectedFramePercent({
    worldPoint: faceWorld,
    phi,
    theta,
    r,
    viewerSize,
    frameRect,
    fallback,
  });
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

function getQualityPromptHint(level, isKorean) {
  const preset = QUALITY_PRESET_HINTS[level];
  if (!preset) return "";
  return isKorean ? preset.kr : preset.en;
}

function getQualityPresetTooltip(level) {
  return QUALITY_PRESET_TOOLTIPS[level] || String(level);
}

function joinPromptHints(...parts) {
  const next = [];
  const seen = new Set();

  for (const part of parts) {
    const value = String(part || "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(value);
  }

  return next.join(", ");
}

export default function InteractiveMode({
  accessToken = "",
  userId = "",
  accountEnvironment = null,
  onAccountEnvironmentChange,
}) {
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1440,
  );

  const [subjectText, setSubjectText] = useState("");
  const [subjectKorean, setSubjectKorean] = useState("");
  const [subjectEnglish, setSubjectEnglish] = useState("");
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState("");
  const [isSubjectLocked, setIsSubjectLocked] = useState(false);
  const [isSubjectToolbarOpen, setIsSubjectToolbarOpen] = useState(true);
  const [lockedSubject, setLockedSubject] = useState({ kr: "", en: "" });

  const [promptLang, setPromptLang] = useState(() =>
    resolvePromptLanguagePreference(accountEnvironment?.defaultPromptLanguage),
  );
  const [promptFormat, setPromptFormat] = useState("keyword");
  const [includeAngleInPrompt, setIncludeAngleInPrompt] = useState(true);
  const [customPromptHint, setCustomPromptHint] = useState("");
  const [appliedCustomPromptHint, setAppliedCustomPromptHint] = useState(() =>
    getEnvironmentDefaultCustomPromptHint(accountEnvironment),
  );
  const [qualityPresetLevel, setQualityPresetLevel] = useState(0);
  const [hoveredQualityPresetLevel, setHoveredQualityPresetLevel] = useState(0);
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
  const [legacyImportSummary, setLegacyImportSummary] = useState({
    historyCount: 0,
    presetCount: 0,
    totalCount: 0,
    hasImportableData: false,
  });
  const [legacyImporting, setLegacyImporting] = useState(false);
  const [legacyImportNotice, setLegacyImportNotice] = useState("");
  const [environmentDefaultNotice, setEnvironmentDefaultNotice] = useState("");
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [activeMobileCameraSliderKey, setActiveMobileCameraSliderKey] = useState(null);
  const [isViewerActive, setIsViewerActive] = useState(
    typeof window === "undefined" ? true : window.innerWidth > 860,
  );
  const viewerRef = useRef(null);
  const mountRef = useRef(null);
  const frameRef = useRef(null);
  const libraryRef = useRef(null);
  const subjectInputRef = useRef(null);

  const frameAnimRef = useRef(null);
  const isDraggingCamera = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const cameraDragMetaRef = useRef(null);
  const distanceTrackReadyRef = useRef(false);
  const hasHydratedEnvironmentDefaultsRef = useRef(false);
  const hasHydratedEnvironmentCameraRef = useRef(false);
  const hasAutoImportedLegacyRef = useRef(false);

  const phiRef = useRef(phi);
  const thetaRef = useRef(theta);
  const rRef = useRef(r);
  const promptLangRef = useRef(promptLang);
  const aspectRatioRef = useRef("9:16");
  const subjectPosRef = useRef(subjectPos);
  const gazeVectorRef = useRef(gazeVector);

  const isMobile = viewportWidth <= 860;
  const density = getInteractiveDensitySettings(accountEnvironment?.uiDensity, isMobile);
  const storageScope = useMemo(() => getUserStorageScope(userId), [userId]);
  const legacyImportMode = String(accountEnvironment?.legacyImportMode || "ask");
  const accountCameraDefaults = useMemo(
    () => getEnvironmentCameraDefaults(accountEnvironment),
    [accountEnvironment],
  );
  const hasSavedCameraDefaults = useMemo(
    () => hasSavedAccountCameraDefaults(accountEnvironment),
    [accountEnvironment],
  );
  const shouldShowLegacyImport = shouldShowLegacyImportSurface({
    legacyImportMode,
    hasImportableData: legacyImportSummary.hasImportableData,
    notice: legacyImportNotice,
  });

  useEffect(() => {
    if (!isMobile && !isViewerActive) {
      setIsViewerActive(true);
    }
  }, [isMobile, isViewerActive]);

  useEffect(() => {
    hasHydratedEnvironmentDefaultsRef.current = false;
    hasHydratedEnvironmentCameraRef.current = false;
    hasAutoImportedLegacyRef.current = false;
  }, [userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setViewportWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    setPromptHistory(getPromptHistory(storageScope));
    setUserPresets(getUserPresets(storageScope));
  }, [storageScope]);

  useEffect(() => {
    setLegacyImportSummary(
      getLegacyImportSummary({
        scopedHistory: promptHistory,
        legacyHistory: getPromptHistory(),
        scopedPresets: userPresets,
        legacyPresets: getUserPresets(),
      }),
    );
  }, [promptHistory, userPresets, storageScope]);

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;

    const hydrateUserData = async () => {
      const [historyResult, presetsResult] = await Promise.allSettled([
        fetchRemotePromptHistory({ accessToken }),
        fetchRemoteUserPresets({ accessToken }),
      ]);

      if (cancelled) return;

      if (historyResult.status === "fulfilled") {
        const currentHistory = getPromptHistory(storageScope);
        if (historyResult.value.length || !currentHistory.length) {
          const nextHistory = replacePromptHistory(historyResult.value, storageScope);
          setPromptHistory(nextHistory);
        }
      } else {
        trackEvent("prompt_history_sync_failed", {
          screen: "interactive",
          phase: "hydrate",
          message: historyResult.reason?.message || "history_sync_failed",
        });
      }

      if (presetsResult.status === "fulfilled") {
        const currentPresets = getUserPresets(storageScope);
        if (presetsResult.value.length || !currentPresets.length) {
          const nextPresets = replaceUserPresets(presetsResult.value, storageScope);
          setUserPresets(nextPresets);
        }
      } else {
        trackEvent("user_presets_sync_failed", {
          screen: "interactive",
          phase: "hydrate",
          message: presetsResult.reason?.message || "preset_sync_failed",
        });
      }
    };

    void hydrateUserData();

    return () => {
      cancelled = true;
    };
  }, [accessToken, storageScope]);

  useEffect(() => {
    if (hasHydratedEnvironmentDefaultsRef.current) return;
    if (!accountEnvironment) return;

    const hasLocalDraft =
      Boolean(subjectText.trim()) ||
      Boolean(subjectKorean.trim()) ||
      Boolean(subjectEnglish.trim()) ||
      Boolean(customPromptHint.trim()) ||
      Boolean(appliedCustomPromptHint.trim());

    if (hasLocalDraft) {
      hasHydratedEnvironmentDefaultsRef.current = true;
      return;
    }

    setPromptLang(resolvePromptLanguagePreference(accountEnvironment?.defaultPromptLanguage));
    setAppliedCustomPromptHint(getEnvironmentDefaultCustomPromptHint(accountEnvironment));
    hasHydratedEnvironmentDefaultsRef.current = true;
  }, [
    accountEnvironment,
    appliedCustomPromptHint,
    customPromptHint,
    subjectEnglish,
    subjectKorean,
    subjectText,
  ]);

  useEffect(() => {
    if (hasHydratedEnvironmentCameraRef.current) return;
    if (!accountEnvironment || !hasSavedCameraDefaults) return;

    setPhi(accountCameraDefaults.phi);
    setTheta(accountCameraDefaults.theta);
    setR(accountCameraDefaults.r);
    setSubjectPos(accountCameraDefaults.subjectPos);
    setGazeVector(accountCameraDefaults.gazeVector);
    setArPresetId(accountCameraDefaults.arPresetId);
    setIncludeAngleInPrompt(accountCameraDefaults.includeAngleInPrompt);
    setQualityPresetLevel(accountCameraDefaults.qualityPresetLevel);
    hasHydratedEnvironmentCameraRef.current = true;
  }, [accountCameraDefaults, accountEnvironment, hasSavedCameraDefaults]);

  useEffect(() => {
    if (!environmentDefaultNotice) return undefined;
    const timeoutId = window.setTimeout(() => setEnvironmentDefaultNotice(""), 2400);
    return () => window.clearTimeout(timeoutId);
  }, [environmentDefaultNotice]);

  useEffect(() => {
    initAnalytics();
    trackEvent("interactive_mode_opened", { mode: "person_single" });
  }, []);

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
    promptLangRef.current = promptLang;
  }, [promptLang]);

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
        distancePercent: toShotDistancePercent(r),
      });
    }, 280);

    return () => clearTimeout(timeout);
  }, [r]);

  const selectedAr = AR_PRESETS.find((item) => item.id === arPresetId) || AR_PRESETS[0];
  const selectedAspectRatio = parseRatio(selectedAr.value);
  useEffect(() => {
    aspectRatioRef.current = selectedAr.value;
  }, [selectedAr.value]);
  const getAnalyticsContext = () => ({
    screen: "interactive",
    aspect_ratio: selectedAr.value,
    language_mode: promptLang,
  });
  const trackProductEvent = (eventName, props = {}) => {
    trackEvent(eventName, {
      ...getAnalyticsContext(),
      ...props,
    });
  };
  const syncPromptHistoryRemote = (items, phase) => {
    if (!accessToken) return;
    void saveRemotePromptHistory({ accessToken, items }).catch((error) => {
      trackEvent("prompt_history_sync_failed", {
        screen: "interactive",
        phase,
        message: error?.message || "history_sync_failed",
      });
    });
  };
  const syncUserPresetsRemote = (items, phase) => {
    if (!accessToken) return;
    void saveRemoteUserPresets({ accessToken, items }).catch((error) => {
      trackEvent("user_presets_sync_failed", {
        screen: "interactive",
        phase,
        message: error?.message || "preset_sync_failed",
      });
    });
  };
  const handleImportLegacyLocalData = useCallback(async (source = "manual") => {
    if (legacyImporting) return;

    const legacyHistory = getPromptHistory();
    const legacyPresets = getUserPresets();
    const scopedHistory = getPromptHistory(storageScope);
    const scopedPresets = getUserPresets(storageScope);
    const summary = getLegacyImportSummary({
      scopedHistory,
      legacyHistory,
      scopedPresets,
      legacyPresets,
    });

    if (!summary.hasImportableData) {
      setLegacyImportNotice("가져올 기존 브라우저 데이터가 없습니다.");
      return;
    }

    setLegacyImporting(true);
    setLegacyImportNotice(
      source === "auto" ? "계정 기본값에 따라 기존 브라우저 데이터를 자동으로 가져오는 중..." : "",
    );

    const nextHistory = replacePromptHistory(
      mergeHistoryItems({ scopedItems: scopedHistory, legacyItems: legacyHistory }),
      storageScope,
    );
    const nextPresets = replaceUserPresets(
      mergePresetItems({ scopedItems: scopedPresets, legacyItems: legacyPresets }),
      storageScope,
    );

    setPromptHistory(nextHistory);
    setUserPresets(nextPresets);

    const [historyResult, presetsResult] = await Promise.allSettled([
      saveRemotePromptHistory({ accessToken, items: nextHistory }),
      saveRemoteUserPresets({ accessToken, items: nextPresets }),
    ]);

    const historySynced = historyResult.status === "fulfilled";
    const presetsSynced = presetsResult.status === "fulfilled";

    if (!historySynced) {
      trackEvent("prompt_history_sync_failed", {
        screen: "interactive",
        phase: "legacy_import",
        message: historyResult.reason?.message || "history_sync_failed",
      });
    }

    if (!presetsSynced) {
      trackEvent("user_presets_sync_failed", {
        screen: "interactive",
        phase: "legacy_import",
        message: presetsResult.reason?.message || "preset_sync_failed",
      });
    }

    trackEvent("legacy_local_data_imported", {
      screen: "interactive",
      imported_history_count: summary.historyCount,
      imported_preset_count: summary.presetCount,
      history_synced: historySynced,
      presets_synced: presetsSynced,
      source,
    });

    setLegacyImportNotice(
      historySynced && presetsSynced
        ? `기존 로컬 데이터 ${summary.totalCount}개를 계정에 가져왔습니다.`
        : "로컬 데이터는 가져왔지만 서버 동기화 일부가 실패했습니다. 브라우저에는 반영되었습니다.",
    );
    setLegacyImporting(false);
  }, [accessToken, legacyImporting, storageScope]);

  useEffect(() => {
    if (hasAutoImportedLegacyRef.current) return;
    if (
      !shouldAutoImportLegacyData({
        legacyImportMode,
        hasImportableData: legacyImportSummary.hasImportableData,
        accessToken,
      })
    ) {
      return;
    }

    hasAutoImportedLegacyRef.current = true;
    void handleImportLegacyLocalData("auto");
  }, [
    accessToken,
    handleImportLegacyLocalData,
    legacyImportMode,
    legacyImportSummary.hasImportableData,
  ]);

  const frameRect = useMemo(() => {
    const safeTop = isMobile ? 26 : 34;
    const safeBottom = isMobile ? 82 : 98;
    const safeSide = isMobile ? 16 : 34;

    const availableWidth = Math.max(180, (viewerSize.width || 680) - safeSide * 2);
    const availableHeight = Math.max(180, (viewerSize.height || 420) - safeTop - safeBottom);
    return getAspectFitRect(availableWidth, availableHeight, selectedAspectRatio);
  }, [viewerSize, selectedAspectRatio, isMobile]);

  const controlFrameRect = useMemo(
    () => getAspectFitRect(viewerSize.width || 680, viewerSize.height || 420, selectedAspectRatio),
    [viewerSize, selectedAspectRatio],
  );

  const resolved = useMemo(() => resolveKeywords(phi, theta, r, PERSON_SUBJECT), [phi, theta, r]);
  const isPromptKR = promptLang === "kr";
  const isSentenceMode = promptFormat === "sentence";

  const subjectWorldPoint = useMemo(
    () => ({
      x: subjectPos.x * SUBJECT_POSITION_SCALE,
      y: -subjectPos.y * SUBJECT_POSITION_SCALE,
      z: 0,
    }),
    [subjectPos],
  );

  const subjectAnchorPercent = useMemo(
    () =>
      getProjectedFramePercent({
        worldPoint: subjectWorldPoint,
        phi,
        theta,
        r,
        viewerSize,
        frameRect: controlFrameRect,
        fallback: {
          x: ((subjectPos.x + 1) / 2) * 100,
          y: ((subjectPos.y + 1) / 2) * 100,
        },
      }),
    [subjectWorldPoint, phi, theta, r, viewerSize, controlFrameRect, subjectPos],
  );

  const compositionPosition = useMemo(
    () => ({
      x: clamp(subjectAnchorPercent.x / 50 - 1, -1, 1),
      y: clamp(subjectAnchorPercent.y / 50 - 1, -1, 1),
    }),
    [subjectAnchorPercent],
  );

  const gazeKr = useMemo(() => getGazeKeyword(gazeVector, true, theta), [gazeVector, theta]);
  const gazeEn = useMemo(() => getGazeKeyword(gazeVector, false, theta), [gazeVector, theta]);

  const compositionKr = useMemo(() => getCompositionKeyword(compositionPosition, true), [compositionPosition]);
  const compositionEn = useMemo(() => getCompositionKeyword(compositionPosition, false), [compositionPosition]);

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
  const qualityPromptHint = useMemo(
    () => getQualityPromptHint(qualityPresetLevel, isPromptKR),
    [qualityPresetLevel, isPromptKR],
  );
  const resolvedCustomPromptHint = useMemo(
    () => joinPromptHints(appliedCustomPromptHint, qualityPromptHint),
    [appliedCustomPromptHint, qualityPromptHint],
  );

  const upgradeBaseContextKey = useMemo(
    () =>
      JSON.stringify({
        promptLang,
        subjectForPrompt,
        shotText,
        heightText,
        directionText,
        gazeText,
        compositionText,
        customPromptHint: appliedCustomPromptHint,
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
      appliedCustomPromptHint,
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
        custom: resolvedCustomPromptHint,
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
      resolvedCustomPromptHint,
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
        custom: resolvedCustomPromptHint,
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
      resolvedCustomPromptHint,
      ratioFramingText,
      selectedAr.value,
      includeAngleInPrompt,
    ],
  );

  const upgradedPromptSegments = useMemo(() => {
    if (!apiUpgradeResult || apiUpgradeResult.contextKey !== upgradeBaseContextKey) {
      return localUpgradedPromptSegments;
    }
    return buildPromptSegments({
      subjectText: apiUpgradeResult.subjectText || subjectForPrompt,
      shot: shotText,
      height: heightText,
      direction: directionText,
      gaze: gazeText,
      composition: compositionText,
      custom: joinPromptHints(apiUpgradeResult.customText, qualityPromptHint),
      ratioFraming: ratioFramingText,
      arValue: selectedAr.value,
      includeAngle: includeAngleInPrompt,
    });
  }, [
    apiUpgradeResult,
    upgradeBaseContextKey,
    localUpgradedPromptSegments,
    subjectForPrompt,
    shotText,
    heightText,
    directionText,
    gazeText,
    compositionText,
    qualityPromptHint,
    ratioFramingText,
    selectedAr.value,
    includeAngleInPrompt,
  ]);

  const keywordDisplayPrompt = toPromptText(promptSegments);
  const keywordUpgradedDisplayPrompt = toPromptText(upgradedPromptSegments);
  const sentenceDisplayPrompt = toSentenceText(promptSegments, promptLang);
  const sentenceUpgradedDisplayPrompt = toSentenceText(upgradedPromptSegments, promptLang);
  const displayPrompt = isSentenceMode ? sentenceDisplayPrompt : keywordDisplayPrompt;
  const upgradedDisplayPrompt = isSentenceMode ? sentenceUpgradedDisplayPrompt : keywordUpgradedDisplayPrompt;
  const canUpgradePrompt = Boolean(
    keywordDisplayPrompt &&
      keywordUpgradedDisplayPrompt &&
      keywordDisplayPrompt.toLowerCase() !== keywordUpgradedDisplayPrompt.toLowerCase(),
  );
  const isUpgradedPromptSelected = promptVariant === "upgraded" && canUpgradePrompt;
  const activePromptSegments = isUpgradedPromptSelected ? upgradedPromptSegments : promptSegments;
  const displayPromptSegments = useMemo(
    () => buildDisplayPromptSegments(activePromptSegments, qualityPromptHint),
    [activePromptSegments, qualityPromptHint],
  );
  const activeDisplayPrompt = isUpgradedPromptSelected ? upgradedDisplayPrompt : displayPrompt;
  const awkwardWords = isPromptKR ? [] : detectAwkwardExpressions(activeDisplayPrompt);
  const promptHelperText = promptValidationError
    ? promptValidationError
    : qualityPresetLevel
      ? isPromptKR
        ? `화질 프리셋 ${qualityPresetLevel}이 프롬프트에 반영됩니다.`
        : `Quality preset ${qualityPresetLevel} is applied to the prompt.`
      : isPromptKR
        ? "1~5 버튼을 눌러 화질 프롬프트를 프롬프트에 반영하세요."
        : "Use 1-5 to apply image-quality prompt presets.";

  useEffect(() => {
    if (promptVariant === "upgraded" && !canUpgradePrompt) {
      setPromptVariant("base");
    }
  }, [promptVariant, canUpgradePrompt]);

  useEffect(() => {
    if (apiUpgradeResult?.contextKey === upgradeBaseContextKey) return;
    setPromptVariant("base");
    setUpgradeNotice("");
  }, [apiUpgradeResult, upgradeBaseContextKey]);

  useEffect(() => {
    if (!isLibraryOpen) return;
    libraryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [isLibraryOpen]);

  const updateSubjectPositionFromPointer = (clientX, clientY) => {
    if (!frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const percentX = ((clientX - rect.left) / rect.width) * 100;
    const percentY = ((clientY - rect.top) / rect.height) * 100;

    const worldPoint = getWorldPointOnSubjectPlane({
      percentX,
      percentY,
      phi: phiRef.current,
      theta: thetaRef.current,
      r: rRef.current,
      viewerSize,
      frameRect: controlFrameRect,
    });

    if (!worldPoint) return;

    setSubjectPos({
      x: clamp(worldPoint.x / SUBJECT_POSITION_SCALE, SUBJECT_POS_MIN, SUBJECT_POS_MAX),
      y: clamp(-worldPoint.y / SUBJECT_POSITION_SCALE, SUBJECT_POS_MIN, SUBJECT_POS_MAX),
    });
  };

  const updateGazeFromPointer = (clientX, clientY) => {
    if (!frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const faceAnchor = getFaceAnchorPercent({
      subjectPos: subjectPosRef.current,
      phi: phiRef.current,
      theta: thetaRef.current,
      r: rRef.current,
      viewerSize,
      frameRect: controlFrameRect,
    });
    const anchorX = rect.left + (faceAnchor.x / 100) * rect.width;
    const anchorY = rect.top + (faceAnchor.y / 100) * rect.height;
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
      setTranslateError("주체 고정이 켜져 있어 입력을 진행할 수 없습니다.");
      trackEvent("subject_translate_blocked", { reason: "subject_locked" });
      return;
    }

    const value = subjectText.trim();

    if (!value) {
      setTranslateError("주체를 먼저 입력해 주세요.");
      trackEvent("subject_translate_blocked", { reason: "empty_subject" });
      return;
    }

    const containsKorean = hasKorean(value);
    trackProductEvent(PRODUCT_ANALYTICS_EVENTS.SUBJECT_INPUT_SUBMITTED, {
      input_length: value.length,
      contains_korean: containsKorean,
    });

    if (!containsKorean) {
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
      setTranslateError(error?.message || "입력 처리 중 오류가 발생했습니다.");
      trackEvent("subject_translate_failed", {
        latencyMs: Date.now() - startedAt,
        message: error?.message || "unknown_error",
      });
    }

    setTranslating(false);
  };

  const copyPrompt = async () => {
    trackProductEvent(PRODUCT_ANALYTICS_EVENTS.PROMPT_COPY_CLICKED, {
      has_prompt: Boolean(activeDisplayPrompt),
      has_validation_error: Boolean(promptValidationError),
      variant: isUpgradedPromptSelected ? "upgraded" : "base",
      format: promptFormat,
    });

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
        format: promptFormat,
      }, storageScope);
      setPromptHistory(nextHistory);
      syncPromptHistoryRemote(nextHistory, "copy_prompt");
      if (didLastHistoryWriteFail()) {
        setTranslateError("저장 공간 제한으로 히스토리를 저장하지 못했습니다.");
      }
      trackEvent("prompt_history_saved", {
        source: "auto",
        count: nextHistory.length,
        lang: promptLang,
        format: promptFormat,
      });
      trackEvent("prompt_copied", {
        method: "clipboard_api",
        lang: promptLang,
        variant: isUpgradedPromptSelected ? "upgraded" : "base",
        format: promptFormat,
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
          format: promptFormat,
        }, storageScope);
        setPromptHistory(nextHistory);
        syncPromptHistoryRemote(nextHistory, "copy_prompt_fallback");
        if (didLastHistoryWriteFail()) {
          setTranslateError("저장 공간 제한으로 히스토리를 저장하지 못했습니다.");
        }
        trackEvent("prompt_history_saved", {
          source: "auto",
          count: nextHistory.length,
          lang: promptLang,
          format: promptFormat,
        });
        trackEvent("prompt_copied", {
          method: "exec_command",
          lang: promptLang,
          variant: isUpgradedPromptSelected ? "upgraded" : "base",
          format: promptFormat,
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
      format: promptFormat,
    }, storageScope);
    setPromptHistory(nextHistory);
    syncPromptHistoryRemote(nextHistory, "save_prompt_history");
    if (didLastHistoryWriteFail()) {
      setTranslateError("저장 공간 제한으로 히스토리를 저장하지 못했습니다.");
    }
    trackEvent("prompt_history_saved", {
      source: "manual",
      count: nextHistory.length,
      lang: promptLang,
      variant: isUpgradedPromptSelected ? "upgraded" : "base",
      format: promptFormat,
    });
  };

  const applyAccountCameraDefaults = useCallback(
    (source = "manual") => {
      if (!hasSavedCameraDefaults) {
        setEnvironmentDefaultNotice("저장된 계정 기본 카메라가 없습니다.");
        return;
      }

      setPhi(accountCameraDefaults.phi);
      setTheta(accountCameraDefaults.theta);
      setR(accountCameraDefaults.r);
      setSubjectPos(accountCameraDefaults.subjectPos);
      setGazeVector(accountCameraDefaults.gazeVector);
      setArPresetId(accountCameraDefaults.arPresetId);
      setIncludeAngleInPrompt(accountCameraDefaults.includeAngleInPrompt);
      setQualityPresetLevel(accountCameraDefaults.qualityPresetLevel);
      setEnvironmentDefaultNotice("계정 기본 카메라를 불러왔습니다.");
      trackEvent("account_camera_defaults_applied", {
        screen: "interactive",
        source,
      });
    },
    [accountCameraDefaults, hasSavedCameraDefaults],
  );

  const saveCurrentCameraAsAccountDefault = useCallback(() => {
    if (typeof onAccountEnvironmentChange !== "function") {
      setEnvironmentDefaultNotice("계정 환경 저장 경로를 찾지 못했습니다.");
      return;
    }

    onAccountEnvironmentChange(
      {
        ...(accountEnvironment || {}),
        interactiveDefaults: {
          ...(accountEnvironment?.interactiveDefaults || {}),
          cameraDefaults: {
            phi,
            theta,
            r,
            subjectPos,
            gazeVector,
            arPresetId,
            includeAngleInPrompt,
            qualityPresetLevel,
            updatedAt: Date.now(),
          },
        },
      },
      { touchUpdatedAt: false },
    );
    setEnvironmentDefaultNotice("현재 카메라를 계정 기본값으로 저장했습니다.");
    trackEvent("account_camera_defaults_saved", {
      screen: "interactive",
      ratioId: arPresetId,
      quality_preset_level: qualityPresetLevel || 0,
      include_angle: includeAngleInPrompt,
    });
  }, [
    accountEnvironment,
    arPresetId,
    gazeVector,
    includeAngleInPrompt,
    onAccountEnvironmentChange,
    phi,
    qualityPresetLevel,
    r,
    subjectPos,
    theta,
  ]);

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
    }, storageScope);
    setUserPresets(next);
    syncUserPresetsRemote(next, "save_preset");
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
    const nextRatioId = AR_PRESETS.some((item) => item.id === preset.arPresetId) ? preset.arPresetId : "ar916";
    setArPresetId(nextRatioId);
    trackEvent("preset_applied", {
      presetId: preset.id,
      ratioId: nextRatioId,
    });
  };

  const handleRenamePreset = (preset) => {
    if (typeof window === "undefined") return;
    const nextName = window.prompt("프리셋 이름", preset.name || "");
    if (nextName == null) return;
    const renamed = renameUserPreset(preset.id, nextName, storageScope);
    setUserPresets(renamed);
    syncUserPresetsRemote(renamed, "rename_preset");
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
    const next = removeUserPreset(presetId, storageScope);
    setUserPresets(next);
    syncUserPresetsRemote(next, "remove_preset");
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
    const next = clearUserPresets(storageScope);
    setUserPresets(next);
    syncUserPresetsRemote(next, "reset_presets");
    if (didLastUserPresetWriteFail()) {
      setTranslateError("저장 공간 제한으로 프리셋 초기화에 실패했습니다.");
      return;
    }
    trackEvent("preset_reset_all", { count: next.length });
  };

  const handleRemoveHistoryItem = (itemId) => {
    const next = removePromptHistory(itemId, storageScope);
    setPromptHistory(next);
    syncPromptHistoryRemote(next, "remove_history_item");
    if (didLastHistoryWriteFail()) {
      setTranslateError("저장 공간 제한으로 히스토리 삭제에 실패했습니다.");
      return;
    }
    trackEvent("prompt_history_removed", {
      itemId,
      count: next.length,
    });
  };

  const handleResetPromptHistory = () => {
    const next = clearPromptHistory(storageScope);
    setPromptHistory(next);
    syncPromptHistoryRemote(next, "reset_prompt_history");
    if (didLastHistoryWriteFail()) {
      setTranslateError("저장 공간 제한으로 히스토리 초기화에 실패했습니다.");
      return;
    }
    trackEvent("prompt_history_reset_all", { count: next.length });
  };

  const handleCopyHistoryItem = async (item) => {
    try {
      await navigator.clipboard.writeText(item.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
      trackEvent("prompt_history_copied", {
        itemId: item.id,
        lang: item.lang || "en",
        format: item.format || "keyword",
      });
    } catch {
      setTranslateError("히스토리 복사에 실패했어요.");
      trackEvent("prompt_history_copy_failed", { itemId: item.id });
    }
  };

  const handleUpgradePrompt = async () => {
    if (!keywordDisplayPrompt || promptValidationError) {
      setUpgradeNotice(isPromptKR ? "먼저 유효한 프롬프트를 생성해 주세요." : "Generate a valid prompt first.");
      return;
    }
    if (upgradeLoading) {
      return;
    }

    const startedAt = Date.now();
    const nextAppliedCustomPromptHint = joinPromptHints(appliedCustomPromptHint, customPromptHint);
    const nextResolvedCustomPromptHint = joinPromptHints(nextAppliedCustomPromptHint, qualityPromptHint);
    const nextUpgradeBaseContextKey = JSON.stringify({
      promptLang,
      subjectForPrompt,
      shotText,
      heightText,
      directionText,
      gazeText,
      compositionText,
      customPromptHint: nextAppliedCustomPromptHint,
      ratioFramingText,
      arValue: selectedAr.value,
      includeAngleInPrompt,
    });
    setUpgradeLoading(true);
    setUpgradeNotice(isPromptKR ? "다듬기 API 실행 중..." : "Refining with API...");

    try {
      const data = await requestPromptRefine({
        accessToken,
        payload: {
          lang: promptLang,
          subjectText: subjectForPrompt,
          customText: nextResolvedCustomPromptHint,
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
      const rawRefinedCustomText = String(data?.customText || "").trim();
      const refinedCustomBaseText = rawRefinedCustomText
        ? splitCustomQualityText(rawRefinedCustomText, qualityPromptHint).customText
        : nextAppliedCustomPromptHint;
      const refinedCustomText = joinPromptHints(refinedCustomBaseText, qualityPromptHint) || nextResolvedCustomPromptHint;
      const nextBaseSegments = buildPromptSegments({
        subjectText: subjectForPrompt,
        shot: shotText,
        height: heightText,
        direction: directionText,
        gaze: gazeText,
        composition: compositionText,
        custom: nextResolvedCustomPromptHint,
        ratioFraming: ratioFramingText,
        arValue: selectedAr.value,
        includeAngle: includeAngleInPrompt,
      });
      const nextBasePrompt = toPromptText(nextBaseSegments);
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
      const changed = Boolean(refinedPrompt && refinedPrompt.toLowerCase() !== nextBasePrompt.toLowerCase());

      setAppliedCustomPromptHint(nextAppliedCustomPromptHint);
      setCustomPromptHint("");

      setApiUpgradeResult({
        contextKey: nextUpgradeBaseContextKey,
        subjectText: refinedSubjectText,
        customText: refinedCustomBaseText,
      });

      if (changed) {
        setPromptLang(inferPromptLanguageFromText(refinedPrompt, promptLang));
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

      trackProductEvent(PRODUCT_ANALYTICS_EVENTS.CUSTOM_PROMPT_ADDED, {
        custom_prompt_length: String(nextAppliedCustomPromptHint || "").length,
        quality_preset_level: qualityPresetLevel || 0,
        changed,
      });
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

  const handlePromptFormatChange = (nextFormat) => {
    if (!nextFormat || nextFormat === promptFormat) return;
    setPromptFormat(nextFormat);
    trackEvent("prompt_format_changed", { format: nextFormat });
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

  const handleSubjectEdit = () => {
    const wasLocked = isSubjectLocked;
    setIsSubjectToolbarOpen(true);
    if (wasLocked) {
      setIsSubjectLocked(false);
      setTranslateError("");
    }
    trackEvent("subject_edit_clicked", { wasLocked });
    setTimeout(() => {
      subjectInputRef.current?.focus();
      subjectInputRef.current?.select();
    }, 0);
  };

  const handleResetSubject = () => {
    setIsSubjectToolbarOpen(true);
    setSubjectText("");
    setSubjectKorean("");
    setSubjectEnglish("");
    setLockedSubject({ kr: "", en: "" });
    setIsSubjectLocked(false);
    setTranslateError("");
    setCustomPromptHint("");
    setAppliedCustomPromptHint("");
    setQualityPresetLevel(0);
    setApiUpgradeResult(null);
    setPromptVariant("base");
    setUpgradeNotice(isPromptKR ? "주체/수정내용을 초기화했습니다." : "Subject/custom hints were reset.");
    trackEvent("subject_reset_clicked", { resetCustomHint: true });
    setTimeout(() => {
      subjectInputRef.current?.focus();
    }, 0);
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

  const handleQualityPresetSelect = (level) => {
    setQualityPresetLevel((prev) => {
      const next = prev === level ? 0 : level;
      trackProductEvent(PRODUCT_ANALYTICS_EVENTS.PRESET_CLICKED, {
        preset_level: level,
        selected_level: next,
      });
      trackEvent("prompt_quality_preset_changed", { level: next });
      return next;
    });
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

  const handleAngleSliderChange = (nextValue) => {
    const nextPhi = clamp(Number(nextValue), 1, 179);
    phiRef.current = nextPhi;
    setPhi(nextPhi);
    trackProductEvent(PRODUCT_ANALYTICS_EVENTS.ANGLE_SLIDER_CHANGED, {
      slider_value: nextPhi,
    });
  };

  const handleDirectionSliderChange = (nextValue) => {
    const nextTheta = clamp(Number(nextValue), -180, 180);
    thetaRef.current = nextTheta;
    setTheta(nextTheta);
    trackProductEvent(PRODUCT_ANALYTICS_EVENTS.DIRECTION_SLIDER_CHANGED, {
      slider_value: nextTheta,
    });
  };

  const handleDistanceSliderChange = (nextValue) => {
    const nextPercent = stepDistancePercent(nextValue, 0);
    setR(distancePercentToRadius(nextPercent));
    trackProductEvent(PRODUCT_ANALYTICS_EVENTS.DISTANCE_SLIDER_CHANGED, {
      slider_value: nextPercent,
    });
  };

  const handleResetActiveMobileCameraSlider = () => {
    if (!activeMobileCameraSliderKey) return;

    if (activeMobileCameraSliderKey === "angle") {
      handleAngleSliderChange(DEFAULT_ACCOUNT_CAMERA_DEFAULTS.phi);
    } else if (activeMobileCameraSliderKey === "direction") {
      handleDirectionSliderChange(DEFAULT_ACCOUNT_CAMERA_DEFAULTS.theta);
    } else if (activeMobileCameraSliderKey === "distance") {
      handleDistanceSliderChange(toShotDistancePercent(DEFAULT_ACCOUNT_CAMERA_DEFAULTS.r));
    }

    trackEvent("mobile_camera_slider_reset", {
      screen: "interactive",
      slider: activeMobileCameraSliderKey,
    });
  };

  const handleResetAllMobileCameraSliders = () => {
    handleAngleSliderChange(DEFAULT_ACCOUNT_CAMERA_DEFAULTS.phi);
    handleDirectionSliderChange(DEFAULT_ACCOUNT_CAMERA_DEFAULTS.theta);
    handleDistanceSliderChange(toShotDistancePercent(DEFAULT_ACCOUNT_CAMERA_DEFAULTS.r));
    setActiveMobileCameraSliderKey(null);

    trackEvent("mobile_camera_sliders_reset_all", {
      screen: "interactive",
    });
  };

  const handleToggleLibrary = () => {
    setIsLibraryOpen((prev) => {
      const next = !prev;
      trackEvent("library_toggled", { open: next });
      return next;
    });
  };

  useEffect(() => {
    if (!isViewerActive) return;

    let cleanup = () => {};
    let mounted = true;

    const init = async () => {
      const THREE = await loadThreeRuntime();
      if (!mounted || !mountRef.current) return;
      const wheelTarget = viewerRef.current;
      if (!wheelTarget) return;

      const width = mountRef.current.clientWidth || 320;
      const height = mountRef.current.clientHeight || 320;
      const renderConfig = getViewerRenderConfig({
        isMobile,
        devicePixelRatio: window.devicePixelRatio,
      });

      const scene = new THREE.Scene();

      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
      camera.position.set(0, 0, 6);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance",
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(renderConfig.pixelRatio);
      mountRef.current.appendChild(renderer.domElement);

      const ambient = new THREE.AmbientLight(0x334466, 1.0);
      scene.add(ambient);
      const key = new THREE.DirectionalLight(0xffffff, 1.2);
      key.position.set(3, 5, 4);
      scene.add(key);

      const rim = new THREE.DirectionalLight(0x4466ff, 0.5);
      rim.position.set(-3, 2, -4);
      scene.add(rim);

      const sphereGeo = new THREE.SphereGeometry(
        SPHERE_RADIUS,
        renderConfig.sphereWidthSegments,
        renderConfig.sphereHeightSegments,
      );
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
      scene.add(
        new THREE.Mesh(
          new THREE.SphereGeometry(
            SPHERE_RADIUS,
            renderConfig.sphereWidthSegments,
            renderConfig.sphereHeightSegments,
          ),
          innerMat,
        ),
      );

      const subjectObject = buildSubjectObject(THREE, PERSON_SUBJECT.object, scene);

      const updateCamera = () => {
        const pRad = (phiRef.current * Math.PI) / 180;
        const tRad = (thetaRef.current * Math.PI) / 180;
        const viewR = getCameraDistance(rRef.current);

        const x = viewR * Math.sin(pRad) * Math.sin(tRad);
        const y = viewR * Math.cos(pRad);
        const z = viewR * Math.sin(pRad) * Math.cos(tRad);

        camera.position.set(x, y, z);
        if (phiRef.current < 5 || phiRef.current > 175) {
          camera.up.set(0, 0, phiRef.current < 90 ? -1 : 1);
        } else {
          camera.up.set(0, 1, 0);
        }
        camera.lookAt(0, getCameraLookAtY(rRef.current), 0);
      };

      const updateSubjectOffset = () => {
        subjectObject.position.x = subjectPosRef.current.x * SUBJECT_POSITION_SCALE;
        subjectObject.position.y = -subjectPosRef.current.y * SUBJECT_POSITION_SCALE;
      };

      const onResize = () => {
        if (!mountRef.current) return;
        const w = mountRef.current.clientWidth || 320;
        const h = mountRef.current.clientHeight || 320;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        renderer.setPixelRatio(renderConfig.pixelRatio);
      };

      const getPos = (event) => {
        if (event.touches) return { x: event.touches[0].clientX, y: event.touches[0].clientY };
        return { x: event.clientX, y: event.clientY };
      };

      const onDown = (event) => {
        if (event.button !== undefined && event.button !== 0) return;
        if (isDraggingCamera.current) return;
        isDraggingCamera.current = true;
        lastMouse.current = getPos(event);
        const startPhi = Math.round(phiRef.current);
        const startTheta = Math.round(thetaRef.current);
        const startDistance = toShotDistancePercent(rRef.current);
        cameraDragMetaRef.current = {
          startedAt: Date.now(),
          startPhi,
          startTheta,
          startDistance,
        };
        trackEvent(PRODUCT_ANALYTICS_EVENTS.CAMERA_DRAG_STARTED, {
          screen: "interactive",
          aspect_ratio: aspectRatioRef.current,
          language_mode: promptLangRef.current,
          angle_value: startPhi,
          direction_value: startTheta,
          distance_value: startDistance,
        });
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
        if (!isDraggingCamera.current) return;
        isDraggingCamera.current = false;
        const meta = cameraDragMetaRef.current;
        cameraDragMetaRef.current = null;
        trackEvent(PRODUCT_ANALYTICS_EVENTS.CAMERA_DRAG_COMPLETED, {
          screen: "interactive",
          aspect_ratio: aspectRatioRef.current,
          language_mode: promptLangRef.current,
          angle_value: Math.round(phiRef.current),
          direction_value: Math.round(thetaRef.current),
          distance_value: toShotDistancePercent(rRef.current),
          drag_duration_ms: meta?.startedAt ? Date.now() - meta.startedAt : undefined,
        });
      };

      const onWheel = (event) => {
        if (!shouldCaptureViewerWheel({ event, wheelTarget })) return;
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
      wheelTarget.addEventListener("wheel", onWheel, { passive: false });
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
        wheelTarget.removeEventListener("wheel", onWheel);
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
  }, [isViewerActive, isMobile]);

  const gazeRadius = useMemo(() => getGazeRadius(frameRect), [frameRect]);
  const positionPercentX = subjectAnchorPercent.x;
  const positionPercentY = subjectAnchorPercent.y;
  const faceAnchorPercent = useMemo(
    () =>
      getFaceAnchorPercent({
        subjectPos,
        phi,
        theta,
        r,
        viewerSize,
        frameRect: controlFrameRect,
      }),
    [subjectPos, phi, theta, r, viewerSize, controlFrameRect],
  );
  const facePercentX = faceAnchorPercent.x;
  const facePercentY = faceAnchorPercent.y;
  const gazeDx = gazeVector.x * gazeRadius;
  const gazeDy = gazeVector.y * gazeRadius;
  const gazeLength = Math.hypot(gazeDx, gazeDy);
  const gazeAngle = (Math.atan2(gazeDy, gazeDx) * 180) / Math.PI;
  const gazeHandleAngle = gazeLength > 2 ? gazeAngle : 0;
  const angleAxisColor = includeAngleInPrompt ? HEIGHT_ACCENT : "#6f7787";
  const directionAxisColor = includeAngleInPrompt ? DIRECTION_UI_ACCENT : "#6f7787";
  const shotDistancePercent = toShotDistancePercent(r);
  const viewerDescriptorItems = [
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
  ];
  const mobileCameraSliderItems = [
    {
      key: "angle",
      label: isPromptKR ? "앵글" : "ANGLE",
      value: `${Math.round(phi)}°`,
      helper: isPromptKR ? "높이" : "height",
      topHint: isPromptKR ? "높게" : "higher",
      midHint: isPromptKR ? "눈높이" : "eye",
      bottomHint: isPromptKR ? "낮게" : "lower",
      min: 1,
      max: 179,
      sliderValue: Math.round(phi),
      accentColor: angleAxisColor,
      ariaLabel: isPromptKR ? "앵글 조절" : "Adjust angle",
      onChange: handleAngleSliderChange,
    },
    {
      key: "direction",
      label: isPromptKR ? "방향" : "DIRECTION",
      value: `${Math.round(theta)}°`,
      helper: isPromptKR ? "회전" : "turn",
      topHint: isPromptKR ? "오른쪽" : "right",
      midHint: isPromptKR ? "정면" : "front",
      bottomHint: isPromptKR ? "왼쪽" : "left",
      min: -180,
      max: 180,
      sliderValue: Math.round(theta),
      accentColor: directionAxisColor,
      ariaLabel: isPromptKR ? "방향 조절" : "Adjust direction",
      onChange: handleDirectionSliderChange,
    },
    {
      key: "distance",
      label: isPromptKR ? "거리" : "DISTANCE",
      value: `${shotDistancePercent}%`,
      helper: shotText,
      topHint: isPromptKR ? "멀리" : "far",
      midHint: isPromptKR ? "중간" : "mid",
      bottomHint: isPromptKR ? "가깝게" : "near",
      min: 0,
      max: 100,
      sliderValue: shotDistancePercent,
      accentColor: SHOT_ACCENT,
      ariaLabel: isPromptKR ? "거리 조절" : "Adjust distance",
      ariaValueText: `${shotDistancePercent}% · ${shotText}`,
      onChange: handleDistanceSliderChange,
    },
  ];
  const activeMobileCameraSlider = mobileCameraSliderItems.find((item) => item.key === activeMobileCameraSliderKey) || null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: isMobile ? "auto" : "calc(100dvh - 130px)",
        minHeight: isMobile ? 0 : 580,
        background: "#1a1a1a",
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
          minHeight: isMobile ? undefined : "100%",
          boxSizing: "border-box",
          padding: density.shellPaddingClassic,
          gap: density.sectionGap,
        }}
      >

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: density.toolbarGap,
          flexWrap: isMobile ? "wrap" : "nowrap",
          padding: density.toolbarPaddingClassic,
          background: "#1a1a1a",
          borderBottom: "1px solid #1a2a4a",
        }}
      >
        {isSubjectToolbarOpen ? (
          <>
            <input
              ref={subjectInputRef}
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
                flex: isMobile ? "1 1 100%" : "0 0 470px",
                width: isMobile ? "100%" : 470,
                maxWidth: "100%",
                background: isSubjectLocked ? "#1f2530" : "#252525",
                border: "1px solid #2a3a6a",
                borderRadius: 10,
                padding: "10px 14px",
                color: isSubjectLocked ? "#9fb6d6" : "#e0ddd4",
                fontSize: 13,
                fontFamily: "sans-serif",
                outline: "none",
              }}
            />

            <button
              onClick={translateSubject}
              disabled={translating || isSubjectLocked}
              style={{
                background: translating || isSubjectLocked ? "#252525" : TRANSLATE_ACTION_BG,
                border: `1px solid ${translating || isSubjectLocked ? "#2a3a6a" : TRANSLATE_ACTION_BG}`,
                borderRadius: 10,
                color: translating || isSubjectLocked ? "#777" : "#1a1a1a",
                fontSize: 12,
                fontWeight: 800,
                padding: "10px 14px",
                cursor: translating || isSubjectLocked ? "default" : "pointer",
                fontFamily: "sans-serif",
                whiteSpace: "nowrap",
              }}
            >
              {translating ? "입력중..." : "입력"}
            </button>

            <button
              onClick={handleToggleSubjectLock}
              style={{
                background: isSubjectLocked ? withAlpha(SEGMENT_COLORS.subject, 0.25) : "#252525",
                border: `1px solid ${isSubjectLocked ? SEGMENT_COLORS.subject : "#2a3a6a"}`,
                borderRadius: 10,
                color: isSubjectLocked ? SEGMENT_COLORS.subject : "#9aa0ac",
                fontSize: 12,
                padding: "10px 14px",
                cursor: "pointer",
                fontFamily: "sans-serif",
                whiteSpace: "nowrap",
                fontWeight: 700,
              }}
            >
              {isSubjectLocked ? "주체 고정 ON" : "주체 고정 OFF"}
            </button>

            <button
              type="button"
              onClick={handleSubjectEdit}
              style={{
                background: "transparent",
                border: "1px solid #2a3a6a",
                borderRadius: 10,
                color: "#9aa0ac",
                fontSize: 12,
                padding: "10px 12px",
                cursor: "pointer",
                fontFamily: "sans-serif",
                whiteSpace: "nowrap",
                fontWeight: 700,
              }}
            >
              주체 수정
            </button>

            <button
              type="button"
              onClick={handleResetSubject}
              style={{
                background: "transparent",
                border: "1px solid #5f2f42",
                borderRadius: 10,
                color: "#ff9ab6",
                fontSize: 12,
                padding: "10px 12px",
                cursor: "pointer",
                fontFamily: "sans-serif",
                whiteSpace: "nowrap",
                fontWeight: 700,
              }}
            >
              주체 초기화
            </button>
          </>
        ) : null}

        <div style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div
            title={isPromptKR ? "비율 선택" : "Aspect ratio"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: 4,
              borderRadius: 10,
              border: `1px solid ${withAlpha(RATIO_ACCENT, 0.34)}`,
              background: "rgba(11,15,23,0.78)",
            }}
          >
            <span
              style={{
                color: withAlpha(RATIO_ACCENT, 0.88),
                fontSize: 10,
                fontFamily: "'Arial Black',sans-serif",
                fontWeight: 900,
                letterSpacing: "0.12em",
                padding: "0 6px",
                whiteSpace: "nowrap",
              }}
            >
              AR
            </span>
            {AR_PRESETS.map((preset) => {
              const isOn = arPresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleAspectRatioChange(preset.id)}
                  style={{
                    background: isOn ? RATIO_ACCENT : "transparent",
                    color: isOn ? "#111" : "#9aa0ac",
                    border: `1px solid ${isOn ? RATIO_ACCENT : "rgba(255,255,255,0.2)"}`,
                    borderRadius: 6,
                    padding: "6px 8px",
                    minWidth: 44,
                    cursor: "pointer",
                    fontFamily: "'Arial Black',sans-serif",
                    fontSize: 11,
                    fontWeight: 900,
                    lineHeight: 1,
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {translateError ? (
        <div
          style={{
            textAlign: "center",
            fontSize: 12,
            color: "#ff9ab6",
            fontFamily: "sans-serif",
            padding: density.buttonPaddingCompact,
          }}
        >
          {translateError}
        </div>
      ) : null}

      <div
        ref={viewerRef}
        style={{
          flex: 1,
          minHeight: density.viewerMinHeight,
          position: "relative",
          overflow: "hidden",
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
                width: 10,
                height: 10,
                borderRadius: "50%",
                border: `2px solid ${GAZE_ACCENT}`,
                background: withAlpha(GAZE_ACCENT, 0.22),
                boxShadow: `0 0 12px ${withAlpha(GAZE_ACCENT, 0.85)}`,
              }}
            />
            {gazeLength > 1 ? (
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
            <button
              type="button"
              onPointerDown={onGazePointerDown}
              onDoubleClick={() => setGazeVector({ x: 0, y: 0 })}
              title={isPromptKR ? "시선 화살표 드래그" : "Drag gaze arrow"}
              aria-label={isPromptKR ? "시선 조절" : "Adjust gaze"}
              style={{
                position: "absolute",
                left: `calc(${facePercentX}% + ${gazeDx}px)`,
                top: `calc(${facePercentY}% + ${gazeDy}px)`,
                transform: `translate(-50%, -50%) rotate(${gazeHandleAngle}deg)`,
                width: 24,
                height: 24,
                border: "none",
                background: "transparent",
                boxShadow: "none",
                cursor: "grab",
                pointerEvents: "auto",
                zIndex: 3,
                padding: 0,
                display: "grid",
                placeItems: "center",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 0,
                  height: 0,
                  borderTop: "6px solid transparent",
                  borderBottom: "6px solid transparent",
                  borderLeft: `12px solid ${GAZE_ACCENT}`,
                  filter: `drop-shadow(0 0 6px ${withAlpha(GAZE_ACCENT, 0.88)})`,
                }}
              />
            </button>
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                width: 2,
                height: "100%",
                background: "#ed688f",
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
                background: "#ed688f",
              }}
            />
          </div>
        </div>

        {!isMobile ? (
          <div
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
              width: density.floatingControlWidth,
              zIndex: 4,
            }}
          >
            <div
              style={{
                display: "grid",
                gap: density.floatingControlGap,
                padding: density.floatingControlPadding,
                borderRadius: 12,
                border: `1px solid ${withAlpha(directionAxisColor, 0.34)}`,
                background: "rgba(9,13,20,0.72)",
                boxShadow: `inset 0 0 0 1px ${withAlpha(angleAxisColor, 0.24)}`,
              }}
            >
              <span style={{ fontSize: 10, color: "#95a1b5", fontFamily: "sans-serif", fontWeight: 700, letterSpacing: "0.06em" }}>
                {isPromptKR ? "카메라 컨트롤" : "camera controls"}
              </span>

              <div style={{ display: "grid", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: angleAxisColor, fontFamily: "sans-serif", fontWeight: 800 }}>
                    {isPromptKR ? "앵글" : "ANGLE"}
                  </span>
                  <span style={{ fontSize: 10, color: angleAxisColor, fontFamily: "monospace", fontWeight: 700 }}>
                    {Math.round(phi)}°
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="179"
                  value={Math.round(phi)}
                  onChange={(event) => handleAngleSliderChange(event.target.value)}
                  style={{
                    width: "100%",
                    cursor: "pointer",
                    accentColor: angleAxisColor,
                  }}
                />
              </div>

              <div style={{ display: "grid", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: DIRECTION_TEXT_COLOR, fontFamily: "sans-serif", fontWeight: 800 }}>
                    {isPromptKR ? "방향" : "DIRECTION"}
                  </span>
                  <span style={{ fontSize: 10, color: DIRECTION_TEXT_COLOR, fontFamily: "monospace", fontWeight: 700 }}>
                    {Math.round(theta)}°
                  </span>
                </div>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  value={Math.round(theta)}
                  onChange={(event) => handleDirectionSliderChange(event.target.value)}
                  style={{
                    width: "100%",
                    cursor: "pointer",
                    accentColor: directionAxisColor,
                  }}
                />
              </div>

              <div style={{ display: "grid", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: SHOT_ACCENT, fontFamily: "sans-serif", fontWeight: 800 }}>
                    {isPromptKR ? "거리" : "DISTANCE"}
                  </span>
                  <span style={{ fontSize: 10, color: SHOT_ACCENT, fontFamily: "monospace", fontWeight: 700 }}>
                    {shotDistancePercent}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={shotDistancePercent}
                  onChange={(event) => handleDistanceSliderChange(event.target.value)}
                  onInput={(event) => handleDistanceSliderChange(event.currentTarget.value)}
                  aria-label={isPromptKR ? "거리 조절" : "Adjust distance"}
                  aria-valuetext={`${shotDistancePercent}% · ${shotText}`}
                  style={{
                    width: "100%",
                    cursor: "pointer",
                    accentColor: SHOT_ACCENT,
                    touchAction: "pan-x",
                  }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#7f90ab", fontFamily: "sans-serif" }}>
                  <span>{isPromptKR ? "가까움" : "near"}</span>
                  <span>{isPromptKR ? "멀리" : "far"}</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div
          style={{
            position: "absolute",
            left: 10,
            bottom: 10,
            display: "flex",
            gap: density.floatingChipGap,
            flexWrap: "wrap",
            maxWidth: isMobile ? "calc(100% - 20px)" : 740,
          }}
        >
          {!isMobile
            ? viewerDescriptorItems.map((item) => {
            const accentColor = item.disabled
              ? "#6f7787"
              : item.type === "direction"
                ? DIRECTION_UI_ACCENT
                : SEGMENT_COLORS[item.type] || "#5ce8ff";
            const textColor =
              item.disabled ? "#6f7787" : item.type === "direction" ? DIRECTION_TEXT_COLOR : accentColor;
            return (
            <div
              key={item.label}
              style={{
                background: withAlpha(accentColor, item.disabled ? 0.05 : 0.08),
                border: `1px solid ${withAlpha(accentColor, item.disabled ? 0.36 : 0.5)}`,
                borderRadius: 8,
                padding: density.floatingChipPadding,
              }}
            >
              <div style={{ fontSize: 9, color: textColor, fontFamily: "sans-serif", letterSpacing: "0.08em" }}>
                {item.label}
              </div>
              <div style={{ fontSize: 12, color: textColor, fontFamily: "sans-serif", fontWeight: 700 }}>
                {item.value}
              </div>
              {item.disabled ? (
                <div style={{ fontSize: 9, color: "#8a94a7", fontFamily: "sans-serif", marginTop: 2 }}>
                  {isPromptKR ? "프롬프트 제외" : "excluded"}
                </div>
              ) : null}
            </div>
            );
          })
            : null}
          {!isMobile ? (
            <div
              style={{
                background: withAlpha(
                  includeAngleInPrompt ? SEGMENT_COLORS.gaze : "#6f7787",
                  includeAngleInPrompt ? 0.08 : 0.05,
                ),
                border: `1px solid ${withAlpha(
                  includeAngleInPrompt ? SEGMENT_COLORS.gaze : "#6f7787",
                  includeAngleInPrompt ? 0.5 : 0.36,
                )}`,
                borderRadius: 8,
                padding: density.floatingChipPadding,
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  color: includeAngleInPrompt ? SEGMENT_COLORS.gaze : "#6f7787",
                  fontFamily: "sans-serif",
                  letterSpacing: "0.08em",
                }}
              >
                시선
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: includeAngleInPrompt ? SEGMENT_COLORS.gaze : "#6f7787",
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
          ) : null}
        </div>
      </div>

      {isMobile ? (
        <div
          style={{
            display: "grid",
            gap: 10,
            padding: "10px 12px 12px",
            borderRadius: 14,
            border: `1px solid ${withAlpha(directionAxisColor, 0.24)}`,
            background: "rgba(9,13,20,0.82)",
            boxShadow: `inset 0 0 0 1px ${withAlpha(angleAxisColor, 0.16)}`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <strong style={{ fontSize: 11, color: "#eef2fa", fontFamily: "sans-serif", letterSpacing: "0.04em" }}>
              {isPromptKR ? "카메라 조절" : "camera sliders"}
            </strong>
            <span style={{ fontSize: 10, color: "#95a1b5", fontFamily: "sans-serif" }}>
              {activeMobileCameraSlider
                ? isPromptKR
                  ? `현재 조절 · ${activeMobileCameraSlider.label} ${activeMobileCameraSlider.value}`
                  : `editing ${activeMobileCameraSlider.label} ${activeMobileCameraSlider.value}`
                : isPromptKR
                  ? "구 아래 세로 슬라이더"
                  : "vertical sliders below"}
            </span>
          </div>

          {activeMobileCameraSlider ? (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleResetActiveMobileCameraSlider}
                style={{
                  minHeight: 28,
                  padding: "0 10px",
                  borderRadius: 999,
                  border: `1px solid ${withAlpha(activeMobileCameraSlider.accentColor, 0.34)}`,
                  background: withAlpha(activeMobileCameraSlider.accentColor, 0.12),
                  color: activeMobileCameraSlider.accentColor,
                  fontSize: 10,
                  fontFamily: "sans-serif",
                  fontWeight: 800,
                  cursor: "pointer",
                  touchAction: "manipulation",
                }}
              >
                {isPromptKR ? "이 항목 기본값" : "reset item"}
              </button>
              <button
                type="button"
                onClick={handleResetAllMobileCameraSliders}
                style={{
                  minHeight: 28,
                  padding: "0 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(154,173,203,0.22)",
                  background: "rgba(154,173,203,0.08)",
                  color: "#d7e0ee",
                  fontSize: 10,
                  fontFamily: "sans-serif",
                  fontWeight: 800,
                  cursor: "pointer",
                  touchAction: "manipulation",
                }}
              >
                {isPromptKR ? "전체 기본값" : "reset all"}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={handleResetAllMobileCameraSliders}
                style={{
                  minHeight: 28,
                  padding: "0 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(154,173,203,0.22)",
                  background: "rgba(154,173,203,0.08)",
                  color: "#d7e0ee",
                  fontSize: 10,
                  fontFamily: "sans-serif",
                  fontWeight: 800,
                  cursor: "pointer",
                  touchAction: "manipulation",
                }}
              >
                {isPromptKR ? "전체 기본값" : "reset all"}
              </button>
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "7px 9px",
              borderRadius: 10,
              border: `1px solid ${withAlpha(includeAngleInPrompt ? GAZE_ACCENT : "#6f7787", includeAngleInPrompt ? 0.28 : 0.18)}`,
              background: withAlpha(includeAngleInPrompt ? GAZE_ACCENT : "#6f7787", includeAngleInPrompt ? 0.08 : 0.04),
            }}
          >
            <div style={{ display: "grid", gap: 2 }}>
              <span
                style={{
                  fontSize: 9,
                  color: includeAngleInPrompt ? GAZE_ACCENT : "#7f90ab",
                  fontFamily: "sans-serif",
                  fontWeight: 800,
                  letterSpacing: "0.05em",
                }}
              >
                {isPromptKR ? "시선 상태" : "gaze status"}
              </span>
              <strong
                style={{
                  fontSize: 11,
                  color: includeAngleInPrompt ? GAZE_ACCENT : "#8fa1b9",
                  fontFamily: "sans-serif",
                  fontWeight: 700,
                  lineHeight: 1.3,
                }}
              >
                {isPromptKR ? gazeKr : gazeEn}
              </strong>
            </div>
            {!includeAngleInPrompt ? (
              <span
                style={{
                  fontSize: 9,
                  color: "#7f90ab",
                  fontFamily: "sans-serif",
                  lineHeight: 1.25,
                  textAlign: "right",
                }}
              >
                {isPromptKR ? "프롬프트 제외" : "excluded"}
              </span>
            ) : null}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            {mobileCameraSliderItems.map((item) => (
              <div
                key={item.key}
                style={{
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 6px 12px",
                  borderRadius: 12,
                  border: `1px solid ${withAlpha(item.accentColor, item.key === activeMobileCameraSliderKey ? 0.52 : 0.24)}`,
                  background: withAlpha(item.accentColor, item.key === activeMobileCameraSliderKey ? 0.14 : 0.08),
                  boxShadow:
                    item.key === activeMobileCameraSliderKey
                      ? `0 0 0 1px ${withAlpha(item.accentColor, 0.18)}, inset 0 0 20px ${withAlpha(item.accentColor, 0.08)}`
                      : "none",
                }}
              >
                <div style={{ display: "grid", gap: 3, justifyItems: "center", textAlign: "center" }}>
                  <span
                    style={{
                      fontSize: 9,
                      color: item.accentColor,
                      fontFamily: "sans-serif",
                      fontWeight: 800,
                      letterSpacing: "0.05em",
                    }}
                  >
                    {item.label}
                  </span>
                  <strong
                    style={{
                      fontSize: 11,
                      color: "#eef2fa",
                      fontFamily: "sans-serif",
                      fontWeight: 700,
                      lineHeight: 1.2,
                    }}
                  >
                    {item.value}
                  </strong>
                  <span
                    style={{
                      fontSize: 9,
                      color: "#95a1b5",
                      fontFamily: "sans-serif",
                      lineHeight: 1.2,
                    }}
                  >
                    {item.helper}
                  </span>
                </div>
                <div style={{ display: "grid", gap: 5, justifyItems: "center" }}>
                  <span
                    style={{
                      fontSize: 8,
                      color: item.accentColor,
                      fontFamily: "sans-serif",
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    {item.topHint}
                  </span>
                  <div
                    style={{
                      position: "relative",
                      width: 40,
                      padding: "7px 0",
                      borderRadius: 999,
                      border: `1px solid ${withAlpha(item.accentColor, 0.18)}`,
                      background: withAlpha(item.accentColor, 0.05),
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <div
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        inset: "8px 7px",
                        pointerEvents: "none",
                      }}
                    >
                      {["8%", "50%", "92%"].map((top, index) => (
                        <span
                          key={`${item.key}-tick-${top}`}
                          style={{
                            position: "absolute",
                            left: "50%",
                            top,
                            width: index === 1 ? 16 : 10,
                            height: 1,
                            borderRadius: 999,
                            background: withAlpha(item.accentColor, index === 1 ? 0.5 : 0.26),
                            transform: "translate(-50%, -50%)",
                          }}
                        />
                      ))}
                    </div>
                    <input
                      type="range"
                      min={item.min}
                      max={item.max}
                      value={item.sliderValue}
                      onPointerDown={() => setActiveMobileCameraSliderKey(item.key)}
                      onFocus={() => setActiveMobileCameraSliderKey(item.key)}
                      onChange={(event) => {
                        setActiveMobileCameraSliderKey(item.key);
                        item.onChange(event.target.value);
                      }}
                      onInput={(event) => {
                        setActiveMobileCameraSliderKey(item.key);
                        item.onChange(event.currentTarget.value);
                      }}
                      aria-label={item.ariaLabel}
                      aria-valuetext={item.ariaValueText}
                      style={{
                        WebkitAppearance: "slider-vertical",
                        writingMode: "vertical-lr",
                        direction: "rtl",
                        width: 28,
                        height: 132,
                        margin: 0,
                        cursor: "pointer",
                        accentColor: item.accentColor,
                        touchAction: "none",
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 8,
                      color: "#95a1b5",
                      fontFamily: "sans-serif",
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    {item.midHint}
                  </span>
                  <span
                    style={{
                      fontSize: 8,
                      color: "#8fa1b9",
                      fontFamily: "sans-serif",
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    {item.bottomHint}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div
        style={{
          background: "#111",
          marginTop: density.promptPanelMarginTopClassic,
          padding: density.promptPanelPaddingClassic,
          borderTop: "2px solid #f19eb8",
          borderRadius: 10,
          display: "flex",
          flexWrap: "wrap",
          gap: density.promptPanelGap,
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

          <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
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
            <button
              type="button"
              onClick={() => handlePromptFormatChange("keyword")}
              aria-pressed={!isSentenceMode}
              style={{
                background: !isSentenceMode ? "#7bdff2" : "transparent",
                color: !isSentenceMode ? "#111" : "#7a8394",
                border: `1px solid ${!isSentenceMode ? "#7bdff2" : "#364054"}`,
                borderRadius: 4,
                padding: "2px 6px",
                cursor: "pointer",
                fontSize: 10,
                fontFamily: "sans-serif",
                fontWeight: 800,
              }}
            >
              키워드
            </button>
            <button
              type="button"
              onClick={() => handlePromptFormatChange("sentence")}
              aria-pressed={isSentenceMode}
              style={{
                background: isSentenceMode ? "#7bdff2" : "transparent",
                color: isSentenceMode ? "#111" : "#7a8394",
                border: `1px solid ${isSentenceMode ? "#7bdff2" : "#364054"}`,
                borderRadius: 4,
                padding: "2px 6px",
                cursor: "pointer",
                fontSize: 10,
                fontFamily: "sans-serif",
                fontWeight: 800,
              }}
            >
              문장
            </button>
            <button
              type="button"
              onClick={handleToggleAngleInPrompt}
              aria-pressed={includeAngleInPrompt}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: includeAngleInPrompt ? withAlpha(SEGMENT_COLORS.height, 0.22) : "transparent",
                color: includeAngleInPrompt ? SEGMENT_COLORS.height : "#7a8394",
                border: `1px solid ${includeAngleInPrompt ? withAlpha(SEGMENT_COLORS.height, 0.88) : "#364054"}`,
                borderRadius: 999,
                padding: "2px 8px 2px 6px",
                cursor: "pointer",
                fontSize: 10,
                fontFamily: "sans-serif",
                fontWeight: 700,
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 800 }}>앵글</span>
              <span
                style={{
                  position: "relative",
                  width: 30,
                  height: 16,
                  borderRadius: 999,
                  border: `1px solid ${includeAngleInPrompt ? withAlpha(SEGMENT_COLORS.height, 0.9) : "#364054"}`,
                  background: includeAngleInPrompt ? withAlpha(SEGMENT_COLORS.height, 0.2) : "#1b2333",
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
                    background: includeAngleInPrompt ? SEGMENT_COLORS.height : "#7a8394",
                    transition: "left 160ms ease, background 160ms ease",
                  }}
                />
              </span>
              <span style={{ minWidth: 22, textAlign: "left", fontSize: 10, fontWeight: 800 }}>
                {includeAngleInPrompt ? "ON" : "OFF"}
              </span>
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
              background: "#161a22",
              border: "1px solid #2c3444",
              borderRadius: 6,
              padding: density.inputPadding,
              color: SEGMENT_COLORS.custom,
              fontSize: 11,
              fontFamily: "sans-serif",
              lineHeight: 1.35,
              minHeight: density.textareaMinHeight,
              resize: "none",
            }}
          />

          <div style={{ display: "flex", gap: density.toolbarGap, flexWrap: "wrap", marginTop: 2 }}>
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
                color: canUpgradePrompt ? SEGMENT_COLORS.custom : "#8b96a8",
                border: `1px solid ${canUpgradePrompt ? withAlpha(SEGMENT_COLORS.custom, 0.88) : "#364054"}`,
                borderRadius: 8,
                padding: density.buttonPaddingCompact,
                cursor: !displayPrompt || promptValidationError || upgradeLoading ? "default" : "pointer",
                fontFamily: "sans-serif",
                fontSize: 11,
                fontWeight: 800,
                whiteSpace: "nowrap",
                opacity: !displayPrompt || promptValidationError || upgradeLoading ? 0.45 : 1,
              }}
            >
              {upgradeLoading ? "프롬프트 추가 중..." : isUpgradedPromptSelected ? "프롬프트 추가됨" : "프롬프트 추가하기"}
            </button>

            {isUpgradedPromptSelected ? (
              <button
                type="button"
                onClick={handleRevertPromptUpgrade}
                style={{
                  background: "transparent",
                  color: "#9aa0ac",
                  border: "1px solid #364054",
                  borderRadius: 8,
                  padding: density.buttonPaddingCompact,
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

          {upgradeNotice ? (
            <div style={{ color: "#9ec5ff", fontSize: 11, fontFamily: "sans-serif", marginTop: 2 }}>
              {upgradeNotice}
            </div>
          ) : null}
        </div>

        <div style={{ flex: 1, minWidth: 220, fontFamily: "monospace", lineHeight: 1.7 }}>
          {isSentenceMode ? (
            activeDisplayPrompt ? (
              <span
                style={{
                  color: "#e0ddd4",
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: "sans-serif",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {activeDisplayPrompt}
              </span>
            ) : (
              <span style={{ color: "#666", fontSize: 13, fontFamily: "sans-serif" }}>
                주체 없이도 프롬프트를 생성할 수 있습니다.
              </span>
            )
          ) : displayPromptSegments.length ? (
            <>
              {displayPromptSegments
                .filter((segment) => segment.type !== "ratio")
                .map((segment, idx, arr) => (
                  <span
                    key={`${segment.type}-${segment.text}-${idx}`}
                    style={{
                      color:
                        segment.type === "direction"
                          ? DIRECTION_TEXT_COLOR
                          : segment.type === "subject"
                            ? SUBJECT_PROMPT_TEXT_COLOR
                            : segment.type === "quality"
                              ? QUALITY_PRESET_PROMPT_COLOR
                            : segment.type === "custom"
                              ? CUSTOM_PROMPT_TEXT_COLOR
                          : SEGMENT_COLORS[segment.type] || "#e0ddd4",
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    {segment.text}
                    {idx < arr.length - 1 ? ", " : ""}
                  </span>
                ))}
              {displayPromptSegments.find((segment) => segment.type === "ratio") ? (
                <span style={{ color: SEGMENT_COLORS.ratio, fontSize: 13, fontWeight: 800 }}>
                  {" "}
                  {displayPromptSegments.find((segment) => segment.type === "ratio")?.text}
                </span>
              ) : null}
            </>
          ) : (
            <span style={{ color: "#666", fontSize: 13, fontFamily: "sans-serif" }}>
              주체 없이도 프롬프트를 생성할 수 있습니다.
            </span>
          )}

          {awkwardWords.length > 0 ? (
            <div style={{ marginTop: 6, color: "#f7b267", fontSize: 12, fontFamily: "sans-serif" }}>
              어색할 수 있는 표현 감지: {awkwardWords.join(", ")}
            </div>
          ) : null}

          <div
            style={{
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                color: PROMPT_HELPER_TEXT_COLOR,
                fontSize: 12,
                fontFamily: "sans-serif",
                lineHeight: 1.45,
                flex: "1 1 260px",
              }}
            >
              {promptHelperText}
            </div>

            <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
              {[1, 2, 3, 4, 5].map((level) => {
                const isActive = qualityPresetLevel === level;
                const isTooltipVisible = hoveredQualityPresetLevel === level;
                return (
                  <div
                    key={level}
                    style={{
                      position: "relative",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {isTooltipVisible ? (
                      <div
                        style={{
                          position: "absolute",
                          left: "50%",
                          top: "calc(100% + 8px)",
                          transform: "translateX(-50%)",
                          padding: "6px 8px",
                          borderRadius: 8,
                          background: "rgba(8, 11, 18, 0.96)",
                          border: "1px solid rgba(241, 206, 64, 0.35)",
                          color: "#f5f1d8",
                          fontSize: 10,
                          fontFamily: "sans-serif",
                          fontWeight: 700,
                          lineHeight: 1,
                          whiteSpace: "nowrap",
                          pointerEvents: "none",
                          zIndex: 5,
                          boxShadow: "0 10px 24px rgba(0, 0, 0, 0.28)",
                        }}
                      >
                        {getQualityPresetTooltip(level)}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      title={getQualityPresetTooltip(level)}
                      aria-label={getQualityPresetTooltip(level)}
                      onClick={() => handleQualityPresetSelect(level)}
                      onMouseEnter={() => setHoveredQualityPresetLevel(level)}
                      onMouseLeave={() => setHoveredQualityPresetLevel(0)}
                      onFocus={() => setHoveredQualityPresetLevel(level)}
                      onBlur={() => setHoveredQualityPresetLevel(0)}
                      style={{
                        minWidth: 34,
                        padding: "6px 9px",
                        borderRadius: 8,
                        border: `1px solid ${isActive ? "#f1ce40" : "#364054"}`,
                        background: isActive ? "rgba(241, 206, 64, 0.18)" : "transparent",
                        color: isActive ? "#ffeb79" : "#c3cad8",
                        cursor: "pointer",
                        fontSize: 11,
                        fontFamily: "'Arial Black',sans-serif",
                        fontWeight: 900,
                        lineHeight: 1,
                      }}
                    >
                      {level}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: density.toolbarGap, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleToggleLibrary}
              style={{
                background: "transparent",
                color: "#88a8b5",
                border: "1px solid #2b3f48",
                borderRadius: 8,
                padding: density.buttonPadding,
                cursor: "pointer",
                fontFamily: "sans-serif",
                fontSize: 12,
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              {isLibraryOpen ? "프리셋/히스토리 닫기" : "프리셋/히스토리"}
            </button>
          </div>
        </div>

        <button
          onClick={copyPrompt}
          disabled={!activeDisplayPrompt || Boolean(promptValidationError)}
          style={{
            background: copied ? "#7bd389" : "#f19eb8",
            color: copied ? "#0b2a14" : "#1a1a1a",
            border: "none",
            borderRadius: 8,
            padding: density.buttonPaddingLarge,
            cursor: !activeDisplayPrompt || promptValidationError ? "default" : "pointer",
            fontFamily: "'Arial Black','Helvetica Neue',sans-serif",
            fontSize: 12,
            fontWeight: 900,
            whiteSpace: "nowrap",
            opacity: !activeDisplayPrompt || promptValidationError ? 0.45 : 1,
          }}
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>

      {isLibraryOpen ? (
        <div
          ref={libraryRef}
          style={{
            background: "#0d0d0d",
            borderTop: "1px solid #222",
            padding: density.libraryPaddingClassic,
            display: "grid",
            gap: density.libraryGap,
          }}
        >
        {shouldShowLegacyImport ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              flexWrap: "wrap",
              padding: density.buttonPadding,
              borderRadius: 8,
              border: "1px solid #2e4154",
              background: "#10161d",
            }}
          >
            <div style={{ display: "grid", gap: 4 }}>
              <span
                style={{
                  fontSize: 10,
                  color: "#9ec7d5",
                  fontFamily: "'Arial Black',sans-serif",
                  letterSpacing: "0.12em",
                }}
              >
                LEGACY LOCAL DATA
              </span>
              <span style={{ color: legacyImportNotice ? "#d9dee7" : "#8da0ad", fontSize: 12, fontFamily: "sans-serif" }}>
                {legacyImportNotice ||
                  `이 브라우저의 기존 히스토리 ${legacyImportSummary.historyCount}개 / 프리셋 ${legacyImportSummary.presetCount}개를 계정으로 가져올 수 있습니다.`}
              </span>
            </div>

            {legacyImportSummary.hasImportableData ? (
              <button
                type="button"
                onClick={handleImportLegacyLocalData}
                disabled={legacyImporting}
                style={{
                  background: legacyImporting ? "#1c2630" : "#7bdff2",
                  border: "none",
                  borderRadius: 6,
                  padding: density.buttonPaddingCompact,
                  color: legacyImporting ? "#8aa1ad" : "#111",
                  fontSize: 12,
                  fontWeight: 800,
                  fontFamily: "sans-serif",
                  cursor: legacyImporting ? "default" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {legacyImporting ? "가져오는 중..." : "기존 로컬 데이터 가져오기"}
              </button>
            ) : null}
          </div>
        ) : null}

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
              padding: density.inputPadding,
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
              padding: density.buttonPaddingCompact,
              color: "#111",
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
            onClick={saveCurrentCameraAsAccountDefault}
            style={{
              background: "transparent",
              border: "1px solid #2e4154",
              borderRadius: 6,
              padding: density.buttonPaddingCompact,
              color: "#c9ecf3",
              fontSize: 12,
              fontWeight: 800,
              fontFamily: "sans-serif",
              cursor: "pointer",
            }}
          >
            계정 기본 저장
          </button>
          <button
            type="button"
            onClick={() => applyAccountCameraDefaults("manual")}
            style={{
              background: "transparent",
              border: "1px solid #2e4154",
              borderRadius: 6,
              padding: density.buttonPaddingCompact,
              color: hasSavedCameraDefaults ? "#c9ecf3" : "#6c7d88",
              fontSize: 12,
              fontWeight: 700,
              fontFamily: "sans-serif",
              cursor: "pointer",
            }}
          >
            계정 기본 불러오기
          </button>
          <button
            type="button"
            onClick={handleResetAllPresets}
            style={{
              background: "transparent",
              border: "1px solid #5f2f42",
              borderRadius: 6,
              padding: density.buttonPaddingCompact,
              color: "#ff9ab6",
              fontSize: 12,
              fontWeight: 700,
              fontFamily: "sans-serif",
              cursor: "pointer",
            }}
          >
            프리셋 초기화
          </button>
        </div>

        {environmentDefaultNotice ? (
          <div style={{ color: "#8da0ad", fontSize: 12, fontFamily: "sans-serif" }}>
            {environmentDefaultNotice}
          </div>
        ) : null}

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
                  padding: density.isCompact ? "2px 5px" : "3px 6px",
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
            disabled={!activeDisplayPrompt || Boolean(promptValidationError)}
            style={{
              background: "#ffd166",
              border: "none",
              borderRadius: 6,
              padding: density.buttonPaddingCompact,
              color: "#1a1a1a",
              fontSize: 12,
              fontWeight: 800,
              fontFamily: "sans-serif",
              cursor: !activeDisplayPrompt || promptValidationError ? "default" : "pointer",
              opacity: !activeDisplayPrompt || promptValidationError ? 0.5 : 1,
            }}
          >
            현재 프롬프트 저장
          </button>
          <button
            type="button"
            onClick={handleResetPromptHistory}
            disabled={!promptHistory.length}
            style={{
              background: "transparent",
              border: "1px solid #5f2f42",
              borderRadius: 6,
              padding: density.buttonPaddingCompact,
              color: promptHistory.length ? "#ff9ab6" : "#7b6670",
              fontSize: 12,
              fontWeight: 700,
              fontFamily: "sans-serif",
              cursor: promptHistory.length ? "pointer" : "default",
              opacity: promptHistory.length ? 1 : 0.5,
            }}
          >
            히스토리 초기화
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
                  padding: density.inputPadding,
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
                <span style={{ color: "#8aa1ad", fontSize: 10, fontFamily: "sans-serif" }}>
                  {item.format === "sentence" ? "문장" : "키워드"}
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
      ) : null}
      </div>
    </div>
  );
}
