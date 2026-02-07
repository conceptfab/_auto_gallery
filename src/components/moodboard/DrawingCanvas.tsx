'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Stage, Layer, Rect, Image as KonvaImage } from 'react-konva';
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
  const stageRef = useRef<ReturnType<typeof Stage> extends React.ReactElement<infer P> ? P : never>(null);
  const isDrawing = useRef(false);

  // Current stroke being drawn (pen/eraser)
  const [currentStroke, setCurrentStroke] = useState<MoodboardStroke | null>(null);
  // Current shape being drawn (rect/circle/line)
  const [currentShape, setCurrentShape] = useState<MoodboardDrawShape | null>(null);
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null);

  // Refs to avoid stale closures in react-konva event handlers
  const currentStrokeRef = useRef<MoodboardStroke | null>(null);
  const currentShapeRef = useRef<MoodboardDrawShape | null>(null);
  const drawingRef = useRef(drawing);
  const onDrawingChangeRef = useRef(onDrawingChange);
  const toolRef = useRef(tool);

  // Sync refs on each render (before effects, so handlers always see latest)
  drawingRef.current = drawing;
  onDrawingChangeRef.current = onDrawingChange;
  toolRef.current = tool;

  // Helper: commit any in-progress stroke/shape to drawing data
  const flushInProgress = useCallback(() => {
    const d = drawingRef.current;
    const onChange = onDrawingChangeRef.current;
    let newDrawing = { ...d };
    let updated = false;

    const stroke = currentStrokeRef.current;
    if (stroke && stroke.points.length >= 3) {
      newDrawing = { ...newDrawing, strokes: [...newDrawing.strokes, stroke] };
      updated = true;
    }

    const shape = currentShapeRef.current;
    if (shape) {
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
        if (stroke && stroke.points.length >= 3) {
          newDrawing = { ...newDrawing, strokes: [...newDrawing.strokes, stroke] };
          changed = true;
        }
        if (shape) {
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
        // Shape tools: rect, circle, line
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
      const pos = getPointerPos(e);
      const pressure = e.evt?.pressure ?? 0.5;

      if (tool === 'pen' || tool === 'eraser') {
        setCurrentStroke((prev) => {
          if (!prev) return prev;
          const next = { ...prev, points: [...prev.points, pos.x, pos.y, pressure] };
          currentStrokeRef.current = next;
          return next;
        });
      } else if (shapeStartRef.current) {
        const start = shapeStartRef.current;
        setCurrentShape((prev) => {
          if (!prev) return prev;
          let next: MoodboardDrawShape;
          if (tool === 'line') {
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
    },
    [isActive, tool, getPointerPos]
  );

  const handlePointerUp = useCallback(() => {
    if (!isDrawing.current) return;
    isDrawing.current = false;

    const t = toolRef.current;
    const d = drawingRef.current;
    const onChange = onDrawingChangeRef.current;

    if (t === 'pen' || t === 'eraser') {
      const stroke = currentStrokeRef.current;
      if (stroke && stroke.points.length >= 3) {
        onChange({ ...d, strokes: [...d.strokes, stroke] });
      }
      currentStrokeRef.current = null;
      setCurrentStroke(null);
    } else {
      const shape = currentShapeRef.current;
      if (shape) {
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
      onTouchStart={handlePointerDown}
      onTouchMove={handlePointerMove}
      onTouchEnd={handlePointerUp}
      style={{ cursor: isActive ? (isEraser ? 'crosshair' : 'crosshair') : 'default' }}
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
