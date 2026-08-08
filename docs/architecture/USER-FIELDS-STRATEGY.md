# User Fields Strategy - Helios

## Executive Summary

Analysis of industry standards (JumpCloud, Freshservice) vs current Helios implementation.

**Recommendation:** Keep current approach with minor additions. We already have 95% of needed fields.

## Current State: Already Excellent ✅

Helios currently has **79 fields** in `organization_users` table, including:

### Core Identity Fields ✅
- `id`, `email`, `first_name`, `last_name`
- `alternate_email`, `password_hash`
- `email_verified`, `email_verification_token`

### Employment Fields ✅
- `job_title`, `department`, `department_id`
- `organizational_unit`, `location`
- `employee_id`, `employee_type` (Full Time, Part Time, etc.)
- `cost_center`, `start_date`, `end_date`
- `reporting_manager_id`

### Contact Information ✅
- `mobile_phone`, `work_phone`, `work_phone_extension`
- `timezone`, `preferred_language`

### Platform Integration IDs ✅
- `google_workspace_id` + sync status/timestamp
- `microsoft_365_id` + sync status/timestamp
- `jumpcloud_user_id`
- `github_username`
- `slack_user_id`
- `associate_id`

### Guest/Contact Management ✅
- `user_type` enum: staff, guest, contact
- `is_guest`, `guest_expires_at`, `guest_invited_by`, `guest_invited_at`
- `company`, `contact_tags[]`

### Status & Access Control ✅
- `user_status`: active, staged, suspended, deleted
- `is_active`, `deleted_at`, `blocked_at`, `blocked_by`, `blocked_reason`
- `role`: admin, manager, user

### Professional Profile ✅
- `bio`, `professional_designations`, `pronouns`
- `avatar_url` (multiple sizes: 50, 100, 200, 400)
- Social media URLs (LinkedIn, Twitter, GitHub, Portfolio, Instagram, Facebook)

### Security ✅
- `two_factor_enabled`, `two_factor_secret`
- `password_reset_token`, `password_reset_expires`
- `last_login`

### **Already Implemented: Custom Fields** ✅
```sql
custom_fields jsonb DEFAULT '{}'::jsonb
```
With GIN index for fast queries!

---

## Comparison with Industry Standards

### JumpCloud Fields

| JumpCloud Field | Helios Equivalent | Status |
|----------------|-------------------|---------|
| `firstname`, `lastname` | `first_name`, `last_name` | ✅ Have |
| `email` | `email` | ✅ Have |
| `alternateEmail` | `alternate_email` | ✅ Have |
| `jobTitle` | `job_title` | ✅ Have |
| `department` | `department` | ✅ Have |
| `company` | `company` | ✅ Have |
| `costCenter` | `cost_center` | ✅ Have |
| `employeeType` | `employee_type` | ✅ Have |
| `employeeIdentifier` | `employee_id` | ✅ Have |
| `manager` | `reporting_manager_id` | ✅ Have |
| `location` | `location` | ✅ Have |
| `phoneNumbers` | `mobile_phone`, `work_phone` | ✅ Have |
| `managedAppleId` | (custom_fields) | ⚠️ Use custom |
| `unix_uid`, `unix_guid` | (not needed) | ❌ Skip |
| `ssh_keys`, `public_key` | (not needed for Helios) | ❌ Skip |
| `ldap_binding_user` | (not needed) | ❌ Skip |
| `totp_enabled` | `two_factor_enabled` | ✅ Have |
| `state` (ACTIVATED) | `user_status` | ✅ Have |
| `suspended` | `user_status = 'suspended'` | ✅ Have |
| `attributes` (array) | `custom_fields` (jsonb) | ✅ Have |

### Freshservice Fields

| Freshservice Field | Helios Equivalent | Status |
|-------------------|-------------------|---------|
| `first_name`, `last_name` | ✅ Have | ✅ |
| `primary_email` | `email` | ✅ Have |
| `secondary_emails[]` | (custom_fields) | ⚠️ Use custom |
| `job_title` | `job_title` | ✅ Have |
| `department_ids[]` | `department_id` | ✅ Have (single) |
| `location_id`, `location_name` | `location` | ✅ Have |
| `mobile_phone_number` | `mobile_phone` | ✅ Have |
| `work_phone_number` | `work_phone` | ✅ Have |
| `reporting_manager_id` | `reporting_manager_id` | ✅ Have |
| `time_zone` | `timezone` | ✅ Have |
| `language` | `preferred_language` | ✅ Have |
| `vip_user` | (custom_fields) | ⚠️ Use custom |
| `active` | `user_status = 'active'` | ✅ Have |
| `custom_fields{}` | `custom_fields` | ✅ Have |
| `background_information` | `bio` | ✅ Have |
| `address` | (custom_fields) | ⚠️ Use custom |
| `external_id` | (various platform IDs) | ✅ Have |

---

## Recommended Additions

### 1. Add Missing Common Fields (Low Priority)

**Fields we could add as proper columns:**

```sql
-- Work schedule tracking
work_schedule_id UUID REFERENCES work_schedules(id),
work_schedule_name VARCHAR(255),

-- Multi-department support (if needed later)
secondary_departments UUID[], -- Array of department IDs

-- Emergency contact
emergency_contact_name VARCHAR(255),
emergency_contact_phone VARCHAR(50),
emergency_contact_relationship VARCHAR(100),

-- Physical office/desk
office_location VARCHAR(255), -- "Building A, Floor 3, Desk 42"
```

**Recommendation:** Skip for now. Use `custom_fields` instead.

### 2. Enhance Custom Fields Documentation

Create clear documentation on how to use `custom_fields`:

```typescript
// Example custom_fields usage
{
  "vip_user": true,
  "secondary_emails": ["backup@email.com"],
  "managed_apple_id": "user@company.apple.com",
  "employee_badge_number": "12345",
  "parking_spot": "A-42",
  "shirt_size": "L",
  "dietary_restrictions": "Vegetarian",
  "emergency_contact": {
    "name": "Jane Doe",
    "phone": "+1-555-0100",
    "relationship": "Spouse"
  },
  "certifications": [
    {"name": "AWS Certified", "date": "2024-01-15"},
    {"name": "PMP", "date": "2023-06-20"}
  ]
}
```

---

## Custom Fields Implementation Strategy

### ✅ Already Implemented

```sql
-- Column exists with GIN index
custom_fields jsonb DEFAULT '{}'::jsonb
CREATE INDEX idx_org_users_custom_fields ON organization_users USING GIN (custom_fields);
```

### Query Examples (Already Work!)

```sql
-- Find users with specific custom field
SELECT * FROM organization_users
WHERE custom_fields->>'vip_user' = 'true';

-- Find users with secondary email
SELECT * FROM organization_users
WHERE custom_fields->'secondary_emails' ? 'backup@email.com';

-- Find users with certification
SELECT * FROM organization_users
WHERE custom_fields @> '{"certifications": [{"name": "AWS Certified"}]}';

-- Update custom field
UPDATE organization_users
SET custom_fields = custom_fields || '{"vip_user": true}'::jsonb
WHERE email = 'user@company.com';
```

### UI Implementation Needed

**Priority 1: Admin UI for Custom Field Management**

In Settings > Advanced > Custom Fields:

```typescript
interface CustomFieldDefinition {
  key: string;              // e.g., "vip_user"
  label: string;            // e.g., "VIP User"
  type: 'text' | 'number' | 'boolean' | 'date' | 'select' | 'multiselect';
  required: boolean;
  default_value?: any;
  options?: string[];       // For select/multiselect
  help_text?: string;
  show_in_user_list: boolean;
  show_in_user_profile: boolean;
  group: string;            // "Personal", "HR", "IT", etc.
}
```

**Priority 2: User Profile Custom Fields Section**

Show custom fields in user detail view with proper UI controls based on field type.

**Priority 3: API Support**

Already works! Just document it:

```bash
# Create user with custom fields
POST /api/organization/users
{
  "email": "newuser@company.com",
  "firstName": "John",
  "lastName": "Doe",
  "custom_fields": {
    "vip_user": true,
    "badge_number": "12345"
  }
}

# Update custom fields
PATCH /api/organization/users/{id}
{
  "custom_fields": {
    "parking_spot": "A-42"
  }
}
```

---

## Migration Strategy

### Phase 1: Documentation (Immediate)
- ✅ Document existing `custom_fields` capability
- ✅ Provide examples in API docs
- ✅ Add to Swagger/OpenAPI spec

### Phase 2: UI (Next Sprint)
- Add Custom Field Definitions page in Settings
- Add custom fields editor in User Profile
- Add custom field columns to user list (optional)

### Phase 3: Sync Integration (Future)
- Map Google Workspace custom schemas → Helios custom_fields
- Map Microsoft 365 extension attributes → Helios custom_fields
- Bidirectional sync support

---

## Field Mapping from External Systems

### Google Workspace → Helios

```typescript
const googleToHeliosFieldMap = {
  // Standard fields
  'name.givenName': 'first_name',
  'name.familyName': 'last_name',
  'primaryEmail': 'email',
  'orgUnitPath': 'organizational_unit',
  'phones[0].value': 'work_phone',
  'phones[1].value': 'mobile_phone',
  'organizations[0].title': 'job_title',
  'organizations[0].department': 'department',
  'organizations[0].costCenter': 'cost_center',

  // Custom schemas go to custom_fields
  'customSchemas.HR.*': 'custom_fields.{fieldName}',
  'customSchemas.IT.*': 'custom_fields.{fieldName}',
};
```

### JumpCloud → Helios

```typescript
const jumpcloudToHeliosFieldMap = {
  // Standard fields
  'firstname': 'first_name',
  'lastname': 'last_name',
  'email': 'email',
  'alternateEmail': 'alternate_email',
  'jobTitle': 'job_title',
  'department': 'department',
  'costCenter': 'cost_center',
  'employeeType': 'employee_type',
  'employeeIdentifier': 'employee_id',

  // Attributes array → custom_fields
  'attributes[]': 'custom_fields.{attribute.name}',
};
```

### Freshservice → Helios

```typescript
const freshserviceToHeliosFieldMap = {
  // Standard fields
  'first_name': 'first_name',
  'last_name': 'last_name',
  'primary_email': 'email',
  'job_title': 'job_title',
  'location_name': 'location',
  'mobile_phone_number': 'mobile_phone',
  'work_phone_number': 'work_phone',
  'time_zone': 'timezone',
  'language': 'preferred_language',

  // Custom fields object → custom_fields
  'custom_fields.*': 'custom_fields.{fieldName}',
};
```

---

## API Response Format

### Current Format (Good!)

```json
{
  "id": "uuid",
  "email": "user@company.com",
  "firstName": "John",
  "lastName": "Doe",
  "jobTitle": "Software Engineer",
  "department": "Engineering",
  "employeeType": "Full Time",
  "userStatus": "active",
  "customFields": {
    "vip_user": true,
    "badge_number": "12345",
    "certifications": [
      {"name": "AWS Certified", "date": "2024-01-15"}
    ]
  }
}
```

---

## Recommendations Summary

### ✅ Keep Current Approach
We already have **excellent field coverage** and a **flexible custom_fields JSONB column**.

### ✅ Add Only These
1. **Documentation** - Document custom_fields usage in API docs
2. **UI for Custom Field Definitions** - Let admins define what custom fields exist
3. **User Profile Editor** - Show/edit custom fields in user profiles
4. **Sync Mapping** - Map external system custom fields to Helios custom_fields

### ❌ Don't Add These
- Unix/LDAP fields (ssh keys, unix_uid, etc.) - not needed for SaaS
- Redundant fields that can go in custom_fields
- Platform-specific fields better handled by sync

---

## Next Steps

1. **Immediate:**
   - Update API documentation to show custom_fields examples
   - Add custom_fields to Swagger spec

2. **Short-term (1-2 weeks):**
   - Build Custom Field Definitions UI in Settings
   - Add custom fields display in User Profile
   - Show custom fields in user list (configurable columns)

3. **Medium-term (1 month):**
   - Implement Google Workspace custom schema mapping
   - Implement JumpCloud attributes mapping
   - Bidirectional sync support

4. **Long-term:**
   - Custom field validation rules
   - Custom field audit trail
   - Bulk update custom fields
   - Custom field reporting/filtering

---

**Conclusion:** Helios already has an industry-leading user data model. Focus on UI for custom_fields rather than adding more columns.
