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
2. Search and enable these APIs:
   - **Admin SDK API** (required)
   - **Google Workspace Admin Reports API** (optional, for audit logs)
   - **Enterprise License Manager API** (optional, for license management)
3. Click **"Enable"** for each API

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

### 2.5 Note the Client ID
1. Go back to the **"Details"** tab
2. Copy the **"Unique ID"** (this is your Client ID)
3. You'll need this for Domain-Wide Delegation setup

## Step 3: Configure Domain-Wide Delegation

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
   - **OAuth Scopes:** Add these scopes (one per line):
     ```
     https://www.googleapis.com/auth/admin.directory.user
     https://www.googleapis.com/auth/admin.directory.group
     https://www.googleapis.com/auth/admin.directory.orgunit
     https://www.googleapis.com/auth/admin.directory.domain.readonly
     https://www.googleapis.com/auth/admin.reports.audit.readonly
     https://www.googleapis.com/auth/apps.licensing
     ```
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
3. Ensure all 6 scopes are present
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
- [ ] All 6 OAuth scopes added and authorized
- [ ] Service account uploaded to Helios
- [ ] Test connection successful
- [ ] Initial sync completed
- [ ] Users visible in Directory
- [ ] Automatic sync interval configured

---

**Remember:** Your service account provides full access to your Google Workspace directory. Keep it secure and never share it with other organizations.