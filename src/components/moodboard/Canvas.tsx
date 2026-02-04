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

interface PanStart {
  clientX: number;
  clientY: number;
  startTranslateX: number;
  startTranslateY: number;
}

export default function Canvas() {
  const { images, comments, addImage, setSelected } = useMoodboard();
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
      if (!e.ctrlKey) return;
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
          const url = await fileToDataUrl(file);
          addImage({
            url,
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
    [addImage, clientToContent]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (
        spacePressed &&
        e.button === 0 &&
        (e.target === e.currentTarget ||
          (e.target as HTMLElement).classList.contains(
            'moodboard-canvas-inner'
          ))
      ) {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setIsPanning(true);
        panStartRef.current = {
          clientX: e.clientX,
          clientY: e.clientY,
          startTranslateX: translateX,
          startTranslateY: translateY,
        };
        return;
      }
      if (
        e.target === e.currentTarget ||
        (e.target as HTMLElement).classList.contains('moodboard-canvas-inner')
      ) {
        setSelected(null, null);
      }
    },
    [spacePressed, translateX, translateY, setSelected]
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const start = panStartRef.current;
    if (!start) return;
    setTranslateX(start.startTranslateX + (e.clientX - start.clientX));
    setTranslateY(start.startTranslateY + (e.clientY - start.clientY));
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (e.button === 0) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore if already released
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
    >
      <div
        className="moodboard-canvas-inner"
        style={{
          transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
          transformOrigin: '0 0',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
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
    </div>
  );
}
