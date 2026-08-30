# Microsoft 365 Integration Setup Guide

This guide walks you through connecting Helios to your Microsoft 365 (Entra ID / Azure AD) tenant.

## Prerequisites

- Global Administrator or Application Administrator role in Microsoft 365
- Helios Admin Portal installed and accessible
- 15-20 minutes to complete setup

## Overview

Helios uses **Microsoft Graph API** to sync users, groups, and license information from your Microsoft 365 tenant. This requires registering an application in Azure and granting it appropriate permissions.

## Step 1: Create App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** (or **Microsoft Entra ID**)
3. Click **App registrations** in the left menu
4. Click **+ New registration**

### Registration Details

| Field | Value |
|-------|-------|
| Name | `Helios Admin Portal` |
| Supported account types | `Accounts in this organizational directory only (Single tenant)` |
| Redirect URI (optional) | Leave blank for now |

5. Click **Register**

## Step 2: Note Your IDs

After registration, you'll see the **Overview** page. Copy these values:

| Field | Example | Where in Helios |
|-------|---------|-----------------|
| **Application (client) ID** | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` | Client ID field |
| **Directory (tenant) ID** | `12345678-abcd-ef12-3456-7890abcdef12` | Tenant ID field |

## Step 3: Create Client Secret

1. In your app registration, click **Certificates & secrets**
2. Click **+ New client secret**
3. Enter a description: `Helios Integration`
4. Select expiration: `24 months` (maximum in UI)
5. Click **Add**

⚠️ **IMPORTANT:** Copy the **Value** immediately! It will only be shown once.

| Field | What to Copy |
|-------|--------------|
| **Value** | The secret string (e.g., `abc123~XYZ...`) |
| **Expires** | Note the expiration date for renewal |

## Step 4: Configure API Permissions

1. Click **API permissions** in the left menu
2. Click **+ Add a permission**
3. Select **Microsoft Graph**
4. Select **Application permissions** (not Delegated)

### Required Permissions (Read-Only Sync)

Minimum permissions for user/group sync:

| Permission | Purpose |
|------------|---------|
| `User.Read.All` | Read all user profiles |
| `Group.Read.All` | Read all groups |
| `Directory.Read.All` | Read directory data |
| `Organization.Read.All` | Read organization info |

### Recommended Permissions (Full Management)

For creating users, managing groups, and assigning licenses:

| Permission | Purpose |
|------------|---------|
| `User.ReadWrite.All` | Create, update, delete users |
| `Group.ReadWrite.All` | Create, update, delete groups |
| `GroupMember.ReadWrite.All` | Add/remove group members |
| `LicenseAssignment.ReadWrite.All` | Assign/remove licenses |

**Note:** Helios automatically detects all available licenses in your tenant (Microsoft 365 E3, E5, Business Premium, etc.) - no configuration required. The `Organization.Read.All` permission above is what exposes subscribed-SKU totals (`prepaidUnits` / `consumedUnits`).

### Optional: Mail & Drive Migration Source

Add these **only** if you will use Helios to migrate mailboxes and OneDrive files **out of** this tenant (e.g. an M365 → Google Workspace migration). They are **not** needed for user/group/license sync or management.

| Permission | Purpose |
|------------|---------|
| `Mail.Read` | Read message content (RFC822) for migration |
| `Files.Read.All` | Read OneDrive/Drive file content for migration |
| `Sites.Read.All` | *(optional)* Read SharePoint site content |

⚠️ **These are broad, tenant-wide read grants** — the app can read **every** user's mailbox and files, not just the ones being migrated. Add them only for the migration window, and remove them (and revoke consent) afterward.

5. After adding permissions, click **Grant admin consent for [Your Org]**
6. Confirm by clicking **Yes**

✅ All permissions should show a green checkmark under "Status"

> **Heads-up:** Granting admin consent is a *protected action*. If your tenant enforces step-up MFA / Privileged Identity Management, Entra will prompt you to **re-authenticate** before the consent is applied — this is expected. Consent requires the **Global Administrator** or **Privileged Role Administrator** role.

## Step 5: Connect in Helios

1. Log into Helios as an administrator
2. Go to **Settings** → **Modules**
3. Find **Microsoft 365** and click **Enable**
4. Enter your credentials:

| Field | Value |
|-------|-------|
| Tenant ID | Your Directory (tenant) ID from Step 2 |
| Client ID | Your Application (client) ID from Step 2 |
| Client Secret | The secret Value from Step 3 |

5. Click **Test Connection**
6. If successful, click **Save and Sync**

## Step 6: Initial Sync

After connecting, Helios will:
1. Fetch all users from Entra ID
2. Fetch all groups
3. Fetch license usage information

This may take a few minutes depending on your directory size.

## Troubleshooting

### "Invalid client" Error

- Verify the Client ID is correct
- Ensure you're using the Application (client) ID, not Object ID

### "Unauthorized" or "Access Denied"

- Verify admin consent was granted for all permissions
- Check that permissions are "Application" type, not "Delegated"

### "Invalid tenant" Error

- Verify the Tenant ID is correct
- Ensure you're using the Directory (tenant) ID

### Secret Not Working

- Client secrets can only be viewed once when created
- If lost, create a new secret and update Helios

### Stored Secret Stops Working After a Restart

- Helios encrypts the client secret at rest with `ENCRYPTION_KEY`. If that key changes (or was never set, so a random one was generated per process), the stored secret can no longer be decrypted and every Graph call fails after a restart.
- **Fix:** set a stable `ENCRYPTION_KEY` in the environment *before* saving the secret, and keep it constant across restarts. In production Helios refuses to start without one.

### Federated / Hybrid Tenants (JumpCloud, AD sync, ADFS)

- Helios connects with **app-only client credentials**, which authenticate the *application* directly against Entra. This is **independent of user federation** — sync and all read operations work normally even when sign-in is federated to an external IdP.
- What federation *does* block are **writes to identity mastered by the IdP**: password reset/force-change, and — when users are provisioned from on-prem/JumpCloud — `accountEnabled` toggles and user create/delete may error ("account is federated" / "mastered on-premises"). Directory reads, license reads, and mailbox/file reads are unaffected.

### Sync Issues

- Check that the app has `User.Read.All` permission
- Verify admin consent was granted
- Try disconnecting and reconnecting

## Security Best Practices

1. **Rotate secrets regularly** - Create a new secret before the old one expires
2. **Use minimum permissions** - Only enable ReadWrite permissions if you need Helios to create/update users
3. **Monitor app activity** - Review sign-in logs in Azure AD periodically
4. **Set secret expiry reminders** - Secrets expire, set a calendar reminder

## Renewing Client Secret

When your secret is about to expire:

1. Go to Azure Portal → App registrations → Your app
2. Click **Certificates & secrets**
3. Click **+ New client secret**
4. Create new secret with desired expiration
5. Copy the new Value
6. In Helios, go to Settings → Modules → Microsoft 365
7. Click **Update Credentials**
8. Enter the new secret
9. Test connection
10. Delete the old secret in Azure

## Data Synced by Helios

| Data Type | Sync Direction | Frequency |
|-----------|---------------|-----------|
| Users | Microsoft → Helios | Every 4 hours |
| Groups | Microsoft → Helios | Every 4 hours |
| Group Membership | Microsoft → Helios | Every 4 hours |
| License Usage | Microsoft → Helios | Daily |

## Need Help?

- Check the [Helios Documentation](https://api.obilabs.dev/docs)
- Contact support at support@api.obilabs.dev
- Open an issue on [GitHub](https://github.com/obilabs/helios)
