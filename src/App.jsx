import { useState, useEffect, useRef } from "react";
import * as THREE from "three";

const DATA = {
  shot: [
    { id: "ecl", kr: "익스트림 클로즈업 — 눈/입 단독", en: "extreme close-up shot, single facial feature isolated, macro framing, tight crop on eyes or lips, intimate detail emphasis", desc: "눈·코·입 단독 부위", clipPct: 92 },
    { id: "cl",  kr: "클로즈업 — 얼굴+목",          en: "close-up shot, face framing",                desc: "얼굴 전체, 목 위까지",                clipPct: 84 },
    { id: "mcl", kr: "미디엄 클로즈업 — 가슴 위",   en: "medium close-up shot, chest-up framing, bust portrait, upper torso visible, from chest to crown of head",     desc: "가슴 위 상반신",                      clipPct: 72 },
    { id: "ms",  kr: "미디엄 샷 — 허리 위",         en: "medium shot, waist-up framing, half-body composition, natural conversational distance, from waist to top of head",              desc: "허리 위 상반신",                      clipPct: 58 },
    { id: "cs",  kr: "카우보이 샷 — 허벅지 위",       en: "cowboy shot, thigh-up framing, western three-quarter shot, mid-thigh to crown, action-ready composition",              desc: "허벅지 중간까지 (웨스턴식)",          clipPct: 46 },
    { id: "mfs", kr: "미디엄 풀 샷",      en: "medium full shot, knee-up framing, three-quarter body portrait, full figure with generous headroom, knees to crown",          desc: "무릎 위까지",                         clipPct: 32 },
    { id: "fs",  kr: "풀 바디 샷 — 전신",        en: "full body shot, head-to-toe framing, full-length portrait, entire figure visible, both feet and crown in frame",        desc: "머리끝~발끝 전신",                    clipPct: 0  },
    { id: "ws",  kr: "와이드 샷 — 인물+배경",         en: "wide shot, subject placed within environment, figure and surroundings equally visible, 35mm wide framing, environmental context",        desc: "인물+배경 환경 포함",                 clipPct: 0  },
    { id: "ews", framing: true, kr: "익스트림 와이드",  en: "extreme wide shot, vast environment",     desc: "광활한 배경, 인물 작게"      },
    { id: "est", framing: true, kr: "이스태블리싱 샷",  en: "establishing shot, location context",     desc: "장소·공간 맥락 소개"          },
    { id: "ots", framing: true, kr: "오버 더 숄더",     en: "over-the-shoulder shot",                  desc: "한 인물 어깨 너머 시점"       },
    { id: "pov", framing: true, kr: "POV 샷",           en: "POV shot, first-person perspective",      desc: "인물 시점 1인칭 시선"         },
    { id: "two", framing: true, kr: "투 샷",            en: "two shot, two subjects in frame",         desc: "두 인물을 하나의 프레임에"    },
    { id: "ins", framing: true, kr: "인서트 샷",        en: "insert shot, detail cutaway",             desc: "디테일 강조 삽입 컷"          },
  ],
  height: [
    { id: "bev", kr: "버즈아이 뷰 — 수직 탑다운",     en: "bird's-eye view, directly overhead camera angle, 90-degree top-down perspective, aerial straight-down composition, god's eye viewpoint",                         desc: "완전 수직 하향, 탑뷰",    camPct: 98 },
    { id: "ha",  kr: "하이 앵글 — 위에서 내려봄",       en: "high angle shot, camera positioned above subject looking down, elevated perspective, diminishing subject scale, overhead diagonal view",                         desc: "위에서 비스듬히 내려다봄",camPct: 82 },
    { id: "sla", kr: "슬라이틀리 하이 — 눈높이 살짝 위", en: "slightly high angle, camera marginally above subject eye line, subtle downward tilt, gentle overhead perspective, flattering portrait angle",                   desc: "눈높이보다 약간 위",      camPct: 72 },
    { id: "el",  kr: "아이 레벨 — 자연스러운 눈높이",       en: "camera at eye height, straight-on horizontal angle, neutral perspective, 50mm equivalent eye-level framing, natural human viewpoint",                          desc: "자연스러운 인간 시선",    camPct: 60 },
    { id: "hl",  kr: "힙 레벨 — 허리 높이",         en: "hip level shot, camera positioned at hip height, low-mid angle, slightly upward tilt, dynamic street photography perspective",                                 desc: "허리 높이, 역동적",       camPct: 46 },
    { id: "kl",  kr: "니 레벨 — 무릎 높이",         en: "knee level shot, camera at knee height, low angle upward perspective, powerful subject presence, heroic framing from below",                                   desc: "무릎 높이, 강인한 인상",  camPct: 30 },
    { id: "gl",  kr: "그라운드 레벨",   en: "ground level shot, camera flush with floor, extreme low angle, dramatic upward perspective, gritty urban or intimate ground-up view",                          desc: "바닥 밀착 시점",          camPct: 14 },
    { id: "we",  kr: "웜스아이 뷰 — 바닥서 올려봄",     en: "worm's-eye view, extreme upward camera angle, camera below subject looking straight up, maximum distortion perspective, towering subject scale",               desc: "완전 수직 상향",          camPct: 3  },
  ],
  direction: [
    { id: "fr",  kr: "정면",          en: "front view, directly facing camera, symmetrical frontal composition, subject facing lens straight-on, full facial visibility",                                    desc: "카메라를 향해 정면",        rotateY: 0   },
    { id: "slt", kr: "슬라이틀리 턴", en: "slightly turned, subtle off-axis angle, 15-20 degree body rotation, candid relaxed stance, natural off-center orientation",                                     desc: "살짝 돌린 자연스러운 각도", rotateY: 20  },
    { id: "q3f", kr: "3/4 앞 — 대각선 45°",        en: "three-quarter front view, 45-degree angle toward camera, diagonal body stance, classic portrait composition, cheekbone and jawline definition",                  desc: "약 45° 앞쪽 방향",          rotateY: 45  },
    { id: "dq3", kr: "3/4 앞 (딥)",   en: "deep three-quarter view, 60-70 degree angle, strong diagonal composition, pronounced depth, editorial fashion angle",                                           desc: "60~80° 깊은 사선 각도",     rotateY: 70  },
    { id: "si",  kr: "측면 프로필 — 90°", en: "side profile view, 90-degree lateral angle, full profile silhouette, clean jawline and nose bridge, architectural side composition",                             desc: "완전한 옆모습 프로필",      rotateY: 90  },
    { id: "q3b", kr: "3/4 뒤 — 135°",        en: "three-quarter back view, 135-degree angle, rear diagonal composition, shoulder and nape emphasis, mysterious back-angle portrait",                               desc: "어깨선 강조 후방 사선",     rotateY: 135 },
    { id: "ots", kr: "어깨 너머 시점",     en: "over-the-shoulder angle, looking back over one shoulder, 150-degree rear view, dynamic turning composition, implied motion",                                     desc: "한쪽 어깨 너머 시점",       rotateY: 155 },
    { id: "bk",  kr: "후면",          en: "back view, full rear composition, 180-degree posterior angle, subject facing away from camera, hair and back detail emphasis",                                   desc: "완전한 뒷모습",             rotateY: 180 },
  ],
  lens: [
    { id: "u14",  kr: "울트라 와이드 (14mm)", en: "14mm ultra-wide lens, extreme wide-angle distortion, dramatic perspective exaggeration, architectural barrel distortion, expansive environmental capture",   desc: "극도 광각, 강한 원근 왜곡" },
    { id: "w24",  kr: "와이드 (24mm)",        en: "24mm wide-angle lens, environmental storytelling, moderate perspective distortion, wide depth of field, landscape and interior photography",               desc: "환경 강조, 원근 과장" },
    { id: "w35",  kr: "와이드 (35mm)",        en: "35mm lens, street photography focal length, natural perspective with slight width, documentary realism, Leica reportage style",                           desc: "스트리트·다큐멘터리 느낌" },
    { id: "n50",  kr: "표준 (50mm)",          en: "50mm standard lens, natural human eye perspective, no distortion, clean neutral focal length, classic portrait and street standard",                      desc: "인간 눈과 가장 유사" },
    { id: "p85",  kr: "포트레이트 (85mm)",    en: "85mm portrait lens, flattering facial compression, beautiful background separation, creamy bokeh rendering, minimal skin distortion, golden ratio framing",desc: "인물 왜곡 최소화, 보케 강" },
    { id: "t135", kr: "망원 (135mm)",         en: "135mm telephoto lens, strong background compression, subject isolation, shallow depth of field, compressed spatial depth, intimate long-distance portrait",desc: "배경 압축, 분리감 극대화" },
    { id: "t200", kr: "망원 (200mm+)",        en: "200mm telephoto lens, extreme background compression, subject fully separated from environment, paparazzi distance, maximum bokeh intensity",              desc: "강한 배경 압축·분리" },
    { id: "mac",  kr: "매크로",              en: "macro lens, 1:1 reproduction ratio, extreme close focusing distance, microscopic surface detail, texture and material revelation",                         desc: "1:1 이상 극초근접 촬영" },
    { id: "fis",  kr: "어안 (Fisheye)",      en: "fisheye lens, 180-degree field of view, spherical barrel distortion, curvilinear perspective, immersive wide surround effect",                            desc: "180° 초광각 구면 왜곡" },
    { id: "tls",  kr: "틸트시프트",          en: "tilt-shift lens, selective focus plane, miniature diorama effect, architectural perspective correction, shallow oblique depth of field",                   desc: "미니어처 효과, 선택적 초점면" },
    { id: "ana",  kr: "아나모픽",            en: "anamorphic lens, 2.39:1 cinematic aspect, horizontal lens flares, oval bokeh rendering, cinematic scope look, Hollywood widescreen character",            desc: "와이드 보케, 수평 렌즈플레어" },
    { id: "prm",  kr: "프라임 (단렌즈)",     en: "prime lens, fixed focal length, maximum optical sharpness, superior resolving power, no zoom compromise, purist photographic rendering",                  desc: "고정 화각, 최대 선예도" },
  ],
  focus: [
    { id: "sdf", kr: "얕은 심도 (Shallow DOF)", en: "shallow depth of field, wide aperture f/1.4-f/2.8, subject sharp foreground with blurred background, creamy bokeh separation",                        desc: "배경 보케, 피사체만 선명" },
    { id: "ddf", kr: "깊은 심도 (Deep DOF)",    en: "deep depth of field, narrow aperture f/8-f/16, foreground to background all in focus, landscape sharpness, everything tack-sharp",                   desc: "전경·배경 모두 선명" },
    { id: "bkh", kr: "보케 (Bokeh)",            en: "bokeh background, out-of-focus specular highlights, circular light orbs, smooth background defocus, aesthetic blur rendering",                         desc: "아웃포커스 빛망울 표현" },
    { id: "rck", kr: "랙 포커스",               en: "rack focus, focus pull between two subjects, shifting focal plane, selective depth transition, cinematic focus breathing effect",                       desc: "초점이 피사체 간 이동" },
    { id: "sfc", kr: "소프트 포커스",           en: "soft focus, diffusion filter effect, gentle halation glow, ethereal portrait softness, dreamlike haze, romantic defocus",                              desc: "부드러운 전체 초점" },
    { id: "mof", kr: "모션 블러",               en: "motion blur, slow shutter speed effect, kinetic movement trails, subject in motion, 1/30s or slower exposure, dynamic energy",                        desc: "움직임 블러, 속도감" },
    { id: "lnf", kr: "렌즈 플레어",             en: "lens flare, anamorphic light streaks, sun flare artifacts, optical aberration glow, cinematic light bleeding, JJ Abrams flare style",                 desc: "광원으로 인한 빛 번짐" },
    { id: "dbf", kr: "스플릿 디옵터",           en: "split diopter, simultaneous focus on two distances, dual focal plane, De Palma split focus technique, foreground and background both sharp",           desc: "두 거리에 동시 초점" },
    { id: "dfz", kr: "디포커스",                en: "intentional defocus, full-frame blur, complete out-of-focus rendering, abstract background dominance, deliberate unsharp treatment",                   desc: "의도적 전체 흐림" },
    { id: "hpf", kr: "하이퍼포컬 포커스",       en: "hyperfocal distance focus, maximum depth of field, infinity focus, everything from mid-ground to horizon in sharp focus, landscape maximum clarity",   desc: "최대 심도 확보 초점" },
  ],
  composition: [
    { id: "rot", kr: "삼분할",           en: "rule of thirds composition, subject positioned on grid intersections, off-center placement, natural visual tension, balanced asymmetry",                          desc: "화면을 3×3 격자로 분할" },
    { id: "ctr", kr: "중앙 구도",        en: "centered composition, subject perfectly centered in frame, symmetrical balance, direct confrontational framing, Kubrick-style centrism",                          desc: "피사체를 화면 정중앙에" },
    { id: "dut", kr: "더치 앵글",        en: "Dutch angle, canted camera tilt, diagonal horizon line, psychological unease, disorienting tilt, noir thriller tension composition",                               desc: "기울어진 수평선, 불안감" },
    { id: "sym", kr: "대칭 구도",        en: "perfect symmetrical composition, bilateral mirror balance, architectural symmetry, Wes Anderson symmetry style, geometric harmony",                                desc: "좌우 완전 대칭 균형" },
    { id: "lea", kr: "리딩 룸",          en: "leading room, nose room, directional space in front of subject, gaze direction breathing space, motion anticipation framing",                                      desc: "시선 방향에 여백 확보" },
    { id: "frm", kr: "프레임 인 프레임", en: "frame within frame, natural archway framing, window or doorway border, environmental frame device, layered depth composition",                                     desc: "내부 액자로 피사체 강조" },
    { id: "lln", kr: "리딩 라인",        en: "leading lines, converging perspective lines, diagonal guiding elements, railroad or road lines directing gaze, strong linear composition",                         desc: "시선을 피사체로 유도" },
    { id: "neg", kr: "네거티브 스페이스",en: "negative space composition, vast empty surroundings, minimalist subject isolation, breathing room, lonely figure in expansive emptiness",                          desc: "여백으로 고독·미니멀" },
    { id: "gss", kr: "골든 레이시오",    en: "golden ratio composition, Fibonacci spiral framing, phi grid placement, natural harmonic balance, classical master painting proportion",                           desc: "황금비율 나선형 구도" },
    { id: "dia", kr: "대각선 구도",      en: "diagonal composition, strong diagonal lines across frame, dynamic tension, energy through oblique angles, S-curve or Z-line flow",                                desc: "사선으로 역동성·긴장감" },
    { id: "trc", kr: "삼각형 구도",      en: "triangular composition, stable pyramid structure, three-point anchor arrangement, solid grounded framing, classical Renaissance triangle",                         desc: "안정적인 삼각형 배치" },
    { id: "lay", kr: "레이어링",         en: "layered depth composition, distinct foreground mid-ground and background planes, atmospheric depth, three-dimensional spatial storytelling",                       desc: "전경·중경·배경 층위" },
    { id: "iso", kr: "격리 구도",        en: "isolation composition, single subject against plain background, subject fully separated from context, studio isolation aesthetic, clean negative space",           desc: "피사체를 배경에서 분리" },
    { id: "rul", kr: "룰 브레이킹",      en: "intentional rule-breaking composition, unconventional framing, subject at extreme edge, deliberate imbalance, avant-garde experimental framing",                  desc: "의도적 구도 파괴" },
  ],
  lighting: [
    { id: "frl", kr: "프론트 라이팅",     en: "front lighting, flat frontal illumination, even facial exposure, minimal shadow, beauty and commercial lighting setup, even skin tone rendering",                desc: "정면 조명, 그림자 최소화" },
    { id: "sil", kr: "사이드 라이팅",     en: "side lighting, 90-degree lateral light source, strong chiaroscuro shadow, dramatic facial texture and contour, Caravaggio-style side light",                   desc: "45° 측면, 입체감 극대화" },
    { id: "rml", kr: "렘브란트 라이팅",   en: "Rembrandt lighting, 45-degree upper diagonal light, triangular cheek highlight, classical portrait illumination, Old Masters painting quality",                desc: "45° 상측면, 삼각 하이라이트" },
    { id: "bkl", kr: "백라이팅 (역광)",   en: "backlighting, rim light halo effect, subject silhouette edge glow, contre-jour technique, luminous hair light, atmospheric backlit glow",                       desc: "피사체 윤곽에 빛 테두리" },
    { id: "slt", kr: "실루엣",            en: "silhouette lighting, extreme backlight, complete subject in shadow, bold shape definition only, high contrast shadow form, black figure against bright sky",    desc: "강한 역광, 형태만 표현" },
    { id: "spl", kr: "스플릿 라이팅",     en: "split lighting, face divided exactly in half, 50% light 50% shadow, dramatic left-right division, high contrast dual-tone portrait",                           desc: "얼굴 정확히 반씩 명암" },
    { id: "but", kr: "버터플라이 라이팅", en: "butterfly lighting, Paramount lighting, frontal overhead source, small butterfly shadow beneath nose, glamour Hollywood portrait setup",                         desc: "정면 상단, 코 아래 나비 그림자" },
    { id: "lop", kr: "루프 라이팅",       en: "loop lighting, small loop shadow beside nose, 30-45 degree raised frontal source, commercial beauty standard, most flattering portrait lighting",              desc: "코 옆 작은 루프형 그림자" },
    { id: "top", kr: "탑 라이팅",         en: "top lighting, overhead downward light source, dramatic skull and eye socket shadows, fashion editorial harshness, strong overhead drama",                       desc: "정수리 위에서 내리쬐는 조명" },
    { id: "und", kr: "언더 라이팅",       en: "under lighting, upward light from below, horror inverted shadow, unnatural foreboding glow, monster movie lighting, dramatic theatrical effect",               desc: "아래에서 위로, 공포·극적" },
    { id: "gol", kr: "골든 아워",         en: "golden hour lighting, warm sunrise or sunset light, long soft shadows, amber and orange tones, magic hour photography, cinematic warm glow",                   desc: "일출·일몰 따뜻한 자연광" },
    { id: "blu", kr: "블루 아워",         en: "blue hour lighting, twilight ambient glow, cool indigo and cerulean tones, city lights emerging, pre-dawn or post-sunset atmosphere, quiet melancholy",        desc: "해 뜨기 전·후 청색광" },
    { id: "hrh", kr: "하쉬 라이팅",       en: "harsh direct lighting, hard light source, strong defined shadows, midday sun or bare strobe, high contrast sharp-edged shadows, gritty realism",              desc: "강한 직사광, 선명한 그림자" },
    { id: "sfl", kr: "소프트 라이팅",     en: "soft diffused lighting, large light source, gradual shadow transition, beauty dish or softbox quality, gentle wrap-around illumination",                       desc: "확산광, 부드러운 그림자" },
    { id: "nrl", kr: "내추럴 라이팅",     en: "natural available light, ambient daylight, window light photography, no artificial source, organic unmanipulated illumination, documentary realism",           desc: "태양광·자연광 활용" },
  ],
  movement: [
    { id: "sta", kr: "스태틱",           en: "static shot, locked-off camera, perfectly still tripod frame, no camera movement, composed and stable, deliberate motionless cinematography",                                    desc: "카메라 완전 고정" },
    { id: "pan", kr: "패닝",             en: "pan shot, horizontal camera rotation on fixed axis, sweeping left-to-right or right-to-left, tracking subject laterally, smooth rotational motion",                              desc: "수평축 회전 이동" },
    { id: "tlt", kr: "틸트",             en: "tilt shot, vertical camera rotation on fixed axis, upward reveal or downward scan, slow vertical pan, building reveal from base to top",                                          desc: "수직축 회전 상하" },
    { id: "rol", kr: "롤 (더치 무브)",   en: "roll shot, camera rotating on lens axis, Dutch angle in motion, spinning horizon line, disorienting barrel roll, psychological tension movement",                                 desc: "렌즈 축 회전" },
    { id: "dly", kr: "달리 인/아웃",     en: "dolly shot, camera physically moving forward or backward on rails, smooth tracking push-in or pull-out, depth of field change during movement, cinematic approach",             desc: "카메라 자체 전진·후진" },
    { id: "trk", kr: "트래킹",           en: "tracking shot, camera moving laterally alongside subject, parallel subject follow, traveling shot, smooth side-to-side subject tracking, lateral dolly",                         desc: "피사체 따라 측면 이동" },
    { id: "ped", kr: "페데스탈",         en: "pedestal shot, camera rising or lowering vertically while keeping same directional aim, elevator movement, vertical reveal without tilt",                                        desc: "카메라 수직 상승·하강" },
    { id: "dlz", kr: "달리 줌 (버티고)", en: "dolly zoom, Vertigo effect, simultaneous zoom-out and dolly-in, spatial distortion, background stretches while subject stays constant, Hitchcock zoom",                         desc: "줌+달리 역방향, 공간 왜곡" },
    { id: "orb", kr: "오빗 (아크 샷)",   en: "orbit shot, arc movement around subject, 360-degree circular camera path, revolving around stationary subject, product reveal rotation, hero moment circle",                    desc: "피사체 주위 원형 이동" },
    { id: "hnd", kr: "핸드헬드",         en: "handheld shot, natural camera shake, organic documentary wobble, unstabilized human-carried movement, cinéma vérité realism, shoulder-mount energy",                            desc: "손흔들림, 다큐·현장감" },
    { id: "stb", kr: "스테디캠",         en: "Steadicam shot, fluid gliding movement, mechanically stabilized walk-and-follow, smooth flowing tracking without rails, Kubrick corridor style",                                desc: "흔들림 없는 부드러운 추적" },
    { id: "crn", kr: "크레인 / 지브",    en: "crane shot, jib arm movement, dramatic vertical sweep upward, towering rise to aerial height, God's-eye reveal from ground level, epic scale elevation",                        desc: "높이 변화, 드라마틱 상승" },
    { id: "dra", kr: "드론 (에어리얼)",  en: "drone aerial shot, unmanned aerial vehicle perspective, smooth airborne movement, descending or ascending flight path, cinematic sky-to-ground reveal",                         desc: "항공 시점, 자유로운 이동" },
    { id: "psh", kr: "푸시 인",          en: "push in, slow deliberate camera approach toward subject, gradual intimacy increase, tension building slow creep, methodical forward movement",                                   desc: "천천히 피사체에 접근" },
    { id: "plo", kr: "풀 아웃",          en: "pull back, slow withdrawal from subject, gradual reveal of context, widening perspective, emotional detachment movement, world-reveal pullback",                                 desc: "천천히 피사체에서 후퇴" },
    { id: "swp", kr: "스윕",             en: "sweep shot, wide arcing camera move across environment, landscape sweep, broad environmental traversal, sweeping panoramic motion",                                              desc: "넓은 공간을 쓸듯이 이동" },
    { id: "whp", kr: "휩 팬",            en: "whip pan, ultra-fast horizontal pan, motion blur transition, smear-cut effect, energy-charged rapid direction change, MTV-style snap pan",                                      desc: "초고속 수평 패닝" },
  ],
  rig: [
    { id: "tpd", kr: "트라이포드",         en: "tripod-mounted camera, locked-off stable platform, three-point ground support, maximum stability, no vibration, architectural precision framing",                    desc: "3발 고정 스탠드" },
    { id: "mon", kr: "모노포드",           en: "monopod-supported camera, single-leg stabilizer, semi-mobile stability, sports and event photography rig, quick repositioning capability",                          desc: "1발 스탠드, 이동성+안정성" },
    { id: "sld", kr: "슬라이더",           en: "camera slider, linear rail dolly system, smooth horizontal or vertical translation, tabletop or floor-mounted, precise mechanical movement",                        desc: "직선 레일 이동" },
    { id: "gim", kr: "짐벌",              en: "3-axis gimbal stabilizer, electronic gyroscopic stabilization, mirrorless or cinema camera mounted, buttery smooth handheld movement, DJI RS style",               desc: "3축 전자식 흔들림 보정" },
    { id: "scd", kr: "스테디캠 (Rig)",     en: "Steadicam rig, mechanical counterbalance arm system, operator body-mounted, long fluid gliding takes, hallway and staircase specialty",                            desc: "기계식 흔들림 보정" },
    { id: "jib", kr: "지브 암",            en: "jib arm, counterweighted camera crane, small-scale crane movement, 2-6 meter reach, smooth vertical arc, ground-to-overhead elevation",                           desc: "작은 크레인, 수직 이동" },
    { id: "fpv", kr: "FPV 드론",          en: "FPV racing drone, first-person view aerial, high-speed low-altitude flight, acrobatic maneuvers, kinetic immersive aerial perspective, extreme velocity feel",    desc: "1인칭 초고속 드론 시점" },
    { id: "drc", kr: "시네마 드론",        en: "cinema drone, heavy-lift UAV platform, RED or ARRI camera airborne, stable 4K aerial cinematography, DJI Inspire or Freefly Alta style",                         desc: "고화질 안정적 항공 촬영" },
    { id: "mot", kr: "모션컨트롤",         en: "motion control rig, computer-programmed robotic camera movement, repeatable exact path, VFX plate photography, precision frame-accurate repeatability",            desc: "컴퓨터 제어 반복 가능 무브" },
    { id: "cab", kr: "케이블 캠",          en: "cable cam, wire-suspended camera system, spanning large distances, sports stadium overhead, zipline camera trajectory, high-speed overhead glide",                 desc: "와이어 이동식, 광각" },
    { id: "shl", kr: "숄더 리그",          en: "shoulder-mounted rig, operator shoulder-braced camera, ENG broadcast style, documentary mobility, controlled handheld with added stability",                       desc: "어깨 거치, 핸드헬드+안정성" },
    { id: "uwd", kr: "언더워터 하우징",    en: "underwater housing, waterproof camera enclosure, subaquatic perspective, dome port wide-angle, ocean or pool submersible photography",                            desc: "수중 촬영용 방수 케이스" },
  ],

  // ── 포즈 ──
  pose: [
    // ── 서있기 ──
    { id: "ps01", kr: "S라인 모델 포즈",     en: "model pose, weight shift, S-curve stance",          desc: "골반에 힘 빼고 한쪽 다리에 중심" },
    { id: "ps02", kr: "손 포켓 캐주얼",      en: "hands in pockets, relaxed standing pose",           desc: "자연스럽고 편안한 서있기" },
    { id: "ps03", kr: "팔짱 끼고 서있기",    en: "arms crossed, standing confidently",                desc: "자신감 있는 포즈" },
    { id: "ps04", kr: "한 손 허리",          en: "hand on hip, fashion pose",                         desc: "패션/에디토리얼 정석 포즈" },
    { id: "ps05", kr: "뒤돌아 어깨 돌아보기",en: "looking back over shoulder, turning around",        desc: "트렌디한 반측면 돌아보기" },
    // ── 앉기 ──
    { id: "ps06", kr: "의자에 앉아있기",     en: "sitting on chair, seated pose",                     desc: "자연스러운 착석 자세" },
    { id: "ps07", kr: "바닥에 앉아있기",     en: "sitting on floor, floor seated pose",               desc: "바닥에 편하게 앉은 자세" },
    { id: "ps08", kr: "쪼그리고 하늘 보기",  en: "crouching, looking up at sky, squat pose",          desc: "쪼그려 앉아 위를 바라보는 트렌디 포즈" },
    { id: "ps09", kr: "무릎 꿇고 앉기",      en: "kneeling pose, on one knee",                        desc: "무릎을 꿇은 우아한 자세" },
    // ── 바닥 ──
    { id: "ps10", kr: "바닥에 누워있기",     en: "lying on ground, lying down, reclined pose",        desc: "바닥에 누운 편안한 자세" },
    { id: "ps11", kr: "옆으로 누워있기",     en: "lying on side, side-lying pose",                    desc: "옆으로 누운 모델 포즈" },
    // ── 동적 포즈 ──
    { id: "ps12", kr: "점프",               en: "jumping, mid-air, leaping pose",                    desc: "공중에 떠 있는 역동적 점프" },
    { id: "ps13", kr: "하늘을 나는",        en: "floating, levitating, flying through air",          desc: "공중에 떠서 날아가는 느낌" },
    { id: "ps14", kr: "달리는",             en: "running, sprinting, in full motion",                desc: "전력 질주하는 역동적 포즈" },
    { id: "ps15", kr: "춤추는",             en: "dancing, dynamic dance pose, mid-dance",            desc: "춤 동작 중의 역동적인 순간" },
    { id: "ps16", kr: "스트레칭",           en: "stretching pose, arms raised overhead",             desc: "팔을 뻗는 시원한 스트레칭 자세" },
    // ── 감성/트렌디 ──
    { id: "ps17", kr: "셀카 찍는 포즈",     en: "selfie pose, holding phone up, taking selfie",      desc: "스마트폰 들고 셀카 찍는 포즈" },
    { id: "ps18", kr: "손으로 얼굴 감싸기", en: "hands framing face, cupping face gently",           desc: "양손으로 얼굴을 감싼 감성 포즈" },
    { id: "ps19", kr: "눈 감고 고개 들기",  en: "eyes closed, head tilted up, serene expression",   desc: "눈 감고 위를 향한 평온한 포즈" },
    { id: "ps20", kr: "머리카락 날리는",    en: "hair blowing in wind, windswept, tousled hair",     desc: "바람에 머리카락이 날리는 트렌디 포즈" },
    { id: "ps21", kr: "입술에 손가락",      en: "finger on lips, thinking pose, pensive",            desc: "사색하는 듯한 감성적 포즈" },
    { id: "ps22", kr: "모자 잡고 서있기",   en: "holding hat, hat gesture, casual fashion pose",     desc: "모자를 손으로 잡는 패션 포즈" },
  ],
};

// ── Three.js 3D 프리뷰 ─────────────────────────────────────────────────
function ThreePreview({ clipPct = 0, camPct = 60, rotateY = 0, activeTab, arW = 9, arH = 16, onSvgData }) {
  const [threeLoaded, setThreeLoaded] = useState(true);
  const [threeError, setThreeError] = useState(false); // unused with import
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const figureRef = useRef(null);
  const redCamRef = useRef(null);
  const blueCamRef = useRef(null);
  const clipPlaneRef = useRef(null);
  const blueLineRef = useRef(null);
  const frameRef = useRef(null);

  // Three.js 스크립트 동적 로드 후 초기화
  useEffect(() => {
    const initScene = (THREE) => {
    if (!mountRef.current) return () => {};
    const w = mountRef.current.clientWidth || 186;
    const h = mountRef.current.clientHeight;

    // ── Scene — 스튜디오 공간감 ──
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);  // 다크 스튜디오
    scene.fog = new THREE.Fog(0x111111, 8, 25);    // 깊이감 안개
    sceneRef.current = scene;

    // PerspectiveCamera → 공간감 극대화
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 0.5, 7);
    camera.lookAt(0, -0.3, 0);
    cameraRef.current = camera;

    // Renderer — 그림자 + 고품질
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = 1; // PCFSoftShadowMap
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // ── 스튜디오 조명 ──
    // 키 라이트 (주 조명 - 앞 위)
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(2, 5, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 512;
    keyLight.shadow.mapSize.height = 512;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 20;
    keyLight.shadow.camera.left = -4;
    keyLight.shadow.camera.right = 4;
    keyLight.shadow.camera.top = 6;
    keyLight.shadow.camera.bottom = -3;
    scene.add(keyLight);

    // 필 라이트 (반대편 부드럽게)
    const fillLight = new THREE.DirectionalLight(0xf19eb8, 0.4);
    fillLight.position.set(-3, 2, 2);
    scene.add(fillLight);

    // 림 라이트 (뒤에서 윤곽선) — 정면/후면 구분 핵심
    const rimLight = new THREE.DirectionalLight(0xf19eb8, 0.6);
    rimLight.position.set(0, 3, -5);
    scene.add(rimLight);

    // 앰비언트 (최소)
    scene.add(new THREE.AmbientLight(0x9a8070, 0.8));

    // ── 스튜디오 바닥 — 광택 반사 타일 ──
    const floorGeo = new THREE.PlaneGeometry(12, 20);
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.2;
    floor.receiveShadow = true;
    scene.add(floor);

    // 바닥 그리드 — 원근감 있게
    const gridHelper = new THREE.GridHelper(16, 20, 0x3d1a24, 0x2a1018);
    gridHelper.position.y = -2.19;
    scene.add(gridHelper);

    // ── 배경 벽 ──
    const wallGeo = new THREE.PlaneGeometry(12, 10);
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x151525 });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(0, 2, -5);
    wall.receiveShadow = true;
    scene.add(wall);

    // 바닥 반사 (인물 그림자 효과)
    const shadowGeo = new THREE.CircleGeometry(0.6, 16);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = -2.18;
    scene.add(shadowMesh);

    // 스포트라이트 원 (바닥)
    const spotCircleGeo = new THREE.RingGeometry(0.55, 0.65, 32);
    const spotCircleMat = new THREE.MeshBasicMaterial({ color: 0x9a8070, transparent: true, opacity: 0.4, side: 2 });
    const spotCircle = new THREE.Mesh(spotCircleGeo, spotCircleMat);
    spotCircle.rotation.x = -Math.PI / 2;
    spotCircle.position.y = -2.17;
    scene.add(spotCircle);

    // ── 인물 빌드 — 정면/후면 명확 구분 ──
    const figurePivot = new THREE.Group();
    scene.add(figurePivot);
    figureRef.current = figurePivot;

    // 재질 정의
    const skinMat   = new THREE.MeshLambertMaterial({ color: 0xe8d5e0 }); // 핑크 스킨
    const hairMat   = new THREE.MeshLambertMaterial({ color: 0x1a1a2e }); // 다크 네이비 헤어
    const shirtMat  = new THREE.MeshLambertMaterial({ color: 0xf19eb8 }); // UI 핑크 상의
    const shirtDark = new THREE.MeshLambertMaterial({ color: 0xc87898 }); // 뒷면 구분
    const pantsMat  = new THREE.MeshLambertMaterial({ color: 0x1a1a2e }); // 다크 하의
    const shoesMat  = new THREE.MeshLambertMaterial({ color: 0x0d0d1a }); // 딥 다크 신발
    const goldMat   = new THREE.MeshLambertMaterial({ color: 0xf19eb8 });
    const accentMat = new THREE.MeshLambertMaterial({ color: 0xff6090 }); // 신발 포인트
    const noseMat   = new THREE.MeshLambertMaterial({ color: 0xd8b8c8 });
    const lipMat    = new THREE.MeshLambertMaterial({ color: 0xf19eb8 });
    const eyeWhite  = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const eyeDark   = new THREE.MeshLambertMaterial({ color: 0x1a1a2e });
    const logoMat   = new THREE.MeshLambertMaterial({ color: 0xffffff }); // 가슴 로고

    const add = (geo, mat, x, y, z, parent = figurePivot) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };

    // ── 신발 (앞코가 +Z) ──
    add(new THREE.BoxGeometry(0.32, 0.14, 0.52), shoesMat, -0.20, -2.03, 0.06);
    add(new THREE.BoxGeometry(0.32, 0.14, 0.52), shoesMat,  0.20, -2.03, 0.06);
    // 신발 앞코 포인트 (정면에서 보임)
    add(new THREE.BoxGeometry(0.33, 0.08, 0.18), accentMat, -0.20, -1.98, 0.22);
    add(new THREE.BoxGeometry(0.33, 0.08, 0.18), accentMat,  0.20, -1.98, 0.22);

    // ── 다리 ──
    add(new THREE.CylinderGeometry(0.14, 0.13, 0.9, 10), pantsMat, -0.20, -1.55, 0);
    add(new THREE.CylinderGeometry(0.14, 0.13, 0.9, 10), pantsMat,  0.20, -1.55, 0);
    // 하체
    add(new THREE.BoxGeometry(0.68, 0.50, 0.34), pantsMat, 0, -1.02, 0);

    // ── 몸통 — 앞면(정면)과 뒷면 구분 ──
    // 메인 몸통
    add(new THREE.BoxGeometry(0.90, 0.78, 0.36), shirtMat, 0, -0.38, 0);
    // 가슴 로고/포켓 (정면 +Z쪽에만) → 정면/후면 구분 핵심
    const logo = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.04), logoMat);
    logo.position.set(-0.22, -0.20, 0.20); // +Z = 정면
    figurePivot.add(logo);
    // 로고 심볼 (작은 십자)
    const logoH = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.03, 0.05), shirtMat);
    logoH.position.set(-0.22, -0.20, 0.23);
    figurePivot.add(logoH);
    const logoV = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.10, 0.05), shirtMat);
    logoV.position.set(-0.22, -0.20, 0.23);
    figurePivot.add(logoV);
    // 뒷면 솔기선 (-Z쪽)
    add(new THREE.BoxGeometry(0.04, 0.70, 0.03), shirtDark, 0, -0.38, -0.20);

    // ── 팔 ──
    add(new THREE.CylinderGeometry(0.10, 0.09, 0.68, 8), shirtMat, -0.56, -0.44, 0);
    add(new THREE.CylinderGeometry(0.10, 0.09, 0.68, 8), shirtMat,  0.56, -0.44, 0);
    // 손목/손
    add(new THREE.SphereGeometry(0.09, 8, 8), skinMat, -0.56, -0.82, 0);
    add(new THREE.SphereGeometry(0.09, 8, 8), skinMat,  0.56, -0.82, 0);

    // ── 목 ──
    add(new THREE.CylinderGeometry(0.09, 0.11, 0.24, 10), skinMat, 0, 0.14, 0);

    // ── 머리 ──
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.55, 0);
    figurePivot.add(headGroup);

    // 두상
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.30, 16, 14), skinMat);
    headMesh.castShadow = true;
    headGroup.add(headMesh);

    // ── 얼굴 디테일 (정면 +Z) ──
    // 눈썹
    add(new THREE.BoxGeometry(0.10, 0.025, 0.03), hairMat, -0.10, 0.10, 0.27, headGroup);
    add(new THREE.BoxGeometry(0.10, 0.025, 0.03), hairMat,  0.10, 0.10, 0.27, headGroup);
    // 눈 흰자
    add(new THREE.SphereGeometry(0.042, 8, 6), eyeWhite, -0.10, 0.04, 0.25, headGroup);
    add(new THREE.SphereGeometry(0.042, 8, 6), eyeWhite,  0.10, 0.04, 0.25, headGroup);
    // 눈동자
    add(new THREE.SphereGeometry(0.025, 8, 6), eyeDark, -0.10, 0.04, 0.285, headGroup);
    add(new THREE.SphereGeometry(0.025, 8, 6), eyeDark,  0.10, 0.04, 0.285, headGroup);
    // 코 (정면 돌출)
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.10, 6), noseMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, -0.02, 0.30);
    headGroup.add(nose);
    // 입술
    add(new THREE.BoxGeometry(0.12, 0.03, 0.03), lipMat, 0, -0.10, 0.27, headGroup);

    // ── 귀 (양쪽) ──
    add(new THREE.SphereGeometry(0.06, 8, 6), skinMat, -0.30, 0.00, 0.00, headGroup);
    add(new THREE.SphereGeometry(0.06, 8, 6), skinMat,  0.30, 0.00, 0.00, headGroup);
    // 귀걸이
    add(new THREE.SphereGeometry(0.035, 6, 6), goldMat, -0.33, -0.08, 0.00, headGroup);
    add(new THREE.SphereGeometry(0.035, 6, 6), goldMat,  0.33, -0.08, 0.00, headGroup);

    // ── 머리카락 ──
    // 상단 볼륨
    add(new THREE.SphereGeometry(0.31, 14, 8, 0, Math.PI*2, 0, Math.PI*0.52), hairMat, 0, 0.08, -0.02, headGroup);
    // 앞머리 (정면 +Z에 돌출)
    add(new THREE.BoxGeometry(0.38, 0.10, 0.14), hairMat, 0, 0.26, 0.16, headGroup);
    add(new THREE.BoxGeometry(0.20, 0.08, 0.10), hairMat, -0.14, 0.20, 0.20, headGroup);
    // 옆 머리 (귀 덮음)
    add(new THREE.BoxGeometry(0.08, 0.22, 0.24), hairMat, -0.32, 0.04, 0.00, headGroup);
    add(new THREE.BoxGeometry(0.08, 0.22, 0.24), hairMat,  0.32, 0.04, 0.00, headGroup);
    // 뒷머리
    add(new THREE.BoxGeometry(0.54, 0.30, 0.10), hairMat, 0, 0.08, -0.28, headGroup);

    // ── 빨간 카메라 (샷 범위용) ──
    const redCamGroup = new THREE.Group();
    scene.add(redCamGroup);
    redCamRef.current = redCamGroup;

    const redMat  = new THREE.MeshLambertMaterial({ color: 0xf19eb8 });
    const redDark = new THREE.MeshLambertMaterial({ color: 0xf19eb8 });
    const lensMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });

    // 카메라 바디
    const rcBody = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.30), redMat);
    redCamGroup.add(rcBody);
    // 렌즈
    const rcLens = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.12, 0.18, 12), redDark);
    rcLens.rotation.x = Math.PI / 2;
    rcLens.position.set(0, 0, 0.22);
    redCamGroup.add(rcLens);
    const rcGlass = new THREE.Mesh(new THREE.CircleGeometry(0.08, 12), lensMat);
    rcGlass.position.set(0, 0, 0.32);
    redCamGroup.add(rcGlass);
    // 뷰파인더
    const rcVF = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.10, 0.12), redDark);
    rcVF.position.set(-0.12, 0.22, -0.04);
    redCamGroup.add(rcVF);

    // 샷 범위 클립 라인 (빨간 수평선)
    const clipLineMat = new THREE.LineBasicMaterial({ color: 0xf19eb8, linewidth: 2 });
    const clipLineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1.5, 0, 0.5),
      new THREE.Vector3( 1.5, 0, 0.5),
    ]);
    const clipLine = new THREE.Line(clipLineGeo, clipLineMat);
    scene.add(clipLine);
    clipPlaneRef.current = clipLine;

    // ── 파란 카메라 (카메라 높이용) ──
    const blueCamGroup = new THREE.Group();
    scene.add(blueCamGroup);
    blueCamRef.current = blueCamGroup;

    const blueMat  = new THREE.MeshLambertMaterial({ color: 0xc8b4a0 });
    const blueDark = new THREE.MeshLambertMaterial({ color: 0xb09880 });

    const bcBody = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.30), blueMat);
    blueCamGroup.add(bcBody);
    const bcLens = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.12, 0.18, 12), blueDark);
    bcLens.rotation.x = Math.PI / 2;
    bcLens.position.set(0, 0, 0.22);
    blueCamGroup.add(bcLens);
    const bcGlass = new THREE.Mesh(new THREE.CircleGeometry(0.08, 12), lensMat);
    bcGlass.position.set(0, 0, 0.32);
    blueCamGroup.add(bcGlass);
    const bcVF = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.10, 0.12), blueDark);
    bcVF.position.set(-0.12, 0.22, -0.04);
    blueCamGroup.add(bcVF);

    // 파란 높이 라인 (ref 저장)
    const blueLineMat = new THREE.LineBasicMaterial({ color: 0xc8b4a0, linewidth: 2 });
    const blueLineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1.8, 0, 0.5),
      new THREE.Vector3(-0.7, 0, 0.5),
    ]);
    const blueLineObj = new THREE.Line(blueLineGeo, blueLineMat);
    scene.add(blueLineObj);
    blueLineRef.current = blueLineObj;

    // Resize handler
    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth  || 1;
      const h = mountRef.current.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // 초기 visibility 설정
    redCamRef.current.visible = false;
    blueCamRef.current.visible = false;
    clipPlaneRef.current.visible = false;

    // Render loop
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

      return () => {
        window.removeEventListener('resize', handleResize);
        cancelAnimationFrame(frameRef.current);
        scene.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
            else obj.material.dispose();
          }
        });
        renderer.dispose();
        if (mountRef.current && renderer.domElement.parentNode === mountRef.current) {
          mountRef.current.removeChild(renderer.domElement);
        }
      };
    }; // end initScene

    // Three.js import 방식으로 직접 초기화
    setThreeLoaded(true);
    const cleanup = initScene(THREE);
    return typeof cleanup === 'function' ? cleanup : () => {};
  }, []);

  // ── B안: 카메라 높이 → Three.js 뷰포인트 실제 전환 ──
  useEffect(() => {
    if (!figureRef.current || !cameraRef.current) return;
    try {
      const cam = cameraRef.current;
      const figRotRad = (rotateY * Math.PI) / 180;
      figureRef.current.rotation.y = figRotRad;

      // camPct → PerspectiveCamera 위치 전환
      // 인물 중심 Y≈-0.7 (머리~발 평균)
      const targetY = -0.3;
      if (camPct >= 95) {
        // 버즈아이: 정수리 위 탑뷰
        cam.position.set(0, 8, 0.01);
        cam.up.set(0, 0, -1);
        cam.lookAt(0, targetY, 0);
      } else if (camPct <= 5) {
        // 웜스아이: 발 아래 바텀뷰
        cam.position.set(0, -6, 0.01);
        cam.up.set(0, 0, 1);
        cam.lookAt(0, targetY, 0);
      } else {
        // 중간: camPct 60=아이레벨(정면), 82=하이앵글, 14=로우앵글
        const t = (camPct - 60) / 40; // -1(웜)~+1(버즈) 범위
        const baseZ = 7;
        const camY  = 0.5 + t * 5.5;  // 아이레벨=0.5, 하이앵글=+위, 로우=-아래
        const camZ  = Math.max(1.5, baseZ - Math.abs(t) * 1.5);
        cam.position.set(0, camY, camZ);
        cam.up.set(0, 1, 0);
        cam.lookAt(0, targetY, 0);
      }

      // PerspectiveCamera: aspect 업데이트만
      if (mountRef.current) {
        const w = mountRef.current.clientWidth  || 186;
        const h = mountRef.current.clientHeight || 280;
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      }

      // 파란 카메라 아이콘: height 탭에서만, 버즈/웜스 제외 (탑뷰면 보이지 않음)
      if (blueCamRef.current) {
        const showBlue = (activeTab === "height") && camPct > 5 && camPct < 95;
        blueCamRef.current.visible = showBlue;
        if (showBlue) {
          const figBottom = -2.2, totalH = 4.4;
          const heightY = figBottom + totalH * (camPct / 100);
          blueCamRef.current.position.set(-2.2, heightY, 0.5);
          blueCamRef.current.lookAt(0, heightY, 0);
        }
      }

      // 클립라인/빨간카메라: Three.js에서 숨김 (SVG 오버레이로 처리)
      if (redCamRef.current)   redCamRef.current.visible   = false;
      if (clipPlaneRef.current) clipPlaneRef.current.visible = false;
      if (blueLineRef.current)  blueLineRef.current.visible  = false;

    } catch(e) {}
  }, [clipPct, camPct, rotateY, activeTab]);

  // AR 비율 변경 시 renderer 크기만 재조정 (Three.js 씬은 유지)
  useEffect(() => {
    if (!rendererRef.current || !cameraRef.current || !mountRef.current) return;
    try {
      const w = mountRef.current.clientWidth  || 186;
      const h = mountRef.current.clientHeight || 240;
      rendererRef.current.setSize(w, h);
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
    } catch(e) {}
  }, [arW, arH]);

  // A안: 샷범위 클립라인 + 빨간카메라를 SVG 오버레이로
  // Three.js 줌/시점과 완전히 독립적으로 항상 정확히 보임
  const svgOverlay = (() => {
    if (activeTab !== "shot" || clipPct === 0) return null;
    const W = 186, H = 240;
    // PerspectiveCamera(FOV=45, Z=7, lookAt y=-0.3) 기준 world→screen 변환
    const toScreenY = (wy) => {
      const focal = H / (2 * Math.tan((45 * Math.PI / 180) / 2));
      return H / 2 - (wy - (-0.3)) * focal / 7;
    };
    // 인물 실제 범위: 머리꼭대기=0.87, 발=-2.2
    const figTopPx    = toScreenY(0.87);   // ≈ 72px
    const figBottomPx = toScreenY(-2.2);   // ≈ 199px
    const figH = figBottomPx - figTopPx;   // ≈ 103px
    // clipPct → 위에서 (1-clipPct/100) 지점에 선 그음
    const clipY = figTopPx + figH * (1 - clipPct / 100);
    const camY = Math.min(Math.max(clipY, figTopPx + 10), figBottomPx - 10);
    return (
      <svg
        width={W} height={H}
        style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex: 10 }}
        viewBox={`0 0 ${W} ${H}`}
      >
        {/* 클립 경계선 */}
        <line x1="8" y1={clipY} x2={W - 8} y2={clipY}
          stroke="#f19eb8" strokeWidth="2" strokeDasharray="6,3" opacity="0.9" />
        {/* 클립 아래 음영 */}
        <rect x="0" y={clipY} width={W} height={H - clipY}
          fill="#f19eb8" opacity="0.06" />
        {/* 빨간 카메라 아이콘 — 왼쪽 */}
        <g transform={`translate(10, ${camY - 10})`}>
          {/* 카메라 바디 */}
          <rect x="0" y="3" width="20" height="13" rx="3" fill="#f19eb8" />
          {/* 렌즈 */}
          <circle cx="10" cy="9" r="4" fill="#b02030" />
          <circle cx="10" cy="9" r="2.5" fill="#e0ddd4" opacity="0.75" />
          {/* 뷰파인더 */}
          <rect x="3" y="0" width="7" height="4" rx="1" fill="#b02030" />
          {/* 점선 → 인물 중앙 */}
          <line x1="20" y1="8" x2="60" y2="8"
            stroke="#f19eb8" strokeWidth="1.5" strokeDasharray="3,2" opacity="0.6" />
        </g>
        {/* clipPct 라벨 */}
        <rect x="6" y={clipY - 18} width="52" height="16" rx="4" fill="#f19eb8" />
        <text x="32" y={clipY - 7} textAnchor="middle"
          fontSize="9" fill="#e0ddd4" fontFamily="sans-serif" fontWeight="bold">
          {clipPct}% CROP
        </text>
      </svg>
    );
  })();

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", borderRadius: 8, overflow: "hidden" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
      {svgOverlay}
      {/* 버즈아이/웜스아이 안내 오버레이 */}
      {activeTab === "height" && (camPct >= 95 || camPct <= 5) && (
        <div style={{
          position: "absolute", top: 8, left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(37,99,235,0.85)",
          color: "#e0ddd4", fontSize: 9, fontFamily: "sans-serif",
          fontWeight: 700, letterSpacing: "0.1em",
          padding: "4px 10px", borderRadius: 20, whiteSpace: "nowrap",
          pointerEvents: "none", zIndex: 11,
        }}>
          {camPct >= 95 ? "▼ TOP VIEW" : "▲ BOTTOM VIEW"}
        </div>
      )}
      </div>
  );
}





// ── 포즈 탭 뷰 ────────────────────────────────────────────────────────
const POSE_GROUPS = [
  { label: "서있기 Standing", ids: ["ps01","ps02","ps03","ps04","ps05"] },
  { label: "앉기 Sitting",    ids: ["ps06","ps07","ps08","ps09"] },
  { label: "바닥 Floor",      ids: ["ps10","ps11"] },
  { label: "동적 Dynamic",    ids: ["ps12","ps13","ps14","ps15","ps16"] },
  { label: "감성 Trendy",     ids: ["ps17","ps18","ps19","ps20","ps21","ps22"] },
];

const POSE_ICONS = {
  ps01:"💃", ps02:"🧍", ps03:"🤨", ps04:"🙋", ps05:"↩️",
  ps06:"🪑", ps07:"🧘", ps08:"🦆", ps09:"🙏",
  ps10:"😴", ps11:"🛌",
  ps12:"🦘", ps13:"🕊️", ps14:"🏃", ps15:"🕺", ps16:"🙆",
  ps17:"🤳", ps18:"🤗", ps19:"😌", ps20:"💨", ps21:"🤫", ps22:"🎩",
};

// ── 미드저니 파라미터 프리셋 ──────────────────────────────────────────
const MJ_PARAM_GROUPS = [
  { group: "STYLE", single: true, items: [
    { id: "raw",   label: "RAW",    params: "--style raw",  tip: "AI의 미적 필터 OFF — 날것의 사실적 결과물. 지나친 미화 없이 프롬프트 그대로 표현." },
  ]},
  { group: "--s",  single: true, items: [
    { id: "s0",    label: "S 0",    params: "--s 0",    tip: "스타일화 0 — AI 감성 최소화. 프롬프트에 충실한 결과." },
    { id: "s250",  label: "S 250",  params: "--s 250",  tip: "스타일화 250 — 기본값. 적당한 AI 감성 추가." },
    { id: "s500",  label: "S 500",  params: "--s 500",  tip: "스타일화 500 — 예술적 표현 강화. 색감·구도 자동 보정." },
    { id: "s750",  label: "S 750",  params: "--s 750",  tip: "스타일화 750 — AI가 적극적으로 미적 판단. 화려해짐." },
    { id: "s1000", label: "S 1000", params: "--s 1000", tip: "스타일화 최대 — AI가 마음껏 해석. 프롬프트 벗어날 수 있음." },
  ]},
  { group: "--c",  single: true, items: [
    { id: "c5",    label: "C 5",    params: "--chaos 5",  tip: "카오스 5 — 결과 랜덤성 살짝 추가. 매번 조금씩 다른 결과." },
  ]},
  { group: "--w",  single: true, items: [
    { id: "w5",    label: "W 5",    params: "--w 5",    tip: "Weird 5 — 이상하고 실험적인 요소 미세 추가. 창의적 결과." },
  ]},
  { group: "VER",  single: true, items: [
    { id: "v7",    label: "V 7",    params: "--v 7",    tip: "Midjourney V7 — 최신 모델. 사실적 표현·디테일 최강." },
    { id: "niji7", label: "Niji 7", params: "--niji 7", tip: "Niji 7 — 애니·일러스트 특화 모델. 2D 캐릭터에 최적." },
  ]},
  { group: "--q",  single: true, items: [
    { id: "q2",    label: "Q 2",    params: "--q 2",    tip: "퀄리티 2 — 기본 품질. 생성 빠름." },
    { id: "q4",    label: "Q 4",    params: "--q 4",    tip: "퀄리티 4 — 고품질. 디테일 강화, 생성 시간 2배." },
  ]},
  { group: "--iw", single: true, items: [
    { id: "iw05",  label: "IW 0.5", params: "--iw 0.5", tip: "이미지 가중치 0.5 — 참조 이미지 영향 약하게. 프롬프트 우선." },
    { id: "iw1",   label: "IW 1",   params: "--iw 1",   tip: "이미지 가중치 1 — 참조 이미지와 프롬프트 균형." },
    { id: "iw15",  label: "IW 1.5", params: "--iw 1.5", tip: "이미지 가중치 1.5 — 참조 이미지 영향 강하게." },
    { id: "iw2",   label: "IW 2",   params: "--iw 2",   tip: "이미지 가중치 최대 — 참조 이미지 거의 그대로. 스타일 복제." },
  ]},
  { group: "--p",  single: true, items: [
    { id: "p1",    label: "--p",     params: "--p",      tip: "개인화 모드 — 내 /tune 설정 적용. 미리 설정한 스타일 자동 반영." },
  ]},
];
const MJ_AR_PRESETS = [
  { id: "ar916",  label: "9:16",   params: "--ar 9:16" },
  { id: "ar45",   label: "4:5",    params: "--ar 4:5" },
  { id: "ar34",   label: "3:4",    params: "--ar 3:4" },
  { id: "ar11",   label: "1:1",    params: "--ar 1:1" },
  { id: "ar43",   label: "4:3",    params: "--ar 4:3" },
  { id: "ar169",  label: "16:9",   params: "--ar 16:9" },
  { id: "ar219",  label: "2:1",    params: "--ar 2:1" },
  { id: "ar2391", label: "2.39:1", params: "--ar 239:100" },
];
const MJ_PARAM_PRESETS = MJ_PARAM_GROUPS.flatMap(g => g.items);

const SUBJECT_TYPES = [
  {
    id: "person", kr: "인물", icon: "👤",
    object: "person",
    keywords: {
      height: [
        { phi: [0,12],    kr: "버즈아이 뷰 — 수직 탑다운",       en: "bird's-eye view" },
        { phi: [12,30],   kr: "하이 앵글 — 위에서 내려봄",       en: "high angle shot" },
        { phi: [30,50],   kr: "슬라이틀리 하이 — 눈높이 살짝 위", en: "slightly high angle" },
        { phi: [50,70],   kr: "아이 레벨 — 자연스러운 눈높이",   en: "eye level" },
        { phi: [70,90],   kr: "힙 레벨 — 허리 높이",             en: "hip level" },
        { phi: [90,115],  kr: "니 레벨 — 무릎 높이",             en: "knee level" },
        { phi: [115,180], kr: "웜스아이 뷰 — 바닥서 올려봄",     en: "worm's-eye view" },
      ],
      direction: [
        { theta: [0,18],    kr: "정면",              en: "facing camera" },
        { theta: [18,45],   kr: "살짝 턴 (15°)",     en: "slightly turned" },
        { theta: [45,80],   kr: "3/4 앞 — 대각선 45°", en: "three-quarter view" },
        { theta: [80,100],  kr: "측면 프로필 — 90°", en: "side profile" },
        { theta: [100,135], kr: "3/4 뒤 — 135°",     en: "three-quarter back view" },
        { theta: [135,165], kr: "어깨 너머 시점",     en: "over-the-shoulder" },
        { theta: [165,180], kr: "후면",               en: "back view" },
      ],
      shot: [
        { r: [0,0.25],    kr: "익스트림 클로즈업 — 눈/입 단독", en: "extreme close-up" },
        { r: [0.25,0.42], kr: "클로즈업 — 얼굴+목",            en: "close-up shot" },
        { r: [0.42,0.57], kr: "미디엄 클로즈업 — 가슴 위",     en: "medium close-up, chest-up" },
        { r: [0.57,0.68], kr: "미디엄 샷 — 허리 위",           en: "medium shot, waist-up" },
        { r: [0.68,0.78], kr: "카우보이 샷 — 허벅지 위",       en: "cowboy shot, thigh-up" },
        { r: [0.78,0.88], kr: "풀 바디 샷 — 전신",             en: "full body shot" },
        { r: [0.88,1],    kr: "와이드 샷 — 인물+배경",         en: "wide shot" },
      ],
    },
  },
  {
    id: "place", kr: "실내/공간", icon: "🏠",
    object: "building",
    keywords: {
      height: [
        { phi: [0,18],    kr: "천장 뷰 (CCTV)",  en: "ceiling angle, top-down" },
        { phi: [18,40],   kr: "하이 코너 뷰",    en: "high corner angle" },
        { phi: [40,62],   kr: "스탠딩 하이",     en: "standing high angle" },
        { phi: [62,85],   kr: "아이 레벨",       en: "eye level" },
        { phi: [85,110],  kr: "로우 앵글",       en: "low angle" },
        { phi: [110,180], kr: "그라운드 레벨",   en: "ground level" },
      ],
      direction: [
        { theta: [0,30],    kr: "정면",      en: "straight-on" },
        { theta: [30,75],   kr: "사선 뷰",   en: "diagonal view" },
        { theta: [75,110],  kr: "코너 뷰",   en: "corner view" },
        { theta: [110,150], kr: "후방 코너", en: "rear corner" },
        { theta: [150,180], kr: "후면",      en: "rear-facing" },
      ],
      shot: [
        { r: [0,0.35],   kr: "디테일 텍스처",      en: "detail close-up" },
        { r: [0.35,0.55],kr: "오브젝트 샷",         en: "object shot" },
        { r: [0.55,0.72],kr: "룸 샷",               en: "room shot" },
        { r: [0.72,0.86],kr: "와이드 룸",           en: "wide interior" },
        { r: [0.86,1],   kr: "파노라마 인테리어",   en: "interior panoramic" },
      ],
    },
  },
  {
    id: "product", kr: "제품", icon: "📦",
    object: "cosmetic",
    keywords: {
      height: [
        { phi: [0,15],    kr: "탑 뷰 / 플랫레이", en: "flat lay, top-down" },
        { phi: [15,35],   kr: "오버헤드",          en: "overhead angle" },
        { phi: [35,55],   kr: "45도 스튜디오",     en: "45-degree product angle" },
        { phi: [55,78],   kr: "아이 레벨",         en: "eye level" },
        { phi: [78,110],  kr: "로우 앵글",         en: "low angle, upward perspective" },
        { phi: [110,180], kr: "언더 뷰",           en: "bottom-up angle" },
      ],
      direction: [
        { theta: [0,22],    kr: "정면",      en: "front face" },
        { theta: [22,60],   kr: "3/4 뷰",    en: "three-quarter view" },
        { theta: [60,100],  kr: "측면",      en: "side profile" },
        { theta: [100,148], kr: "후방 3/4",  en: "rear three-quarter" },
        { theta: [148,180], kr: "후면",      en: "rear view" },
      ],
      shot: [
        { r: [0,0.28],   kr: "매크로 디테일", en: "macro detail" },
        { r: [0.28,0.48],kr: "파트 클로즈업", en: "partial close-up" },
        { r: [0.48,0.65],kr: "제품 클로즈업", en: "close-up" },
        { r: [0.65,0.82],kr: "제품 샷",       en: "product shot" },
        { r: [0.82,0.92],kr: "라이프스타일",  en: "lifestyle shot" },
        { r: [0.92,1],   kr: "그룹 샷",       en: "group shot" },
      ],
    },
  },

  {
    id: "landscape", kr: "풍경/자연", icon: "🌅",
    object: "terrain",
    keywords: {
      height: [
        { phi: [0,18],    kr: "항공 뷰",    en: "aerial view" },
        { phi: [18,40],   kr: "드론 하이",  en: "high drone perspective" },
        { phi: [40,62],   kr: "하이 앵글", en: "high angle" },
        { phi: [62,82],   kr: "아이 레벨", en: "eye level" },
        { phi: [82,110],  kr: "로우 앵글", en: "low angle" },
        { phi: [110,180], kr: "그라운드 레벨", en: "ground level" },
      ],
      direction: [
        { theta: [0,35],   kr: "정면",      en: "straight-on" },
        { theta: [35,80],  kr: "사선",      en: "diagonal angle" },
        { theta: [80,120], kr: "측면",      en: "lateral view" },
        { theta: [120,165],kr: "후방 사선", en: "rear diagonal" },
        { theta: [165,180],kr: "후면",      en: "rear-facing" },
      ],
      shot: [
        { r: [0,0.35],   kr: "자연 디테일",         en: "nature detail" },
        { r: [0.35,0.55],kr: "미디엄 랜드스케이프",  en: "medium landscape" },
        { r: [0.55,0.72],kr: "와이드 랜드스케이프",  en: "wide landscape" },
        { r: [0.72,0.86],kr: "익스트림 와이드",      en: "extreme wide" },
        { r: [0.86,1],   kr: "시네마틱 파노라마",    en: "cinematic panoramic" },
      ],
    },
  },
];

// 피사체별 기본 주체 (B안)
const DEFAULT_SUBJECT_PROMPTS = {
  person:    "a person",
  place:     "interior of a modern living room",
  product:   "a product on clean white background",
  landscape: "a natural landscape scene",

};

// 캐릭터 스타일 프리셋


// ── LIGHTING 그룹 ─────────────────────────────────────────
const LIGHTING_GROUPS = [
  {
    id: "direction", label: "방향", en: "DIRECTION",
    tags: [
      { en: "front lighting",    kr: "정면광 — 얼굴 균일하게" },
      { en: "side lighting",     kr: "측면광 — 입체감·드라마틱" },
      { en: "backlighting",      kr: "역광 — 실루엣·빛 번짐" },
      { en: "rim lighting",      kr: "윤곽광 — 피사체 테두리 빛" },
      { en: "top lighting",      kr: "탑라이트 — 위에서 내리쬐기" },
      { en: "under lighting",    kr: "아래광 — 공포·신비 느낌" },
      { en: "butterfly lighting",kr: "나비조명 — 코 아래 그림자" },
      { en: "rembrandt lighting",kr: "렘브란트 — 삼각 그림자" },
    ],
  },
  {
    id: "time", label: "시간/분위기", en: "AMBIENCE",
    tags: [
      { en: "golden hour",       kr: "골든아워 — 일출·일몰 황금빛" },
      { en: "blue hour",         kr: "블루아워 — 새벽·해질녘 푸른빛" },
      { en: "midday sun",        kr: "한낮 — 강한 직사광" },
      { en: "overcast light",    kr: "흐린날 — 부드러운 확산광" },
      { en: "candlelight",       kr: "촛불 — 따뜻한 흔들리는 빛" },
      { en: "neon light",        kr: "네온광 — 도시 야경 컬러빛" },
      { en: "moonlight",         kr: "달빛 — 차갑고 신비로운" },
      { en: "studio lighting",   kr: "스튜디오 — 인공 균형광" },
    ],
  },
  {
    id: "intensity", label: "강도/대비", en: "INTENSITY",
    tags: [
      { en: "high key lighting", kr: "하이키 — 밝고 평탄, 그림자 없음" },
      { en: "low key lighting",  kr: "로우키 — 어둡고 강한 명암" },
      { en: "dramatic lighting", kr: "드라마틱 — 강렬한 명암 대비" },
      { en: "soft lighting",     kr: "소프트 — 부드럽고 균일한 빛" },
      { en: "harsh lighting",    kr: "하드 — 선명한 그림자" },
      { en: "diffused lighting", kr: "확산광 — 방향 없는 은은한 빛" },
    ],
  },
];

// ── MOOD 그룹 ──────────────────────────────────────────────
const MOOD_GROUPS = [
  {
    id: "emotion", label: "감정", en: "EMOTION",
    tags: [
      { en: "joyful",       kr: "즐거운" },
      { en: "serene",       kr: "평화로운" },
      { en: "hopeful",      kr: "희망적인" },
      { en: "romantic",     kr: "로맨틱한" },
      { en: "nostalgic",    kr: "향수어린" },
      { en: "melancholic",  kr: "우울한" },
      { en: "lonely",       kr: "고독한" },
      { en: "anxious",      kr: "불안한" },
      { en: "tense",        kr: "긴장감있는" },
      { en: "mysterious",   kr: "신비로운" },
      { en: "horror",       kr: "공포스러운" },
      { en: "ecstatic",     kr: "황홀한" },
      { en: "warm",         kr: "따뜻한" },
      { en: "blissful",     kr: "행복한" },
    ],
  },
  {
    id: "atmosphere", label: "분위기", en: "ATMOSPHERE",
    tags: [
      { en: "ethereal",     kr: "신비로운" },
      { en: "dreamy",       kr: "몽환적인" },
      { en: "mystical",     kr: "신비한" },
      { en: "calm",         kr: "차분한" },
      { en: "dark",         kr: "어두운" },
      { en: "moody",        kr: "무거운" },
      { en: "pensive",      kr: "사색적인" },
      { en: "spectral",     kr: "유령같은" },
      { en: "otherworldly", kr: "이세계같은" },
      { en: "enchanted",    kr: "마법같은" },
      { en: "dramatic",     kr: "극적인" },
      { en: "intimate",     kr: "친밀한" },
      { en: "raw",          kr: "날것의" },
      { en: "whimsical",    kr: "기발한" },
    ],
  },
  {
    id: "color_temp", label: "색온도/톤", en: "COLOR TONE",
    tags: [
      { en: "warm tone",    kr: "따뜻한톤" },
      { en: "cool tone",    kr: "차가운톤" },
      { en: "vivid",        kr: "비비드" },
      { en: "pastel",       kr: "파스텔" },
      { en: "muted",        kr: "뮤트" },
      { en: "neon",         kr: "네온" },
      { en: "monochromatic",kr: "단색조" },
      { en: "high contrast",kr: "하이콘트라스트" },
      { en: "gradient",     kr: "그라데이션" },
      { en: "earth tones",  kr: "어스톤" },
      { en: "golden",       kr: "황금빛" },
      { en: "desaturated",  kr: "탈채도" },
    ],
  },
];

// ── STYLE 그룹 ──────────────────────────────────────────────
const STYLE_GROUPS = [
  {
    id: "rendering", label: "렌더링", en: "RENDERING",
    tags: [
      { en: "cinematic",       kr: "시네마틱",    free: true  },
      { en: "photorealistic",  kr: "포토리얼",    free: true  },
      { en: "editorial",       kr: "화보연출",    free: true  },
      { en: "illustration",    kr: "일러스트",    free: true },
      { en: "3D rendering",    kr: "3D렌더링",    free: true },
      { en: "hyperrealistic",  kr: "극사실적",    free: true },
      { en: "film grain",      kr: "필름그레인",  free: true },
      { en: "analog photo",    kr: "아날로그사진", free: true },
      { en: "RAW photo",       kr: "RAW사진",     free: true },
    ],
  },
  {
    id: "genre", label: "장르/세계관", en: "GENRE",
    tags: [
      { en: "surreal",          kr: "초현실",      free: true  },
      { en: "cyberpunk",        kr: "사이버펑크",  free: true  },
      { en: "fantastical",      kr: "환상적",      free: true },
      { en: "dreamcore",        kr: "드림코어",    free: true },
      { en: "vaporwave",        kr: "베이퍼웨이브", free: true },
      { en: "y2k",              kr: "Y2K감성",     free: true },
      { en: "neon noir",        kr: "네온누아르",  free: true },
      { en: "post-apocalyptic", kr: "포스트아포칼립틱", free: true },
      { en: "cottagecore",      kr: "코티지코어",  free: true },
      { en: "dark academia",    kr: "다크아카데미아", free: true },
      { en: "solarpunk",        kr: "솔라펑크",    free: true },
      { en: "sci-fi",           kr: "SF풍",        free: true },
    ],
  },
  {
    id: "design", label: "디자인", en: "DESIGN",
    tags: [
      { en: "minimal",          kr: "미니멀",      free: true  },
      { en: "elegant",          kr: "우아한",      free: true  },
      { en: "retro",            kr: "레트로",      free: true },
      { en: "modern",           kr: "모던",        free: true },
      { en: "geometric",        kr: "기하학적",    free: true },
      { en: "organic",          kr: "유기적",      free: true },
      { en: "abstract",         kr: "추상적",      free: true },
      { en: "pop art",          kr: "팝아트",      free: true },
      { en: "bauhaus",          kr: "바우하우스",  free: true },
      { en: "art nouveau",      kr: "아르누보",    free: true },
    ],
  },
];

// flat 배열 (기존 코드 호환용)
const MOOD_TAGS = MOOD_GROUPS.flatMap(g => g.tags);
const STYLE_TAGS = STYLE_GROUPS.flatMap(g => g.tags.map(t => ({ ...t, free: t.free ?? true })));

// phi/theta/r → 키워드 역산
function resolveKeywords(phi, theta, r, subjectType) {
  const kw = subjectType.keywords;
  const absTheta = Math.abs(theta);

  const hItem = kw.height.find(k => phi >= k.phi[0] && phi < k.phi[1]) || kw.height[kw.height.length-1];
  const dItem = kw.direction.find(k => absTheta >= k.theta[0] && absTheta < k.theta[1]) || kw.direction[kw.direction.length-1];
  const sItem = kw.shot.find(k => r >= k.r[0] && r < k.r[1]) || kw.shot[kw.shot.length-1];

  return { height: hItem, direction: dItem, shot: sItem };
}

// ── 3D 오브젝트 빌더 ──
function buildSubjectObject(THREE, type, scene, proportions = {head:1.4, body:1.0, legs:1.0}) {
  const group = new THREE.Group();

  if (type === "person") {
    const skin = new THREE.MeshLambertMaterial({ color: 0xe8d5e0 });
    const shirt = new THREE.MeshLambertMaterial({ color: 0xf19eb8 });
    const pants = new THREE.MeshLambertMaterial({ color: 0x1a1a2e });
    const hair = new THREE.MeshLambertMaterial({ color: 0x1a1a2e });
    const shoes = new THREE.MeshLambertMaterial({ color: 0x0d0d1a });
    const eye = new THREE.MeshLambertMaterial({ color: 0x1a1a2e });
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x,y,z); group.add(m);
    };
    add(new THREE.BoxGeometry(0.28,0.12,0.4), shoes, -0.15,-0.88,0.05);
    add(new THREE.BoxGeometry(0.28,0.12,0.4), shoes,  0.15,-0.88,0.05);
    add(new THREE.CylinderGeometry(0.11,0.10,0.65,8), pants, -0.15,-0.57,0);
    add(new THREE.CylinderGeometry(0.11,0.10,0.65,8), pants,  0.15,-0.57,0);
    add(new THREE.BoxGeometry(0.52,0.38,0.26), pants, 0,-0.18,0);
    add(new THREE.BoxGeometry(0.64,0.55,0.28), shirt, 0, 0.22,0);
    add(new THREE.CylinderGeometry(0.08,0.07,0.48,8), shirt, -0.40,-0.02,0);
    add(new THREE.CylinderGeometry(0.08,0.07,0.48,8), shirt,  0.40,-0.02,0);
    add(new THREE.CylinderGeometry(0.07,0.08,0.16,8), skin, 0, 0.56,0);
    const head = new THREE.Group(); head.position.set(0,0.82,0); group.add(head);
    const headSphere = new THREE.Mesh(new THREE.SphereGeometry(0.22,14,12), skin);
    head.add(headSphere);
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.03,6,6), eye); eyeL.position.set(-0.08,0.03,0.20); head.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.03,6,6), eye); eyeR.position.set( 0.08,0.03,0.20); head.add(eyeR);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.025,0.07,6), skin); nose.rotation.x=Math.PI/2; nose.position.set(0,-0.02,0.22); head.add(nose);
    const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.225,14,8,0,Math.PI*2,0,Math.PI*0.5), hair);
    hairTop.position.set(0, 0.05, -0.01);
    head.add(hairTop);
  }

  else if (type === "building") {
    // 실내 방 — 3면 열린 코너뷰 (CCTV/광각 인테리어)
    const dbl  = 2; // DoubleSide
    const wMat = new THREE.MeshLambertMaterial({ color: 0xeee8d8, side: dbl });
    const fMat = new THREE.MeshLambertMaterial({ color: 0xc8b490, side: dbl });
    const cMat = new THREE.MeshLambertMaterial({ color: 0xf4f0e4, side: dbl });
    const winMat = new THREE.MeshLambertMaterial({ color: 0x88bbdd, transparent:true, opacity:0.45, side:dbl });
    const sofaM  = new THREE.MeshLambertMaterial({ color: 0x5a6e82 });
    const tableM = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
    const rugM   = new THREE.MeshLambertMaterial({ color: 0xaa7755, side:dbl });

    const W=2.4, H=1.8, D=2.4;
    const add = (geo,mat,x,y,z,rx=0,ry=0) => {
      const m=new THREE.Mesh(geo,mat);
      m.position.set(x,y,z);
      if(rx) m.rotation.x=rx;
      if(ry) m.rotation.y=ry;
      group.add(m);
    };

    // 바닥
    add(new THREE.PlaneGeometry(W,D), fMat, 0,-H/2,0, -Math.PI/2);
    // 천장
    add(new THREE.PlaneGeometry(W,D), cMat, 0,H/2,0, Math.PI/2);
    // 뒷벽 (Z-)
    add(new THREE.PlaneGeometry(W,H), wMat, 0,0,-D/2);
    // 왼쪽벽 (X-)
    add(new THREE.PlaneGeometry(D,H), wMat, -W/2,0,0, 0,Math.PI/2);
    // 오른쪽벽 창문 — 위아래 두 패널 + 창문
    add(new THREE.PlaneGeometry(D, H*0.28), wMat,  W/2, H*0.36, 0, 0,-Math.PI/2);
    add(new THREE.PlaneGeometry(D, H*0.28), wMat,  W/2,-H*0.36, 0, 0,-Math.PI/2);
    add(new THREE.PlaneGeometry(D*0.6, H*0.36), winMat, W/2, 0, 0, 0,-Math.PI/2);

    // 바닥 러그
    add(new THREE.PlaneGeometry(1.0,0.7), rugM, -0.1,-H/2+0.01,0.2, -Math.PI/2);

    // 소파 (뒷벽 앞)
    add(new THREE.BoxGeometry(1.1,0.22,0.44), sofaM, -0.1,-H/2+0.14,-D/2+0.32);
    add(new THREE.BoxGeometry(1.1,0.38,0.12), sofaM, -0.1,-H/2+0.22,-D/2+0.12);
    add(new THREE.BoxGeometry(0.14,0.38,0.44), sofaM, -0.68,-H/2+0.22,-D/2+0.32);
    add(new THREE.BoxGeometry(0.14,0.38,0.44), sofaM,  0.48,-H/2+0.22,-D/2+0.32);
    // 쿠션
    add(new THREE.BoxGeometry(0.22,0.18,0.10),
      new THREE.MeshLambertMaterial({color:0xddbbaa}),
      -0.3,-H/2+0.30,-D/2+0.20);

    // 커피테이블
    add(new THREE.BoxGeometry(0.55,0.05,0.32), tableM,  -0.1,-H/2+0.22, 0.16);
    add(new THREE.BoxGeometry(0.04,0.22,0.04), tableM,  -0.32,-H/2+0.11, 0.04);
    add(new THREE.BoxGeometry(0.04,0.22,0.04), tableM,   0.12,-H/2+0.11, 0.04);
    add(new THREE.BoxGeometry(0.04,0.22,0.04), tableM,  -0.32,-H/2+0.11, 0.28);
    add(new THREE.BoxGeometry(0.04,0.22,0.04), tableM,   0.12,-H/2+0.11, 0.28);

    // 천장 조명
    add(new THREE.CylinderGeometry(0.14,0.11,0.06,12),
      new THREE.MeshLambertMaterial({color:0xffffee, emissive:0xffffcc, emissiveIntensity:0.5}),
      0.1,H/2-0.05,-0.15);
  }

  else if (type === "cosmetic") {
    // 화장품 보틀 — 유리 같은 반투명 용기 + 골드 캡
    const glass   = new THREE.MeshLambertMaterial({ color: 0xe8e0f0, transparent: true, opacity: 0.82 });
    const glassDk = new THREE.MeshLambertMaterial({ color: 0xc8b8e0, transparent: true, opacity: 0.9 });
    const cap     = new THREE.MeshLambertMaterial({ color: 0xd4a847 }); // 골드 캡
    const capDk   = new THREE.MeshLambertMaterial({ color: 0xa07820 });
    const label   = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
    const labelTx = new THREE.MeshLambertMaterial({ color: 0x8866aa }); // 라벨 텍스트 컬러
    const base    = new THREE.MeshLambertMaterial({ color: 0x1a1a2a }); // 바닥 면
    const pump    = new THREE.MeshLambertMaterial({ color: 0xc0a030 }); // 펌프 헤드

    const add = (geo, mat, x, y, z, rx=0, ry=0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      if (rx) m.rotation.x = rx;
      if (ry) m.rotation.y = ry;
      m.castShadow = true;
      group.add(m);
      return m;
    };

    // ── 보틀 바디 (아래가 넓고 위로 갈수록 살짝 좁아지는 형태) ──
    add(new THREE.CylinderGeometry(0.28, 0.32, 1.10, 24), glass,   0,  0,     0);
    // 바디 하이라이트 (앞면 반사)
    add(new THREE.CylinderGeometry(0.06, 0.07, 0.90, 8), glassDk,  0.18, 0, 0.22);

    // ── 보틀 바닥 ──
    add(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 24), base, 0, -0.57, 0);

    // ── 라벨 (앞면 중앙) ──
    add(new THREE.CylinderGeometry(0.285, 0.315, 0.55, 24, 1, false, -0.6, 1.2), label, 0, -0.05, 0);
    // 라벨 텍스트 라인 (세 줄)
    add(new THREE.BoxGeometry(0.30, 0.025, 0.04), labelTx, 0,  0.08, 0.29);
    add(new THREE.BoxGeometry(0.20, 0.018, 0.04), labelTx, 0, -0.01, 0.29);
    add(new THREE.BoxGeometry(0.24, 0.018, 0.04), labelTx, 0, -0.09, 0.29);

    // ── 넥 (보틀 목) ──
    add(new THREE.CylinderGeometry(0.14, 0.26, 0.22, 20), glass, 0, 0.66, 0);

    // ── 골드 캡 링 ──
    add(new THREE.CylinderGeometry(0.155, 0.155, 0.06, 20), cap, 0, 0.80, 0);

    // ── 펌프 헤드 & 스템 ──
    add(new THREE.CylinderGeometry(0.12, 0.14, 0.18, 16), capDk, 0, 0.95, 0); // 펌프 바디
    add(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 8),  pump,  0, 1.21, 0); // 스템
    // 펌프 헤드 (꺾인 노즐)
    const head = add(new THREE.CylinderGeometry(0.06, 0.06, 0.10, 12), cap,  0.08, 1.45, 0);
    add(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 8), pump, 0.14, 1.45, 0); // 노즐
  }

  else if (type === "terrain") {
    const grass = new THREE.MeshLambertMaterial({ color: 0x4a7a3a });
    const rock  = new THREE.MeshLambertMaterial({ color: 0x888878 });
    const water = new THREE.MeshLambertMaterial({ color: 0x3a6aaa, transparent:true, opacity:0.8 });
    const snow  = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const add = (geo,mat,x,y,z) => { const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); group.add(m); };
    add(new THREE.CylinderGeometry(0.9,1.0,0.2,12), grass, 0,-0.5,0);
    add(new THREE.ConeGeometry(0.45,0.9,8), rock, -0.2,0.05,0);
    add(new THREE.ConeGeometry(0.30,0.65,8), rock,  0.25,0.0,0.1);
    add(new THREE.SphereGeometry(0.12,8,6), snow, -0.2,0.52,0);
    add(new THREE.SphereGeometry(0.08,8,6), snow,  0.25,0.38,0.1);
    add(new THREE.CylinderGeometry(0.3,0.32,0.06,12), water, 0.3,-0.42,-0.3);
  }


  scene.add(group);
  return group;
}


// ── 툴팁 컴포넌트 ─────────────────────────────────────────
function Tooltip({ text, children }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef(null);

  const show = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top - 8 });
    setVisible(true);
  };
  const hide = () => setVisible(false);

  return (
    <span ref={ref} style={{ position:"relative", display:"inline-flex", alignItems:"center" }}
      onMouseEnter={show} onMouseLeave={hide} onTouchStart={show} onTouchEnd={hide}>
      {children}
      {visible && (
        <div style={{
          position:"fixed",
          left: pos.x,
          top: pos.y,
          transform:"translate(-50%, -100%)",
          background:"#1a1a2e",
          border:"1px solid #f19eb8",
          borderRadius:7,
          padding:"7px 11px",
          maxWidth:220,
          fontSize:11,
          color:"#e0ddd4",
          fontFamily:"sans-serif",
          lineHeight:1.5,
          zIndex:9999,
          pointerEvents:"none",
          boxShadow:"0 4px 20px rgba(0,0,0,0.6)",
          whiteSpace:"normal",
          textAlign:"left",
        }}>
          {text}
          <div style={{
            position:"absolute", bottom:-6, left:"50%", transform:"translateX(-50%)",
            width:10, height:6, overflow:"hidden",
          }}>
            <div style={{ width:10, height:10, background:"#f19eb8", transform:"rotate(45deg) translate(-3px,-3px)" }} />
          </div>
        </div>
      )}
    </span>
  );
}

// ── ? 아이콘 버튼 ─────────────────────────────────────────
function TipIcon({ tip }) {
  if (!tip) return null;
  return (
    <Tooltip text={tip}>
      <span style={{
        display:"inline-flex", alignItems:"center", justifyContent:"center",
        width:13, height:13, borderRadius:"50%",
        border:"1px solid #444", color:"#666",
        fontSize:8, fontFamily:"sans-serif", fontWeight:900,
        cursor:"help", marginLeft:3, flexShrink:0,
        userSelect:"none",
      }}>?</span>
    </Tooltip>
  );
}

// ── InteractiveMode 컴포넌트 ──
function InteractiveMode({ langKR }) {
  const [subjectIdx, setSubjectIdx] = useState(0);
  const subject = SUBJECT_TYPES[subjectIdx];
  const [subjectText, setSubjectText] = useState(DEFAULT_SUBJECT_PROMPTS["person"]);
  const [drawerOpen, setDrawerOpen] = useState(null);
  const [selectedLighting, setSelectedLighting] = useState([]);
  const [selectedQuality, setSelectedQuality] = useState([]);
  const [activePreset, setActivePreset] = useState(null);
  const [mjSelectedParams, setMjSelectedParams] = useState(new Set()); // Set of param IDs
  const [selectedLens, setSelectedLens] = useState(null);
  const [selectedFocus, setSelectedFocus] = useState(null);
  const [selectedComposition, setSelectedComposition] = useState(null);
  const [selectedMovementKw, setSelectedMovementKw] = useState(null);
  const [selectedRigKw, setSelectedRigKw] = useState(null);
  const [kwPanelTab, setKwPanelTab] = useState("shot"); // shot | lens | focus | comp | move | rig // { groupName: itemId }
  const [mjArParam, setMjArParam] = useState(null); // AR preset id
  const [mjCustomParam, setMjCustomParam] = useState("");
  // legacy compat
  const mjParamPreset = "none";
  const setMjParamPreset = () => {};
  const animRef = useRef(null);

  // 프리셋 클릭 → 부드러운 애니메이션으로 이동
  const applyPreset = (preset) => {
    setActivePreset(preset.id);
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const startPhi = phi, startTheta = theta, startR = r;
    const endPhi = preset.phi, endTheta = preset.theta, endR = preset.r;
    const duration = 500;
    const startTime = performance.now();
    const animate = (now) => {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
      setPhi(startPhi + (endPhi - startPhi) * ease);
      setTheta(startTheta + (endTheta - startTheta) * ease);
      setR(startR + (endR - startR) * ease);
      if (t < 1) animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
  };
  const [bookmarks, setBookmarks] = useState([]);
  const [showBookmarks, setShowBookmarks] = useState(false);

  // ── 커스텀 앵글 프리셋 ──
  const [customPresets, setCustomPresets] = useState([]);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState("");

  // ── 앱 시작 시 저장된 북마크 불러오기 ──
  useEffect(() => {
    const loadBookmarks = async () => {
      try {
        const result = await window.storage.get("ck_bookmarks");
        if (result?.value) {
          const parsed = JSON.parse(result.value);
          if (Array.isArray(parsed)) setBookmarks(parsed);
        }
      } catch (e) { /* 없으면 빈 배열 유지 */ }
      try {
        const result2 = await window.storage.get("ck_custom_presets");
        if (result2?.value) {
          const parsed2 = JSON.parse(result2.value);
          if (Array.isArray(parsed2)) setCustomPresets(parsed2);
        }
      } catch (e) {}
    };
    if (window.storage) loadBookmarks();
  }, []);

  const saveBookmark = async () => {
    if (!displayPrompt.trim()) return;
    const entry = {
      id: Date.now(),
      prompt: displayPrompt,
      subject: subject.kr,
      phi: Math.round(phi),
      theta: Math.round(theta),
      ts: new Date().toLocaleString("ko-KR", {month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}),
    };
    const updated = [entry, ...bookmarks].slice(0, 50);
    setBookmarks(updated);
    try { await window.storage.set("ck_bookmarks", JSON.stringify(updated)); } catch(e) {}
  };

  const deleteBookmark = async (id) => {
    const updated = bookmarks.filter(b => b.id !== id);
    setBookmarks(updated);
    try { await window.storage.set("ck_bookmarks", JSON.stringify(updated)); } catch(e) {}
  };

  const clearAllBookmarks = async () => {
    setBookmarks([]);
    try { await window.storage.delete("ck_bookmarks"); } catch(e) {}
  };

  // ── 커스텀 프리셋 저장/삭제 ──
  const saveCustomPreset = async (name) => {
    if (!name.trim()) return;
    const entry = {
      id: Date.now(),
      label: name.trim(),
      icon: "⭐",
      phi: Math.round(phi),
      theta: Math.round(theta),
      r: Math.round(r * 100) / 100,
      subject: subject.id,
      desc: `φ${Math.round(phi)}° θ${Math.round(theta)}° ${Math.round(r*100)}%`,
      extraKw: "",
    };
    const updated = [entry, ...customPresets].slice(0, 20);
    setCustomPresets(updated);
    try { await window.storage.set("ck_custom_presets", JSON.stringify(updated)); } catch(e) {}
    setShowSavePreset(false);
    setPresetNameInput("");
  };

  const deleteCustomPreset = async (id) => {
    const updated = customPresets.filter(p => p.id !== id);
    setCustomPresets(updated);
    try { await window.storage.set("ck_custom_presets", JSON.stringify(updated)); } catch(e) {}
  };

// ── 앵글 프리셋 ─────────────────────────────────────────────
const ANGLE_PRESETS = [
  { id:"paparazzi",  label:"파파라치",   icon:"📸",
    phi:72, theta:35, r:0.72,
    desc:"자연스러운 포착, 비스듬히 옆에서",
    extraKw:"" },
  { id:"idcard",     label:"증명사진",   icon:"🪪",
    phi:65, theta:0,  r:0.38,
    desc:"정면, 눈높이, 상반신",
    extraKw:"" },
  { id:"runway",     label:"런웨이",     icon:"👠",
    phi:60, theta:0,  r:0.92,
    desc:"정면, 눈높이, 풀바디",
    extraKw:"" },
  { id:"cctv",       label:"CCTV",       icon:"📹",
    phi:12, theta:15, r:0.85,
    desc:"천장 탑뷰, 어안렌즈 볼록감, 토이카메라 스타일",
    extraKw:"fisheye lens distortion, CCTV overhead angle, toy camera effect, barrel distortion" },
  { id:"insta",      label:"인스타감성", icon:"✨",
    phi:35, theta:40, r:0.60,
    desc:"위에서 대각선, 미디엄",
    extraKw:"" },
  { id:"product",    label:"제품광고",   icon:"💎",
    phi:40, theta:30, r:0.55,
    desc:"45도 하이앵글, 클로즈업",
    extraKw:"" },
  { id:"fisheye",    label:"어안렌즈",   icon:"🐟",
    phi:25, theta:20, r:0.78,
    desc:"볼록 왜곡, 넓은 화각, 피시카메라",
    extraKw:"fisheye lens, extreme barrel distortion, 180-degree field of view, rounded edges" },
  { id:"wideangle",  label:"광각렌즈",   icon:"🔭",
    phi:62, theta:25, r:0.82,
    desc:"넓은 화각, 공간감 극대화",
    extraKw:"wide angle lens, 24mm, expansive field of view, slight distortion at edges" },
  { id:"worm",       label:"웜스아이",   icon:"🐛",
    phi:140, theta:10, r:0.75,
    desc:"바닥서 올려봄, 웅장함",
    extraKw:"" },
  { id:"birdseye",   label:"버즈아이",   icon:"🦅",
    phi:8,  theta:0,  r:0.90,
    desc:"수직 탑다운, 위에서 내려봄",
    extraKw:"" },
];

const QUALITY_CHIPS = [
  { id:"crisp",   label:"CRISP",   kr:"선명",   en:"sharp-focus, crystal clear, crisp image quality" },
  { id:"detail",  label:"DETAIL",  kr:"디테일",  en:"hyper detailed, fine details, depth-rich texture" },
  { id:"quality", label:"QUALITY", kr:"고품질",  en:"ultra high-resolution, 8k resolution, high fidelity" },
]; // 재질 단일 선택 // "mood" | "style" | null
  // 캐릭터 비율 슬라이더
  const [headScale,  setHeadScale]  = useState(1.4);  // 0.8~2.0 (치비=1.8, 바비=0.9)
  const [bodyScale,  setBodyScale]  = useState(1.0);  // 0.5~1.5
  const [legsScale,  setLegsScale]  = useState(1.0);  // 0.5~2.0 (바비=1.8)
  const [selectedMoods, setSelectedMoods] = useState([]);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [selectedStyles, setSelectedStyles] = useState([]);
  const [translating, setTranslating] = useState(false);
  const [translatedText, setTranslatedText] = useState(""); // 번역된 영문 (프롬프트에 실제 사용)
  const [showTranslated, setShowTranslated] = useState(false);

  // 한글 포함 여부 체크
  const hasKorean = (str) => /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(str);

  // Claude API로 번역
  const translateSubject = async (text) => {
    if (!text.trim()) return;
    if (!hasKorean(text)) {
      setTranslatedText(text);
      setShowTranslated(false);
      return;
    }
    setTranslating(true);
    try {
      const ctxLines = [
        `피사체: ${text}`,
        `카테고리: ${subject.kr}`,
        `카메라 높이: ${resolved.height.kr}`,
        `방향: ${resolved.direction.kr}`,
        `샷 크기: ${resolved.shot.kr}`,
        selectedLighting.length > 0 ? `조명: ${selectedLighting.map(l => l.kr.split(" — ")[0]).join(", ")}` : null,
        selectedMoods.length > 0   ? `무드: ${selectedMoods.join(", ")}` : null,
        selectedStyles.length > 0  ? `스타일: ${selectedStyles.join(", ")}` : null,
      ].filter(Boolean).join("\n");

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 120,
          messages: [{
            role: "user",
            content: `You are a Midjourney prompt specialist. Translate the Korean subject into optimized English.\n\nContext (reference only, do NOT include in output):\n${ctxLines}\n\nRules:\n- Return ONLY the translated subject phrase (1 line)\n- Natural photography/AI image vocabulary\n- Concise, no filler words, no quotes, no punctuation at end\n\nKorean: ${text}`
          }]
        })
      });
      const data = await res.json();
      const translated = data.content?.[0]?.text?.trim() || text;
      setTranslatedText(translated);
      setShowTranslated(true);
    } catch(e) {
      setTranslatedText(text);
      setShowTranslated(false);
    }
    setTranslating(false);
  };

  // 피사체 바뀔 때 기본값 자동 업데이트
  const prevSubjectIdx = useRef(0);

  // 카메라 구면좌표: phi(수직0~180), theta(수평-180~180), r(0~1 정규화)
  const [phi, setPhi]     = useState(65);   // 아이레벨
  const [theta, setTheta] = useState(0);    // 정면
  const [r, setR]         = useState(0.72); // 미디엄샷

  // 피사체 바뀌면 기본 주체 자동 세팅 + 서랍 닫기
  // 피사체 변경시만 초기화 (비율 변경은 포함 안 함)
  useEffect(() => {
    setSubjectText(DEFAULT_SUBJECT_PROMPTS[subject.id] || "");
    setDrawerOpen(null);
    setSelectedMoods([]);
    setSelectedStyles([]);
    setSelectedMaterial(null);
    setSelectedLighting([]);
    setSelectedQuality([]);
    setShowTranslated(false);
    setActivePreset(null);
    setShowBookmarks(false);
  }, [subjectIdx]);

  const resolved = resolveKeywords(phi, theta, r, subject);
  const keywords = langKR
    ? [resolved.height.kr, resolved.direction.kr, resolved.shot.kr]
    : [resolved.height.en, resolved.direction.en, resolved.shot.en];
  // 한글이면 번역본, 영문이면 원본 사용
  const effectiveSubject = (showTranslated && translatedText) ? translatedText : subjectText;
  const subjectPrefix = effectiveSubject.trim() ? effectiveSubject.trim() + ", " : "";
  const activePresetData = ANGLE_PRESETS.find(p => p.id === activePreset);
  const presetKwStr = (activePresetData?.extraKw && !langKR) ? ", " + activePresetData.extraKw : "";

  // ── 시선 방향 키워드 (theta 기준, 인물 피사체만) ──
  const gazeKwStr = (() => {
    if (subject.id !== "person") return "";
    const absTheta = Math.abs(theta);
    const isRight = theta > 0;
    if (absTheta > 150) return "";
    if (absTheta < 12) return langKR ? ", 카메라 정면 응시" : ", looking directly at camera";
    if (absTheta >= 80) {
      return isRight
        ? (langKR ? ", 오른쪽 측면 시선" : ", facing right")
        : (langKR ? ", 왼쪽 측면 시선" : ", facing left");
    }
    return isRight
      ? (langKR ? ", 오른쪽 비스듬히 바라보기" : ", angled right")
      : (langKR ? ", 왼쪽 비스듬히 바라보기" : ", angled left");
  })();

  // 파라미터값 계산 (다중 선택)
  const mjParamStr = (() => {
    const parts = [];
    mjSelectedParams.forEach(id => {
      const found = MJ_PARAM_PRESETS.find(p => p.id === id);
      if (found?.params) parts.push(found.params);
    });
    if (mjArParam) {
      const ar = MJ_AR_PRESETS.find(a => a.id === mjArParam);
      if (ar) parts.push(ar.params);
    }
    if (mjCustomParam.trim()) parts.push(mjCustomParam.trim());
    return parts.length > 0 ? " " + parts.join(" ") : "";
  })();

  // ── 미드저니 최적 프롬프트 순서 ──
  // [피사체] + [샷/앵글] + [시선] + [렌즈] + [조명] + [구도] + [무드] + [스타일] + [심도/포커스] + [무브] + [장비] + [품질] + [MJ params]
  // 프롬프트 바 전용 언어 토글 (UI langKR과 독립)
  // "kr" | "en" | null(=UI 따라감)
  const [promptLang, setPromptLang] = useState(null);
  const promptIsKR = promptLang !== null ? promptLang === "kr" : langKR;

  // promptIsKR 기준으로 프롬프트 재생성
  const buildPromptForLang = (isKR) => {
    const kws = isKR
      ? [resolved.height.kr, resolved.direction.kr, resolved.shot.kr]
      : [resolved.height.en, resolved.direction.en, resolved.shot.en];

    const gaze = (() => {
      if (subject.id !== "person") return "";
      const abs = Math.abs(theta); const right = theta > 0;
      if (abs > 150) return "";
      if (abs < 12) return isKR ? "카메라 정면 응시" : "looking directly at camera";
      if (abs >= 80) return right ? (isKR ? "오른쪽 측면 시선" : "facing right") : (isKR ? "왼쪽 측면 시선" : "facing left");
      return right ? (isKR ? "오른쪽 비스듬히" : "angled right") : (isKR ? "왼쪽 비스듬히" : "angled left");
    })();

    const parts = [];
    // subject — 한글이면 원본, 영문이면 번역본
    const subj = isKR ? subjectText : ((showTranslated && translatedText) ? translatedText : subjectText);
    if (subj.trim()) parts.push(subj.trim());
    parts.push(...kws);
    if (gaze) parts.push(gaze);
    if (!isKR && presetKwStr) parts.push(presetKwStr.replace(/^, /, ""));
    if (selectedLens) parts.push(isKR ? selectedLens.kr.split(" — ")[0] : selectedLens.en.split(",")[0]);
    if (selectedLighting.length > 0) parts.push(...selectedLighting.map(l => isKR ? l.kr.split(" — ")[0] : l.en));
    if (selectedComposition) parts.push(isKR ? selectedComposition.kr : selectedComposition.en.split(",")[0]);
    if (selectedMoods.length > 0) parts.push(...selectedMoods);
    if (selectedStyles.length > 0) parts.push(...selectedStyles);
    if (selectedFocus) parts.push(isKR ? selectedFocus.kr.split(" — ")[0] : selectedFocus.en.split(",")[0]);
    if (selectedMovementKw) parts.push(isKR ? selectedMovementKw.kr : selectedMovementKw.en.split(",")[0]);
    if (selectedRigKw) parts.push(isKR ? selectedRigKw.kr : selectedRigKw.en.split(",")[0]);
    if (selectedQuality.length > 0) parts.push(...selectedQuality.map(q => isKR ? q.kr : q.en));
    return parts.join(", ") + (isKR ? "" : mjParamStr);
  };

  const displayPrompt = buildPromptForLang(promptIsKR);

  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const copyPrompt = () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(displayPrompt).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }).catch(() => fallbackCopy());
      } else {
        fallbackCopy();
      }
    } catch(e) { fallbackCopy(); }
  };
  const fallbackCopy = () => {
    const el = document.createElement('textarea');
    el.value = displayPrompt;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.focus(); el.select();
    try { document.execCommand('copy'); } catch(e) {}
    document.body.removeChild(el);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Three.js 구 뷰어 ──
  const mountRef   = useRef(null);
  const sceneRef   = useRef(null);
  const rendererRef= useRef(null);
  const cameraRef  = useRef(null);
  const camIconRef = useRef(null);
  const subjectRef = useRef(null);
  const frameRef   = useRef(null);
  const isDragging = useRef(false);
  const lastMouse  = useRef({ x:0, y:0 });
  const phiRef     = useRef(phi);
  const thetaRef   = useRef(theta);
  const rRef       = useRef(r);

  // 마우스 휠 줌 — native 이벤트 (passive:false로 스크롤 막기)
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.04 : -0.04;
      setR(prev => Math.min(1, Math.max(0, prev + delta)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // phi/theta/r ref sync
  useEffect(() => { phiRef.current = phi; },   [phi]);
  useEffect(() => { thetaRef.current = theta; },[theta]);
  useEffect(() => { rRef.current = r; },        [r]);

  // ── Three.js 초기화 ──
  useEffect(() => {
    const initScene = (THREE) => {
      if (!mountRef.current) return () => {};
      const W = mountRef.current.clientWidth  || 320;
      const H = mountRef.current.clientHeight || 320;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1a1a1a);
      scene.fog = new THREE.Fog(0x1a1a1a, 10, 30);
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(45, W/H, 0.1, 100);
      camera.position.set(0, 0, 6);
      camera.lookAt(0,0,0);
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(W, H);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      mountRef.current.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // 조명
      scene.add(new THREE.AmbientLight(0x334466, 1.0));
      const key = new THREE.DirectionalLight(0xffffff, 1.2);
      key.position.set(3,5,4); scene.add(key);
      const rim = new THREE.DirectionalLight(0x4466ff, 0.5);
      rim.position.set(-3,2,-4); scene.add(rim);

      // 구 (와이어프레임)
      const sphereGeo = new THREE.SphereGeometry(2.2, 24, 18);
      const sphereMat = new THREE.MeshBasicMaterial({
        color: 0x1a3a6a, wireframe: true, transparent: true, opacity: 0.25
      });
      scene.add(new THREE.Mesh(sphereGeo, sphereMat));

      // 구 내부 solid (반투명)
      const innerMat = new THREE.MeshBasicMaterial({
        color: 0x0a1a3a, transparent: true, opacity: 0.15, side: 1
      });
      scene.add(new THREE.Mesh(new THREE.SphereGeometry(2.2,24,18), innerMat));

      // 축선 (세로)
      const axisMat = new THREE.LineBasicMaterial({ color: 0x2244aa, transparent:true, opacity:0.4 });
      const axisGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0,-2.4,0), new THREE.Vector3(0,2.4,0)
      ]);
      scene.add(new THREE.Line(axisGeo, axisMat));

      // 적도선
      const eqPoints = [];
      for (let i=0; i<=64; i++) {
        const a = (i/64)*Math.PI*2;
        eqPoints.push(new THREE.Vector3(Math.cos(a)*2.2, 0, Math.sin(a)*2.2));
      }
      scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(eqPoints),
        new THREE.LineBasicMaterial({ color: 0x3355bb, transparent:true, opacity:0.5 })
      ));

      // 피사체 오브젝트
      const subObj = buildSubjectObject(THREE, subject.object, scene, {head: 1.0, body: 1.0, legs: 1.0});
      subjectRef.current = subObj;

      // 카메라 아이콘은 씬에 없음 — 우하단 미니맵 SVG로 표시
      camIconRef.current = null;

      // 카메라 위치 업데이트 함수
      // ★ 아이콘 위치 + 뷰어 카메라 동기화
      const updateCamPos = () => {
        const pRad = (phiRef.current * Math.PI) / 180;
        const tRad = (thetaRef.current * Math.PI) / 180;
        const iconR = 2.2;
        // r(0~1): 거리값 → 뷰어 카메라 거리 3~10
        const viewR = 3 + (1 - rRef.current) * 7;

        const ix = iconR * Math.sin(pRad) * Math.sin(tRad);
        const iy = iconR * Math.cos(pRad);
        const iz = iconR * Math.sin(pRad) * Math.cos(tRad);
        const vx = viewR * Math.sin(pRad) * Math.sin(tRad);
        const vy = viewR * Math.cos(pRad);
        const vz = viewR * Math.sin(pRad) * Math.cos(tRad);

        // ★ 뷰어 카메라 실제 이동 (아이콘 없음 — 카메라 시점 자체가 이동)
        camera.position.set(vx, vy, vz);
        if (phiRef.current < 5 || phiRef.current > 175) {
          camera.up.set(0, 0, phiRef.current < 90 ? -1 : 1);
        } else {
          camera.up.set(0, 1, 0);
        }
        camera.lookAt(0, 0, 0);
      };
      updateCamPos();

      // 애니메이션
      const animate = () => {
        frameRef.current = requestAnimationFrame(animate);
        updateCamPos();
        renderer.render(scene, camera);
      };
      animate();

      // ── 드래그 이벤트 ──
      const el = renderer.domElement;

      const getPos = (e) => {
        if (e.touches) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        return { x: e.clientX, y: e.clientY };
      };

      const onDown = (e) => {
        isDragging.current = true;
        lastMouse.current = getPos(e);
        e.preventDefault();
      };
      const onMove = (e) => {
        if (!isDragging.current) return;
        const pos = getPos(e);
        const dx = pos.x - lastMouse.current.x;
        const dy = pos.y - lastMouse.current.y;
        lastMouse.current = pos;
        // theta: 좌우 드래그
        thetaRef.current = ((thetaRef.current + dx * 0.6) + 180) % 360 - 180;
        setTheta(Math.round(thetaRef.current));
        // phi: 상하 드래그
        phiRef.current = Math.max(1, Math.min(179, phiRef.current + dy * 0.5));
        setPhi(Math.round(phiRef.current));
        e.preventDefault();
      };
      const onUp = () => { isDragging.current = false; };

      el.addEventListener('mousedown', onDown);
      el.addEventListener('mousemove', onMove);
      el.addEventListener('mouseup', onUp);
      el.addEventListener('touchstart', onDown, { passive:false });
      el.addEventListener('touchmove', onMove, { passive:false });
      el.addEventListener('touchend', onUp);
      window.addEventListener('mouseup', onUp);

      return () => {
        cancelAnimationFrame(frameRef.current);
        el.removeEventListener('mousedown', onDown);
        el.removeEventListener('mousemove', onMove);
        el.removeEventListener('mouseup', onUp);
        el.removeEventListener('touchstart', onDown);
        el.removeEventListener('touchmove', onMove);
        el.removeEventListener('touchend', onUp);
        window.removeEventListener('mouseup', onUp);
        scene.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach(m=>m.dispose());
            else obj.material.dispose();
          }
        });
        renderer.dispose();
        if (mountRef.current && renderer.domElement.parentNode === mountRef.current)
          mountRef.current.removeChild(renderer.domElement);
      };
    };

    // Three.js import 방식으로 직접 초기화
    const c = initScene(THREE);
    return typeof c === 'function' ? c : () => {};
  }, [subjectIdx, headScale, bodyScale, legsScale]);

  // 피사체 바뀌면 씬 재초기화 (subjectIdx dep로 처리됨)

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"calc(100vh - 130px)", background:"#1a1a1a" }}>

      {/* 피사체 선택 */}
      <div style={{ display:"flex", gap:0, background:"#1a1a1a", borderBottom:"2px solid #f19eb8" }}>
        {SUBJECT_TYPES.map((s,i) => (
          <button key={s.id} onClick={() => setSubjectIdx(i)} style={{
            flex:1, padding:"10px 4px", border:"none", cursor:"pointer",
            borderRight: i < SUBJECT_TYPES.length-1 ? "1px solid #1a1a1a" : "none",
            background: i===subjectIdx ? "#f19eb8" : "transparent",
            color: i===subjectIdx ? "#1a1a1a" : "#555",
            fontFamily:"'Arial Black','Helvetica Neue',sans-serif",
            fontSize:10, fontWeight:900,
            transition:"all 0.15s",
            letterSpacing:"-0.02em",
          }}>
            <div style={{ fontSize:15, marginBottom:2 }}>{s.icon}</div>
            <div>{s.kr}</div>
          </button>
        ))}
      </div>

      {/* 주체 입력창 */}
      <div style={{
        display:"flex", alignItems:"center", gap:10,
        padding:"10px 16px", background:"#1a1a1a",
        borderBottom:"1px solid #1a2a4a",
      }}>
        <span style={{
          fontSize:9, color:"#444", fontFamily:"sans-serif",
          letterSpacing:"0.12em", whiteSpace:"nowrap", fontWeight:700,
        }}>SUBJECT</span>
        <div style={{ flex:1, display:"flex", flexDirection:"column", gap:5 }}>
          <div style={{ display:"flex", gap:6 }}>
            <input
              type="text"
              value={subjectText}
              onChange={e => {
                setSubjectText(e.target.value);
                setShowTranslated(false);
                setTranslatedText("");
              }}
              onKeyDown={e => { if(e.key === "Enter") translateSubject(subjectText); }}
              placeholder={DEFAULT_SUBJECT_PROMPTS[subject.id]}
              style={{
                flex:1, background:"#252525", border:"1px solid #2a3a6a",
                borderRadius:8, padding:"7px 12px",
                color:"#e0ddd4", fontSize:11, fontFamily:"monospace",
                outline:"none",
              }}
            />
            {hasKorean(subjectText) && (
              <button onClick={() => translateSubject(subjectText)} disabled={translating} style={{
                background: translating ? "#252525" : "#f19eb8",
                border:"none", borderRadius:7,
                color:"#e0ddd4", fontSize:10, fontWeight:700,
                padding:"6px 12px", cursor: translating ? "default" : "pointer",
                fontFamily:"sans-serif", whiteSpace:"nowrap", minWidth:60,
              }}>
                {translating ? "번역중..." : "🌐 번역"}
              </button>
            )}
            <button onClick={() => { setSubjectText(DEFAULT_SUBJECT_PROMPTS[subject.id]); setShowTranslated(false); setTranslatedText(""); }} style={{
              background:"#252525", border:"1px solid #2a3a6a", borderRadius:6,
              color:"#444", fontSize:10, padding:"6px 10px", cursor:"pointer",
              fontFamily:"sans-serif", whiteSpace:"nowrap",
            }}>초기화</button>
          </div>
          {showTranslated && translatedText && (
            <div style={{
              display:"flex", alignItems:"center", gap:6,
              background:"#0d2a1a", border:"1px solid #1a5a2a",
              borderRadius:6, padding:"5px 10px",
            }}>
              <span style={{ fontSize:9, color:"#2a9a4a", fontFamily:"sans-serif", fontWeight:700, whiteSpace:"nowrap" }}>🌐 번역됨</span>
              <span style={{ fontSize:11, color:"#88ffaa", fontFamily:"monospace", flex:1 }}>{translatedText}</span>
              <button onClick={() => { setSubjectText(translatedText); setShowTranslated(false); }} style={{
                background:"none", border:"1px solid #2a5a3a", borderRadius:4,
                color:"#2a9a4a", fontSize:9, padding:"2px 7px", cursor:"pointer",
                fontFamily:"sans-serif",
              }}>적용</button>
            </div>
          )}
        </div>
      </div>


      {/* 미드저니 파라미터 프리셋 */}
      <div style={{
        padding:"6px 12px 7px", background:"#111",
        borderBottom:"1px solid #222", flexShrink:0,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap", rowGap:3, marginBottom:3 }}>
          <span style={{
            fontSize:8, color:"#f19eb8",
            fontFamily:"'Arial Black',sans-serif",
            fontWeight:900, letterSpacing:"0.18em", marginRight:3,
          }}>✦ MJ PARAMS</span>
          {/* AR 비율 — 맨 앞 */}
          {MJ_AR_PRESETS.map(a => {
            const isOn = mjArParam === a.id;
            return (
              <button key={a.id} onClick={() => setMjArParam(isOn ? null : a.id)} style={{
                background: isOn ? "#5ce8ff" : "transparent",
                color: isOn ? "#000" : "#888",
                border: "1px solid " + (isOn ? "#5ce8ff" : "#333"),
                borderRadius:3, padding:"2px 6px", cursor:"pointer",
                fontFamily:"'Arial Black',sans-serif", fontSize:8, fontWeight:900,
                transition:"all 0.12s", whiteSpace:"nowrap",
              }}>{a.label}</button>
            );
          })}
          <span style={{ fontSize:7, color:"#333" }}>│</span>
          {MJ_PARAM_GROUPS.map(g =>
            g.items.map(p => {
              const isOn = mjSelectedParams.has(p.id);
              return (
                <Tooltip text={p.tip || p.label}>
                  <button key={p.id} onClick={() => setMjSelectedParams(prev => {
                    const next = new Set(prev);
                    next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                    return next;
                  })} style={{
                    background: isOn ? "#f19eb8" : "transparent",
                    color: isOn ? "#1a1a1a" : "#555",
                    border: "1px solid " + (isOn ? "#f19eb8" : "#2a2a2a"),
                    borderRadius:3, padding:"2px 6px", cursor:"pointer",
                    fontFamily:"'Arial Black',sans-serif", fontSize:8, fontWeight:900,
                    transition:"all 0.12s", whiteSpace:"nowrap",
                  }}>{p.label}</button>
                </Tooltip>
              );
            })
          )}
          <button onClick={() => { setMjSelectedParams(new Set()); setMjArParam(null); setMjCustomParam(""); }} style={{
            background:"transparent", color:"#333", border:"1px solid #222",
            borderRadius:3, padding:"2px 6px", cursor:"pointer",
            fontFamily:"sans-serif", fontSize:8, transition:"all 0.12s",
          }}>✕ 초기화</button>
        </div>
        {mjParamStr.trim() && (
          <div style={{ fontSize:9, color:"#f19eb8", fontFamily:"monospace", background:"#1a1a1a", padding:"2px 8px", borderRadius:4, display:"inline-block" }}>
            {mjParamStr.trim()}
          </div>
        )}
      </div>

      {/* 메인 영역 */}
      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>

        {/* 3D 구 뷰어 */}
        <div style={{ flex:1, position:"relative" }}>
          <div ref={mountRef} style={{ width:"100%", height:"100%", cursor:"grab" }} />
          <div style={{
            position:"absolute", top:10, left:"50%", transform:"translateX(-50%)",
            color:"#555", fontSize:10, fontFamily:"sans-serif", letterSpacing:"0.1em",
            pointerEvents:"none", whiteSpace:"nowrap",
          }}>
            드래그하여 카메라 앵글 조정
          </div>

          {/* ── 앵글 프리셋 버튼 바 — 구 상단 ── */}
          <div style={{
            position:"absolute", top:8, left:"50%", transform:"translateX(-50%)",
            display:"flex", gap:4, zIndex:10, flexWrap:"wrap", justifyContent:"center",
            maxWidth:"90%",
          }}>
            {ANGLE_PRESETS.map(preset => {
              const isActive = activePreset === preset.id;
              return (
                <button key={preset.id} onClick={() => applyPreset(preset)}
                  title={preset.desc} style={{
                    background: isActive ? "#f19eb8" : "rgba(10,12,26,0.72)",
                    border: `1px solid ${isActive ? "#f19eb8" : "rgba(255,255,255,0.10)"}`,
                    borderRadius:14, padding:"3px 9px", cursor:"pointer",
                    backdropFilter:"blur(6px)", transition:"all 0.18s",
                    display:"flex", alignItems:"center", gap:3,
                  }}>
                  <span style={{ fontSize:10 }}>{preset.icon}</span>
                  <span style={{
                    fontSize:8, fontWeight: isActive ? 800 : 500,
                    fontFamily:"sans-serif", letterSpacing:"0.04em",
                    color: isActive ? "#e0ddd4" : "rgba(255,255,255,0.45)",
                  }}>{preset.label}</span>
                </button>
              );
            })}

            {/* 구분선 */}
            {customPresets.length > 0 && (
              <div style={{ width:1, height:20, background:"rgba(255,255,255,0.15)", alignSelf:"center" }} />
            )}

            {/* 커스텀 프리셋 버튼들 */}
            {customPresets.map(preset => {
              const isActive = activePreset === preset.id;
              return (
                <div key={preset.id} style={{ position:"relative", display:"flex" }}>
                  <button onClick={() => applyPreset(preset)}
                    title={preset.desc} style={{
                      background: isActive ? "#5ce8ff" : "rgba(10,12,26,0.82)",
                      border: `1px solid ${isActive ? "#5ce8ff" : "rgba(92,232,255,0.25)"}`,
                      borderRadius:14, padding:"3px 9px 3px 7px", cursor:"pointer",
                      backdropFilter:"blur(6px)", transition:"all 0.18s",
                      display:"flex", alignItems:"center", gap:3,
                    }}>
                    <span style={{ fontSize:9 }}>📌</span>
                    <span style={{
                      fontSize:8, fontWeight: isActive ? 800 : 500,
                      fontFamily:"sans-serif", letterSpacing:"0.04em",
                      color: isActive ? "#000" : "rgba(92,232,255,0.8)",
                    }}>{preset.label}</span>
                  </button>
                  {/* 삭제 버튼 */}
                  <button onClick={() => deleteCustomPreset(preset.id)} style={{
                    position:"absolute", top:-5, right:-5,
                    background:"#222", border:"1px solid #444",
                    borderRadius:"50%", width:13, height:13,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    cursor:"pointer", fontSize:7, color:"#888", lineHeight:1,
                    zIndex:2,
                  }}>✕</button>
                </div>
              );
            })}

            {/* 현재 앵글 저장 버튼 */}
            {showSavePreset ? (
              <div style={{ display:"flex", gap:3, alignItems:"center", background:"rgba(10,12,26,0.92)", border:"1px solid #5ce8ff", borderRadius:14, padding:"2px 6px", backdropFilter:"blur(6px)" }}>
                <input
                  value={presetNameInput}
                  onChange={e => setPresetNameInput(e.target.value)}
                  onKeyDown={e => { if(e.key==="Enter") saveCustomPreset(presetNameInput); if(e.key==="Escape") setShowSavePreset(false); }}
                  placeholder="프리셋 이름..."
                  autoFocus
                  style={{
                    background:"transparent", border:"none", outline:"none",
                    color:"#5ce8ff", fontSize:9, fontFamily:"sans-serif",
                    width:80,
                  }}
                />
                <button onClick={() => saveCustomPreset(presetNameInput)} style={{
                  background:"#5ce8ff", border:"none", borderRadius:8,
                  padding:"2px 7px", cursor:"pointer", fontSize:8,
                  color:"#000", fontWeight:800, fontFamily:"sans-serif",
                }}>저장</button>
                <button onClick={() => setShowSavePreset(false)} style={{
                  background:"none", border:"none", color:"#666",
                  cursor:"pointer", fontSize:10, padding:"0 2px",
                }}>✕</button>
              </div>
            ) : (
              <button onClick={() => setShowSavePreset(true)} title="현재 앵글을 프리셋으로 저장" style={{
                background:"rgba(10,12,26,0.72)",
                border:"1px dashed rgba(92,232,255,0.35)",
                borderRadius:14, padding:"3px 9px", cursor:"pointer",
                backdropFilter:"blur(6px)", transition:"all 0.18s",
                display:"flex", alignItems:"center", gap:3,
              }}>
                <span style={{ fontSize:9, color:"rgba(92,232,255,0.6)" }}>＋</span>
                <span style={{ fontSize:8, color:"rgba(92,232,255,0.6)", fontFamily:"sans-serif" }}>저장</span>
              </button>
            )}
          </div>


          {/* QUALITY 플로팅 칩 — 좌측 하단 미니맵 위 */}
          <div style={{
            position:"absolute", left:10, bottom:80,
            display:"flex", flexDirection:"column", gap:5,
            pointerEvents:"all",
          }}>
            {QUALITY_CHIPS.map(chip => {
              const isOn = selectedQuality.some(q => q.id === chip.id);
              return (
                <button key={chip.id} onClick={() => setSelectedQuality(prev =>
                  isOn ? prev.filter(q => q.id !== chip.id) : [...prev, chip]
                )} style={{
                  background: isOn ? "rgba(255,255,255,0.92)" : "rgba(13,16,32,0.75)",
                  border: `1px solid ${isOn ? "#e0ddd4" : "rgba(255,255,255,0.15)"}`,
                  borderRadius:20, padding:"4px 11px",
                  cursor:"pointer", backdropFilter:"blur(8px)",
                  display:"flex", alignItems:"center", gap:5,
                  transition:"all 0.15s",
                }}>
                  <span style={{
                    fontSize:9, fontWeight:800, fontFamily:"sans-serif",
                    letterSpacing:"0.1em",
                    color: isOn ? "#1a1a1a" : "rgba(255,255,255,0.5)",
                  }}>{chip.label}</span>
                  <span style={{
                    fontSize:8, fontFamily:"sans-serif",
                    color: isOn ? "#333" : "rgba(255,255,255,0.3)",
                  }}>{chip.kr}</span>
                </button>
              );
            })}
          </div>

          {/* 미니맵: 좌측 하단 */}
          <svg width="90" height="54" style={{
            position:"absolute", left:10, bottom:10,
            pointerEvents:"none",
          }}>
            <text x="0" y="8" fontSize="7" fill="#444" fontFamily="sans-serif" letterSpacing="0.08em">TOP</text>
            <circle cx="18" cy="28" r="16" fill="none" stroke="#1a3a6a" strokeWidth="1.5" opacity="0.7"/>
            <circle cx="18" cy="28" r="2" fill="#2244aa" opacity="0.8"/>
            <circle
              cx={18 + Math.round(14 * Math.sin((theta * Math.PI) / 180))}
              cy={28 - Math.round(14 * Math.cos((theta * Math.PI) / 180))}
              r="4.5" fill="#f19eb8" opacity="0.9"
            />
            <text x="48" y="8" fontSize="7" fill="#444" fontFamily="sans-serif" letterSpacing="0.08em">SIDE</text>
            <circle cx="66" cy="28" r="16" fill="none" stroke="#1a3a6a" strokeWidth="1.5" opacity="0.7"/>
            <circle cx="66" cy="28" r="2" fill="#2244aa" opacity="0.8"/>
            <circle
              cx={66 + Math.round(14 * Math.sin((phi * Math.PI) / 180))}
              cy={28 - Math.round(14 * Math.cos((phi * Math.PI) / 180))}
              r="4.5" fill="#f19eb8" opacity="0.9"
            />
          </svg>

          {/* 거리 슬라이더 (오른쪽) */}
          <div style={{
            position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
            display:"flex", flexDirection:"column", alignItems:"center", gap:6,
          }}>
            <span style={{ fontSize:7, color:"#f19eb8", fontFamily:"sans-serif", letterSpacing:"0.04em", fontWeight:700, textAlign:"center", lineHeight:1.3 }}>멀리</span>
            <input type="range" min="0" max="100" value={Math.round((1-r)*100)}
              onChange={e => setR(1 - e.target.value/100)}
              style={{
                writingMode:"vertical-lr", direction:"rtl",
                width:20, height:120, cursor:"pointer", accentColor:"#f19eb8",
              }}
            />
            <span style={{ fontSize:7, color:"#f19eb8", fontFamily:"sans-serif", textAlign:"center", lineHeight:1.2 }}>{Math.round(r*100)}%<br/><span style={{fontSize:6}}>가까이</span></span>
          </div>
        </div>

        {/* 키워드 패널 */}
        <div style={{
          width:240, background:"#111122", borderLeft:"1px solid #1a2a4a",
          display:"flex", flexDirection:"column", overflowY:"hidden",
        }}>
          {/* 탭 */}
          <div style={{ display:"flex", flexWrap:"wrap", gap:2, padding:"8px 8px 4px", borderBottom:"1px solid #1a2a4a" }}>
            {[
              { id:"shot",  label:"📐 샷",  tip:"3D 조작 결과 — 높이·방향·거리가 자동으로 카메라 앵글 키워드로 변환됩니다." },
              { id:"lens",  label:"🔭 렌즈", tip:"렌즈 화각 선택 — 14mm 광각(왜곡·넓음)부터 200mm 망원(배경 압축)까지. 이미지 분위기를 크게 바꿉니다." },
              { id:"focus", label:"🎯 심도", tip:"초점과 심도 — 배경이 얼마나 흐려지는지, 어디에 초점이 맺히는지 제어합니다." },
              { id:"comp",  label:"🖼 구도", tip:"화면 구성법 — 삼분할·대칭·대각선 등 피사체를 어디에 배치할지 결정합니다." },
              { id:"move",  label:"🎬 무브", tip:"카메라 움직임 — 영상 AI(Kling·Hailuo)에서 카메라가 어떻게 움직일지 지정합니다." },
              { id:"rig",   label:"🎥 장비", tip:"촬영 장비 — 드론·짐벌·핸드헬드 등 장비 특유의 흔들림과 느낌을 표현합니다." },
            ].map(t => (
              <Tooltip text={t.tip}>
                <button key={t.id} onClick={() => setKwPanelTab(t.id)} style={{
                  background: kwPanelTab===t.id ? "#f19eb8" : "transparent",
                  color: kwPanelTab===t.id ? "#111" : "#555",
                  border: "1px solid " + (kwPanelTab===t.id ? "#f19eb8" : "#222"),
                  borderRadius:4, padding:"2px 6px", cursor:"pointer",
                  fontFamily:"sans-serif", fontSize:9, fontWeight: kwPanelTab===t.id ? 700 : 400,
                  transition:"all 0.12s",
                }}>{t.label}</button>
              </Tooltip>
            ))}
          </div>

          <div style={{ flex:1, overflowY:"auto", padding:"8px 8px" }}>
            {/* 샷 탭: 기존 3개 카드 */}
            {kwPanelTab === "shot" && (<>
              <div style={{ background:"#0d1a2e", borderRadius:7, padding:"8px", marginBottom:6 }}>
                <div style={{ fontSize:7, color:"#2563eb", fontFamily:"sans-serif", letterSpacing:"0.1em", marginBottom:3 }}>HEIGHT · φ{Math.round(phi)}°</div>
                <div style={{ fontSize:11, color:"#e0ddd4", fontFamily:"sans-serif", fontWeight:700, lineHeight:1.3 }}>
                  {langKR ? resolved.height.kr : resolved.height.en}
                </div>
              </div>
              <div style={{ background:"#0d1a2e", borderRadius:7, padding:"8px", marginBottom:6 }}>
                <div style={{ fontSize:7, color:"#10b981", fontFamily:"sans-serif", letterSpacing:"0.1em", marginBottom:3 }}>DIRECTION · θ{Math.round(theta)}°</div>
                <div style={{ fontSize:11, color:"#e0ddd4", fontFamily:"sans-serif", fontWeight:700, lineHeight:1.3 }}>
                  {langKR ? resolved.direction.kr : resolved.direction.en}
                </div>
              </div>
              {/* 시선 방향 카드 — 인물 피사체만 */}
              {subject.id === "person" && (() => {
                const absTheta = Math.abs(theta);
                const isRight = theta > 0;
                if (absTheta > 150) return null;
                let gazeLabel, gazeIcon;
                if (absTheta < 12) {
                  gazeIcon = "👁"; gazeLabel = langKR ? "카메라 정면 응시" : "looking at camera";
                } else if (absTheta >= 80) {
                  gazeIcon = isRight ? "👉" : "👈";
                  gazeLabel = isRight ? (langKR ? "오른쪽 측면 시선" : "facing right") : (langKR ? "왼쪽 측면 시선" : "facing left");
                } else {
                  gazeIcon = isRight ? "↗️" : "↖️";
                  gazeLabel = isRight ? (langKR ? "오른쪽 비스듬히" : "angled right") : (langKR ? "왼쪽 비스듬히" : "angled left");
                }
                return (
                  <div style={{ background:"#0d2a1a", borderRadius:7, padding:"8px", marginBottom:6, border:"1px solid #1a4a2a" }}>
                    <div style={{ fontSize:7, color:"#34d399", fontFamily:"sans-serif", letterSpacing:"0.1em", marginBottom:3 }}>GAZE · 시선방향</div>
                    <div style={{ fontSize:11, color:"#e0ddd4", fontFamily:"sans-serif", fontWeight:700, display:"flex", alignItems:"center", gap:5 }}>
                      <span style={{ fontSize:14 }}>{gazeIcon}</span>
                      {gazeLabel}
                    </div>
                  </div>
                );
              })()}
              <div style={{ background:"#0d1a2e", borderRadius:7, padding:"8px" }}>
                <div style={{ fontSize:7, color:"#f19eb8", fontFamily:"sans-serif", letterSpacing:"0.1em", marginBottom:3 }}>SHOT · {Math.round(r*100)}%</div>
                <div style={{ fontSize:11, color:"#e0ddd4", fontFamily:"sans-serif", fontWeight:700, lineHeight:1.3 }}>
                  {langKR ? resolved.shot.kr : resolved.shot.en}
                </div>
              </div>
            </>)}

            {/* 렌즈 탭 */}
            {kwPanelTab === "lens" && (
              <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                {DATA.lens.map(item => {
                  const isOn = selectedLens?.id === item.id;
                  const label = langKR ? item.kr : item.en.split(",")[0];
                  return (
                    <button key={item.id} onClick={() => setSelectedLens(isOn ? null : item)} style={{
                      background: isOn ? "#f19eb8" : "#0d1a2e",
                      border: "1px solid " + (isOn ? "#f19eb8" : "#1a2a4a"),
                      borderRadius:6, padding:"7px 10px", cursor:"pointer",
                      textAlign:"left", transition:"all 0.12s",
                      display:"flex", alignItems:"center", gap:4,
                    }}>
                      <span style={{ fontSize:10, color: isOn ? "#111" : "#e0ddd4", fontWeight:700, fontFamily:"sans-serif", flex:1 }}>{label}</span>
                      <TipIcon tip={item.desc} />
                    </button>
                  );
                })}
              </div>
            )}

            {/* 심도 탭 */}
            {kwPanelTab === "focus" && (
              <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                {DATA.focus.map(item => {
                  const isOn = selectedFocus?.id === item.id;
                  const label = langKR ? item.kr : item.en.split(",")[0];
                  return (
                    <button key={item.id} onClick={() => setSelectedFocus(isOn ? null : item)} style={{
                      background: isOn ? "#f19eb8" : "#0d1a2e",
                      border: "1px solid " + (isOn ? "#f19eb8" : "#1a2a4a"),
                      borderRadius:6, padding:"7px 10px", cursor:"pointer",
                      textAlign:"left", transition:"all 0.12s",
                      display:"flex", alignItems:"center", gap:4,
                    }}>
                      <span style={{ fontSize:10, color: isOn ? "#111" : "#e0ddd4", fontWeight:700, fontFamily:"sans-serif", flex:1 }}>{label}</span>
                      <TipIcon tip={item.desc} />
                    </button>
                  );
                })}
              </div>
            )}

            {/* 구도 탭 */}
            {kwPanelTab === "comp" && (
              <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                {DATA.composition.map(item => {
                  const isOn = selectedComposition?.id === item.id;
                  const label = langKR ? item.kr : item.en.split(",")[0];
                  return (
                    <button key={item.id} onClick={() => setSelectedComposition(isOn ? null : item)} style={{
                      background: isOn ? "#f19eb8" : "#0d1a2e",
                      border: "1px solid " + (isOn ? "#f19eb8" : "#1a2a4a"),
                      borderRadius:6, padding:"7px 10px", cursor:"pointer",
                      textAlign:"left", transition:"all 0.12s",
                      display:"flex", alignItems:"center", gap:4,
                    }}>
                      <span style={{ fontSize:10, color: isOn ? "#111" : "#e0ddd4", fontWeight:700, fontFamily:"sans-serif", flex:1 }}>{label}</span>
                      <TipIcon tip={item.desc} />
                    </button>
                  );
                })}
              </div>
            )}

            {/* 무브먼트 탭 */}
            {kwPanelTab === "move" && (
              <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                {DATA.movement.map(item => {
                  const isOn = selectedMovementKw?.id === item.id;
                  const label = langKR ? item.kr : item.en.split(",")[0];
                  return (
                    <button key={item.id} onClick={() => setSelectedMovementKw(isOn ? null : item)} style={{
                      background: isOn ? "#f19eb8" : "#0d1a2e",
                      border: "1px solid " + (isOn ? "#f19eb8" : "#1a2a4a"),
                      borderRadius:6, padding:"7px 10px", cursor:"pointer",
                      textAlign:"left", transition:"all 0.12s",
                      display:"flex", alignItems:"center", gap:4,
                    }}>
                      <span style={{ fontSize:10, color: isOn ? "#111" : "#e0ddd4", fontWeight:700, fontFamily:"sans-serif", flex:1 }}>{label}</span>
                      <TipIcon tip={item.desc} />
                    </button>
                  );
                })}
              </div>
            )}

            {/* 장비 탭 */}
            {kwPanelTab === "rig" && (
              <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                {DATA.rig.map(item => {
                  const isOn = selectedRigKw?.id === item.id;
                  const label = langKR ? item.kr : item.en.split(",")[0];
                  return (
                    <button key={item.id} onClick={() => setSelectedRigKw(isOn ? null : item)} style={{
                      background: isOn ? "#f19eb8" : "#0d1a2e",
                      border: "1px solid " + (isOn ? "#f19eb8" : "#1a2a4a"),
                      borderRadius:6, padding:"7px 10px", cursor:"pointer",
                      textAlign:"left", transition:"all 0.12s",
                      display:"flex", alignItems:"center", gap:4,
                    }}>
                      <span style={{ fontSize:10, color: isOn ? "#111" : "#e0ddd4", fontWeight:700, fontFamily:"sans-serif", flex:1 }}>{label}</span>
                      <TipIcon tip={item.desc} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MOOD/STYLE 하단 서랍 */}
      <div style={{ position:"relative" }}>
        {/* 서랍 탭 버튼 */}
        <div style={{
          display:"flex", gap:0,
          background:"#111", borderTop:"1px solid #1a2a4a",
          padding:"0 16px",
        }}>
          {[
            { id:"lighting", label:"🔦 LIGHT", count: selectedLighting.length },
            { id:"mood",    label:"🎭 MOOD",  count: selectedMoods.length },
            { id:"style", label:"✨ STYLE", count: selectedStyles.length },
          ].map(tab => (
            <button key={tab.id} onClick={() => setDrawerOpen(drawerOpen === tab.id ? null : tab.id)} style={{
              background: drawerOpen===tab.id ? "#f19eb8" : "transparent",
              border:"none", borderTop:"none",
              color: drawerOpen===tab.id ? "#e0ddd4" : "#444",
              padding:"10px 18px", cursor:"pointer",
              fontWeight:900,
              fontFamily:"sans-serif", fontSize:10,
              letterSpacing:"0.1em", display:"flex", alignItems:"center", gap:5,
              transition:"all 0.15s",
            }}>
              {tab.label}
              {tab.count > 0 && (
                <span style={{
                  background:"#f19eb8", color:"#e0ddd4", borderRadius:10,
                  fontSize:9, padding:"1px 6px", fontWeight:800,
                }}>{tab.count}</span>
              )}
            </button>
          ))}
          <div style={{ flex:1 }} />
          {(selectedMoods.length > 0 || selectedStyles.length > 0) && (
            <button onClick={() => { setSelectedMoods([]); setSelectedStyles([]); }} style={{
              background:"none", border:"none", color:"#444",
              fontSize:9, cursor:"pointer", fontFamily:"sans-serif", padding:"8px",
            }}>전체 초기화</button>
          )}
          {/* ✕ 닫기 버튼 */}
          {drawerOpen && (
            <button onClick={() => setDrawerOpen(null)} style={{
              marginLeft:"auto", background:"none", border:"none",
              color:"#556", fontSize:15, cursor:"pointer",
              padding:"6px 12px", lineHeight:1,
              transition:"color 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.color="#aaa"}
            onMouseLeave={e => e.currentTarget.style.color="#556"}
            >✕</button>
          )}
        </div>

        {/* 서랍 내용 */}
        {drawerOpen && (
          <div style={{ background:"#111", borderTop:"1px solid #1a2a4a", padding:"10px 16px" }}>
            {(drawerOpen === "lighting" ? LIGHTING_GROUPS : drawerOpen === "mood" ? MOOD_GROUPS : STYLE_GROUPS).map(group => {
              const isMood = drawerOpen === "mood";
              const isLightTab = drawerOpen === "lighting";
              const activeColor = isLightTab ? "#f19eb8" : isMood ? "#f19eb8" : "#f19eb8";
              return (
                <div key={group.id} style={{ marginBottom:10 }}>
                  {/* 그룹 라벨 */}
                  <div style={{
                    fontSize:8, fontWeight:800, color:"#f19eb8", letterSpacing:"0.12em",
                    fontFamily:"sans-serif", marginBottom:6,
                  }}>{group.en} · {group.label}</div>
                  {/* 태그들 */}
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                    {group.tags.map(tag => {
                      const locked = tag.free === false;
                      const isOn = isLightTab
                        ? selectedLighting.some(l => l.en === tag.en)
                        : isMood
                          ? selectedMoods.includes(tag.en)
                          : selectedStyles.includes(tag.en);
                      return (
                        <button key={tag.en} onClick={() => {
                          if(locked) return;
                          if(isLightTab) {
                            setSelectedLighting(prev => isOn ? prev.filter(l=>l.en!==tag.en) : [...prev, tag]);
                          } else if(isMood) {
                            setSelectedMoods(prev => isOn ? prev.filter(m=>m!==tag.en) : [...prev, tag.en]);
                          } else {
                            setSelectedStyles(prev => isOn ? prev.filter(s=>s!==tag.en) : [...prev, tag.en]);
                          }
                        }} style={{
                          background: locked ? "#1a1a1a" : isOn ? activeColor : "#252525",
                          border: `1px solid ${locked ? "#181828" : isOn ? activeColor : "#2a2a2a"}`,
                          borderRadius:16, padding:"4px 11px", cursor: locked ? "default" : "pointer",
                          color: locked ? "#252535" : isOn ? "#e0ddd4" : "#888",
                          fontFamily:"sans-serif", fontSize:11, fontWeight: isOn ? 700 : 400,
                          transition:"all 0.15s", opacity: locked ? 0.6 : 1,
                          display:"flex", alignItems:"center", gap:4,
                        }}>
                          {locked && <span style={{fontSize:8}}>🔒</span>}
                          <span>{langKR ? tag.kr : tag.en}</span>
                          {!langKR && <span style={{ fontSize:7, color: isOn ? "#4a4a4a" : "rgba(200,200,200,0.28)", marginLeft:2, fontWeight:400 }}>{tag.kr}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 하단 프롬프트 바 */}
      <div style={{
        background:"#111", padding:"10px 20px",
        display:"flex", alignItems:"flex-start", gap:10, flexWrap:"wrap",
        borderTop:"2px solid #f19eb8", position:"relative", zIndex:10,
      }}>
        {/* PROMPT 라벨 + 언어 토글 */}
        <div style={{ display:"flex", flexDirection:"column", gap:4, alignItems:"flex-start", flexShrink:0, paddingTop:2 }}>
          <span style={{ fontSize:8, color:"#f19eb8", fontFamily:"'Arial Black',sans-serif", letterSpacing:"0.2em", fontWeight:900 }}>PROMPT</span>
          <div style={{ display:"flex", gap:2 }}>
            {[["kr","KR"],["en","EN"]].map(([val, label]) => {
              const isActive = promptLang === val || (promptLang === null && (val === "kr") === langKR);
              return (
                <button key={val} onClick={() => setPromptLang(promptLang === val ? null : val)} style={{
                  background: isActive ? "#f19eb8" : "transparent",
                  color: isActive ? "#111" : "#444",
                  border: "1px solid " + (isActive ? "#f19eb8" : "#333"),
                  borderRadius:3, padding:"1px 5px", cursor:"pointer",
                  fontSize:8, fontWeight:900, fontFamily:"'Arial Black',sans-serif",
                  transition:"all 0.12s",
                }}>{label}</button>
              );
            })}
          </div>
        </div>
        <div style={{
          flex:1, minWidth:200, fontSize:11, color:"#e0ddd4", fontFamily:"monospace",
          whiteSpace:"pre-wrap", wordBreak:"break-all", lineHeight:1.6,
        }}>{displayPrompt}</div>
        <button onClick={copyPrompt} style={{
          background:"#f19eb8", color:"#1a1a1a", border:"none",
          borderRadius:0, padding:"10px 20px", cursor:"pointer",
          fontFamily:"'Arial Black','Helvetica Neue',sans-serif",
          fontSize:11, fontWeight:900, whiteSpace:"nowrap",
          letterSpacing:"0.05em", textTransform:"uppercase", alignSelf:"flex-start",
        }}>{copied ? "✓ 복사됨" : "복사 COPY"}</button>

        {/* 북마크 저장 */}
        <button onClick={async () => { await saveBookmark(); setSaved(true); setTimeout(() => setSaved(false), 1200); }} title="북마크 저장" style={{
          background: saved ? "#f19eb8" : "#252525", border:"1px solid #2a3a6a",
          borderRadius:8, color: saved ? "#1a1a1a" : "#f19eb8", fontSize: saved ? 11 : 18,
          padding:"7px 12px", cursor:"pointer", transition:"all 0.15s",
          lineHeight:1, fontWeight: saved ? 900 : 400, fontFamily:"sans-serif",
        }}>{saved ? "✓ 저장됨" : "⭐"}</button>

        {/* 북마크 목록 */}
        <button onClick={() => setShowBookmarks(v => !v)} style={{
          background: showBookmarks ? "#f19eb8" : "#252525",
          border:"1px solid #2a3a6a", borderRadius:8,
          color: showBookmarks ? "#1a1a1a" : "#666",
          fontSize:11, fontWeight:700, padding:"7px 11px",
          cursor:"pointer", fontFamily:"sans-serif",
          whiteSpace:"nowrap", position:"relative",
        }}>
          📋
          {bookmarks.length > 0 && (
            <span style={{
              position:"absolute", top:-5, right:-5,
              background:"#f19eb8", color:"#e0ddd4", borderRadius:8,
              fontSize:8, padding:"1px 4px", fontWeight:800,
            }}>{bookmarks.length}</span>
          )}
        </button>
      </div>

      {/* 북마크 패널 — 프롬프트 바 위로 펼침 */}
      {showBookmarks && (
        <div style={{
          position:"absolute", bottom:52, left:0, right:0,
          background:"#141414", borderTop:"2px solid #f19eb8",
          maxHeight:260, overflowY:"auto", zIndex:300,
        }}>
          <div style={{
            display:"flex", alignItems:"center", justifyContent:"space-between",
            padding:"7px 14px", borderBottom:"1px solid #1a2a4a", position:"sticky", top:0,
            background:"#1a1a1a",
          }}>
            <span style={{ fontSize:9, color:"#f19eb8", fontFamily:"sans-serif", fontWeight:800, letterSpacing:"0.1em" }}>
              ⭐ BOOKMARKS · {bookmarks.length}개
            </span>
            {bookmarks.length > 0 && (
              <button onClick={clearAllBookmarks} style={{
                background:"none", border:"none", color:"#444", fontSize:9,
                cursor:"pointer", fontFamily:"sans-serif",
              }}>전체삭제</button>
            )}
          </div>

          {bookmarks.length === 0 ? (
            <div style={{ padding:"18px", textAlign:"center", color:"#444", fontSize:11, fontFamily:"sans-serif" }}>
              ⭐ 눌러서 현재 프롬프트 저장
            </div>
          ) : bookmarks.map(bm => (
            <div key={bm.id}
              onClick={() => { try{navigator.clipboard?.writeText(bm.prompt)}catch{} setShowBookmarks(false); }}
              style={{
                padding:"8px 14px", borderBottom:"1px solid #0d0d1a",
                display:"flex", gap:8, alignItems:"flex-start",
                cursor:"pointer", transition:"background 0.1s",
              }}
              onMouseEnter={e => e.currentTarget.style.background="#111130"}
              onMouseLeave={e => e.currentTarget.style.background="transparent"}
            >
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", gap:5, marginBottom:3, alignItems:"center" }}>
                  <span style={{
                    fontSize:8, color:"#f19eb8", fontFamily:"sans-serif", fontWeight:700,
                    background:"rgba(241,158,184,0.15)", padding:"1px 6px", borderRadius:6,
                  }}>{bm.subject}</span>
                  <span style={{ fontSize:8, color:"#444", fontFamily:"sans-serif" }}>{bm.ts}</span>
                  <span style={{ fontSize:8, color:"#444", fontFamily:"sans-serif", marginLeft:"auto" }}>클릭시 복사</span>
                </div>
                <div style={{
                  fontSize:10, color:"#777", fontFamily:"monospace", lineHeight:1.5,
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                }}>{bm.prompt}</div>
              </div>
              <button onClick={e => { e.stopPropagation(); deleteBookmark(bm.id); }} style={{
                background:"none", border:"none", color:"#444",
                fontSize:13, cursor:"pointer", flexShrink:0, padding:"0 2px",
              }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 메인 앱 ───────────────────────────────────────────────────────────
export default function App() {
  const [langKR, setLangKR] = useState(false);  // 한/EN 토글


  // ── 조합 저장/불러오기 (deprecated) ──

  return (
    <div style={{ minHeight: "100vh", background: "#1a1a1a", fontFamily: "'Arial Black', 'Helvetica Neue', sans-serif", color: "#e0ddd4" }}>

      {/* 헤더 */}
      <header style={{
        borderBottom: "2px solid #222", padding: "10px 28px 0",
        background: "#1a1a1a", position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, letterSpacing: "-0.04em", display:"flex", alignItems:"baseline", gap:6 }}>
            <span style={{ color:"#e0ddd4" }}>CAMERA</span>
            <span style={{ color:"#f19eb8" }}>KEYWORD</span>
            <span style={{ fontSize:12, color:"#333" }}>✦</span>
          </h1>
          <span style={{ fontSize: 8, color: "#444", letterSpacing: "0.2em", fontFamily: "sans-serif", textTransform:"uppercase" }}>
            AI PROMPT GENERATOR
          </span>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: "#f19eb8" }} />
              <span style={{ fontSize: 9, color: "#aaa", fontFamily: "sans-serif" }}>샷</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: "#2563eb" }} />
              <span style={{ fontSize: 9, color: "#aaa", fontFamily: "sans-serif" }}>높이</span>
            </div>
            <button onClick={() => setLangKR(p => !p)} style={{
              fontSize: 10, background: langKR ? "#f19eb8" : "#222", color: "#e0ddd4",
              padding: "4px 12px", borderRadius: 20, letterSpacing: "0.1em",
              fontFamily: "sans-serif", border: "none", cursor: "pointer",
              fontWeight: 700, transition: "background 0.2s",
            }}>
              {langKR ? "한국어" : "EN"}
            </button>
          </div>
        </div>

      </header>

      {/* 메인 */}
      {true ? (
        <InteractiveMode
          langKR={langKR}
        />
      ) : null}

    </div>
  );
}
