# CLI Authentication & File Storage - Architectural Decisions

**Date:** 2025-11-07
**Status:** Research Complete - Decisions Made

---

## Your Questions Answered

### Q1: "Do all Google and O365 APIs work from our CLI without user-specific authentication?"

**Answer: YES - But with important security implications** ✅⚠️

#### Google Workspace (Service Account with Domain-Wide Delegation)

**What Works:**
- ✅ **Admin SDK**: User/group/OU management (must impersonate admin user)
- ✅ **Gmail API**: Can read ANY user's email in the organization
- ✅ **Drive API**: Can access ANY user's files
- ✅ **Calendar API**: Can manage ANY user's calendar
- ✅ **All other Workspace APIs**: Full access via impersonation

**How It Works:**
```typescript
// Service account impersonates admin user for Admin SDK operations
const auth = new GoogleAuth({
  credentials: serviceAccountKey,
  scopes: ['https://www.googleapis.com/auth/admin.directory.user'],
  subject: 'admin@company.com'  // Impersonate admin
});

// Service account impersonates any user for their data
const auth = new GoogleAuth({
  credentials: serviceAccountKey,
  scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
  subject: 'john@company.com'  // Can read John's email!
});
```

**Security Implications:**
- ⚠️ **Service account can access ALL user data** within granted scopes
- ⚠️ **No per-user restrictions** - Domain-wide delegation is all-or-nothing
- ⚠️ **Admin must understand the risk** - Granting `gmail.readonly` means service account can read EVERY user's email
- ✅ **Only works within organization** - Cannot access personal Gmail accounts

#### Microsoft 365 (Application Permissions)

**What Works:**
- ✅ **Microsoft Graph**: All user/group/mail/calendar/file operations
- ✅ **Tenant-wide access**: Can access ANY resource in organization
- ✅ **Exchange**: Mail, calendars, contacts for all users
- ✅ **OneDrive/SharePoint**: All files in entire organization
- ✅ **Teams**: All teams and channels

**How It Works:**
```typescript
// Application permission grants tenant-wide access
const credential = new ClientCredentialAuthProvider({
  clientId: appId,
  clientSecret: appSecret,
  tenantId: tenantId
});

// Can now access ANY user's mailbox
await graphClient.api('/users/john@company.com/messages').get();

// Can access ANY user's OneDrive
await graphClient.api('/users/john@company.com/drive/root/children').get();
```

**Security Implications:**
- ⚠️ **Application has tenant-wide access** by default
- ⚠️ **Very limited scoping** - Only Exchange supports Application Access Policies
- ⚠️ **OneDrive/SharePoint/Teams cannot be scoped** to specific users
- ✅ **Only works within tenant** - Cannot access external organizations

#### Summary Table

| Platform | All APIs Work? | User Auth Needed? | Security Concern |
|----------|---------------|-------------------|------------------|
| **Google Workspace** | ✅ YES | ❌ NO | ⚠️ Domain-wide access to all user data |
| **Microsoft 365** | ✅ YES | ❌ NO | ⚠️ Tenant-wide access to all user data |

**Bottom Line:**
- ✅ **You can call ANY API** without per-user authentication
- ⚠️ **BUT you're granting access to ALL user data** in your organization
- 📋 **Document this clearly** in your setup wizard
- 🔒 **Implement audit logging** for all API operations

---

### Q2: "If user pipes to file, where do we get that file?"

**Answer: We DON'T have piping - this is a browser console, not a real terminal** ❌

#### The Constraint

**Real terminal:**
```bash
gam print users > users.csv     # ✅ Works - writes to filesystem
aws s3 ls > buckets.txt         # ✅ Works - writes to local file
```

**Browser console:**
```bash
helios export users > users.csv  # ❌ Doesn't work - no filesystem access
helios export users | grep mike  # ❌ Doesn't work - no pipes
```

**Why?**
- Browser sandbox prevents direct filesystem access
- JavaScript has no concept of stdin/stdout/stderr
- No shell to handle pipe operators (`|`, `>`, `>>`)

#### What We Actually Have

**Current Implementation:**
```bash
helios> gw users get mike@company.com --format=json --download
```

This triggers:
```typescript
// Creates blob in browser memory
const blob = new Blob([json], { type: 'application/json' });

// Triggers browser download dialog
const link = document.createElement('a');
link.href = URL.createObjectURL(blob);
link.download = 'user-mike.json';
link.click();  // Browser shows "Save As" dialog
```

**Where does the file go?**
- 📁 **User's browser download folder** (typically `~/Downloads`)
- 🖱️ **User chooses location** in browser's "Save As" dialog
- 💻 **On user's machine** - never touches server

#### The Problem With This Approach

**Works great for:**
- ✅ Small files (<1MB)
- ✅ One-off exports
- ✅ Security-conscious scenarios (data never hits server)

**Breaks down for:**
- ❌ Large files (>100MB) - browser memory limits
- ❌ Automated workflows - no way to script it
- ❌ Long-running exports - browser tab must stay open
- ❌ Sharing results - user must manually send file

---

### Q3: "Should each user have their own storage area or admin storage area?"

**Answer: Organization-wide storage with per-user ownership tracking** 🎯

#### Recommended Architecture

**Storage Model:**
```
Organization Storage (shared)
  ├── User A's exports (only User A can see)
  ├── User B's exports (only User B can see)
  ├── User C's exports (only User C can see)
  └── Shared exports (all admins can see)
```

**Database Schema:**
```sql
CREATE TABLE exported_files (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,     -- Which organization
  user_id UUID,                      -- Who created it (NULL = shared)
  filename VARCHAR(255),
  file_path VARCHAR(500),
  file_size_bytes BIGINT,
  export_type VARCHAR(50),           -- 'users', 'groups', 'audit_logs'
  is_shared BOOLEAN DEFAULT FALSE,   -- Visible to all org admins?
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,     -- Auto-delete after 7 days
  download_count INT DEFAULT 0
);
```

**Access Control:**
```typescript
// User can only see their own exports + shared exports
const exports = await db.query(`
  SELECT * FROM exported_files
  WHERE organization_id = $1
    AND (user_id = $2 OR is_shared = TRUE)
    AND expires_at > NOW()
  ORDER BY created_at DESC
`, [organizationId, userId]);
```

#### Why This Approach?

**Pros:**
- ✅ **GDPR compliant** - Clear ownership per user
- ✅ **Privacy-friendly** - Users can't see each other's exports by default
- ✅ **Collaboration option** - Can mark exports as shared
- ✅ **Audit trail** - Know who exported what
- ✅ **Efficient** - Shared exports deduplicated

**Cons:**
- ⚠️ **More complex** than simple file storage
- ⚠️ **Requires permissions system**
- ⚠️ **Cleanup is trickier** (what happens when user deleted?)

**Alternative (Simple but less secure):**
- All exports visible to all admins in organization
- No per-user privacy
- Simpler to implement
- Not GDPR-friendly

#### Storage Location on Server

**File Structure:**
```
/var/helios/exports/
  ├── {organization_id}/
  │   ├── {year}/
  │   │   ├── {month}/
  │   │   │   ├── users-export-2025-11-07-abc123.csv
  │   │   │   ├── audit-log-2025-11-07-xyz789.json
  │   │   │   ├── groups-export-2025-11-07-def456.csv
```

**Why organize by org/year/month?**
- ✅ **Performance** - Avoids massive directories (millions of files)
- ✅ **Easy cleanup** - Delete entire month folder when expired
- ✅ **Multi-tenant ready** - Each org isolated
- ✅ **Debugging** - Easy to find files by date

---

### Q4: "Piped file has download link or navigate to storage area?"

**Answer: BOTH - Download link immediately + persistent storage panel** 🎯

#### Recommended UX Flow

**Scenario 1: Small Export (<1MB)**
```
helios> export users --format csv

⏳ Exporting 145 users...
✅ Export complete (156 KB)
⬇️ Download started: users-export-2025-11-07.csv

💡 File saved to your browser's download folder
```

**No server storage needed** - instant browser download via Blob API.

---

**Scenario 2: Large Export (>1MB)**
```
helios> export users --format csv

⏳ Exporting 2,456 users...
✅ Export complete (2.3 MB)

📁 users-export-2025-11-07-abc123.csv
🔗 Download: Click here or use 'downloads get 1'
⏰ Expires: November 14, 2025 at 10:30 AM

💡 Tip: Use 'downloads list' to see all available files
```

**Server storage with:**
- ✅ Immediate download link (clickable in console)
- ✅ Also added to Downloads panel (persistent)
- ✅ 7-day retention
- ✅ Can re-download multiple times

---

**Scenario 3: Accessing Downloads Panel**
```
helios> downloads list

Recent Downloads:
┌────┬─────────────────────────────────────┬──────────┬─────────────┬───────────┐
│ ID │ Filename                            │ Size     │ Expires     │ Downloads │
├────┼─────────────────────────────────────┼──────────┼─────────────┼───────────┤
│ 1  │ users-export-2025-11-07-abc123.csv  │ 2.3 MB   │ in 7 days   │ 1         │
│ 2  │ audit-log-2025-11-06-xyz789.json    │ 4.1 MB   │ in 6 days   │ 3         │
│ 3  │ groups-export-2025-11-05-def456.csv │ 156 KB   │ in 5 days   │ 0         │
└────┴─────────────────────────────────────┴──────────┴─────────────┴───────────┘

💡 Use 'downloads get <ID>' to download a file

helios> downloads get 1
⬇️ Downloading users-export-2025-11-07-abc123.csv...
✅ Download started (check your browser's download folder)
```

---

**Scenario 4: UI Panel (In Addition to CLI)**

```
┌─ Developer Console ────────────────────────────────────────┐
│                                                             │
│  [Console] [Downloads] [History]                           │
│                                                             │
│  Downloads                                                  │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ 📄 users-export-2025-11-07-abc123.csv              │  │
│  │    2.3 MB • Created 2 hours ago • Expires in 7 days│  │
│  │    [⬇️ Download] [🗑️ Delete]                        │  │
│  │                                                      │  │
│  │ 📄 audit-log-2025-11-06-xyz789.json                │  │
│  │    4.1 MB • Created 1 day ago • Expires in 6 days  │  │
│  │    [⬇️ Download] [🗑️ Delete]                        │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Why Both Download Link AND Storage Panel?

**Download Link (Immediate):**
- ✅ **Instant gratification** - Click and download right away
- ✅ **Works in CLI** - No need to leave console
- ✅ **Copy-paste friendly** - Can share link with colleagues

**Storage Panel (Persistent):**
- ✅ **Don't lose files** - If user closes console, files still accessible
- ✅ **Re-download** - Lost the file? Download again
- ✅ **Browse exports** - See all exports across sessions
- ✅ **Manage storage** - Delete old files, see what's taking space

---

## Research Findings Summary

### File Storage in Admin CLIs (Industry Patterns)

| Tool | Where Files Go | Notes |
|------|---------------|-------|
| **AWS CLI** | User's local machine | User specifies path explicitly |
| **Azure CLI** | User's local machine | `--file` parameter required |
| **gcloud** | User's local machine | SCP-like syntax |
| **kubectl** | User's local machine | Pod to local copy |
| **GAM** | **Google Drive** | Uses `todrive` - cloud-first! |

**Key Insight:**
- 90% of tools = local filesystem
- GAM is unique = Google Drive integration
- Nobody uses server-side storage (except AWS S3 Console with presigned URLs)

**But we're different:**
- ❌ We're browser-based - no local filesystem access
- ✅ We have Google Workspace integration - can copy GAM pattern
- ✅ We can use server storage as intermediate step

---

## Recommended Implementation

### Phase 1: MVP (Now) ✅

**Use Blob API for everything:**
```typescript
// All exports use browser download
export function exportUsers(format: string) {
  const data = await fetchUsers();
  const content = format === 'csv' ? toCSV(data) : JSON.stringify(data);

  downloadBlob(content, `users-export.${format}`);
}
```

**Pros:**
- ✅ Works today - no infrastructure changes
- ✅ Zero storage costs
- ✅ Privacy-friendly - data never hits server

**Cons:**
- ❌ Limited to ~10MB files
- ❌ No download history
- ❌ Lost if browser crashes

---

### Phase 2: Server Storage (Next Sprint) 📋

**Add server-side storage for large files:**

```typescript
export async function exportUsers(format: string) {
  const data = await fetchUsers();
  const content = format === 'csv' ? toCSV(data) : JSON.stringify(data);

  // Decision logic based on size
  if (content.length < 1_000_000) {  // <1MB
    // Browser download
    downloadBlob(content, `users-export.${format}`);
  } else {
    // Server storage
    const fileId = await api.post('/api/exports', {
      data: content,
      filename: `users-export-${Date.now()}.${format}`
    });

    console.log(`📁 File saved to server storage`);
    console.log(`🔗 Download: /api/downloads/${fileId}`);
    console.log(`⏰ Expires: ${formatDate(Date.now() + 7 * 24 * 60 * 60 * 1000)}`);
  }
}
```

**Database:**
```sql
CREATE TABLE exported_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  user_id UUID NOT NULL,
  filename VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  export_type VARCHAR(50),
  is_shared BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  download_count INT DEFAULT 0,
  last_downloaded_at TIMESTAMP
);
```

**Cron Job:**
```typescript
// Daily cleanup at 2 AM
cron.schedule('0 2 * * *', async () => {
  const deleted = await db.query(`
    DELETE FROM exported_files
    WHERE expires_at < NOW()
    RETURNING file_path
  `);

  for (const row of deleted.rows) {
    await fs.unlink(row.file_path);
  }

  logger.info(`Cleaned up ${deleted.rowCount} expired files`);
});
```

---

### Phase 3: Google Drive Integration (Future) 📋

**Add `--todrive` flag like GAM:**

```bash
helios> export users --format csv --todrive

⏳ Exporting 2,456 users...
⬆️ Uploading to Google Drive...
✅ Export complete

📁 users-export-2025-11-07.csv
🔗 https://drive.google.com/file/d/abc123/view
💡 File saved to your Google Drive
```

**Implementation:**
```typescript
async function exportToDrive(data: string, filename: string) {
  const drive = await getDriveClient(organizationId);

  const file = await drive.files.create({
    resource: { name: filename, mimeType: 'text/csv' },
    media: { mimeType: 'text/csv', body: data }
  });

  return file.data.webViewLink;
}
```

**Pros:**
- ✅ No server storage needed
- ✅ Users already familiar with Drive
- ✅ Easy collaboration - share Drive link
- ✅ User-managed retention
- ✅ GAM precedent - proven pattern

**Cons:**
- ❌ Requires Drive API scopes
- ❌ Only works if Google Workspace enabled
- ❌ Microsoft 365 users can't use it (need OneDrive equivalent)

---

## CLI Commands to Implement

### Export Commands
```bash
# Basic export (auto-decides storage method)
export users --format csv
export users --format json
export groups --format csv

# Force storage method
export users --format csv --server      # Force server storage
export users --format csv --todrive     # Force Google Drive
export users --format csv --download    # Force browser download

# Filtered exports
export users --filter "department=Engineering" --format csv
export users --status active --format json
```

### Downloads Management
```bash
# List available downloads
downloads list
downloads ls

# Get specific download
downloads get 1
downloads get <file-id>
downloads download 1

# Delete export
downloads delete 1
downloads rm 1

# Clear expired
downloads cleanup

# Show storage usage
downloads usage
```

---

## Security & Compliance

### Data Retention Policy

| Export Type | Retention | Justification |
|-------------|-----------|---------------|
| User exports | 7 days | Temporary working data |
| Audit logs | 90 days | Compliance requirement |
| Backup exports | 30 days | Disaster recovery |
| Debug dumps | 14 days | Troubleshooting |

### Auto-Deletion
- ✅ Cron job runs daily at 2 AM
- ✅ Deletes files where `expires_at < NOW()`
- ✅ Also removes file from filesystem
- ✅ Logged for audit trail

### Access Control
```typescript
// Download endpoint
app.get('/api/downloads/:fileId', requireAuth, async (req, res) => {
  const file = await db.query(`
    SELECT * FROM exported_files
    WHERE id = $1
      AND organization_id = $2
      AND (user_id = $3 OR is_shared = TRUE)
      AND expires_at > NOW()
  `, [req.params.fileId, req.user.organizationId, req.user.id]);

  if (!file.rows[0]) {
    return res.status(404).json({ error: 'File not found or expired' });
  }

  res.download(file.rows[0].file_path);
});
```

### GDPR Compliance
- ✅ **Clear ownership** - Each export tied to user_id
- ✅ **Automatic deletion** - 7-day retention
- ✅ **User can delete** - `downloads delete` command
- ✅ **Audit trail** - download_count, last_downloaded_at
- ✅ **Right to be forgotten** - Delete all user's exports when user deleted

---

## Final Recommendations

### For Authentication:
1. ✅ **Use service accounts (Google) and application permissions (Microsoft)** - All APIs work
2. ⚠️ **Document the security implications** clearly in setup wizard
3. 🔒 **Implement audit logging** for all API operations
4. 📋 **Show consent screen** explaining what data is accessible

### For File Storage:
1. ✅ **Phase 1 (now)**: Blob API for all downloads - works immediately
2. 📋 **Phase 2 (next sprint)**: Server storage for files >1MB
3. 📋 **Phase 3 (future)**: Google Drive integration with `--todrive`

### Architecture Decision:
- **Small files (<1MB)**: Browser download (Blob API)
- **Large files (1-100MB)**: Server storage with 7-day retention
- **Very large/recurring**: Google Drive integration (future)

### Storage Model:
- **Organization-wide storage** with per-user ownership
- **7-day auto-expiry** for temporary exports
- **90-day retention** for audit logs
- **GDPR-compliant** data ownership and deletion

---

**Status:** Research Complete ✅
**Next Steps:** Implement Phase 2 (server-side storage) in next sprint
**Estimated Effort:** 2-3 days (database schema, API endpoints, CLI commands, cleanup job)
