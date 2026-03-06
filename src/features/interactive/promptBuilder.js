import {
  hasKorean,
  normalizeCameraTerm,
  normalizeSubjectInput,
  normalizeToken,
} from "./promptNormalizer";

export const SEGMENT_COLORS = {
  subject: "#ffd166",
  shot: "#7bdff2",
  angle: "#b2f7ef",
  composition: "#ffb86b",
  framing: "#f7c6ff",
  ratio: "#f7aef8",
};

export const DEFAULT_PROMPT_ORDER = ["subject", "shot", "angle", "composition", "framing"];

export function validatePromptInput({ promptLang, subjectKorean, subjectEnglish }) {
  const kr = normalizeSubjectInput(subjectKorean);
  const en = normalizeSubjectInput(subjectEnglish);

  if (!kr && !en) {
    return "주체를 먼저 입력해 주세요.";
  }

  if (promptLang === "en" && !en) {
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
  ratioFraming,
  arValue,
}) {
  const subject = normalizeSubjectInput(subjectText);
  const baseSegments = [
    { type: "subject", text: subject },
    { type: "shot", text: shot },
    { type: "angle", text: height },
    { type: "angle", text: direction },
    { type: "angle", text: gaze },
    { type: "composition", text: composition },
    { type: "framing", text: ratioFraming },
  ].map((segment) => ({ ...segment, text: normalizeCameraTerm(segment.text) }));

  // 타입은 유지한 채 중복 텍스트만 제거
  const seen = new Set();
  const dedupedByType = [];
  for (const segment of baseSegments) {
    if (!segment.text) continue;
    const key = segment.text.toLowerCase();
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
