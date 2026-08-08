import { useState, useRef, useCallback } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import './ImageCropper.css';

interface ImageCropperProps {
  onImageCropped: (croppedImageBlob: Blob) => void;
  onCancel: () => void;
  aspectRatio?: number; // Default 1 for square
  minWidth?: number;
  minHeight?: number;
  outputFormat?: 'webp' | 'jpeg' | 'png';
  outputQuality?: number;
}

export function ImageCropper({
  onImageCropped,
  onCancel,
  aspectRatio = 1,
  minWidth = 200,
  minHeight = 200,
  outputFormat = 'webp',
  outputQuality = 0.9
}: ImageCropperProps) {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [crop, setCrop] = useState<Crop>({
    unit: '%',
    width: 90,
    height: 90,
    x: 5,
    y: 5
  });
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];

      // Validate file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        setError('File size must be less than 5MB');
        return;
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }

      setError(null);

      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setImageSrc(reader.result?.toString() || '');
      });
      reader.readAsDataURL(file);
    }
  };

  const getCroppedImg = useCallback(
    async (image: HTMLImageElement, pixelCrop: PixelCrop): Promise<Blob> => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('No 2d context');
      }

      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;

      // Set canvas size to the cropped area size
      canvas.width = pixelCrop.width * scaleX;
      canvas.height = pixelCrop.height * scaleY;

      // Draw the cropped image
      ctx.drawImage(
        image,
        pixelCrop.x * scaleX,
        pixelCrop.y * scaleY,
        pixelCrop.width * scaleX,
        pixelCrop.height * scaleY,
        0,
        0,
        canvas.width,
        canvas.height
      );

      // Convert canvas to blob
      return new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Canvas is empty'));
              return;
            }
            resolve(blob);
          },
          `image/${outputFormat}`,
          outputQuality
        );
      });
    },
    [outputFormat, outputQuality]
  );

  const handleCropComplete = async () => {
    if (!completedCrop || !imgRef.current) {
      setError('Please select an area to crop');
      return;
    }

    // Validate minimum dimensions
    if (completedCrop.width < minWidth || completedCrop.height < minHeight) {
      setError(`Cropped area must be at least ${minWidth}x${minHeight} pixels`);
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);

      const croppedImageBlob = await getCroppedImg(imgRef.current, completedCrop);

      onImageCropped(croppedImageBlob);
    } catch (err: any) {
      setError(err.message || 'Failed to crop image');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="image-cropper-modal">
      <div className="image-cropper-content">
        <div className="image-cropper-header">
          <h2>Upload and Crop Photo</h2>
          <button className="close-button" onClick={onCancel} disabled={isProcessing}>
            ✕
          </button>
        </div>

        <div className="image-cropper-body">
          {error && (
            <div className="error-message">{error}</div>
          )}

          {!imageSrc ? (
            <div className="upload-area">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onSelectFile}
                className="file-input"
                id="photo-upload"
              />
              <label htmlFor="photo-upload" className="upload-label">
                <div className="upload-icon">📸</div>
                <div className="upload-text">
                  <strong>Click to upload</strong> or drag and drop
                </div>
                <div className="upload-hint">
                  PNG, JPG, GIF up to 5MB
                </div>
              </label>
            </div>
          ) : (
            <>
              <div className="crop-container">
                <ReactCrop
                  crop={crop}
                  onChange={(c) => setCrop(c)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={aspectRatio}
                  minWidth={minWidth}
                  minHeight={minHeight}
                >
                  <img
                    ref={imgRef}
                    src={imageSrc}
                    alt="Crop preview"
                    style={{ maxHeight: '400px', maxWidth: '100%' }}
                  />
                </ReactCrop>
              </div>

              <div className="crop-instructions">
                <p>
                  <strong>Instructions:</strong> Drag the corners to adjust the crop area.
                  The image will be automatically resized to multiple sizes for optimal display.
                </p>
              </div>

              <button
                className="btn-secondary"
                onClick={() => {
                  setImageSrc('');
                  setCrop({
                    unit: '%',
                    width: 90,
                    height: 90,
                    x: 5,
                    y: 5
                  });
                  setCompletedCrop(null);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
                disabled={isProcessing}
              >
                Choose Different Photo
              </button>
            </>
          )}
        </div>

        {imageSrc && (
          <div className="image-cropper-footer">
            <button
              className="btn-secondary"
              onClick={onCancel}
              disabled={isProcessing}
            >
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleCropComplete}
              disabled={isProcessing || !completedCrop}
            >
              {isProcessing ? '⏳ Processing...' : '✅ Upload Photo'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
