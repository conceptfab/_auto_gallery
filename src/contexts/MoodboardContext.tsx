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
  MoodboardAppState,
  MOODBOARD_STORAGE_KEY,
} from '@/src/types/moodboard';

interface MoodboardContextValue extends MoodboardBoard {
  loading: boolean;
  loadError: string | null;
  saveError: string | null;
  selectedId: string | null;
  selectedType: 'image' | 'comment' | 'group' | null;
  boards: MoodboardBoard[];
  activeId: string;
  hoveredGroupId: string | null;
  lastAddedGroupId: string | null;
  setSelected: (id: string | null, type: 'image' | 'comment' | 'group' | null) => void;
  setHoveredGroup: (x: number | null, y: number | null) => void;
  setActiveBoard: (id: string) => void;
  setMoodboardName: (name: string) => void;
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
  autoGroupItem: (itemId: string, x: number, y: number, width: number, height: number) => void;
  updateViewport: (viewport: { scale: number; translateX: number; translateY: number }) => void;
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
  const [selectedType, setSelectedType] = useState<'image' | 'comment' | 'group' | null>(
    null
  );
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeBoard =
    useMemo(
      () => appState.boards.find((b) => b.id === appState.activeId),
      [appState.boards, appState.activeId]
    ) ?? appState.boards[0];
  const activeId = activeBoard?.id ?? appState.activeId;

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

  const setSelected = useCallback(
    (id: string | null, type: 'image' | 'comment' | 'group' | null) => {
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
            }
          }

          return { ...b, groups, images, comments };
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
      autoGroupItem,
      setHoveredGroup,
      updateViewport,
      hoveredGroupId,
      lastAddedGroupId,
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
      autoGroupItem,
      setHoveredGroup,
      updateViewport,
      hoveredGroupId,
      lastAddedGroupId,
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
