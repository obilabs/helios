# Bulk Operations - User Guide

## Overview

The Bulk Operations feature allows administrators to perform mass updates on users and groups using CSV imports. This dramatically reduces the time required for common administrative tasks like onboarding, department transfers, and quarterly updates.

**Time Savings:**
- User creation: 5 min/user → 30 sec/user
- Department transfers: 2 hours → 10 minutes
- Quarterly role updates: 8 hours → 1 hour

## Quick Start

### 1. Access Bulk Operations
Navigate to **Automation → Bulk Operations** in the sidebar.

### 2. Choose Operation Type
Select from available operations:
- **Update Users** - Modify existing user fields
- **Create Users** - Add new users in bulk
- **Suspend Users** - Suspend multiple accounts
- **Add to Groups** - Add users to groups
- **Remove from Groups** - Remove users from groups

### 3. Download Template
Click "Download Template" to get a CSV template with the correct format for your chosen operation.

### 4. Fill Out CSV
Open the template in Excel/Google Sheets and fill in your data.

### 5. Upload & Validate
Upload your CSV. The system will validate all data and show any errors.

### 6. Review & Execute
Review the validation results, then click "Execute Operation" to process.

### 7. Monitor Progress
Watch real-time progress updates. Download the results report when complete.

## CSV Format Reference

### User Update CSV

```csv
email,firstName,lastName,department,title,organizationalUnit
john.doe@company.com,John,Doe,Engineering,Senior Developer,/Engineering
jane.smith@company.com,Jane,Smith,Marketing,Marketing Manager,/Marketing
```

**Required Fields:**
- `email` - User's email address (must exist)

**Optional Fields:**
- `firstName` - Given name
- `lastName` - Surname
- `department` - Department name
- `title` - Job title
- `organizationalUnit` - Org unit path (e.g., /Engineering/Backend)
- `manager` - Manager's email address

### User Creation CSV

```csv
email,firstName,lastName,password,department,title,organizationalUnit
newuser@company.com,New,User,TempPass123!,Engineering,Developer,/Engineering
```

**Required Fields:**
- `email` - User's email address (must be unique)
- `firstName` - Given name
- `lastName` - Surname
- `password` - Temporary password (8+ characters)

**Optional Fields:**
- `department` - Department name
- `title` - Job title
- `organizationalUnit` - Org unit path
- `manager` - Manager's email address

### User Suspension CSV

```csv
email
offboarding@company.com
terminated@company.com
```

**Required Fields:**
- `email` - User's email address to suspend

### Group Membership Add CSV

```csv
groupEmail,userEmail
engineering-team@company.com,john.doe@company.com
marketing-team@company.com,jane.smith@company.com
```

**Required Fields:**
- `groupEmail` - Email of the group
- `userEmail` - Email of user to add

### Group Membership Remove CSV

```csv
groupEmail,userEmail
old-team@company.com,transferred.user@company.com
```

**Required Fields:**
- `groupEmail` - Email of the group
- `userEmail` - Email of user to remove

## Validation Rules

### Email Validation
- Must be valid email format
- Domain must match organization domain
- For updates: user must exist
- For creation: email must be unique

### Password Requirements
- Minimum 8 characters
- Must contain uppercase and lowercase
- Must contain at least one number
- Must contain special character

### Organizational Unit
- Must start with `/`
- Must exist in Google Workspace
- Case-sensitive

### Department/Title
- Maximum 100 characters
- No special characters except hyphens and spaces

## Common Workflows

### New Hire Onboarding

**CSV Format:**
```csv
email,firstName,lastName,password,department,title,organizationalUnit,manager
newhire1@company.com,Alice,Johnson,Welcome123!,Engineering,Software Engineer,/Engineering,manager@company.com
newhire2@company.com,Bob,Williams,Welcome123!,Marketing,Marketing Coordinator,/Marketing,director@company.com
```

**Steps:**
1. Select "Create Users"
2. Download template
3. Fill in new hire information
4. Upload CSV
5. Execute operation
6. Separately add users to default groups using "Add to Groups"

### Department Transfer

**CSV Format:**
```csv
email,department,organizationalUnit,manager
transfer1@company.com,Sales,/Sales,sales-manager@company.com
transfer2@company.com,Support,/Support,support-lead@company.com
```

**Steps:**
1. Select "Update Users"
2. Download template
3. List users being transferred with new department/OU/manager
4. Upload and execute

### Quarterly Role Updates

**CSV Format:**
```csv
email,title
promoted1@company.com,Senior Software Engineer
promoted2@company.com,Engineering Manager
```

**Steps:**
1. Select "Update Users"
2. Download template
3. List users with new titles
4. Leave other fields empty (they won't be changed)
5. Upload and execute

## Error Handling

### Validation Errors

If validation fails, you'll see a detailed error report:

```
Row 5, Column: email
Error: Email format is invalid

Row 12, Column: organizationalUnit
Error: Organizational unit '/Enginering' does not exist. Did you mean '/Engineering'?
```

**Fix and Re-upload:**
1. Download the error report
2. Fix issues in your CSV
3. Re-upload the corrected file

### Processing Errors

If errors occur during processing:
- Operation will continue for remaining items
- Failed items are logged with detailed errors
- You can download an error report
- Retry failed items by uploading just those rows

## Best Practices

### 1. Start Small
- Test with 5-10 users first
- Verify results before processing hundreds

### 2. Keep Backups
- Export current user data before bulk updates
- Save your CSV files for audit trail

### 3. Use Consistent Formatting
- Don't mix uppercase/lowercase in OUs
- Use standard date formats
- Trim whitespace from cells

### 4. Validate Externally First
- Check emails are correct
- Verify managers exist
- Confirm OUs are spelled correctly

### 5. Schedule During Low-Traffic Hours
- Large operations during off-peak times
- Avoid bulk operations during critical business hours

## Limitations

### Current Constraints
- Maximum 10MB CSV file size
- Maximum 10,000 rows per operation
- Processing rate: ~10 users per second
- Google API rate limit: 1500 requests/minute

### Not Currently Supported
- Batch email/Drive operations
- Photo uploads via CSV
- Custom schema field updates
- Scheduled/recurring operations
- Multi-step workflows

## Troubleshooting

### "CSV validation failed"
- Check your CSV format matches the template exactly
- Ensure no extra columns or headers
- Verify encoding is UTF-8
- Check for special characters

### "User not found"
- Email address doesn't exist in system
- Check for typos
- Verify domain is correct

### "Organizational unit not found"
- OU path must match exactly (case-sensitive)
- Must include leading `/`
- OU must exist in Google Workspace

### "Operation is taking too long"
- Large operations (500+ users) can take 10-15 minutes
- Progress updates every 10 items
- Browser can be closed - operation continues in background
- Check operation history for status

### "Some items failed"
- Download the error report
- Fix failed items
- Re-upload just the failed rows
- Common causes: rate limits, validation errors, network issues

## API Reference

### Upload CSV
```
POST /api/bulk/upload
Content-Type: multipart/form-data

{
  file: <CSV file>,
  operationType: "user_update" | "user_create" | "user_suspend" | "group_membership_add" | "group_membership_remove"
}
```

### Execute Operation
```
POST /api/bulk/execute
Content-Type: application/json

{
  operationType: "user_update",
  items: [...validated data...],
  operationName: "Quarterly Title Updates"
}
```

### Check Status
```
GET /api/bulk/status/:bulkOperationId
```

### Get History
```
GET /api/bulk/history?limit=50
```

### Download Template
```
GET /api/bulk/template/:operationType
```

## Security & Compliance

### Authorization
- Only administrators can access bulk operations
- All operations are logged with user ID and IP address
- Operation history retained for 90 days

### Data Protection
- CSV uploads are validated and sanitized
- Sensitive data encrypted in transit (HTTPS)
- Passwords are hashed before storage
- No plaintext passwords in logs

### Audit Trail
Every bulk operation records:
- Who initiated the operation
- When it was executed
- What data was changed
- Results (success/failure for each item)
- IP address and user agent

Access audit logs:
1. Go to Settings → Security → Audit Logs
2. Filter by "Bulk Operations"
3. Export for compliance reporting

## Support

### Getting Help
- **Documentation:** [Helios Admin Portal Docs](https://helios.gridworx.io/docs)
- **Support:** [Submit a ticket](https://helios.gridworx.io/support)
- **Community:** [Helios Community Forum](https://community.helios.gridworx.io)

### Reporting Issues
Include in your support ticket:
- Operation type
- CSV file (remove sensitive data)
- Error messages
- Bulk operation ID from history
- Screenshots of the issue

## Future Enhancements

Coming in future releases:
- 📋 **Operation Templates** - Save and reuse common workflows
- 👥 **User Cloning** - Clone existing users as templates
- 🗺️ **Column Mapping** - Map custom CSV columns to system fields
- 👁️ **Preview Mode** - See exact changes before execution
- 📊 **Advanced Reporting** - Detailed analytics and insights
- 🔄 **Scheduled Operations** - Recurring bulk operations
- 🎛️ **Workflow Builder** - Create multi-step automations
- ✅ **Approval Workflow** - Require approval for sensitive operations
- ⏮️ **Rollback** - Undo completed operations

## Examples

### Example 1: Onboard 50 New Hires

**Scenario:** New department opening with 50 employees starting Monday.

**Steps:**
1. HR provides employee roster in Excel
2. Download "Create Users" template
3. Copy data from HR roster to template
4. Set temporary password: `Welcome2025!`
5. Set department: "Customer Success"
6. Set OU: `/Customer Success`
7. Upload CSV (validates all 50 users)
8. Execute operation (takes ~5 minutes)
9. Download results report
10. Email credentials to managers

**Time Saved:** 4 hours → 15 minutes

### Example 2: Quarterly Title Updates

**Scenario:** 75 employees received promotions/title changes.

**Steps:**
1. Get list of changes from HR
2. Download "Update Users" template
3. Fill in email + new title only
4. Leave other columns empty
5. Upload and execute
6. Email confirmation to HR

**Time Saved:** 2 hours → 10 minutes

### Example 3: Department Reorganization

**Scenario:** Engineering split into "Backend" and "Frontend" teams.

**Steps:**
1. Export current engineers
2. Manually categorize into teams
3. Create two CSVs (one per team)
4. Update department and OU for each
5. Execute both operations
6. Update group memberships separately

**Time Saved:** 8 hours → 30 minutes

## Glossary

- **Bulk Operation** - A mass update affecting multiple users/groups
- **CSV** - Comma-Separated Values file format
- **Organizational Unit (OU)** - Structural grouping in Google Workspace
- **Template** - Pre-formatted CSV with correct headers
- **Validation** - Pre-flight check of data before execution
- **Progress Tracking** - Real-time updates during operation
- **Audit Trail** - Historical record of all changes
- **Batch Processing** - Processing items in small groups
- **Queue** - System for managing async operations
- **Worker** - Background process executing operations

---

**Version:** 1.0.0 (Phase 1 - Core Infrastructure)
**Last Updated:** October 26, 2025
**Status:** Production Ready (MVP)
