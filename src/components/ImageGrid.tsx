import React from 'react';
import { ImageFile } from '@/src/types/gallery';
import ImageMetadata from './ImageMetadata';
import decorConverter from '@/src/utils/decorConverter';

interface ImageGridProps {
  images: ImageFile[];
  onImageClick?: (image: ImageFile, imagesInFolder: ImageFile[]) => void;
  folderName: string;
  kolorystykaImages?: ImageFile[];
}

const ImageGrid: React.FC<ImageGridProps> = ({
  images,
  onImageClick,
  folderName,
  kolorystykaImages = [],
}) => {
  console.log('🖼️ ImageGrid rendering with', images.length, 'images');
  const [hoveredPreview, setHoveredPreview] = React.useState<{
    image: ImageFile;
    x: number;
    y: number;
  } | null>(null);

  const getDisplayName = (name: string) => {
    // 1) usuń rozszerzenie
    const lastDotIndex = name.lastIndexOf('.');
    let baseName = lastDotIndex === -1 ? name : name.substring(0, lastDotIndex);

    // 2) usuń wszystko od "__Shot" włącznie
    const shotIndex = baseName.indexOf('__Shot');
    if (shotIndex !== -1) {
      baseName = baseName.substring(0, shotIndex);
    }

    // 3) zamień podkreślenia na spacje
    baseName = baseName.replace(/_+/g, ' ');

    // 4) zwróć w kapitalikach
    return baseName.trim().toUpperCase();
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.target as HTMLImageElement;
    console.warn('⚠️ Image load error:', target.src);
    target.style.display = 'none';
  };

  const handleImageLoad = (image: ImageFile) => {
    console.log('✅ Image loaded:', image.name);
  };

  const getOptimizedImageUrl = (
    image: ImageFile,
    size: 'thumb' | 'full' = 'thumb',
  ) => {
    return `/api/image-proxy?url=${encodeURIComponent(image.url)}&size=${size}`;
  };

  // Funkcje do znajdowania pasujących obrazów z Kolorystyki - używa tabeli konwersji
  const [keywordImages, setKeywordImages] = React.useState<{
    [key: string]: Array<{ keyword: string; image: ImageFile }>;
  }>({});

  React.useEffect(() => {
    const loadKeywordImages = async () => {
      decorConverter.clearCache();
      const cache: {
        [key: string]: Array<{ keyword: string; image: ImageFile }>;
      } = {};

      for (const image of images) {
        const found = await decorConverter.findAllKeywordImages(
          image.name,
          kolorystykaImages,
        );
        cache[image.name] = found;
      }

      setKeywordImages(cache);
    };

    loadKeywordImages();
  }, [images, kolorystykaImages]);

  const handleColorButtonHover = (e: React.MouseEvent, image: ImageFile) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredPreview({
      image,
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
    });
  };

  const handleColorButtonLeave = () => {
    setHoveredPreview(null);
  };

  return (
    <div className="image-grid">
      {images.map((image, index) => (
        <div key={`${image.url}-${index}`} className="image-item">
          <div
            className="image-container"
            onClick={() => onImageClick?.(image, images)}
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
              <div className="image-name">{getDisplayName(image.name)}</div>
              <div className="image-actions">
                <>
                  {/* Dynamiczne miniaturki dla znalezionych słów kluczowych */}
                  {folderName.toLowerCase() !== 'kolorystyka' &&
                    keywordImages[image.name]?.map((item, idx) => (
                      <button
                        key={`${item.keyword}-${idx}`}
                        className="image-action-button color-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onImageClick?.(item.image, kolorystykaImages);
                        }}
                        onMouseEnter={(e) =>
                          handleColorButtonHover(e, item.image)
                        }
                        onMouseLeave={handleColorButtonLeave}
                        title={item.keyword}
                        style={{
                          backgroundImage: `url(${getOptimizedImageUrl(item.image, 'thumb')})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }}
                      />
                    ))}
                  {/* Przycisk download - zawsze */}
                  <button
                    className="image-action-button download-button"
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
                </>
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Podgląd obrazu przy hover */}
      {hoveredPreview && (
        <div
          className="color-preview"
          style={{
            position: 'fixed',
            left: hoveredPreview.x - 75, // wycentruj (150px / 2)
            top: hoveredPreview.y - 160, // 150px + 10px margines
            width: 150,
            height: 150,
            zIndex: 9999,
            pointerEvents: 'none',
            border: '1px solid rgba(0,0,0,0.15)',
            borderRadius: '6px',
            overflow: 'hidden',
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          }}
        >
          <img
            src={hoveredPreview.image.url} // Oryginalny plik, nie thumbnail
            alt={hoveredPreview.image.name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        </div>
      )}
    </div>
  );
};

export default ImageGrid;
