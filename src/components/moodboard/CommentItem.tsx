'use client';

import React, { useCallback, useRef, useState } from 'react';
import {
  MoodboardComment,
  CommentColorKey,
  CommentFontWeightKey,
} from '@/src/types/moodboard';
import { useMoodboard } from '@/src/contexts/MoodboardContext';

const COLOR_MAP: Record<CommentColorKey, string> = {
  none: 'transparent',
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
  parentX?: number;
  parentY?: number;
  onOpenEditMenu?: (id: string, pos: { x: number; y: number }) => void;
}

const CommentItem = React.memo(function CommentItem({ comment, parentX = 0, parentY = 0, onOpenEditMenu }: CommentItemProps) {
  const {
    updateComment,
    removeComment,
    setSelected,
    selectedId,
    selectedType,
    autoGroupItem,
    setHoveredGroup,
  } = useMoodboard();
  const isSelected = selectedId === comment.id && selectedType === 'comment';
  const [isDragging, setIsDragging] = useState(false);
  type ResizeHandle = 'se' | 'sw' | 'ne' | 'nw' | 'n' | 's' | 'e' | 'w';
  const [resizing, setResizing] = useState<ResizeHandle | null>(null);
  const itemRef = useRef<HTMLDivElement>(null);
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
      if (target.closest('.moodboard-item-delete') || target.closest('.moodboard-item-edit')) return;
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
        const newX = dragStartRef.current.left + dx;
        const newY = dragStartRef.current.top + dy;
        updateComment(comment.id, {
          x: newX,
          y: newY,
        });
        dragStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          left: dragStartRef.current.left + dx,
          top: dragStartRef.current.top + dy,
        };
        // Check for group hover during drag
        setHoveredGroup(
          dragStartRef.current.left + dx + comment.width / 2,
          dragStartRef.current.top + dy + comment.height / 2
        );
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
    [comment.id, comment.width, comment.height, isDragging, resizing, updateComment, setHoveredGroup]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isDragging) {
      autoGroupItem(comment.id, comment.x, comment.y, comment.width, comment.height);
      setHoveredGroup(null, null); // Clear hover on drop
    }
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    setIsDragging(false);
    setResizing(null);
  }, [isDragging, autoGroupItem, setHoveredGroup, comment.id, comment.x, comment.y, comment.width, comment.height]);

  const onResizeHandlePointerDown = useCallback(
    (e: React.PointerEvent, handle: ResizeHandle) => {
      e.stopPropagation();
      setResizing(handle);
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
      if (!window.confirm('Czy na pewno chcesz usunąć ten komentarz?')) return;
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

  const bgColor = comment.bgColor || (COLOR_MAP[comment.color] ?? COLOR_MAP.yellow);
  const isNoBg = comment.color === 'none';
  const weight = comment.fontWeight ?? 'normal';
  const fontWeight = FONT_WEIGHT_MAP[weight] ?? 400;
  const fontColor = comment.fontColor ?? '#000000';
  const fontSize = comment.fontSize ?? 16;

  return (
    <div
      ref={itemRef}
      data-id={comment.id}
      className={`moodboard-item moodboard-comment-item${
        isSelected ? ' moodboard-item--selected' : ''
      }${isDragging ? ' moodboard-item--dragging' : ''}${
        isNoBg ? ' moodboard-comment-item--no-bg' : ''
      }`}
      style={{
        left: comment.x - parentX,
        top: comment.y - parentY,
        width: comment.width,
        height: comment.height,
        backgroundColor: bgColor,
        fontFamily: INTER_FONT,
        fontWeight,
        color: fontColor,
        fontSize: `${fontSize}px`,
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
          {onOpenEditMenu && (
            <button
              type="button"
              className="moodboard-item-edit"
              onClick={(e) => {
                e.stopPropagation();
                onOpenEditMenu(comment.id, { x: e.clientX, y: e.clientY });
              }}
              aria-label="Menu edycji"
              title="Menu edycji"
            >
              <i className="las la-pen" aria-hidden />
            </button>
          )}
          <button
            type="button"
            className="moodboard-item-delete"
            onClick={onDelete}
            aria-label="Usuń komentarz"
            title="Usuń komentarz"
          >
            <i className="las la-trash-alt" aria-hidden />
          </button>
          <div className="moodboard-resize-handle moodboard-resize-handle--nw" onPointerDown={(e) => onResizeHandlePointerDown(e, 'nw')} />
          <div className="moodboard-resize-handle moodboard-resize-handle--n" onPointerDown={(e) => onResizeHandlePointerDown(e, 'n')} />
          <div className="moodboard-resize-handle moodboard-resize-handle--ne" onPointerDown={(e) => onResizeHandlePointerDown(e, 'ne')} />
          <div className="moodboard-resize-handle moodboard-resize-handle--e" onPointerDown={(e) => onResizeHandlePointerDown(e, 'e')} />
          <div className="moodboard-resize-handle moodboard-resize-handle--se" onPointerDown={(e) => onResizeHandlePointerDown(e, 'se')} />
          <div className="moodboard-resize-handle moodboard-resize-handle--s" onPointerDown={(e) => onResizeHandlePointerDown(e, 's')} />
          <div className="moodboard-resize-handle moodboard-resize-handle--sw" onPointerDown={(e) => onResizeHandlePointerDown(e, 'sw')} />
          <div className="moodboard-resize-handle moodboard-resize-handle--w" onPointerDown={(e) => onResizeHandlePointerDown(e, 'w')} />
        </>
      )}
    </div>
  );
});

export default CommentItem;

export { COLOR_MAP, FONT_WEIGHT_MAP, DEFAULT_COMMENT };
