# Helios UI Component Library

Professional, reusable React components following the Helios design system.

## Overview

This library provides production-ready UI components that follow the design principles outlined in `DESIGN-SYSTEM.md`:

- **Lucide React icons** (16px, monochrome, stroke-based)
- **Purple primary color** (#8b5cf6) for interactive elements
- **Subtle neutral grays** for structure
- **NO emojis** in production UI
- **Consistent spacing** (4px-48px scale)
- **Professional typography** (11px-28px scale)

## Components

### 1. Modal

Reusable modal dialog with backdrop overlay and size variants.

**Props:**

```typescript
interface ModalProps {
  isOpen: boolean;           // Controls modal visibility
  onClose: () => void;       // Called when modal should close
  title?: string;            // Optional modal title
  size?: 'small' | 'medium' | 'large';  // Modal size
  closeOnBackdrop?: boolean; // Close on backdrop click (default: true)
  children: React.ReactNode; // Modal content
}
```

**Usage:**

```tsx
import { Modal } from '@/components/ui';

function MyComponent() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      title="Edit User"
      size="medium"
      closeOnBackdrop={true}
    >
      <p>Modal content goes here</p>
      <button onClick={() => setIsOpen(false)}>Close</button>
    </Modal>
  );
}
```

**Features:**

- ✅ Backdrop overlay with click-to-close
- ✅ ESC key to close
- ✅ Smooth animations (fade in, slide up)
- ✅ Body scroll lock when open
- ✅ Three size variants
- ✅ Accessible (ARIA attributes)
- ✅ Keyboard navigation

---

### 2. ConfirmDialog

Confirmation dialog with variant support for different action types.

**Props:**

```typescript
interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;      // Default: "Confirm"
  cancelText?: string;       // Default: "Cancel"
  variant?: 'danger' | 'warning' | 'info' | 'success';
  icon?: React.ReactNode;    // Custom icon (optional)
  onConfirm: () => void;
  onCancel: () => void;
}
```

**Usage:**

```tsx
import { ConfirmDialog } from '@/components/ui';

function DeleteUser() {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDelete = () => {
    // Perform delete action
    setShowConfirm(false);
  };

  return (
    <>
      <button onClick={() => setShowConfirm(true)}>
        Delete User
      </button>

      <ConfirmDialog
        isOpen={showConfirm}
        title="Delete User"
        message="Are you sure you want to delete this user? This action cannot be undone."
        variant="danger"
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleDelete}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}
```

**Variants:**

- **`danger`** - Red accent (delete, remove actions)
- **`warning`** - Amber accent (caution, warnings)
- **`info`** - Blue accent (information, general confirmations)
- **`success`** - Green accent (positive actions)

**Features:**

- ✅ Semantic color coding
- ✅ Default icons per variant
- ✅ Custom icon support
- ✅ Non-closable backdrop (prevents accidental dismissal)
- ✅ Keyboard accessible

---

### 3. UserSelector

Searchable dropdown for selecting users with single/multiple selection support.

**Props:**

```typescript
interface UserSelectorProps {
  label?: string;                    // Optional label
  value: string | string[];          // Selected user ID(s)
  onChange: (value: string | string[]) => void;
  organizationId: string;            // Fetch users for this org
  multiple?: boolean;                // Allow multiple selection
  exclude?: string[];                // User IDs to exclude
  placeholder?: string;              // Search placeholder
}

interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  name?: string;
}
```

**Usage (Single Selection):**

```tsx
import { UserSelector } from '@/components/ui';

function AssignTask() {
  const [assignedUserId, setAssignedUserId] = useState('');

  return (
    <UserSelector
      label="Assign to User"
      value={assignedUserId}
      onChange={(id) => setAssignedUserId(id as string)}
      organizationId={orgId}
      placeholder="Search users..."
    />
  );
}
```

**Usage (Multiple Selection):**

```tsx
import { UserSelector } from '@/components/ui';

function AddGroupMembers() {
  const [memberIds, setMemberIds] = useState<string[]>([]);

  return (
    <UserSelector
      label="Add Members"
      value={memberIds}
      onChange={(ids) => setMemberIds(ids as string[])}
      organizationId={orgId}
      multiple={true}
      exclude={[currentUserId]}  // Don't show current user
      placeholder="Search to add members..."
    />
  );
}
```

**Features:**

- ✅ Real-time search/filter
- ✅ User avatars with initials
- ✅ Display name + email
- ✅ Single or multiple selection
- ✅ Selected user chips (multiple mode)
- ✅ Exclude specific users
- ✅ Click outside to close
- ✅ Loading states
- ✅ Empty state handling
- ✅ Fetches from `/api/users` endpoint

---

### 4. SelectableBlock

Expandable selection block with visual selection state (purple border when selected).

**Props:**

```typescript
interface SelectableBlockProps {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: {
    text: string;
    variant: 'info' | 'success' | 'warning' | 'danger';
  };
  children?: React.ReactNode;  // Shown when selected
}
```

**Usage:**

```tsx
import { SelectableBlock, UserSelector } from '@/components/ui';
import { Trash2, ArrowRightLeft } from 'lucide-react';

function DeleteUserOptions() {
  const [deleteOption, setDeleteOption] = useState<'permanent' | 'transfer'>('permanent');
  const [transferUserId, setTransferUserId] = useState('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <SelectableBlock
        selected={deleteOption === 'permanent'}
        onClick={() => setDeleteOption('permanent')}
        icon={<Trash2 size={20} />}
        title="Permanent Delete"
        description="Immediately remove all user data"
        badge={{ text: 'Irreversible', variant: 'danger' }}
      />

      <SelectableBlock
        selected={deleteOption === 'transfer'}
        onClick={() => setDeleteOption('transfer')}
        icon={<ArrowRightLeft size={20} />}
        title="Transfer & Delete"
        description="Transfer user data to another user before deletion"
        badge={{ text: 'Recommended', variant: 'success' }}
      >
        {/* This content only shows when selected */}
        <UserSelector
          label="Transfer to user"
          value={transferUserId}
          onChange={(id) => setTransferUserId(id as string)}
          organizationId={orgId}
          exclude={[userToDeleteId]}
        />
      </SelectableBlock>
    </div>
  );
}
```

**Features:**

- ✅ Visual selection state (purple border)
- ✅ Smooth expand/collapse animation
- ✅ Icon support (Lucide icons)
- ✅ Optional badge with variants
- ✅ Expandable content area
- ✅ Keyboard accessible
- ✅ Click propagation control (content doesn't trigger selection)

---

## Design System Compliance

All components follow these principles:

### Icons

- **Library:** Lucide React
- **Size:** 16px (default), 20px (emphasis)
- **Style:** Monochrome, stroke-based
- **Color:** Inherit from parent (`currentColor`)

### Colors

```css
/* Primary */
--primary-600: #8b5cf6  /* Main brand color */

/* Grays */
--gray-600: #6b7280     /* Secondary text */
--gray-700: #374151     /* Primary text */
--gray-800: #1f2937     /* Headings */

/* Semantic */
--success-600: #10b981  /* Success actions */
--warning-600: #d97706  /* Warnings */
--error-600: #dc2626    /* Errors, deletions */
--info-600: #2563eb     /* Information */
```

### Spacing Scale

```css
--space-xs: 4px
--space-sm: 8px
--space-md: 12px
--space-lg: 16px
--space-xl: 24px
--space-2xl: 32px
--space-3xl: 48px
```

### Typography

```css
--text-xs: 11px    /* Small labels */
--text-sm: 12px    /* Secondary text */
--text-md: 13px    /* Buttons */
--text-base: 14px  /* Body text */
--text-lg: 15px    /* Emphasis */
--text-xl: 18px    /* Headings */
--text-2xl: 22px   /* Page titles */
```

---

## Usage Examples

### Complete Delete User Modal

```tsx
import { useState } from 'react';
import { Modal, ConfirmDialog, SelectableBlock, UserSelector } from '@/components/ui';
import { Trash2, ArrowRightLeft } from 'lucide-react';

function DeleteUserModal({ userId, isOpen, onClose }) {
  const [step, setStep] = useState<'options' | 'confirm'>('options');
  const [deleteOption, setDeleteOption] = useState<'permanent' | 'transfer'>('permanent');
  const [transferUserId, setTransferUserId] = useState('');

  const handleNext = () => {
    if (deleteOption === 'transfer' && !transferUserId) {
      alert('Please select a user to transfer data to');
      return;
    }
    setStep('confirm');
  };

  const handleConfirm = async () => {
    // API call to delete user
    await deleteUser(userId, {
      transferTo: deleteOption === 'transfer' ? transferUserId : null
    });
    onClose();
  };

  return (
    <>
      <Modal
        isOpen={isOpen && step === 'options'}
        onClose={onClose}
        title="Delete User Options"
        size="medium"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <SelectableBlock
            selected={deleteOption === 'permanent'}
            onClick={() => setDeleteOption('permanent')}
            icon={<Trash2 size={20} />}
            title="Permanent Delete"
            description="Immediately remove all user data"
            badge={{ text: 'Irreversible', variant: 'danger' }}
          />

          <SelectableBlock
            selected={deleteOption === 'transfer'}
            onClick={() => setDeleteOption('transfer')}
            icon={<ArrowRightLeft size={20} />}
            title="Transfer & Delete"
            description="Transfer user data before deletion"
            badge={{ text: 'Recommended', variant: 'success' }}
          >
            <UserSelector
              label="Transfer to user"
              value={transferUserId}
              onChange={(id) => setTransferUserId(id as string)}
              organizationId={orgId}
              exclude={[userId]}
            />
          </SelectableBlock>

          <button onClick={handleNext}>
            Next
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={step === 'confirm'}
        title="Confirm Deletion"
        message={`Are you sure you want to delete this user? ${
          deleteOption === 'transfer'
            ? 'Data will be transferred to the selected user.'
            : 'This action cannot be undone.'
        }`}
        variant="danger"
        confirmText="Delete User"
        cancelText="Go Back"
        onConfirm={handleConfirm}
        onCancel={() => setStep('options')}
      />
    </>
  );
}
```

---

## Accessibility

All components are built with accessibility in mind:

- ✅ Proper ARIA attributes
- ✅ Keyboard navigation
- ✅ Focus management
- ✅ Screen reader support
- ✅ Semantic HTML
- ✅ Color contrast (WCAG 2.1 AA)

---

## Installation

These components are part of the Helios Client Portal. To use them:

```tsx
import { Modal, ConfirmDialog, UserSelector, SelectableBlock } from '@/components/ui';
```

---

## Styling

All styles are contained in `ui.css` using CSS variables from the design system. No external dependencies required beyond:

- `react`
- `lucide-react` (for icons)

---

## Contributing

When creating new UI components:

1. ✅ Follow DESIGN-SYSTEM.md
2. ✅ Use Lucide icons (NO emojis)
3. ✅ Apply spacing scale consistently
4. ✅ Use color palette variables
5. ✅ Ensure keyboard accessibility
6. ✅ Add TypeScript types
7. ✅ Document with examples

---

## License

Part of Helios Client Portal - Internal use only.
