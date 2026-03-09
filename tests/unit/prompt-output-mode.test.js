import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function countOccurrences(source, token) {
  return source.split(token).length - 1;
}

describe("prompt output mode retention", () => {
  it("changes prompt format only via the explicit toggle handler", () => {
    const modePath = path.resolve(process.cwd(), "src/features/interactive/InteractiveMode.jsx");
    const designPath = path.resolve(process.cwd(), "src/features/interactive/InteractiveModeDesign.jsx");
    const modeSource = fs.readFileSync(modePath, "utf8");
    const designSource = fs.readFileSync(designPath, "utf8");

    expect(modeSource).toContain("handlePromptFormatChange");
    expect(designSource).toContain("handlePromptFormatChange");
    expect(modeSource).toContain('handlePromptFormatChange("keyword")');
    expect(modeSource).toContain('handlePromptFormatChange("sentence")');
    expect(designSource).toContain('handlePromptFormatChange("keyword")');
    expect(designSource).toContain('handlePromptFormatChange("sentence")');
    expect(countOccurrences(modeSource, "setPromptFormat(")).toBe(1);
    expect(countOccurrences(designSource, "setPromptFormat(")).toBe(1);
  });
});
