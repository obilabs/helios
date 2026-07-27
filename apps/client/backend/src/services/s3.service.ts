import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CreateBucketCommand,
  GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from '../utils/logger.js';
import { Readable } from 'stream';
import crypto from 'crypto';

interface S3Config {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucketPrivate: string;
  bucketPublic: string;
  region: string;
  useSSL: boolean;
  publicUrl: string;
}

interface UploadResult {
  success: boolean;
  key?: string;
  url?: string;
  error?: string;
}

interface FileMetadata {
  organizationId: string;
  userId?: string;
  category: 'profile' | 'signature' | 'template' | 'document' | 'public';
  originalName: string;
  mimeType: string;
  size: number;
}

class S3Service {
  private client: S3Client;
  private config: S3Config;
  private initialized: boolean = false;

  constructor() {
    this.config = {
      endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
      accessKey: process.env.S3_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.S3_SECRET_KEY || 'minioadmin123',
      bucketPrivate: process.env.S3_BUCKET_PRIVATE || 'helios-uploads',
      bucketPublic: process.env.S3_BUCKET_PUBLIC || 'helios-public',
      region: process.env.S3_REGION || 'us-east-1',
      useSSL: process.env.S3_USE_SSL === 'true',
      publicUrl: process.env.S3_PUBLIC_URL || 'http://localhost:9000',
    };

    this.client = new S3Client({
      endpoint: this.config.endpoint,
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKey,
        secretAccessKey: this.config.secretKey,
      },
      forcePathStyle: true, // Required for MinIO
    });
  }

  /**
   * Initialize buckets if they don't exist
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Create private bucket
      await this.createBucketIfNotExists(this.config.bucketPrivate);

      // Create public bucket
      await this.createBucketIfNotExists(this.config.bucketPublic);

      this.initialized = true;
      logger.info('S3 service initialized successfully');
    } catch (error: any) {
      logger.error('Failed to initialize S3 service:', error);
      throw error;
    }
  }

  /**
   * Create bucket if it doesn't exist
   */
  private async createBucketIfNotExists(bucket: string): Promise<void> {
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
      logger.info(`Created S3 bucket: ${bucket}`);
    } catch (error: any) {
      if (error.name === 'BucketAlreadyOwnedByYou' || error.name === 'BucketAlreadyExists') {
        logger.debug(`Bucket ${bucket} already exists`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Generate a unique key for a file
   */
  private generateFileKey(metadata: FileMetadata): string {
    const timestamp = Date.now();
    const hash = crypto.randomBytes(8).toString('hex');
    const extension = metadata.originalName.split('.').pop() || 'bin';

    // Structure: org/category/year/month/filename
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    return `${metadata.organizationId}/${metadata.category}/${year}/${month}/${timestamp}_${hash}.${extension}`;
  }

  /**
   * Upload a file to S3
   */
  async uploadFile(
    buffer: Buffer,
    metadata: FileMetadata,
    isPublic: boolean = false
  ): Promise<UploadResult> {
    try {
      await this.initialize();

      const key = this.generateFileKey(metadata);
      const bucket = isPublic ? this.config.bucketPublic : this.config.bucketPrivate;

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: metadata.mimeType,
        Metadata: {
          organizationId: metadata.organizationId,
          userId: metadata.userId || '',
          category: metadata.category,
          originalName: metadata.originalName,
        },
      });

      await this.client.send(command);

      // Generate URL based on whether it's public or private
      let url: string;
      if (isPublic) {
        // Public files get a direct URL
        url = `${this.config.publicUrl}/${bucket}/${key}`;
      } else {
        // Private files get a presigned URL (valid for 1 hour)
        url = await this.getPresignedUrl(key, false);
      }

      logger.info(`File uploaded to S3: ${key}`);

      return {
        success: true,
        key,
        url,
      };
    } catch (error: any) {
      logger.error('Failed to upload file to S3:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get a presigned URL for file access
   */
  async getPresignedUrl(
    key: string,
    isPublic: boolean = false,
    expiresIn: number = 3600 // 1 hour default
  ): Promise<string> {
    try {
      const bucket = isPublic ? this.config.bucketPublic : this.config.bucketPrivate;

      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      return await getSignedUrl(this.client, command, { expiresIn });
    } catch (error: any) {
      logger.error('Failed to generate presigned URL:', error);
      throw error;
    }
  }

  /**
   * Download a file from S3
   */
  async downloadFile(key: string, isPublic: boolean = false): Promise<Buffer | null> {
    try {
      const bucket = isPublic ? this.config.bucketPublic : this.config.bucketPrivate;

      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const response: GetObjectCommandOutput = await this.client.send(command);

      if (response.Body) {
        const stream = response.Body as Readable;
        const chunks: Buffer[] = [];

        return new Promise((resolve, reject) => {
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('end', () => resolve(Buffer.concat(chunks)));
          stream.on('error', reject);
        });
      }

      return null;
    } catch (error: any) {
      logger.error('Failed to download file from S3:', error);
      return null;
    }
  }

  /**
   * Delete a file from S3
   */
  async deleteFile(key: string, isPublic: boolean = false): Promise<boolean> {
    try {
      const bucket = isPublic ? this.config.bucketPublic : this.config.bucketPrivate;

      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      await this.client.send(command);
      logger.info(`File deleted from S3: ${key}`);
      return true;
    } catch (error: any) {
      logger.error('Failed to delete file from S3:', error);
      return false;
    }
  }

  /**
   * Check if a file exists
   */
  async fileExists(key: string, isPublic: boolean = false): Promise<boolean> {
    try {
      const bucket = isPublic ? this.config.bucketPublic : this.config.bucketPrivate;

      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      await this.client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound') {
        return false;
      }
      logger.error('Failed to check file existence:', error);
      throw error;
    }
  }

  /**
   * List files with a prefix
   */
  async listFiles(
    prefix: string,
    isPublic: boolean = false,
    maxKeys: number = 1000
  ): Promise<string[]> {
    try {
      const bucket = isPublic ? this.config.bucketPublic : this.config.bucketPrivate;

      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: maxKeys,
      });

      const response = await this.client.send(command);
      return response.Contents?.map((item) => item.Key || '') || [];
    } catch (error: any) {
      logger.error('Failed to list files from S3:', error);
      return [];
    }
  }

  /**
   * Upload a user profile photo
   */
  async uploadProfilePhoto(
    organizationId: string,
    userId: string,
    buffer: Buffer,
    mimeType: string,
    originalName: string
  ): Promise<UploadResult> {
    return this.uploadFile(
      buffer,
      {
        organizationId,
        userId,
        category: 'profile',
        originalName,
        mimeType,
        size: buffer.length,
      },
      false // Profile photos are private
    );
  }

  /**
   * Upload a signature template image
   */
  async uploadSignatureTemplate(
    organizationId: string,
    buffer: Buffer,
    mimeType: string,
    originalName: string
  ): Promise<UploadResult> {
    return this.uploadFile(
      buffer,
      {
        organizationId,
        category: 'signature',
        originalName,
        mimeType,
        size: buffer.length,
      },
      true // Signature templates are public for email display
    );
  }

  /**
   * Upload a template asset
   */
  async uploadTemplateAsset(
    organizationId: string,
    buffer: Buffer,
    mimeType: string,
    originalName: string
  ): Promise<UploadResult> {
    return this.uploadFile(
      buffer,
      {
        organizationId,
        category: 'template',
        originalName,
        mimeType,
        size: buffer.length,
      },
      true // Template assets are public
    );
  }

  /**
   * Get the public URL for a file (for email templates, etc.)
   */
  getPublicUrl(key: string): string {
    return `${this.config.publicUrl}/${this.config.bucketPublic}/${key}`;
  }
}

export const s3Service = new S3Service();