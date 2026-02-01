import React, { useCallback, useMemo, memo } from 'react';
import { ImageFile } from '@/src/types/gallery';
import decorConverter from '@/src/utils/decorConverter';
import DOMPurify from 'dompurify';
import { logger } from '@/src/utils/logger';
import { useSettings } from '@/src/contexts/SettingsContext';
import { getOptimizedImageUrl } from '@/src/utils/imageUtils';
import { downloadFile } from '@/src/utils/downloadUtils';
import { PREVIEW_TIMEOUT } from '@/src/config/constants';

interface ImageGridProps {
  images: ImageFile[];
  onImageClick?: (image: ImageFile, imagesInFolder: ImageFile[]) => void;
  folderName: string;
  folderPath?: string;
  kolorystykaImages?: ImageFile[];
  onTrackDownload?: (
    filePath: string,
    fileName: string,
  ) => Promise<void> | void;
  isAdmin?: boolean;
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
  isTouchDevice: boolean;
  isAdmin?: boolean;
  isCached?: boolean;
  cacheStatusLoaded?: boolean;
}

const ImageItem = memo(function ImageItem({
  image,
  index: _index,
  highlightedName,
  keywordItems,
  folderName,
  highlightKeywordsEnabled: _highlightKeywordsEnabled,
  onImageClick,
  images,
  kolorystykaImages,
  getOptimizedImageUrl,
  getDisplayName,
  onHoverPreview,
  onHoverPreviewClear,
  onTrackDownload,
  isTouchDevice,
  isAdmin = false,
  isCached,
  cacheStatusLoaded = false,
}: ImageItemProps) {
  // Fallback: gdy miniaturka nie istnieje, wczytaj oryginał przez proxy
  const handleImageError = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const target = e.target as HTMLImageElement;
      const originalSrc = target.src;

      // Sprawdź czy to już jest fallback (proxy z size=thumb)
      if (originalSrc.includes('/api/image-proxy')) {
        // Proxy też nie zadziałał - ukryj obrazek
        logger.warn('Image load error (proxy fallback failed):', originalSrc);
        target.style.display = 'none';
        return;
      }

      // Miniaturka nie istnieje - użyj proxy jako fallback
      logger.info('Thumbnail missing, falling back to proxy:', image.name);
      const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(image.url)}&size=thumb`;
      target.src = proxyUrl;

      // Wyzwól generowanie miniaturki w tle
      fetch('/api/admin/cache/generate-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePath: image.path || image.url }),
      }).catch(() => {
        // Ignoruj błędy - to tylko optymalizacja w tle
      });
    },
    [image],
  );

  return (
    <div className="image-item">
      <div
        className="image-container"
        onClick={() => onImageClick?.(image, images)}
      >
        {/* Admin cache status icon */}
        {isAdmin && (
          <div
            className="cache-status-icon"
            title={
              !cacheStatusLoaded ? 'Sprawdzanie cache...' :
              isCached === undefined ? 'Status nieznany' :
              isCached ? 'Miniaturka w cache' : 'Brak miniaturki w cache'
            }
            style={{
              position: 'absolute',
              top: '3px',
              right: '3px',
              zIndex: 10,
              width: '14px',
              height: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <i
              className={`las ${!cacheStatusLoaded ? 'la-spinner la-spin' : 'la-database'}`}
              style={{
                color: !cacheStatusLoaded ? '#9ca3af' :
                       isCached === undefined ? '#9ca3af' :
                       isCached ? '#059669' : '#dc2626',
                fontSize: '12px',
                textShadow: '0 0 2px rgba(255,255,255,0.8)',
              }}
            ></i>
          </div>
        )}
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
                    onTouchStart={(e) => {
                      // Na tablecie obsłuż touch event
                      if (isTouchDevice) {
                        e.stopPropagation();
                        e.preventDefault();
                        const rect = e.currentTarget.getBoundingClientRect();
                        onHoverPreview(
                          item.image,
                          rect.left + rect.width / 2,
                          rect.top,
                        );
                        setTimeout(
                          () => onHoverPreviewClear(),
                          PREVIEW_TIMEOUT,
                        );
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      // Na tablecie TYLKO pokazuj miniaturkę, ABSOLUTNIE NIE otwieraj pełnego obrazu
                      if (isTouchDevice) {
                        e.preventDefault();
                        const rect = e.currentTarget.getBoundingClientRect();
                        onHoverPreview(
                          item.image,
                          rect.left + rect.width / 2,
                          rect.top,
                        );
                        // Ukryj podgląd po określonym czasie
                        setTimeout(
                          () => onHoverPreviewClear(),
                          PREVIEW_TIMEOUT,
                        );
                        return; // WAŻNE: return early - nie wykonuj dalszego kodu!
                      }
                      // Na desktopie otwórz pełny obraz
                      onHoverPreviewClear();
                      onImageClick?.(item.image, kolorystykaImages);
                    }}
                    onMouseEnter={(e) => {
                      // Na tablecie wyłącz hover - tylko click pokazuje miniaturkę
                      if (!isTouchDevice) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        onHoverPreview(
                          item.image,
                          rect.left + rect.width / 2,
                          rect.top,
                        );
                      }
                    }}
                    onMouseLeave={() => {
                      // Na tablecie nie ukrywaj podglądu przy mouseLeave
                      if (!isTouchDevice) {
                        onHoverPreviewClear();
                      }
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
  folderPath,
  kolorystykaImages = [],
  onTrackDownload,
  isAdmin = false,
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

  // Stan cache dla admina
  const [cacheStatus, setCacheStatus] = React.useState<Record<string, boolean>>({});
  const [cacheStatusLoaded, setCacheStatusLoaded] = React.useState(false);

  const { highlightKeywords: highlightKeywordsEnabled } = useSettings();

  // Wykrywanie urządzenia dotykowego (tablet/mobile) za pomocą media query pointer: coarse
  const [isTouchDevice, setIsTouchDevice] = React.useState(false);
  React.useEffect(() => {
    const checkTouchDevice = () => {
      // Urządzenie dotykowe: pointer: coarse (palec) zamiast pointer: fine (mysz)
      const isTouch = window.matchMedia('(pointer: coarse)').matches;
      setIsTouchDevice(isTouch);
    };
    checkTouchDevice();
    const mediaQuery = window.matchMedia('(pointer: coarse)');
    mediaQuery.addEventListener('change', checkTouchDevice);
    return () => mediaQuery.removeEventListener('change', checkTouchDevice);
  }, []);

  // Pobierz status cache dla admina
  React.useEffect(() => {
    if (!isAdmin || images.length === 0) return;

    // Reset przy zmianie folderu
    setCacheStatus({});
    setCacheStatusLoaded(false);

    const checkCacheStatus = async () => {
      try {
        // Użyj folderPath jeśli dostępne, w przeciwnym razie folderName
        const pathToCheck = folderPath || folderName;
        logger.debug('Fetching cache status for folder:', pathToCheck);
        const response = await fetch(`/api/admin/cache/folder-status?folder=${encodeURIComponent(pathToCheck)}`);
        if (response.ok) {
          const data = await response.json();
          logger.debug('Cache status response:', data);
          if (data.success && data.images) {
            const statusMap: Record<string, boolean> = {};
            for (const img of data.images) {
              statusMap[img.name] = img.cached;
            }
            setCacheStatus(statusMap);
          }
        } else {
          logger.warn('Cache status API error:', response.status);
        }
      } catch (error) {
        logger.error('Error fetching cache status', error);
      } finally {
        setCacheStatusLoaded(true);
      }
    };

    checkCacheStatus();
  }, [isAdmin, images, folderName, folderPath]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getDisplayName is stable
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
          isTouchDevice={isTouchDevice}
          isAdmin={isAdmin}
          isCached={isAdmin ? cacheStatus[image.name] : undefined}
          cacheStatusLoaded={cacheStatusLoaded}
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
          { }
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
              const target = e.target as HTMLImageElement;
              const originalSrc = target.src;

              // Fallback do proxy gdy miniaturka nie istnieje
              if (!originalSrc.includes('/api/image-proxy')) {
                logger.info('Preview thumbnail missing, falling back to proxy:', hoveredPreview.image.name);
                target.src = `/api/image-proxy?url=${encodeURIComponent(hoveredPreview.image.url)}&size=thumb`;
              } else {
                logger.warn('Błąd ładowania podglądu:', hoveredPreview.image.name);
                target.style.display = 'none';
              }
            }}
          />
        </div>
      )}
    </div>
  );
};

export default memo(ImageGrid);
