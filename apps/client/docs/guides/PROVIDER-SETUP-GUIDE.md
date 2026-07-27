# 🏢 Service Provider Setup Guide

## For Managed Service Providers (MSPs) and IT Consultants

This guide is for service providers who help clients set up Helios. It emphasizes the security model where each client maintains control of their own credentials.

## Security Model Overview

### The Golden Rule
**Each client MUST use their own Google Cloud service account from their own project.**

### Why This Matters
- **Legal Protection:** Avoid liability for data breaches
- **Compliance:** Meet SOC2, GDPR, HIPAA requirements
- **Client Trust:** Clients maintain full control
- **Risk Mitigation:** No single point of failure across clients
- **Clean Handoffs:** Easy to transfer management

## Your Role as a Provider

### What You DO ✅
- **Guide** clients through the setup process
- **Educate** on best practices
- **Troubleshoot** configuration issues
- **Document** the setup for the client
- **Train** client admins on management

### What You DON'T DO ❌
- Create service accounts on behalf of clients
- Store client service account files
- Use your own service account for multiple clients
- Have direct access to client credentials
- Manage Domain-Wide Delegation for clients

## Client Onboarding Process

### Phase 1: Pre-Setup (5 minutes)
1. **Schedule Setup Call**
   - 30-minute screen share session
   - Client needs Super Admin access ready
   - Have this guide ready to share

2. **Explain Security Model**
   ```
   "For security, you'll create and own your service account.
   This ensures only you have access to your Google Workspace data.
   I'll guide you through each step."
   ```

3. **Share Documentation**
   - Send GOOGLE-WORKSPACE-SETUP-GUIDE.md
   - Provide your support contact information

### Phase 2: Guided Setup (20 minutes)

#### Step 1: Google Cloud Project (5 minutes)
**Your Script:**
```
"Let's start by creating your Google Cloud project.
Please go to console.cloud.google.com and sign in.
I'll guide you through creating a project specifically for Helios."
```

**Guide them to:**
1. Create new project named `[ClientName]-Helios`
2. Enable Admin SDK API
3. Keep project selector on their new project

#### Step 2: Service Account Creation (5 minutes)
**Your Script:**
```
"Now we'll create a service account. This is like a special
login that Helios uses to connect to your Google Workspace.
You'll download a key file - please save it securely."
```

**Guide them to:**
1. Create service account
2. Download JSON key
3. Copy the Client ID (Unique ID)
4. Remind them to keep the file secure

#### Step 3: Domain-Wide Delegation (5 minutes)
**Your Script:**
```
"Next, we need to authorize this service account in your
Google Admin Console. This gives Helios permission to read
your directory information."
```

**Guide them to:**
1. Open admin.google.com
2. Navigate to Security > API controls
3. Add Domain-Wide Delegation
4. Paste Client ID and scopes
5. Click Authorize

#### Step 4: Helios Configuration (5 minutes)
**Your Script:**
```
"Great! Now let's connect everything in Helios.
You'll upload the key file you downloaded earlier.
After this, Helios will sync your Google Workspace data."
```

**Guide them to:**
1. Log into Helios
2. Go to Settings > Modules
3. Enable Google Workspace
4. Upload their JSON file
5. Test connection
6. Verify initial sync

### Phase 3: Verification (5 minutes)

**Verification Checklist:**
```
□ Users are syncing (check Directory > Users)
□ Groups are visible (if applicable)
□ Sync status shows "Active"
□ Automatic sync interval is configured
□ Client can manually trigger sync
```

**Your Script:**
```
"Perfect! Your Google Workspace is now connected.
You can see your users are syncing.
The system will automatically sync every [interval].
You maintain full control and can revoke access anytime."
```

## Handoff Documentation

Create a handoff document for each client:

```markdown
# Helios Google Workspace Integration - [Client Name]

## Setup Completed: [Date]

### Configuration Details
- Google Cloud Project: [Project Name]
- Service Account: [Service Account Email]
- Domain: [Client Domain]
- Admin Email: [Admin Email Used]
- Setup Performed By: [Your Name]

### Client Responsibilities
- Service account JSON file (stored securely by client)
- Google Cloud project ownership
- Domain-Wide Delegation management

### How to Revoke Access
1. Google Admin Console > Security > API controls
2. Remove Domain-Wide Delegation entry
3. Or delete service account in Google Cloud

### Support
- Provider: [Your Company]
- Contact: [Your Support Email]
- Documentation: [Link to guides]

### Notes
[Any specific configuration or customization]
```

## Troubleshooting Without Direct Access

### Remote Troubleshooting Techniques

#### For "Invalid Grant" Errors
**Ask client to verify:**
1. Screenshot of Domain-Wide Delegation page
2. Confirm Client ID matches (they can check in Google Cloud)
3. Verify admin email is Super Admin
4. Check if scopes are exactly as documented

#### For "0 Users Synced"
**Ask client to check:**
1. Admin SDK API is enabled (in Google Cloud)
2. Domain-Wide Delegation shows "Authorized"
3. Test with "Test Connection" button
4. Try manual sync and share any errors

#### For Connection Issues
**Guide client to:**
1. Re-download service account key
2. Re-upload to Helios
3. Verify they're using correct admin email
4. Check Google Cloud project is active

### Secure Screen Sharing

When helping clients:
1. Use screen sharing where client shares their screen
2. Never ask for service account files
3. Don't store screenshots with sensitive data
4. Use secure communication channels

## Migration from Shared Service Accounts

If you previously used shared service accounts:

### Migration Plan
1. **Assess Current Setup**
   - List all clients using shared account
   - Document current configuration

2. **Client Communication**
   ```
   Subject: Important Security Update - Action Required

   We're upgrading Helios to a more secure configuration.
   Each organization will now have their own dedicated
   service account for enhanced security and compliance.

   Benefits:
   - Enhanced security and data isolation
   - Full control over your integration
   - Compliance with industry standards

   We'll guide you through the 15-minute setup process.
   ```

3. **Migration Schedule**
   - Schedule each client separately
   - Plan for 30-minute sessions
   - Provide documentation in advance

4. **Post-Migration**
   - Verify each client is working
   - Document new configuration
   - Delete old shared service account

## Best Practices for Providers

### 1. Documentation
- Keep records of setup dates and configurations
- Never store client credentials
- Document any customizations
- Maintain setup guides and FAQs

### 2. Security
- Use secure screen sharing tools
- Enable 2FA on your accounts
- Regular security training for staff
- Clear data retention policies

### 3. Support
- Provide clear escalation paths
- Maintain knowledge base
- Regular check-ins with clients
- Proactive security updates

### 4. Training
- Train client admins on self-service
- Provide video tutorials if possible
- Create client-specific runbooks
- Offer refresher training quarterly

## Legal Considerations

### Liability Protection
```
SERVICE AGREEMENT CLAUSE:

"Client maintains exclusive control and ownership of all
Google Cloud service accounts and credentials. Provider
offers guidance and support but does not have access to
or store client authentication credentials. Client is
responsible for credential security and access management."
```

### Data Access Statement
```
"[Provider Name] does not have direct access to client
Google Workspace data. All data access is controlled by
client-owned and managed service accounts."
```

## Pricing Considerations

### Recommended Pricing Model
- **Setup Fee:** One-time fee for guided setup
- **Support:** Monthly/annual support subscription
- **Training:** Additional fee for admin training
- **Documentation:** Included in setup fee

### What NOT to Charge For
- Service account creation (client does this)
- Google Cloud resources (client's responsibility)
- API usage (covered by client's Google Workspace)

## Communication Templates

### Initial Setup Email
```
Subject: Helios Setup - Your Action Required

Hi [Client Name],

Ready to set up your Helios Google Workspace integration!

What you'll need:
- Google Workspace Super Admin access
- 30 minutes for guided setup
- Ability to create a Google Cloud project

Security Note: You'll create and own your service account,
ensuring only you have access to your data.

Available times: [Schedule options]

Best regards,
[Your Name]
```

### Post-Setup Email
```
Subject: Helios Setup Complete - Important Information

Hi [Client Name],

Your Helios Google Workspace integration is active!

Important Information to Keep Secure:
- Google Cloud Project: [Name]
- Service Account Email: [Email]
- Setup Date: [Date]

You have full control and can manage or revoke access
anytime through Google Admin Console.

Documentation: [Link to guides]
Support: [Contact information]

Best regards,
[Your Name]
```

## Support Resources

### For Providers
- This guide (PROVIDER-SETUP-GUIDE.md)
- Security documentation (SECURITY-SERVICE-ACCOUNTS.md)
- Setup guide (GOOGLE-WORKSPACE-SETUP-GUIDE.md)

### For Clients
- Client setup guide
- Troubleshooting guide
- Video tutorials (if available)
- Support contact information

## Conclusion

By following this security model:
- Clients maintain control of their data
- Providers avoid liability and compliance issues
- Everyone benefits from better security
- Handoffs and transitions are clean

Remember: **Guide, don't access.** Your role is to educate and support, not to hold the keys.

---

*Last Updated: [Current Date]*
*Version: 1.0*