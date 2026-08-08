# Access Groups API

This document describes the Access Groups API endpoints for managing groups, members, dynamic rules, and Google Workspace synchronization.

## Base URL

All endpoints are prefixed with `/api/organization/access-groups`

## Authentication

All endpoints require a valid JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

## Endpoints

### List Access Groups

List all access groups for the organization.

```
GET /api/organization/access-groups
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Engineering Team",
      "description": "All engineering staff",
      "email": "engineering@example.com",
      "platform": "google_workspace",
      "group_type": "security",
      "external_id": "groups/xxx",
      "external_url": "https://admin.google.com/...",
      "is_active": true,
      "created_at": "2025-01-15T10:00:00Z",
      "synced_at": "2025-01-15T12:00:00Z",
      "metadata": {},
      "member_count": 25
    }
  ]
}
```

---

### Get Access Group Details

Get detailed information about a specific group including its members.

```
GET /api/organization/access-groups/:id
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| id | UUID | The group ID |

**Response:**
```json
{
  "success": true,
  "data": {
    "group": {
      "id": "uuid",
      "name": "Engineering Team",
      "description": "All engineering staff",
      "email": "engineering@example.com",
      "platform": "google_workspace",
      "group_type": "security",
      "membership_type": "static",
      "rule_logic": "AND",
      "external_id": "groups/xxx",
      "is_active": true,
      "created_at": "2025-01-15T10:00:00Z",
      "synced_at": "2025-01-15T12:00:00Z"
    },
    "members": [
      {
        "id": "uuid",
        "member_type": "member",
        "is_active": true,
        "joined_at": "2025-01-15T10:00:00Z",
        "user_id": "uuid",
        "email": "john@example.com",
        "first_name": "John",
        "last_name": "Doe"
      }
    ]
  }
}
```

---

### Create Access Group

Create a new manual access group.

```
POST /api/organization/access-groups
```

**Request Body:**
```json
{
  "name": "Project Alpha Team",
  "description": "Team members for Project Alpha",
  "email": "alpha@example.com"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Group name |
| description | string | No | Group description |
| email | string | No | Group email address |

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Project Alpha Team",
    "description": "Team members for Project Alpha",
    "email": "alpha@example.com",
    "platform": "manual",
    "group_type": "manual",
    "is_active": true,
    "created_at": "2025-01-15T10:00:00Z"
  },
  "message": "Access group created successfully"
}
```

---

### Update Access Group

Update an existing access group.

```
PUT /api/organization/access-groups/:id
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| id | UUID | The group ID |

**Request Body:**
```json
{
  "name": "Updated Group Name",
  "description": "Updated description",
  "email": "new-email@example.com"
}
```

All fields are optional. Only provided fields will be updated.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Updated Group Name",
    "description": "Updated description",
    "email": "new-email@example.com"
  },
  "message": "Access group updated successfully"
}
```

---

### Delete Access Group

Delete (archive) an access group. This is a soft delete.

```
DELETE /api/organization/access-groups/:id
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| id | UUID | The group ID |

**Response:**
```json
{
  "success": true,
  "message": "Access group deleted successfully"
}
```

---

## Group Members

### Add Member to Group

Add a user to an access group.

```
POST /api/organization/access-groups/:id/members
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| id | UUID | The group ID |

**Request Body:**
```json
{
  "userId": "uuid",
  "memberType": "member"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| userId | UUID | Yes | The user ID to add |
| memberType | string | No | Role type: "member" (default), "manager", "owner" |

**Response:**
```json
{
  "success": true,
  "message": "Member added to access group"
}
```

**Note:** For Google Workspace groups, the membership change is automatically synced to Google.

---

### Remove Member from Group

Remove a user from an access group.

```
DELETE /api/organization/access-groups/:id/members/:userId
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| id | UUID | The group ID |
| userId | UUID | The user ID to remove |

**Response:**
```json
{
  "success": true,
  "message": "Member removed from access group"
}
```

**Note:** For Google Workspace groups, the membership change is automatically synced to Google.

---

## Dynamic Group Rules

Dynamic groups automatically include users based on rules. Rules evaluate user attributes and determine membership.

### Get Group Rules

Get all rules for a dynamic group.

```
GET /api/organization/access-groups/:id/rules
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| id | UUID | The group ID |

**Response:**
```json
{
  "success": true,
  "data": {
    "rules": [
      {
        "id": "uuid",
        "accessGroupId": "uuid",
        "field": "department",
        "operator": "equals",
        "value": "Engineering",
        "caseSensitive": false,
        "includeNested": false,
        "sortOrder": 1,
        "createdAt": "2025-01-15T10:00:00Z",
        "updatedAt": "2025-01-15T10:00:00Z"
      }
    ],
    "groupConfig": {
      "membershipType": "dynamic",
      "ruleLogic": "AND"
    }
  }
}
```

---

### Add Rule

Add a new rule to a dynamic group.

```
POST /api/organization/access-groups/:id/rules
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| id | UUID | The group ID |

**Request Body:**
```json
{
  "field": "department",
  "operator": "equals",
  "value": "Engineering",
  "caseSensitive": false,
  "includeNested": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| field | string | Yes | The user field to evaluate (see Field Reference) |
| operator | string | Yes | The comparison operator (see Operator Reference) |
| value | string | Yes | The value to compare against |
| caseSensitive | boolean | No | Whether comparison is case-sensitive (default: false) |
| includeNested | boolean | No | For hierarchical fields, include nested items (default: false) |

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "accessGroupId": "uuid",
    "field": "department",
    "operator": "equals",
    "value": "Engineering",
    "caseSensitive": false,
    "includeNested": true,
    "sortOrder": 1,
    "createdAt": "2025-01-15T10:00:00Z",
    "updatedAt": "2025-01-15T10:00:00Z"
  },
  "message": "Rule added successfully"
}
```

---

### Update Rule

Update an existing rule.

```
PUT /api/organization/access-groups/:id/rules/:ruleId
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| id | UUID | The group ID |
| ruleId | UUID | The rule ID |

**Request Body:**
```json
{
  "field": "department",
  "operator": "contains",
  "value": "Eng",
  "caseSensitive": false,
  "sortOrder": 2
}
```

All fields are optional. Only provided fields will be updated.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "field": "department",
    "operator": "contains",
    "value": "Eng"
  },
  "message": "Rule updated successfully"
}
```

---

### Delete Rule

Delete a rule from a group.

```
DELETE /api/organization/access-groups/:id/rules/:ruleId
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| id | UUID | The group ID |
| ruleId | UUID | The rule ID |

**Response:**
```json
{
  "success": true,
  "message": "Rule deleted successfully"
}
```

---

### Evaluate Rules (Preview)

Evaluate the current rules and see which users would match without applying changes.

```
POST /api/organization/access-groups/:id/evaluate
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| id | UUID | The group ID |

**Request Body:**
```json
{
  "returnUsers": true,
  "limit": 50
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| returnUsers | boolean | No | Whether to return user details (default: true) |
| limit | number | No | Maximum users to return (default: 50) |

**Response:**
```json
{
  "success": true,
  "data": {
    "matchingUserIds": ["uuid1", "uuid2", "uuid3"],
    "matchingUserCount": 15,
    "matchingUsers": [
      {
        "id": "uuid",
        "email": "john@example.com",
        "firstName": "John",
        "lastName": "Doe",
        "department": "Engineering",
        "jobTitle": "Software Engineer"
      }
    ],
    "evaluatedAt": "2025-01-15T12:00:00Z"
  }
}
```

---

### Apply Rules

Apply the current rules and update group membership.

```
POST /api/organization/access-groups/:id/apply-rules
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| id | UUID | The group ID |

**Note:** The group must have `membershipType: "dynamic"` for this endpoint to work.

**Response:**
```json
{
  "success": true,
  "data": {
    "added": 5,
    "removed": 2,
    "unchanged": 10
  },
  "message": "Rules applied: 5 added, 2 removed, 10 unchanged"
}
```

---

### Update Membership Type

Change a group between static and dynamic membership.

```
PUT /api/organization/access-groups/:id/membership-type
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| id | UUID | The group ID |

**Request Body:**
```json
{
  "membershipType": "dynamic",
  "ruleLogic": "AND",
  "refreshInterval": 60
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| membershipType | string | Yes | Either "static" or "dynamic" |
| ruleLogic | string | No | "AND" or "OR" for rule combination (default: "AND") |
| refreshInterval | number | No | Minutes between automatic rule evaluations (0 = manual only) |

**Response:**
```json
{
  "success": true,
  "message": "Group membership type changed to dynamic"
}
```

---

## Google Workspace Sync

### Sync Group to Google Workspace

Synchronize group members between Helios and Google Workspace.

```
POST /api/organization/access-groups/:id/sync/google
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| id | UUID | The group ID |

**Request Body:**
```json
{
  "direction": "push"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| direction | string | No | Sync direction: "push" (default), "pull", or "bidirectional" |

**Sync Directions:**
- `push`: Send Helios members to Google (Helios is source of truth)
- `pull`: Get Google members to Helios (Google is source of truth)
- `bidirectional`: Merge members from both systems

**Response:**
```json
{
  "success": true,
  "data": {
    "added": 3,
    "removed": 1,
    "errors": [],
    "details": {
      "addedMembers": ["user1@example.com", "user2@example.com"],
      "removedMembers": ["old@example.com"]
    }
  },
  "message": "Sync completed: 3 added, 1 removed"
}
```

**Error Response (if sync has errors):**
```json
{
  "success": false,
  "data": {
    "added": 2,
    "removed": 0,
    "errors": [
      "Failed to add user3@example.com: User not found in domain"
    ]
  },
  "message": "Sync completed with errors: 1 failures"
}
```

---

### Get Sync Status

Get the current sync status for a group.

```
GET /api/organization/access-groups/:id/sync/status
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| id | UUID | The group ID |

**Response:**
```json
{
  "success": true,
  "data": {
    "groupId": "uuid",
    "name": "Engineering Team",
    "platform": "google_workspace",
    "externalId": "groups/xxx",
    "lastSynced": "2025-01-15T12:00:00Z",
    "heliosMemberCount": 25,
    "googleMemberCount": 24,
    "syncAvailable": true
  }
}
```

---

## Field Reference

Available fields for dynamic group rules:

| Field | Description | Example Values |
|-------|-------------|----------------|
| `department` | User's department name | "Engineering", "Sales" |
| `department_id` | Department ID (for hierarchical matching) | UUID |
| `location` | User's location name | "New York Office" |
| `location_id` | Location ID (for hierarchical matching) | UUID |
| `job_title` | User's job title | "Software Engineer" |
| `reports_to` | Manager (by ID, email, or name) | "jane@example.com" |
| `manager_id` | Manager's user ID | UUID |
| `org_unit_path` | Google Workspace organizational unit | "/Engineering/Platform" |
| `employee_type` | Employment type | "full_time", "contractor" |
| `user_type` | User type classification | "employee", "vendor" |
| `cost_center` | Cost center code | "CC-1234" |
| `email` | User's email address | "john@example.com" |

---

## Operator Reference

Available operators for dynamic group rules:

| Operator | Description | Example |
|----------|-------------|---------|
| `equals` | Exact match | `department equals "Engineering"` |
| `not_equals` | Does not match | `department not_equals "HR"` |
| `contains` | Contains substring | `job_title contains "Engineer"` |
| `not_contains` | Does not contain | `email not_contains "contractor"` |
| `starts_with` | Starts with prefix | `email starts_with "dev-"` |
| `ends_with` | Ends with suffix | `email ends_with "@example.com"` |
| `regex` | Regular expression match | `job_title regex "^(Senior\|Lead)"` |
| `in_list` | Value is in comma-separated list | `department in_list "Engineering,Product"` |
| `not_in_list` | Value not in list | `location not_in_list "Remote,WFH"` |
| `is_empty` | Field is null or empty | `department is_empty` |
| `is_not_empty` | Field has a value | `manager_id is_not_empty` |
| `is_under` | Hierarchical match (includes nested) | `department is_under "Engineering"` |
| `is_not_under` | Not under hierarchy | `org_unit_path is_not_under "/Contractors"` |

### Hierarchical Operators

The `is_under` operator supports hierarchical matching for:

- **Departments**: Matches the department and all sub-departments
- **Locations**: Matches the location and all child locations
- **Manager (reports_to)**: With `includeNested: true`, matches direct and indirect reports
- **Org Unit Path**: Matches paths that start with the given prefix

**Example:** `department is_under "Engineering"` would match:
- Engineering
- Engineering > Platform
- Engineering > Platform > Backend
- Engineering > Mobile

---

## Rule Logic

When a group has multiple rules, the `ruleLogic` setting determines how they combine:

| Logic | Description |
|-------|-------------|
| `AND` | User must match ALL rules to be included |
| `OR` | User must match ANY rule to be included |

**Example with AND logic:**
```
Rule 1: department equals "Engineering"
Rule 2: location equals "San Francisco"
```
Result: Only users in Engineering AND located in San Francisco

**Example with OR logic:**
```
Rule 1: department equals "Engineering"
Rule 2: department equals "Product"
```
Result: Users in Engineering OR Product departments

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "success": false,
  "error": "Error type description",
  "message": "Detailed error message"
}
```

### Common Error Codes

| Status | Error | Description |
|--------|-------|-------------|
| 400 | Bad Request | Missing or invalid parameters |
| 401 | Unauthorized | Invalid or missing JWT token |
| 404 | Not Found | Group or rule not found |
| 500 | Internal Server Error | Server-side error |

---

## Rate Limiting

API requests are subject to rate limiting:
- 100 requests per minute per user
- 1000 requests per minute per organization

Exceeded limits return status `429 Too Many Requests`.
