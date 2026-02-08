'use client';

import React from 'react';

interface ContextMenuProps {
  x: number;
  y: number;
  onAddComment: () => void;
  onAddSketch: () => void;
  onClose: () => void;
}

export default function ContextMenu({
  x,
  y,
  onAddComment,
  onAddSketch,
  onClose,
}: ContextMenuProps) {
  const handleAddComment = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddComment();
    onClose();
  };

  const handleAddSketch = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddSketch();
    onClose();
  };

  return (
    <>
      {/* Backdrop to close menu on click outside */}
      <div
        className="moodboard-context-backdrop"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="moodboard-context-menu"
        style={{ left: x, top: y }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="moodboard-context-menu-item"
          onClick={handleAddComment}
        >
          <span className="moodboard-context-menu-icon" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </span>
          Dodaj komentarz
        </button>
        <button
          type="button"
          className="moodboard-context-menu-item"
          onClick={handleAddSketch}
        >
          <span className="moodboard-context-menu-icon" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19l7-7 3 3-7 7-3-3z" />
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
              <path d="M2 2l7.586 7.586" />
            </svg>
          </span>
          Dodaj szkic
        </button>
      </div>
    </>
  );
}
