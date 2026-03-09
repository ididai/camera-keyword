import { describe, expect, it } from "vitest";
import {
  buildDisplayPromptSegments,
  buildPromptSegments,
  buildUpgradedPromptSegments,
  inferPromptLanguageFromText,
  splitCustomQualityText,
  toSentenceText,
  toPromptText,
} from "../../src/features/interactive/promptBuilder";

describe("prompt builder", () => {
  it("separates quality preset text from custom tail", () => {
    const custom = "Night background with stars, 8k photograph, ultra high resolution";
    const quality = "8k photograph, ultra high resolution";
    expect(splitCustomQualityText(custom, quality)).toEqual({
      customText: "Night background with stars",
      qualityText: "8k photograph, ultra high resolution",
    });
  });

  it("keeps custom text when quality suffix does not match", () => {
    const custom = "하늘에서 별이 쏟아지는 밤 배경";
    const quality = "8k photograph, ultra high resolution";
    expect(splitCustomQualityText(custom, quality)).toEqual({
      customText: "하늘에서 별이 쏟아지는 밤 배경",
      qualityText: "",
    });
  });

  it("adds quality segment to display when matched", () => {
    const segments = [
      { type: "subject", text: "A person wearing a hat" },
      {
        type: "custom",
        text: "Night background with stars, 8k photograph, ultra high resolution",
      },
      { type: "ratio", text: "--ar 9:16" },
    ];

    const next = buildDisplayPromptSegments(segments, "8k photograph, ultra high resolution");
    expect(next).toEqual([
      { type: "subject", text: "A person wearing a hat" },
      { type: "custom", text: "Night background with stars" },
      { type: "quality", text: "8k photograph, ultra high resolution" },
      { type: "ratio", text: "--ar 9:16" },
    ]);
  });

  it("keeps shot as a single label string for medium close-up wording", () => {
    const segments = buildPromptSegments({
      subjectText: "a person",
      shot: "medium close-up (chest-up)",
      height: "knee level",
      direction: "right-facing 45-degree oblique view",
      gaze: "looking left",
      composition: "subject centered in frame",
      custom: "",
      ratioFraming: "vertical framing",
      arValue: "9:16",
      includeAngle: true,
    });

    expect(segments.find((segment) => segment.type === "shot")?.text).toBe("medium close-up (chest-up)");
    expect(toPromptText(segments)).toContain("medium close-up (chest-up)");
  });

  it("removes shot-class duplicates from custom text but keeps non-shot terms", () => {
    const segments = buildPromptSegments({
      subjectText: "a person",
      shot: "medium close-up (chest-up)",
      height: "knee level",
      direction: "right-facing 45-degree oblique view",
      gaze: "looking left",
      composition: "subject centered in frame",
      custom: "medium close-up, chest-up framing, cinematic lighting",
      ratioFraming: "vertical framing",
      arValue: "9:16",
      includeAngle: true,
    });

    expect(segments.find((segment) => segment.type === "custom")?.text).toBe("cinematic lighting");
  });

  it("keeps custom phrase when shot term is part of a longer non-shot sentence", () => {
    const segments = buildPromptSegments({
      subjectText: "a person",
      shot: "medium close-up (chest-up)",
      height: "knee level",
      direction: "right-facing 45-degree oblique view",
      gaze: "looking left",
      composition: "subject centered in frame",
      custom: "medium close-up portrait with dramatic neon lighting",
      ratioFraming: "vertical framing",
      arValue: "9:16",
      includeAngle: true,
    });

    expect(segments.find((segment) => segment.type === "custom")?.text).toBe(
      "medium close-up portrait with dramatic neon lighting",
    );
  });

  it("keeps english prompt language after an upgraded english prompt is applied", () => {
    expect(
      inferPromptLanguageFromText(
        "cinematic portrait, medium shot, eye-level angle, right-facing 45-degree oblique view --ar 9:16",
        "kr",
      ),
    ).toBe("en");
  });

  it("preserves korean prompt language when the refined prompt still contains korean", () => {
    expect(
      inferPromptLanguageFromText(
        "시네마틱 인물 사진, 미디엄 샷, 눈높이 앵글, 우측 45도 사선 구도 --ar 9:16",
        "en",
      ),
    ).toBe("kr");
  });

  it("keeps keyword prompt output stable", () => {
    const segments = buildPromptSegments({
      subjectText: "a person",
      shot: "medium close-up (chest-up)",
      height: "eye level",
      direction: "right-facing 45-degree oblique view",
      gaze: "looking left",
      composition: "subject centered in frame",
      custom: "cinematic lighting",
      ratioFraming: "vertical framing",
      arValue: "9:16",
      includeAngle: true,
    });

    expect(toPromptText(segments)).toBe(
      "a person, medium close-up (chest-up), eye level, right-facing 45-degree oblique view, subject centered in frame, looking left, cinematic lighting, vertical framing --ar 9:16",
    );
  });

  it("builds an english sentence prompt from keyword segments", () => {
    const segments = buildPromptSegments({
      subjectText: "a person",
      shot: "medium close-up (chest-up)",
      height: "eye level",
      direction: "right-facing 45-degree oblique view",
      gaze: "looking left",
      composition: "subject centered in frame",
      custom: "cinematic lighting",
      ratioFraming: "vertical framing",
      arValue: "9:16",
      includeAngle: true,
    });

    expect(toSentenceText(segments, "en")).toBe(
      "A medium close-up (chest-up) of a person, eye level, right-facing 45-degree oblique view, looking left, subject centered in frame, vertical framing, cinematic lighting --ar 9:16",
    );
  });

  it("omits angle details when angle is excluded from segments", () => {
    const segments = buildPromptSegments({
      subjectText: "a person",
      shot: "medium shot (waist-up)",
      height: "eye level",
      direction: "right-facing 45-degree oblique view",
      gaze: "looking left",
      composition: "subject centered in frame",
      custom: "",
      ratioFraming: "vertical framing",
      arValue: "9:16",
      includeAngle: false,
    });

    expect(toSentenceText(segments, "en")).toBe(
      "A medium shot (waist-up) of a person, subject centered in frame, vertical framing --ar 9:16",
    );
  });

  it("builds an upgraded sentence prompt alongside keyword upgrade", () => {
    const segments = buildUpgradedPromptSegments({
      subjectText: "a person",
      shot: "medium close-up (chest-up)",
      height: "eye level",
      direction: "right-facing 45-degree oblique view",
      gaze: "looking left",
      composition: "subject centered in frame",
      custom: "cinematic lighting",
      ratioFraming: "vertical framing",
      arValue: "9:16",
      includeAngle: true,
    });

    const keyword = toPromptText(segments);
    const sentence = toSentenceText(segments, "en");
    expect(keyword).toContain("--ar 9:16");
    expect(sentence).toContain("--ar 9:16");
    expect(sentence).toContain("A medium close-up (chest-up) of a person");
  });
});
