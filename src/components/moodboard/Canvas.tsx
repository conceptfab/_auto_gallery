'use client';

import React, { useCallback, useRef, useState } from 'react';
import { useMoodboard } from '@/src/contexts/MoodboardContext';
import { MOODBOARD_MAX_IMAGE_BYTES } from '@/src/types/moodboard';
import ImageItem from './ImageItem';
import CommentItem from './CommentItem';

const DEFAULT_IMAGE_WIDTH = 200;
const DEFAULT_IMAGE_HEIGHT = 150;

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

export default function Canvas() {
  const { images, comments, addImage, setSelected } = useMoodboard();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);

  const getCanvasOffset = useCallback(() => {
    const el = containerRef.current;
    if (!el) return { left: 0, top: 0 };
    const rect = el.getBoundingClientRect();
    return {
      left: rect.left + (window.scrollX || 0),
      top: rect.top + (window.scrollY || 0),
    };
  }, []);

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
      const { left, top } = getCanvasOffset();
      const x = e.clientX - left + (containerRef.current?.scrollLeft ?? 0);
      const y = e.clientY - top + (containerRef.current?.scrollTop ?? 0);
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
    [addImage, getCanvasOffset]
  );

  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (
        e.target === e.currentTarget ||
        (e.target as HTMLElement).classList.contains('moodboard-canvas-inner')
      ) {
        setSelected(null, null);
      }
    },
    [setSelected]
  );

  return (
    <div
      ref={containerRef}
      className={`moodboard-canvas ${
        isDragOver ? 'moodboard-canvas--drag-over' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className="moodboard-canvas-inner"
        onPointerDown={handleCanvasPointerDown}
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
