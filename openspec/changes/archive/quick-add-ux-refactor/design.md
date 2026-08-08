# Design: Quick Add UX Refactor

## UI Components
The refactor targets `QuickAddUserSlideOut.tsx` and its CSS.

### Current State (Floating Labels)
```css
.field-container { position: relative; }
.field-label.floating { top: -10px; font-size: 12px; }
```

### Target State (Static Labels)
Reference: `UserSlideOut.tsx` pattern.
```tsx
<div className="form-group">
  <label className="standard-label">Email</label>
  <input className="standard-input" />
</div>
```

## CSS Strategy
-   Remove `.field-container` relative positioning logic.
-   Remove `.field-label` absolute positioning.
-   Ensure `.provider-section` uses a standard header style (e.g., `h3` or generic label style used in other sections).

## Component Logic
-   Remove `onFocus`/`onBlur` floating state handlers.
-   Simplify `renderField` helper to just render Label + Input block.
