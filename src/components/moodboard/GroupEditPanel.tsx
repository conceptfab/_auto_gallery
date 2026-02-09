'use client';

import React from 'react';

interface GroupEditPanelProps {
  name: string;
  color?: string;
  labelSize?: number;
  labelColor?: string;
  onNameChange: (name: string) => void;
  onColorChange: (color: string) => void;
  onLabelSizeChange: (size: number) => void;
  onLabelColorChange: (color: string) => void;
  onUngroup: () => void;
  onDeleteWithContents: () => void;
  onAddComment: () => void;
  position: { x: number; y: number };
  /** Opcja przenoszenia na inny moodboard */
  otherBoards?: { id: string; name?: string }[];
  onMoveToBoard?: (targetBoardId: string) => void;
}

export default function GroupEditPanel({
  name,
  color = '#000000',
  labelSize = 14,
  labelColor = '#ffffff',
  onNameChange,
  onColorChange,
  onLabelSizeChange,
  onLabelColorChange,
  onUngroup,
  onDeleteWithContents,
  onAddComment,
  position,
  otherBoards = [],
  onMoveToBoard,
}: GroupEditPanelProps) {
  // Ensure we have a hex color for the picker
  const hexColor = color.startsWith('rgba') ? '#000000' : color;

  return (
    <div
      className="moodboard-comment-edit-panel moodboard-group-edit-panel"
      style={{
        left: position.x,
        top: position.y,
        minWidth: '200px',
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="moodboard-edit-panel-section">
        <span className="moodboard-edit-panel-label">Nazwa grupy:</span>
        <input
          type="text"
          className="moodboard-edit-panel-input"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Nazwa grupy..."
          style={{
            width: '100%',
            padding: '4px 8px',
            fontSize: '0.8rem',
            border: '1px solid #e2e8f0',
            borderRadius: '4px',
            backgroundColor: '#fff',
            color: '#1e293b',
          }}
        />
      </div>

      <div className="moodboard-edit-panel-section">
        <span className="moodboard-edit-panel-label">Rozmiar etykiety: {labelSize}px</span>
        <input
          type="range"
          className="moodboard-edit-panel-slider"
          min={10}
          max={48}
          step={1}
          value={labelSize}
          onChange={(e) => onLabelSizeChange(Number(e.target.value))}
        />
      </div>

      <div className="moodboard-edit-panel-section">
        <span className="moodboard-edit-panel-label">Kolorystyka:</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '0.65rem', color: '#666', display: 'block', marginBottom: '2px' }}>Tekst etykiety:</span>
            <input
              type="color"
              className="moodboard-edit-panel-color-input"
              value={labelColor}
              onChange={(e) => onLabelColorChange(e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '0.65rem', color: '#666', display: 'block', marginBottom: '2px' }}>Główny kolor:</span>
            <input
              type="color"
              className="moodboard-edit-panel-color-input"
              value={hexColor}
              onChange={(e) => onColorChange(e.target.value)}
            />
          </div>
        </div>
      </div>

      {otherBoards.length > 0 && onMoveToBoard && (
        <div className="moodboard-edit-panel-section">
          <div className="sketch-label-menu-header">Przenieś na:</div>
          {otherBoards.map((b) => (
            <button
              key={b.id}
              type="button"
              className="sketch-label-menu-item sketch-label-menu-item--move"
              onClick={() => onMoveToBoard(b.id)}
            >
              {b.name?.trim() || 'Moodboard'}
            </button>
          ))}
        </div>
      )}

      <div className="moodboard-edit-panel-section" style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="moodboard-edit-panel-btn"
          onClick={onAddComment}
          style={{
            flex: 1,
            padding: '6px',
            fontSize: '0.75rem',
            backgroundColor: '#000000',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            minWidth: '80px',
          }}
        >
          + Komentarz
        </button>
        <button
          type="button"
          className="moodboard-edit-panel-btn"
          onClick={onUngroup}
          style={{
            flex: 1,
            padding: '6px',
            fontSize: '0.75rem',
            backgroundColor: '#f59e0b',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            minWidth: '80px',
          }}
        >
          Rozgrupuj
        </button>
        <button
          type="button"
          className="moodboard-edit-panel-btn"
          onClick={onDeleteWithContents}
          style={{
            flex: '1 1 100%',
            padding: '6px',
            fontSize: '0.75rem',
            backgroundColor: '#ef4444',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          <i className="las la-trash-alt" style={{ marginRight: 4 }} aria-hidden />
          Usuń z zawartością
        </button>
      </div>
    </div>
  );
}
