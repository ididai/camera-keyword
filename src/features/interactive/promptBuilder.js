import {
  hasKorean,
  normalizeCameraTerm,
  normalizeSubjectInput,
  sanitizeCustomPromptHint,
  sanitizeSubjectCameraDirectives,
} from "./promptNormalizer";

export const SEGMENT_COLORS = {
  subject: "#f4d35e",
  shot: "#4da3ff",
  height: "#ff5d8f",
  direction: "#ff9f1c",
  gaze: "#3df6d0",
  composition: "#b388ff",
  custom: "#ffb703",
  framing: "#ffffff",
  ratio: "#ffffff",
};

export const DEFAULT_PROMPT_ORDER = [
  "subject",
  "shot",
  "height",
  "direction",
  "composition",
  "gaze",
  "custom",
  "framing",
];

export function validatePromptInput({ promptLang, subjectKorean, subjectEnglish }) {
  const kr = normalizeSubjectInput(subjectKorean);
  const en = normalizeSubjectInput(subjectEnglish);

  // 주체를 비워도 카메라 키워드 프롬프트 복사는 허용한다.
  // 다만 한글 주체가 있는데 EN 선택 시에는 번역 유도를 유지한다.
  if (promptLang === "en" && kr && !en) {
    return "번역 버튼을 눌러 영어 주체를 생성해 주세요.";
  }

  return "";
}

export function buildPromptSegments({
  subjectText,
  shot,
  height,
  direction,
  gaze,
  composition,
  custom,
  ratioFraming,
  arValue,
  includeAngle = true,
}) {
  const subject = sanitizeSubjectCameraDirectives(subjectText);
  const refinedCustomHint = sanitizeCustomPromptHint(custom);
  const baseSegments = [{ type: "subject", text: subject }, { type: "shot", text: shot }];

  if (includeAngle) {
    baseSegments.push(
      { type: "height", text: height },
      { type: "direction", text: direction },
      { type: "gaze", text: gaze },
    );
  }

  if (refinedCustomHint) {
    baseSegments.push({ type: "custom", text: refinedCustomHint });
  }

  baseSegments.push({ type: "composition", text: composition }, { type: "framing", text: ratioFraming });

  const normalizedSegments = baseSegments.map((segment) => ({
    ...segment,
    text: segment.type === "subject"
      ? normalizeSubjectInput(segment.text)
      : normalizeCameraTerm(segment.text),
  }));

  // 타입은 유지한 채 중복 텍스트만 제거
  const seen = new Set();
  const dedupedByType = [];
  for (const segment of normalizedSegments) {
    if (!segment.text) continue;
    const key = `${segment.type}:${segment.text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedByType.push(segment);
  }

  const ordered = [];
  for (const type of DEFAULT_PROMPT_ORDER) {
    dedupedByType
      .filter((segment) => segment.type === type)
      .forEach((segment) => ordered.push(segment));
  }

  if (arValue) ordered.push({ type: "ratio", text: `--ar ${arValue}` });
  return ordered;
}

function normalizeUpgradeCustom(customText, subjectText) {
  const custom = sanitizeCustomPromptHint(customText || "");
  if (!custom) return "";

  const subject = normalizeSubjectInput(subjectText || "");
  if (!subject) return custom;

  if (custom.toLowerCase() === subject.toLowerCase()) return "";
  return custom;
}

function uniqueNonEmpty(values) {
  const seen = new Set();
  const next = [];
  for (const value of values) {
    const text = normalizeCameraTerm(String(value || ""));
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(text);
  }
  return next;
}

function buildCameraLockClause({
  shot,
  height,
  direction,
  gaze,
  composition,
  ratioFraming,
  includeAngle,
}) {
  const core = [shot, composition, ratioFraming];
  const angleParts = includeAngle ? [height, direction, gaze] : [];
  const parts = uniqueNonEmpty([...core, ...angleParts]);
  if (!parts.length) return "";

  const isKorean = parts.some((part) => hasKorean(part));
  return isKorean
    ? `카메라 의도 고정 (${parts.join(" | ")})`
    : `camera intent locked (${parts.join(" | ")})`;
}

export function buildUpgradedPromptSegments({
  subjectText,
  shot,
  height,
  direction,
  gaze,
  composition,
  custom,
  ratioFraming,
  arValue,
  includeAngle = true,
}) {
  const refinedSubject = sanitizeSubjectCameraDirectives(subjectText || "");
  const refinedCustomBase = normalizeUpgradeCustom(custom, refinedSubject);
  const cameraLockClause = buildCameraLockClause({
    shot,
    height,
    direction,
    gaze,
    composition,
    ratioFraming,
    includeAngle,
  });
  const refinedCustom = [refinedCustomBase, cameraLockClause].filter(Boolean).join(" / ");

  return buildPromptSegments({
    subjectText: refinedSubject,
    shot,
    height,
    direction,
    gaze,
    composition,
    custom: refinedCustom,
    ratioFraming,
    arValue,
    includeAngle,
  });
}

export function toPromptText(segments) {
  if (!segments.length) return "";

  const ratio = segments.find((s) => s.type === "ratio")?.text;
  const body = segments
    .filter((s) => s.type !== "ratio")
    .map((s) => s.text)
    .join(", ");

  if (!body) return ratio || "";
  return ratio ? `${body} ${ratio}` : body;
}

export { hasKorean };
