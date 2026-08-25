# 📚 Google Workspace Integration Setup Guide

## Overview

This guide walks you through setting up Google Workspace integration with Helios using YOUR organization's Google Cloud service account. This ensures complete security and data isolation.

**Time Required:** ~15 minutes
**Difficulty:** Intermediate
**Prerequisites:** Google Workspace Super Admin access

## Why Organization-Owned Service Accounts?

Each organization MUST use their own service account for:
- **Security:** Your data remains completely isolated
- **Control:** You maintain full control over access
- **Compliance:** Meet regulatory requirements (GDPR, SOC2, etc.)
- **Auditability:** Clear audit trail of all API access

## Step 1: Create Your Google Cloud Project

### 1.1 Access Google Cloud Console
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Sign in with your Google Workspace admin account

### 1.2 Create New Project
1. Click the project dropdown at the top
2. Click **"New Project"**
3. Enter project details:
   - **Project Name:** `YourCompany-Helios-Integration`
   - **Organization:** Select your organization
4. Click **"Create"**
5. Wait for project creation (~30 seconds)

### 1.3 Enable Required APIs
1. Go to **"APIs & Services"** > **"Library"**
2. Search and enable **all** of these APIs. Each backs one or more of the scopes
   in Step 3.3 — if an API is disabled, the features that use its scopes fail at
   runtime even though the scope was authorized:
   - **Admin SDK API** — directory, reports (audit), data-transfer, and device scopes
   - **Enterprise License Manager API** — `apps.licensing` (license assignment)
   - **Gmail API** — `gmail.settings.basic` / `gmail.settings.sharing` (signatures, delegation, forwarding)
   - **Google Drive API** — `drive`, `drive.file`, `drive.readonly` (external-sharing audit, file access)
   - **Google Calendar API** — `calendar` (calendar resource management and hand-off)
3. Click **"Enable"** for each API

> **Note:** the Admin Reports and Data Transfer capabilities are part of the
> **Admin SDK API** — enabling Admin SDK covers `admin.reports.*` and
> `admin.datatransfer`; there is no separate API to enable for those.

## Step 2: Create Service Account

### 2.1 Navigate to Service Accounts
1. Go to **"IAM & Admin"** > **"Service Accounts"**
2. Click **"+ CREATE SERVICE ACCOUNT"**

### 2.2 Configure Service Account
1. **Service account details:**
   - **Name:** `Helios Integration Service Account`
   - **ID:** `helios-integration` (auto-generated is fine)
   - **Description:** `Service account for Helios platform integration`
2. Click **"Create and Continue"**

### 2.3 Skip Optional Steps
1. **Grant this service account access:** Skip (click "Continue")
2. **Grant users access:** Skip (click "Done")

### 2.4 Create JSON Key
1. Click on the newly created service account
2. Go to **"Keys"** tab
3. Click **"Add Key"** > **"Create new key"**
4. Select **"JSON"** format
5. Click **"Create"**
6. **SAVE THE DOWNLOADED FILE** - You'll need this for Helios

> **Use JSON, not P12** — Helios consumes the JSON service-account key.
>
> ⚠️ **If "Create key" is greyed out or fails with a policy error,** your Google
> Cloud organization blocks key creation by default under the **"Secure by
> Default"** org policy `iam.disableServiceAccountKeyCreation`. This is common on
> newer organizations. See **Troubleshooting → "Service account key creation is
> disabled"** below for the one-time override, then return here and create the key.

### 2.5 Note the Client ID
1. Go back to the **"Details"** tab
2. Copy the **"Unique ID"** (this is your Client ID)
3. You'll need this for Domain-Wide Delegation setup

## Step 3: Configure Domain-Wide Delegation

> **Fastest path — use the Helios wizard's pre-filled link.** When you reach the
> connect wizard (Step 4), its **"Authorize API scopes"** step has a **Copy
> scopes** button and an **"Open pre-filled authorization"** link that opens the
> Admin console's Domain-Wide Delegation page with your Client ID **and all 17
> scopes already filled in** — you just click **Authorize**. The manual steps
> below are the fallback (or use them if you prefer to authorize before opening
> Helios).
>
> Field gotchas with the pre-filled link: if nothing opens, your browser blocked
> the pop-up — copy the link and open it directly. Google may prompt you to
> re-enter your admin password first. Delegation changes take a few minutes to
> propagate, so if **Test Connection** fails right after authorizing, wait a
> minute and retry. (See Troubleshooting below.)

### 3.1 Access Google Admin Console
1. Go to [Google Admin Console](https://admin.google.com)
2. Sign in with your Super Admin account

### 3.2 Navigate to API Controls
1. Go to **"Security"** > **"Access and data control"** > **"API controls"**
2. Click **"Manage Domain-Wide Delegation"**

### 3.3 Add Service Account
1. Click **"Add new"**
2. Enter details:
   - **Client ID:** Paste the Unique ID from Step 2.5
   - **OAuth Scopes:** Add **all 17** of these scopes (one per line). You must
     authorize every scope Helios requests — Domain-Wide Delegation requires an
     exact match, so omitting any one causes an `unauthorized_client` failure at
     runtime on the features that need it (Gmail settings, Drive, Calendar,
     licensing, mobile-device wipe, data transfer):
     ```
     https://www.googleapis.com/auth/admin.directory.user
     https://www.googleapis.com/auth/admin.directory.user.security
     https://www.googleapis.com/auth/admin.directory.group
     https://www.googleapis.com/auth/admin.directory.group.member
     https://www.googleapis.com/auth/admin.directory.orgunit
     https://www.googleapis.com/auth/admin.directory.domain
     https://www.googleapis.com/auth/admin.directory.device.mobile
     https://www.googleapis.com/auth/admin.reports.audit.readonly
     https://www.googleapis.com/auth/admin.reports.usage.readonly
     https://www.googleapis.com/auth/admin.datatransfer
     https://www.googleapis.com/auth/apps.licensing
     https://www.googleapis.com/auth/calendar
     https://www.googleapis.com/auth/drive
     https://www.googleapis.com/auth/drive.file
     https://www.googleapis.com/auth/drive.readonly
     https://www.googleapis.com/auth/gmail.settings.basic
     https://www.googleapis.com/auth/gmail.settings.sharing
     ```
     > **Source of truth:** this list mirrors `REQUIRED_SCOPES` in
     > [`backend/src/config/google-scopes.ts`](../../backend/src/config/google-scopes.ts),
     > where each scope is annotated with the reason Helios needs it. If that file
     > changes, update this list to match.
3. Click **"Authorize"**

## Step 4: Configure in Helios

### 4.1 Access Helios Settings
1. Log into Helios with your admin account
2. Navigate to **Settings** > **Modules**

### 4.2 Enable Google Workspace
1. Find **Google Workspace** module
2. Click **"Enable"**

### 4.3 Upload Configuration
1. **Admin Email:** Enter your Google Workspace admin email (e.g., admin@yourdomain.com)
2. **Service Account:** Upload the JSON file downloaded in Step 2.4
3. Click **"Configure"**

### 4.4 Test Connection
1. Click **"Test Connection"**
2. You should see:
   - ✅ Connection successful
   - Project name
   - Number of accessible users
3. If you see errors, check the troubleshooting section

### 4.5 Initial Sync
1. The system will automatically start syncing after configuration
2. You can also manually trigger sync with the **"Sync Now"** button
3. First sync may take a few minutes depending on organization size

## Step 5: Verify Setup

### 5.1 Check Synced Data
1. Go to **Directory** > **Users**
2. Verify your Google Workspace users appear
3. Check that user details are correct

### 5.2 Review Sync Status
1. Go to **Settings** > **Modules**
2. Check Google Workspace module shows:
   - Status: **Active**
   - Last Sync: Recent timestamp
   - User Count: Correct number

## Troubleshooting

### Common Issues and Solutions

#### ❌ "Invalid grant" Error
**Cause:** Domain-Wide Delegation not properly configured
**Solution:**
1. Verify Client ID in Google Admin Console matches service account
2. Ensure all OAuth scopes are added exactly as shown
3. Confirm admin email is a Super Admin account

#### ❌ "Unauthorized client" Error
**Cause:** OAuth scopes missing or incorrect
**Solution:**
1. Go back to Google Admin Console
2. Edit the Domain-Wide Delegation entry
3. Ensure **all 17 scopes** from Step 3.3 are present — a partial list (e.g. only
   the directory/reports scopes) authorizes user/group sync but still throws
   `unauthorized_client` on Gmail settings, Drive, Calendar, licensing,
   device-wipe, and data-transfer actions
4. Re-authorize

#### ❌ "Connection failed" Error
**Cause:** Service account file invalid or wrong admin email
**Solution:**
1. Verify JSON file is from YOUR Google Cloud project
2. Confirm admin email has Super Admin privileges
3. Re-download service account key if needed

#### ❌ "0 users synced"
**Cause:** Permissions issue or wrong domain
**Solution:**
1. Verify Domain-Wide Delegation is authorized
2. Check admin email belongs to the correct domain
3. Ensure Admin SDK API is enabled in Google Cloud

#### ❌ "Service account key creation is disabled" (can't download the JSON key)
**Cause:** Your Google Cloud **organization** enforces the org policy
`iam.disableServiceAccountKeyCreation` (Google's **"Secure by Default"** posture),
which blocks service-account key creation org-wide. Newer Google organizations
have this enabled by default, so **Step 2.4** fails before you ever reach Helios.
**Solution:** an **Organization Policy Administrator** (`roles/orgpolicy.policyAdmin`)
adds a one-time exception:
1. Google Cloud Console → **IAM & Admin** → **Organization Policies**
2. Search **"Disable service account key creation"**
   (`constraints/iam.disableServiceAccountKeyCreation`)
3. **Manage policy** → **Override parent's policy**
4. **Add a rule** → set **Enforcement: Off**
   *(the console rejects an empty override with "At least one rule is required" —
   you must add a rule, not just flip the top toggle)*
5. **Set policy**, then wait ~1 minute for it to propagate
6. Return to the service account → **Keys** → **Add key** → **Create new key** →
   **JSON**
7. For security, re-tighten the policy afterward — or scope the exception to only
   the project that holds this service account, rather than the whole org.

#### ❌ Pre-filled Domain-Wide Delegation link won't open or won't authorize
**Cause:** browser pop-up blocking, a password re-check, or propagation delay.
**Solution:**
- **Nothing opened:** your browser blocked the pop-up — copy the link and paste it
  into the address bar of the same tab.
- **Asked for your password:** Google re-verifies your identity before authorizing
  delegation. Re-enter your admin password and continue.
- **Authorized, but Test Connection still fails:** delegation changes take a few
  minutes to propagate. Wait a minute and click **Test Connection** again.

## Security Best Practices

### DO ✅
- Create service account in YOUR organization's Google Cloud project
- Keep service account JSON file secure
- Regularly rotate service account keys (every 90 days)
- Monitor API usage in Google Cloud Console
- Use a dedicated service account for Helios only

### DON'T ❌
- Share service accounts between organizations
- Use personal Google accounts for service accounts
- Store service account files in version control
- Share your service account with vendors or partners
- Use the same service account for multiple applications

## Sync Configuration Options

### Automatic Sync Intervals
Available in **Settings** > **Advanced**:
- Every 5 minutes (for critical changes)
- Every 15 minutes (recommended)
- Every 30 minutes
- Every 1 hour
- Every 2 hours
- Every 4 hours
- Every 8 hours
- Once per day

### Conflict Resolution
Configure how to handle data conflicts:
- **Platform Wins:** Google Workspace data overwrites local
- **Local Wins:** Local changes override Google Workspace
- **Manual:** Ask for each conflict

## Support and Help

### Getting Help
- **Documentation:** Check this guide first
- **Logs:** Review sync logs in Settings > Advanced
- **Support:** Contact your Helios administrator

### Useful Links
- [Google Cloud Console](https://console.cloud.google.com)
- [Google Admin Console](https://admin.google.com)
- [Google Workspace Admin SDK Documentation](https://developers.google.com/admin-sdk)
- [Domain-Wide Delegation Guide](https://developers.google.com/admin-sdk/directory/v1/guides/delegation)

## Checklist

Before marking setup as complete, verify:

- [ ] Google Cloud project created
- [ ] Service account created with JSON key downloaded
- [ ] Admin SDK API enabled
- [ ] Domain-Wide Delegation configured with Client ID
- [ ] All 17 OAuth scopes added and authorized
- [ ] Service account uploaded to Helios
- [ ] Test connection successful
- [ ] Initial sync completed
- [ ] Users visible in Directory
- [ ] Automatic sync interval configured

---

**Remember:** Your service account provides full access to your Google Workspace directory. Keep it secure and never share it with other organizations.