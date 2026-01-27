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

    // 3) Sprawdź czy nazwa zawiera wzorzec RAL**** (np. white_RAL9003 -> RAL9003)
    const ralMatch = baseName.match(/RAL\d+/i);
    if (ralMatch) {
      return ralMatch[0].toUpperCase();
    }

    // 4) zamień podkreślenia na spacje
    baseName = baseName.replace(/_+/g, ' ');

    // 5) zwróć w kapitalikach
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

  // Stan do przechowywania podświetlonych nazw plików
  const [highlightedNames, setHighlightedNames] = React.useState<{
    [key: string]: string;
  }>({});

  // Stan do przechowywania obrazów dla słów kluczowych
  const [keywordImages, setKeywordImages] = React.useState<{
    [key: string]: Array<{ keyword: string; image: ImageFile }>;
  }>({});

  // Stan dla ustawień kolorowania - null oznacza że jeszcze się nie załadowały
  const [highlightKeywordsEnabled, setHighlightKeywordsEnabled] =
    React.useState<boolean | null>(null);

  React.useEffect(() => {
    // Wczytaj ustawienia
    const loadSettings = async () => {
      try {
        const response = await fetch('/api/admin/settings');
        const result = await response.json();
        if (result.success && result.settings) {
          setHighlightKeywordsEnabled(
            result.settings.highlightKeywords !== false,
          );
        } else {
          // Domyślnie włączone jeśli brak ustawień
          setHighlightKeywordsEnabled(true);
        }
      } catch (error) {
        console.error('Błąd ładowania ustawień:', error);
        // W przypadku błędu domyślnie włączone
        setHighlightKeywordsEnabled(true);
      }
    };
    loadSettings();
  }, []);

  React.useEffect(() => {
    const loadHighlightedNames = async () => {
      const highlighted: {
        [key: string]: string;
      } = {};
      const imagesMap: {
        [key: string]: Array<{ keyword: string; image: ImageFile }>;
      } = {};

      for (const image of images) {
        // Koloruj słowa kluczowe tylko jeśli opcja jest włączona i załadowana
        const displayName = getDisplayName(image.name);
        if (highlightKeywordsEnabled === true) {
          const processed =
            await decorConverter.highlightKeywordsInDisplayName(displayName);
          highlighted[image.name] = processed;
        } else {
          // Jeśli null (nie załadowane) lub false (wyłączone) - nie koloruj
          highlighted[image.name] = displayName;
        }

        // Znajdź obrazy dla słów kluczowych w nazwie pliku
        const foundImages = await decorConverter.findAllKeywordImages(
          image.name,
          kolorystykaImages,
        );
        imagesMap[image.name] = foundImages;
        console.log(
          `📊 ${image.name}: znaleziono ${foundImages.length} obrazów dla słów kluczowych:`,
          foundImages.map((f) => f.keyword),
        );
      }

      setHighlightedNames(highlighted);
      setKeywordImages(imagesMap);
    };

    loadHighlightedNames();
  }, [images, kolorystykaImages, highlightKeywordsEnabled]);

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
              <div
                className="image-name"
                dangerouslySetInnerHTML={{
                  __html:
                    highlightKeywordsEnabled === true
                      ? highlightedNames[image.name] ||
                        getDisplayName(image.name)
                      : getDisplayName(image.name),
                }}
              />
              <div className="image-actions">
                {/* Przyciski z miniaturkami dla słów kluczowych - tylko poza Kolorystyką */}
                {folderName.toLowerCase() !== 'kolorystyka' &&
                  (() => {
                    const images = keywordImages[image.name] || [];
                    console.log(
                      `🎨 Renderowanie ${images.length} przycisków dla ${image.name}:`,
                      images.map((i) => i.keyword),
                    );
                    return images.map((item, idx) => {
                      // Użyj getDisplayName dla tytułu przycisku (dla plików RAL pokaże tylko RAL****)
                      const buttonTitle = getDisplayName(item.image.name);
                      return (
                        <button
                          key={`keyword-${image.name}-${idx}`}
                          className="image-action-button color-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onImageClick?.(item.image, kolorystykaImages);
                          }}
                          onMouseEnter={(e) => {
                            const rect =
                              e.currentTarget.getBoundingClientRect();
                            console.log(
                              '🖱️ Hover na przycisku:',
                              item.keyword,
                              item.image.name,
                            );
                            setHoveredPreview({
                              image: item.image,
                              x: rect.left + rect.width / 2,
                              y: rect.top,
                            });
                          }}
                          onMouseLeave={() => {
                            console.log('🖱️ Opuszczenie przycisku');
                            setHoveredPreview(null);
                          }}
                          title={buttonTitle}
                          style={{
                            backgroundImage: `url(${getOptimizedImageUrl(item.image, 'thumb')})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            width: '26px',
                            height: '26px',
                            minWidth: '26px',
                            minHeight: '26px',
                          }}
                        />
                      );
                    });
                  })()}
                {/* Przycisk download */}
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
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Podgląd obrazu przy hover - miniaturka 150x150px */}
      {hoveredPreview && (
        <div
          className="color-preview"
          style={{
            position: 'fixed',
            left: hoveredPreview.x - 75, // wycentruj (150px / 2)
            top: hoveredPreview.y - 160, // 150px + 10px margines
            width: '150px',
            height: '150px',
            zIndex: 9999,
            pointerEvents: 'none',
            border: '1px solid rgba(0,0,0,0.15)',
            borderRadius: '6px',
            overflow: 'hidden',
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            backgroundColor: '#fff',
            display: 'block',
            visibility: 'visible',
          }}
        >
          <img
            src={getOptimizedImageUrl(hoveredPreview.image, 'thumb')}
            alt={hoveredPreview.image.name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
            onError={(e) => {
              console.error(
                'Błąd ładowania podglądu:',
                hoveredPreview.image.name,
              );
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}
    </div>
  );
};

export default ImageGrid;
