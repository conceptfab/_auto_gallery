'use client';

import React from 'react';
import './konva-fix';
import { Rect, Ellipse, Line } from 'react-konva';
import type { MoodboardDrawShape } from '@/src/types/moodboard';

interface ShapeRendererProps {
  shape: MoodboardDrawShape;
  onRemove?: () => void;
  isEraser?: boolean;
}

const ShapeRenderer = React.memo(function ShapeRenderer({ shape, onRemove, isEraser }: ShapeRendererProps) {
  const hitProps = isEraser
    ? { listening: true, onClick: onRemove, onTap: onRemove, hitStrokeWidth: 20 }
    : { listening: false };

  if (shape.type === 'rect') {
    return (
      <Rect
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        stroke={shape.stroke}
        strokeWidth={shape.strokeWidth}
        fill={shape.fill}
        {...hitProps}
      />
    );
  }

  if (shape.type === 'circle') {
    return (
      <Ellipse
        x={shape.x + shape.width / 2}
        y={shape.y + shape.height / 2}
        radiusX={Math.abs(shape.width) / 2}
        radiusY={Math.abs(shape.height) / 2}
        stroke={shape.stroke}
        strokeWidth={shape.strokeWidth}
        fill={shape.fill}
        {...hitProps}
      />
    );
  }

  if (shape.type === 'line') {
    return (
      <Line
        points={[shape.x, shape.y, shape.endX ?? shape.x, shape.endY ?? shape.y]}
        stroke={shape.stroke}
        strokeWidth={shape.strokeWidth}
        {...hitProps}
      />
    );
  }

  return null;
});

export default ShapeRenderer;
