import React, { useCallback, useMemo, memo } from 'react';
import { ImageFile } from '@/src/types/gallery';
import decorConverter from '@/src/utils/decorConverter';
import DOMPurify from 'dompurify';
import { logger } from '@/src/utils/logger';
import { useSettings } from '@/src/contexts/SettingsContext';
import { getOptimizedImageUrl } from '@/src/utils/imageUtils';
import { downloadFile } from '@/src/utils/downloadUtils';
import { getDisplayName as getDisplayNameUtil } from '@/src/utils/imageNameUtils';
import { PREVIEW_TIMEOUT } from '@/src/config/constants';
import { useTouchDevice } from '@/src/hooks/useTouchDevice';

interface ImageGridProps {
  images: ImageFile[];
  onImageClick?: (
    image: ImageFile,
    imagesInFolder: ImageFile[],
    folderPath?: string
  ) => void;
  folderName: string;
  folderPath?: string;
  kolorystykaImages?: ImageFile[];
  onTrackDownload?: (
    filePath: string,
    fileName: string
  ) => Promise<void> | void;
  isAdmin?: boolean;
  /** Gdy podane – używane zamiast fetch (batch z Gallery) */
  cacheStatusFromParent?: Record<string, boolean>;
}

interface ImageItemProps {
  image: ImageFile;
  index: number;
  highlightedName: string;
  keywordItems: Array<{ keyword: string; image: ImageFile }>;
  folderName: string;
  onImageClick?: (
    image: ImageFile,
    imagesInFolder: ImageFile[],
    folderPath?: string
  ) => void;
  images: ImageFile[];
  folderPath?: string;
  kolorystykaImages: ImageFile[];
  getOptimizedImageUrl: (image: ImageFile, size?: 'thumb' | 'full') => string;
  /** URL miniaturki (z fallbackiem na proxy gdy 404) – żeby re-render nie nadpisywał */
  thumbSrc: string;
  onThumbnailError: () => void;
  getDisplayName: (name: string) => string;
  onHoverPreview: (img: ImageFile, x: number, y: number) => void;
  onHoverPreviewClear: () => void;
  onTrackDownload?: (
    filePath: string,
    fileName: string
  ) => Promise<void> | void;
  isTouchDevice: boolean;
  isAdmin?: boolean;
  isCached?: boolean;
  cacheStatusLoaded?: boolean;
}

const ImageItem = memo(function ImageItem({
  image,
  index,
  highlightedName,
  keywordItems,
  folderName,
  onImageClick,
  images,
  folderPath,
  kolorystykaImages,
  getOptimizedImageUrl,
  thumbSrc,
  onThumbnailError,
  getDisplayName,
  onHoverPreview,
  onHoverPreviewClear,
  onTrackDownload,
  isTouchDevice,
  isAdmin = false,
  isCached,
  cacheStatusLoaded = false,
}: ImageItemProps) {
  const proxyThumbUrl = `/api/image-proxy?url=${encodeURIComponent(
    image.url
  )}&size=thumb`;

  const handleImageError = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const target = e.target as HTMLImageElement;

      if (target.src.includes('/api/image-proxy')) {
        logger.warn('Image load error (proxy failed):', image.name);
        target.style.display = 'none';
        return;
      }

      logger.info('Thumbnail missing, using original:', image.name);
      onThumbnailError();
      target.src = proxyThumbUrl;

      // Generowanie w tle tylko dla admina (endpoint wymaga autoryzacji)
      if (isAdmin) {
        fetch('/api/admin/cache/generate-single', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imagePath: image.path || image.url }),
        }).catch(() => {});
      }
    },
    [image, isAdmin, onThumbnailError, proxyThumbUrl]
  );

  return (
    <div
      className="image-item"
      style={{ '--item-index': index } as React.CSSProperties}
    >
      <div
        className="image-container"
        onClick={() => onImageClick?.(image, images, folderPath)}
      >
        {/* Admin cache status icon */}
        {isAdmin && (
          <div
            className="cache-status-icon"
            title={
              !cacheStatusLoaded
                ? 'Sprawdzanie cache...'
                : isCached === undefined
                ? 'Status nieznany'
                : isCached
                ? 'Miniaturka w cache'
                : 'Brak miniaturki w cache'
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
              className={`las ${
                !cacheStatusLoaded ? 'la-spinner la-spin' : 'la-database'
              }`}
              style={{
                color: !cacheStatusLoaded
                  ? '#9ca3af'
                  : isCached === undefined
                  ? '#9ca3af'
                  : isCached
                  ? '#059669'
                  : '#dc2626',
                fontSize: '12px',
                textShadow: '0 0 2px rgba(255,255,255,0.8)',
              }}
            ></i>
          </div>
        )}
        <img
          src={thumbSrc}
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
                ALLOWED_ATTR: ['class'],
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
                          rect.top
                        );
                        setTimeout(
                          () => onHoverPreviewClear(),
                          PREVIEW_TIMEOUT
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
                          rect.top
                        );
                        // Ukryj podgląd po określonym czasie
                        setTimeout(
                          () => onHoverPreviewClear(),
                          PREVIEW_TIMEOUT
                        );
                        return; // WAŻNE: return early - nie wykonuj dalszego kodu!
                      }
                      // Na desktopie otwórz pełny obraz
                      onHoverPreviewClear();
                      onImageClick?.(
                        item.image,
                        kolorystykaImages,
                        'Kolorystyka'
                      );
                    }}
                    onMouseEnter={(e) => {
                      // Na tablecie wyłącz hover - tylko click pokazuje miniaturkę
                      if (!isTouchDevice) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        onHoverPreview(
                          item.image,
                          rect.left + rect.width / 2,
                          rect.top
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
                      backgroundImage: `url(${getOptimizedImageUrl(
                        item.image,
                        'thumb'
                      )})`,
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
  cacheStatusFromParent,
}) => {
  const [hoveredPreview, setHoveredPreview] = React.useState<{
    image: ImageFile;
    x: number;
    y: number;
  } | null>(null);

  // Animation key - forces re-render and animation reset when folder is opened
  const [animationKey, setAnimationKey] = React.useState(0);
  React.useEffect(() => {
    // Reset animation key on mount to trigger staggered fade-in
    setAnimationKey((prev) => prev + 1);
  }, []);

  const getDisplayName = useCallback(
    (name: string) => getDisplayNameUtil(name),
    []
  );

  const handleHoverPreview = useCallback(
    (img: ImageFile, x: number, y: number) =>
      setHoveredPreview({ image: img, x, y }),
    []
  );
  const handleHoverPreviewClear = useCallback(
    () => setHoveredPreview(null),
    []
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
  const [cacheStatus, setCacheStatus] = React.useState<Record<string, boolean>>(
    {}
  );
  const [cacheStatusLoaded, setCacheStatusLoaded] = React.useState(false);

  // Miniatury 404 – używaj oryginału (proxy), żeby re-render nie nadpisywał fallbacku
  const [failedThumbnails, setFailedThumbnails] = React.useState<
    Record<string, boolean>
  >({});
  React.useEffect(() => {
    setFailedThumbnails({});
  }, [folderPath, folderName]);

  const {
    highlightKeywords: highlightKeywordsEnabled,
    thumbnailAnimationDelay,
  } = useSettings();
  const isTouchDevice = useTouchDevice();

  // Status cache: z batch (cacheStatusFromParent) lub pojedynczy fetch
  React.useEffect(() => {
    if (!isAdmin || images.length === 0) return;

    if (cacheStatusFromParent) {
      setCacheStatus(cacheStatusFromParent);
      setCacheStatusLoaded(true);
      return;
    }

    setCacheStatus({});
    setCacheStatusLoaded(false);

    const checkCacheStatus = async () => {
      try {
        const pathToCheck = folderPath || folderName;
        logger.debug('Fetching cache status for folder:', pathToCheck);
        const response = await fetch(
          `/api/admin/cache/folder-status?folder=${encodeURIComponent(
            pathToCheck
          )}`
        );
        if (response.ok) {
          const data = await response.json();
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
  }, [isAdmin, images, folderName, folderPath, cacheStatusFromParent]);

  React.useEffect(() => {
    const loadHighlightedNames = async () => {
      const useColors = highlightKeywordsEnabled === true;
      const results = await Promise.all(
        images.map(async (image) => {
          const displayName = getDisplayName(image.name);
          const [processed, foundImages] = await Promise.all([
            decorConverter.highlightKeywordsInDisplayName(
              displayName,
              useColors
            ),
            decorConverter.findAllKeywordImages(image.name, kolorystykaImages),
          ]);
          return {
            name: image.name,
            highlighted: processed,
            keywordImages: foundImages,
          };
        })
      );
      const highlighted: Record<string, string> = {};
      const imagesMap: Record<
        string,
        Array<{ keyword: string; image: ImageFile }>
      > = {};
      for (const r of results) {
        highlighted[r.name] = r.highlighted;
        imagesMap[r.name] = r.keywordImages;
        logger.debug(
          `${r.name}: znaleziono ${r.keywordImages.length} obrazów dla słów kluczowych`,
          r.keywordImages.map((f) => f.keyword)
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
    <div
      className="image-grid"
      style={
        {
          '--thumbnail-delay': `${thumbnailAnimationDelay}ms`,
        } as React.CSSProperties
      }
    >
      {memoizedImages.map((image, index) => (
        <ImageItem
          key={`${image.url}-${index}-${animationKey}`}
          image={image}
          index={index}
          highlightedName={
            highlightedNames[image.name] ?? getDisplayName(image.name)
          }
          keywordItems={keywordImages[image.name] ?? []}
          folderName={folderName}
          onImageClick={onImageClick}
          images={images}
          folderPath={folderPath}
          kolorystykaImages={kolorystykaImages}
          getOptimizedImageUrl={getOptimizedImageUrl}
          thumbSrc={
            failedThumbnails[image.name] ||
            (isAdmin && cacheStatusLoaded && cacheStatus[image.name] === false)
              ? `/api/image-proxy?url=${encodeURIComponent(
                  image.url
                )}&size=thumb`
              : getOptimizedImageUrl(image, 'thumb')
          }
          onThumbnailError={() =>
            setFailedThumbnails((prev) => ({ ...prev, [image.name]: true }))
          }
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
                logger.info(
                  'Preview thumbnail missing, falling back to proxy:',
                  hoveredPreview.image.name
                );
                target.src = `/api/image-proxy?url=${encodeURIComponent(
                  hoveredPreview.image.url
                )}&size=thumb`;
              } else {
                logger.warn(
                  'Błąd ładowania podglądu:',
                  hoveredPreview.image.name
                );
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
