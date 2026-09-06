## 2024-09-06 - Accessible Custom Toggles
**Learning:** Custom interactive elements designed to look like switches and button groups must explicitly declare their semantics using `role="switch"` and `role="group"` respectively. State must be communicated via `aria-checked` and `aria-pressed`. This makes standard `div` and `button` elements understandable as specialized UI controls to screen readers.
**Action:** When creating custom styled toggles or multi-select groups, always verify that ARIA attributes match the visual affordance.
