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
  MoodboardComment,
  MoodboardImage,
  MoodboardState,
} from '@/src/types/moodboard';

interface MoodboardContextValue extends MoodboardState {
  loading: boolean;
  loadError: string | null;
  saveError: string | null;
  selectedId: string | null;
  selectedType: 'image' | 'comment' | null;
  setSelected: (id: string | null, type: 'image' | 'comment' | null) => void;
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

async function saveStateToServer(state: MoodboardState): Promise<void> {
  const res = await fetch(API_STATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
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

export function MoodboardProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<MoodboardState>({
    images: [],
    comments: [],
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'image' | 'comment' | null>(
    null
  );
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          state?: MoodboardState;
        };
        if (cancelled) return;
        const loaded = data?.state;
        if (
          loaded &&
          Array.isArray(loaded.images) &&
          Array.isArray(loaded.comments)
        ) {
          setState({
            images: loaded.images,
            comments: loaded.comments,
          });
        }
        setLoadError(null);
      } catch (_err) {
        if (!cancelled) {
          setLoadError('Błąd połączenia z serwerem.');
        }
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

  const scheduleSave = useCallback((nextState: MoodboardState) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      saveStateToServer(nextState).then(
        () => setSaveError(null),
        (err) =>
          setSaveError(err instanceof Error ? err.message : 'Błąd zapisu')
      );
    }, DEBOUNCE_SAVE_MS);
  }, []);

  const addImage = useCallback(
    (image: Omit<MoodboardImage, 'id'>) => {
      const newImage: MoodboardImage = {
        ...image,
        id: generateId(),
      };
      setState((prev) => {
        const next = {
          ...prev,
          images: [...prev.images, newImage],
        };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const updateImage = useCallback(
    (id: string, patch: Partial<MoodboardImage>) => {
      setState((prev) => {
        const images = prev.images.map((img) =>
          img.id === id ? { ...img, ...patch } : img
        );
        const next = { ...prev, images };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const removeImage = useCallback(
    (id: string) => {
      setState((prev) => {
        const next = {
          ...prev,
          images: prev.images.filter((img) => img.id !== id),
        };
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
      setState((prev) => {
        const next = {
          ...prev,
          comments: [...prev.comments, newComment],
        };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const updateComment = useCallback(
    (id: string, patch: Partial<MoodboardComment>) => {
      setState((prev) => {
        const comments = prev.comments.map((c) =>
          c.id === id ? { ...c, ...patch } : c
        );
        const next = { ...prev, comments };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const removeComment = useCallback(
    (id: string) => {
      setState((prev) => {
        const next = {
          ...prev,
          comments: prev.comments.filter((c) => c.id !== id),
        };
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
      ...state,
      loading,
      loadError,
      saveError,
      selectedId,
      selectedType,
      setSelected,
      addImage,
      updateImage,
      removeImage,
      addComment,
      updateComment,
      removeComment,
    }),
    [
      state,
      loading,
      loadError,
      saveError,
      selectedId,
      selectedType,
      setSelected,
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
