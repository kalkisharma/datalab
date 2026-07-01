// render-cache.js — per-series trace memoization (Performance, Phase 2;
// split from chart.js at the v2.10.0 §6 refactor review — function
// extraction, suite-verified). The dispatcher (chart.js) builds traces
// through buildSeriesResult and releases deleted series through
// pruneTraceCache. RENDERERS lives in chart.js; both share global scope
// after the build concatenation, so the call resolves at render time.
//
// The key captures everything a trace depends on: the series definition,
// the revision of every dataset it reads, the global style panel values
// buildMarkerStyle consumes, and the plot context (xLog → histogram bins).
// A style-only re-render reuses every cached trace.

const _traceCache = new Map(); // series.id → { key, result }

function globalStyleKey() {
  return ['markerSize', 'markerOpacity', 'edgeColor', 'edgeWidth', 'cmapSelect']
    .map(id => document.getElementById(id)?.value ?? '')
    .join('|');
}

// Drop cache entries for series no longer present so their traces are
// released (Phase 4: deleting the last series must free its cached traces).
function pruneTraceCache(seriesList) {
  for (const id of [..._traceCache.keys()]) {
    if (!seriesList.some(s => s.id === id)) _traceCache.delete(id);
  }
}

function buildSeriesResult(s, ctx) {
  const key = JSON.stringify(s)
    + '|' + datasetRev(s.datasetId)
    + (s.joinDatasetId ? '|' + datasetRev(s.joinDatasetId) : '')
    + '|' + globalStyleKey()
    + '|x' + (ctx?.xLog ? 1 : 0); // plot context affects histogram binning (Phase 13)
  const cached = _traceCache.get(s.id);
  if (cached && cached.key === key) return cached.result;
  // Fail closed on an unknown/crafted chartType (§8 stored-enum rule) — never
  // index RENDERERS with an inherited Object member like 'constructor'.
  if (!Object.hasOwn(RENDERERS, s.chartType)) return { traces: [], error: 'Unknown chart type.' };
  const result = RENDERERS[s.chartType](s, appState.datasets, ctx);
  _traceCache.set(s.id, { key, result });
  return result;
}
