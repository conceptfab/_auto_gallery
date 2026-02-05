'use client';

import React from 'react';
import type {
  CommentColorKey,
  CommentFontWeightKey,
} from '@/src/types/moodboard';

const FONT_WEIGHT_OPTIONS: { value: CommentFontWeightKey; icon: string }[] = [
  { value: 'normal', icon: 'N' },
  { value: 'medium', icon: 'M' },
  { value: 'semibold', icon: 'S' },
  { value: 'bold', icon: 'B' },
];

interface CommentEditPanelProps {
  color: CommentColorKey;
  bgColor?: string;
  fontColor?: string;
  fontSize?: number;
  fontWeight?: CommentFontWeightKey;
  onColorChange: (color: CommentColorKey) => void;
  onBgColorChange: (color: string) => void;
  onFontColorChange: (color: string) => void;
  onFontSizeChange: (size: number) => void;
  onFontWeightChange: (weight: CommentFontWeightKey) => void;
  position: { x: number; y: number };
}

export default function CommentEditPanel({
  color,
  bgColor = '#fef08a',
  fontColor = '#000000',
  fontSize = 16,
  fontWeight = 'normal',
  onColorChange,
  onBgColorChange,
  onFontColorChange,
  onFontSizeChange,
  onFontWeightChange,
  position,
}: CommentEditPanelProps) {
  const isNoBg = color === 'none';

  return (
    <div
      className="moodboard-comment-edit-panel"
      style={{
        left: position.x,
        top: position.y,
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Background Section */}
      <div className="moodboard-edit-panel-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span className="moodboard-edit-panel-label" style={{ margin: 0 }}>Tło:</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: '#666', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={isNoBg} 
              onChange={(e) => onColorChange(e.target.checked ? 'none' : 'yellow')} 
            />
            Przezroczyste
          </label>
        </div>
        {!isNoBg && (
          <input
            type="color"
            className="moodboard-edit-panel-color-input"
            value={bgColor}
            onChange={(e) => onBgColorChange(e.target.value)}
          />
        )}
      </div>

      {/* Font Color */}
      <div className="moodboard-edit-panel-section">
        <span className="moodboard-edit-panel-label">Kolor tekstu:</span>
        <input
          type="color"
          className="moodboard-edit-panel-color-input"
          value={fontColor}
          onChange={(e) => onFontColorChange(e.target.value)}
        />
      </div>

      {/* Font Size */}
      <div className="moodboard-edit-panel-section">
        <span className="moodboard-edit-panel-label">Rozmiar: {fontSize}px</span>
        <input
          type="range"
          className="moodboard-edit-panel-slider"
          min={10}
          max={72}
          step={1}
          value={fontSize}
          onChange={(e) => onFontSizeChange(Number(e.target.value))}
        />
      </div>

      {/* Font Weight */}
      <div className="moodboard-edit-panel-section">
        <span className="moodboard-edit-panel-label">Waga:</span>
        <div className="moodboard-edit-panel-weights">
          {FONT_WEIGHT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className="moodboard-edit-panel-weight-btn"
              data-weight={opt.value}
              title={opt.value}
              aria-pressed={fontWeight === opt.value}
              onClick={() => onFontWeightChange(opt.value)}
            >
              {opt.icon}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
