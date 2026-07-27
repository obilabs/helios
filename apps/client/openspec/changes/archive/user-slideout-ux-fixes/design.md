# User Slideout UX Fixes - Technical Design

## Target Files

| File | Changes |
|------|---------|
| `frontend/src/components/UserSlideOut.tsx` | Main component changes |
| `frontend/src/components/UserSlideOut.css` | Modal button fixes, toast styling |
| `frontend/src/components/ui/Toast.tsx` | Create if not exists |
| `backend/src/routes/organization.routes.ts` | Password reset endpoint |

---

## 1. Reset Password Implementation

### Current State (Line 934)
```tsx
<button className="btn-secondary">Send Password Reset Email</button>
// NO onClick handler
```

### Target State
```tsx
<button 
  className="btn-secondary" 
  onClick={handleResetPassword}
  disabled={resetLoading}
>
  {resetLoading ? 'Sending...' : 'Send Password Reset Email'}
</button>
```

### New Handler
```tsx
const handleResetPassword = async () => {
  setResetLoading(true);
  try {
    const response = await fetch(`/api/v1/organization/users/${user.id}/reset-password`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) {
      showToast('Password reset email sent', 'success');
    } else {
      const data = await response.json();
      showToast(data.error || 'Failed to send reset email', 'error');
    }
  } catch (error) {
    showToast('Network error', 'error');
  }
  setResetLoading(false);
};
```

---

## 2. Deleted User Status Handling

### Current State (Lines 903-911)
```tsx
<select value={user.status || 'active'} onChange={...}>
  <option value="active">Active</option>
  <option value="pending">Pending</option>
  <option value="suspended">Suspended</option>
  // NO "deleted" option!
</select>
```

### Target State
```tsx
{user.status === 'deleted' ? (
  <div className="deleted-status-container">
    <span className="status-badge status-badge-deleted">🔒 Deleted</span>
    <button className="btn-primary" onClick={handleRestoreUser}>
      Restore User
    </button>
  </div>
) : (
  <select value={user.status || 'active'} onChange={...}>
    <option value="active">Active</option>
    <option value="pending">Pending</option>
    <option value="suspended">Suspended</option>
  </select>
)}
```

---

## 3. Rename "Account Sync" → "Connections"

### Current State (Line 393)
```tsx
{ id: 'platforms', label: 'Account Sync', icon: <RefreshCw size={16} /> }
```

### Target State
```tsx
{ id: 'platforms', label: 'Connections', icon: <Link2 size={16} /> }
```

### Enhanced Content Layout
```tsx
<div className="connections-grid">
  {/* Google Card */}
  <div className="connection-card">
    <div className="connection-header">
      <img src="/google-icon.svg" alt="Google" />
      <span>Google Workspace</span>
    </div>
    <div className="connection-status">
      {user.googleWorkspaceId ? (
        <>
          <span className="status-connected">Connected</span>
          <span className="last-sync">Last sync: {lastSyncTime}</span>
        </>
      ) : (
        <span className="status-not-connected">Not Connected</span>
      )}
    </div>
  </div>
  
  {/* Microsoft Card */}
  <div className="connection-card">
    {/* Similar structure */}
  </div>
</div>
```

---

## 4. Fix Add to Group Modal CSS

### Issue
The "Add to Groups" button in the modal overlaps with "Cancel" button.

### Fix in UserSlideOut.css
```css
.groups-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px; /* Add spacing between buttons */
  padding: 16px;
  border-top: 1px solid #e5e7eb;
}

.groups-modal-footer button {
  min-width: 100px; /* Ensure buttons have minimum width */
}
```

---

## 5. Replace alert() with Toast

### Create Toast Component
Create `frontend/src/components/ui/Toast.tsx` if not exists.

### Replace all instances
| Line | Current | Replacement |
|------|---------|-------------|
| 224 | `alert('User status updated...')` | `showToast('Status updated', 'success')` |
| 226 | `alert(\`Error: ${data.error}...\`)` | `showToast(data.error, 'error')` |
| Similar for all other `alert()` calls |

---

## API Changes Required

### New Endpoint: POST /api/v1/organization/users/:id/reset-password

```typescript
router.post('/:id/reset-password', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  // 1. Get user email
  // 2. Generate reset token
  // 3. Send email via configured provider
  // 4. Log action
  successResponse(res, { message: 'Password reset email sent' });
});
```

---

## 6. Quick Add Slideout Redesign

### Width Alignment
```css
/* QuickAddUserSlideOut.css - Line 22 */
.quick-add-panel {
  width: 600px; /* Changed from 480px to match UserSlideOut */
  /* ... */
}
```

### Job Title Dropdown with "Add New"

**New Component Pattern:**
```tsx
// Searchable select with create option
<CreatableSelect
  options={jobTitles.map(t => ({ value: t.id, label: t.name }))}
  value={formData.jobTitle}
  onChange={(option) => handleInputChange('jobTitle', option?.value)}
  onCreateOption={(inputValue) => handleCreateJobTitle(inputValue)}
  placeholder="Select or create job title..."
  isClearable
/>
```

**API Integration:**
- GET `/api/v1/organization/job-titles` - Fetch existing titles
- POST `/api/v1/organization/job-titles` - Create new title

### Department Dropdown

```tsx
<select
  value={formData.department}
  onChange={(e) => handleInputChange('department', e.target.value)}
>
  <option value="">Select department...</option>
  {departments.map(dept => (
    <option key={dept.id} value={dept.id}>{dept.name}</option>
  ))}
</select>
```

**Data Source:** Existing `/api/v1/organization/departments` endpoint

### Manager in Main Form

Move from Advanced Options to main "Profile Information" section:
```tsx
<div className="form-row">
  <div className="form-group">
    <label>Manager</label>
    <select value={formData.managerId} onChange={...}>
      <option value="">No manager</option>
      {managers.map(m => (
        <option key={m.id} value={m.id}>{m.name}</option>
      ))}
    </select>
  </div>
</div>
```

### Remove Excessive Lines

**CSS Changes:**
```css
/* Remove section bottom borders */
.form-section h3 {
  border-bottom: none; /* Remove the line under section headers */
  padding-bottom: 0.5rem;
  margin-bottom: 1rem;
}

/* Cleaner form groups */
.form-section {
  margin-bottom: 1.5rem;
  padding-bottom: 0; /* No extra padding creating visual lines */
  border-bottom: none; /* Remove section dividers */
}

/* Only use divider before major sections like Provider Selection */
.provider-section {
  border-top: 1px solid #e5e7eb;
  padding-top: 1.5rem;
  margin-top: 1.5rem;
}
```

### Field Alignment

Use consistent `info-grid` pattern from UserSlideOut:
```tsx
<div className="info-grid">
  <div className="info-item">
    <label>Job Title</label>
    <CreatableSelect ... />
  </div>
  <div className="info-item">
    <label>Department</label>
    <select ... />
  </div>
</div>
```
