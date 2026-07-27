# Tasks: Quick Add UX Alignment

## Refactor
- [x] **TASK-UX-REF-001**: Remove floating label CSS from `QuickAddUserSlideOut.css` *(Already complete - no floating label CSS present)*
- [x] **TASK-UX-REF-002**: Refactor `QuickAddUserSlideOut.tsx` to use standard `<label>` + `<input>` structure *(Already complete - uses standard label+input)*
- [x] **TASK-UX-REF-003**: Standardize input padding/height to match `UserSlideOut` inputs *(Complete - 0.625rem/6px border-radius matches)*
- [x] **TASK-UX-REF-004**: Align "Provider" section with "Groups" or "Settings" styling from User Details *(Complete - uses card styling)*

## Verification
- [x] **TASK-TEST-001**: Verify visually that labels are static and aligned top-left. *(E2E tests added and passing)*
- [x] **TASK-TEST-002**: Verify input fields have same height/border as other forms. *(E2E tests added and passing)*
- [x] **TASK-TEST-003**: Ensure validation errors still appear correctly below inputs. *(E2E tests added and passing)*

## E2E Test Coverage
New test file: `e2e/tests/quick-add-user-ux.spec.ts` (23 tests)
- Labels static positioning (no floating behavior)
- Uppercase label styling
- Gray label color
- Input border radius (6px)
- Input border color
- Input padding
- Select styling consistency
- Focus state styling
- Error text visibility
- Error text color
- Error class application
- Error clearing on input
- Section header styling
- Form layout gaps
- Slideout panel open/close
