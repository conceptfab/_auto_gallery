import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  memo,
  useMemo,
} from 'react';
import { useRouter } from 'next/router';
import { GalleryFolder, ImageFile, GalleryResponse } from '@/src/types/gallery';
import ImageGrid from './ImageGrid';
import ImageMetadata from './ImageMetadata';
import LoadingOverlay from './LoadingOverlay';
import { logger } from '@/src/utils/logger';
import { getOptimizedImageUrl } from '@/src/utils/imageUtils';
import { downloadFile } from '@/src/utils/downloadUtils';
import decorConverter from '@/src/utils/decorConverter';
import { useStatsTracker } from '@/src/hooks/useStatsTracker';
import { useTouchDevice } from '@/src/hooks/useTouchDevice';
import { getDisplayName } from '@/src/utils/imageNameUtils';
import {
  API_TIMEOUT_LONG,
  UI_DELAY_SHORT,
  LOADING_PROGRESS_FETCH,
  LOADING_PROGRESS_MID,
  LOADING_PROGRESS_PARSE,
  LOADING_PROGRESS_COMPLETE,
  PREVIEW_TIMEOUT,
  PREVIEW_OFFSET_X,
  PREVIEW_OFFSET_Y,
} from '@/src/config/constants';

interface FolderSectionProps {
  folder: GalleryFolder;
  onImageClick: (
    image: ImageFile,
    imagesInFolder: ImageFile[],
    folderPath?: string
  ) => void;
  globalCollapsedFolders: Set<string>;
  setGlobalCollapsedFolders: (collapsed: Set<string>) => void;
  allFolders: GalleryFolder[];
  onFolderView?: (folder: GalleryFolder) => void;
  onTrackDownload?: (
    filePath: string,
    fileName: string
  ) => Promise<void> | void;
  isAdmin?: boolean;
  /** Status cache z batch API: path -> (image name -> cached) */
  cacheStatusByFolder?: Record<string, Record<string, boolean>>;
}

function FolderSectionInner({
  folder,
  onImageClick,
  globalCollapsedFolders,
  setGlobalCollapsedFolders,
  allFolders,
  onFolderView,
  onTrackDownload,
  isAdmin = false,
  cacheStatusByFolder,
}: FolderSectionProps) {
  const toggleFolder = (currentFolder: GalleryFolder) => {
    const newCollapsed = new Set(globalCollapsedFolders);
    const isCurrentlyCollapsed = newCollapsed.has(currentFolder.path);
    if (isCurrentlyCollapsed) {
      newCollapsed.delete(currentFolder.path);
      if (onFolderView) {
        onFolderView(currentFolder);
      }
    } else {
      newCollapsed.add(currentFolder.path);
    }
    setGlobalCollapsedFolders(newCollapsed);
  };

  const renderFolder = (currentFolder: GalleryFolder, depth: number = 0) => {
    // Znajdź obrazy z Kolorystyki
    const kolorystykaFolder = allFolders.find(
      (f) => f.name.toLowerCase() === 'kolorystyka'
    );
    const kolorystykaImages = kolorystykaFolder?.images || [];

    if (kolorystykaImages.length > 0) {
      logger.debug(
        'Gallery - Znaleziono folder Kolorystyka z',
        kolorystykaImages.length,
        'obrazami'
      );
    } else {
      logger.debug(
        'Gallery - Brak folderu Kolorystyka lub jest pusty. Dostępne foldery:',
        allFolders.map((f) => f.name)
      );
    }
    const indentClass = `level-${Math.min(depth, 4)}`;
    const categoryClass = currentFolder.isCategory
      ? 'category'
      : 'gallery-folder';
    const isCollapsed = globalCollapsedFolders.has(currentFolder.path);
    const hasCollapsibleContent =
      currentFolder.subfolders ||
      (!currentFolder.isCategory && currentFolder.images.length > 0);

    return (
      <div
        key={currentFolder.path}
        className={`folder-wrapper ${categoryClass} ${indentClass} ${
          !isCollapsed ? 'expanded' : ''
        }`}
      >
        {currentFolder.isCategory ? (
          <div className="category-header">
            <h2 className="category-title">
              <div
                className={`folder-title-left ${
                  hasCollapsibleContent ? 'folder-title-clickable' : ''
                }`}
                onClick={
                  hasCollapsibleContent
                    ? () => toggleFolder(currentFolder)
                    : undefined
                }
              >
                <i className="lar la-folder category-icon"></i>
                {currentFolder.name}
                {isCollapsed && currentFolder.subfolders && depth === 0 && (
                  <span className="subfolder-list">
                    /{' '}
                    {currentFolder.subfolders.map((sub) => sub.name).join(', ')}
                  </span>
                )}
              </div>
              {hasCollapsibleContent && (
                <button
                  className={`folder-action-button ${
                    isCollapsed ? 'collapsed' : ''
                  }`}
                  onClick={() => toggleFolder(currentFolder)}
                >
                  <i className="las la-angle-up"></i>
                </button>
              )}
            </h2>
          </div>
        ) : (
          <div className="gallery-section">
            <h3 className="gallery-title">
              <div
                className={`folder-title-left ${
                  hasCollapsibleContent ? 'folder-title-clickable' : ''
                }`}
                onClick={
                  hasCollapsibleContent
                    ? () => toggleFolder(currentFolder)
                    : undefined
                }
              >
                <i className="lar la-image gallery-icon"></i>
                {currentFolder.name}
                <span className="inline-image-count">
                  ({currentFolder.images.length})
                </span>
              </div>
              {hasCollapsibleContent && (
                <button
                  className={`folder-action-button ${
                    isCollapsed ? 'collapsed' : ''
                  }`}
                  onClick={() => toggleFolder(currentFolder)}
                >
                  <i className="las la-angle-up"></i>
                </button>
              )}
            </h3>
            {!isCollapsed && currentFolder.images.length > 0 && (
              <ImageGrid
                images={currentFolder.images}
                onImageClick={onImageClick}
                folderName={currentFolder.name}
                folderPath={currentFolder.path}
                kolorystykaImages={kolorystykaImages}
                onTrackDownload={onTrackDownload}
                isAdmin={isAdmin}
                cacheStatusFromParent={
                  cacheStatusByFolder?.[currentFolder.path]
                }
              />
            )}
          </div>
        )}

        {currentFolder.subfolders && !isCollapsed && (
          <div className="subfolders">
            {currentFolder.subfolders.map((subfolder) =>
              renderFolder(subfolder, depth + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  return renderFolder(folder);
}

const FolderSection = memo(
  FolderSectionInner,
  (prev, next) =>
    prev.folder.path === next.folder.path &&
    prev.onImageClick === next.onImageClick &&
    prev.setGlobalCollapsedFolders === next.setGlobalCollapsedFolders &&
    prev.globalCollapsedFolders === next.globalCollapsedFolders &&
    prev.isAdmin === next.isAdmin &&
    prev.cacheStatusByFolder === next.cacheStatusByFolder
);

interface GalleryProps {
  refreshKey?: number;
  groupId?: string;
  isAdmin?: boolean;
}

const LOGIN_REQUIRED_MSG = 'Zaloguj się, aby zobaczyć galerię.';

const Gallery: React.FC<GalleryProps> = ({
  refreshKey,
  groupId,
  isAdmin = false,
}) => {
  const router = useRouter();
  const redirectingToLoginRef = useRef(false);
  const [folders, setFolders] = useState<GalleryFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<ImageFile | null>(null);
  const [currentImageList, setCurrentImageList] = useState<ImageFile[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState<number | null>(
    null
  );
  const [globalCollapsedFolders, setGlobalCollapsedFolders] = useState<
    Set<string>
  >(new Set());
  const [modalKeywordImages, setModalKeywordImages] = useState<
    Array<{ keyword: string; image: ImageFile }>
  >([]);
  const [modalHoveredPreview, setModalHoveredPreview] = useState<{
    image: ImageFile;
    x: number;
    y: number;
  } | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [currentFolderPath, setCurrentFolderPath] = useState<string | null>(
    null
  );
  const [cacheStatusByFolder, setCacheStatusByFolder] = useState<
    Record<string, Record<string, boolean>>
  >({});

  const { trackView, trackDownload } = useStatsTracker(null);
  const isTouchDevice = useTouchDevice();

  // Batch cache status dla admina (PERF-001)
  useEffect(() => {
    if (!isAdmin || folders.length === 0) return;
    const getAllPaths = (f: GalleryFolder): string[] => [
      f.path,
      ...(f.subfolders?.flatMap(getAllPaths) ?? []),
    ];
    const paths = folders.flatMap(getAllPaths).slice(0, 80);
    if (paths.length === 0) return;
    fetch('/api/admin/cache/folder-status-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folders: paths }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.byFolder) {
          const next: Record<string, Record<string, boolean>> = {};
          for (const [path, result] of Object.entries(data.byFolder) as [
            string,
            { images?: Array<{ name: string; cached: boolean }> }
          ][]) {
            if (result?.images) {
              next[path] = Object.fromEntries(
                result.images.map((img) => [img.name, img.cached])
              );
            }
          }
          setCacheStatusByFolder(next);
        }
      })
      .catch((err) => logger.error('Batch cache status error', err));
  }, [isAdmin, folders]);

  // Wyciągnij obrazy z folderu Kolorystyka
  const kolorystykaImages = useMemo(() => {
    const findKolorystykaImages = (
      folderList: GalleryFolder[]
    ): ImageFile[] => {
      for (const folder of folderList) {
        if (folder.name.toLowerCase() === 'kolorystyka') {
          return folder.images;
        }
        if (folder.subfolders) {
          const found = findKolorystykaImages(folder.subfolders);
          if (found.length > 0) return found;
        }
      }
      return [];
    };
    return findKolorystykaImages(folders);
  }, [folders]);

  // Oblicz keyword images gdy zmienia się wybrany obraz
  useEffect(() => {
    const loadKeywordImages = async () => {
      if (!selectedImage || kolorystykaImages.length === 0) {
        setModalKeywordImages([]);
        return;
      }
      const foundImages = await decorConverter.findAllKeywordImages(
        selectedImage.name,
        kolorystykaImages
      );
      setModalKeywordImages(foundImages);
    };
    loadKeywordImages();
  }, [selectedImage, kolorystykaImages]);

  logger.debug('Gallery component render', {
    loading,
    folderCount: folders.length,
    error,
  });

  useEffect(() => {
    logger.debug('useEffect triggered with refreshKey', { refreshKey });
    fetchGalleryData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshKey is the intended trigger
  }, [refreshKey]);

  const fetchGalleryData = async () => {
    if (redirectingToLoginRef.current) return;
    try {
      logger.info('Fetching gallery data');
      setLoading(true);
      setLoadingProgress(10);
      setError(null);

      const controller = new AbortController();
      const timeout = setTimeout(() => {
        logger.error('Gallery API timeout');
        controller.abort();
      }, API_TIMEOUT_LONG);

      // Dodaj groupId do URL jeśli jest podany (podgląd admina)
      const apiUrl = groupId
        ? `/api/gallery?groupId=${groupId}`
        : '/api/gallery';

      setLoadingProgress(LOADING_PROGRESS_FETCH);
      const response = await fetch(apiUrl, {
        signal: controller.signal,
      });

      clearTimeout(timeout);
      setLoadingProgress(LOADING_PROGRESS_MID);
      logger.debug('Response status', { status: response.status });

      // Obsługa 304 Not Modified
      if (response.status === 304) {
        logger.info('Gallery not modified - using cached data');
        setLoadingProgress(LOADING_PROGRESS_COMPLETE);
        setTimeout(() => setLoading(false), UI_DELAY_SHORT);
        return;
      }

      if (!response.ok) {
        if (response.status === 429) {
          redirectingToLoginRef.current = true;
          router.replace('/login');
          return;
        }
        throw new Error(`API returned ${response.status}`);
      }

      setLoadingProgress(LOADING_PROGRESS_PARSE);
      const data: GalleryResponse = await response.json();
      logger.debug('Response data', {
        dataLength: JSON.stringify(data).length,
        foldersCount: data.data?.length || 0,
      });

      setLoadingProgress(90);
      if (data.success && data.data && data.data.length > 0) {
        logger.info('Gallery loaded successfully', {
          foldersCount: data.data.length,
        });
        setFolders(data.data);

        // Zamknij wszystkie kategorie i podkategorie na starcie (otwierają się tylko po kliknięciu)
        const collectAllPaths = (folders: GalleryFolder[]): string[] => {
          const paths: string[] = [];
          for (const f of folders) {
            paths.push(f.path);
            if (f.subfolders?.length) {
              paths.push(...collectAllPaths(f.subfolders));
            }
          }
          return paths;
        };
        setGlobalCollapsedFolders(new Set(collectAllPaths(data.data)));

        setError(null);
        setLoadingProgress(LOADING_PROGRESS_COMPLETE);
      } else {
        if (data.error === LOGIN_REQUIRED_MSG) {
          redirectingToLoginRef.current = true;
          router.replace('/login');
          return;
        }
        const noGroupMessage =
          'Nie masz przypisanej grupy. Skontaktuj się z administratorem.';
        const isNoGroup = data.error === noGroupMessage;
        if (isNoGroup) {
          logger.info('Gallery: użytkownik bez przypisanej grupy', {
            error: data.error,
          });
        } else {
          logger.error('Gallery API error or empty', {
            error: data.error || 'Empty data',
          });
        }
        setError(data.error || 'Brak danych w galerii');
      }
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        err.message.includes('429')
      ) {
        redirectingToLoginRef.current = true;
        router.replace('/login');
        return;
      }
      logger.error('Fetch error', err);
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Timeout - API nie odpowiada');
      } else {
        setError(
          `Błąd połączenia: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } finally {
      logger.debug('Setting loading to false');
      setTimeout(() => {
        setLoading(false);
        setLoadingProgress(0);
      }, UI_DELAY_SHORT);
    }
  };

  const handleImageClick = useCallback(
    (image: ImageFile, imagesInFolder: ImageFile[], folderPath?: string) => {
      const index = imagesInFolder.findIndex((img) => img.path === image.path);
      const safeIndex = index >= 0 ? index : 0;
      setCurrentImageList(imagesInFolder);
      setCurrentImageIndex(safeIndex);
      setSelectedImage(imagesInFolder[safeIndex] || image);
      setCurrentFolderPath(folderPath ?? null);
      setImageLoaded(false); // Reset stanu załadowania przy zmianie obrazu

      // Tracking wyświetlenia obrazu
      trackView('image', image.path, image.name);
    },
    [trackView]
  );

  const showAdjacentImage = (direction: 1 | -1) => {
    if (currentImageList.length === 0 || currentImageIndex === null) return;

    const count = currentImageList.length;
    let newIndex = currentImageIndex + direction;

    // Obsługa pętli
    if (newIndex < 0) newIndex = count - 1;
    if (newIndex >= count) newIndex = 0;

    const newImage = currentImageList[newIndex];
    if (newImage) {
      setCurrentImageIndex(newIndex);
      setSelectedImage(newImage);
      setImageLoaded(false); // Reset stanu załadowania przy zmianie obrazu
    }
  };

  const closeModal = () => {
    setSelectedImage(null);
    setCurrentFolderPath(null);
    setImageLoaded(false); // Reset stanu załadowania przy zamknięciu modala
  };

  if (loading) {
    return (
      <LoadingOverlay
        message="Ładowanie galerii..."
        progress={loadingProgress}
      />
    );
  }

  if (error) {
    const isEmptyFolder = error.includes('nie ma jeszcze');
    return (
      <div className={isEmptyFolder ? 'error error--soft' : 'error'}>
        <p>{isEmptyFolder ? error : `Błąd: ${error}`}</p>
        <button onClick={fetchGalleryData} className="retry-button">
          Spróbuj ponownie
        </button>
      </div>
    );
  }

  return (
    <>
      {folders.length === 0 ? (
        <div className="no-images">
          <p>Nie znaleziono obrazów w galerii</p>
        </div>
      ) : (
        <div className="folders-container">
          {folders.map((folder, index) => (
            <FolderSection
              key={`${folder.path}-${index}`}
              folder={folder}
              onImageClick={handleImageClick}
              globalCollapsedFolders={globalCollapsedFolders}
              setGlobalCollapsedFolders={setGlobalCollapsedFolders}
              allFolders={folders}
              onFolderView={(f) => trackView('folder', f.path, f.name)}
              onTrackDownload={trackDownload}
              isAdmin={isAdmin}
              cacheStatusByFolder={cacheStatusByFolder}
            />
          ))}
        </div>
      )}

      {selectedImage && (
        <div
          className="modal-overlay modal-overlay-fade-in"
          onClick={closeModal}
        >
          <div
            className={`modal-content${
              currentFolderPath === 'Kolorystyka'
                ? ' modal-content--kolorystyka'
                : ''
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* UI controls - always visible */}
            <button
              className="modal-nav-button modal-nav-button-left"
              onClick={(e) => {
                e.stopPropagation();
                showAdjacentImage(-1);
              }}
              title="Poprzedni obraz"
            >
              <i className="las la-angle-left"></i>
            </button>
            <button
              className="modal-nav-button modal-nav-button-right"
              onClick={(e) => {
                e.stopPropagation();
                showAdjacentImage(1);
              }}
              title="Następny obraz"
            >
              <i className="las la-angle-right"></i>
            </button>
            <button
              className="close-button"
              onClick={closeModal}
              title="Zamknij"
            >
              <i className="las la-times"></i>
            </button>
            {imageLoaded && (
              <div className="modal-bottom-actions">
                {currentFolderPath !== 'Kolorystyka' &&
                  modalKeywordImages.map((item, idx) => (
                    <button
                      key={`modal-keyword-${idx}`}
                      className="modal-color-button"
                      onTouchStart={(e) => {
                        // Na tablecie obsłuż touch event
                        if (isTouchDevice) {
                          e.stopPropagation();
                          e.preventDefault();
                          const rect = e.currentTarget.getBoundingClientRect();
                          setModalHoveredPreview({
                            image: item.image,
                            x: rect.left + rect.width / 2,
                            y: rect.top,
                          });
                          setTimeout(
                            () => setModalHoveredPreview(null),
                            PREVIEW_TIMEOUT
                          );
                        }
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Na tablecie TYLKO pokazuj miniaturkę, ABSOLUTNIE NIE zmieniaj obrazu
                        if (isTouchDevice) {
                          e.preventDefault();
                          const rect = e.currentTarget.getBoundingClientRect();
                          setModalHoveredPreview({
                            image: item.image,
                            x: rect.left + rect.width / 2,
                            y: rect.top,
                          });
                          // Ukryj podgląd po określonym czasie
                          setTimeout(
                            () => setModalHoveredPreview(null),
                            PREVIEW_TIMEOUT
                          );
                          return; // WAŻNE: return early - nie wykonuj dalszego kodu!
                        }
                        // Na desktopie zmień obraz
                        setModalHoveredPreview(null);
                        const index = kolorystykaImages.findIndex(
                          (img) => img.path === item.image.path
                        );
                        setCurrentImageList(kolorystykaImages);
                        setCurrentImageIndex(index >= 0 ? index : 0);
                        setSelectedImage(item.image);
                        setCurrentFolderPath('Kolorystyka');
                      }}
                      onMouseEnter={(e) => {
                        // Na tablecie wyłącz hover - tylko click pokazuje miniaturkę
                        if (!isTouchDevice) {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setModalHoveredPreview({
                            image: item.image,
                            x: rect.left + rect.width / 2,
                            y: rect.top,
                          });
                        }
                      }}
                      onMouseLeave={() => {
                        // Na tablecie nie ukrywaj podglądu przy mouseLeave
                        if (!isTouchDevice) {
                          setModalHoveredPreview(null);
                        }
                      }}
                      title={getDisplayName(item.image.name)}
                      style={{
                        backgroundImage: `url(${getOptimizedImageUrl(
                          item.image,
                          'thumb'
                        )})`,
                      }}
                    />
                  ))}
                <button
                  className="modal-download-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadFile(
                      selectedImage.url,
                      selectedImage.name,
                      trackDownload
                    );
                  }}
                  title="Pobierz plik"
                >
                  <i className="las la-download"></i>
                </button>
              </div>
            )}
            {modalHoveredPreview && currentFolderPath !== 'Kolorystyka' && (
              <div
                className="modal-color-preview"
                style={{
                  left: modalHoveredPreview.x - PREVIEW_OFFSET_X,
                  top: modalHoveredPreview.y - PREVIEW_OFFSET_Y,
                }}
              >
                <img
                  src={getOptimizedImageUrl(modalHoveredPreview.image, 'thumb')}
                  alt={modalHoveredPreview.image.name}
                />
                <span className="preview-name">
                  {getDisplayName(modalHoveredPreview.image.name)}
                </span>
              </div>
            )}
            {/* Wrapper na obraz - stały rozmiar */}
            <div className="modal-image-wrapper">
              <img
                key={selectedImage.path}
                src={getOptimizedImageUrl(selectedImage, 'full')}
                alt={selectedImage.name}
                className="modal-image"
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageLoaded(true)}
              />
            </div>
            {/* Info o obrazie */}
            <div className="modal-info">
              <h3>{selectedImage.name}</h3>
              <ImageMetadata
                src={selectedImage.url}
                fileSize={selectedImage.fileSize}
                lastModified={selectedImage.lastModified}
              />
              {/* Duplikaty przycisków tylko na mobile */}
              <div className="modal-mobile-actions">
                <button
                  type="button"
                  className="modal-mobile-nav-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    showAdjacentImage(-1);
                  }}
                  title="Poprzedni obraz"
                >
                  <i className="las la-angle-left"></i>
                </button>
                <button
                  type="button"
                  className="modal-mobile-download-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadFile(
                      selectedImage.url,
                      selectedImage.name,
                      trackDownload
                    );
                  }}
                  title="Pobierz plik"
                >
                  <i className="las la-download"></i>
                </button>
                <button
                  type="button"
                  className="modal-mobile-nav-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    showAdjacentImage(1);
                  }}
                  title="Następny obraz"
                >
                  <i className="las la-angle-right"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Gallery;
