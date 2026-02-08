'use client';

import React from 'react';
import type { OnlineUser, DrawingPresence } from '@/src/hooks/useBoardSSE';

interface PresenceBarProps {
  onlineUsers: OnlineUser[];
  drawingUsers: Map<string, DrawingPresence>;
}

export default function PresenceBar({ onlineUsers, drawingUsers }: PresenceBarProps) {
  if (onlineUsers.length === 0) return null;

  return (
    <div className="moodboard-presence-bar">
      {onlineUsers.map(u => {
        const initials = u.email.slice(0, 2).toUpperCase();
        const isDrawing = drawingUsers.has(u.email);
        return (
          <div
            key={u.email}
            className={`moodboard-presence-avatar${isDrawing ? ' moodboard-presence-avatar--drawing' : ''}`}
            style={{ backgroundColor: u.color }}
            title={`${u.email}${isDrawing ? ' (rysuje)' : ''}`}
          >
            {initials}
          </div>
        );
      })}
    </div>
  );
}
