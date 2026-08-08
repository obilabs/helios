# Command Aliases - "helios" Prefix Made Optional
**Date:** 2025-11-07
**Impact:** High - Significantly shorter command syntax

## Problem

Every command in the Helios Developer Console had to start with "helios":
```bash
helios gw users list
helios users list
helios api GET /path
```

This was redundant since it's already the *Helios* console!

## Solution

Made "helios" prefix **optional** while maintaining backward compatibility.

### How It Works

The console auto-detects if your command starts with a known module and automatically prepends "helios" if needed.

**Known modules:** `api`, `gw`, `google-workspace`, `users`, `groups`, `ms`, `microsoft`

```typescript
// Auto-prepend "helios" if command starts with a known module
const knownModules = ['api', 'gw', 'google-workspace', 'users', 'groups', 'ms', 'microsoft'];
const firstWord = trimmedCommand.split(' ')[0];

let commandToExecute = trimmedCommand;
if (!trimmedCommand.startsWith('helios ') && knownModules.includes(firstWord)) {
  commandToExecute = `helios ${trimmedCommand}`;
}
```

## Before vs After

### Old Syntax (Still Works!)
```bash
helios gw users list
helios gw users get mike@company.com
helios users list
helios api GET /api/google/admin/directory/v1/users
```

### New Shorter Syntax ✨
```bash
gw users list
gw users get mike@company.com
users list
api GET /api/google/admin/directory/v1/users
```

## Documentation Updates

### Help Modal
- Added note explaining "helios" is optional
- Updated ALL command examples to use shorter syntax
- Changed "Users" to "Google Workspace Users" for clarity

### Examples Modal
- Updated all 15+ examples to use shorter syntax
- Commands are more concise and readable

## Examples

```bash
# Google Workspace Users
gw users list
gw users get john@company.com
gw users create john@company.com --firstName=John --lastName=Doe --password=Pass123!
gw users suspend john@company.com
gw users delete john@company.com

# Google Workspace Groups
gw groups list
gw groups create sales@company.com --name="Sales Team"
gw groups add-member sales@company.com john@company.com

# Helios Platform Users
users list
users debug

# Direct API Access
api GET /api/google/admin/directory/v1/users
api POST /api/google/admin/directory/v1/groups {...}
```

## Backward Compatibility

✅ **100% backward compatible**
- Old syntax with "helios" still works
- Scripts and documentation won't break
- Users can choose their preference

## Files Modified

1. **`frontend/src/pages/DeveloperConsole.tsx`**
   - Lines 132-145: Auto-prepend logic
   - Lines 963-965: Help modal note
   - Lines 988+: All help commands updated (batch sed)
   - Lines 1213+: All examples updated (batch sed)

## Benefits

1. **Faster Typing:** 7 characters saved per command
2. **Less Cognitive Load:** Obvious it's Helios - no need to repeat it
3. **Cleaner Docs:** Help and examples are more readable
4. **Industry Standard:** Matches other CLIs (kubectl, aws, gcloud don't require binary name in every command when in their shell)

## Testing

Test both syntaxes work:

```bash
# New syntax
gw users list
gw groups list
users list

# Old syntax (backward compatible)
helios gw users list
helios gw groups list
helios users list
```

Both should produce identical results!

---

**Status:** ✅ Complete
**Backward Compatible:** ✅ Yes
**Breaking Changes:** ❌ None
