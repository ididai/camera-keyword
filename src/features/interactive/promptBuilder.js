import {
  hasKorean,
  normalizeCameraTerm,
  normalizeSubjectInput,
} from "./promptNormalizer";

export const SEGMENT_COLORS = {
  subject: "#f4d35e",
  shot: "#4da3ff",
  height: "#ff5d8f",
  direction: "#ff9f1c",
  gaze: "#2ec4b6",
  composition: "#b388ff",
  custom: "#ffb703",
  framing: "#70e000",
  ratio: "#3df6ff",
};

export const DEFAULT_PROMPT_ORDER = [
  "subject",
  "shot",
  "height",
  "direction",
  "gaze",
  "composition",
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
  const subject = normalizeSubjectInput(subjectText);
  const baseSegments = [{ type: "subject", text: subject }, { type: "shot", text: shot }];

  if (includeAngle) {
    baseSegments.push(
      { type: "height", text: height },
      { type: "direction", text: direction },
      { type: "gaze", text: gaze },
    );
  }

  if (custom) {
    baseSegments.push({ type: "custom", text: custom });
  }

  baseSegments.push({ type: "composition", text: composition }, { type: "framing", text: ratioFraming });

  const normalizedSegments = baseSegments.map((segment) => ({
    ...segment,
    text: normalizeCameraTerm(segment.text),
  }));

  // 타입은 유지한 채 중복 텍스트만 제거
  const seen = new Set();
  const dedupedByType = [];
  for (const segment of normalizedSegments) {
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
