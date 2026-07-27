# Storage & Backup Strategy - Tasks

## Status: Draft

---

## Phase 1: Consolidate to MinIO Primary

### 1.1 Remove Storage Choice from UI
- [ ] Remove storage backend selection from Settings page
- [ ] Update `media_asset_settings` to always use MinIO
- [ ] Remove Google Drive primary storage code paths
- [ ] Update any conditional logic based on storage choice

**Files:**
- `frontend/src/pages/admin/Settings.tsx`
- `backend/src/services/media-asset-storage.service.ts`

### 1.2 Migrate Existing Google Drive Primary Users
- [ ] Create migration script to copy files from Drive to MinIO
- [ ] Update database records to point to MinIO paths
- [ ] Add migration status tracking
- [ ] Test with sample data

**Files:**
- `backend/src/scripts/migrate-drive-to-minio.ts`

### 1.3 Update Documentation
- [ ] Update S3-STORAGE-IMPLEMENTATION.md
- [ ] Update deployment guides
- [ ] Remove references to Drive as primary storage

**Files:**
- `docs/S3-STORAGE-IMPLEMENTATION.md`

---

## Phase 2: Backup Service

### 2.1 Database Schema
- [ ] Create migration `057_create_backup_tables.sql`
- [ ] Create `backup_jobs` table
- [ ] Create `backup_settings` table
- [ ] Add indexes for common queries

**Files:**
- `database/migrations/057_create_backup_tables.sql`

### 2.2 Backup Service Core
- [ ] Create `backup.service.ts`
- [ ] Implement `createBackup()` - orchestrates full backup
- [ ] Implement `encryptData()` - AES-256-GCM encryption
- [ ] Implement `compressBackup()` - tar.gz compression
- [ ] Implement `uploadToDrive()` - Google Drive upload
- [ ] Implement key derivation from org secret

**Files:**
- `backend/src/services/backup.service.ts`

### 2.3 MinIO Backup
- [ ] Implement `backupMinIO()` - export all buckets
- [ ] Handle large files with streaming
- [ ] Track file count and size
- [ ] Add progress reporting

**Files:**
- `backend/src/services/backup.service.ts`

### 2.4 Database Backup
- [ ] Implement `backupDatabase()` - pg_dump integration
- [ ] Compress database dump
- [ ] Exclude sensitive runtime data if needed
- [ ] Include schema version metadata

**Files:**
- `backend/src/services/backup.service.ts`

### 2.5 Scheduler
- [ ] Create `backup-scheduler.job.ts`
- [ ] Implement cron-based scheduling
- [ ] Support daily/weekly schedules
- [ ] Handle schedule time configuration
- [ ] Add job status monitoring

**Files:**
- `backend/src/jobs/backup-scheduler.job.ts`
- `backend/src/index.ts` (register job)

### 2.6 Backup Retention
- [ ] Implement retention policy
- [ ] Auto-delete old backups from Drive
- [ ] Update backup count after deletion
- [ ] Log cleanup actions

**Files:**
- `backend/src/services/backup.service.ts`

---

## Phase 3: API Endpoints

### 3.1 Backup Settings Endpoints
- [ ] Create `backup.routes.ts`
- [ ] `GET /backup/settings` - Get backup configuration
- [ ] `PUT /backup/settings` - Update settings
- [ ] Add validation for schedule parameters
- [ ] Require admin role

**Files:**
- `backend/src/routes/backup.routes.ts`
- `backend/src/index.ts` (register routes)

### 3.2 Backup Operations Endpoints
- [ ] `POST /backup/run` - Trigger manual backup
- [ ] `GET /backup/history` - List past backups
- [ ] `GET /backup/:id` - Get backup details
- [ ] `DELETE /backup/:id` - Delete backup
- [ ] Add rate limiting for manual backups

**Files:**
- `backend/src/routes/backup.routes.ts`

### 3.3 Recovery Key Endpoint
- [ ] `GET /backup/key` - Export recovery key
- [ ] One-time display (mark as exported)
- [ ] Require re-authentication
- [ ] Log key export to audit trail

**Files:**
- `backend/src/routes/backup.routes.ts`

---

## Phase 4: Settings UI

### 4.1 Backup Settings Component
- [ ] Create `BackupSettings.tsx` component
- [ ] Show primary storage status (MinIO)
- [ ] Toggle for enabling backup
- [ ] Schedule selection (daily/weekly)
- [ ] Time picker for backup time
- [ ] Retention count selector

**Files:**
- `frontend/src/components/admin/BackupSettings.tsx`
- `frontend/src/components/admin/BackupSettings.css`

### 4.2 Integration with Settings Page
- [ ] Add Backup section to Settings page
- [ ] Conditional display based on GWS availability
- [ ] Show helpful message if GWS not configured

**Files:**
- `frontend/src/pages/admin/Settings.tsx`

### 4.3 Backup Status Display
- [ ] Show last backup status and time
- [ ] Show backup size and file count
- [ ] Progress indicator during backup
- [ ] Error display if backup failed

**Files:**
- `frontend/src/components/admin/BackupSettings.tsx`

### 4.4 Manual Backup Controls
- [ ] "Run Backup Now" button
- [ ] Confirmation dialog
- [ ] Progress feedback
- [ ] Success/failure notification

**Files:**
- `frontend/src/components/admin/BackupSettings.tsx`

### 4.5 Backup History View
- [ ] List past backups with pagination
- [ ] Show status, size, timestamp
- [ ] Delete backup option
- [ ] Link to restore

**Files:**
- `frontend/src/components/admin/BackupHistory.tsx`

---

## Phase 5: Restore Functionality

### 5.1 Restore Service
- [ ] Create `restore.service.ts`
- [ ] Implement `listBackups()` - from Drive
- [ ] Implement `downloadBackup()` - from Drive
- [ ] Implement `decryptBackup()` - reverse encryption
- [ ] Implement `decompressBackup()` - extract tar.gz

**Files:**
- `backend/src/services/restore.service.ts`

### 5.2 MinIO Restore
- [ ] Implement `restoreMinIO()` - restore buckets
- [ ] Handle existing file conflicts
- [ ] Support partial restore (by bucket)
- [ ] Track restore progress

**Files:**
- `backend/src/services/restore.service.ts`

### 5.3 Database Restore
- [ ] Implement `restoreDatabase()` - pg_restore
- [ ] Require explicit confirmation
- [ ] Backup current state before restore
- [ ] Support schema-only restore option

**Files:**
- `backend/src/services/restore.service.ts`

### 5.4 Restore API Endpoint
- [ ] `POST /backup/:id/restore` - Restore from backup
- [ ] Accept restore options (files only, db only, full)
- [ ] Return job ID for progress tracking
- [ ] Log restore to audit trail

**Files:**
- `backend/src/routes/backup.routes.ts`

### 5.5 Restore UI
- [ ] "Restore from Backup" button
- [ ] Backup selection dialog
- [ ] Restore options (what to restore)
- [ ] Confirmation with warnings
- [ ] Progress indicator
- [ ] Success/failure notification

**Files:**
- `frontend/src/components/admin/RestoreDialog.tsx`

---

## Phase 6: Documentation & Testing

### 6.1 Update Architecture Docs
- [ ] Update S3-STORAGE-IMPLEMENTATION.md
- [ ] Create BACKUP-STRATEGY.md
- [ ] Document encryption approach
- [ ] Document restore procedure

**Files:**
- `docs/S3-STORAGE-IMPLEMENTATION.md`
- `docs/architecture/BACKUP-STRATEGY.md`

### 6.2 User Documentation
- [ ] Add backup section to setup guide
- [ ] Document recovery key importance
- [ ] Document disaster recovery procedure

**Files:**
- `docs/guides/BACKUP-RESTORE-GUIDE.md`

### 6.3 Testing
- [ ] Unit tests for encryption/decryption
- [ ] Unit tests for compression
- [ ] Integration tests for backup flow
- [ ] Integration tests for restore flow
- [ ] E2E test for settings UI

**Files:**
- `backend/src/services/__tests__/backup.service.test.ts`
- `backend/src/services/__tests__/restore.service.test.ts`
- `openspec/testing/tests/backup-restore.test.ts`

---

## Dependencies

- [ ] Ensure `archiver` package installed
- [ ] Ensure `crypto` available (Node.js built-in)
- [ ] Verify pg_dump available in container

---

## Estimated Effort

| Phase | Description | Effort |
|-------|-------------|--------|
| 1 | Consolidate to MinIO | 1-2 days |
| 2 | Backup Service | 2-3 days |
| 3 | API Endpoints | 0.5 days |
| 4 | Settings UI | 1 day |
| 5 | Restore | 1-2 days |
| 6 | Docs & Testing | 1 day |
| **Total** | | **6-9 days** |
