'use client';

import React, { useState } from 'react';
import { useMoodboard } from '@/src/contexts/MoodboardContext';
import type {
  CommentColorKey,
  CommentFontWeightKey,
  DrawingTool,
} from '@/src/types/moodboard';
import { COLOR_MAP, DEFAULT_COMMENT } from './CommentItem';

const COLOR_KEYS: CommentColorKey[] = [
  'none',
  'yellow',
  'pink',
  'blue',
  'green',
  'orange',
  'purple',
];

const FONT_WEIGHT_OPTIONS: { value: CommentFontWeightKey; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'medium', label: 'Medium' },
  { value: 'semibold', label: 'Semibold' },
  { value: 'bold', label: 'Bold' },
];

const DRAWING_TOOLS: { value: DrawingTool; label: string; shortcut: string }[] = [
  { value: 'pen', label: 'Pen', shortcut: 'P' },
  { value: 'rect', label: 'Rect', shortcut: 'R' },
  { value: 'circle', label: 'Circle', shortcut: 'C' },
  { value: 'line', label: 'Line', shortcut: 'L' },
  { value: 'eraser', label: 'Eraser', shortcut: 'E' },
];

const STROKE_COLORS = ['#000000', '#ef4444', '#3b82f6', '#22c55e', '#f97316', '#ffffff'];
const STROKE_WIDTHS = [1, 3, 5, 10, 20];

export default function Toolbar() {
  const {
    addComment,
    addSketch,
    drawingMode,
    setDrawingMode,
    activeTool,
    setActiveTool,
    toolColor,
    setToolColor,
    toolWidth,
    setToolWidth,
  } = useMoodboard();
  const [color, setColor] = useState<CommentColorKey>(DEFAULT_COMMENT.color);
  const [fontWeight, setFontWeight] = useState<CommentFontWeightKey>(
    DEFAULT_COMMENT.fontWeight
  );

  const handleAddComment = () => {
    addComment({
      text: '',
      color,
      font: 'sans',
      fontWeight,
      x: 80,
      y: 80,
      width: 200,
      height: 120,
    });
  };

  const handleAddSketch = () => {
    addSketch({
      x: 100,
      y: 100,
      width: 400,
      height: 300,
      backgroundColor: '#ffffff',
      drawing: { strokes: [], shapes: [] },
    });
  };

  return (
    <div className="moodboard-toolbar">
      <div className="moodboard-toolbar-row">
        <button
          type="button"
          className="moodboard-toolbar-btn"
          onClick={handleAddComment}
          aria-label="Dodaj nowy komentarz na moodboardzie"
          title="Dodaj nowy komentarz na moodboardzie"
        >
          + Dodaj komentarz
        </button>
        <div className="moodboard-toolbar-options">
          <span className="moodboard-toolbar-label">
            Kolor następnego komentarza:
          </span>
          <div className="moodboard-toolbar-colors">
            {COLOR_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                className={`moodboard-toolbar-color-btn${
                  k === 'none' ? ' moodboard-toolbar-color-btn--none' : ''
                }`}
                style={
                  k === 'none' ? undefined : { backgroundColor: COLOR_MAP[k] }
                }
                title={k === 'none' ? 'Bez tła (sam tekst)' : k}
                aria-pressed={color === k}
                onClick={() => setColor(k)}
              />
            ))}
          </div>
          <span className="moodboard-toolbar-label">Waga fonta:</span>
          <div className="moodboard-toolbar-weights">
            {FONT_WEIGHT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className="moodboard-toolbar-weight-btn"
                data-weight={opt.value}
                title={opt.label}
                aria-pressed={fontWeight === opt.value}
                onClick={() => setFontWeight(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="moodboard-toolbar-separator" />

        <button
          type="button"
          className={`moodboard-toolbar-btn moodboard-toolbar-btn--drawing${drawingMode ? ' moodboard-toolbar-btn--active' : ''}`}
          onClick={() => setDrawingMode(!drawingMode)}
          aria-pressed={drawingMode}
          title="Tryb rysowania (D)"
        >
          {drawingMode ? 'Rysowanie ON' : 'Rysowanie'}
        </button>

        <button
          type="button"
          className="moodboard-toolbar-btn"
          onClick={handleAddSketch}
          title="Dodaj nowy szkic"
        >
          + Nowy szkic
        </button>
      </div>

      {drawingMode && (
        <div className="moodboard-toolbar-row moodboard-toolbar-drawing">
          <div className="moodboard-toolbar-drawing-tools">
            {DRAWING_TOOLS.map((t) => (
              <button
                key={t.value}
                type="button"
                className="moodboard-toolbar-tool-btn"
                aria-pressed={activeTool === t.value}
                title={`${t.label} (${t.shortcut})`}
                onClick={() => setActiveTool(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="moodboard-toolbar-separator" />

          <div className="moodboard-toolbar-drawing-colors">
            {STROKE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="moodboard-toolbar-stroke-color-btn"
                style={{ backgroundColor: c }}
                aria-pressed={toolColor === c}
                title={c}
                onClick={() => setToolColor(c)}
              />
            ))}
            <input
              type="color"
              className="moodboard-toolbar-color-input"
              value={toolColor}
              onChange={(e) => setToolColor(e.target.value)}
              title="Dowolny kolor"
            />
          </div>

          <div className="moodboard-toolbar-separator" />

          <div className="moodboard-toolbar-drawing-widths">
            {STROKE_WIDTHS.map((w) => (
              <button
                key={w}
                type="button"
                className="moodboard-toolbar-width-btn"
                aria-pressed={toolWidth === w}
                title={`${w}px`}
                onClick={() => setToolWidth(w)}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
