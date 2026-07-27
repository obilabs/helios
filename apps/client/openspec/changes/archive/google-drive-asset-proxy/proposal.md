# OpenSpec Proposal: Google Drive Asset Proxy

**ID:** google-drive-asset-proxy
**Status:** Draft
**Priority:** P1 (High - Foundation)
**Author:** Claude (Autonomous Agent)
**Created:** 2025-12-08

## Summary

Create a proxy service that serves files from a customer's Google Shared Drive with direct, embeddable URLs. This solves the critical problem of Google blocking direct Drive links for email signatures and web embeds.

## Problem Statement

### Google Broke Direct Drive Links (January 2024)

As of January 2024, Google no longer allows images hosted on Google Drive to be directly embedded:
- `https://drive.google.com/uc?id=XXX` URLs no longer work
- The `/thumbnail` endpoint has rate limits and size restrictions
- Images in signatures trigger spam filters
- Mobile/incognito modes require authentication

### Why This Matters

1. **Email Signatures** - Cannot use company logos, banners, profile photos from Drive
2. **Profile Photos** - User photos stored in Drive can't be displayed
3. **Brand Assets** - Organizations want to manage assets in Google, not separate storage
4. **Compliance** - Some organizations require files stay in their Google ecosystem

### Our Opportunity

By proxying Google Drive files through Helios, we provide:
- Direct, embeddable URLs that work everywhere
- Files stay in customer's Google ecosystem
- No separate storage costs for customers
- Unique feature competitors don't offer

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Customer's Google Workspace                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Shared Drive: "Helios Assets" (hidden from normal users)     │  │
│  │  ├── /brand/                                                   │  │
│  │  │   ├── logo.png                                              │  │
│  │  │   ├── logo-dark.png                                         │  │
│  │  │   └── favicon.ico                                           │  │
│  │  ├── /signatures/                                              │  │
│  │  │   ├── banners/                                              │  │
│  │  │   └── social-icons/                                         │  │
│  │  ├── /profiles/                                                │  │
│  │  │   └── {user_id}/avatar.jpg                                  │  │
│  │  └── /campaigns/                                               │  │
│  │      └── {campaign_id}/banner.png                              │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              ↑                                       │
│                    Service Account (Editor access)                   │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               │ Google Drive API
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         Helios Backend                               │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Asset Proxy Service                                           │  │
│  │  ├── Fetch file from Drive via service account                 │  │
│  │  ├── Cache in Redis (1 hour TTL, configurable)                 │  │
│  │  ├── Serve with correct Content-Type                           │  │
│  │  └── Track access for analytics (optional)                     │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Public Endpoint (no auth required for serving):                     │
│  GET /a/{asset_token}                                               │
│  GET /a/{asset_token}/{filename}  (for nice URLs)                   │
│                                                                      │
│  Admin Endpoints (auth required):                                    │
│  GET  /api/assets                    - List assets                   │
│  POST /api/assets                    - Register asset                │
│  GET  /api/assets/:id                - Get asset details             │
│  DELETE /api/assets/:id              - Remove asset                  │
│  POST /api/assets/upload             - Upload to Drive               │
│  POST /api/assets/folder             - Create folder                 │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ↓
            https://helios.example.com/a/abc123/logo.png
                    ↓
            Works in email signatures! ✓
            Works in <img> tags! ✓
            Works everywhere! ✓
```

## Database Schema

```sql
-- Asset registry
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),

  -- Storage location
  storage_type VARCHAR(20) NOT NULL DEFAULT 'google_drive', -- 'google_drive', 'minio', 's3'
  storage_path VARCHAR(500) NOT NULL, -- Drive file ID or MinIO path

  -- Asset metadata
  name VARCHAR(255) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT,

  -- Organization
  folder_path VARCHAR(500) DEFAULT '/', -- Logical folder in UI
  category VARCHAR(50), -- 'brand', 'signature', 'profile', 'campaign'

  -- Access control
  access_token VARCHAR(100) NOT NULL UNIQUE, -- Token for public URL
  is_public BOOLEAN DEFAULT true, -- Can be accessed without auth

  -- Tracking
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,

  -- Audit
  created_by UUID REFERENCES organization_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_assets_org (organization_id),
  INDEX idx_assets_token (access_token),
  INDEX idx_assets_category (organization_id, category)
);

-- Asset folders (virtual organization)
CREATE TABLE asset_folders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  path VARCHAR(500) NOT NULL,
  parent_id UUID REFERENCES asset_folders(id),
  drive_folder_id VARCHAR(100), -- Google Drive folder ID
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, path)
);

-- Organization asset settings
CREATE TABLE asset_settings (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id),
  storage_backend VARCHAR(20) DEFAULT 'google_drive', -- 'google_drive', 'minio'
  drive_shared_drive_id VARCHAR(100), -- Google Shared Drive ID
  drive_root_folder_id VARCHAR(100), -- Root folder for assets
  cache_ttl_seconds INTEGER DEFAULT 3600,
  max_file_size_mb INTEGER DEFAULT 10,
  allowed_mime_types TEXT[] DEFAULT ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## API Endpoints

### Public Asset Serving (No Auth)

```
GET /a/{access_token}
GET /a/{access_token}/{filename}

Response: Binary file with correct Content-Type
Cache-Control: public, max-age=3600

Errors:
- 404: Asset not found
- 410: Asset deleted
- 503: Storage temporarily unavailable
```

### Asset Management (Auth Required)

```
GET /api/assets
  Query: ?category=brand&folder=/signatures
  Response: List of assets with metadata

POST /api/assets
  Body: { name, category, folder_path }
  Action: Register existing Drive file as asset
  Response: Asset with public URL

POST /api/assets/upload
  Body: multipart/form-data (file, name, category, folder_path)
  Action: Upload file to Google Drive, register as asset
  Response: Asset with public URL

DELETE /api/assets/:id
  Action: Remove from registry (optionally delete from Drive)

GET /api/assets/folders
  Response: Folder tree

POST /api/assets/folders
  Body: { name, parent_path }
  Action: Create folder in Drive and registry
```

## Google Drive Integration

### Setup Flow

1. **Admin enables asset storage**
   - Navigate to Settings > Files & Assets
   - Click "Enable Google Drive Storage"

2. **System creates Shared Drive**
   - Via Admin SDK, create "Helios Assets" Shared Drive
   - Add service account as Content Manager
   - Optionally hide from regular users

3. **System creates folder structure**
   ```
   Helios Assets/
   ├── Brand/
   ├── Signatures/
   │   ├── Banners/
   │   └── Social Icons/
   ├── Profiles/
   └── Campaigns/
   ```

4. **Ready for use**
   - Assets can be uploaded via Helios UI
   - URLs work immediately for embedding

### Service Account Permissions

Required scopes:
```
https://www.googleapis.com/auth/drive
https://www.googleapis.com/auth/drive.file
```

The service account needs:
- Content Manager role on the Shared Drive
- Ability to create/read/delete files

### File Retrieval Flow

```typescript
async function getAssetContent(assetId: string): Promise<Buffer> {
  // 1. Check Redis cache
  const cached = await redis.get(`asset:${assetId}`);
  if (cached) {
    await this.updateAccessStats(assetId);
    return Buffer.from(cached, 'base64');
  }

  // 2. Get asset metadata from DB
  const asset = await db.query('SELECT * FROM assets WHERE id = $1', [assetId]);
  if (!asset) throw new NotFoundError();

  // 3. Fetch from Google Drive
  const drive = google.drive({ version: 'v3', auth: this.authClient });
  const response = await drive.files.get({
    fileId: asset.storage_path,
    alt: 'media'
  }, { responseType: 'arraybuffer' });

  // 4. Cache in Redis
  const buffer = Buffer.from(response.data);
  await redis.setex(
    `asset:${assetId}`,
    asset.cache_ttl || 3600,
    buffer.toString('base64')
  );

  // 5. Update stats
  await this.updateAccessStats(assetId);

  return buffer;
}
```

## Caching Strategy

### Redis Cache

- **Key**: `asset:{access_token}`
- **Value**: Base64-encoded file content
- **TTL**: Configurable per organization (default 1 hour)
- **Max Size**: Files over 5MB not cached (served directly)

### Cache Invalidation

- Manual: Admin clicks "Refresh" on asset
- Automatic: When asset is updated/replaced
- TTL expiry: Natural expiration

### CDN Integration (Future)

For high-traffic assets, can add CDN layer:
```
Client → CDN → Helios → Redis → Google Drive
```

## Fallback to MinIO

For self-hosted installations or organizations without Google Workspace:

```typescript
if (organization.asset_storage === 'minio') {
  // Use existing MinIO service
  return await minioService.getObject(asset.storage_path);
} else {
  // Use Google Drive
  return await driveService.getFile(asset.storage_path);
}
```

## UI Design

### Files & Assets Page

```
┌─ Settings > Files & Assets ─────────────────────────────────────────┐
│                                                                      │
│  Storage: Google Drive (Helios Assets)  [Configure]                 │
│                                                                      │
│  ┌─ Folders ────────┐  ┌─ Assets ─────────────────────────────────┐ │
│  │ 📁 Brand         │  │                                          │ │
│  │ 📁 Signatures    │  │  ┌──────┐  ┌──────┐  ┌──────┐           │ │
│  │   📁 Banners     │  │  │ 🖼️   │  │ 🖼️   │  │ 🖼️   │           │ │
│  │   📁 Social      │  │  │      │  │      │  │      │           │ │
│  │ 📁 Profiles      │  │  └──────┘  └──────┘  └──────┘           │ │
│  │ 📁 Campaigns     │  │  logo.png  icon.svg  banner.jpg         │ │
│  │                  │  │                                          │ │
│  │ [+ New Folder]   │  │  [Upload]  [Create from Drive]           │ │
│  └──────────────────┘  └──────────────────────────────────────────┘ │
│                                                                      │
│  Selected: logo.png                                                 │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Preview: [image]                                               │ │
│  │  Size: 24 KB                                                    │ │
│  │  Type: image/png                                                │ │
│  │  Created: Dec 8, 2025                                           │ │
│  │  Accessed: 1,234 times                                          │ │
│  │                                                                  │ │
│  │  Public URL:                                                    │ │
│  │  https://app.helios.com/a/x7k9m2/logo.png        [Copy]        │ │
│  │                                                                  │ │
│  │  [Replace]  [Download]  [Delete]                                │ │
│  └────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

## Success Criteria

1. Assets uploaded to Google Drive via Helios UI
2. Public URLs work in email signatures (tested in Gmail, Outlook)
3. URLs work in `<img>` tags on external websites
4. Cache reduces Drive API calls by 90%+
5. Fallback to MinIO works for non-Google setups
6. No Drive API rate limit errors under normal load

## Security Considerations

### Access Control
- Public assets: Anyone with URL can access (by design for signatures)
- Access tokens are random UUIDs (not guessable)
- Optional: Signed URLs with expiration for sensitive assets

### Rate Limiting
- Proxy endpoint rate limited by IP (100 req/min)
- Prevents abuse of our proxy as general file host
- Drive API has its own quotas (handled with caching)

### Content Validation
- Only allowed MIME types accepted
- File size limits enforced
- Virus scanning (future enhancement)

## Migration Path

### Phase 1: Basic Proxy (MVP)
- Manual asset registration
- Google Drive backend only
- Simple folder structure

### Phase 2: Upload Integration
- Upload directly from Helios
- Automatic folder creation
- MinIO fallback

### Phase 3: Advanced Features
- Bulk upload
- Drive file picker integration
- Asset versioning
- Usage analytics dashboard
