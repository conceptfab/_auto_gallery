import React from 'react';
import { ImageFile } from '@/src/types/gallery';
import ImageMetadata from './ImageMetadata';
import { logger } from '@/src/utils/logger';

interface ImageGridProps {
  images: ImageFile[];
  onImageClick?: (image: ImageFile) => void;
  folderName: string;
}

const ImageGrid: React.FC<ImageGridProps> = ({ images, onImageClick, folderName }) => {
  logger.debug('ImageGrid rendering', { imagesCount: images.length, folderName });

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.target as HTMLImageElement;
    logger.warn('Image load error', { src: target.src, folderName });
    target.style.display = 'none';
  };

  const handleImageLoad = (image: ImageFile) => {
    logger.debug('Image loaded', { imageName: image.name, folderName });
  };

  const getOptimizedImageUrl = (image: ImageFile, size: 'thumb' | 'full' = 'thumb') => {
    return `/api/image-proxy?url=${encodeURIComponent(image.url)}&size=${size}`;
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
              src={getOptimizedImageUrl(image, 'thumb')}
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