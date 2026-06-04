# DataLab — ARIA Checklist

Owned by the Accessibility Specialist. Changes require sign-off from any two other roles.

This checklist is applied to every new dynamic panel or modal before the phase that introduces it closes. A full audit (all panels + screen reader testing) runs at Phase 4.

---

## Minimum per-phase pass

For each new panel or modal introduced this phase, verify all five items:

- [ ] **1. Roles** — All interactive regions have correct `role` attributes (e.g., `role="dialog"` on modals, `role="list"` / `role="listitem"` on series list, `role="tab"` / `role="tabpanel"` on session tabs).

- [ ] **2. Labels** — All icon-only controls have `aria-label` describing their action (e.g., `aria-label="Delete series"`). Text-visible controls do not need redundant `aria-label`.

- [ ] **3. Focus management** — Modals and slide-in panels move focus to the first interactive element on open and restore focus to the trigger element on close. Tested by keyboard navigation (Tab only, no mouse).

- [ ] **4. Keyboard navigation** — All list-based UI (series list, dataset list, saved plots strip) supports keyboard navigation. Arrow keys or Tab moves between items. Enter/Space activates.

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
- Plotly annotation text (e.g., NSE/MAE/RMSE on parity plots) must be duplicated in a `.sr-only` `<span>` adjacent to the plot — Plotly annotations are SVG elements and do not support `aria-label` directly.

---

## Phase 4 full audit scope

In addition to the per-phase checklist above, the Phase 4 audit covers:

- All panels and interactions across the full tool
- Screen reader behavior testing: VoiceOver on macOS 13+ (mandatory), NVDA on Windows (secondary)
- Datetime format prompt modal accessibility
- Statistical annotation `.sr-only` spans verified for all chart types
- Color contrast of all text and interactive elements
