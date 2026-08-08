# Dynamic Groups User Guide

Dynamic groups automatically manage membership based on rules you define. Instead of manually adding and removing users, you set criteria like "all users in Engineering" or "everyone reporting to Sarah," and Helios keeps the membership up to date.

## Table of Contents

1. [Understanding Dynamic Groups](#understanding-dynamic-groups)
2. [Creating a Dynamic Group](#creating-a-dynamic-group)
3. [Writing Rules](#writing-rules)
4. [Rule Examples](#rule-examples)
5. [Testing Rules](#testing-rules)
6. [Syncing with Google Workspace](#syncing-with-google-workspace)
7. [Troubleshooting](#troubleshooting)

---

## Understanding Dynamic Groups

### Static vs Dynamic Groups

| Feature | Static Group | Dynamic Group |
|---------|--------------|---------------|
| Membership | Manually added/removed | Automatically calculated |
| Updates | Requires admin action | Updates based on rules |
| Use case | Small, specific groups | Large, criteria-based groups |

### How Dynamic Groups Work

1. You define one or more rules (e.g., "department equals Engineering")
2. Helios evaluates these rules against all users
3. Users matching the rules are automatically added to the group
4. Users no longer matching are automatically removed
5. Rules can be re-evaluated on a schedule or manually triggered

---

## Creating a Dynamic Group

### From an Existing Group

1. Navigate to **Directory > Groups**
2. Click on any group to open the slideout panel
3. Go to the **Settings** tab
4. Under "Membership Type," select **Dynamic**
5. Choose your rule logic:
   - **Match ALL rules (AND)**: Users must match every rule
   - **Match ANY rule (OR)**: Users must match at least one rule
6. Click **Save Changes**

### Creating a New Dynamic Group

1. Navigate to **Directory > Groups**
2. Click **Create Group**
3. Enter the group name and description
4. After creating, open the group and follow the steps above to enable dynamic membership

---

## Writing Rules

### Rule Structure

Each rule has three main components:

1. **Field**: The user attribute to check (e.g., department, location)
2. **Operator**: How to compare (e.g., equals, contains)
3. **Value**: What to compare against (e.g., "Engineering")

### Available Fields

| Field | Description | Example |
|-------|-------------|---------|
| Department | User's department | "Engineering" |
| Location | User's office location | "San Francisco" |
| Job Title | User's job title | "Software Engineer" |
| Reports To | User's manager | "sarah@company.com" |
| Organizational Unit | Google Workspace OU path | "/Engineering/Platform" |
| Employee Type | Employment classification | "full_time" |
| Cost Center | Financial cost center | "CC-1234" |
| Email | User's email address | "dev-*@company.com" |

### Available Operators

| Operator | Use For | Example |
|----------|---------|---------|
| equals | Exact match | Department equals "Sales" |
| not equals | Exclusion | Department not equals "HR" |
| contains | Partial match | Job Title contains "Engineer" |
| starts with | Prefix matching | Email starts with "dev-" |
| ends with | Suffix matching | Email ends with "@contractors.com" |
| in list | Multiple values | Department in list "Sales, Marketing" |
| is empty | Missing values | Manager is empty |
| is not empty | Has a value | Department is not empty |
| is under | Hierarchy match | Department is under "Engineering" |
| regex | Pattern matching | Job Title regex "^(Senior\|Lead)" |

### Rule Options

- **Case Sensitive**: When enabled, "engineering" won't match "Engineering"
- **Include Nested**: For hierarchical fields, includes all levels below the specified value

---

## Rule Examples

### Basic Examples

**All Engineers**
```
Field: Department
Operator: equals
Value: Engineering
```

**Everyone in Multiple Departments**
```
Field: Department
Operator: in list
Value: Engineering, Product, Design
```

**Exclude Contractors**
```
Field: Employee Type
Operator: not equals
Value: contractor
```

### Hierarchical Examples

**All of Engineering (Including Sub-departments)**

This matches Engineering and all sub-departments like "Engineering > Platform" and "Engineering > Mobile":
```
Field: Department
Operator: is under
Value: Engineering
Options: Include Nested = Yes
```

**Everyone Reporting to Sarah (Direct and Indirect)**

This matches everyone in Sarah's reporting chain:
```
Field: Reports To
Operator: equals
Value: sarah@company.com
Options: Include Nested = Yes
```

### Advanced Examples

**Senior Engineers**
```
Field: Job Title
Operator: regex
Value: ^(Senior|Lead|Principal).*Engineer
```

**US Office Employees**
```
Field: Location
Operator: in list
Value: New York, San Francisco, Austin, Seattle
```

**Users Without a Manager**
```
Field: Reports To
Operator: is empty
```

### Combining Rules

**AND Logic Example: Senior Engineers in San Francisco**

Set Rule Logic to "Match ALL rules (AND)", then add:
```
Rule 1:
  Field: Job Title
  Operator: contains
  Value: Senior

Rule 2:
  Field: Location
  Operator: equals
  Value: San Francisco
```
Result: Only users who are BOTH senior AND in San Francisco

**OR Logic Example: Engineering OR Product Teams**

Set Rule Logic to "Match ANY rule (OR)", then add:
```
Rule 1:
  Field: Department
  Operator: equals
  Value: Engineering

Rule 2:
  Field: Department
  Operator: equals
  Value: Product
```
Result: Users in Engineering OR Product (or both)

---

## Testing Rules

Before applying rules to update membership, always test them first.

### Preview Matching Users

1. Open the group and go to the **Rules** tab
2. Add or modify your rules
3. Click the **Preview** button
4. Review the matching users count and list
5. Verify the results are what you expect

### What to Check

- Is the user count reasonable?
- Are expected users included?
- Are any unexpected users included?
- Are any expected users missing?

### Applying Rules

Once satisfied with the preview:

1. Click **Apply Rules**
2. Review the changes summary:
   - Users to be added
   - Users to be removed
   - Users unchanged
3. Confirm the changes

---

## Syncing with Google Workspace

Dynamic groups can be synced to Google Workspace, keeping Google Groups membership in sync with your rules.

### Enabling Sync

1. Open the group and go to the **Sync** tab
2. Toggle **Sync to Google Workspace** to ON
3. Choose a sync direction:
   - **Push**: Helios rules determine membership, pushed to Google
   - **Pull**: Google membership is imported to Helios
   - **Bidirectional**: Members from both systems are combined

### Manual Sync

Click **Sync Now** to immediately synchronize the group.

### Automatic Sync

Set a refresh interval (in minutes) to automatically re-evaluate rules and sync:
- 0 = Manual sync only
- 60 = Hourly
- 1440 = Daily

### Sync Status

The Sync tab shows:
- Last sync time
- Helios member count
- Google member count
- Any sync errors

---

## Troubleshooting

### Users Not Being Added

**Check rule criteria:**
- Is the field spelled correctly?
- Is case sensitivity causing issues?
- For hierarchical rules, is "Include Nested" enabled?

**Check user data:**
- Does the user have the expected value in that field?
- Is the user marked as active?

**Preview the rules:**
- Use the Preview feature to see who matches
- Check if the user appears in the results

### Users Not Being Removed

**Check membership source:**
- Users added manually aren't removed by rules
- Only "dynamic" membership is controlled by rules

**Check rule logic:**
- With OR logic, a user matching ANY rule stays in
- Remove or modify rules that might still match

### Google Workspace Sync Issues

**"User not found in domain":**
- The user's email doesn't exist in Google Workspace
- Check if the email is correct

**"Unauthorized" errors:**
- Service account may not have proper permissions
- Check domain-wide delegation settings

**Sync not happening:**
- Verify the group has an external ID
- Check that sync is enabled
- Try a manual sync to see error details

### Performance Issues

**Rule evaluation slow:**
- Reduce the number of rules
- Use more specific operators (equals vs regex)
- Consider breaking into smaller groups

**Too many members:**
- Add more restrictive rules
- Use AND logic to narrow results

---

## Best Practices

1. **Start with Preview**: Always preview before applying rules
2. **Use Specific Rules**: More specific rules perform better
3. **Test Incrementally**: Add one rule at a time and verify
4. **Document Purpose**: Use the group description to explain the criteria
5. **Regular Reviews**: Periodically check that groups still match intended membership
6. **Avoid Complex Regex**: Simple operators are faster and clearer
7. **Set Appropriate Refresh**: Balance freshness vs. system load

---

## FAQ

**Q: Can I convert a static group to dynamic?**
A: Yes, change the membership type in Settings. Existing members remain; rules add/remove going forward.

**Q: What happens when I convert dynamic to static?**
A: Current members stay, but rules are no longer evaluated. Members won't be automatically added or removed.

**Q: Do dynamic rules affect Google Workspace immediately?**
A: Only if sync is enabled. After rules are applied, click Sync Now or wait for the automatic sync interval.

**Q: Can I have some members added manually in a dynamic group?**
A: Yes. Manually-added members are marked differently and won't be removed when rules are applied.

**Q: How often are rules automatically evaluated?**
A: Based on the refresh interval you set (or never if set to 0). You can always trigger a manual evaluation.

**Q: Is there a limit to how many rules I can have?**
A: No hard limit, but more rules mean slower evaluation. Keep it under 10 rules for best performance.
