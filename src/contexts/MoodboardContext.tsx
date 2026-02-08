'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  MoodboardBoard,
  MoodboardComment,
  MoodboardImage,
  MoodboardGroup,
  MoodboardSketch,
  MoodboardAppState,
  DrawingData,
  DrawingTool,
  MOODBOARD_STORAGE_KEY,
  DEFAULT_MOODBOARD_DRAWING_CONFIG,
  type MoodboardDrawingConfig,
} from '@/src/types/moodboard';
import { useBoardSSE, OnlineUser, DrawingPresence } from '@/src/hooks/useBoardSSE';
import { useMoodboardDrawingConfig } from '@/src/hooks/useMoodboardDrawingConfig';
import { useAuth } from '@/src/contexts/AuthContext';

type SelectableType = 'image' | 'comment' | 'group' | 'sketch' | null;

interface MoodboardContextValue extends MoodboardBoard {
  loading: boolean;
  loadError: string | null;
  saveError: string | null;
  selectedId: string | null;
  selectedType: SelectableType;
  boards: MoodboardBoard[];
  activeId: string;
  hoveredGroupId: string | null;
  lastAddedGroupId: string | null;
  setSelected: (id: string | null, type: SelectableType) => void;
  setHoveredGroup: (x: number | null, y: number | null) => void;
  setActiveBoard: (id: string) => void;
  setMoodboardName: (name: string) => void;
  updateBoard: (boardId: string, patch: { groupId?: string }) => void;
  deleteBoard: (boardId: string) => void;
  createNewMoodboard: () => void;
  addImage: (image: Omit<MoodboardImage, 'id'>) => void;
  updateImage: (id: string, patch: Partial<MoodboardImage>) => void;
  removeImage: (id: string) => void;
  addComment: (comment: Omit<MoodboardComment, 'id'> & { id?: string }) => void;
  updateComment: (id: string, patch: Partial<MoodboardComment>) => void;
  removeComment: (id: string) => void;
  addGroup: (group: Omit<MoodboardGroup, 'id'>) => void;
  updateGroup: (id: string, patch: Partial<MoodboardGroup>) => void;
  removeGroup: (id: string) => void;
  addSketch: (sketch: Omit<MoodboardSketch, 'id'>) => void;
  updateSketch: (id: string, patch: Partial<MoodboardSketch>) => void;
  removeSketch: (id: string) => void;
  moveItemToBoard: (type: 'image' | 'sketch' | 'group' | 'comment', itemId: string, targetBoardId: string) => void;
  updateImageAnnotations: (imageId: string, drawing: DrawingData) => void;
  clearImageAnnotations: (imageId: string) => void;
  autoGroupItem: (itemId: string, x: number, y: number, width: number, height: number) => void;
  updateViewport: (viewport: { scale: number; translateX: number; translateY: number }) => void;
  drawingMode: boolean;
  setDrawingMode: (active: boolean) => void;
  activeTool: DrawingTool;
  setActiveTool: (tool: DrawingTool) => void;
  toolColor: string;
  setToolColor: (color: string) => void;
  toolWidth: number;
  setToolWidth: (width: number) => void;
  onlineUsers: OnlineUser[];
  drawingUsers: Map<string, DrawingPresence>;
  myColor: string;
  notifyDrawing: (sketchId: string, tool: string) => void;
  notifyIdle: () => void;
  /** Konfiguracja paska rysowania dla bieżącego moodboarda (wg groupId) */
  drawingConfig: MoodboardDrawingConfig;
}

const MoodboardContext = createContext<MoodboardContextValue | null>(null);

const DEBOUNCE_SAVE_MS = 2500;
const API_STATE = '/api/moodboard/state';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

async function saveStateToServer(appState: MoodboardAppState): Promise<void> {
  const res = await fetch(API_STATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(appState),
    credentials: 'same-origin',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string })?.error ||
        `Zapis nie powiódł się (${res.status})`
    );
  }
}

const emptyBoard = (): MoodboardBoard => ({
  id: generateId(),
  name: undefined,
  images: [],
  comments: [],
  groups: [],
});

export function MoodboardProvider({ children }: { children: React.ReactNode }) {
  const [appState, setAppState] = useState<MoodboardAppState>(() => {
    // Try to load from localStorage for instant feedback
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(MOODBOARD_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && Array.isArray(parsed.boards) && parsed.activeId) {
            return parsed;
          }
        }
      } catch (_e) {
        // ignore
      }
    }
    const first = emptyBoard();
    return { boards: [first], activeId: first.id };
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
  const [lastAddedGroupId, setLastAddedGroupId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<SelectableType>(null);
  const [drawingMode, setDrawingMode] = useState(false);
  const [activeTool, setActiveTool] = useState<DrawingTool>('pen');
  const [toolColor, setToolColor] = useState('#000000');
  const [toolWidth, setToolWidth] = useState(3);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // SSE presence
  const { authStatus } = useAuth();
  const boardSSE = useBoardSSE({
    boardId: appState.activeId,
    enabled: !!authStatus?.isLoggedIn,
  });

  const activeBoard =
    useMemo(
      () => appState.boards.find((b) => b.id === appState.activeId),
      [appState.boards, appState.activeId]
    ) ?? appState.boards[0];
  const activeId = activeBoard?.id ?? appState.activeId;

  const { getConfigForGroup } = useMoodboardDrawingConfig();
  const drawingConfig = useMemo<MoodboardDrawingConfig>(
    () => getConfigForGroup(activeBoard?.groupId) ?? DEFAULT_MOODBOARD_DRAWING_CONFIG,
    [getConfigForGroup, activeBoard?.groupId]
  );

  // Dopasuj narzędzie/kolor/grubość do konfiguracji gdy zmieni się grupa lub konfiguracja
  useEffect(() => {
    if (!drawingConfig) return;
    setActiveTool((prev) => {
      if (drawingConfig.tools.includes(prev)) return prev;
      return drawingConfig.defaultTool ?? drawingConfig.tools[0] ?? 'pen';
    });
    setToolColor((prev) => {
      if (drawingConfig.strokeColors.includes(prev)) return prev;
      return drawingConfig.defaultColor ?? drawingConfig.strokeColors[0] ?? '#000000';
    });
    setToolWidth((prev) => {
      if (drawingConfig.strokeWidths.includes(prev)) return prev;
      return drawingConfig.defaultWidth ?? drawingConfig.strokeWidths[0] ?? 3;
    });
  }, [drawingConfig]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(API_STATE, { credentials: 'same-origin' });
        if (!res.ok) {
          if (!cancelled) {
            setLoadError('Nie udało się załadować moodboarda.');
            setLoading(false);
          }
          return;
        }
        const data = (await res.json()) as {
          success?: boolean;
          state?: MoodboardAppState;
        };
        if (cancelled) return;
        const loaded = data?.state;
        if (
          loaded &&
          Array.isArray(loaded.boards) &&
          typeof loaded.activeId === 'string' &&
          loaded.boards.length > 0
        ) {
          const activeId = loaded.boards.some((b) => b.id === loaded.activeId)
            ? loaded.activeId
            : loaded.boards[0].id;
          setAppState({ boards: loaded.boards, activeId });
        } else {
          const first = emptyBoard();
          setAppState({ boards: [first], activeId: first.id });
        }
        setLoadError(null);
      } catch (_err) {
        if (!cancelled) setLoadError('Błąd połączenia z serwerem.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-refetch when another user updates the board (SSE board:updated)
  useEffect(() => {
    if (!boardSSE.boardUpdated) return;
    fetch(API_STATE, { credentials: 'same-origin' })
      .then(r => r.json())
      .then(data => {
        if (data.success && data.state) {
          setAppState(prev => {
            const remote = data.state as MoodboardAppState;
            if (!remote.boards || !remote.activeId) return prev;
            return { boards: remote.boards, activeId: prev.activeId };
          });
        }
      })
      .catch(() => {});
  }, [boardSSE.boardUpdated]);

  const setSelected = useCallback(
    (id: string | null, type: SelectableType) => {
      setSelectedId(id);
      setSelectedType(type);
    },
    []
  );

  const scheduleSave = useCallback((nextAppState: MoodboardAppState) => {
    // Save to localStorage immediately for fast recovery on reload
    if (typeof window !== 'undefined') {
      localStorage.setItem(MOODBOARD_STORAGE_KEY, JSON.stringify(nextAppState));
    }

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      saveStateToServer(nextAppState).then(
        () => setSaveError(null),
        (err) =>
          setSaveError(err instanceof Error ? err.message : 'Błąd zapisu')
      );
    }, DEBOUNCE_SAVE_MS);
  }, []);

  // Save state immediately (e.g. on unmount or critical actions)
  const saveStateImmediate = useCallback(async (nextAppState: MoodboardAppState) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    try {
      await saveStateToServer(nextAppState);
      setSaveError(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Błąd zapisu');
    }
  }, []);

  const setActiveBoard = useCallback(
    (id: string) => {
      if (id === appState.activeId) return;
      setAppState((prev) => {
        const next = { ...prev, activeId: id };
        scheduleSave(next);
        return next;
      });
      setSelectedId(null);
      setSelectedType(null);
    },
    [appState.activeId, scheduleSave]
  );

  const setMoodboardName = useCallback(
    (name: string) => {
      setAppState((prev) => {
        const boards = prev.boards.map((b) =>
          b.id === prev.activeId ? { ...b, name: name || undefined } : b
        );
        const next = { ...prev, boards };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const updateBoard = useCallback(
    (boardId: string, patch: { groupId?: string }) => {
      setAppState((prev) => {
        const boards = prev.boards.map((b) =>
          b.id === boardId ? { ...b, ...patch } : b
        );
        const next = { ...prev, boards };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const deleteBoard = useCallback(
    (boardId: string) => {
      setAppState((prev) => {
        if (prev.boards.length <= 1) return prev;
        const newBoards = prev.boards.filter((b) => b.id !== boardId);
        let newActiveId = prev.activeId;
        if (prev.activeId === boardId) {
          const idx = prev.boards.findIndex((b) => b.id === boardId);
          const nextIdx = Math.min(idx, newBoards.length - 1);
          newActiveId = newBoards[nextIdx]?.id ?? newBoards[0].id;
        }
        const next: MoodboardAppState = {
          boards: newBoards,
          activeId: newActiveId,
        };
        scheduleSave(next);
        return next;
      });
      setSelectedId(null);
      setSelectedType(null);
    },
    [scheduleSave]
  );

  const createNewMoodboard = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const newBoard = emptyBoard();
    setAppState((prev) => {
      const next: MoodboardAppState = {
        boards: [...prev.boards, newBoard],
        activeId: prev.activeId, // aktywna zakładka zostaje na środku, nowa pojawia się po prawej
      };
      saveStateImmediate(next);
      return next;
    });
    setSelectedId(null);
    setSelectedType(null);
  }, [saveStateImmediate]);

  const addImage = useCallback(
    (image: Omit<MoodboardImage, 'id'> & { id?: string }) => {
      const newImage: MoodboardImage = {
        ...image,
        id: image.id || generateId(),
      };
      setAppState((prev) => {
        const boards = prev.boards.map((b) =>
          b.id === prev.activeId ? { ...b, images: [...b.images, newImage] } : b
        );
        const next = { ...prev, boards };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const updateImage = useCallback(
    (id: string, patch: Partial<MoodboardImage>) => {
      setAppState((prev) => {
        const boards = prev.boards.map((b) =>
          b.id === prev.activeId
            ? {
                ...b,
                images: b.images.map((img) =>
                  img.id === id ? { ...img, ...patch } : img
                ),
              }
            : b
        );
        const next = { ...prev, boards };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const removeImage = useCallback(
    (id: string) => {
      setAppState((prev) => {
        const activeBoard = prev.boards.find((b) => b.id === prev.activeId);
        const imageToRemove = activeBoard?.images.find((img) => img.id === id);

        // Usuń plik z dysku jeśli obraz ma imagePath
        if (imageToRemove?.imagePath) {
          fetch('/api/moodboard/delete-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ boardId: prev.activeId, imageId: id }),
            credentials: 'same-origin',
          }).catch(() => {
            // Ignoruj błędy usuwania pliku
          });
        }

        const boards = prev.boards.map((b) =>
          b.id === prev.activeId
            ? { ...b, images: b.images.filter((img) => img.id !== id) }
            : b
        );
        const next = { ...prev, boards };
        scheduleSave(next);
        return next;
      });
      if (selectedId === id && selectedType === 'image') {
        setSelectedId(null);
        setSelectedType(null);
      }
    },
    [scheduleSave, selectedId, selectedType]
  );

  const addComment = useCallback(
    (comment: Omit<MoodboardComment, 'id'> & { id?: string }) => {
      const newComment: MoodboardComment = {
        ...comment,
        id: comment.id || generateId(),
      };
      setAppState((prev) => {
        const boards = prev.boards.map((b) =>
          b.id === prev.activeId
            ? { ...b, comments: [...b.comments, newComment] }
            : b
        );
        const next = { ...prev, boards };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const updateComment = useCallback(
    (id: string, patch: Partial<MoodboardComment>) => {
      setAppState((prev) => {
        const boards = prev.boards.map((b) =>
          b.id === prev.activeId
            ? {
                ...b,
                comments: b.comments.map((c) =>
                  c.id === id ? { ...c, ...patch } : c
                ),
              }
            : b
        );
        const next = { ...prev, boards };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const removeComment = useCallback(
    (id: string) => {
      setAppState((prev) => {
        const boards = prev.boards.map((b) =>
          b.id === prev.activeId
            ? { ...b, comments: b.comments.filter((c) => c.id !== id) }
            : b
        );
        const next = { ...prev, boards };
        scheduleSave(next);
        return next;
      });
      if (selectedId === id && selectedType === 'comment') {
        setSelectedId(null);
        setSelectedType(null);
      }
    },
    [scheduleSave, selectedId, selectedType]
  );

  const addGroup = useCallback(
    (group: Omit<MoodboardGroup, 'id'>) => {
      const newGroup: MoodboardGroup = {
        ...group,
        id: generateId(),
      };
      setAppState((prev) => {
        const boards = prev.boards.map((b) =>
          b.id === prev.activeId
            ? { ...b, groups: [...(b.groups || []), newGroup] }
            : b
        );
        const next = { ...prev, boards };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const updateGroup = useCallback(
    (id: string, patch: Partial<MoodboardGroup>) => {
      setAppState((prev) => {
        const boards = prev.boards.map((b) => {
          if (b.id !== prev.activeId) return b;

          const group = (b.groups || []).find((g) => g.id === id);
          if (!group) return b;

          const groups = (b.groups || []).map((g) => {
            if (g.id !== id) return g;
            return { ...g, ...patch };
          });

          // Handle member movement only if it's a pure translation (dragging)
          // If patch contains width/height, it's a resize, and content shouldn't move
          const isResize = patch.width !== undefined || patch.height !== undefined;
          let images = b.images;
          let comments = b.comments;
          let sketches = b.sketches || [];

          if (!isResize && (patch.x !== undefined || patch.y !== undefined)) {
            const dx = (patch.x ?? group.x) - group.x;
            const dy = (patch.y ?? group.y) - group.y;

            if (dx !== 0 || dy !== 0) {
              images = b.images.map((img) =>
                group.memberIds.includes(img.id)
                  ? { ...img, x: img.x + dx, y: img.y + dy }
                  : img
              );
              comments = b.comments.map((c) =>
                group.memberIds.includes(c.id)
                  ? { ...c, x: c.x + dx, y: c.y + dy }
                  : c
              );
              sketches = sketches.map((sk) =>
                group.memberIds.includes(sk.id)
                  ? { ...sk, x: sk.x + dx, y: sk.y + dy }
                  : sk
              );
            }
          }

          return { ...b, groups, images, comments, sketches };
        });

        const next = { ...prev, boards };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const removeGroup = useCallback(
    (id: string) => {
      setAppState((prev) => {
        const boards = prev.boards.map((b) =>
          b.id === prev.activeId
            ? { ...b, groups: (b.groups || []).filter((g) => g.id !== id) }
            : b
        );
        const next = { ...prev, boards };
        scheduleSave(next);
        return next;
      });
      if (selectedId === id && selectedType === 'group') {
        setSelectedId(null);
        setSelectedType(null);
      }
    },
    [scheduleSave, selectedId, selectedType]
  );

  const addSketch = useCallback(
    (sketch: Omit<MoodboardSketch, 'id'>) => {
      const newSketch: MoodboardSketch = {
        ...sketch,
        id: generateId(),
      };
      setAppState((prev) => {
        const boards = prev.boards.map((b) =>
          b.id === prev.activeId
            ? { ...b, sketches: [...(b.sketches || []), newSketch] }
            : b
        );
        const next = { ...prev, boards };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const updateSketch = useCallback(
    (id: string, patch: Partial<MoodboardSketch>) => {
      setAppState((prev) => {
        const boards = prev.boards.map((b) =>
          b.id === prev.activeId
            ? {
                ...b,
                sketches: (b.sketches || []).map((sk) =>
                  sk.id === id ? { ...sk, ...patch } : sk
                ),
              }
            : b
        );
        const next = { ...prev, boards };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const removeSketch = useCallback(
    (id: string) => {
      setAppState((prev) => {
        const boards = prev.boards.map((b) =>
          b.id === prev.activeId
            ? { ...b, sketches: (b.sketches || []).filter((sk) => sk.id !== id) }
            : b
        );
        const next = { ...prev, boards };
        scheduleSave(next);
        return next;
      });
      if (selectedId === id && selectedType === 'sketch') {
        setSelectedId(null);
        setSelectedType(null);
      }
    },
    [scheduleSave, selectedId, selectedType]
  );

  const moveItemToBoard = useCallback(
    (type: 'image' | 'sketch' | 'group' | 'comment', itemId: string, targetBoardId: string) => {
      setAppState((prev) => {
        const srcBoard = prev.boards.find((b) => b.id === prev.activeId);
        if (!srcBoard) return prev;

        if (type === 'comment') {
          const comment = srcBoard.comments.find((c) => c.id === itemId);
          if (!comment) return prev;
          const boards = prev.boards.map((b) => {
            if (b.id === prev.activeId) {
              return { ...b, comments: b.comments.filter((c) => c.id !== itemId) };
            }
            if (b.id === targetBoardId) {
              return { ...b, comments: [...b.comments, comment] };
            }
            return b;
          });
          const next = { ...prev, boards };
          scheduleSave(next);
          return next;
        }

        if (type === 'group') {
          const group = (srcBoard.groups || []).find((g) => g.id === itemId);
          if (!group) return prev;
          const memberIds = group.memberIds || [];
          const memberImages = srcBoard.images.filter((img) => memberIds.includes(img.id));
          const memberSketches = (srcBoard.sketches || []).filter((sk) => memberIds.includes(sk.id));
          const boards = prev.boards.map((b) => {
            if (b.id === prev.activeId) {
              return {
                ...b,
                groups: (b.groups || []).filter((g) => g.id !== itemId),
                images: b.images.filter((img) => !memberIds.includes(img.id)),
                sketches: (b.sketches || []).filter((sk) => !memberIds.includes(sk.id)),
              };
            }
            if (b.id === targetBoardId) {
              return {
                ...b,
                groups: [...(b.groups || []), group],
                images: [...b.images, ...memberImages],
                sketches: [...(b.sketches || []), ...memberSketches],
              };
            }
            return b;
          });
          const next = { ...prev, boards };
          scheduleSave(next);
          return next;
        }

        // image | sketch
        let item: MoodboardImage | MoodboardSketch | undefined;
        if (type === 'image') {
          item = srcBoard.images.find((img) => img.id === itemId);
        } else {
          item = (srcBoard.sketches || []).find((sk) => sk.id === itemId);
        }
        if (!item) return prev;

        const boards = prev.boards.map((b) => {
          if (b.id === prev.activeId) {
            const patch: Partial<MoodboardBoard> = {};
            if (type === 'image') {
              patch.images = b.images.filter((img) => img.id !== itemId);
            } else {
              patch.sketches = (b.sketches || []).filter((sk) => sk.id !== itemId);
            }
            patch.groups = (b.groups || []).map((g) =>
              g.memberIds.includes(itemId)
                ? { ...g, memberIds: g.memberIds.filter((id) => id !== itemId) }
                : g
            );
            return { ...b, ...patch };
          }
          if (b.id === targetBoardId) {
            if (type === 'image') {
              return { ...b, images: [...b.images, item as MoodboardImage] };
            } else {
              return { ...b, sketches: [...(b.sketches || []), item as MoodboardSketch] };
            }
          }
          return b;
        });

        const next = { ...prev, boards };
        scheduleSave(next);
        return next;
      });
      if (selectedId === itemId) {
        setSelectedId(null);
        setSelectedType(null);
      }
    },
    [scheduleSave, selectedId]
  );

  const updateImageAnnotations = useCallback(
    (imageId: string, drawing: DrawingData) => {
      setAppState((prev) => {
        const boards = prev.boards.map((b) =>
          b.id === prev.activeId
            ? {
                ...b,
                images: b.images.map((img) =>
                  img.id === imageId ? { ...img, annotations: drawing } : img
                ),
              }
            : b
        );
        const next = { ...prev, boards };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const clearImageAnnotations = useCallback(
    (imageId: string) => {
      setAppState((prev) => {
        const boards = prev.boards.map((b) =>
          b.id === prev.activeId
            ? {
                ...b,
                images: b.images.map((img) =>
                  img.id === imageId ? { ...img, annotations: undefined } : img
                ),
              }
            : b
        );
        const next = { ...prev, boards };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const autoGroupItem = useCallback(
    (itemId: string, x: number, y: number, width: number, height: number) => {
      const centerX = x + width / 2;
      const centerY = y + height / 2;

      setAppState((prev) => {
        const board = prev.boards.find((b) => b.id === prev.activeId);
        if (!board) return prev;

        const groups = board.groups || [];
        // Find the topmost group containing the center point
        const containingGroup = [...groups]
          .reverse()
          .find(
            (g) =>
              centerX >= g.x &&
              centerX <= g.x + g.width &&
              centerY >= g.y &&
              centerY <= g.y + g.height
          );

        const boards = prev.boards.map((b) => {
          if (b.id !== prev.activeId) return b;

          const nextGroups = (b.groups || []).map((g) => {
            const isMember = g.memberIds.includes(itemId);
            const shouldBeMember = containingGroup?.id === g.id;

            if (isMember && !shouldBeMember) {
              return {
                ...g,
                memberIds: g.memberIds.filter((id) => id !== itemId),
              };
            }
            if (!isMember && shouldBeMember) {
              setLastAddedGroupId(g.id);
              setTimeout(() => setLastAddedGroupId(null), 1000);
              return {
                ...g,
                memberIds: [...g.memberIds, itemId],
              };
            }
            return g;
          });

          return { ...b, groups: nextGroups };
        });

        const next = { ...prev, boards };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const setHoveredGroup = useCallback((x: number | null, y: number | null) => {
    if (x === null || y === null) {
      setHoveredGroupId(null);
      return;
    }

    setAppState((prev) => {
      const board = prev.boards.find((b) => b.id === prev.activeId);
      if (!board) return prev;

      const groups = board.groups || [];
      const containingGroup = [...groups]
        .reverse()
        .find((g) => x >= g.x && x <= g.x + g.width && y >= g.y && y <= g.y + g.height);

      setHoveredGroupId(containingGroup?.id || null);
      return prev;
    });
  }, []);

  const updateViewport = useCallback(
    (viewport: { scale: number; translateX: number; translateY: number }) => {
      setAppState((prev) => {
        const boards = prev.boards.map((b) =>
          b.id === prev.activeId ? { ...b, viewport } : b
        );
        const next = { ...prev, boards };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const appStateRef = useRef(appState);
  appStateRef.current = appState;

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        // Zapisz natychmiast przy odmontowaniu jeśli jest coś w kolejce
        saveStateToServer(appStateRef.current).catch(console.error);
      }
    };
  }, []);

  const value = useMemo<MoodboardContextValue>(
    () => ({
      ...activeBoard,
      loading,
      loadError,
      saveError,
      selectedId,
      selectedType,
      boards: appState.boards,
      activeId,
      setSelected,
      setActiveBoard,
      setMoodboardName,
      updateBoard,
      deleteBoard,
      createNewMoodboard,
      addImage,
      updateImage,
      removeImage,
      addComment,
      updateComment,
      removeComment,
      addGroup,
      updateGroup,
      removeGroup,
      addSketch,
      updateSketch,
      removeSketch,
      moveItemToBoard,
      updateImageAnnotations,
      clearImageAnnotations,
      autoGroupItem,
      setHoveredGroup,
      updateViewport,
      hoveredGroupId,
      lastAddedGroupId,
      drawingMode,
      setDrawingMode,
      activeTool,
      setActiveTool,
      toolColor,
      setToolColor,
      toolWidth,
      setToolWidth,
      onlineUsers: boardSSE.onlineUsers,
      drawingUsers: boardSSE.drawingUsers,
      myColor: boardSSE.myColor,
      notifyDrawing: boardSSE.notifyDrawing,
      notifyIdle: boardSSE.notifyIdle,
      drawingConfig,
    }),
    [
      activeBoard,
      loading,
      loadError,
      saveError,
      selectedId,
      selectedType,
      appState.boards,
      activeId,
      setSelected,
      setActiveBoard,
      setMoodboardName,
      updateBoard,
      deleteBoard,
      createNewMoodboard,
      addImage,
      updateImage,
      removeImage,
      addComment,
      updateComment,
      removeComment,
      addGroup,
      updateGroup,
      removeGroup,
      addSketch,
      updateSketch,
      removeSketch,
      moveItemToBoard,
      updateImageAnnotations,
      clearImageAnnotations,
      autoGroupItem,
      setHoveredGroup,
      updateViewport,
      hoveredGroupId,
      lastAddedGroupId,
      drawingMode,
      activeTool,
      toolColor,
      toolWidth,
      boardSSE.onlineUsers,
      boardSSE.drawingUsers,
      boardSSE.myColor,
      boardSSE.notifyDrawing,
      boardSSE.notifyIdle,
      drawingConfig,
    ]
  );

  return (
    <MoodboardContext.Provider value={value}>
      {children}
    </MoodboardContext.Provider>
  );
}

export function useMoodboard(): MoodboardContextValue {
  const ctx = useContext(MoodboardContext);
  if (!ctx) {
    throw new Error('useMoodboard must be used within MoodboardProvider');
  }
  return ctx;
}
