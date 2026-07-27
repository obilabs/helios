# Storage & Backup Strategy

## Status: Draft

## Problem Statement

Helios Client currently has two storage backends configured:
1. **MinIO** (S3-compatible) - Local object storage for platform assets
2. **Google Drive** - Optional storage via Google Workspace integration

The current design allows users to choose between them for primary storage, creating complexity:
- Multiple code paths for file operations
- Inconsistent behavior depending on storage choice
- No disaster recovery strategy
- Unclear documentation for deployment decisions

## Proposed Solution: MinIO Primary + Encrypted Drive Backup

### Architecture

```
+----------------------------------------------------------+
|                    Helios Client                          |
+----------------------------------------------------------+
|                                                           |
|   +------------------+         +----------------------+   |
|   |     MinIO        |  backup |   Google Drive       |   |
|   |   (Primary)      | ------> | (Encrypted Backup)   |   |
|   +------------------+         +----------------------+   |
|   - Profile photos             - AES-256 encrypted        |
|   - Signature images           - Scheduled (daily/weekly) |
|   - Documents                  - Disaster recovery        |
|   - Email templates            - Off-site protection      |
|   - Organization logos                                    |
|                                                           |
+----------------------------------------------------------+
```

### Key Decisions

1. **MinIO is ALWAYS the primary storage** - no user choice for primary
2. **Google Drive is ONLY for encrypted backups** - not an alternative primary
3. **All backups are encrypted** - data is encrypted before upload to Drive
4. **Backup is optional** - works without Google Workspace configured

### Benefits

| Aspect | Current (Choice) | Proposed (MinIO + Backup) |
|--------|------------------|---------------------------|
| Simplicity | Complex - two code paths | Simple - one primary |
| Reliability | Depends on Drive availability | Always available locally |
| Performance | Drive can be slow | MinIO is fast (local) |
| Security | Plain files in Drive | Encrypted backups only |
| Compliance | Data split across systems | Data consolidated + secure |
| Disaster Recovery | None | Drive serves as DR |

## Implementation

### Phase 1: Consolidate to MinIO Primary (1-2 days)

1. Remove storage backend choice from Settings UI
2. Remove Google Drive as primary storage option
3. Update documentation to reflect MinIO-only approach
4. Ensure all file operations go through MinIO

### Phase 2: Implement Encrypted Backup Service (2-3 days)

1. Create `backup.service.ts` with:
   - Backup scheduler (cron-based)
   - AES-256 encryption using org-derived key
   - Compression before encryption
   - Upload to Google Drive folder

2. Database schema for backup tracking:
   ```sql
   CREATE TABLE backup_jobs (
     id UUID PRIMARY KEY,
     organization_id UUID NOT NULL,
     status VARCHAR(20) DEFAULT 'pending',
     backup_type VARCHAR(20) DEFAULT 'scheduled',
     started_at TIMESTAMPTZ,
     completed_at TIMESTAMPTZ,
     size_bytes BIGINT,
     file_count INT,
     drive_file_id VARCHAR(255),
     error_message TEXT,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );

   CREATE TABLE backup_settings (
     id UUID PRIMARY KEY,
     organization_id UUID NOT NULL UNIQUE,
     enabled BOOLEAN DEFAULT false,
     schedule VARCHAR(20) DEFAULT 'daily',
     schedule_time TIME DEFAULT '02:00',
     retention_count INT DEFAULT 7,
     last_backup_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

3. Backup contents:
   - All MinIO buckets (helios-uploads, helios-public)
   - Database dump (pg_dump, compressed)
   - Configuration export

### Phase 3: Settings UI (1 day)

```
Storage Settings
================

Primary Storage: MinIO (Internal)
Status: Connected | 2.4 GB used

---

Encrypted Backup to Google Drive
================================

[ ] Enable automated backups to Google Drive

When enabled:
- Backup Schedule: [Daily ▼] at [2:00 AM ▼]
- Retention: Keep last [7] backups
- Encryption: AES-256 (organization key)

Last Backup: Dec 16, 2025 2:00 AM (142 MB)
Status: Success

[Run Backup Now]  [View Backup History]  [Restore from Backup]
```

### Phase 4: Restore Functionality (1-2 days)

1. List available backups from Drive
2. Download and decrypt
3. Restore to MinIO buckets
4. Optionally restore database (with confirmation)

## What Gets Backed Up

| Category | Contents | Encrypted |
|----------|----------|-----------|
| Platform Assets | Profile photos, logos, signatures | Yes |
| Documents | Uploaded files, templates | Yes |
| Database | Full pg_dump (users, settings, audit logs) | Yes |
| Configuration | Organization settings, integrations | Yes |

## Security Considerations

### Encryption
- AES-256-GCM encryption
- Key derived from: `PBKDF2(org_secret + installation_id, salt, 100000)`
- Each backup has unique IV
- Key never leaves the server

### Google Drive Access
- Uses existing service account (if GWS configured)
- Creates dedicated `helios-backups` folder
- Backups named: `helios-backup-{org_id}-{timestamp}.enc`

### Key Management
- Recovery key can be exported (one-time display)
- Without key, backups are unrecoverable
- Key rotation supported with re-encryption

## API Endpoints

```
GET  /api/v1/organization/backup/settings     - Get backup configuration
PUT  /api/v1/organization/backup/settings     - Update backup settings
POST /api/v1/organization/backup/run          - Trigger manual backup
GET  /api/v1/organization/backup/history      - List past backups
GET  /api/v1/organization/backup/:id          - Get backup details
POST /api/v1/organization/backup/:id/restore  - Restore from backup
DELETE /api/v1/organization/backup/:id        - Delete backup
GET  /api/v1/organization/backup/key          - Export recovery key (one-time)
```

## Migration Path

For existing installations:
1. MinIO continues working unchanged
2. Google Drive storage (if used as primary) migrated to MinIO
3. Backup feature available but opt-in
4. No data loss during migration

## Dependencies

- `crypto` (Node.js built-in) - AES encryption
- `archiver` - Create tar.gz archives
- `@google-cloud/storage` or Google Drive API - Upload backups
- `pg` - Database dump

## Estimated Effort

| Phase | Task | Effort |
|-------|------|--------|
| 1 | Consolidate to MinIO | 1-2 days |
| 2 | Backup Service | 2-3 days |
| 3 | Settings UI | 1 day |
| 4 | Restore | 1-2 days |
| **Total** | | **5-8 days** |

## Success Criteria

- [ ] All file operations use MinIO exclusively
- [ ] Backup runs successfully on schedule
- [ ] Backups are encrypted and uploaded to Drive
- [ ] Restore works from any backup
- [ ] Settings UI allows configuration
- [ ] Documentation updated

## Open Questions

1. Should database backups be separate from file backups?
2. What's the maximum backup size we should support?
3. Should we support backup to other destinations (S3, Azure Blob)?
