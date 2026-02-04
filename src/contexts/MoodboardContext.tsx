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
  MoodboardAppState,
} from '@/src/types/moodboard';

interface MoodboardContextValue extends MoodboardBoard {
  loading: boolean;
  loadError: string | null;
  saveError: string | null;
  selectedId: string | null;
  selectedType: 'image' | 'comment' | null;
  boards: MoodboardBoard[];
  activeId: string;
  setSelected: (id: string | null, type: 'image' | 'comment' | null) => void;
  setActiveBoard: (id: string) => void;
  setMoodboardName: (name: string) => void;
  deleteBoard: (boardId: string) => void;
  createNewMoodboard: () => void;
  addImage: (image: Omit<MoodboardImage, 'id'>) => void;
  updateImage: (id: string, patch: Partial<MoodboardImage>) => void;
  removeImage: (id: string) => void;
  addComment: (comment: Omit<MoodboardComment, 'id'>) => void;
  updateComment: (id: string, patch: Partial<MoodboardComment>) => void;
  removeComment: (id: string) => void;
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
});

export function MoodboardProvider({ children }: { children: React.ReactNode }) {
  const [appState, setAppState] = useState<MoodboardAppState>(() => {
    const first = emptyBoard();
    return { boards: [first], activeId: first.id };
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'image' | 'comment' | null>(
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
    (id: string | null, type: 'image' | 'comment' | null) => {
      setSelectedId(id);
      setSelectedType(type);
    },
    []
  );

  const scheduleSave = useCallback((nextAppState: MoodboardAppState) => {
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
      saveStateToServer(next).then(
        () => setSaveError(null),
        (err) =>
          setSaveError(err instanceof Error ? err.message : 'Błąd zapisu')
      );
      return next;
    });
    setSelectedId(null);
    setSelectedType(null);
  }, []);

  const addImage = useCallback(
    (image: Omit<MoodboardImage, 'id'>) => {
      const newImage: MoodboardImage = { ...image, id: generateId() };
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
    (comment: Omit<MoodboardComment, 'id'>) => {
      const newComment: MoodboardComment = {
        ...comment,
        id: generateId(),
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

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
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
