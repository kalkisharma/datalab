# DataLab — ARIA Checklist

Owned by the Accessibility Specialist. Changes require sign-off from any two other roles.

This checklist is applied to every new dynamic panel or modal before the phase that introduces it closes. A full audit (all panels + screen reader testing) runs at Phase 4.

---

## Minimum per-phase pass

For each new panel or modal introduced this phase, verify all five items:

- [ ] **1. Roles** — All interactive regions have correct `role` attributes (e.g., `role="dialog"` on the series-editor and Data Tools modals, `role="list"` / `role="listitem"` on the series and dataset lists, the multi-plot grid panels, and the saved-plots strip).

- [ ] **2. Labels** — All icon-only controls have `aria-label` describing their action (e.g., `aria-label="Delete series"`). Text-visible controls do not need redundant `aria-label`.

- [ ] **3. Focus management** — Modals and slide-in panels move focus to the first interactive element on open and restore focus to the trigger element on close. Tested by keyboard navigation (Tab only, no mouse).

- [ ] **4. Keyboard navigation** — All list-based UI (series list, dataset list, saved plots strip) supports keyboard navigation. Arrow keys or Tab moves between items. Enter/Space activates. The series-editor modal's form controls across all twelve chart types are keyboard-reachable, including the encoding/style controls (color-by, size-by law/min-max/size-legend fields, marker-shape and line-dash selects, the show-markers toggle, and marker-color) added through v2.14.0, and the later native controls: the pair-plot numeric-column checklist + Select-all/Clear buttons + categorical-hue select (v2.24.0), the Q–Q single-column picker, the residual X/Y/degree pickers, and the scatter confidence/prediction-bands select (v2.26.0). All are native `<input>`/`<select>`/checkbox elements — no custom/mouse-only widget was added.

- [ ] **5. Tab order** — Tab order is logical and matches visual reading order. No focus traps outside of open modals. Verified by tabbing through the entire panel without a mouse.

---

## Visually-hidden text

Use the `.sr-only` CSS class (defined in `style.css`) for all text that is meaningful to screen readers but not shown visually:

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
```

---

## Dynamic content

- Error messages displayed dynamically (renderer errors, validation failures) must use `role="alert"` so screen readers announce them without requiring focus.
- Plotly annotation text and statistical summaries (parity NSE/MAE/RMSE, the Q–Q straight-line correlation + verdict, the residual RMSE + shape note, histogram distribution fits, and the pair-plot summary) must be duplicated in a `.sr-only` `<span>` adjacent to the plot — Plotly annotations are SVG elements and do not support `aria-label` directly. These flow through the shared `plotSR-<plotId>` summary (fed by each renderer's `fitAnnot.sr` / SR string).
- **Draggable plot decorations** — the legend, the optional second (size-key) legend, free-text notes, and the parity stats box are mouse-draggable with no keyboard equivalent. Their keyboard-access remediation is **formally DEFERRED** (named at the next phase scoping; trip-wire = any external a11y report); this checklist names them so the gap is tracked, not silently omitted.

---

## Phase 4 full audit scope

In addition to the per-phase checklist above, the Phase 4 audit covers:

- All panels and interactions across the full tool
- Screen reader behavior testing: VoiceOver on macOS 13+ (mandatory), NVDA on Windows (secondary)
- Datetime format prompt modal accessibility
- Statistical annotation `.sr-only` spans verified for all twelve chart types (scatter, line, bar, parity, contour, histogram, box, violin, heatmap, pair, qq, residual)
- Color contrast of all text and interactive elements
