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

// Subject text may contain full prompt snippets copied by users.
// Strip only clear camera-directive chunks so subject semantics remain.
const SUBJECT_CAMERA_DIRECTIVE_PATTERNS = [
  /\b--ar\s*\d+(?:\.\d+)?:\d+(?:\.\d+)?\b/i,
  /\b(?:extreme\s+wide|wide|medium|close[-\s]?up|extreme\s+close[-\s]?up)\s+shot\b/i,
  /\b(?:eye[-\s]?level|high\s+angle|low[-\s]?angle|top[-\s]?down|overhead)\b/i,
  /\b(?:front|rear|side)\s+(?:view|profile)\b/i,
  /\b(?:45-degree oblique view|over-the-shoulder)\b/i,
  /\bsubject\s+(?:centered in frame|at (?:left|right|upper|lower).+third)\b/i,
  /\b(?:vertical|portrait|cinematic wide)\s+framing\b/i,
  /\blooking\s+(?:left|right|up|down|up-left|up-right|down-left|down-right)\b/i,
];

// Custom hint에서는 카메라 지시어 충돌을 적극 제거한다.
const CUSTOM_CAMERA_DIRECTIVE_PATTERNS = [
  ...SUBJECT_CAMERA_DIRECTIVE_PATTERNS,
  /\blooking\s+directly\s+at\s+camera\b/i,
  /\blooking\s+back(?:\s+(?:at\s+camera|to\s+the\s+(?:left|right)|up|down|up-left|up-right|down-left|down-right))?\b/i,
  /\blook(?:ing)?\s+back\b/i,
  /\b(?:turn(?:ing)?|turned|glanc(?:e|ing|ed)|facing)\s+back\b/i,
  /\b(?:turn(?:ing)?|turned)\s+around\b/i,
  /\bover(?:\s+the)?\s+shoulder\b/i,
  /뒤를?\s*돌아보(?:는|며|고|기|는\s*중|는중)?/i,
  /뒤돌아보(?:는|며|고|기|는\s*중|는중)?/i,
  /카메라\s*(?:정면\s*)?응시/i,
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

export function sanitizeSubjectCameraDirectives(value) {
  const normalized = normalizeSubjectInput(value);
  if (!normalized) return "";

  const chunks = normalized
    .split(",")
    .map((part) => normalizeToken(part))
    .filter(Boolean);
  if (!chunks.length) return normalized;

  const filtered = chunks.filter((chunk) => {
    const lower = chunk.toLowerCase();
    return !SUBJECT_CAMERA_DIRECTIVE_PATTERNS.some((pattern) => pattern.test(lower));
  });

  // Never wipe subject text completely from aggressive filtering.
  return filtered.length ? filtered.join(", ") : normalized;
}

export function sanitizeCustomPromptHint(value) {
  const normalized = normalizeSubjectInput(value);
  if (!normalized) return "";

  const chunks = normalized
    .split(/[,\n/]+/)
    .map((part) => normalizeToken(part))
    .filter(Boolean);
  if (!chunks.length) return "";

  const filtered = chunks.filter((chunk) => {
    const lower = chunk.toLowerCase();
    if (/^(?:looking|look|turning|turned|glancing|facing)$/.test(lower)) return false;
    return !CUSTOM_CAMERA_DIRECTIVE_PATTERNS.some((pattern) => pattern.test(lower));
  });

  return filtered.join(", ");
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

export function normalizeSentenceText(value) {
  return normalizeToken(value);
}

export function hasKorean(value) {
  return /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(value || "");
}
