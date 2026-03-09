export function mergeHistoryItems({ scopedItems = [], legacyItems = [] } = {}) {
  const seen = new Set();
  return [...scopedItems, ...legacyItems]
    .slice()
    .sort((a, b) => Number(b?.updatedAt || 0) - Number(a?.updatedAt || 0))
    .filter((item) => {
      const format = String(item?.format || "keyword").trim().toLowerCase();
      const key = `${format}:${String(item?.text || "").trim().toLowerCase()}`;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function mergePresetItems({ scopedItems = [], legacyItems = [] } = {}) {
  const seen = new Set();
  return [...scopedItems, ...legacyItems]
    .slice()
    .sort((a, b) => Number(b?.updatedAt || 0) - Number(a?.updatedAt || 0))
    .filter((item) => {
      const key = String(item?.id || "").trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function getLegacyImportSummary({
  scopedHistory = [],
  legacyHistory = [],
  scopedPresets = [],
  legacyPresets = [],
} = {}) {
  const scopedHistoryKeys = new Set(
    scopedHistory.map(
      (item) =>
        `${String(item?.format || "keyword").trim().toLowerCase()}:${String(item?.text || "").trim().toLowerCase()}`,
    ),
  );
  const scopedPresetKeys = new Set(scopedPresets.map((item) => String(item?.id || "").trim()));

  const historyCount = legacyHistory.filter((item) => {
    const key = `${String(item?.format || "keyword").trim().toLowerCase()}:${String(item?.text || "").trim().toLowerCase()}`;
    return key && !scopedHistoryKeys.has(key);
  }).length;

  const presetCount = legacyPresets.filter((item) => {
    const key = String(item?.id || "").trim();
    return key && !scopedPresetKeys.has(key);
  }).length;

  return {
    historyCount,
    presetCount,
    totalCount: historyCount + presetCount,
    hasImportableData: historyCount + presetCount > 0,
  };
}
