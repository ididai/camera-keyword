import {
  hasKorean,
  normalizeCameraTerm,
  normalizeToken,
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

const SHOT_CLASS_RULES = [
  { id: "extreme-close-up", pattern: /\bextreme\s+close[-\s]?up\b/i },
  { id: "medium-close-up", pattern: /\bmedium\s+close[-\s]?up\b/i },
  { id: "close-up", pattern: /\bclose[-\s]?up(?:\s+shot)?\b/i },
  { id: "medium-shot", pattern: /\bmedium\s+shot\b/i },
  { id: "thigh-up", pattern: /\b(?:thigh[-\s]?up|cowboy\s+shot)\b/i },
  { id: "full-body", pattern: /\bfull\s+body(?:\s+shot)?\b/i },
  { id: "wide-shot", pattern: /\bwide\s+shot\b/i },
];

const SHOT_SYNONYM_RULES = [
  { id: "medium-close-up", pattern: /\b(?:chest[-\s]?up|bust(?:\s+portrait)?|from\s+chest\s+to\s+crown)\b/i },
  { id: "medium-shot", pattern: /\b(?:waist[-\s]?up|half[-\s]?body|from\s+waist\s+to\s+top)\b/i },
  { id: "thigh-up", pattern: /\b(?:mid[-\s]?thigh(?:\s+to\s+crown)?|mid[-\s]?thigh\s+framing)\b/i },
];

const SHOT_DESCRIPTOR_TRIM_RULES = [
  /\bextreme\s+close[-\s]?up\b/gi,
  /\bmedium\s+close[-\s]?up\b/gi,
  /\bclose[-\s]?up(?:\s+shot)?\b/gi,
  /\bmedium\s+shot\b/gi,
  /\bwide\s+shot\b/gi,
  /\bfull\s+body(?:\s+shot)?\b/gi,
  /\bcowboy\s+shot\b/gi,
  /\bthigh[-\s]?up\b/gi,
  /\bwaist[-\s]?up\b/gi,
  /\bchest[-\s]?up\b/gi,
  /\bbust\s+portrait\b/gi,
  /\b(?:framing|frame|composition|crop|portrait)\b/gi,
];

function getShotClass(value) {
  const text = normalizeCameraTerm(value).toLowerCase();
  if (!text) return "";

  for (const rule of SHOT_CLASS_RULES) {
    if (rule.pattern.test(text)) return rule.id;
  }
  for (const rule of SHOT_SYNONYM_RULES) {
    if (rule.pattern.test(text)) return rule.id;
  }
  return "";
}

function isMostlyShotDescriptor(value) {
  let text = normalizeCameraTerm(value);
  if (!text) return false;

  for (const pattern of SHOT_DESCRIPTOR_TRIM_RULES) {
    text = text.replace(pattern, " ");
  }
  text = normalizeToken(text.replace(/[()]/g, " ").replace(/[|/]/g, " ").replace(/[,-]+/g, " "));
  return text.length === 0;
}

function removeShotDuplicateFromCustom(customText, shotText) {
  const normalizedCustom = normalizeCameraTerm(customText);
  const normalizedShot = normalizeCameraTerm(shotText);
  if (!normalizedCustom || !normalizedShot) return normalizedCustom;

  const shotLower = normalizedShot.toLowerCase();
  const shotClass = getShotClass(normalizedShot);
  const parts = normalizedCustom
    .split(",")
    .map((part) => normalizeToken(normalizeCameraTerm(part)))
    .filter(Boolean);

  const filtered = parts.filter((part) => {
    const partLower = part.toLowerCase();
    if (partLower === shotLower) return false;

    const partClass = getShotClass(part);
    if (!shotClass || partClass !== shotClass) return true;

    return !isMostlyShotDescriptor(part);
  });

  return filtered.join(", ");
}

export function validatePromptInput({ promptLang, subjectKorean, subjectEnglish }) {
  const kr = normalizeSubjectInput(subjectKorean);
  const en = normalizeSubjectInput(subjectEnglish);

  // 주체를 비워도 카메라 키워드 프롬프트 복사는 허용한다.
  // 다만 한글 주체가 있는데 EN 선택 시에는 입력 버튼 안내를 유지한다.
  if (promptLang === "en" && kr && !en) {
    return "입력 버튼을 눌러 영어 주체를 생성해 주세요.";
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
  const sanitizedCustomHint = sanitizeCustomPromptHint(custom);
  const refinedCustomHint = removeShotDuplicateFromCustom(sanitizedCustomHint, shot);
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

export function splitCustomQualityText(customText = "", qualityText = "") {
  const normalizedCustom = sanitizeCustomPromptHint(customText);
  const normalizedQuality = sanitizeCustomPromptHint(qualityText);

  if (!normalizedQuality) {
    return { customText: normalizedCustom, qualityText: "" };
  }

  if (!normalizedCustom) {
    return { customText: "", qualityText: normalizedQuality };
  }

  if (normalizedCustom.toLowerCase() === normalizedQuality.toLowerCase()) {
    return { customText: "", qualityText: normalizedQuality };
  }

  const suffix = `, ${normalizedQuality}`.toLowerCase();
  if (!normalizedCustom.toLowerCase().endsWith(suffix)) {
    return { customText: normalizedCustom, qualityText: "" };
  }

  return {
    customText: normalizedCustom.slice(0, normalizedCustom.length - normalizedQuality.length - 2).trim(),
    qualityText: normalizedQuality,
  };
}

export function buildDisplayPromptSegments(segments, qualityText = "") {
  const normalizedQualityText = normalizeCameraTerm(qualityText);
  if (!normalizedQualityText) return segments;

  return segments.flatMap((segment) => {
    if (segment.type !== "custom") return [segment];
    const { customText, qualityText: matchedQualityText } = splitCustomQualityText(segment.text, normalizedQualityText);
    const next = [];
    if (customText) next.push({ type: "custom", text: customText });
    if (matchedQualityText) next.push({ type: "quality", text: matchedQualityText });
    if (!next.length) next.push(segment);
    return next;
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

function getSegmentText(segments, type) {
  return segments.find((segment) => segment.type === type)?.text || "";
}

function resolveKoreanObjectParticle(text) {
  const subject = normalizeSubjectInput(text);
  if (!subject) return "";
  const lastChar = subject[subject.length - 1];
  const code = lastChar.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "";
  return (code - 0xac00) % 28 === 0 ? "를" : "을";
}

function buildEnglishSentence({ subject, shot, details, custom }) {
  const subjectText = normalizeSubjectInput(subject);
  const shotText = normalizeCameraTerm(shot);
  const detailParts = details.filter(Boolean);
  const detailKeys = new Set(detailParts.map((part) => normalizeCameraTerm(part).toLowerCase()).filter(Boolean));
  if (shotText) detailKeys.add(normalizeCameraTerm(shotText).toLowerCase());
  if (subjectText) detailKeys.add(normalizeToken(subjectText).toLowerCase());
  const customText = normalizeToken(custom);
  const customSeen = new Set();
  const customParts = customText
    .split(/[,\n/]+/)
    .map((part) => normalizeToken(part))
    .filter(Boolean)
    .filter((part) => {
      const key = normalizeCameraTerm(part).toLowerCase();
      if (!key || detailKeys.has(key) || customSeen.has(key)) return false;
      customSeen.add(key);
      return true;
    });
  const safeCustom = customParts.join(", ");

  let base = "";

  if (subjectText && shotText) {
    base = `A ${shotText} of ${subjectText}`;
  } else if (subjectText) {
    base = `A photo of ${subjectText}`;
  } else if (shotText) {
    base = `A ${shotText}`;
  } else {
    base = "A scene";
  }

  let sentence = base;
  if (detailParts.length) {
    sentence += `, ${detailParts.join(", ")}`;
  }
  if (safeCustom) {
    sentence += `, ${safeCustom}`;
  }
  return sentence;
}

function buildKoreanSentence({ subject, shot, details, custom }) {
  const subjectText = normalizeSubjectInput(subject);
  const shotText = normalizeCameraTerm(shot);
  const subjectUsesKorean = hasKorean(subjectText);
  const detailParts = details.filter(Boolean);
  const detailKeys = new Set(detailParts.map((part) => normalizeCameraTerm(part).toLowerCase()).filter(Boolean));
  if (shotText) detailKeys.add(normalizeCameraTerm(shotText).toLowerCase());
  if (subjectText) detailKeys.add(normalizeToken(subjectText).toLowerCase());
  const customText = normalizeToken(custom);
  const customSeen = new Set();
  const customParts = customText
    .split(/[,\n/]+/)
    .map((part) => normalizeToken(part))
    .filter(Boolean)
    .filter((part) => {
      const key = normalizeCameraTerm(part).toLowerCase();
      if (!key || detailKeys.has(key) || customSeen.has(key)) return false;
      customSeen.add(key);
      return true;
    });
  const safeCustom = customParts.join(", ");
  let base = "";

  if (subjectText && shotText) {
    if (subjectUsesKorean) {
      const particle = resolveKoreanObjectParticle(subjectText);
      base = `${subjectText}${particle} 담은 ${shotText}`;
    } else {
      base = `주체 ${subjectText}, ${shotText}`;
    }
  } else if (subjectText) {
    base = subjectUsesKorean ? `${subjectText} 장면` : `주체 ${subjectText}`;
  } else if (shotText) {
    base = `${shotText} 장면`;
  } else {
    base = "장면";
  }

  let sentence = base;
  if (detailParts.length) {
    sentence += `, ${detailParts.join(", ")}`;
  }
  if (safeCustom) {
    sentence += `, ${safeCustom}`;
  }
  return sentence;
}

export function toSentenceText(segments, lang = "en") {
  if (!segments.length) return "";

  const subject = getSegmentText(segments, "subject");
  const shot = getSegmentText(segments, "shot");
  const height = getSegmentText(segments, "height");
  const direction = getSegmentText(segments, "direction");
  const gaze = getSegmentText(segments, "gaze");
  const composition = getSegmentText(segments, "composition");
  const framing = getSegmentText(segments, "framing");
  const custom = getSegmentText(segments, "custom");
  const ratio = getSegmentText(segments, "ratio");

  const details = [
    normalizeCameraTerm(height),
    normalizeCameraTerm(direction),
    normalizeCameraTerm(gaze),
    normalizeCameraTerm(composition),
    normalizeCameraTerm(framing),
  ]
    .filter(Boolean)
    .reduce((acc, part) => {
      const key = normalizeCameraTerm(part).toLowerCase();
      if (!key || acc.seen.has(key)) return acc;
      acc.seen.add(key);
      acc.parts.push(part);
      return acc;
    }, { parts: [], seen: new Set() }).parts;

  const body = lang === "kr"
    ? buildKoreanSentence({ subject, shot, details, custom })
    : buildEnglishSentence({ subject, shot, details, custom });

  if (!body) return ratio || "";
  return ratio ? `${body} ${ratio}` : body;
}

export function buildSentencePromptFromSegments(segments, lang = "en") {
  return toSentenceText(segments, lang);
}

export function inferPromptLanguageFromText(text, fallback = "kr") {
  const normalized = normalizeCameraTerm(String(text || ""));
  if (!normalized) return fallback;
  return hasKorean(normalized) ? "kr" : "en";
}

export { hasKorean };
