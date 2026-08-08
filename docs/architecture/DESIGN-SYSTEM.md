# 🎨 Helios Client Portal - Design System

**Version:** 1.0.0
**Last Updated:** 2025-10-12
**Status:** Active - Apply to all new and existing components

## 🎯 Design Philosophy

### Core Principles
1. **Clean & Professional** - Business application, not developer tool
2. **Subtle & Refined** - No loud colors, emojis, or overwhelming elements
3. **Consistent & Predictable** - Same patterns throughout
4. **Accessible & Readable** - WCAG 2.1 AA compliance
5. **Modern & Minimal** - JumpCloud-inspired aesthetic

### Visual Tone
- Monochrome icons (stroke-based, 16px)
- Subtle color accents (purple #8b5cf6 for primary actions)
- Gray-based neutrals for structure
- Green for success, amber for warnings, red for errors
- Professional spacing and typography

---

## 🎨 Color Palette

### Primary Colors
```css
/* Primary - Purple (for interactive elements, active states) */
--primary-50: #faf5ff;
--primary-100: #f3e8ff;
--primary-200: #e9d5ff;
--primary-300: #d8b4fe;
--primary-400: #c084fc;
--primary-500: #a855f7;
--primary-600: #8b5cf6;  /* Main brand color */
--primary-700: #7c3aed;
--primary-800: #6d28d9;
--primary-900: #5b21b6;
```

### Neutral Grays
```css
/* Text & Borders */
--gray-50: #fafbfc;   /* Subtle backgrounds */
--gray-100: #f9fafb;  /* Hover states */
--gray-200: #f3f4f6;  /* Card backgrounds */
--gray-300: #e5e7eb;  /* Light borders */
--gray-400: #d1d5db;  /* Standard borders */
--gray-500: #9ca3af;  /* Disabled text, icons */
--gray-600: #6b7280;  /* Secondary text */
--gray-700: #374151;  /* Primary text */
--gray-800: #1f2937;  /* Headings */
--gray-900: #1a1a1a;  /* Darkest text */
```

### Semantic Colors
```css
/* Success - Green */
--success-50: #f0fdf4;
--success-500: #22c55e;
--success-600: #10b981;

/* Warning - Amber */
--warning-50: #fef3c7;
--warning-500: #f59e0b;
--warning-600: #d97706;

/* Error - Red */
--error-50: #fee2e2;
--error-500: #ef4444;
--error-600: #dc2626;

/* Info - Blue */
--info-50: #eff6ff;
--info-500: #3b82f6;
--info-600: #2563eb;
```

---

## 📐 Typography

### Font Family
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
```

### Font Sizes
```css
--text-xs: 11px;     /* Table headers, tiny labels */
--text-sm: 12px;     /* Status indicators, small labels */
--text-md: 13px;     /* Buttons, table content, body */
--text-base: 14px;   /* Default body text */
--text-lg: 15px;     /* Emphasis text */
--text-xl: 18px;     /* Section headings */
--text-2xl: 22px;    /* Page titles */
--text-3xl: 28px;    /* Hero headings */
```

### Font Weights
```css
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
```

### Letter Spacing
```css
--tracking-tight: -0.01em;  /* Large headings */
--tracking-normal: 0em;     /* Body text */
--tracking-wide: 0.05em;    /* Uppercase labels */
```

### Line Heights
```css
--leading-tight: 1.2;   /* Headings */
--leading-normal: 1.5;  /* Body text */
--leading-relaxed: 1.6; /* Long-form content */
```

---

## 📏 Spacing Scale

```css
--space-xs: 4px;
--space-sm: 8px;
--space-md: 12px;
--space-lg: 16px;
--space-xl: 24px;
--space-2xl: 32px;
--space-3xl: 48px;
```

### Component Spacing Guidelines
- **Sidebar nav items**: 8px vertical padding (--space-sm)
- **Table rows**: 48px fixed height
- **Buttons**: 7-8px vertical, 12-16px horizontal
- **Cards**: 16-24px padding
- **Section gaps**: 24-32px

---

## 🎯 Icons

### Icon Library
**Lucide React** - Clean, consistent, stroke-based icons

### Icon Sizes
```css
--icon-xs: 12px;   /* Inline with small text */
--icon-sm: 14px;   /* Inline with body text */
--icon-md: 16px;   /* Navigation, buttons */
--icon-lg: 20px;   /* Headers, emphasis */
--icon-xl: 24px;   /* Large actions */
```

### Icon Usage Rules
- ✅ **USE**: Monochrome stroke-based icons (Lucide)
- ❌ **AVOID**: Emojis, colored icons, solid fills
- ✅ **STANDARD SIZE**: 16px for navigation and UI
- ✅ **COLOR**: Inherit text color with `color: currentColor`

---

## 🔲 Buttons

### Primary Button
```css
.btn-primary {
  padding: 7px 14px;
  background: linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%);
  color: white;
  border: none;
  border-radius: 5px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-primary:hover {
  background: linear-gradient(135deg, #7c3aed 0%, #9333ea 100%);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
```

### Secondary Button
```css
.btn-secondary {
  padding: 7px 12px;
  border: 1px solid #d1d5db;  /* Darker border */
  background: white;
  color: #374151;
  font-size: 13px;
  font-weight: 500;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-secondary:hover {
  border-color: #9ca3af;
  background: #f9fafb;
}
```

### Success Button (Add User, etc.)
```css
.btn-success {
  padding: 7px 14px;
  background: #10b981;
  color: white;
  border: none;
  border-radius: 5px;
  font-size: 13px;
  font-weight: 500;
}

.btn-success:hover {
  background: #059669;
}
```

### Icon Button
```css
.btn-icon {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid #d1d5db;
  background: white;
  color: #6b7280;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-icon:hover {
  border-color: #9ca3af;
  background: #f9fafb;
}
```

---

## 📋 Tables

### Table Structure
```css
/* Header */
.table-header {
  padding: 8px 16px;
  background: #fafbfc;
  border-bottom: 1px solid #e5e7eb;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  height: 36px;
}

/* Rows */
.table-row {
  padding: 0 16px;
  border-bottom: 1px solid #f5f5f5;
  height: 48px;
  min-height: 48px;
  max-height: 48px;
  align-items: center;
}

.table-row:hover {
  background: #f9fafb;
}

.table-row.selected {
  background: #f5f3ff;
}
```

### Table Cell Content
```css
/* All cells must prevent wrapping */
white-space: nowrap;
overflow: hidden;
text-overflow: ellipsis;
```

---

## 🏷️ Badges & Status Indicators

### Role Badges
```css
.badge {
  display: inline-flex;
  padding: 2px 7px;
  border-radius: 9px;
  font-size: 11px;
  font-weight: 500;
}

.badge-admin {
  background: #e3f2fd;
  color: #1976d2;
}

.badge-user {
  background: #f1f3f4;
  color: #5f6368;
}
```

### Status Dots
```css
.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.status-dot.active {
  background: #10b981;
}
```

### Platform Icons
```css
.platform-icon {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  font-size: 10px;
  font-weight: 600;
  border: 2px solid white;
}
```

---

## 🗂️ Navigation

### Sidebar
```css
.sidebar {
  width: 240px;
  background: white;
  border-right: 1px solid #e5e7eb;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 24px;  /* Reduced from 12px */
  border-left: 3px solid transparent;
  font-size: 15px;
  font-weight: 500;
  color: #6b7280;
}

.nav-item:hover {
  background: #fafbfc;
  color: #374151;
}

.nav-item.active {
  background: #f9fafb;  /* Subtle, not heavy purple */
  color: #8b5cf6;
  border-left-color: #8b5cf6;
}

.nav-icon {
  width: 16px;
  height: 16px;
  color: currentColor;
}
```

### Tabs
```css
/* Type tabs (Staff/Guests/Contacts) */
.type-tab {
  padding: 12px 16px;
  border-bottom: 2px solid transparent;
  font-size: 14px;
  font-weight: 500;
  color: #6b7280;
}

.type-tab.active {
  color: #8b5cf6;
  border-bottom-color: #8b5cf6;
}

/* Status filter pills */
.status-tab {
  padding: 6px 14px;
  border: 1px solid #e5e7eb;
  background: white;
  color: #6b7280;
  font-size: 13px;
  border-radius: 4px;
}

.status-tab.active {
  background: #8b5cf6;
  color: white;
  border-color: #8b5cf6;
}
```

---

## 📦 Cards

```css
.card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 24px;
}

.card:hover {
  border-color: #d1d5db;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}
```

---

## 🎭 Form Elements

### Inputs
```css
.form-input {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  color: #374151;
}

.form-input:focus {
  outline: none;
  border-color: #8b5cf6;
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.08);
}
```

### Search Boxes
```css
.search-input {
  padding: 8px 12px 8px 40px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fafbfc;
  font-size: 14px;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #9ca3af;
  width: 18px;
  height: 18px;
}
```

---

## ⚠️ Critical Rules

### ❌ NEVER Use
- Emojis for UI elements
- Bright, loud colors for backgrounds
- Heavy drop shadows
- Technical jargon in user-facing text
- Inconsistent spacing

### ✅ ALWAYS Use
- Lucide icons (16px, monochrome)
- Subtle hover states
- Consistent spacing scale
- Professional color palette
- Clear visual hierarchy

---

## 📱 Responsive Breakpoints

```css
/* Mobile */
@media (max-width: 768px)

/* Tablet */
@media (max-width: 1024px)

/* Desktop */
@media (min-width: 1025px)
```

---

## 🚀 Implementation Checklist

When creating or updating components:

- [ ] Use Lucide icons (not emojis)
- [ ] Apply spacing scale consistently
- [ ] Use defined color palette
- [ ] Ensure 48px table row height
- [ ] Add proper hover states
- [ ] Use typography scale
- [ ] Test responsive design
- [ ] Verify accessibility (WCAG 2.1 AA)

---

**Remember:** This is a professional business application. Keep it clean, subtle, and consistent.
