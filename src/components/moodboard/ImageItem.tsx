'use client';

import React, { useCallback, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { MoodboardImage, DrawingData, DrawingTool } from '@/src/types/moodboard';
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

interface ImageItemProps {
  image: MoodboardImage;
  parentX?: number;
  parentY?: number;
}

const ImageItem = React.memo(function ImageItem({ image, parentX = 0, parentY = 0 }: ImageItemProps) {
  const {
    updateImage,
    removeImage,
    setSelected,
    selectedId,
    selectedType,
    autoGroupItem,
    setHoveredGroup,
    updateImageAnnotations,
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
  const isSelected = selectedId === image.id && selectedType === 'image';
  const [isDragging, setIsDragging] = useState(false);
  type ResizeHandle = 'se' | 'sw' | 'ne' | 'nw' | 'n' | 's' | 'e' | 'w';
  const [resizing, setResizing] = useState<ResizeHandle | null>(null);
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
      // In drawing mode, don't drag - let DrawingCanvas handle
      if (drawingMode) {
        e.stopPropagation();
        setSelected(image.id, 'image');
        return;
      }
      e.stopPropagation();
      setSelected(image.id, 'image');
      if ((e.target as HTMLElement).closest('.moodboard-item-delete')) return;
      if ((e.target as HTMLElement).closest('.moodboard-resize-handle')) return;
      if ((e.target as HTMLElement).closest('.sketch-drawbar')) return;
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        left: image.x,
        top: image.y,
      };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [image.id, image.x, image.y, resizing, setSelected, drawingMode]
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
        // Check for group hover during drag
        setHoveredGroup(
          dragStartRef.current.left + dx + image.width / 2,
          dragStartRef.current.top + dy + image.height / 2
        );
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
    [image.id, image.width, image.height, isDragging, resizing, updateImage, setHoveredGroup]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isDragging) {
      autoGroupItem(image.id, image.x, image.y, image.width, image.height);
      setHoveredGroup(null, null); // Clear hover on drop
    }
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    setIsDragging(false);
    setResizing(null);
  }, [isDragging, autoGroupItem, setHoveredGroup, image.id, image.x, image.y, image.width, image.height]);

  const onResizeHandlePointerDown = useCallback(
    (e: React.PointerEvent, handle: ResizeHandle) => {
      e.stopPropagation();
      setResizing(handle);
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
      if (!window.confirm('Czy na pewno chcesz usunąć ten obrazek?')) return;
      removeImage(image.id);
    },
    [image.id, removeImage]
  );

  const handleAnnotationChange = useCallback(
    (drawing: DrawingData) => {
      updateImageAnnotations(image.id, drawing);
    },
    [image.id, updateImageAnnotations]
  );

  const hasAnnotations = image.annotations &&
    (image.annotations.strokes.length > 0 || image.annotations.shapes.length > 0);

  const showDrawingOverlay = drawingMode && isSelected;

  // Remote drawing presence indicator
  const otherDrawing = Array.from(drawingUsers.values()).find(
    d => d.sketchId === image.id
  );

  return (
    <div
      className={`moodboard-item moodboard-image-item${
        isSelected ? ' moodboard-item--selected' : ''
      }${isDragging ? ' moodboard-item--dragging' : ''}`}
      style={{
        left: image.x - parentX,
        top: image.y - parentY,
        width: image.width,
        height: image.height,
        transform: image.rotation ? `rotate(${image.rotation}deg)` : undefined,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={!drawingMode ? handlePointerMove : undefined}
      onPointerUp={!drawingMode ? handlePointerUp : undefined}
      onPointerLeave={!drawingMode ? handlePointerUp : undefined}
    >
      <img
        src={image.imagePath ? `/api/moodboard/images/${image.imagePath}` : image.url}
        alt=""
        className="moodboard-image-img"
        draggable={false}
      />
      {/* Annotation / drawing overlay — always mounted when annotations exist or drawing active.
           No backgroundImage: the <img> underneath is always visible, overlay is transparent. */}
      {(hasAnnotations || showDrawingOverlay) && (
        <div className={showDrawingOverlay ? 'moodboard-image-drawing-overlay' : 'moodboard-image-annotation-overlay'}>
          <DrawingCanvas
            width={image.width}
            height={image.height}
            drawing={image.annotations || { strokes: [], shapes: [] }}
            onDrawingChange={handleAnnotationChange}
            isActive={showDrawingOverlay}
            tool={activeTool}
            color={toolColor}
            strokeWidth={toolWidth}
          />
        </div>
      )}
      {/* Drawing bar — below image when selected */}
      {isSelected && (
        <div className="sketch-drawbar" onPointerDown={(e) => e.stopPropagation()}>
          {!drawingMode ? (
            <button type="button" className="sketch-drawbar-draw-btn" onClick={() => { setDrawingMode(true); notifyDrawing(image.id, activeTool); }} title="Rysuj (D)" aria-label="Rysuj">
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
          <button type="button" className="sketch-drawbar-delete" onClick={onDelete} title="Usuń obrazek" aria-label="Usuń obrazek">
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
      {/* Resize handles — only when selected and NOT drawing (8 handles like reference) */}
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

export default ImageItem;
