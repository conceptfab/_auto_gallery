import React from 'react';
import { ImageFile } from '@/src/types/gallery';

interface ImageGridProps {
  images: ImageFile[];
  onImageClick?: (image: ImageFile) => void;
  folderName: string;
  useCache?: boolean;
}

const ImageGrid: React.FC<ImageGridProps> = ({ images, onImageClick, folderName, useCache = false }) => {
  console.log('🖼️ ImageGrid rendering with', images.length, 'images, cache:', useCache);

  const getCachedImagePath = (image: ImageFile, isThumb: boolean = true) => {
    const baseName = image.name.split('.')[0];
    const suffix = isThumb ? '_thumb' : '_full';
    return `/cache/${folderName}/${baseName}${suffix}.webp`;
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>, image: ImageFile) => {
    console.warn('⚠️ Image load error, falling back to original:', image.name);
    const target = e.target as HTMLImageElement;
    
    // Jeśli to był cache, przełącz na oryginalny
    if (useCache && target.src.includes('/cache/')) {
      target.src = image.url;
    } else {
      // Jeśli oryginalny też nie działa, ukryj
      target.style.display = 'none';
    }
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
              onError={(e) => handleImageError(e, image)}
            />
          </div>
          <div className="image-title">
            {image.name}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ImageGrid;