import { s3Service } from './s3.service.js';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';

// Supported media types and their constraints
const MEDIA_CONFIG = {
  voice_intro: {
    maxDurationSeconds: 60,
    maxSizeBytes: 5 * 1024 * 1024, // 5MB
    allowedMimeTypes: ['audio/webm', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/wav'],
  },
  video_intro: {
    maxDurationSeconds: 120,
    maxSizeBytes: 50 * 1024 * 1024, // 50MB
    allowedMimeTypes: ['video/webm', 'video/mp4', 'video/quicktime'],
  },
  name_pronunciation: {
    maxDurationSeconds: 10,
    maxSizeBytes: 1 * 1024 * 1024, // 1MB
    allowedMimeTypes: ['audio/webm', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/wav'],
  },
};

export type MediaType = keyof typeof MEDIA_CONFIG;

interface UploadMediaParams {
  userId: string;
  organizationId: string;
  mediaType: MediaType;
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  durationSeconds?: number;
}

interface MediaUploadResult {
  success: boolean;
  mediaId?: string;
  presignedUrl?: string;
  error?: string;
}

interface MediaInfo {
  id: string;
  mediaType: MediaType;
  fileName: string;
  durationSeconds: number | null;
  transcription: string | null;
  presignedUrl: string;
  createdAt: Date;
}

class MediaUploadService {
  /**
   * Validate media file before upload
   */
  validateMedia(
    mediaType: MediaType,
    buffer: Buffer,
    mimeType: string,
    durationSeconds?: number
  ): { valid: boolean; error?: string } {
    const config = MEDIA_CONFIG[mediaType];

    if (!config) {
      return { valid: false, error: `Invalid media type: ${mediaType}` };
    }

    // Check mime type
    if (!config.allowedMimeTypes.includes(mimeType)) {
      return {
        valid: false,
        error: `Invalid file type. Allowed: ${config.allowedMimeTypes.join(', ')}`,
      };
    }

    // Check file size
    if (buffer.length > config.maxSizeBytes) {
      const maxMB = config.maxSizeBytes / (1024 * 1024);
      return { valid: false, error: `File too large. Maximum size: ${maxMB}MB` };
    }

    // Check duration if provided
    if (durationSeconds !== undefined && durationSeconds > config.maxDurationSeconds) {
      return {
        valid: false,
        error: `Duration too long. Maximum: ${config.maxDurationSeconds} seconds`,
      };
    }

    return { valid: true };
  }

  /**
   * Upload media file for a user
   */
  async uploadMedia(params: UploadMediaParams): Promise<MediaUploadResult> {
    const { userId, organizationId, mediaType, buffer, mimeType, fileName, durationSeconds } =
      params;

    try {
      // Validate
      const validation = this.validateMedia(mediaType, buffer, mimeType, durationSeconds);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Delete existing media of this type if it exists
      await this.deleteMedia(userId, mediaType);

      // Generate storage path
      const timestamp = Date.now();
      const extension = fileName.split('.').pop() || 'bin';
      const storagePath = `${organizationId}/media/${userId}/${mediaType}_${timestamp}.${extension}`;

      // Upload to S3
      const uploadResult = await s3Service.uploadFile(
        buffer,
        {
          organizationId,
          userId,
          category: 'profile',
          originalName: fileName,
          mimeType,
          size: buffer.length,
        },
        false // Private bucket for media
      );

      if (!uploadResult.success) {
        return { success: false, error: uploadResult.error };
      }

      // Save to database
      const result = await db.query(
        `INSERT INTO user_media (
          user_id, organization_id, media_type, storage_path, storage_bucket,
          file_name, file_size, mime_type, duration_seconds
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (user_id, media_type)
        DO UPDATE SET
          storage_path = EXCLUDED.storage_path,
          file_name = EXCLUDED.file_name,
          file_size = EXCLUDED.file_size,
          mime_type = EXCLUDED.mime_type,
          duration_seconds = EXCLUDED.duration_seconds,
          transcription = NULL,
          transcription_status = 'pending',
          updated_at = NOW()
        RETURNING id`,
        [
          userId,
          organizationId,
          mediaType,
          uploadResult.key,
          'helios-uploads',
          fileName,
          buffer.length,
          mimeType,
          durationSeconds || null,
        ]
      );

      const mediaId = result.rows[0].id;

      // Update profile completeness
      await db.query(
        `UPDATE organization_users
         SET profile_completeness = calculate_profile_completeness($1),
             profile_updated_at = NOW()
         WHERE id = $1`,
        [userId]
      );

      // Get presigned URL for immediate playback
      const presignedUrl = await s3Service.getPresignedUrl(uploadResult.key!, false, 3600);

      logger.info(`Media uploaded for user ${userId}: ${mediaType}`);

      return {
        success: true,
        mediaId,
        presignedUrl,
      };
    } catch (error: any) {
      logger.error('Failed to upload media:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get media info with presigned URL
   */
  async getMedia(userId: string, mediaType: MediaType): Promise<MediaInfo | null> {
    try {
      const result = await db.query(
        `SELECT id, media_type, storage_path, file_name, duration_seconds,
                transcription, created_at
         FROM user_media
         WHERE user_id = $1 AND media_type = $2`,
        [userId, mediaType]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];

      // Get presigned URL
      const presignedUrl = await s3Service.getPresignedUrl(row.storage_path, false, 3600);

      return {
        id: row.id,
        mediaType: row.media_type,
        fileName: row.file_name,
        durationSeconds: row.duration_seconds,
        transcription: row.transcription,
        presignedUrl,
        createdAt: row.created_at,
      };
    } catch (error: any) {
      logger.error('Failed to get media:', error);
      return null;
    }
  }

  /**
   * Get all media for a user
   */
  async getAllMedia(userId: string): Promise<Record<MediaType, MediaInfo | null>> {
    const result: Record<MediaType, MediaInfo | null> = {
      voice_intro: null,
      video_intro: null,
      name_pronunciation: null,
    };

    for (const mediaType of Object.keys(MEDIA_CONFIG) as MediaType[]) {
      result[mediaType] = await this.getMedia(userId, mediaType);
    }

    return result;
  }

  /**
   * Delete media
   */
  async deleteMedia(userId: string, mediaType: MediaType): Promise<boolean> {
    try {
      // Get storage path first
      const result = await db.query(
        `SELECT storage_path FROM user_media WHERE user_id = $1 AND media_type = $2`,
        [userId, mediaType]
      );

      if (result.rows.length > 0) {
        // Delete from S3
        await s3Service.deleteFile(result.rows[0].storage_path, false);

        // Delete from database
        await db.query(`DELETE FROM user_media WHERE user_id = $1 AND media_type = $2`, [
          userId,
          mediaType,
        ]);

        // Update profile completeness
        await db.query(
          `UPDATE organization_users
           SET profile_completeness = calculate_profile_completeness($1),
               profile_updated_at = NOW()
           WHERE id = $1`,
          [userId]
        );

        logger.info(`Media deleted for user ${userId}: ${mediaType}`);
      }

      return true;
    } catch (error: any) {
      logger.error('Failed to delete media:', error);
      return false;
    }
  }

  /**
   * Get media constraints for client validation
   */
  getMediaConstraints(): typeof MEDIA_CONFIG {
    return MEDIA_CONFIG;
  }
}

export const mediaUploadService = new MediaUploadService();
