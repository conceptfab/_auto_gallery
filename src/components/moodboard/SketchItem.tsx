'use client';

import React, { useCallback, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { MoodboardSketch, DrawingData, DrawingTool } from '@/src/types/moodboard';
import { useMoodboard } from '@/src/contexts/MoodboardContext';

const DrawingCanvas = dynamic(() => import('./DrawingCanvas'), { ssr: false });

const MIN_SIZE = 40;

const TOOL_LABELS: Record<DrawingTool, string> = {
  pen: '\u270F',
  line: '\u2571',
  rect: '\u25AD',
  circle: '\u25CB',
  eraser: '\u232B',
};

interface SketchItemProps {
  sketch: MoodboardSketch;
  parentX?: number;
  parentY?: number;
}

const SketchItem = React.memo(function SketchItem({ sketch, parentX = 0, parentY = 0 }: SketchItemProps) {
  const {
    updateSketch,
    removeSketch,
    setSelected,
    selectedId,
    selectedType,
    autoGroupItem,
    setHoveredGroup,
    drawingMode,
    setDrawingMode,
    activeTool,
    setActiveTool,
    toolColor,
    setToolColor,
    toolWidth,
    setToolWidth,
    drawingUsers,
    notifyDrawing,
    notifyIdle,
    drawingConfig,
  } = useMoodboard();
  const tools = drawingConfig.tools;
  const strokeColors = drawingConfig.strokeColors;
  const strokeWidths = drawingConfig.strokeWidths;
  const isSelected = selectedId === sketch.id && selectedType === 'sketch';
  const [isDragging, setIsDragging] = useState(false);
  type ResizeHandle = 'se' | 'sw' | 'ne' | 'nw' | 'n' | 's' | 'e' | 'w';
  const [resizing, setResizing] = useState<ResizeHandle | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [labelMenu, setLabelMenu] = useState<{ x: number; y: number } | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0, left: 0, top: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0, left: 0, top: 0 });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (resizing) return;
      if (drawingMode) {
        e.stopPropagation();
        setSelected(sketch.id, 'sketch');
        return;
      }
      e.stopPropagation();
      setSelected(sketch.id, 'sketch');
      if ((e.target as HTMLElement).closest('.sketch-drawbar')) return;
      if ((e.target as HTMLElement).closest('.sketch-label')) return;
      if ((e.target as HTMLElement).closest('.moodboard-resize-handle')) return;
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY, left: sketch.x, top: sketch.y };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [sketch.id, sketch.x, sketch.y, resizing, setSelected, drawingMode]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isDragging) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        updateSketch(sketch.id, {
          x: dragStartRef.current.left + dx,
          y: dragStartRef.current.top + dy,
        });
        setHoveredGroup(
          dragStartRef.current.left + dx + sketch.width / 2,
          dragStartRef.current.top + dy + sketch.height / 2
        );
        dragStartRef.current = {
          x: e.clientX, y: e.clientY,
          left: dragStartRef.current.left + dx,
          top: dragStartRef.current.top + dy,
        };
      } else if (resizing) {
        const { width, height, left, top, x: startX, y: startY } = resizeStartRef.current;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        let newWidth = width, newHeight = height, newLeft = left, newTop = top;
        if (resizing.includes('e')) newWidth = Math.max(MIN_SIZE, width + dx);
        if (resizing.includes('w')) { const w = Math.max(MIN_SIZE, width - dx); newLeft = left + (width - w); newWidth = w; }
        if (resizing.includes('s')) newHeight = Math.max(MIN_SIZE, height + dy);
        if (resizing.includes('n')) { const h = Math.max(MIN_SIZE, height - dy); newTop = top + (height - h); newHeight = h; }
        updateSketch(sketch.id, { x: newLeft, y: newTop, width: newWidth, height: newHeight });
        resizeStartRef.current = { ...resizeStartRef.current, width: newWidth, height: newHeight, left: newLeft, top: newTop, x: e.clientX, y: e.clientY };
      }
    },
    [sketch.id, sketch.width, sketch.height, isDragging, resizing, updateSketch, setHoveredGroup]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (isDragging) {
        autoGroupItem(sketch.id, sketch.x, sketch.y, sketch.width, sketch.height);
        setHoveredGroup(null, null);
      }
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      setIsDragging(false);
      setResizing(null);
    },
    [isDragging, autoGroupItem, setHoveredGroup, sketch.id, sketch.x, sketch.y, sketch.width, sketch.height]
  );

  const onResizeHandlePointerDown = useCallback(
    (e: React.PointerEvent, handle: ResizeHandle) => {
      e.stopPropagation();
      setResizing(handle);
      resizeStartRef.current = { x: e.clientX, y: e.clientY, width: sketch.width, height: sketch.height, left: sketch.x, top: sketch.y };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [sketch.width, sketch.height, sketch.x, sketch.y]
  );

  const handleDrawingChange = useCallback(
    (drawing: DrawingData) => { updateSketch(sketch.id, { drawing }); },
    [sketch.id, updateSketch]
  );

  // Label right-click menu
  const handleLabelContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLabelMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const startRename = useCallback(() => {
    setLabelMenu(null);
    setRenameValue(sketch.name || '');
    setRenaming(true);
  }, [sketch.name]);

  const commitRename = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== sketch.name) {
      updateSketch(sketch.id, { name: trimmed });
    }
    setRenaming(false);
  }, [renameValue, sketch.name, sketch.id, updateSketch]);

  const handleDeleteSketch = useCallback(() => {
    setLabelMenu(null);
    if (!window.confirm('Czy na pewno chcesz usunąć ten szkic?')) return;
    removeSketch(sketch.id);
  }, [sketch.id, removeSketch]);

  const isDrawingThis = drawingMode && isSelected;
  const displayName = sketch.name || 'Szkic';

  // Remote drawing presence indicator
  const otherDrawing = Array.from(drawingUsers.values()).find(
    d => d.sketchId === sketch.id
  );

  return (
    <div
      className={`moodboard-item moodboard-sketch-item${
        isSelected ? ' moodboard-item--selected moodboard-sketch-item--selected' : ''
      }${isDragging ? ' moodboard-item--dragging' : ''}${
        isDrawingThis ? ' moodboard-sketch-item--drawing' : ''
      }`}
      style={{
        left: sketch.x - parentX,
        top: sketch.y - parentY,
        width: sketch.width,
        height: sketch.height,
        transform: sketch.rotation ? `rotate(${sketch.rotation}deg)` : undefined,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={!drawingMode ? handlePointerMove : undefined}
      onPointerUp={!drawingMode ? handlePointerUp : undefined}
      onPointerLeave={!drawingMode ? handlePointerUp : undefined}
    >
      {/* Label above sketch */}
      <div
        className="sketch-label"
        onContextMenu={handleLabelContextMenu}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {renaming ? (
          <input
            className="sketch-label-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false); }}
            autoFocus
          />
        ) : (
          <span className="sketch-label-text">{displayName}</span>
        )}
      </div>

      {/* Label context menu */}
      {labelMenu && (
        <div
          className="sketch-label-menu"
          style={{ position: 'fixed', left: labelMenu.x, top: labelMenu.y, zIndex: 9999 }}
        >
          <button type="button" className="sketch-label-menu-item" onClick={startRename}>
            Zmień nazwę
          </button>
          <button type="button" className="sketch-label-menu-item sketch-label-menu-item--danger" onClick={handleDeleteSketch}>
            Usuń szkic
          </button>
          <div className="sketch-label-menu-backdrop" onClick={() => setLabelMenu(null)} />
        </div>
      )}

      {/* Canvas */}
      <div className="sketch-canvas-clip">
        <DrawingCanvas
          width={sketch.width}
          height={sketch.height}
          drawing={sketch.drawing}
          onDrawingChange={handleDrawingChange}
          isActive={isDrawingThis}
          tool={activeTool}
          color={toolColor}
          strokeWidth={toolWidth}
          backgroundColor={sketch.backgroundColor || '#ffffff'}
        />
      </div>

      {/* Drawing bar — shown below sketch when selected */}
      {isSelected && (
        <div className="sketch-drawbar" onPointerDown={(e) => e.stopPropagation()}>
          {!drawingMode ? (
            <button type="button" className="sketch-drawbar-draw-btn" onClick={() => { setDrawingMode(true); notifyDrawing(sketch.id, activeTool); }} title="Rysuj (D)" aria-label="Rysuj">
              <svg className="sketch-drawbar-draw-btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 19l7-7 3 3-7 7-3-3z" />
                <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                <path d="M2 2l7.586 7.586" />
              </svg>
            </button>
          ) : (
            <>
              {tools.map((t) => (
                <button key={t} type="button" className="sketch-drawbar-tool" aria-pressed={activeTool === t} title={t} onClick={() => setActiveTool(t)}>
                  {TOOL_LABELS[t] ?? t}
                </button>
              ))}
              <span className="sketch-drawbar-sep" />
              {strokeColors.map((c) => (
                <button key={c} type="button" className="sketch-drawbar-color" aria-pressed={toolColor === c} style={{ background: c }} onClick={() => setToolColor(c)} />
              ))}
              <input type="color" className="sketch-drawbar-picker" value={toolColor} onChange={(e) => setToolColor(e.target.value)} title="Kolor" />
              <span className="sketch-drawbar-sep" />
              {strokeWidths.map((w) => (
                <button key={w} type="button" className="sketch-drawbar-width" aria-pressed={toolWidth === w} onClick={() => setToolWidth(w)}>
                  {w}
                </button>
              ))}
              <span className="sketch-drawbar-sep" />
              <button type="button" className="sketch-drawbar-done" onClick={() => { setDrawingMode(false); notifyIdle(); }}>
                Gotowe
              </button>
            </>
          )}
          <button type="button" className="sketch-drawbar-delete" onClick={handleDeleteSketch} title="Usuń szkic" aria-label="Usuń szkic">
            <i className="las la-trash-alt" aria-hidden />
          </button>
        </div>
      )}

      {/* Remote drawing indicator */}
      {otherDrawing && (
        <div
          className="sketch-remote-drawing-indicator"
          style={{ borderColor: otherDrawing.color, color: otherDrawing.color }}
        >
          {otherDrawing.email.split('@')[0]} rysuje...
        </div>
      )}

      {/* Resize handles — only when selected and NOT drawing (8 handles) */}
      {isSelected && !drawingMode && (
        <>
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

export default SketchItem;
