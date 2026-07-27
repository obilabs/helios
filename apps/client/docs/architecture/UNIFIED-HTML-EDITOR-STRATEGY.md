# Unified HTML Editor Strategy

**Date:** November 2, 2025
**Your Insight:** "Build one fully-featured editor, use it everywhere"

---

## 🎯 The Problem We're Solving

### Current Approach (Wrong):
```
Out of Office   → Build custom editor
Email Signature → Build another editor
Email Templates → Build another editor
Auto-Reply      → Build another editor
...
```

**Result:** 5+ separate implementations, inconsistent UX

### Your Approach (Correct):
```
Build ONE great editor component
Use it for:
- Out of Office ✅
- Email Signatures ✅
- Email Templates ✅
- Auto-Reply ✅
- Group Welcome Messages ✅
- Vacation Responder ✅
- Any HTML content ✅
```

**Result:** One implementation, consistent UX, reusable everywhere

---

## 🏗️ Rich Text Editor Options

### **Option 1: Tiptap** ⭐ RECOMMENDED

**Pros:**
- ✅ Modern, React-friendly
- ✅ Headless (full UI control)
- ✅ Extensible (add custom features)
- ✅ Good documentation
- ✅ Active maintenance
- ✅ Can output HTML body content only (no `<html>`, `<body>` tags)

**Cons:**
- ⚠️ Learning curve
- ⚠️ More setup than Quill

**Example:**
```typescript
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

const editor = useEditor({
  extensions: [StarterKit],
  content: '<p>Hello World</p>',
})

<EditorContent editor={editor} />
```

---

### **Option 2: React-Quill**

**Pros:**
- ✅ Easy to set up
- ✅ Good for basic formatting
- ✅ Lightweight

**Cons:**
- ❌ Less customizable
- ❌ Older architecture
- ❌ Limited extensibility

---

### **Option 3: TinyMCE / CKEditor**

**Pros:**
- ✅ Feature-rich out of the box
- ✅ Familiar (WordPress-style)

**Cons:**
- ❌ Heavy (large bundle size)
- ❌ Commercial licensing for some features
- ❌ Harder to customize

---

## ✅ Recommendation: Tiptap

**Why:**
- Modern React architecture
- Can output clean HTML (no wrapper tags)
- Extensible for your use cases
- Best long-term choice

---

## 🎨 Unified Editor Component Design

### **Component: `<RichHtmlEditor />`**

**Features:**
```typescript
interface RichHtmlEditorProps {
  value: string;                    // Initial HTML content
  onChange: (html: string) => void; // Callback with HTML

  // Google-specific settings
  outputFormat?: 'body-only' | 'full-html';  // Google needs body-only!
  maxLength?: number;                        // Character limit

  // Variable support
  allowVariables?: boolean;          // Enable {{firstName}}, {{email}}, etc.
  variables?: Record<string, string>; // Available variables

  // Features
  enableImages?: boolean;
  enableLinks?: boolean;
  enableTables?: boolean;

  // Preview
  showPreview?: boolean;
  previewData?: Record<string, string>; // Data for variable substitution
}
```

**Usage everywhere:**

```typescript
// Out of Office
<RichHtmlEditor
  value={outOfOfficeMessage}
  onChange={setOutOfOfficeMessage}
  outputFormat="body-only"  // Google requirement!
  allowVariables={true}
  variables={{ senderName: '...', senderEmail: '...' }}
  maxLength={10000}
/>

// Email Signature
<RichHtmlEditor
  value={signatureHtml}
  onChange={setSignatureHtml}
  outputFormat="body-only"  // Google requirement!
  allowVariables={true}
  variables={{ firstName: '...', jobTitle: '...', phone: '...' }}
  enableImages={true}
  showPreview={true}
/>

// Email Template (Template Studio)
<RichHtmlEditor
  value={templateHtml}
  onChange={setTemplateHtml}
  outputFormat="body-only"
  allowVariables={true}
  variables={{ ...allUserFields }}
  enableImages={true}
  enableTables={true}
/>
```

---

## 🔧 Google HTML Body Requirement

### **Your Observation:** Google only accepts inner body HTML

**Correct!** Google APIs expect:

```html
<!-- ❌ WRONG -->
<html>
<head><style>...</style></head>
<body>
  <p>Out of office message</p>
</body>
</html>

<!-- ✅ CORRECT -->
<p>Out of office message</p>
<div style="color: blue;">I'll be back on Monday</div>
```

**Implementation:**

```typescript
// In RichHtmlEditor component
const getHtmlOutput = () => {
  const fullHtml = editor.getHTML();

  if (outputFormat === 'body-only') {
    // Strip <html>, <head>, <body> tags
    // Keep only inner content
    const div = document.createElement('div');
    div.innerHTML = fullHtml;
    return div.innerHTML; // Clean body content only
  }

  return fullHtml;
};
```

---

## 📋 Implementation Plan

### Phase 1: Build Unified Editor Component (1 week)

**Day 1-2: Setup Tiptap**
- Install dependencies
- Create base `RichHtmlEditor.tsx` component
- Basic toolbar (bold, italic, lists, links)
- Output body-only HTML

**Day 3-4: Variable System**
- Add variable picker UI
- Support {{firstName}}, {{email}}, etc.
- Live preview with variable substitution
- Validate variables on save

**Day 5: Polish**
- Image upload support
- Table support
- Responsive design
- Accessibility

---

### Phase 2: Integrate Everywhere (3-4 days)

**Signatures (Day 1):**
- Replace textarea in TemplateStudio
- Use RichHtmlEditor for signature templates
- Test with Google Workspace signature sync

**Out of Office (Day 2):**
- New component: OutOfOfficeEditor
- Uses RichHtmlEditor
- Integrates with Gmail vacation API:
  ```bash
  PUT /api/google/gmail/v1/users/{email}/settings/vacation
  { "responseBodyHtml": "<p>...</p>" }  ← body-only HTML!
  ```

**Email Delegation (Day 3):**
- Delegation manager (simpler - no editor needed)
- Uses Gmail delegates API:
  ```bash
  POST /api/google/gmail/v1/users/{email}/settings/delegates
  ```

**Auto-Reply Templates (Day 4):**
- Reuse RichHtmlEditor
- Save templates to database
- Apply to users

---

## 🚀 Benefits of Unified Approach

### **Development:**
- ✅ Build once, use everywhere
- ✅ Consistent behavior
- ✅ Easier to maintain
- ✅ Easier to test

### **User Experience:**
- ✅ Consistent UI across features
- ✅ Same variable system everywhere
- ✅ Learn once, use everywhere
- ✅ Professional appearance

### **Technical:**
- ✅ One component to fix bugs in
- ✅ One component to add features to
- ✅ DRY principle
- ✅ Type safety

---

## 🎯 Immediate Next Steps

### **Option A: Build Editor First** (1 week, then integrate)
1. Install Tiptap
2. Build RichHtmlEditor component
3. Test body-only HTML output
4. Add variable system
5. Then use in Out of Office, Signatures, etc.

### **Option B: Fix Delete Bug First** (2 hours, then build editor)
1. Fix critical delete user bug
2. Then build editor
3. Then integrate everywhere

### **My Recommendation: B**

Fix delete bug first (critical, affects billing), then build editor properly.

**Why:**
- Delete bug is financially dangerous
- Editor will take 1 week to do right
- Better to fix critical issues first

---

## 📝 Google HTML Body Requirements

### **All Google APIs That Need HTML:**

**Gmail API:**
```javascript
// Vacation/Out of Office
PUT /gmail/v1/users/{id}/settings/vacation
{
  "responseBodyHtml": "<p>Body only</p>",  // ← No <html>, <body> tags!
  "responseBodyPlainText": "Body only"
}

// Signature
PATCH /gmail/v1/users/{id}/settings/sendAs/{sendAsEmail}
{
  "signature": "<p>Body only</p>"  // ← No <html>, <body> tags!
}
```

**Groups Settings API:**
```javascript
// Custom footer
PATCH /groups/v1/groups/{groupId}
{
  "customFooterText": "<p>Body only</p>"  // ← No <html>, <body> tags!
}
```

### **HTML Sanitization:**

```typescript
// Utility function
export function sanitizeForGoogle(html: string): string {
  // Remove <html>, <head>, <body> wrapper tags
  // Keep only inner content
  const div = document.createElement('div');
  div.innerHTML = html;

  // Get body content if wrapped
  const body = div.querySelector('body');
  if (body) {
    return body.innerHTML;
  }

  // Already clean
  return div.innerHTML;
}

// Usage
const googleHtml = sanitizeForGoogle(editorHtml);
```

---

## 🎉 Summary

### **Your Insights:**
1. ✅ Build ONE editor, use everywhere - CORRECT
2. ✅ Google wants body-only HTML - CORRECT
3. ✅ Template Studio is the foundation - CORRECT

### **Recommended Path:**
1. Fix delete user bug (2 hours) - Critical
2. Build RichHtmlEditor with Tiptap (1 week) - Foundation
3. Integrate into:
   - Out of Office (uses Gmail vacation API via proxy)
   - Email Signatures (uses Gmail sendAs API via proxy)
   - Templates (replace current textarea)
   - Auto-reply (new feature)

### **Result:**
- Professional HTML editor everywhere
- Google-compatible output (body-only)
- Consistent UX
- Maintainable codebase

---

**Want me to:**
- **A) Start with delete user bug fix** (2 hours, critical)
- **B) Start building RichHtmlEditor** (1 week project)
- **C) Create detailed editor specification first** (planning)

What's your preference?
