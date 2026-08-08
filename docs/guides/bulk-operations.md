# Bulk Operations User Guide

This guide explains how to use the Bulk Operations feature in Helios to perform mass updates on users, groups, and organizational data.

## Overview

Bulk Operations allows administrators to:
- Update multiple users at once via CSV import
- Create new users in bulk
- Suspend users in bulk
- Add/remove users to/from groups
- Track operation progress in real-time
- Save operation templates for reuse

## Getting Started

### Accessing Bulk Operations

1. Log in to Helios as an administrator
2. Navigate to **Admin Console** > **Bulk Operations**
3. You'll see the main bulk operations dashboard

### Connection Status

The dashboard shows a connection status indicator:
- **Real-time** (green): WebSocket connected for live updates
- **Polling** (yellow): Fallback to periodic polling

## CSV File Format

### General Requirements

- File format: CSV (comma-separated values)
- Encoding: UTF-8 recommended
- First row: Column headers (required)
- Max file size: 10MB
- Max rows: 10,000 per operation

### User Update CSV Format

```csv
email,firstName,lastName,department,jobTitle,organizationalUnit
john.doe@company.com,John,Doe,Engineering,Senior Developer,/Engineering/Backend
jane.smith@company.com,Jane,Smith,Marketing,Marketing Manager,/Marketing
```

**Required columns:**
- `email` - User's email address (must exist in system)

**Optional columns:**
- `firstName` - First name
- `lastName` - Last name
- `department` - Department name
- `jobTitle` - Job title
- `organizationalUnit` - OU path (Google Workspace format)

### User Create CSV Format

```csv
email,firstName,lastName,password,department,jobTitle
newuser1@company.com,New,User1,TempPass123!,Engineering,Developer
newuser2@company.com,New,User2,TempPass456!,Sales,Sales Rep
```

**Required columns:**
- `email` - New user's email address
- `firstName` - First name
- `lastName` - Last name
- `password` - Initial password (minimum 8 characters)

**Optional columns:**
- `department` - Department name
- `jobTitle` - Job title
- `organizationalUnit` - OU path

### User Suspend CSV Format

```csv
email
user1@company.com
user2@company.com
user3@company.com
```

**Required columns:**
- `email` - Email of user to suspend

### Group Membership Add/Remove CSV Format

```csv
userEmail,groupName
john.doe@company.com,Engineering Team
jane.smith@company.com,Marketing Team
john.doe@company.com,Project Alpha
```

Alternative format using IDs:
```csv
userId,groupId
123e4567-e89b-12d3-a456-426614174000,789e4567-e89b-12d3-a456-426614174001
```

**Required columns:**
- `userEmail` or `userId` - User identifier
- `groupName` or `groupId` - Group identifier

## Step-by-Step Guide

### 1. Select Operation Type

Choose the type of bulk operation from the dropdown:
- **Update Users** - Modify existing user fields
- **Create Users** - Add new users to the system
- **Suspend Users** - Suspend multiple user accounts
- **Add to Groups** - Add users to groups
- **Remove from Groups** - Remove users from groups

### 2. Download Template (Optional)

Click **Download Template** to get a CSV template with the correct column headers for your selected operation.

### 3. Upload CSV File

Two ways to upload:
1. Click the upload area and select your file
2. Drag and drop the CSV file onto the upload area

### 4. Validate CSV

Click **Validate CSV** to check your file for errors. The system will:
- Verify column headers
- Check for missing required fields
- Validate email formats
- Check for duplicate entries

If errors are found, you'll see a list of issues to fix.

### 5. Preview Changes

After successful validation, click **Preview Changes** to see:
- All rows that will be processed
- Current vs. new values for updates
- Pagination for large datasets

### 6. Edit Data (Optional)

In the bulk editor grid, you can:
- **Select rows** - Click checkbox to select individual rows
- **Select all** - Click header checkbox to select all on current page
- **Edit cells** - Double-click any cell to edit its value
- **Delete rows** - Select rows and click "Delete selected"
- **Apply edits** - Click "Apply" to save pending changes

### 7. Execute Operation

Click **Execute Operation** to start processing. You'll see:
- Real-time progress bar
- Success/failure counts
- Processing status

### 8. Download Results

After completion, click **Download Results** to get a CSV with:
- Original row data
- Success/failure status
- Error messages (if any)

## Using Templates

### Save as Template

1. After validating a CSV, click **Save as Template**
2. Enter a template name and optional description
3. Click **Save Template**

Templates save:
- Operation type
- CSV structure
- Sample data (for reference)

### Load Template

1. Click **Load Template**
2. Select from your saved templates
3. The operation type and data structure will be pre-filled

### Delete Template

In the templates list, click the trash icon to delete a template.

## Bulk Editor Grid

The bulk editor provides a spreadsheet-like interface for reviewing and modifying data.

### Selection

| Action | How to |
|--------|--------|
| Select single row | Click row checkbox |
| Select all on page | Click header checkbox |
| Select all data | Click "Select all N" in toolbar |
| Clear selection | Click "Clear selection" in toolbar |

### Inline Editing

1. Double-click any cell to enter edit mode
2. Type your changes
3. Press **Enter** to save, **Escape** to cancel
4. Edited cells show with a yellow background
5. Click **Apply** in the header to commit all changes

### Pagination

- Choose rows per page: 10, 25, 50, or 100
- Use navigation arrows to move between pages
- Current position shown: "Showing X - Y of Z items"

## Operation History

The dashboard shows your recent bulk operations:
- Operation type and date
- Total items processed
- Success/failure counts
- Status (completed, failed, processing)

## Best Practices

### Before Running Bulk Operations

1. **Test with small batches first** - Start with 5-10 records
2. **Backup data** - Ensure you have a way to revert changes
3. **Validate carefully** - Review all validation errors
4. **Use templates** - Save working configurations for reuse

### Data Quality

1. **Use consistent formatting** - Especially for departments and OUs
2. **Remove duplicates** - Check for duplicate email addresses
3. **Verify email addresses** - Ensure all emails are valid
4. **Use master data values** - Match departments to existing master data

### Performance

1. **Batch large operations** - Split 1000+ records into smaller batches
2. **Schedule off-peak** - Run large operations during low-usage times
3. **Monitor progress** - Keep the page open to track status

## Troubleshooting

### Common Validation Errors

| Error | Cause | Solution |
|-------|-------|----------|
| Missing required field | Column header missing or empty value | Add column or fill in values |
| Invalid email format | Email doesn't match pattern | Fix email format (user@domain.com) |
| User not found | Email doesn't exist in system | For updates, user must exist first |
| Duplicate entry | Same email appears multiple times | Remove duplicate rows |

### Operation Failures

| Error | Cause | Solution |
|-------|-------|----------|
| Permission denied | User lacks admin rights | Contact administrator |
| Rate limit exceeded | Too many API calls | Wait and retry, or use smaller batch |
| Invalid password | Password doesn't meet requirements | Use stronger password |
| Group not found | Group doesn't exist | Create group first or check name |

### Connection Issues

If you see "Polling" status:
1. Check your network connection
2. Try refreshing the page
3. Clear browser cache and cookies

## FAQ

**Q: Can I cancel a running operation?**
A: Currently, operations cannot be cancelled once started. Use small batches to minimize impact.

**Q: How long do operations take?**
A: Processing time depends on the number of items. Expect ~100 items per minute for user operations.

**Q: Are operations atomic?**
A: Each row is processed independently. If one row fails, others continue processing.

**Q: Can I undo a bulk operation?**
A: Currently, there's no automatic undo. Save a backup CSV before running operations.

**Q: What happens if I close the browser?**
A: Operations continue server-side. Return to see the final status in operation history.

## Support

For additional help:
- Check the API documentation at `/docs/api/bulk-operations.md`
- Contact your system administrator
- Review the operation history for error details
