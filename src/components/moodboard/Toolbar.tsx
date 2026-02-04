'use client';

import React, { useState } from 'react';
import { useMoodboard } from '@/src/contexts/MoodboardContext';
import type {
  CommentColorKey,
  CommentFontWeightKey,
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

export default function Toolbar() {
  const { addComment } = useMoodboard();
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
      </div>
    </div>
  );
}
