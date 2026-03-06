export const SUBJECT_TYPES = [
  {
    id: "person",
    kr: "인물",
    icon: "👤",
    object: "person",
    keywords: {
      height: [
        { phi: [0, 12], kr: "버즈아이 뷰", en: "bird's-eye view" },
        { phi: [12, 30], kr: "하이 앵글", en: "high angle" },
        { phi: [30, 50], kr: "슬라이틀리 하이", en: "slightly high angle" },
        { phi: [50, 70], kr: "아이 레벨", en: "eye level" },
        { phi: [70, 90], kr: "힙 레벨", en: "hip level" },
        { phi: [90, 115], kr: "니 레벨", en: "knee level" },
        { phi: [115, 180], kr: "웜스아이 뷰", en: "worm's-eye view" },
      ],
      direction: [
        { theta: [0, 18], kr: "정면", en: "facing camera" },
        { theta: [18, 45], kr: "살짝 턴", en: "slightly turned" },
        { theta: [45, 80], kr: "3/4 앞", en: "three-quarter view" },
        { theta: [80, 100], kr: "측면 프로필", en: "side profile" },
        { theta: [100, 135], kr: "3/4 뒤", en: "three-quarter back view" },
        { theta: [135, 165], kr: "어깨 너머", en: "over-the-shoulder" },
        { theta: [165, 180], kr: "후면", en: "back view" },
      ],
      shot: [
        { r: [0, 0.25], kr: "익스트림 클로즈업", en: "extreme close-up" },
        { r: [0.25, 0.42], kr: "클로즈업", en: "close-up shot" },
        { r: [0.42, 0.57], kr: "미디엄 클로즈업", en: "medium close-up" },
        { r: [0.57, 0.68], kr: "미디엄 샷", en: "medium shot" },
        { r: [0.68, 0.78], kr: "카우보이 샷", en: "cowboy shot" },
        { r: [0.78, 0.88], kr: "풀 바디 샷", en: "full body shot" },
        { r: [0.88, 1], kr: "와이드 샷", en: "wide shot" },
      ],
    },
  },
  {
    id: "place",
    kr: "실내/공간",
    icon: "🏠",
    object: "building",
    keywords: {
      height: [
        { phi: [0, 18], kr: "천장 뷰", en: "ceiling angle" },
        { phi: [18, 40], kr: "하이 코너", en: "high corner angle" },
        { phi: [40, 62], kr: "스탠딩 하이", en: "standing high angle" },
        { phi: [62, 85], kr: "아이 레벨", en: "eye level" },
        { phi: [85, 110], kr: "로우 앵글", en: "low angle" },
        { phi: [110, 180], kr: "그라운드 레벨", en: "ground level" },
      ],
      direction: [
        { theta: [0, 30], kr: "정면", en: "straight-on" },
        { theta: [30, 75], kr: "사선", en: "diagonal view" },
        { theta: [75, 110], kr: "코너 뷰", en: "corner view" },
        { theta: [110, 150], kr: "후방 코너", en: "rear corner" },
        { theta: [150, 180], kr: "후면", en: "rear-facing" },
      ],
      shot: [
        { r: [0, 0.35], kr: "디테일", en: "detail close-up" },
        { r: [0.35, 0.55], kr: "오브젝트 샷", en: "object shot" },
        { r: [0.55, 0.72], kr: "룸 샷", en: "room shot" },
        { r: [0.72, 0.86], kr: "와이드 룸", en: "wide interior" },
        { r: [0.86, 1], kr: "파노라마", en: "interior panoramic" },
      ],
    },
  },
  {
    id: "product",
    kr: "제품",
    icon: "📦",
    object: "cosmetic",
    keywords: {
      height: [
        { phi: [0, 15], kr: "탑 뷰", en: "flat lay" },
        { phi: [15, 35], kr: "오버헤드", en: "overhead angle" },
        { phi: [35, 55], kr: "45도", en: "45-degree product angle" },
        { phi: [55, 78], kr: "아이 레벨", en: "eye level" },
        { phi: [78, 110], kr: "로우 앵글", en: "low angle" },
        { phi: [110, 180], kr: "언더 뷰", en: "bottom-up angle" },
      ],
      direction: [
        { theta: [0, 22], kr: "정면", en: "front face" },
        { theta: [22, 60], kr: "3/4", en: "three-quarter view" },
        { theta: [60, 100], kr: "측면", en: "side profile" },
        { theta: [100, 148], kr: "후방 3/4", en: "rear three-quarter" },
        { theta: [148, 180], kr: "후면", en: "rear view" },
      ],
      shot: [
        { r: [0, 0.28], kr: "매크로", en: "macro detail" },
        { r: [0.28, 0.48], kr: "파트 클로즈업", en: "partial close-up" },
        { r: [0.48, 0.65], kr: "제품 클로즈업", en: "close-up" },
        { r: [0.65, 0.82], kr: "제품 샷", en: "product shot" },
        { r: [0.82, 0.92], kr: "라이프스타일", en: "lifestyle shot" },
        { r: [0.92, 1], kr: "그룹 샷", en: "group shot" },
      ],
    },
  },
  {
    id: "landscape",
    kr: "풍경/자연",
    icon: "🌅",
    object: "terrain",
    keywords: {
      height: [
        { phi: [0, 18], kr: "항공 뷰", en: "aerial view" },
        { phi: [18, 40], kr: "드론 하이", en: "high drone perspective" },
        { phi: [40, 62], kr: "하이 앵글", en: "high angle" },
        { phi: [62, 82], kr: "아이 레벨", en: "eye level" },
        { phi: [82, 110], kr: "로우 앵글", en: "low angle" },
        { phi: [110, 180], kr: "그라운드 레벨", en: "ground level" },
      ],
      direction: [
        { theta: [0, 35], kr: "정면", en: "straight-on" },
        { theta: [35, 80], kr: "사선", en: "diagonal angle" },
        { theta: [80, 120], kr: "측면", en: "lateral view" },
        { theta: [120, 165], kr: "후방 사선", en: "rear diagonal" },
        { theta: [165, 180], kr: "후면", en: "rear-facing" },
      ],
      shot: [
        { r: [0, 0.35], kr: "자연 디테일", en: "nature detail" },
        { r: [0.35, 0.55], kr: "미디엄 랜드스케이프", en: "medium landscape" },
        { r: [0.55, 0.72], kr: "와이드 랜드스케이프", en: "wide landscape" },
        { r: [0.72, 0.86], kr: "익스트림 와이드", en: "extreme wide" },
        { r: [0.86, 1], kr: "시네마틱 파노라마", en: "cinematic panoramic" },
      ],
    },
  },
];

export const DEFAULT_SUBJECT_PROMPTS = {
  person: "인물을 설명해 주세요",
  place: "공간을 설명해 주세요",
  product: "제품을 설명해 주세요",
  landscape: "풍경을 설명해 주세요",
};

export const ANGLE_PRESETS = [
  { id: "paparazzi", label: "파파라치", icon: "📸", phi: 72, theta: 35, r: 0.72 },
  { id: "idcard", label: "증명사진", icon: "🪪", phi: 65, theta: 0, r: 0.38 },
  { id: "runway", label: "런웨이", icon: "👠", phi: 60, theta: 0, r: 0.92 },
  { id: "cctv", label: "CCTV", icon: "📹", phi: 12, theta: 15, r: 0.85 },
  { id: "insta", label: "인스타", icon: "✨", phi: 35, theta: 40, r: 0.6 },
  { id: "product", label: "제품광고", icon: "💎", phi: 40, theta: 30, r: 0.55 },
  { id: "fisheye", label: "어안렌즈", icon: "🐟", phi: 25, theta: 20, r: 0.78 },
  { id: "wideangle", label: "광각렌즈", icon: "🔭", phi: 62, theta: 25, r: 0.82 },
  { id: "worm", label: "웜스아이", icon: "🐛", phi: 140, theta: 10, r: 0.75 },
  { id: "birdseye", label: "버즈아이", icon: "🦅", phi: 8, theta: 0, r: 0.9 },
];

export const AR_PRESETS = [
  { id: "ar916", label: "9:16", value: "9:16" },
  { id: "ar45", label: "4:5", value: "4:5" },
  { id: "ar34", label: "3:4", value: "3:4" },
  { id: "ar11", label: "1:1", value: "1:1" },
  { id: "ar43", label: "4:3", value: "4:3" },
  { id: "ar169", label: "16:9", value: "16:9" },
  { id: "ar21", label: "2:1", value: "2:1" },
  { id: "ar239", label: "2.39:1", value: "2.39:1" },
];
