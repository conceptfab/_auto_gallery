import React from 'react';
import { ImageFile } from '@/src/types/gallery';
import ImageMetadata from './ImageMetadata';

interface ImageGridProps {
  images: ImageFile[];
  onImageClick?: (image: ImageFile) => void;
  folderName: string;
}

const ImageGrid: React.FC<ImageGridProps> = ({ images, onImageClick, folderName }) => {
  console.log('🖼️ ImageGrid rendering with', images.length, 'images');

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.target as HTMLImageElement;
    console.warn('⚠️ Image load error:', target.src);
    target.style.display = 'none';
  };

  const handleImageLoad = (image: ImageFile) => {
    console.log('✅ Image loaded:', image.name);
  };
  return (
    <div className="image-grid">
      {images.map((image, index) => (
        <div 
          key={`${image.url}-${index}`} 
          className="image-item"
        >
          <div 
            className="image-container"
            onClick={() => onImageClick?.(image)}
          >
            <img
              src={image.url}
              alt={image.name}
              className="gallery-image"
              loading="lazy"
              onLoad={() => handleImageLoad(image)}
              onError={(e) => handleImageError(e)}
            />
          </div>
          <div className="image-title">
            <div className="image-title-top">
              <div className="image-name">{image.name}</div>
              <button 
                className="download-button"
                onClick={(e) => {
                  e.stopPropagation();
                  const link = document.createElement('a');
                  link.href = image.url;
                  link.download = image.name;
                  link.click();
                }}
                title="Pobierz plik"
              >
                <i className="las la-download"></i>
              </button>
            </div>
            <ImageMetadata src={image.url} fileSize={image.fileSize} lastModified={image.lastModified} />
          </div>
        </div>
      ))}
    </div>
  );
};

export default ImageGrid;