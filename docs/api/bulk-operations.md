# Bulk Operations API Documentation

This document describes the REST API endpoints for the Bulk Operations feature.

## Base URL

```
/api/bulk
```

## Authentication

All endpoints require authentication via JWT token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

## Endpoints

### Upload and Validate CSV

Upload a CSV file and validate its contents.

```http
POST /api/bulk/upload
Content-Type: multipart/form-data
```

**Request Body (Form Data):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | File | Yes | CSV file to upload |
| operationType | string | Yes | Type of operation |

**Operation Types:**
- `user_update` - Update existing users
- `user_create` - Create new users
- `user_suspend` - Suspend users
- `group_membership_add` - Add users to groups
- `group_membership_remove` - Remove users from groups

**Response (200 OK):**

```json
{
  "success": true,
  "data": [
    {
      "email": "user@company.com",
      "firstName": "John",
      "lastName": "Doe"
    }
  ],
  "meta": {
    "totalRows": 100,
    "validRows": 98,
    "invalidRows": 2
  },
  "errors": [
    {
      "row": 5,
      "column": "email",
      "message": "Invalid email format"
    }
  ]
}
```

**Response (400 Bad Request):**

```json
{
  "success": false,
  "error": "Invalid file format",
  "message": "File must be a CSV"
}
```

---

### Preview Operation

Get a preview of what will change when the operation runs.

```http
POST /api/bulk/preview
Content-Type: application/json
```

**Request Body:**

```json
{
  "operationType": "user_update",
  "data": [
    {
      "email": "user@company.com",
      "department": "Engineering"
    }
  ]
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "totalItems": 100,
  "sampleItems": [
    {
      "email": "user@company.com",
      "currentDepartment": "Sales",
      "newDepartment": "Engineering",
      "changes": ["department"]
    }
  ],
  "warnings": [
    {
      "row": 10,
      "message": "User is currently suspended"
    }
  ]
}
```

---

### Execute Bulk Operation

Start a bulk operation.

```http
POST /api/bulk/execute
Content-Type: application/json
```

**Request Body:**

```json
{
  "operationType": "user_update",
  "operationName": "Q4 Department Updates",
  "data": [
    {
      "email": "user@company.com",
      "department": "Engineering"
    }
  ]
}
```

**Response (202 Accepted):**

```json
{
  "success": true,
  "bulkOperationId": "123e4567-e89b-12d3-a456-426614174000",
  "status": "pending",
  "totalItems": 100,
  "message": "Operation queued for processing"
}
```

---

### Get Operation Status

Check the status of a running or completed operation.

```http
GET /api/bulk/status/:operationId
```

**Response (200 OK):**

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "organizationId": "org-123",
  "operationType": "user_update",
  "operationName": "Q4 Department Updates",
  "status": "processing",
  "totalItems": 100,
  "processedItems": 45,
  "successCount": 44,
  "failureCount": 1,
  "progress": 45,
  "createdAt": "2025-12-08T10:30:00Z",
  "updatedAt": "2025-12-08T10:31:00Z",
  "results": null
}
```

**Status Values:**
- `pending` - Waiting to start
- `processing` - Currently running
- `completed` - Finished successfully
- `failed` - Operation failed

---

### Get Operation History

List recent bulk operations for the organization.

```http
GET /api/bulk/history?limit=10
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| limit | number | 10 | Max results to return |

**Response (200 OK):**

```json
{
  "success": true,
  "operations": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "operationType": "user_update",
      "operationName": "Q4 Department Updates",
      "status": "completed",
      "totalItems": 100,
      "successCount": 98,
      "failureCount": 2,
      "createdAt": "2025-12-08T10:30:00Z",
      "completedAt": "2025-12-08T10:35:00Z"
    }
  ]
}
```

---

### Download Template

Download a CSV template for a specific operation type.

```http
GET /api/bulk/template/:operationType
```

**Response (200 OK):**

Returns a CSV file with headers appropriate for the operation type.

```
Content-Type: text/csv
Content-Disposition: attachment; filename="user_update_template.csv"
```

---

## Templates API

### List Templates

Get all saved templates.

```http
GET /api/bulk/templates
```

**Response (200 OK):**

```json
{
  "success": true,
  "templates": [
    {
      "id": "tmpl-123",
      "name": "New Hire Onboarding",
      "description": "Standard new hire creation template",
      "operationType": "user_create",
      "createdAt": "2025-12-01T09:00:00Z",
      "updatedAt": "2025-12-05T14:30:00Z"
    }
  ]
}
```

---

### Create Template

Save a new template.

```http
POST /api/bulk/templates
Content-Type: application/json
```

**Request Body:**

```json
{
  "name": "New Hire Onboarding",
  "description": "Standard new hire creation template",
  "operationType": "user_create",
  "templateData": [
    {
      "email": "",
      "firstName": "",
      "lastName": "",
      "department": "Engineering",
      "password": ""
    }
  ]
}
```

**Response (201 Created):**

```json
{
  "success": true,
  "template": {
    "id": "tmpl-123",
    "name": "New Hire Onboarding",
    "description": "Standard new hire creation template",
    "operationType": "user_create",
    "createdAt": "2025-12-08T10:00:00Z"
  }
}
```

---

### Get Template

Get a single template by ID.

```http
GET /api/bulk/templates/:templateId
```

**Response (200 OK):**

```json
{
  "success": true,
  "template": {
    "id": "tmpl-123",
    "name": "New Hire Onboarding",
    "description": "Standard new hire creation template",
    "operationType": "user_create",
    "templateData": [
      {
        "email": "",
        "firstName": "",
        "lastName": "",
        "department": "Engineering",
        "password": ""
      }
    ],
    "createdAt": "2025-12-01T09:00:00Z"
  }
}
```

---

### Delete Template

Delete a saved template.

```http
DELETE /api/bulk/templates/:templateId
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Template deleted successfully"
}
```

---

## Export API

### Export Users

Export users to CSV format.

```http
GET /api/export/users?format=csv
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| format | string | csv | Export format (csv only) |
| department | string | - | Filter by department |
| status | string | - | Filter by status (active, suspended) |

**Response (200 OK):**

Returns a CSV file with user data.

```
Content-Type: text/csv
Content-Disposition: attachment; filename="users_export.csv"
```

---

### Export Groups

Export groups to CSV format.

```http
GET /api/export/groups?format=csv
```

**Response (200 OK):**

Returns a CSV file with group data.

---

## WebSocket Events

For real-time progress updates, connect to the WebSocket endpoint:

```
ws://hostname:3001/bulk-operations
```

### Authentication

Send auth token after connecting:

```json
{
  "event": "authenticate",
  "token": "<jwt_token>"
}
```

### Subscribe to Operation

```json
{
  "event": "subscribe",
  "operationId": "123e4567-e89b-12d3-a456-426614174000"
}
```

### Progress Events

The server sends progress updates:

```json
{
  "event": "progress",
  "data": {
    "bulkOperationId": "123e4567-e89b-12d3-a456-426614174000",
    "status": "processing",
    "totalItems": 100,
    "processedItems": 45,
    "successCount": 44,
    "failureCount": 1,
    "progress": 45
  }
}
```

### Completion Events

```json
{
  "event": "completed",
  "data": {
    "bulkOperationId": "123e4567-e89b-12d3-a456-426614174000",
    "status": "completed",
    "totalItems": 100,
    "processedItems": 100,
    "successCount": 98,
    "failureCount": 2,
    "progress": 100
  }
}
```

### Failure Events

```json
{
  "event": "failed",
  "data": {
    "bulkOperationId": "123e4567-e89b-12d3-a456-426614174000",
    "status": "failed",
    "error": "Database connection lost",
    "totalItems": 100,
    "processedItems": 45,
    "successCount": 44,
    "failureCount": 1,
    "progress": 45
  }
}
```

---

## Error Responses

All endpoints may return error responses:

### 400 Bad Request

```json
{
  "success": false,
  "error": "ValidationError",
  "message": "Invalid operation type",
  "details": {
    "field": "operationType",
    "value": "invalid_type"
  }
}
```

### 401 Unauthorized

```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

### 403 Forbidden

```json
{
  "success": false,
  "error": "Forbidden",
  "message": "Admin access required"
}
```

### 404 Not Found

```json
{
  "success": false,
  "error": "NotFound",
  "message": "Operation not found"
}
```

### 500 Internal Server Error

```json
{
  "success": false,
  "error": "InternalError",
  "message": "An unexpected error occurred"
}
```

---

## Rate Limits

| Endpoint | Rate Limit |
|----------|------------|
| POST /api/bulk/upload | 10 requests/minute |
| POST /api/bulk/execute | 5 requests/minute |
| GET /api/bulk/status | 60 requests/minute |
| GET /api/bulk/history | 30 requests/minute |

---

## Data Validation Rules

### Email Validation
- Must be valid email format
- Must match organization domain (for creates)
- Must exist in system (for updates)

### Password Validation (user_create)
- Minimum 8 characters
- Must contain uppercase and lowercase
- Must contain at least one number

### Department Validation
- Should match existing master data (warning if not)
- Case-insensitive matching

### Group Validation
- Group must exist
- User must not already be member (for add)
- User must be member (for remove)
