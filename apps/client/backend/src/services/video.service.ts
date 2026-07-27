import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { s3Service } from './s3.service.js';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';

interface ThumbnailResult {
  success: boolean;
  thumbnailKey?: string;
  thumbnailUrl?: string;
  error?: string;
}

interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  codec: string;
  format: string;
}

class VideoService {
  private ffmpegAvailable: boolean | null = null;

  /**
   * Check if ffmpeg is available on the system
   */
  async checkFfmpegAvailable(): Promise<boolean> {
    if (this.ffmpegAvailable !== null) {
      return this.ffmpegAvailable;
    }

    return new Promise((resolve) => {
      const proc = spawn('ffmpeg', ['-version']);
      proc.on('error', () => {
        this.ffmpegAvailable = false;
        resolve(false);
      });
      proc.on('close', (code) => {
        this.ffmpegAvailable = code === 0;
        resolve(this.ffmpegAvailable);
      });
    });
  }

  /**
   * Generate thumbnail from video at specified time
   */
  async generateThumbnail(
    videoBuffer: Buffer,
    timeSeconds: number = 1,
    width: number = 480
  ): Promise<Buffer | null> {
    const ffmpegAvailable = await this.checkFfmpegAvailable();
    if (!ffmpegAvailable) {
      logger.warn('ffmpeg not available, skipping thumbnail generation');
      return null;
    }

    const tempDir = os.tmpdir();
    const tempInputPath = path.join(tempDir, `video_${Date.now()}.mp4`);
    const tempOutputPath = path.join(tempDir, `thumb_${Date.now()}.jpg`);

    try {
      // Write video buffer to temp file
      await fs.promises.writeFile(tempInputPath, videoBuffer);

      // Generate thumbnail using ffmpeg
      await new Promise<void>((resolve, reject) => {
        const args = [
          '-i', tempInputPath,
          '-ss', timeSeconds.toString(),
          '-vframes', '1',
          '-vf', `scale=${width}:-1`,
          '-q:v', '2',
          '-f', 'image2',
          tempOutputPath,
        ];

        const proc = spawn('ffmpeg', args);

        let stderr = '';
        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        proc.on('error', (err) => {
          reject(new Error(`ffmpeg process error: ${err.message}`));
        });

        proc.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
          }
        });
      });

      // Read thumbnail file
      const thumbnailBuffer = await fs.promises.readFile(tempOutputPath);

      return thumbnailBuffer;
    } catch (error: any) {
      logger.error('Failed to generate thumbnail:', error);
      return null;
    } finally {
      // Cleanup temp files
      try {
        await fs.promises.unlink(tempInputPath).catch(() => {});
        await fs.promises.unlink(tempOutputPath).catch(() => {});
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Get video metadata using ffprobe
   */
  async getVideoMetadata(videoBuffer: Buffer): Promise<VideoMetadata | null> {
    const ffmpegAvailable = await this.checkFfmpegAvailable();
    if (!ffmpegAvailable) {
      return null;
    }

    const tempDir = os.tmpdir();
    const tempPath = path.join(tempDir, `video_${Date.now()}.mp4`);

    try {
      await fs.promises.writeFile(tempPath, videoBuffer);

      const metadata = await new Promise<VideoMetadata>((resolve, reject) => {
        const args = [
          '-v', 'error',
          '-select_streams', 'v:0',
          '-show_entries', 'stream=width,height,codec_name,duration',
          '-show_entries', 'format=duration,format_name',
          '-of', 'json',
          tempPath,
        ];

        const proc = spawn('ffprobe', args);
        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        proc.on('error', (err) => {
          reject(new Error(`ffprobe process error: ${err.message}`));
        });

        proc.on('close', (code) => {
          if (code === 0) {
            try {
              const data = JSON.parse(stdout);
              const stream = data.streams?.[0] || {};
              const format = data.format || {};

              resolve({
                duration: parseFloat(stream.duration || format.duration || '0'),
                width: stream.width || 0,
                height: stream.height || 0,
                codec: stream.codec_name || 'unknown',
                format: format.format_name || 'unknown',
              });
            } catch (parseError) {
              reject(new Error(`Failed to parse ffprobe output: ${stdout}`));
            }
          } else {
            reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
          }
        });
      });

      return metadata;
    } catch (error: any) {
      logger.error('Failed to get video metadata:', error);
      return null;
    } finally {
      try {
        await fs.promises.unlink(tempPath).catch(() => {});
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Generate and upload thumbnail for a user's video
   */
  async generateAndStoreThumbnail(
    userId: string,
    organizationId: string,
    videoBuffer: Buffer,
    mediaId: string
  ): Promise<ThumbnailResult> {
    try {
      // Generate thumbnail at 1 second mark
      const thumbnailBuffer = await this.generateThumbnail(videoBuffer, 1, 480);

      if (!thumbnailBuffer) {
        return {
          success: false,
          error: 'Failed to generate thumbnail (ffmpeg may not be available)',
        };
      }

      // Upload thumbnail to S3
      const timestamp = Date.now();
      const uploadResult = await s3Service.uploadFile(
        thumbnailBuffer,
        {
          organizationId,
          userId,
          category: 'profile',
          originalName: `video_thumbnail_${timestamp}.jpg`,
          mimeType: 'image/jpeg',
          size: thumbnailBuffer.length,
        },
        false // Private bucket
      );

      if (!uploadResult.success) {
        return { success: false, error: uploadResult.error };
      }

      // Update database with thumbnail path
      await db.query(
        `UPDATE user_media
         SET thumbnail_path = $1, updated_at = NOW()
         WHERE id = $2`,
        [uploadResult.key, mediaId]
      );

      // Get presigned URL
      const thumbnailUrl = await s3Service.getPresignedUrl(
        uploadResult.key!,
        false,
        3600
      );

      logger.info(`Thumbnail generated for video: ${mediaId}`);

      return {
        success: true,
        thumbnailKey: uploadResult.key,
        thumbnailUrl,
      };
    } catch (error: any) {
      logger.error('Failed to generate and store thumbnail:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get thumbnail URL for a user's video
   */
  async getThumbnailUrl(userId: string): Promise<string | null> {
    try {
      const result = await db.query(
        `SELECT thumbnail_path FROM user_media
         WHERE user_id = $1 AND media_type = 'video_intro' AND thumbnail_path IS NOT NULL`,
        [userId]
      );

      if (result.rows.length === 0 || !result.rows[0].thumbnail_path) {
        return null;
      }

      return s3Service.getPresignedUrl(result.rows[0].thumbnail_path, false, 3600);
    } catch (error: any) {
      logger.error('Failed to get thumbnail URL:', error);
      return null;
    }
  }
}

export const videoService = new VideoService();
