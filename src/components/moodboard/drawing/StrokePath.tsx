'use client';

import React from 'react';
import './konva-fix';
import { Path } from 'react-konva';
import { getStroke } from 'perfect-freehand';
import type { MoodboardStroke } from '@/src/types/moodboard';

function getSvgPathFromStroke(stroke: number[][]): string {
  if (!stroke.length) return '';

  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ['M', ...stroke[0], 'Q']
  );

  d.push('Z');
  return d.join(' ');
}

interface StrokePathProps {
  stroke: MoodboardStroke;
  onRemove?: () => void;
  isEraser?: boolean;
}

const StrokePath = React.memo(function StrokePath({ stroke, onRemove, isEraser }: StrokePathProps) {
  // Convert flat [x,y,pressure, x,y,pressure, ...] to [[x,y,pressure], ...]
  const points: number[][] = [];
  for (let i = 0; i < stroke.points.length; i += 3) {
    points.push([stroke.points[i], stroke.points[i + 1], stroke.points[i + 2] ?? 0.5]);
  }

  const outlinePoints = getStroke(points, {
    size: stroke.width,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
  });

  const pathData = getSvgPathFromStroke(outlinePoints);

  return (
    <Path
      data={pathData}
      fill={stroke.tool === 'eraser' ? '#ffffff' : stroke.color}
      listening={!!isEraser}
      onClick={isEraser ? onRemove : undefined}
      onTap={isEraser ? onRemove : undefined}
      hitStrokeWidth={isEraser ? 20 : 0}
    />
  );
});

export default StrokePath;
