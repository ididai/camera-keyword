import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearPromptHistory,
  getPromptHistory,
  savePromptHistory,
} from "../../src/features/interactive/historyStore";

const storage = new Map();

function createLocalStorage() {
  return {
    get length() {
      return storage.size;
    },
    clear() {
      storage.clear();
    },
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    key(index) {
      return [...storage.keys()][index] ?? null;
    },
    setItem(key, value) {
      storage.set(key, value);
    },
    removeItem(key) {
      storage.delete(key);
    },
  };
}

beforeEach(() => {
  storage.clear();
  /** @type {any} */ (globalThis).window = {
    localStorage: createLocalStorage(),
  };
});

afterEach(() => {
  delete /** @type {any} */ (globalThis).window;
});

describe("history store", () => {
  it("stores prompt history with the selected format", () => {
    savePromptHistory({ text: "wide shot", lang: "en", source: "auto", format: "keyword" });
    savePromptHistory({ text: "wide shot", lang: "en", source: "auto", format: "sentence" });

    const history = getPromptHistory();
    expect(history).toHaveLength(2);
    expect(history[0].format).toBe("sentence");
    expect(history[1].format).toBe("keyword");
  });

  it("deduplicates history within the same format", () => {
    savePromptHistory({ text: "wide shot", lang: "en", source: "auto", format: "keyword" });
    savePromptHistory({ text: "Wide shot", lang: "en", source: "manual", format: "keyword" });

    const history = getPromptHistory();
    expect(history).toHaveLength(1);
    expect(history[0].format).toBe("keyword");
  });

  it("clears history across formats", () => {
    savePromptHistory({ text: "wide shot", lang: "en", source: "auto", format: "keyword" });
    savePromptHistory({ text: "A wide shot", lang: "en", source: "auto", format: "sentence" });

    clearPromptHistory();
    expect(getPromptHistory()).toEqual([]);
  });
});
