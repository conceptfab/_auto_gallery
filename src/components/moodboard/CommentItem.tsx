'use client';

import React, { useCallback, useRef, useState } from 'react';
import {
  MoodboardComment,
  CommentColorKey,
  CommentFontWeightKey,
} from '@/src/types/moodboard';
import { useMoodboard } from '@/src/contexts/MoodboardContext';

const COLOR_MAP: Record<CommentColorKey, string> = {
  yellow: '#fef08a',
  pink: '#fbcfe8',
  blue: '#bfdbfe',
  green: '#bbf7d0',
  orange: '#fed7aa',
  purple: '#e9d5ff',
};

const FONT_WEIGHT_MAP: Record<CommentFontWeightKey, number> = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

const INTER_FONT = 'Inter, -apple-system, BlinkMacSystemFont, sans-serif';

const MIN_SIZE = 60;
const DEFAULT_COMMENT = {
  color: 'yellow' as CommentColorKey,
  fontWeight: 'normal' as CommentFontWeightKey,
};

interface CommentItemProps {
  comment: MoodboardComment;
}

export default function CommentItem({ comment }: CommentItemProps) {
  const {
    updateComment,
    removeComment,
    setSelected,
    selectedId,
    selectedType,
  } = useMoodboard();
  const isSelected = selectedId === comment.id && selectedType === 'comment';
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
      const target = e.target as HTMLElement;
      if (target.closest('.moodboard-item-delete')) return;
      if (target.closest('.moodboard-resize-handle')) return;
      e.stopPropagation();
      setSelected(comment.id, 'comment');
      if (
        target.closest('.moodboard-comment-text') ||
        target.closest('.moodboard-comment-edit')
      )
        return;
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        left: comment.x,
        top: comment.y,
      };
      target.setPointerCapture?.(e.pointerId);
    },
    [comment.id, comment.x, comment.y, resizing, setSelected]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isDragging) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        updateComment(comment.id, {
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
        if (resizing.includes('e')) newWidth = Math.max(MIN_SIZE, width + dx);
        if (resizing.includes('w')) {
          const w = Math.max(MIN_SIZE, width - dx);
          newLeft = left + (width - w);
          newWidth = w;
        }
        if (resizing.includes('s')) newHeight = Math.max(MIN_SIZE, height + dy);
        if (resizing.includes('n')) {
          const h = Math.max(MIN_SIZE, height - dy);
          newTop = top + (height - h);
          newHeight = h;
        }
        updateComment(comment.id, {
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
    [comment.id, isDragging, resizing, updateComment]
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
        width: comment.width,
        height: comment.height,
        left: comment.x,
        top: comment.y,
      };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [comment.width, comment.height, comment.x, comment.y]
  );

  const onDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      removeComment(comment.id);
    },
    [comment.id, removeComment]
  );

  const onTextChange = useCallback(
    (e: React.FormEvent<HTMLDivElement>) => {
      const text = (e.target as HTMLDivElement).innerText;
      updateComment(comment.id, { text });
    },
    [comment.id, updateComment]
  );

  const bgColor = COLOR_MAP[comment.color] ?? COLOR_MAP.yellow;
  const weight = comment.fontWeight ?? 'normal';
  const fontWeight = FONT_WEIGHT_MAP[weight] ?? 400;

  return (
    <div
      className={`moodboard-item moodboard-comment-item${
        isSelected ? ' moodboard-item--selected' : ''
      }${isDragging ? ' moodboard-item--dragging' : ''}`}
      style={{
        left: comment.x,
        top: comment.y,
        width: comment.width,
        height: comment.height,
        backgroundColor: bgColor,
        fontFamily: INTER_FONT,
        fontWeight,
        transform: comment.rotation
          ? `rotate(${comment.rotation}deg)`
          : undefined,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <div
        className="moodboard-comment-text moodboard-comment-edit"
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Kliknij i wpisz…"
        onInput={onTextChange}
      >
        {comment.text}
      </div>
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

export { COLOR_MAP, FONT_WEIGHT_MAP, DEFAULT_COMMENT };
