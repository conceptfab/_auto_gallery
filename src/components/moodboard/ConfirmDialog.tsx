'use client';

import React, { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface ConfirmDialogAction {
  label: string;
  icon?: string;
  variant: 'danger' | 'warning' | 'primary' | 'cancel';
  onClick: () => void;
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  actions: ConfirmDialogAction[];
  onClose: () => void;
}

const VARIANT_STYLES: Record<ConfirmDialogAction['variant'], React.CSSProperties> = {
  danger: { background: '#ef4444', color: '#fff' },
  warning: { background: '#f59e0b', color: '#fff' },
  primary: { background: '#000000', color: '#fff' },
  cancel: { background: '#f1f5f9', color: '#475569' },
};

export default function ConfirmDialog({ open, title, description, actions, onClose }: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const handleOverlayClick = useCallback(() => onClose(), [onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="moodboard-delete-dialog-overlay" onClick={handleOverlayClick}>
      <div className="moodboard-delete-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="moodboard-delete-dialog-title">{title}</div>
        {description && <div className="moodboard-delete-dialog-desc">{description}</div>}
        <div className="moodboard-delete-dialog-actions">
          {actions.map((action, i) => (
            <button
              key={i}
              type="button"
              className="moodboard-delete-dialog-btn"
              style={VARIANT_STYLES[action.variant]}
              onClick={action.onClick}
            >
              {action.icon && <i className={action.icon} aria-hidden />}
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
