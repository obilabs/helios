# Audit Log Events Specification

This document defines all events that should be captured in the Helios audit log system for compliance, security monitoring, and troubleshooting.

## Event Categories

### 1. Authentication Events

| Action | Description | Resource Type | When Logged |
|--------|-------------|---------------|-------------|
| `user_login` | User successfully logged in | user | On successful login |
| `user_login_failed` | Failed login attempt | user | On failed login (wrong password/email) |
| `user_logout` | User logged out | user | On logout |
| `token_refreshed` | Access token refreshed | session | On token refresh |
| `session_expired` | Session timed out | session | On session expiration |
| `password_changed` | User changed their password | user | After password change |
| `password_reset_requested` | Password reset email sent | user | On reset request |
| `password_reset_completed` | Password reset successful | user | After password reset |
| `mfa_enabled` | 2FA enabled for user | user | On 2FA setup |
| `mfa_disabled` | 2FA disabled for user | user | On 2FA removal |
| `mfa_challenge_passed` | 2FA verification successful | user | On successful 2FA |
| `mfa_challenge_failed` | 2FA verification failed | user | On failed 2FA attempt |

### 2. User Management Events

| Action | Description | Resource Type | When Logged |
|--------|-------------|---------------|-------------|
| `user_created` | New user account created | user | After user creation |
| `user_updated` | User profile updated | user | After profile update |
| `user_deleted` | User account deleted/deactivated | user | After deletion |
| `user_restored` | Deleted user restored | user | After restoration |
| `user_suspended` | User account suspended | user | On suspension |
| `user_activated` | Suspended user reactivated | user | On reactivation |
| `user_role_changed` | User role modified | user | On role change |
| `user_manager_changed` | User's manager updated | user | On manager change |
| `user_department_changed` | User's department changed | user | On dept change |
| `user_photo_uploaded` | Profile photo uploaded | user | After upload |
| `user_photo_deleted` | Profile photo removed | user | After deletion |

### 3. Group Management Events

| Action | Description | Resource Type | When Logged |
|--------|-------------|---------------|-------------|
| `group_created` | New group created | group | After group creation |
| `group_updated` | Group settings updated | group | After update |
| `group_deleted` | Group deleted | group | After deletion |
| `group_member_added` | User added to group | group | After member add |
| `group_member_removed` | User removed from group | group | After member remove |
| `group_manager_added` | Manager added to group | group | After manager add |
| `group_manager_removed` | Manager removed from group | group | After manager remove |

### 4. Google Workspace Events (via Transparent Proxy)

| Action | Description | Resource Type | When Logged |
|--------|-------------|---------------|-------------|
| `google_api_get` | Read operation via proxy | google_workspace | On GET request |
| `google_api_post` | Create operation via proxy | google_workspace | On POST request |
| `google_api_put` | Update operation via proxy | google_workspace | On PUT request |
| `google_api_patch` | Partial update via proxy | google_workspace | On PATCH request |
| `google_api_delete` | Delete operation via proxy | google_workspace | On DELETE request |
| `google_sync_started` | Directory sync initiated | google_workspace | On sync start |
| `google_sync_completed` | Directory sync finished | google_workspace | On sync completion |
| `google_sync_failed` | Directory sync failed | google_workspace | On sync error |
| `google_user_synced` | User data synced from Google | google_workspace | Per user synced |

### 5. Microsoft 365 Events (when enabled)

| Action | Description | Resource Type | When Logged |
|--------|-------------|---------------|-------------|
| `microsoft_api_get` | Read operation via proxy | microsoft_365 | On GET request |
| `microsoft_api_post` | Create operation via proxy | microsoft_365 | On POST request |
| `microsoft_api_patch` | Update operation via proxy | microsoft_365 | On PATCH request |
| `microsoft_api_delete` | Delete operation via proxy | microsoft_365 | On DELETE request |
| `microsoft_sync_started` | Directory sync initiated | microsoft_365 | On sync start |
| `microsoft_sync_completed` | Directory sync finished | microsoft_365 | On sync completion |
| `microsoft_sync_failed` | Directory sync failed | microsoft_365 | On sync error |

### 6. Email & Communication Events

| Action | Description | Resource Type | When Logged |
|--------|-------------|---------------|-------------|
| `email_search` | Email content searched | email | On search execution |
| `email_forwarding_setup` | Email forwarding configured | email | After setup |
| `email_forwarding_removed` | Email forwarding removed | email | After removal |
| `email_alias_added` | Email alias added to user | email | After alias add |
| `email_alias_removed` | Email alias removed | email | After alias remove |
| `external_sharing_reviewed` | External sharing audit | email | After review |

### 7. Signature Management Events

| Action | Description | Resource Type | When Logged |
|--------|-------------|---------------|-------------|
| `signature_template_created` | New signature template created | signature | After creation |
| `signature_template_updated` | Signature template modified | signature | After update |
| `signature_template_deleted` | Signature template deleted | signature | After deletion |
| `signature_deployed` | Signature deployed to user(s) | signature | After deployment |
| `signature_campaign_started` | Signature campaign initiated | signature | On campaign start |
| `signature_campaign_completed` | Signature campaign finished | signature | On completion |

### 8. Asset & Media Events

| Action | Description | Resource Type | When Logged |
|--------|-------------|---------------|-------------|
| `asset_uploaded` | Media asset uploaded | asset | After upload |
| `asset_deleted` | Media asset deleted | asset | After deletion |
| `asset_folder_created` | Asset folder created | asset | After creation |
| `asset_folder_deleted` | Asset folder deleted | asset | After deletion |

### 9. Configuration & Settings Events

| Action | Description | Resource Type | When Logged |
|--------|-------------|---------------|-------------|
| `organization_settings_updated` | Org settings changed | organization | After update |
| `module_enabled` | Integration module enabled | module | On enable |
| `module_disabled` | Integration module disabled | module | On disable |
| `module_configured` | Module configuration updated | module | On config change |
| `feature_flag_toggled` | Feature flag changed | feature_flag | On toggle |
| `security_policy_updated` | Security policy modified | security | On policy update |
| `api_key_created` | API key generated | api_key | On creation |
| `api_key_revoked` | API key revoked/deleted | api_key | On revocation |

### 10. Developer Console Events

| Action | Description | Resource Type | When Logged |
|--------|-------------|---------------|-------------|
| `console_command_executed` | CLI command run in console | developer_console | Per command |

### 11. Automation & Lifecycle Events

| Action | Description | Resource Type | When Logged |
|--------|-------------|---------------|-------------|
| `onboarding_started` | User onboarding initiated | onboarding | On start |
| `onboarding_completed` | User onboarding finished | onboarding | On completion |
| `onboarding_task_completed` | Onboarding task done | onboarding | Per task |
| `offboarding_started` | User offboarding initiated | offboarding | On start |
| `offboarding_completed` | User offboarding finished | offboarding | On completion |
| `scheduled_action_executed` | Scheduled task ran | automation | Per execution |
| `scheduled_action_failed` | Scheduled task failed | automation | On failure |

### 12. Bulk Operations Events

| Action | Description | Resource Type | When Logged |
|--------|-------------|---------------|-------------|
| `bulk_operation_started` | Bulk operation initiated | bulk_operation | On start |
| `bulk_operation_completed` | Bulk operation finished | bulk_operation | On completion |
| `bulk_operation_failed` | Bulk operation failed | bulk_operation | On failure |

### 13. Vendor/External Access Events

| Action | Description | Resource Type | When Logged |
|--------|-------------|---------------|-------------|
| `vendor_session_started` | Vendor admin session began | vendor_access | On session start |
| `vendor_session_ended` | Vendor admin session ended | vendor_access | On session end |
| `vendor_action_performed` | Vendor performed admin action | vendor_access | Per action |

## Event Metadata

Each audit log entry should include:

### Standard Fields
- `id` - Unique event ID (UUID)
- `organization_id` - Organization context
- `created_at` - Timestamp (ISO 8601)
- `action` - Event action name
- `resource_type` - Type of resource affected
- `resource_id` - ID of affected resource
- `description` - Human-readable description
- `result` - `success`, `failure`, or `denied`
- `ip_address` - Source IP
- `user_agent` - Browser/client info

### Actor Attribution Fields
- `actor_id` - User who performed action
- `actor_type` - `internal`, `service`, or `vendor`
- `api_key_id` - If action via API key
- `api_key_name` - API key display name
- `vendor_name` - MSP/vendor organization name
- `vendor_technician_name` - Technician name
- `vendor_technician_email` - Technician email
- `ticket_reference` - Support ticket ID
- `service_name` - If system/background service

## Retention Policy

| Log Type | Retention Period | Reason |
|----------|------------------|--------|
| Security events (login, password) | 2 years | Compliance |
| User management | 1 year | Audit trail |
| Configuration changes | 2 years | Change tracking |
| API/Proxy access | 90 days | Performance |
| Console commands | 90 days | Debugging |

## Compliance Requirements

These audit logs support compliance with:
- **SOC 2** - Access control and monitoring
- **GDPR** - Data access tracking
- **HIPAA** - Access audit trails
- **ISO 27001** - Information security events

## Implementation Priority

### Phase 1 (Critical - Must Have)
- Authentication events
- User management events
- Configuration changes
- API key events

### Phase 2 (Important)
- Google/Microsoft integration events
- Signature management events
- Bulk operations events

### Phase 3 (Nice to Have)
- Asset management events
- Detailed sync events
- Vendor access tracking
