import { useState, useRef, useCallback } from 'react';
import {
  Upload,
  Video,
  AlertCircle,
  Loader2,
  Play,
  Trash2,
  CheckCircle,
} from 'lucide-react';
import { profileService } from '../services/profile.service';
import './VideoUploader.css';

interface VideoUploaderProps {
  maxDuration?: number; // in seconds
  maxSizeMB?: number;
  acceptedFormats?: string[];
  existingVideoUrl?: string;
  existingThumbnailUrl?: string;
  existingDuration?: number;
  onUploadSuccess?: () => void;
  onDelete?: () => void;
}

type UploadState = 'idle' | 'selected' | 'uploading' | 'success' | 'error';

export function VideoUploader({
  maxDuration = 120, // 2 minutes default
  maxSizeMB = 50,
  acceptedFormats = ['video/mp4', 'video/webm', 'video/quicktime'],
  existingVideoUrl,
  existingThumbnailUrl,
  existingDuration,
  onUploadSuccess,
  onDelete,
}: VideoUploaderProps) {
  const [state, setState] = useState<UploadState>(
    existingVideoUrl ? 'success' : 'idle'
  );
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(existingVideoUrl || null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(
    existingThumbnailUrl || null
  );
  const [duration, setDuration] = useState<number>(existingDuration || 0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Handle file selection
  const handleFileSelect = useCallback(
    (selectedFile: File) => {
      setError(null);

      // Validate file type
      if (!acceptedFormats.includes(selectedFile.type)) {
        setError(
          `Invalid file type. Accepted formats: ${acceptedFormats
            .map((f) => f.split('/')[1].toUpperCase())
            .join(', ')}`
        );
        return;
      }

      // Validate file size
      const sizeMB = selectedFile.size / (1024 * 1024);
      if (sizeMB > maxSizeMB) {
        setError(`File too large. Maximum size: ${maxSizeMB}MB`);
        return;
      }

      // Create preview URL
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
      setFile(selectedFile);
      setState('selected');

      // Create thumbnail and validate duration
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.src = url;

      video.onloadedmetadata = () => {
        // Validate duration
        if (video.duration > maxDuration) {
          setError(
            `Video too long. Maximum duration: ${Math.floor(maxDuration / 60)}:${(
              maxDuration % 60
            )
              .toString()
              .padStart(2, '0')}`
          );
          URL.revokeObjectURL(url);
          setPreviewUrl(null);
          setFile(null);
          setState('idle');
          return;
        }

        setDuration(video.duration);

        // Generate thumbnail from first frame
        video.currentTime = Math.min(1, video.duration / 2);
      };

      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          setThumbnailUrl(canvas.toDataURL('image/jpeg', 0.8));
        }
      };
    },
    [acceptedFormats, maxSizeMB, maxDuration]
  );

  // Handle drag and drop
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        handleFileSelect(droppedFile);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  // Handle file input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  // Upload the video
  const handleUpload = async () => {
    if (!file) return;

    setState('uploading');
    setUploadProgress(0);
    setError(null);

    try {
      const result = await profileService.uploadMedia('video_intro', file, duration);

      if (result) {
        setPreviewUrl(result.presignedUrl);
        setState('success');
        setFile(null);
        onUploadSuccess?.();
      } else {
        throw new Error('Upload failed');
      }
    } catch (err: any) {
      console.error('Failed to upload video:', err);
      setError(err.message || 'Failed to upload video. Please try again.');
      setState('selected');
    }
  };

  // Delete the video
  const handleDelete = async () => {
    if (existingVideoUrl) {
      const success = await profileService.deleteMedia('video_intro');
      if (success && onDelete) {
        onDelete();
      }
    }

    // Clear local state
    if (previewUrl && previewUrl !== existingVideoUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setThumbnailUrl(null);
    setFile(null);
    setDuration(0);
    setError(null);
    setState('idle');
  };

  // Cancel selection
  const handleCancel = () => {
    if (previewUrl && previewUrl !== existingVideoUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(existingVideoUrl || null);
    setThumbnailUrl(existingThumbnailUrl || null);
    setFile(null);
    setDuration(existingDuration || 0);
    setError(null);
    setState(existingVideoUrl ? 'success' : 'idle');
  };

  // Toggle video preview playback
  const togglePreview = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play().catch(console.error);
    }
  };

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Format file size
  const formatSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div className="video-uploader">
      <div className="video-uploader-header">
        <h4>Video Introduction</h4>
        <p>Upload a short video introducing yourself (up to {formatDuration(maxDuration)})</p>
      </div>

      {error && (
        <div className="video-uploader-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {state === 'idle' && (
        <div
          className="video-dropzone"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptedFormats.join(',')}
            onChange={handleInputChange}
            style={{ display: 'none' }}
          />
          <Video size={32} className="dropzone-icon" />
          <p className="dropzone-text">
            Drag and drop your video here, or <span>browse</span>
          </p>
          <p className="dropzone-hint">
            Max {maxSizeMB}MB, {formatDuration(maxDuration)} duration
          </p>
        </div>
      )}

      {(state === 'selected' || state === 'success') && previewUrl && (
        <div className="video-preview">
          <div className="preview-container" onClick={togglePreview}>
            {thumbnailUrl && !isPlaying ? (
              <img src={thumbnailUrl} alt="Video thumbnail" className="preview-thumbnail" />
            ) : (
              <video
                ref={videoRef}
                src={previewUrl}
                className="preview-video"
                onEnded={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            )}
            {!isPlaying && (
              <div className="preview-play-overlay">
                <Play size={32} />
              </div>
            )}
            <div className="preview-duration">{formatDuration(duration)}</div>
          </div>

          <div className="preview-info">
            {file && (
              <>
                <span className="file-name">{file.name}</span>
                <span className="file-size">{formatSize(file.size)}</span>
              </>
            )}
            {state === 'success' && !file && (
              <span className="upload-status success">
                <CheckCircle size={14} />
                Uploaded
              </span>
            )}
          </div>

          <div className="preview-actions">
            {state === 'selected' && (
              <>
                <button className="btn-cancel" onClick={handleCancel}>
                  Cancel
                </button>
                <button className="btn-upload" onClick={handleUpload}>
                  <Upload size={16} />
                  Upload Video
                </button>
              </>
            )}
            {state === 'success' && (
              <button className="btn-delete" onClick={handleDelete}>
                <Trash2 size={16} />
                Remove
              </button>
            )}
          </div>
        </div>
      )}

      {state === 'uploading' && (
        <div className="upload-progress">
          <div className="progress-content">
            <Loader2 size={24} className="spinner" />
            <p>Uploading video...</p>
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <span className="progress-text">{uploadProgress}%</span>
        </div>
      )}
    </div>
  );
}
