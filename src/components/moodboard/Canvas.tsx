'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMoodboard } from '@/src/contexts/MoodboardContext';
import { MOODBOARD_MAX_IMAGE_BYTES } from '@/src/types/moodboard';
import ImageItem from './ImageItem';
import CommentItem from './CommentItem';

const DEFAULT_IMAGE_WIDTH = 200;
const DEFAULT_IMAGE_HEIGHT = 150;
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const ZOOM_SENSITIVITY = 0.0012;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > MOODBOARD_MAX_IMAGE_BYTES) {
      reject(new Error('Plik jest za duży (max 10 MB).'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Nie udało się odczytać pliku.'));
    reader.readAsDataURL(file);
  });
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

async function uploadMoodboardImage(
  boardId: string,
  imageId: string,
  dataUrl: string
): Promise<string> {
  const res = await fetch('/api/moodboard/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ boardId, imageId, dataUrl }),
    credentials: 'same-origin',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string })?.error || 'Upload failed');
  }
  const data = await res.json();
  return data.imagePath;
}

interface PanStart {
  pointerId: number;
  clientX: number;
  clientY: number;
  startTranslateX: number;
  startTranslateY: number;
}

export default function Canvas() {
  const { images, comments, addImage, setSelected, activeId } = useMoodboard();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [spacePressed, setSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<PanStart | null>(null);

  useEffect(() => {
    const isEditable = (el: EventTarget | null) => {
      if (!el || !(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return true;
      return (el as HTMLElement).isContentEditable;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isEditable(e.target)) {
        e.preventDefault();
        setSpacePressed(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isEditable(e.target)) {
        e.preventDefault();
        setSpacePressed(false);
        if (panStartRef.current) {
          setIsPanning(false);
          panStartRef.current = null;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const transformRef = useRef({ scale: 1, translateX: 0, translateY: 0 });
  transformRef.current = { scale, translateX, translateY };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Zoom działa przez Ctrl+scroll LUB zwykły scroll gdy kursor jest na pustym obszarze
      const target = e.target as HTMLElement;
      const isOnItem = target.closest('.moodboard-image-item') || target.closest('.moodboard-comment-item');

      if (!e.ctrlKey && isOnItem) return; // Na elemencie bez Ctrl - nie zoomuj

      e.preventDefault();
      const { scale: s, translateX: tx, translateY: ty } = transformRef.current;
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const contentX = (mouseX - tx) / s;
      const contentY = (mouseY - ty) / s;
      const factor = 1 - e.deltaY * ZOOM_SENSITIVITY;
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * factor));
      setTranslateX(mouseX - contentX * newScale);
      setTranslateY(mouseY - contentY * newScale);
      setScale(newScale);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const clientToContent = useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current;
      if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      return {
        x: (clientX - rect.left - translateX) / scale,
        y: (clientY - rect.top - translateY) / scale,
      };
    },
    [scale, translateX, translateY]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
      setDropError(null);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      setDropError(null);
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith('image/')
      );
      if (files.length === 0) {
        setDropError('Przeciągnij tylko pliki obrazków (PNG, JPG, itp.).');
        return;
      }
      const { x, y } = clientToContent(e.clientX, e.clientY);
      let offsetX = 0;
      let offsetY = 0;
      for (const file of files) {
        try {
          const dataUrl = await fileToDataUrl(file);
          const imageId = generateId();
          const imagePath = await uploadMoodboardImage(activeId, imageId, dataUrl);
          addImage({
            imagePath,
            x: x + offsetX,
            y: y + offsetY,
            width: DEFAULT_IMAGE_WIDTH,
            height: DEFAULT_IMAGE_HEIGHT,
          });
          offsetX += 20;
          offsetY += 20;
        } catch (err) {
          setDropError(
            err instanceof Error ? err.message : 'Błąd wczytywania pliku.'
          );
        }
      }
    },
    [addImage, clientToContent, activeId]
  );

  const isEmptyArea = useCallback((el: EventTarget | null) => {
    const node = el as HTMLElement;
    if (!node?.closest) return true;
    return (
      !node.closest('.moodboard-image-item') &&
      !node.closest('.moodboard-comment-item')
    );
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Lewy przycisk na pustym obszarze = pan
      if (e.button === 0 && isEmptyArea(e.target)) {
        e.preventDefault();
        setSelected(null, null);
        const el = containerRef.current;
        if (el) {
          el.setPointerCapture(e.pointerId);
          setIsPanning(true);
          panStartRef.current = {
            pointerId: e.pointerId,
            clientX: e.clientX,
            clientY: e.clientY,
            startTranslateX: translateX,
            startTranslateY: translateY,
          };
        }
        return;
      }
    },
    [translateX, translateY, setSelected, isEmptyArea]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isPanning || !panStartRef.current) return;

    const onMove = (e: PointerEvent) => {
      const start = panStartRef.current;
      if (!start || e.pointerId !== start.pointerId) return;
      e.preventDefault();
      setTranslateX(start.startTranslateX + (e.clientX - start.clientX));
      setTranslateY(start.startTranslateY + (e.clientY - start.clientY));
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== panStartRef.current?.pointerId) return;
      e.preventDefault();
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      setIsPanning(false);
      panStartRef.current = null;
    };

    el.addEventListener('pointermove', onMove, { capture: true });
    el.addEventListener('pointerup', onUp, { capture: true });
    el.addEventListener('pointercancel', onUp, { capture: true });
    return () => {
      el.removeEventListener('pointermove', onMove, { capture: true });
      el.removeEventListener('pointerup', onUp, { capture: true });
      el.removeEventListener('pointercancel', onUp, { capture: true });
    };
  }, [isPanning]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (e.button === 0 && panStartRef.current?.pointerId === e.pointerId) {
      try {
        containerRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      setIsPanning(false);
      panStartRef.current = null;
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={`moodboard-canvas ${
        isDragOver ? 'moodboard-canvas--drag-over' : ''
      } ${spacePressed ? 'moodboard-canvas--space' : ''} ${
        isPanning ? 'moodboard-canvas--panning' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        className="moodboard-canvas-inner"
        style={{
          transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
          transformOrigin: '0 0',
        }}
      >
        {dropError && (
          <div className="moodboard-drop-error" role="alert">
            {dropError}
          </div>
        )}
        {images.map((img) => (
          <ImageItem key={img.id} image={img} />
        ))}
        {comments.map((c) => (
          <CommentItem key={c.id} comment={c} />
        ))}
      </div>
      <div className="moodboard-canvas-hint">Przeciągnij obrazki tutaj</div>
      <div className="moodboard-canvas-zoom-controls">
        <button
          type="button"
          className="moodboard-zoom-btn"
          onClick={() => setScale((s) => Math.min(MAX_SCALE, s * 1.25))}
          title="Powiększ (Ctrl + scroll up)"
        >
          +
        </button>
        <span className="moodboard-zoom-level">{Math.round(scale * 100)}%</span>
        <button
          type="button"
          className="moodboard-zoom-btn"
          onClick={() => setScale((s) => Math.max(MIN_SCALE, s / 1.25))}
          title="Pomniejsz (Ctrl + scroll down)"
        >
          −
        </button>
        <button
          type="button"
          className="moodboard-zoom-btn moodboard-zoom-btn--reset"
          onClick={() => {
            setScale(1);
            setTranslateX(0);
            setTranslateY(0);
          }}
          title="Resetuj widok (100%)"
        >
          ⌂
        </button>
      </div>
    </div>
  );
}
