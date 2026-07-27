# Command Implementation Guide
## Quick Reference for Helios Developers

**Purpose:** Map GAM/PowerShell commands to Helios API endpoints and UI components
**Related Docs:** ADMIN-TOOLS-RESEARCH-REPORT.md, EXECUTIVE-SUMMARY-ADMIN-TOOLS.md

---

## Implementation Template

For each command, define:
1. **API Endpoint** - REST API route
2. **Service Method** - Backend service function
3. **UI Component** - Frontend interface
4. **Permissions** - Required admin level
5. **Audit Log** - What gets logged
6. **Error Handling** - Common failure scenarios

---

## Tier 1: Critical Commands (Implement First)

### Google Workspace Commands

#### 1. Create User

**GAM Equivalent:**
```bash
gam create user john.smith@example.com firstname John lastname Smith password "TempPass123!"
```

**Helios Implementation:**

**API Endpoint:**
```
POST /api/google-workspace/users
```

**Request Body:**
```json
{
  "email": "john.smith@example.com",
  "firstName": "John",
  "lastName": "Smith",
  "password": "TempPass123!",
  "organizationUnit": "/Engineering",
  "changePasswordAtNextLogin": true,
  "suspended": false
}
```

**Service Method:**
```typescript
// backend/src/services/google-workspace.service.ts
async createUser(organizationId: string, userData: CreateUserDto) {
  // 1. Get Google Workspace credentials
  const credentials = await this.getCredentials(organizationId);

  // 2. Initialize Google Admin SDK
  const admin = google.admin({ version: 'directory_v1', auth });

  // 3. Create user via API
  const result = await admin.users.insert({
    requestBody: {
      primaryEmail: userData.email,
      name: {
        givenName: userData.firstName,
        familyName: userData.lastName
      },
      password: userData.password,
      changePasswordAtNextLogin: userData.changePasswordAtNextLogin,
      orgUnitPath: userData.organizationUnit,
      suspended: userData.suspended
    }
  });

  // 4. Log to audit trail
  await this.auditLog.create({
    organizationId,
    action: 'user.create',
    targetEntity: userData.email,
    changes: userData,
    success: true
  });

  // 5. Sync to local database
  await this.syncUserToLocal(organizationId, result.data);

  return result.data;
}
```

**UI Component:**
```tsx
// frontend/src/pages/AddUser.tsx
<Form onSubmit={handleCreateUser}>
  <Input label="Email" name="email" required />
  <Input label="First Name" name="firstName" required />
  <Input label="Last Name" name="lastName" required />
  <Input label="Temporary Password" name="password" type="password" required />
  <Select label="Organizational Unit" name="organizationUnit">
    <Option value="/">(Root)</Option>
    <Option value="/Engineering">Engineering</Option>
    <Option value="/Sales">Sales</Option>
  </Select>
  <Checkbox label="Force password change at next login" name="changePasswordAtNextLogin" defaultChecked />
  <Button type="submit">Create User</Button>
</Form>
```

**Permissions:** `admin` or `user.create`

**Audit Log Entry:**
```json
{
  "timestamp": "2025-11-07T14:30:00Z",
  "admin": "admin@example.com",
  "action": "user.create",
  "target": "john.smith@example.com",
  "changes": {
    "firstName": "John",
    "lastName": "Smith",
    "organizationUnit": "/Engineering"
  },
  "success": true
}
```

**Error Handling:**
- `409 Conflict` - User already exists
- `400 Bad Request` - Invalid email format
- `403 Forbidden` - Insufficient permissions
- `500 Internal Server Error` - Google API failure

---

#### 2. List Users

**GAM Equivalent:**
```bash
gam print users ou /Engineering suspended off
```

**Helios Implementation:**

**API Endpoint:**
```
GET /api/google-workspace/users?ou=/Engineering&status=active&limit=100&offset=0
```

**Query Parameters:**
- `ou` - Organizational unit path (optional)
- `status` - active | suspended | all (default: all)
- `query` - Search by name or email (optional)
- `limit` - Page size (default: 100)
- `offset` - Pagination offset (default: 0)
- `fields` - Comma-separated field list (optional)

**Response:**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "103456789012345678901",
        "email": "john.smith@example.com",
        "firstName": "John",
        "lastName": "Smith",
        "fullName": "John Smith",
        "organizationUnit": "/Engineering",
        "suspended": false,
        "lastLoginTime": "2025-11-07T09:15:00Z",
        "createdTime": "2025-01-15T10:00:00Z"
      }
    ],
    "total": 47,
    "limit": 100,
    "offset": 0
  }
}
```

**Service Method:**
```typescript
async listUsers(organizationId: string, filters: ListUsersDto) {
  const credentials = await this.getCredentials(organizationId);
  const admin = google.admin({ version: 'directory_v1', auth });

  const queryParams: any = {
    customer: 'my_customer',
    maxResults: filters.limit || 100,
    orderBy: 'email'
  };

  // Apply filters
  if (filters.ou) {
    queryParams.query = `orgUnitPath='${filters.ou}'`;
  }

  if (filters.status === 'active') {
    queryParams.query = (queryParams.query || '') + ' isSuspended=false';
  } else if (filters.status === 'suspended') {
    queryParams.query = (queryParams.query || '') + ' isSuspended=true';
  }

  if (filters.query) {
    queryParams.query = (queryParams.query || '') + ` (name:'${filters.query}*' OR email:'${filters.query}*')`;
  }

  const result = await admin.users.list(queryParams);

  // Transform to consistent format
  const users = result.data.users?.map(u => ({
    id: u.id,
    email: u.primaryEmail,
    firstName: u.name?.givenName,
    lastName: u.name?.familyName,
    fullName: u.name?.fullName,
    organizationUnit: u.orgUnitPath,
    suspended: u.suspended,
    lastLoginTime: u.lastLoginTime,
    createdTime: u.creationTime
  })) || [];

  return {
    users,
    total: result.data.users?.length || 0,
    limit: filters.limit || 100,
    offset: filters.offset || 0
  };
}
```

**UI Component:**
```tsx
// frontend/src/pages/Users.tsx
<DataTable
  columns={[
    { key: 'email', label: 'Email', sortable: true },
    { key: 'fullName', label: 'Name', sortable: true },
    { key: 'organizationUnit', label: 'OU', filterable: true },
    { key: 'suspended', label: 'Status', render: (suspended) => (
      <Badge color={suspended ? 'yellow' : 'green'}>
        {suspended ? 'Suspended' : 'Active'}
      </Badge>
    )},
    { key: 'lastLoginTime', label: 'Last Login', sortable: true, render: formatDate }
  ]}
  data={users}
  loading={loading}
  pagination={{
    total,
    limit,
    offset,
    onPageChange: handlePageChange
  }}
  filters={{
    search: { placeholder: 'Search by name or email', onChange: handleSearch },
    ou: { options: organizationalUnits, onChange: handleOUFilter },
    status: { options: ['all', 'active', 'suspended'], onChange: handleStatusFilter }
  }}
  bulkActions={[
    { label: 'Suspend', onClick: handleBulkSuspend },
    { label: 'Delete', onClick: handleBulkDelete, confirm: true },
    { label: 'Move to OU', onClick: handleBulkMove }
  ]}
  onRowClick={handleUserClick}
  exportButton={{
    formats: ['csv', 'excel', 'json'],
    filename: 'users_export'
  }}
/>
```

**Permissions:** `admin`, `user.read`, or `user.list`

**Audit Log Entry:**
```json
{
  "timestamp": "2025-11-07T14:30:00Z",
  "admin": "admin@example.com",
  "action": "user.list",
  "filters": {
    "ou": "/Engineering",
    "status": "active"
  },
  "resultCount": 47
}
```

---

#### 3. Update User

**GAM Equivalent:**
```bash
gam update user john.smith@example.com firstname Jonathan title "Senior Engineer" ou /Engineering/Backend
```

**Helios Implementation:**

**API Endpoint:**
```
PATCH /api/google-workspace/users/:userId
```

**Request Body:**
```json
{
  "firstName": "Jonathan",
  "title": "Senior Engineer",
  "organizationUnit": "/Engineering/Backend",
  "department": "Engineering",
  "phone": "+1-555-123-4567"
}
```

**Service Method:**
```typescript
async updateUser(organizationId: string, userId: string, updates: UpdateUserDto) {
  const credentials = await this.getCredentials(organizationId);
  const admin = google.admin({ version: 'directory_v1', auth });

  // Build update request
  const requestBody: any = {};

  if (updates.firstName || updates.lastName) {
    requestBody.name = {
      givenName: updates.firstName,
      familyName: updates.lastName
    };
  }

  if (updates.title) requestBody.organizations = [{ title: updates.title, primary: true }];
  if (updates.department) requestBody.organizations = [{ ...(requestBody.organizations?.[0] || {}), department: updates.department }];
  if (updates.phone) requestBody.phones = [{ value: updates.phone, type: 'work' }];
  if (updates.organizationUnit) requestBody.orgUnitPath = updates.organizationUnit;

  // Update user
  const result = await admin.users.patch({
    userKey: userId,
    requestBody
  });

  // Audit log
  await this.auditLog.create({
    organizationId,
    action: 'user.update',
    targetEntity: userId,
    changes: updates,
    success: true
  });

  // Sync to local
  await this.syncUserToLocal(organizationId, result.data);

  return result.data;
}
```

**UI Component:**
```tsx
// frontend/src/components/UserSlideOut.tsx
<SlideOut title={`Edit User: ${user.email}`} onClose={handleClose}>
  <Form initialValues={user} onSubmit={handleUpdate}>
    <Input label="First Name" name="firstName" />
    <Input label="Last Name" name="lastName" />
    <Input label="Job Title" name="title" />
    <Input label="Department" name="department" />
    <Input label="Phone" name="phone" type="tel" />
    <Select label="Organizational Unit" name="organizationUnit">
      {organizationalUnits.map(ou => (
        <Option key={ou.path} value={ou.path}>{ou.name}</Option>
      ))}
    </Select>
    <ButtonGroup>
      <Button variant="secondary" onClick={handleClose}>Cancel</Button>
      <Button type="submit" loading={saving}>Save Changes</Button>
    </ButtonGroup>
  </Form>
</SlideOut>
```

**Permissions:** `admin` or `user.update`

**Audit Log Entry:**
```json
{
  "timestamp": "2025-11-07T14:30:00Z",
  "admin": "admin@example.com",
  "action": "user.update",
  "target": "john.smith@example.com",
  "changes": {
    "firstName": { "old": "John", "new": "Jonathan" },
    "title": { "old": "Engineer", "new": "Senior Engineer" },
    "organizationUnit": { "old": "/Engineering", "new": "/Engineering/Backend" }
  },
  "success": true
}
```

---

### Microsoft 365 Commands

#### 1. Get-MsolUser (List Users)

**PowerShell Equivalent:**
```powershell
Get-MsolUser -All | Select-Object UserPrincipalName, DisplayName, Department, IsLicensed
```

**Helios Implementation:**

**API Endpoint:**
```
GET /api/microsoft-365/users?limit=100&offset=0
```

**Query Parameters:**
- `query` - Search by name or email
- `department` - Filter by department
- `licensed` - true | false | all (default: all)
- `limit` - Page size (default: 100)
- `offset` - Pagination offset

**Service Method:**
```typescript
// backend/src/services/microsoft-365.service.ts
import { Client } from '@microsoft/microsoft-graph-client';

async listUsers(organizationId: string, filters: ListUsersDto) {
  const credentials = await this.getCredentials(organizationId);
  const client = this.initGraphClient(credentials);

  let query = client.api('/users')
    .top(filters.limit || 100)
    .skip(filters.offset || 0)
    .select(['id', 'userPrincipalName', 'displayName', 'department', 'jobTitle', 'assignedLicenses']);

  // Apply filters
  if (filters.query) {
    query = query.filter(`startswith(displayName,'${filters.query}') or startswith(userPrincipalName,'${filters.query}')`);
  }

  if (filters.department) {
    query = query.filter(`department eq '${filters.department}'`);
  }

  const result = await query.get();

  // Transform to consistent format
  const users = result.value.map(u => ({
    id: u.id,
    email: u.userPrincipalName,
    displayName: u.displayName,
    department: u.department,
    title: u.jobTitle,
    licensed: u.assignedLicenses && u.assignedLicenses.length > 0
  }));

  // Filter by license status if requested
  let filteredUsers = users;
  if (filters.licensed === 'true') {
    filteredUsers = users.filter(u => u.licensed);
  } else if (filters.licensed === 'false') {
    filteredUsers = users.filter(u => !u.licensed);
  }

  return {
    users: filteredUsers,
    total: filteredUsers.length,
    limit: filters.limit || 100,
    offset: filters.offset || 0
  };
}
```

**UI Component:** Same as Google Workspace Users table (unified interface)

**Permissions:** `admin` or `m365.user.read`

---

## Bulk Operations Implementation

### Pattern for All Bulk Actions

**Frontend:**
```tsx
// frontend/src/components/BulkActionToolbar.tsx
<BulkActionToolbar
  selectedCount={selectedUsers.length}
  actions={[
    {
      label: 'Suspend',
      icon: <PauseIcon />,
      onClick: () => handleBulkAction('suspend'),
      confirm: {
        title: 'Suspend Users',
        message: `Are you sure you want to suspend ${selectedUsers.length} users?`,
        confirmText: 'Suspend',
        cancelText: 'Cancel'
      }
    },
    {
      label: 'Delete',
      icon: <TrashIcon />,
      onClick: () => handleBulkAction('delete'),
      confirm: {
        title: 'Delete Users',
        message: `Are you sure you want to delete ${selectedUsers.length} users? This action cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        variant: 'danger'
      }
    }
  ]}
  onClearSelection={handleClearSelection}
/>
```

**Backend:**
```typescript
// backend/src/services/google-workspace.service.ts
async bulkSuspendUsers(organizationId: string, userIds: string[]) {
  const credentials = await this.getCredentials(organizationId);
  const admin = google.admin({ version: 'directory_v1', auth });

  const results = {
    success: [],
    failed: []
  };

  // Process in parallel with rate limiting
  await Promise.allSettled(
    userIds.map(async (userId) => {
      try {
        await admin.users.patch({
          userKey: userId,
          requestBody: { suspended: true }
        });
        results.success.push(userId);
      } catch (error) {
        results.failed.push({ userId, error: error.message });
      }
    })
  );

  // Audit log
  await this.auditLog.create({
    organizationId,
    action: 'user.bulk_suspend',
    targetEntities: userIds,
    results,
    success: results.failed.length === 0
  });

  return results;
}
```

**Progress Tracking:**
```tsx
// frontend/src/components/BulkOperationProgress.tsx
<ProgressModal
  title="Suspending Users"
  progress={progress}
  total={total}
  message={`Suspended ${progress} of ${total} users...`}
  onCancel={handleCancel}
/>
```

---

## CSV Import/Export Implementation

### CSV Export

**Frontend:**
```tsx
// frontend/src/components/ExportButton.tsx
<Dropdown
  trigger={<Button icon={<DownloadIcon />}>Export</Button>}
  items={[
    {
      label: 'Export as CSV',
      onClick: () => handleExport('csv')
    },
    {
      label: 'Export as Excel',
      onClick: () => handleExport('excel')
    },
    {
      label: 'Export as JSON',
      onClick: () => handleExport('json')
    }
  ]}
/>
```

**Backend:**
```typescript
// backend/src/services/export.service.ts
import { stringify } from 'csv-stringify/sync';
import * as XLSX from 'xlsx';

async exportUsers(organizationId: string, format: 'csv' | 'excel' | 'json', filters: any) {
  // Fetch users with filters
  const users = await this.googleWorkspace.listUsers(organizationId, filters);

  // Transform to export format
  const data = users.users.map(u => ({
    'Email': u.email,
    'First Name': u.firstName,
    'Last Name': u.lastName,
    'Organizational Unit': u.organizationUnit,
    'Status': u.suspended ? 'Suspended' : 'Active',
    'Last Login': u.lastLoginTime
  }));

  let fileBuffer;
  let mimeType;
  let filename;

  switch (format) {
    case 'csv':
      fileBuffer = stringify(data, { header: true });
      mimeType = 'text/csv';
      filename = `users_export_${Date.now()}.csv`;
      break;

    case 'excel':
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Users');
      fileBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      filename = `users_export_${Date.now()}.xlsx`;
      break;

    case 'json':
      fileBuffer = JSON.stringify(data, null, 2);
      mimeType = 'application/json';
      filename = `users_export_${Date.now()}.json`;
      break;
  }

  // Save to storage
  const filePath = `/exports/${organizationId}/${filename}`;
  await this.storage.save(filePath, fileBuffer);

  // Audit log
  await this.auditLog.create({
    organizationId,
    action: 'export.users',
    format,
    recordCount: data.length,
    filePath
  });

  return { filePath, filename, mimeType, size: fileBuffer.length };
}
```

### CSV Import

**Frontend:**
```tsx
// frontend/src/components/ImportWizard.tsx
<Wizard steps={[
  {
    title: 'Upload File',
    component: (
      <DropZone
        accept=".csv"
        onDrop={handleFileUpload}
        message="Drop CSV file here or click to browse"
      />
    )
  },
  {
    title: 'Map Columns',
    component: (
      <ColumnMapper
        csvHeaders={csvHeaders}
        targetFields={userFields}
        onMapping={handleColumnMapping}
      />
    )
  },
  {
    title: 'Validate Data',
    component: (
      <ValidationResults
        validRows={validRows}
        invalidRows={invalidRows}
        onProceed={handleImport}
      />
    )
  },
  {
    title: 'Import Progress',
    component: (
      <ImportProgress
        progress={progress}
        total={total}
        errors={errors}
      />
    )
  }
]} />
```

**Backend:**
```typescript
// backend/src/services/import.service.ts
async importUsersFromCSV(organizationId: string, filePath: string, columnMapping: any) {
  // Parse CSV
  const csvData = await this.storage.read(filePath);
  const rows = parse(csvData, { columns: true });

  const results = {
    success: [],
    failed: [],
    duplicates: []
  };

  for (const row of rows) {
    try {
      // Map columns to user fields
      const userData = {
        email: row[columnMapping.email],
        firstName: row[columnMapping.firstName],
        lastName: row[columnMapping.lastName],
        // ...
      };

      // Validate
      const validation = await this.validateUser(userData);
      if (!validation.valid) {
        results.failed.push({ row, errors: validation.errors });
        continue;
      }

      // Check for duplicates
      const existing = await this.googleWorkspace.getUser(organizationId, userData.email);
      if (existing) {
        results.duplicates.push({ row, existing });
        continue;
      }

      // Create user
      await this.googleWorkspace.createUser(organizationId, userData);
      results.success.push(userData.email);

    } catch (error) {
      results.failed.push({ row, error: error.message });
    }
  }

  return results;
}
```

---

## Error Handling Patterns

### API Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "USER_ALREADY_EXISTS",
    "message": "A user with this email already exists",
    "details": {
      "email": "john.smith@example.com",
      "existingUserId": "103456789012345678901"
    },
    "suggestion": "Use a different email or update the existing user"
  }
}
```

### Frontend Error Handling

```tsx
// frontend/src/hooks/useApiCall.ts
function useApiCall() {
  const { showToast } = useToast();

  async function call(apiFunction, options = {}) {
    try {
      const result = await apiFunction();
      if (options.successMessage) {
        showToast(options.successMessage, 'success');
      }
      return result;
    } catch (error) {
      const errorMessage = error.response?.data?.error?.message || 'An error occurred';
      const suggestion = error.response?.data?.error?.suggestion;

      showToast(
        <div>
          <div>{errorMessage}</div>
          {suggestion && <div className="text-sm mt-1">{suggestion}</div>}
        </div>,
        'error'
      );

      if (options.onError) {
        options.onError(error);
      }

      throw error;
    }
  }

  return { call };
}
```

---

## Testing Checklist

For each command implementation:

- [ ] Unit tests for service method
- [ ] Integration tests with mock API
- [ ] E2E test for happy path
- [ ] E2E test for error scenarios
- [ ] Audit log verification
- [ ] Permission checking
- [ ] Rate limit handling
- [ ] UI component renders correctly
- [ ] Loading states display
- [ ] Error messages are user-friendly
- [ ] Success confirmations work
- [ ] Undo functionality (if applicable)

---

## Next Steps

1. Implement Tier 1 commands (top 20)
2. Build unified DataTable component
3. Create BulkActionToolbar component
4. Implement CSV import/export
5. Add audit logging service
6. Build workflow automation engine
7. Create template provisioning system
8. Add security recommendations dashboard

**Priority:** Start with User Management (create, list, update, suspend) as these are the foundation for everything else.
