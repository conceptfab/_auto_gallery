'use client';

import React, { useCallback, useRef, useState } from 'react';
import { MoodboardGroup } from '@/src/types/moodboard';
import { useMoodboard } from '@/src/contexts/MoodboardContext';

const MIN_SIZE = 40;

interface GroupItemProps {
  group: MoodboardGroup;
  children?: React.ReactNode;
}

export default function GroupItem({ group, children }: GroupItemProps) {
  const {
    updateGroup,
    removeGroup,
    selectedId,
    selectedType,
    setSelected,
    hoveredGroupId,
    lastAddedGroupId,
  } = useMoodboard();

  const isSelected = selectedId === group.id && selectedType === 'group';
  const [isDragging, setIsDragging] = useState(false);
  const [resizing, setResizing] = useState<'se' | 'sw' | 'ne' | 'nw' | null>(null);
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
      setSelected(group.id, 'group');
      
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        left: group.x,
        top: group.y,
      };
      target.setPointerCapture?.(e.pointerId);
    },
    [group.id, group.x, group.y, resizing, setSelected]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isDragging) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        
        updateGroup(group.id, {
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
        
        updateGroup(group.id, {
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
    [group.id, isDragging, resizing, updateGroup]
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
        width: group.width,
        height: group.height,
        left: group.x,
        top: group.y,
      };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [group.width, group.height, group.x, group.y]
  );

  const onDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      removeGroup(group.id);
    },
    [group.id, removeGroup]
  );

  return (
    <div
      data-id={group.id}
      className={`moodboard-item moodboard-group-item${
        isSelected ? ' moodboard-item--selected' : ''
      }${hoveredGroupId === group.id ? ' moodboard-group--hovered' : ''}${
        lastAddedGroupId === group.id ? ' moodboard-group--success' : ''
      }${isDragging ? ' moodboard-item--dragging' : ''}`}
      style={{
        left: group.x,
        top: group.y,
        width: group.width,
        height: group.height,
        backgroundColor: group.color 
          ? (group.color.startsWith('#') ? `${group.color}1a` : group.color) // ~10% opacity if hex
          : 'rgba(99, 102, 241, 0.05)',
        border: '1px dashed #6366f1',
        overflow: 'visible', // Ensure handles and label are visible
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <div className="moodboard-group-name" style={{ 
        position: 'absolute', 
        top: 0,
        bottom: 'auto',
        left: 0,
        transform: 'translateY(-100%)',
        whiteSpace: 'nowrap',
        fontSize: `${group.labelSize ?? 14}px`,
        fontWeight: 'bold',
        color: group.labelColor || '#ffffff',
        backgroundColor: group.color || '#6366f1',
        padding: '2px 10px',
        borderRadius: '6px 6px 0 0',
        lineHeight: 1.2,
        zIndex: 20,
        display: 'block',
      }}>
        {group.name}
      </div>
      
      {/* Clipping container for members only */}
      <div className="moodboard-group-clipping" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        {children}
      </div>
      
      {isSelected && (
        <>
          <button
            type="button"
            className="moodboard-item-delete"
            style={{ zIndex: 10 }}
            onClick={onDelete}
            aria-label="Usuń grupę"
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
