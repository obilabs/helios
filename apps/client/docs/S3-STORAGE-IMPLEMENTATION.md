# S3-Compatible Storage with MinIO

## Storage Strategy

**MinIO is the PRIMARY and ONLY storage backend for Helios Client.**

- All platform assets (photos, signatures, documents) are stored in MinIO
- Google Drive is NOT an alternative primary storage option
- Google Drive is ONLY used for encrypted off-site backups (optional)

This decision simplifies the codebase, improves reliability, and provides consistent behavior across all deployments.

For backup strategy details, see: `openspec/changes/storage-backup-strategy/proposal.md`

---

## Overview
We've implemented S3-compatible object storage using MinIO for secure file storage with the following benefits:
- **Secure presigned URLs** for private files
- **Public hosting** for email templates and signatures
- **Scalable storage** that works with multiple backend instances
- **CDN-ready** for production deployment

## Architecture

### Storage Buckets
1. **`helios-uploads`** - Private bucket for:
   - User profile photos
   - Sensitive documents
   - Private attachments
   - Organization logos

2. **`helios-public`** - Public bucket for:
   - Email signature images
   - Template assets
   - Public resources
   - Marketing materials

### File Organization
```
organizationId/
├── profile/        # User profile photos
│   └── 2024/01/timestamp_hash.jpg
├── signature/      # Email signatures
│   └── 2024/01/timestamp_hash.png
├── template/       # Template assets
│   └── 2024/01/timestamp_hash.svg
├── document/       # Documents
│   └── 2024/01/timestamp_hash.pdf
└── public/        # Public resources
    └── 2024/01/timestamp_hash.png
```

## Access Patterns

### Private Files
- Generated presigned URLs (1-hour expiry by default)
- Secure access control per organization
- No direct public access

### Public Files
- Direct URLs for email embedding
- CDN-friendly paths
- Optimized for email clients

## Implementation

### Service Usage
```typescript
import { s3Service } from '../services/s3.service';

// Upload profile photo
const result = await s3Service.uploadProfilePhoto(
  organizationId,
  userId,
  buffer,
  'image/jpeg',
  'profile.jpg'
);

// Upload signature template (public)
const signatureResult = await s3Service.uploadSignatureTemplate(
  organizationId,
  buffer,
  'image/png',
  'signature.png'
);

// Get presigned URL for private file
const url = await s3Service.getPresignedUrl(fileKey, false, 3600);

// Get public URL for email template
const publicUrl = s3Service.getPublicUrl(fileKey);
```

## Development Access

### MinIO Console
- URL: http://localhost:9001
- Username: `minioadmin`
- Password: `minioadmin123`

### API Endpoint
- S3 API: http://localhost:9000
- Use AWS SDK or MinIO client

## Security Features

### Presigned URLs
- Time-limited access (default 1 hour)
- Organization-scoped
- Revocable by deleting the object

### Access Control
- Each organization's files are isolated
- Service account credentials encrypted
- Audit logging for all operations

## Migration from Local Storage

### Current Local Storage Locations
- Profile photos: `/app/uploads/photos/`
- Templates: `/app/uploads/templates/`
- Signatures: `/app/uploads/signatures/`

### Migration Strategy
1. Read existing files from filesystem
2. Upload to appropriate S3 bucket
3. Update database with new S3 keys
4. Update photo service to use S3

## Production Deployment

### AWS S3
```env
S3_ENDPOINT=https://s3.amazonaws.com
S3_ACCESS_KEY=your-aws-access-key
S3_SECRET_KEY=your-aws-secret-key
S3_BUCKET_PRIVATE=helios-private-prod
S3_BUCKET_PUBLIC=helios-public-prod
S3_REGION=us-east-1
S3_USE_SSL=true
S3_PUBLIC_URL=https://cdn.helios.example.com
```

### CloudFlare R2
```env
S3_ENDPOINT=https://your-account.r2.cloudflarestorage.com
S3_ACCESS_KEY=your-r2-access-key
S3_SECRET_KEY=your-r2-secret-key
S3_BUCKET_PRIVATE=helios-private
S3_BUCKET_PUBLIC=helios-public
S3_REGION=auto
S3_USE_SSL=true
S3_PUBLIC_URL=https://cdn.helios.example.com
```

### DigitalOcean Spaces
```env
S3_ENDPOINT=https://nyc3.digitaloceanspaces.com
S3_ACCESS_KEY=your-do-access-key
S3_SECRET_KEY=your-do-secret-key
S3_BUCKET_PRIVATE=helios-private
S3_BUCKET_PUBLIC=helios-public
S3_REGION=nyc3
S3_USE_SSL=true
S3_PUBLIC_URL=https://helios-public.nyc3.cdn.digitaloceanspaces.com
```

## Benefits vs Google's Approach

### Our Implementation
- **Full control** over data and access
- **Presigned URLs** expire automatically
- **Organization isolation** built-in
- **CDN-ready** for global distribution
- **GDPR compliant** - data stays in your region

### Google's Public URLs
- URLs never expire (security risk)
- No access control after generation
- Data leaves your infrastructure
- Harder to revoke access
- Less control over data residency

## Next Steps

1. **Update photo service** to use S3 instead of local storage
2. **Migrate existing files** from filesystem to S3
3. **Implement image processing** (resize, optimize) before upload
4. **Add virus scanning** for uploaded files
5. **Set up lifecycle policies** for automatic archival
6. **Configure CDN** for production deployment