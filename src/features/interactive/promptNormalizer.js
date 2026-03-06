const MULTI_SPACE = /\s{2,}/g;
const LEADING_TRAILING_COMMAS = /^,+|,+$/g;

const BANNED_SUBJECT_PATTERNS = [
  /\bvery\s+very\b/gi,
  /\bhighly\s+detailed\b/gi,
  /\bultra\s+high\s+quality\b/gi,
  /\bamazing\b/gi,
  /\bbeautiful\b/gi,
];

const CAMERA_TERM_NORMALIZERS = [
  { pattern: /\bcowboy\s+shot\b/gi, replace: "thigh-up framing" },
  { pattern: /\bthree[-\s]?quarter\s+back\s+view\b/gi, replace: "rear 45-degree oblique view" },
  { pattern: /\brear\s+three[-\s]?quarter\b/gi, replace: "rear 45-degree oblique view" },
  { pattern: /\bthree[-\s]?quarter\s+front\s+view\b/gi, replace: "front 45-degree oblique view" },
  { pattern: /\bthree[-\s]?quarter\s+view\b/gi, replace: "45-degree oblique view" },
  { pattern: /\bbird'?s-eye\s+view\b/gi, replace: "top-down overhead view" },
  { pattern: /\bworm'?s-eye\s+view\b/gi, replace: "extreme low-angle upward view" },
  { pattern: /카우보이\s*샷/gi, replace: "허벅지 위 프레이밍" },
  { pattern: /(버즈아이|버드아이)\s*뷰/gi, replace: "수직 탑다운 시점" },
  { pattern: /웜스아이\s*뷰/gi, replace: "극저각 상향 시점" },
];

export function normalizeToken(value) {
  return String(value || "")
    .trim()
    .replace(LEADING_TRAILING_COMMAS, "")
    .replace(MULTI_SPACE, " ");
}

export function normalizeSubjectInput(value) {
  let next = normalizeToken(value).replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  for (const pattern of BANNED_SUBJECT_PATTERNS) {
    next = next.replace(pattern, " ");
  }
  return normalizeToken(next);
}

export function normalizeCameraTerm(value) {
  let next = normalizeToken(value);
  for (const rule of CAMERA_TERM_NORMALIZERS) {
    next = next.replace(rule.pattern, rule.replace);
  }
  return normalizeToken(next);
}

export function normalizePromptText(value) {
  const normalized = normalizeToken(value);
  if (!normalized) return "";

  const chunks = normalized
    .split(",")
    .map((part) => normalizeCameraTerm(part))
    .filter(Boolean);

  const unique = [];
  const seen = new Set();
  for (const chunk of chunks) {
    const key = chunk.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(chunk);
  }
  return unique.join(", ");
}

export function hasKorean(value) {
  return /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(value || "");
}

