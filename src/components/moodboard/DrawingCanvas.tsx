'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Stage, Layer, Rect, Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';
import type {
  DrawingData,
  DrawingTool,
  MoodboardStroke,
  MoodboardDrawShape,
} from '@/src/types/moodboard';
import StrokePath from './drawing/StrokePath';
import ShapeRenderer from './drawing/ShapeRenderer';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

interface DrawingCanvasProps {
  width: number;
  height: number;
  drawing: DrawingData;
  onDrawingChange: (drawing: DrawingData) => void;
  isActive: boolean;
  tool: DrawingTool;
  color: string;
  strokeWidth: number;
  backgroundColor?: string;
  backgroundImage?: string;
}

export default function DrawingCanvas({
  width,
  height,
  drawing,
  onDrawingChange,
  isActive,
  tool,
  color,
  strokeWidth,
  backgroundColor,
  backgroundImage,
}: DrawingCanvasProps) {
  const stageRef = useRef<Konva.Stage | null>(null);
  const isDrawing = useRef(false);

  // Current stroke being drawn (pen/eraser)
  const [currentStroke, setCurrentStroke] = useState<MoodboardStroke | null>(null);
  // Current shape being drawn (rect/circle/line)
  const [currentShape, setCurrentShape] = useState<MoodboardDrawShape | null>(null);
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null);

  // rAF throttling: buffer points and flush once per frame
  const pendingStrokePointsRef = useRef<number[]>([]);
  const pendingShapePosRef = useRef<{ x: number; y: number } | null>(null);
  const rafIdRef = useRef<number>(0);

  // Refs to avoid stale closures in event handlers
  const currentStrokeRef = useRef<MoodboardStroke | null>(null);
  const currentShapeRef = useRef<MoodboardDrawShape | null>(null);
  const drawingRef = useRef(drawing);
  const onDrawingChangeRef = useRef(onDrawingChange);
  const toolRef = useRef(tool);
  const isActiveRef = useRef(isActive);
  const colorRef = useRef(color);
  const strokeWidthRef = useRef(strokeWidth);
  const widthRef = useRef(width);
  const heightRef = useRef(height);

  // Sync refs on each render
  drawingRef.current = drawing;
  onDrawingChangeRef.current = onDrawingChange;
  toolRef.current = tool;
  isActiveRef.current = isActive;
  colorRef.current = color;
  strokeWidthRef.current = strokeWidth;
  widthRef.current = width;
  heightRef.current = height;

  // Flush buffered points to React state (called once per animation frame)
  const flushPendingPoints = useCallback(() => {
    rafIdRef.current = 0;
    const pendingPts = pendingStrokePointsRef.current;
    const pendingShapePos = pendingShapePosRef.current;

    if (pendingPts.length > 0) {
      pendingStrokePointsRef.current = [];
      setCurrentStroke((prev) => {
        if (!prev) return prev;
        const next = { ...prev, points: [...prev.points, ...pendingPts] };
        currentStrokeRef.current = next;
        return next;
      });
    }

    if (pendingShapePos) {
      pendingShapePosRef.current = null;
      const start = shapeStartRef.current;
      if (start) {
        const pos = pendingShapePos;
        setCurrentShape((prev) => {
          if (!prev) return prev;
          let next: MoodboardDrawShape;
          if (prev.type === 'line') {
            next = { ...prev, endX: pos.x, endY: pos.y };
          } else {
            next = {
              ...prev,
              x: Math.min(start.x, pos.x),
              y: Math.min(start.y, pos.y),
              width: Math.abs(pos.x - start.x),
              height: Math.abs(pos.y - start.y),
            };
          }
          currentShapeRef.current = next;
          return next;
        });
      }
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    if (!rafIdRef.current) {
      rafIdRef.current = requestAnimationFrame(flushPendingPoints);
    }
  }, [flushPendingPoints]);

  // Cancel pending rAF on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  // Helper: commit any in-progress stroke/shape to drawing data
  const flushInProgress = useCallback(() => {
    // Cancel pending rAF and apply buffered points
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = 0;
    }
    const pendingPts = pendingStrokePointsRef.current;
    if (pendingPts.length > 0 && currentStrokeRef.current) {
      currentStrokeRef.current = {
        ...currentStrokeRef.current,
        points: [...currentStrokeRef.current.points, ...pendingPts],
      };
      pendingStrokePointsRef.current = [];
    }
    pendingShapePosRef.current = null;

    const d = drawingRef.current;
    const onChange = onDrawingChangeRef.current;
    let newDrawing = { ...d };
    let updated = false;

    const stroke = currentStrokeRef.current;
    if (stroke && stroke.points.length >= 3 && !newDrawing.strokes.some(s => s.id === stroke.id)) {
      newDrawing = { ...newDrawing, strokes: [...newDrawing.strokes, stroke] };
      updated = true;
    }

    const shape = currentShapeRef.current;
    if (shape && !newDrawing.shapes.some(s => s.id === shape.id)) {
      const hasSize =
        shape.type === 'line'
          ? Math.abs((shape.endX ?? 0) - shape.x) > 2 || Math.abs((shape.endY ?? 0) - shape.y) > 2
          : shape.width > 2 || shape.height > 2;
      if (hasSize) {
        newDrawing = { ...newDrawing, shapes: [...newDrawing.shapes, shape] };
        updated = true;
      }
    }

    if (updated) onChange(newDrawing);

    currentStrokeRef.current = null;
    currentShapeRef.current = null;
    setCurrentStroke(null);
    setCurrentShape(null);
    shapeStartRef.current = null;
    isDrawing.current = false;
  }, []);

  // Flush when drawing mode is deactivated (isActive changes to false)
  useEffect(() => {
    if (!isActive) flushInProgress();
  }, [isActive, flushInProgress]);

  // Flush on unmount (component removed while stroke in progress)
  useEffect(() => {
    return () => {
      const stroke = currentStrokeRef.current;
      const shape = currentShapeRef.current;
      if (stroke || shape) {
        const d = drawingRef.current;
        const onChange = onDrawingChangeRef.current;
        let newDrawing = { ...d };
        let changed = false;
        if (stroke && stroke.points.length >= 3 && !newDrawing.strokes.some(s => s.id === stroke.id)) {
          newDrawing = { ...newDrawing, strokes: [...newDrawing.strokes, stroke] };
          changed = true;
        }
        if (shape && !newDrawing.shapes.some(s => s.id === shape.id)) {
          const hasSize = shape.type === 'line'
            ? Math.abs((shape.endX ?? 0) - shape.x) > 2 || Math.abs((shape.endY ?? 0) - shape.y) > 2
            : shape.width > 2 || shape.height > 2;
          if (hasSize) {
            newDrawing = { ...newDrawing, shapes: [...newDrawing.shapes, shape] };
            changed = true;
          }
        }
        if (changed) onChange(newDrawing);
      }
    };
  }, []);

  // Background image element
  const [bgImgElement, setBgImgElement] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!backgroundImage) {
      setBgImgElement(null);
      return;
    }
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = backgroundImage;
    img.onload = () => setBgImgElement(img);
  }, [backgroundImage]);

  // Commit current stroke/shape
  const commitStroke = useCallback(() => {
    if (!isDrawing.current) return;
    isDrawing.current = false;

    // Flush any buffered points before committing
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = 0;
    }
    // Apply pending stroke points directly to the ref
    const pendingPts = pendingStrokePointsRef.current;
    if (pendingPts.length > 0 && currentStrokeRef.current) {
      currentStrokeRef.current = {
        ...currentStrokeRef.current,
        points: [...currentStrokeRef.current.points, ...pendingPts],
      };
      pendingStrokePointsRef.current = [];
    }
    const pendingShapePos = pendingShapePosRef.current;
    if (pendingShapePos && currentShapeRef.current && shapeStartRef.current) {
      const start = shapeStartRef.current;
      const prev = currentShapeRef.current;
      if (prev.type === 'line') {
        currentShapeRef.current = { ...prev, endX: pendingShapePos.x, endY: pendingShapePos.y };
      } else {
        currentShapeRef.current = {
          ...prev,
          x: Math.min(start.x, pendingShapePos.x),
          y: Math.min(start.y, pendingShapePos.y),
          width: Math.abs(pendingShapePos.x - start.x),
          height: Math.abs(pendingShapePos.y - start.y),
        };
      }
      pendingShapePosRef.current = null;
    }

    const t = toolRef.current;
    const d = drawingRef.current;
    const onChange = onDrawingChangeRef.current;

    if (t === 'pen' || t === 'eraser') {
      const stroke = currentStrokeRef.current;
      if (stroke && stroke.points.length >= 3 && !d.strokes.some(s => s.id === stroke.id)) {
        onChange({ ...d, strokes: [...d.strokes, stroke] });
      }
      currentStrokeRef.current = null;
      setCurrentStroke(null);
    } else {
      const shape = currentShapeRef.current;
      if (shape && !d.shapes.some(s => s.id === shape.id)) {
        const hasSize =
          shape.type === 'line'
            ? Math.abs((shape.endX ?? 0) - shape.x) > 2 ||
              Math.abs((shape.endY ?? 0) - shape.y) > 2
            : shape.width > 2 || shape.height > 2;

        if (hasSize) {
          onChange({ ...d, shapes: [...d.shapes, shape] });
        }
      }
      currentShapeRef.current = null;
      setCurrentShape(null);
      shapeStartRef.current = null;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Native pointer events for pen/stylus/touch input
  // Konva 10 maps pointerdown→mousedown internally, but pen coordinate handling
  // via Konva can be unreliable when the canvas is inside a CSS-transformed
  // parent (moodboard zoom/pan). We add native listeners with proper coordinate
  // scaling to handle pen and touch, while letting Konva handle mouse input.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const container = stage.container();
    // Prevent browser from claiming pen/touch for gestures (scroll, zoom, etc.)
    container.style.touchAction = 'none';

    let activePointerId = -1;

    // Convert viewport (client) coordinates → canvas pixel coordinates.
    // getBoundingClientRect() returns the visual size AFTER CSS transforms,
    // so dividing by rect size and multiplying by canvas size corrects for
    // any moodboard zoom/scale.
    const getPos = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (widthRef.current / Math.max(1, rect.width)),
        y: (e.clientY - rect.top) * (heightRef.current / Math.max(1, rect.height)),
      };
    };

    const startStroke = (pos: { x: number; y: number }, pressure: number) => {
      const t = toolRef.current;
      const c = colorRef.current;
      const sw = strokeWidthRef.current;

      if (t === 'pen' || t === 'eraser') {
        const stroke: MoodboardStroke = {
          id: generateId(),
          tool: t === 'eraser' ? 'eraser' : 'pen',
          points: [pos.x, pos.y, pressure],
          color: t === 'eraser' ? '#ffffff' : c,
          width: sw,
        };
        currentStrokeRef.current = stroke;
        setCurrentStroke(stroke);
      } else {
        shapeStartRef.current = pos;
        const shape: MoodboardDrawShape = {
          id: generateId(),
          type: t as 'rect' | 'circle' | 'line',
          x: pos.x,
          y: pos.y,
          width: 0,
          height: 0,
          endX: pos.x,
          endY: pos.y,
          stroke: c,
          strokeWidth: sw,
        };
        currentShapeRef.current = shape;
        setCurrentShape(shape);
      }
    };

    const addPoint = (pos: { x: number; y: number }, pressure: number) => {
      const t = toolRef.current;
      if (t === 'pen' || t === 'eraser') {
        pendingStrokePointsRef.current.push(pos.x, pos.y, pressure);
        scheduleFlush();
      } else if (shapeStartRef.current) {
        pendingShapePosRef.current = pos;
        scheduleFlush();
      }
    };

    // --- window-level move / up (added after pointerdown, removed after up) ---
    const onWindowMove = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId || !isDrawing.current) return;
      addPoint(getPos(e), e.pressure ?? 0.5);
    };

    const onWindowUp = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId) return;
      activePointerId = -1;
      window.removeEventListener('pointermove', onWindowMove);
      window.removeEventListener('pointerup', onWindowUp);
      window.removeEventListener('pointercancel', onWindowUp);
      commitStroke();
    };

    // --- pointerdown on the Konva container ---
    const onDown = (e: PointerEvent) => {
      if (!isActiveRef.current) return;
      // Only handle pen / touch — mouse goes through Konva's event system
      if (e.pointerType === 'mouse') return;

      e.preventDefault();
      activePointerId = e.pointerId;
      isDrawing.current = true;

      startStroke(getPos(e), e.pressure ?? 0.5);

      // Track move/up at the window level so the stroke continues even if
      // the pen briefly leaves the canvas area.
      window.addEventListener('pointermove', onWindowMove);
      window.addEventListener('pointerup', onWindowUp);
      window.addEventListener('pointercancel', onWindowUp);
    };

    container.addEventListener('pointerdown', onDown);
    return () => {
      container.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onWindowMove);
      window.removeEventListener('pointerup', onWindowUp);
      window.removeEventListener('pointercancel', onWindowUp);
    };
  }, [commitStroke, scheduleFlush]);

  // ---------------------------------------------------------------------------
  // Konva mouse event handlers (regular mouse input only)
  // Pen/touch is handled by the native pointer event listeners above.
  // ---------------------------------------------------------------------------

  const getPointerPos = useCallback(
    (e: { evt: { offsetX: number; offsetY: number } }) => {
      return { x: e.evt.offsetX, y: e.evt.offsetY };
    },
    []
  );

  const handlePointerDown = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => {
      if (!isActive) return;
      // Skip pen/touch — handled by native pointer listeners
      if (e.evt?.pointerType && e.evt.pointerType !== 'mouse') return;
      isDrawing.current = true;
      const pos = getPointerPos(e);
      const pressure = e.evt?.pressure ?? 0.5;

      if (tool === 'pen' || tool === 'eraser') {
        const stroke: MoodboardStroke = {
          id: generateId(),
          tool: tool === 'eraser' ? 'eraser' : 'pen',
          points: [pos.x, pos.y, pressure],
          color: tool === 'eraser' ? '#ffffff' : color,
          width: strokeWidth,
        };
        currentStrokeRef.current = stroke;
        setCurrentStroke(stroke);
      } else {
        shapeStartRef.current = pos;
        const shape: MoodboardDrawShape = {
          id: generateId(),
          type: tool as 'rect' | 'circle' | 'line',
          x: pos.x,
          y: pos.y,
          width: 0,
          height: 0,
          endX: pos.x,
          endY: pos.y,
          stroke: color,
          strokeWidth,
        };
        currentShapeRef.current = shape;
        setCurrentShape(shape);
      }
    },
    [isActive, tool, color, strokeWidth, getPointerPos]
  );

  const handlePointerMove = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => {
      if (!isDrawing.current || !isActive) return;
      if (e.evt?.pointerType && e.evt.pointerType !== 'mouse') return;
      const pos = getPointerPos(e);
      const pressure = e.evt?.pressure ?? 0.5;

      if (tool === 'pen' || tool === 'eraser') {
        pendingStrokePointsRef.current.push(pos.x, pos.y, pressure);
        scheduleFlush();
      } else if (shapeStartRef.current) {
        pendingShapePosRef.current = pos;
        scheduleFlush();
      }
    },
    [isActive, tool, getPointerPos, scheduleFlush]
  );

  const handlePointerUp = useCallback(() => {
    commitStroke();
  }, [commitStroke]);

  const handleRemoveStroke = useCallback(
    (strokeId: string) => {
      onDrawingChange({
        ...drawing,
        strokes: drawing.strokes.filter((s) => s.id !== strokeId),
      });
    },
    [drawing, onDrawingChange]
  );

  const handleRemoveShape = useCallback(
    (shapeId: string) => {
      onDrawingChange({
        ...drawing,
        shapes: drawing.shapes.filter((s) => s.id !== shapeId),
      });
    },
    [drawing, onDrawingChange]
  );

  const isEraser = tool === 'eraser';

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      onMouseDown={handlePointerDown}
      onMouseMove={handlePointerMove}
      onMouseUp={handlePointerUp}
      onMouseLeave={handlePointerUp}
      style={{
        cursor: isActive ? 'crosshair' : 'default',
        touchAction: 'none',
      }}
    >
      {/* Background layer */}
      <Layer listening={false}>
        {backgroundColor && (
          <Rect x={0} y={0} width={width} height={height} fill={backgroundColor} />
        )}
        {bgImgElement && (
          <KonvaImage image={bgImgElement} x={0} y={0} width={width} height={height} />
        )}
      </Layer>

      {/* Drawn elements */}
      <Layer>
        {drawing.strokes.map((s) => (
          <StrokePath
            key={s.id}
            stroke={s}
            isEraser={isEraser}
            onRemove={() => handleRemoveStroke(s.id)}
          />
        ))}
        {drawing.shapes.map((s) => (
          <ShapeRenderer
            key={s.id}
            shape={s}
            isEraser={isEraser}
            onRemove={() => handleRemoveShape(s.id)}
          />
        ))}
      </Layer>

      {/* Preview layer (currently drawing) */}
      <Layer listening={false}>
        {currentStroke && <StrokePath stroke={currentStroke} />}
        {currentShape && <ShapeRenderer shape={currentShape} />}
      </Layer>
    </Stage>
  );
}
