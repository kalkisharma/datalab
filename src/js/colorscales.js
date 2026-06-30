// colorscales.js — colormap name → a colorscale Plotly will actually honor.
//
// Plotly 3.6.0 knows only a fixed set of named colorscales. The matplotlib maps
// below (Plasma/Inferno/Magma/Turbo/Coolwarm) and Reds were silently FALLING
// BACK to a default when passed by name — the dropdown label disagreed with the
// rendered scale (a §20 honesty defect: 6 of the 12 options rendered identically).
//
// resolveColorscale() maps every dropdown option to either a real Plotly name
// (pass-through) or an explicit [[stop, color], …] array, and ALLOWLISTS: an
// unknown value — including a poisoned colormap field from an imported session —
// falls back to Viridis and is never passed through raw (Security §8).
//
// The explicit arrays use canonical published anchors (matplotlib BIDS maps for
// plasma/inferno/magma, Google Turbo, ColorBrewer Reds, Moreland coolwarm),
// sampled at even stops. Data Scientist signs off on perceptual fidelity (§18).

const COLORSCALE_ARRAYS = {
  Plasma:   [[0,'#0d0887'],[0.111,'#46039f'],[0.222,'#7201a8'],[0.333,'#9c179e'],[0.444,'#bd3786'],[0.556,'#d8576b'],[0.667,'#ed7953'],[0.778,'#fb9f3a'],[0.889,'#fdca26'],[1,'#f0f921']],
  Inferno:  [[0,'#000004'],[0.111,'#1b0c41'],[0.222,'#4a0c6b'],[0.333,'#781c6d'],[0.444,'#a52c60'],[0.556,'#cf4446'],[0.667,'#ed6925'],[0.778,'#fb9a06'],[0.889,'#f7d13d'],[1,'#fcffa4']],
  Magma:    [[0,'#000004'],[0.111,'#180f3d'],[0.222,'#440f76'],[0.333,'#721f81'],[0.444,'#9e2f7f'],[0.556,'#cd4071'],[0.667,'#f1605d'],[0.778,'#fd9567'],[0.889,'#feca8d'],[1,'#fcfdbf']],
  Turbo:    [[0,'#30123b'],[0.1,'#4145ab'],[0.2,'#4675ed'],[0.3,'#39a2fc'],[0.4,'#1bcfd4'],[0.5,'#24eca6'],[0.6,'#61fc6c'],[0.7,'#a4fc3b'],[0.8,'#d1e834'],[0.9,'#fb8022'],[1,'#7a0403']],
  Coolwarm: [[0,'#3b4cc0'],[0.1,'#5a78e4'],[0.2,'#7b9ff9'],[0.3,'#9ebeff'],[0.4,'#bfd3f6'],[0.5,'#dddddd'],[0.6,'#f6bfa6'],[0.7,'#f5a081'],[0.8,'#e7745b'],[0.9,'#d24b40'],[1,'#b40426']],
  Reds:     [[0,'#fff5f0'],[0.125,'#fee0d2'],[0.25,'#fcbba1'],[0.375,'#fc9272'],[0.5,'#fb6a4a'],[0.625,'#ef3b2c'],[0.75,'#cb181d'],[0.875,'#a50f15'],[1,'#67000d']],
};

// Names Plotly 3.6.0 renders correctly by string (verified distinct).
const COLORSCALE_NAMED = new Set(['Viridis', 'Cividis', 'RdBu', 'Blues', 'Greens', 'Jet']);

// Dropdown grouping (Data Scientist guardrail, v2.18.1): perceptually-uniform /
// colorblind-safe first, then diverging, single-hue, and rainbow (cautioned).
// Single source for the global picker (mirrored statically in index.html) and
// the per-plot / per-series <select> builders below.
const COLORMAP_GROUPS = [
  ['Perceptually uniform (colorblind-safe)', ['Viridis', 'Plasma', 'Inferno', 'Magma', 'Cividis']],
  ['Diverging — for a meaningful midpoint',  ['RdBu', 'Coolwarm']],
  ['Single-hue sequential',                  ['Blues', 'Reds', 'Greens']],
  ['Rainbow — not perceptually uniform',     ['Turbo', 'Jet']],
];

// Grouped <optgroup> options for the per-plot / per-series colormap selects.
// (Plotly text only — these are option labels, not user data; no escHtml sink.)
function colormapOptionsHTML(selected) {
  return COLORMAP_GROUPS.map(([label, names]) =>
    `<optgroup label="${label}">` +
    names.map(n => `<option value="${n}"${selected === n ? ' selected' : ''}>${n}</option>`).join('') +
    `</optgroup>`).join('');
}

// Default fallback — the documented, perceptually-uniform, colorblind-safe map.
const COLORSCALE_DEFAULT = 'Viridis';

function resolveColorscale(name) {
  if (typeof name === 'string') {
    if (COLORSCALE_ARRAYS[name]) return COLORSCALE_ARRAYS[name];
    if (COLORSCALE_NAMED.has(name)) return name;
  }
  return COLORSCALE_DEFAULT; // allowlist: unknown / non-string / poisoned → Viridis
}

// Effective colormap NAME for a series (v2.20.0): per-series override, then the
// plot override, then the global Style-panel picker, then Viridis. The
// dispatcher (chart.js) bakes this onto the cloned series so renderers read a
// concrete name and the trace cache reflects it; pass the result through
// resolveColorscale() to get the Plotly colorscale.
function effectiveColormap(series, plot) {
  return (series && series.colormap)
      || (plot && plot.plotConfig && plot.plotConfig.colormap)
      || document.getElementById('cmapSelect')?.value
      || COLORSCALE_DEFAULT;
}
