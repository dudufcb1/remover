import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';

interface ImageFile {
  id: string;
  file: File;
  preview: string;
}

interface ImageBatchUploaderProps {
  onImagesSelected: (images: ImageFile[]) => void;
  maxFiles?: number;
  className?: string;
}

export const ImageBatchUploader = ({ onImagesSelected, maxFiles = 10, className = '' }: ImageBatchUploaderProps) => {
  const [images, setImages] = useState<ImageFile[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newImages = acceptedFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      preview: URL.createObjectURL(file)
    }));

    const updatedImages = [...images, ...newImages].slice(0, maxFiles);
    setImages(updatedImages);
    onImagesSelected(updatedImages);
  }, [images, maxFiles, onImagesSelected]);

  const removeImage = (id: string) => {
    const updatedImages = images.filter(img => img.id !== id);
    setImages(updatedImages);
    onImagesSelected(updatedImages);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp']
    },
    maxFiles
  });

  return (
    <div className={`batch-uploader ${className}`}>
      <div 
        {...getRootProps()} 
        className={`dropzone ${isDragActive ? 'active' : ''}`}
      >
        <input {...getInputProps()} />
        <p>Drag & drop images here, or click to select files</p>
        <p className="file-info">Accepts PNG, JPG, JPEG, WebP (max {maxFiles} files)</p>
      </div>

      {images.length > 0 && (
        <div className="preview-container">
          {images.map((image) => (
            <div key={image.id} className="preview-item">
              <img
                src={image.preview}
                alt={image.file.name}
                className="preview-image"
              />
              <button
                onClick={() => removeImage(image.id)}
                className="remove-button"
                title="Remove image"
              >
                ×
              </button>
              <div className="image-name">{image.file.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};