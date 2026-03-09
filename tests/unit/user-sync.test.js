import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { getUserStorageScope } from "../../src/features/interactive/userDataSync";

const require = createRequire(import.meta.url);
const {
  mergeAccountEnvironment,
  sanitizeAccountEnvironment,
  sanitizeHistoryItems,
  sanitizePresetItems,
} = require("../../api/_userSync.js");

describe("user sync helpers", () => {
  it("creates a stable account-scoped storage key", () => {
    expect(getUserStorageScope("user-123_test@example.com")).toBe("account_user-123_testexamplecom");
    expect(getUserStorageScope("")).toBe("");
  });

  it("deduplicates and limits synced prompt history", () => {
    const items = sanitizeHistoryItems([
      { text: "wide shot, wide shot", lang: "en", source: "auto" },
      { text: "Wide Shot", lang: "en", source: "manual" },
      { text: "close-up shot", lang: "en", source: "manual" },
    ]);

    expect(items).toHaveLength(2);
    expect(items[0].text).toBe("wide shot");
    expect(items[1].text).toBe("close-up shot");
  });

  it("keeps sentence and keyword history entries separate", () => {
    const items = sanitizeHistoryItems([
      { text: "wide shot", lang: "en", source: "auto", format: "keyword" },
      { text: "wide shot", lang: "en", source: "auto", format: "sentence" },
    ]);

    expect(items).toHaveLength(2);
    expect(items[0].format).toBe("keyword");
    expect(items[1].format).toBe("sentence");
  });

  it("sanitizes synced presets into the supported range", () => {
    const items = sanitizePresetItems([
      {
        name: "Test preset",
        phi: 300,
        theta: -240,
        r: -5,
        subjectPos: { x: 4, y: -4 },
        gazeVector: { x: 9, y: -9 },
        arPresetId: "ar916",
      },
    ]);

    expect(items).toEqual([
      expect.objectContaining({
        name: "Test preset",
        phi: 179,
        theta: -180,
        r: 0,
        subjectPos: { x: 1.8, y: -1.8 },
        gazeVector: { x: 1, y: -1 },
        arPresetId: "ar916",
      }),
    ]);
  });

  it("sanitizes account environment settings into supported values", () => {
    const item = sanitizeAccountEnvironment({
      workspaceLabel: "  My   Personal   Workspace  ",
      defaultPromptLanguage: "JP",
      syncMode: "BALANCED",
      legacyImportMode: "AUTO",
      uiDensity: "dense",
      interactiveDefaults: {
        cameraDefaults: {
          phi: 500,
          theta: -500,
          r: -1,
          subjectPos: { x: 9, y: -9 },
          gazeVector: { x: 9, y: -9 },
          arPresetId: "ar916<script>",
          includeAngleInPrompt: false,
          qualityPresetLevel: 9,
          updatedAt: "456",
        },
      },
      updatedAt: "12345",
    });

    expect(item).toEqual({
      workspaceLabel: "My Personal Workspace",
      defaultPromptLanguage: "auto",
      syncMode: "balanced",
      legacyImportMode: "auto",
      uiDensity: "immersive",
      interactiveDefaults: {
        defaultCustomPromptHint: "",
        cameraDefaults: {
          phi: 179,
          theta: -180,
          r: 0,
          subjectPos: { x: 1.8, y: -1.8 },
          gazeVector: { x: 1, y: -1 },
          arPresetId: "ar916script",
          includeAngleInPrompt: false,
          qualityPresetLevel: 5,
          updatedAt: 456,
        },
      },
      updatedAt: 12345,
    });
  });

  it("merges account environment writes without losing newer remote sections", () => {
    const merged = mergeAccountEnvironment(
      {
        workspaceLabel: "Remote Workspace",
        defaultPromptLanguage: "kr",
        updatedAt: 300,
        interactiveDefaults: {
          cameraDefaults: {
            phi: 44,
            updatedAt: 500,
          },
        },
      },
      {
        workspaceLabel: "Stale Workspace",
        updatedAt: 200,
        interactiveDefaults: {
          cameraDefaults: {
            phi: 120,
            updatedAt: 600,
          },
        },
      },
    );

    expect(merged.workspaceLabel).toBe("Remote Workspace");
    expect(merged.defaultPromptLanguage).toBe("kr");
    expect(merged.updatedAt).toBe(300);
    expect(merged.interactiveDefaults.cameraDefaults.phi).toBe(120);
    expect(merged.interactiveDefaults.cameraDefaults.updatedAt).toBe(600);
  });
});
