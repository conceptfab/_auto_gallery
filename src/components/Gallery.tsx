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
  /** Obrazy z folderów Kolorystyka z całego drzewa */
  kolorystykaImages: ImageFile[];
  onFolderView?: (folder: GalleryFolder) => void;
  onTrackDownload?: (
    filePath: string,
    fileName: string
  ) => Promise<void> | void;
  isAdmin?: boolean;
  /** Grupy (tylko w widoku admina) – kolor dla folderów głównych */
  groups?: { id: string; name: string; galleryFolder: string; color?: string }[];
  /** Status cache z batch API: path -> (image name -> cached) */
  cacheStatusByFolder?: Record<string, Record<string, boolean>>;
}

function FolderSectionInner({
  folder,
  onImageClick,
  globalCollapsedFolders,
  setGlobalCollapsedFolders,
  allFolders: _allFolders,
  kolorystykaImages,
  onFolderView,
  onTrackDownload,
  isAdmin = false,
  groups = [],
  cacheStatusByFolder,
}: FolderSectionProps) {
  const groupColorForFolder = (folderPath: string, folderName: string) => {
    if (!isAdmin || groups.length === 0) return undefined;
    const normalized = (s: string) => s.replace(/\/$/, '').trim().toLowerCase();
    const match = groups.find(
      (g) =>
        normalized(g.galleryFolder) === normalized(folderPath) ||
        normalized(g.galleryFolder) === normalized(folderName)
    );
    return match?.color;
  };

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
    const indentClass = `level-${Math.min(depth, 4)}`;
    const categoryClass = currentFolder.isCategory
      ? 'category'
      : 'gallery-folder';
    const isCollapsed = globalCollapsedFolders.has(currentFolder.path);
    const hasCollapsibleContent =
      currentFolder.subfolders ||
      (!currentFolder.isCategory && currentFolder.images.length > 0);
    const groupColor =
      depth === 0
        ? groupColorForFolder(currentFolder.path, currentFolder.name)
        : undefined;
    const wrapperStyle = groupColor
      ? { borderLeft: `4px solid ${groupColor}` as const }
      : undefined;

    return (
      <div
        key={currentFolder.path}
        className={`folder-wrapper ${categoryClass} ${indentClass} ${
          !isCollapsed ? 'expanded' : ''
        }`}
        style={wrapperStyle}
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
    prev.kolorystykaImages === next.kolorystykaImages &&
    prev.isAdmin === next.isAdmin &&
    prev.groups === next.groups &&
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
  const [groups, setGroups] = useState<{ id: string; name: string; galleryFolder: string; color?: string }[]>([]);
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
  const [addingToMoodboard, setAddingToMoodboard] = useState(false);
  const [addedToMoodboard, setAddedToMoodboard] = useState(false);
  const [showMoodboardPicker, setShowMoodboardPicker] = useState(false);
  const [moodboardBoards, setMoodboardBoards] = useState<{ id: string; name?: string }[]>([]);
  const [loadingMoodboards, setLoadingMoodboards] = useState(false);
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

  // Zbierz obrazy z folderów Kolorystyka z całego drzewa
  const kolorystykaImages = useMemo(() => {
    const collectImages = (folderList: GalleryFolder[]): ImageFile[] => {
      let result: ImageFile[] = [];
      for (const folder of folderList) {
        if (folder.name.toLowerCase() === 'kolorystyka') {
          result = result.concat(folder.images || []);
        }
        if (folder.subfolders?.length) {
          result = result.concat(collectImages(folder.subfolders));
        }
      }
      return result;
    };
    return collectImages(folders);
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

  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/auth/admin/groups/list', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((data) => setGroups(data.groups ?? []))
      .catch(() => setGroups([]));
  }, [isAdmin]);

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
      setAddedToMoodboard(false);
      setShowMoodboardPicker(false);

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
      setAddedToMoodboard(false);
      setShowMoodboardPicker(false);
    }
  };

  const closeModal = () => {
    setSelectedImage(null);
    setCurrentFolderPath(null);
    setAddedToMoodboard(false);
    setShowMoodboardPicker(false);
    setImageLoaded(false); // Reset stanu załadowania przy zamknięciu modala
  };

  const handleOpenMoodboardPicker = useCallback(async () => {
    if (loadingMoodboards || addingToMoodboard) return;
    setLoadingMoodboards(true);
    try {
      const stateRes = await fetch('/api/moodboard/state', { credentials: 'same-origin' });
      if (!stateRes.ok) throw new Error('Nie udało się pobrać stanu moodboarda');
      const stateData = await stateRes.json();
      const boards: { id: string; name?: string }[] = (stateData.state?.boards || []).map(
        (b: { id: string; name?: string }) => ({ id: b.id, name: b.name })
      );
      setMoodboardBoards(boards);
      setShowMoodboardPicker(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Błąd pobierania listy moodboardów');
    } finally {
      setLoadingMoodboards(false);
    }
  }, [loadingMoodboards, addingToMoodboard]);

  const handleAddToMoodboard = useCallback(async (boardId: string) => {
    if (!selectedImage || addingToMoodboard) return;
    setAddingToMoodboard(true);
    setShowMoodboardPicker(false);
    try {
      const imageId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

      // Save gallery image as moodboard image via API
      const res = await fetch('/api/moodboard/add-from-gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: selectedImage.url,
          boardId,
          imageId,
        }),
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as { error?: string })?.error || 'Błąd dodawania');
      }
      const data = await res.json();

      // Fetch current board state and add image + comment + group
      const stateRes = await fetch('/api/moodboard/state', { credentials: 'same-origin' });
      if (stateRes.ok) {
        const stateData = await stateRes.json();
        const board = stateData.state?.boards?.find((b: { id: string }) => b.id === boardId);
        if (board) {
          const imgW = selectedImage.width ? Math.min(selectedImage.width, 400) : 300;
          const imgH = selectedImage.height ? Math.min(selectedImage.height, 300) : 200;
          const baseX = 50 + Math.random() * 200;
          const baseY = 50 + Math.random() * 200;

          // 1. Image element
          const newImage = {
            id: imageId,
            imagePath: data.imagePath,
            x: baseX,
            y: baseY,
            width: imgW,
            height: imgH,
          };
          board.images.push(newImage);

          // 2. Comment with collection info
          const commentId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
          const collectionName = currentFolderPath
            ? currentFolderPath.split('/').filter(Boolean).join(' / ')
            : 'Galeria';
          const newComment = {
            id: commentId,
            text: `Kolekcja: ${collectionName}`,
            color: 'none' as const,
            font: 'sans' as const,
            fontWeight: 'normal' as const,
            fontSize: 12,
            fontColor: '#888888',
            x: baseX,
            y: baseY + imgH + 4,
            width: Math.max(imgW, 160),
            height: 24,
          };
          board.comments.push(newComment);

          // 3. Group wrapping image + comment, named after file
          const groupId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
          const displayName = getDisplayName(selectedImage.name);
          const groupPadding = 10;
          const groupW = Math.max(imgW, newComment.width) + groupPadding * 2;
          const groupH = imgH + newComment.height + 4 + groupPadding * 2;
          const newGroup = {
            id: groupId,
            name: displayName,
            x: baseX - groupPadding,
            y: baseY - groupPadding,
            width: groupW,
            height: groupH,
            memberIds: [imageId, commentId],
          };
          if (!board.groups) board.groups = [];
          board.groups.push(newGroup);

          // Save updated state
          await fetch('/api/moodboard/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(stateData.state),
            credentials: 'same-origin',
          });
        }
      }

      setAddedToMoodboard(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Błąd dodawania do moodboarda');
    } finally {
      setAddingToMoodboard(false);
    }
  }, [selectedImage, addingToMoodboard, currentFolderPath]);

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
              kolorystykaImages={kolorystykaImages}
              onFolderView={(f) => trackView('folder', f.path, f.name)}
              onTrackDownload={trackDownload}
              isAdmin={isAdmin}
              groups={groups}
              cacheStatusByFolder={cacheStatusByFolder}
            />
          ))}
        </div>
      )}

      {selectedImage && (() => {
        const isKolorystykaView =
          currentFolderPath != null &&
          (currentFolderPath === 'Kolorystyka' ||
            currentFolderPath.toLowerCase().endsWith('/kolorystyka'));
        return (
        <div
          className="modal-overlay modal-overlay-fade-in"
          onClick={closeModal}
        >
          <div
            className={`modal-content${
              isKolorystykaView ? ' modal-content--kolorystyka' : ''
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
                {!isKolorystykaView &&
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
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <button
                    className="modal-download-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (addedToMoodboard) return;
                      if (showMoodboardPicker) {
                        setShowMoodboardPicker(false);
                      } else {
                        handleOpenMoodboardPicker();
                      }
                    }}
                    disabled={addingToMoodboard}
                    title={addedToMoodboard ? 'Dodano do moodboarda' : 'Dodaj do moodboarda'}
                    style={addedToMoodboard ? { color: '#22c55e' } : undefined}
                  >
                    <i className={addingToMoodboard || loadingMoodboards ? 'las la-spinner la-spin' : addedToMoodboard ? 'las la-check' : 'las la-plus-circle'}></i>
                  </button>
                  {showMoodboardPicker && moodboardBoards.length > 0 && (
                    <div
                      className="moodboard-picker-dropdown"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: 'absolute',
                        bottom: '100%',
                        right: 0,
                        marginBottom: 8,
                        background: 'rgba(30,30,30,0.95)',
                        borderRadius: 8,
                        padding: '6px 0',
                        minWidth: 180,
                        maxHeight: 240,
                        overflowY: 'auto',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                        zIndex: 1000,
                        backdropFilter: 'blur(10px)',
                      }}
                    >
                      <div style={{ padding: '4px 12px 6px', fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Dodaj do moodboarda
                      </div>
                      {moodboardBoards.map((board) => (
                        <button
                          key={board.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddToMoodboard(board.id);
                          }}
                          style={{
                            display: 'block',
                            width: '100%',
                            padding: '8px 12px',
                            background: 'transparent',
                            border: 'none',
                            color: '#e0e0e0',
                            fontSize: 13,
                            textAlign: 'left',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.1)'; }}
                          onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
                        >
                          <i className="las la-th-large" style={{ marginRight: 6, opacity: 0.6 }}></i>
                          {board.name || `Moodboard ${board.id.slice(0, 6)}`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            {modalHoveredPreview && !isKolorystykaView && (
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
        );
      })()}
    </>
  );
};

export default Gallery;
