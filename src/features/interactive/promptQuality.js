export const PROMPT_TEST_SUBJECTS = [
  "빨간 원피스를 입은 소녀",
  "지하철 플랫폼에서 뛰는 남자",
  "카페 창가에 앉은 사람",
  "비 오는 밤 골목길",
  "도시 옥상 위 패션 모델",
  "해변을 걷는 커플",
  "네온 간판 아래 인물",
  "화이트 배경의 화장품 병",
  "나무 테이블 위 커피잔",
  "숲속 안개 낀 오솔길",
  "눈 덮인 산 정상 풍경",
  "야경이 보이는 실내 거실",
  "창문 옆 고양이",
  "노트북 앞에서 일하는 여성",
  "농구 코트에서 점프하는 선수",
  "공항에서 캐리어를 끄는 여행자",
  "비행 드론으로 본 도시",
  "자동차 옆에 선 모델",
  "무대 조명 아래 가수",
  "책을 읽는 학생",
  "박물관 복도",
  "빈티지 필름 카메라 제품샷",
  "한옥 마당 풍경",
  "사막 도로를 달리는 오토바이",
  "바닷가 절벽 위 사람",
  "쇼윈도 앞 패션 촬영",
  "꽃밭 사이를 걷는 아이",
  "비 오는 유리창 너머 인물",
  "연기 낀 골목의 자전거",
  "도서관에서 집중하는 학생",
];

export const AWKWARD_EXPRESSIONS = [
  "translation:",
  "very very",
  "highly detailed",
  "ultra high quality",
  "amazing",
  "beautiful",
];

export function detectAwkwardExpressions(prompt) {
  const lower = (prompt || "").toLowerCase();
  return AWKWARD_EXPRESSIONS.filter((word) => lower.includes(word));
}
