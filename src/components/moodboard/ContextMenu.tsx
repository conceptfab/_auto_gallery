'use client';

import React from 'react';

interface ContextMenuProps {
  x: number;
  y: number;
  onAddComment: () => void;
  onClose: () => void;
}

export default function ContextMenu({
  x,
  y,
  onAddComment,
  onClose,
}: ContextMenuProps) {
  const handleAddComment = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddComment();
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
          + Dodaj komentarz
        </button>
      </div>
    </>
  );
}
