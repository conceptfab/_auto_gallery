'use client';

import React, { useCallback, useRef, useState } from 'react';
import { MoodboardImage } from '@/src/types/moodboard';
import { useMoodboard } from '@/src/contexts/MoodboardContext';

const MIN_SIZE = 40;

interface ImageItemProps {
  image: MoodboardImage;
}

export default function ImageItem({ image }: ImageItemProps) {
  const { updateImage, removeImage, setSelected, selectedId, selectedType } =
    useMoodboard();
  const isSelected = selectedId === image.id && selectedType === 'image';
  const [isDragging, setIsDragging] = useState(false);
  const [resizing, setResizing] = useState<'se' | 'sw' | 'ne' | 'nw' | null>(
    null
  );
  const dragStartRef = useRef({ x: 0, y: 0, left: 0, top: 0 });
  const resizeStartRef = useRef({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    left: 0,
    top: 0,
  });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (resizing) return;
      e.stopPropagation();
      setSelected(image.id, 'image');
      if ((e.target as HTMLElement).closest('.moodboard-item-delete')) return;
      if ((e.target as HTMLElement).closest('.moodboard-resize-handle')) return;
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        left: image.x,
        top: image.y,
      };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [image.id, image.x, image.y, resizing, setSelected]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isDragging) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        updateImage(image.id, {
          x: dragStartRef.current.left + dx,
          y: dragStartRef.current.top + dy,
        });
        dragStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          left: dragStartRef.current.left + dx,
          top: dragStartRef.current.top + dy,
        };
      } else if (resizing) {
        const {
          width,
          height,
          left,
          top,
          x: startX,
          y: startY,
        } = resizeStartRef.current;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        let newWidth = width;
        let newHeight = height;
        let newLeft = left;
        let newTop = top;
        if (resizing.includes('e')) {
          newWidth = Math.max(MIN_SIZE, width + dx);
        }
        if (resizing.includes('w')) {
          const w = Math.max(MIN_SIZE, width - dx);
          newLeft = left + (width - w);
          newWidth = w;
        }
        if (resizing.includes('s')) {
          newHeight = Math.max(MIN_SIZE, height + dy);
        }
        if (resizing.includes('n')) {
          const h = Math.max(MIN_SIZE, height - dy);
          newTop = top + (height - h);
          newHeight = h;
        }
        updateImage(image.id, {
          x: newLeft,
          y: newTop,
          width: newWidth,
          height: newHeight,
        });
        resizeStartRef.current = {
          ...resizeStartRef.current,
          width: newWidth,
          height: newHeight,
          left: newLeft,
          top: newTop,
          x: e.clientX,
          y: e.clientY,
        };
      }
    },
    [image.id, isDragging, resizing, updateImage]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    setIsDragging(false);
    setResizing(null);
  }, []);

  const onResizeHandlePointerDown = useCallback(
    (e: React.PointerEvent, corner: 'se' | 'sw' | 'ne' | 'nw') => {
      e.stopPropagation();
      setResizing(corner);
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        width: image.width,
        height: image.height,
        left: image.x,
        top: image.y,
      };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [image.width, image.height, image.x, image.y]
  );

  const onDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      removeImage(image.id);
    },
    [image.id, removeImage]
  );

  return (
    <div
      className={`moodboard-item moodboard-image-item${
        isSelected ? ' moodboard-item--selected' : ''
      }${isDragging ? ' moodboard-item--dragging' : ''}`}
      style={{
        left: image.x,
        top: image.y,
        width: image.width,
        height: image.height,
        transform: image.rotation ? `rotate(${image.rotation}deg)` : undefined,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <img
        src={image.imagePath ? `/api/moodboard/images/${image.imagePath}` : image.url}
        alt=""
        className="moodboard-image-img"
        draggable={false}
      />
      {isSelected && (
        <>
          <button
            type="button"
            className="moodboard-item-delete"
            onClick={onDelete}
            aria-label="Usuń"
          >
            ×
          </button>
          <div
            className="moodboard-resize-handle moodboard-resize-handle--se"
            onPointerDown={(e) => onResizeHandlePointerDown(e, 'se')}
          />
          <div
            className="moodboard-resize-handle moodboard-resize-handle--sw"
            onPointerDown={(e) => onResizeHandlePointerDown(e, 'sw')}
          />
          <div
            className="moodboard-resize-handle moodboard-resize-handle--ne"
            onPointerDown={(e) => onResizeHandlePointerDown(e, 'ne')}
          />
          <div
            className="moodboard-resize-handle moodboard-resize-handle--nw"
            onPointerDown={(e) => onResizeHandlePointerDown(e, 'nw')}
          />
        </>
      )}
    </div>
  );
}
