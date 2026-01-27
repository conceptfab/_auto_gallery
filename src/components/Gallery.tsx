import React, { useState, useEffect, useCallback, memo } from 'react';
import { GalleryFolder, ImageFile, GalleryResponse } from '@/src/types/gallery';
import ImageGrid from './ImageGrid';
import ImageMetadata from './ImageMetadata';
import LoadingOverlay from './LoadingOverlay';
import { logger } from '@/src/utils/logger';
import { getOptimizedImageUrl } from '@/src/utils/imageUtils';
import { downloadFile } from '@/src/utils/downloadUtils';

interface FolderSectionProps {
  folder: GalleryFolder;
  onImageClick: (image: ImageFile, imagesInFolder: ImageFile[]) => void;
  globalCollapsedFolders: Set<string>;
  setGlobalCollapsedFolders: (collapsed: Set<string>) => void;
  allFolders: GalleryFolder[];
}

function FolderSectionInner({
  folder,
  onImageClick,
  globalCollapsedFolders,
  setGlobalCollapsedFolders,
  allFolders,
}: FolderSectionProps) {
  const toggleFolder = (folderPath: string) => {
    const newCollapsed = new Set(globalCollapsedFolders);
    if (newCollapsed.has(folderPath)) {
      newCollapsed.delete(folderPath);
    } else {
      newCollapsed.add(folderPath);
    }
    setGlobalCollapsedFolders(newCollapsed);
  };

  const renderFolder = (currentFolder: GalleryFolder, depth: number = 0) => {
    // Znajdź obrazy z Kolorystyki
    const kolorystykaFolder = allFolders.find(
      (f) => f.name.toLowerCase() === 'kolorystyka',
    );
    const kolorystykaImages = kolorystykaFolder?.images || [];

    if (kolorystykaImages.length > 0) {
      logger.debug(
        'Gallery - Znaleziono folder Kolorystyka z',
        kolorystykaImages.length,
        'obrazami',
      );
    } else {
      logger.debug(
        'Gallery - Brak folderu Kolorystyka lub jest pusty. Dostępne foldery:',
        allFolders.map((f) => f.name),
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
        className={`folder-wrapper ${categoryClass} ${indentClass} ${!isCollapsed ? 'expanded' : ''}`}
      >
        {currentFolder.isCategory ? (
          <div className="category-header">
            <h2 className="category-title">
              <div className="folder-title-left">
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
                  className={`folder-action-button ${isCollapsed ? 'collapsed' : ''}`}
                  onClick={() => toggleFolder(currentFolder.path)}
                >
                  <i className="las la-angle-up"></i>
                </button>
              )}
            </h2>
          </div>
        ) : (
          <div className="gallery-section">
            <h3 className="gallery-title">
              <div className="folder-title-left">
                <i className="lar la-image gallery-icon"></i>
                {currentFolder.name}
                <span className="inline-image-count">
                  ({currentFolder.images.length})
                </span>
              </div>
              {hasCollapsibleContent && (
                <button
                  className={`folder-action-button ${isCollapsed ? 'collapsed' : ''}`}
                  onClick={() => toggleFolder(currentFolder.path)}
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
                kolorystykaImages={kolorystykaImages}
              />
            )}
          </div>
        )}

        {currentFolder.subfolders && !isCollapsed && (
          <div className="subfolders">
            {currentFolder.subfolders.map((subfolder) =>
              renderFolder(subfolder, depth + 1),
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
    prev.folder === next.folder &&
    prev.allFolders === next.allFolders &&
    prev.onImageClick === next.onImageClick &&
    prev.setGlobalCollapsedFolders === next.setGlobalCollapsedFolders &&
    prev.globalCollapsedFolders.has(prev.folder.path) ===
      next.globalCollapsedFolders.has(next.folder.path),
);

interface GalleryProps {
  refreshKey?: number;
  groupId?: string;
}

const Gallery: React.FC<GalleryProps> = ({ refreshKey, groupId }) => {
  const [folders, setFolders] = useState<GalleryFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<ImageFile | null>(null);
  const [currentImageList, setCurrentImageList] = useState<ImageFile[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState<number | null>(
    null,
  );
  const [globalCollapsedFolders, setGlobalCollapsedFolders] = useState<
    Set<string>
  >(new Set());

  logger.debug('Gallery component render', {
    loading,
    folderCount: folders.length,
    error,
  });

  useEffect(() => {
    logger.debug('useEffect triggered with refreshKey', { refreshKey });
    fetchGalleryData();
  }, [refreshKey]);

  const fetchGalleryData = async () => {
    try {
      logger.info('Fetching gallery data');
      setLoading(true);
      setLoadingProgress(10);
      setError(null);

      const controller = new AbortController();
      const timeout = setTimeout(() => {
        logger.error('Gallery API timeout');
        controller.abort();
      }, 30000); // 30s timeout

      // Dodaj groupId do URL jeśli jest podany (podgląd admina)
      const apiUrl = groupId
        ? `/api/gallery?groupId=${groupId}`
        : '/api/gallery';

      setLoadingProgress(30);
      const response = await fetch(apiUrl, {
        signal: controller.signal,
      });

      clearTimeout(timeout);
      setLoadingProgress(60);
      logger.debug('Response status', { status: response.status });

      // Obsługa 304 Not Modified
      if (response.status === 304) {
        logger.info('Gallery not modified - using cached data');
        setLoadingProgress(100);
        setTimeout(() => setLoading(false), 200);
        return;
      }

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      setLoadingProgress(80);
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

        // Zamknij wszystkie główne kategorie na starcie
        const allMainFolderPaths = new Set(
          data.data.map((folder) => folder.path),
        );
        setGlobalCollapsedFolders(allMainFolderPaths);

        setError(null);
        setLoadingProgress(100);
      } else {
        logger.error('Gallery API error or empty', {
          error: data.error || 'Empty data',
        });
        setError(data.error || 'Brak danych w galerii');
      }
    } catch (err: any) {
      logger.error('Fetch error', err);
      if (err.name === 'AbortError') {
        setError('Timeout - API nie odpowiada');
      } else {
        setError(`Błąd połączenia: ${err.message}`);
      }
    } finally {
      logger.debug('Setting loading to false');
      setTimeout(() => {
        setLoading(false);
        setLoadingProgress(0);
      }, 200);
    }
  };

  const handleImageClick = useCallback(
    (image: ImageFile, imagesInFolder: ImageFile[]) => {
      const index = imagesInFolder.findIndex((img) => img.path === image.path);
      const safeIndex = index >= 0 ? index : 0;
      setCurrentImageList(imagesInFolder);
      setCurrentImageIndex(safeIndex);
      setSelectedImage(imagesInFolder[safeIndex] || image);
    },
    [],
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
    }
  };

  const closeModal = () => {
    setSelectedImage(null);
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
    return (
      <div className="error">
        <p>Błąd: {error}</p>
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
            />
          ))}
        </div>
      )}

      {selectedImage && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
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
            <button className="close-button" onClick={closeModal}>
              <i className="las la-times"></i>
            </button>
            <button
              className="modal-download-button"
              onClick={(e) => {
                e.stopPropagation();
                downloadFile(selectedImage.url, selectedImage.name);
              }}
              title="Pobierz plik"
            >
              <i className="las la-download"></i>
            </button>
            <img
              src={getOptimizedImageUrl(selectedImage, 'full')}
              alt={selectedImage.name}
              className="modal-image"
            />
            <div className="modal-info">
              <h3>{selectedImage.name}</h3>
              <ImageMetadata
                src={selectedImage.url}
                fileSize={selectedImage.fileSize}
                lastModified={selectedImage.lastModified}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Gallery;
