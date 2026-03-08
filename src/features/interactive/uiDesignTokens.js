export const UI_DESIGN_TOKENS = {
  neutral: {
    bg: "#0b0f14",
    panel: "#101722",
    panelRaised: "#141d2b",
    panelSoft: "#0f1622",
    borderSoft: "#26324a",
    borderStrong: "#344764",
  },
  text: {
    strong: "#eef3ff",
    main: "#c8d2e8",
    muted: "#8b97b3",
    dim: "#6a748c",
  },
  accents: {
    shot: "#56B6FF",
    angle: "#FF6FAE",
    direction: "#FFB84D",
    position: "#A78BFA",
    gaze: "#38D6C4",
    ratio: "#E8EEFF",
    subject: "#F4D35E",
    custom: "#FFD166",
    success: "#7BD389",
    warning: "#F7B267",
    error: "#FF8FB8",
  },
  alpha: {
    selected: 1,
    hover: 0.8,
    base: 0.45,
    disabled: 0.2,
  },
  spacing: {
    section: 24,
    card: 16,
    control: 10,
  },
};

export const UI_DESIGN_SEGMENT_COLORS = {
  subject: UI_DESIGN_TOKENS.accents.subject,
  shot: UI_DESIGN_TOKENS.accents.shot,
  height: UI_DESIGN_TOKENS.accents.angle,
  direction: UI_DESIGN_TOKENS.accents.direction,
  gaze: UI_DESIGN_TOKENS.accents.gaze,
  composition: UI_DESIGN_TOKENS.accents.position,
  custom: UI_DESIGN_TOKENS.accents.custom,
  framing: UI_DESIGN_TOKENS.accents.ratio,
  ratio: UI_DESIGN_TOKENS.accents.ratio,
};
