import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PhotoUploadOptions {
  userId?: string;
  organizationId: string;
  photoType: 'avatar' | 'logo';
  aspectRatio?: number; // Default 1.0 for square
}

interface PhotoSize {
  key: string;
  width: number;
  height: number;
}

export class PhotoService {
  private uploadDir = path.join(__dirname, '../../uploads/photos');
  private publicUrl = process.env.PUBLIC_ASSET_URL || 'http://localhost:3001/assets';

  // Standard photo sizes
  private readonly PHOTO_SIZES: PhotoSize[] = [
    { key: '50', width: 50, height: 50 },
    { key: '100', width: 100, height: 100 },
    { key: '200', width: 200, height: 200 },
    { key: '400', width: 400, height: 400 }
  ];

  constructor() {
    this.ensureUploadDir();
  }

  private async ensureUploadDir() {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create upload directory', { error });
    }
  }

  /**
   * Upload and process a photo with multiple sizes
   */
  async uploadPhoto(
    imageBuffer: Buffer,
    options: PhotoUploadOptions
  ): Promise<{
    success: boolean;
    assetId?: string;
    urls?: Record<string, string>;
    error?: string;
  }> {
    try {
      const { userId, organizationId, photoType, aspectRatio = 1.0 } = options;

      // Validate image
      const image = sharp(imageBuffer);
      const metadata = await image.metadata();

      if (!metadata.width || !metadata.height) {
        return { success: false, error: 'Invalid image file' };
      }

      // Generate unique ID for this asset
      const assetId = uuidv4();
      const timestamp = Date.now();

      // Create asset record in database
      const assetResult = await db.query(`
        INSERT INTO public_assets (
          id, organization_id, asset_key, asset_type, module_source,
          file_name, original_file_name, file_path, public_url,
          mime_type, file_size_bytes, width, height,
          has_sizes, aspect_ratio, is_profile_photo, is_company_logo,
          uploaded_by, is_active
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
        ) RETURNING id
      `, [
        assetId,
        organizationId,
        `${photoType}_${timestamp}`,
        photoType === 'avatar' ? 'user_photo' : 'company_logo',
        'template-studio',
        `${assetId}_original.webp`,
        'original.webp',
        `/photos/${assetId}_original.webp`,
        `${this.publicUrl}/photos/${assetId}_original.webp`,
        'image/webp',
        imageBuffer.length,
        metadata.width,
        metadata.height,
        true,
        aspectRatio,
        photoType === 'avatar',
        photoType === 'logo',
        userId || null,
        true
      ]);

      // Save original (optimized)
      const originalPath = path.join(this.uploadDir, `${assetId}_original.webp`);
      await sharp(imageBuffer)
        .webp({ quality: 90 })
        .toFile(originalPath);

      // Generate and save all sizes
      const urls: Record<string, string> = {};

      for (const size of this.PHOTO_SIZES) {
        const filename = `${assetId}_${size.key}.webp`;
        const filePath = path.join(this.uploadDir, filename);
        const publicUrl = `${this.publicUrl}/photos/${filename}`;

        // Resize and optimize
        const resizedBuffer = await sharp(imageBuffer)
          .resize(size.width, size.height, {
            fit: 'cover',
            position: 'center'
          })
          .webp({ quality: 85 })
          .toBuffer();

        await fs.writeFile(filePath, resizedBuffer);

        // Store size in database
        await db.query(`
          INSERT INTO photo_sizes (
            original_asset_id, size_key, width, height,
            file_path, public_url, file_format, file_size_bytes,
            is_optimized, quality
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          assetId,
          size.key,
          size.width,
          size.height,
          `/photos/${filename}`,
          publicUrl,
          'webp',
          resizedBuffer.length,
          true,
          85
        ]);

        urls[size.key] = publicUrl;
      }

      // Update user or organization with photo URLs
      if (photoType === 'avatar' && userId) {
        await db.query(`
          UPDATE organization_users
          SET avatar_url = $1,
              avatar_url_50 = $2,
              avatar_url_100 = $3,
              avatar_url_200 = $4,
              avatar_url_400 = $5,
              avatar_asset_id = $6
          WHERE id = $7 AND organization_id = $8
        `, [
          urls['200'], // Default size
          urls['50'],
          urls['100'],
          urls['200'],
          urls['400'],
          assetId,
          userId,
          organizationId
        ]);
      } else if (photoType === 'logo') {
        await db.query(`
          UPDATE organizations
          SET company_logo_url = $1,
              company_logo_url_50 = $2,
              company_logo_url_100 = $3,
              company_logo_url_200 = $4,
              company_logo_url_400 = $5,
              company_logo_asset_id = $6
          WHERE id = $7
        `, [
          urls['200'], // Default size
          urls['50'],
          urls['100'],
          urls['200'],
          urls['400'],
          assetId,
          organizationId
        ]);
      }

      logger.info('Photo uploaded and processed successfully', {
        assetId,
        photoType,
        sizes: Object.keys(urls)
      });

      return {
        success: true,
        assetId,
        urls
      };

    } catch (error: any) {
      logger.error('Photo upload failed', { error: error.message });
      return {
        success: false,
        error: error.message || 'Failed to upload photo'
      };
    }
  }

  /**
   * Delete a photo and all its sizes
   */
  async deletePhoto(assetId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Get asset details
      const assetResult = await db.query(
        'SELECT file_name FROM public_assets WHERE id = $1',
        [assetId]
      );

      if (assetResult.rows.length === 0) {
        return { success: false, error: 'Asset not found' };
      }

      // Get all size files
      const sizesResult = await db.query(
        'SELECT file_path FROM photo_sizes WHERE original_asset_id = $1',
        [assetId]
      );

      // Delete physical files
      const originalPath = path.join(this.uploadDir, assetResult.rows[0].file_name);
      try {
        await fs.unlink(originalPath);
      } catch (err) {
        logger.warn('Failed to delete original file', { path: originalPath });
      }

      for (const sizeRow of sizesResult.rows) {
        const sizePath = path.join(this.uploadDir, path.basename(sizeRow.file_path));
        try {
          await fs.unlink(sizePath);
        } catch (err) {
          logger.warn('Failed to delete size file', { path: sizePath });
        }
      }

      // Delete database records (cascades to photo_sizes)
      await db.query('DELETE FROM public_assets WHERE id = $1', [assetId]);

      logger.info('Photo deleted successfully', { assetId });

      return { success: true };

    } catch (error: any) {
      logger.error('Photo deletion failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get photo URLs for a user or organization
   */
  async getPhotoUrls(
    entityId: string,
    entityType: 'user' | 'organization'
  ): Promise<Record<string, string> | null> {
    try {
      let query: string;
      if (entityType === 'user') {
        query = `
          SELECT avatar_url_50, avatar_url_100, avatar_url_200, avatar_url_400
          FROM organization_users
          WHERE id = $1
        `;
      } else {
        query = `
          SELECT company_logo_url_50, company_logo_url_100,
                 company_logo_url_200, company_logo_url_400
          FROM organizations
          WHERE id = $1
        `;
      }

      const result = await db.query(query, [entityId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        '50': entityType === 'user' ? row.avatar_url_50 : row.company_logo_url_50,
        '100': entityType === 'user' ? row.avatar_url_100 : row.company_logo_url_100,
        '200': entityType === 'user' ? row.avatar_url_200 : row.company_logo_url_200,
        '400': entityType === 'user' ? row.avatar_url_400 : row.company_logo_url_400
      };

    } catch (error: any) {
      logger.error('Failed to get photo URLs', { error: error.message });
      return null;
    }
  }
}

export const photoService = new PhotoService();
