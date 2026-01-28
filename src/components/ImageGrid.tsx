import React, { useCallback, useMemo, memo } from 'react';
import { ImageFile } from '@/src/types/gallery';
import decorConverter from '@/src/utils/decorConverter';
import DOMPurify from 'dompurify';
import { logger } from '@/src/utils/logger';
import { useSettings } from '@/src/contexts/SettingsContext';
import { getOptimizedImageUrl } from '@/src/utils/imageUtils';
import { downloadFile } from '@/src/utils/downloadUtils';

interface ImageGridProps {
  images: ImageFile[];
  onImageClick?: (image: ImageFile, imagesInFolder: ImageFile[]) => void;
  folderName: string;
  kolorystykaImages?: ImageFile[];
  onTrackDownload?: (
    filePath: string,
    fileName: string,
  ) => Promise<void> | void;
}

const getDisplayNameStatic = (name: string): string => {
  const lastDotIndex = name.lastIndexOf('.');
  let baseName = lastDotIndex === -1 ? name : name.substring(0, lastDotIndex);
  const shotIndex = baseName.indexOf('__Shot');
  if (shotIndex !== -1) baseName = baseName.substring(0, shotIndex);
  return baseName.replace(/_+/g, ' ').trim().toUpperCase();
};

interface ImageItemProps {
  image: ImageFile;
  index: number;
  highlightedName: string;
  keywordItems: Array<{ keyword: string; image: ImageFile }>;
  folderName: string;
  highlightKeywordsEnabled: boolean | null;
  onImageClick?: (image: ImageFile, imagesInFolder: ImageFile[]) => void;
  images: ImageFile[];
  kolorystykaImages: ImageFile[];
  getOptimizedImageUrl: (image: ImageFile, size?: 'thumb' | 'full') => string;
  getDisplayName: (name: string) => string;
  onHoverPreview: (img: ImageFile, x: number, y: number) => void;
  onHoverPreviewClear: () => void;
  onTrackDownload?: (
    filePath: string,
    fileName: string,
  ) => Promise<void> | void;
}

const ImageItem = memo(function ImageItem({
  image,
  index,
  highlightedName,
  keywordItems,
  folderName,
  highlightKeywordsEnabled,
  onImageClick,
  images,
  kolorystykaImages,
  getOptimizedImageUrl,
  getDisplayName,
  onHoverPreview,
  onHoverPreviewClear,
  onTrackDownload,
}: ImageItemProps) {
  const handleImageError = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const target = e.target as HTMLImageElement;
      logger.warn('Image load error:', target.src);
      target.style.display = 'none';
    },
    [],
  );

  return (
    <div className="image-item">
      <div
        className="image-container"
        onClick={() => onImageClick?.(image, images)}
      >
        <img
          src={getOptimizedImageUrl(image, 'thumb')}
          alt={image.name}
          className="gallery-image"
          loading="lazy"
          onError={handleImageError}
        />
      </div>
      <div className="image-title">
        <div className="image-title-top">
          <div
            className="image-name"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(highlightedName, {
                ALLOWED_TAGS: ['span'],
                ALLOWED_ATTR: ['style', 'class'],
              }),
            }}
          />
          <div className="image-actions">
            {folderName.toLowerCase() !== 'kolorystyka' &&
              keywordItems.map((item, idx) => {
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
                      const rect = e.currentTarget.getBoundingClientRect();
                      onHoverPreview(
                        item.image,
                        rect.left + rect.width / 2,
                        rect.top,
                      );
                    }}
                    onMouseLeave={onHoverPreviewClear}
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
              })}
            <button
              className="image-action-button download-button"
              onClick={async (e) => {
                e.stopPropagation();
                if (onTrackDownload) {
                  try {
                    await onTrackDownload(image.url, image.name);
                  } catch (trackError) {
                    logger.error('Błąd trackowania pobrania', trackError);
                  }
                }
                await downloadFile(image.url, image.name);
              }}
              title="Pobierz plik"
            >
              <i className="las la-download"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

const ImageGrid: React.FC<ImageGridProps> = ({
  images,
  onImageClick,
  folderName,
  kolorystykaImages = [],
  onTrackDownload,
}) => {
  const [hoveredPreview, setHoveredPreview] = React.useState<{
    image: ImageFile;
    x: number;
    y: number;
  } | null>(null);

  const getDisplayName = useCallback(
    (name: string) => getDisplayNameStatic(name),
    [],
  );

  const handleHoverPreview = useCallback(
    (img: ImageFile, x: number, y: number) =>
      setHoveredPreview({ image: img, x, y }),
    [],
  );
  const handleHoverPreviewClear = useCallback(
    () => setHoveredPreview(null),
    [],
  );

  // Stan do przechowywania podświetlonych nazw plików
  const [highlightedNames, setHighlightedNames] = React.useState<{
    [key: string]: string;
  }>({});

  // Stan do przechowywania obrazów dla słów kluczowych
  const [keywordImages, setKeywordImages] = React.useState<{
    [key: string]: Array<{ keyword: string; image: ImageFile }>;
  }>({});

  const { highlightKeywords: highlightKeywordsEnabled } = useSettings();

  React.useEffect(() => {
    const loadHighlightedNames = async () => {
      const highlighted: {
        [key: string]: string;
      } = {};
      const imagesMap: {
        [key: string]: Array<{ keyword: string; image: ImageFile }>;
      } = {};

      for (const image of images) {
        // Zawsze styluj słowa kluczowe (font-size, font-weight). Kolor tylko gdy opcja włączona.
        const displayName = getDisplayName(image.name);
        const useColors = highlightKeywordsEnabled === true;
        const processed = await decorConverter.highlightKeywordsInDisplayName(
          displayName,
          useColors,
        );
        highlighted[image.name] = processed;

        // Znajdź obrazy dla słów kluczowych w nazwie pliku
        const foundImages = await decorConverter.findAllKeywordImages(
          image.name,
          kolorystykaImages,
        );
        imagesMap[image.name] = foundImages;
        logger.debug(
          `${image.name}: znaleziono ${foundImages.length} obrazów dla słów kluczowych`,
          foundImages.map((f) => f.keyword),
        );
      }

      setHighlightedNames(highlighted);
      setKeywordImages(imagesMap);
    };

    loadHighlightedNames();
  }, [images, kolorystykaImages, highlightKeywordsEnabled]);

  const memoizedImages = useMemo(() => images, [images]);

  return (
    <div className="image-grid">
      {memoizedImages.map((image, index) => (
        <ImageItem
          key={`${image.url}-${index}`}
          image={image}
          index={index}
          highlightedName={
            highlightedNames[image.name] ?? getDisplayName(image.name)
          }
          keywordItems={keywordImages[image.name] ?? []}
          folderName={folderName}
          highlightKeywordsEnabled={highlightKeywordsEnabled}
          onImageClick={onImageClick}
          images={images}
          kolorystykaImages={kolorystykaImages}
          getOptimizedImageUrl={getOptimizedImageUrl}
          getDisplayName={getDisplayName}
          onHoverPreview={handleHoverPreview}
          onHoverPreviewClear={handleHoverPreviewClear}
          onTrackDownload={onTrackDownload}
        />
      ))}

      {hoveredPreview && (
        <div
          className="color-preview"
          style={{
            position: 'fixed',
            left: hoveredPreview.x - 75,
            top: hoveredPreview.y - 160,
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
              logger.warn(
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

export default memo(ImageGrid);
