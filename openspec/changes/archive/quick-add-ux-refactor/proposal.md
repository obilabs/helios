# Proposal: Quick Add UX Refactor

## Goal
Align the `QuickAddUserSlideOut` component visually with the "gold standard" `UserSlideOut`.
The current implementation uses "floating labels" which clash with the rest of the application's design language (static top labels).

## Scope
1.  **Refactor Form Fields**: Remove floating label logic/styling. Use standard vertical stack: Label top, Input bottom.
2.  **CSS Parity**: Reuse `UserSlideOut.css` classes where possible, or match their values exactly in `QuickAddUserSlideOut.css`.
3.  **Visual Consistency**: Ensure padding, font sizes, and input heights match the User Details slideout.

## Success Criteria
-   Quick Add slideout looks indistinguishable in style from User Details slideout.
-   No "jumping" labels when clicking inputs.
-   Provider checkboxes remain distinct but styled consistently.
