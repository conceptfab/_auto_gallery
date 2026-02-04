'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMoodboard } from '@/src/contexts/MoodboardContext';
import type { MoodboardBoard } from '@/src/types/moodboard';

const DEFAULT_NAME = 'Moodboard';

interface MoodboardTabProps {
  isAdmin?: boolean;
}

function TabLabel({
  board,
  isActive,
  onSelect,
  onStartEdit,
  editing,
  inputValue,
  onInputChange,
  onSubmitEdit,
  onKeyDown,
  menuSlot,
}: {
  board: MoodboardBoard;
  isActive: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  editing: boolean;
  inputValue: string;
  onInputChange: (v: string) => void;
  onSubmitEdit: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  menuSlot?: React.ReactNode;
}) {
  const displayName = board.name?.trim() || DEFAULT_NAME;
  if (!isActive) {
    return (
      <div className="moodboard-tab-tab moodboard-tab-tab--inactive">
        <button
          type="button"
          className="moodboard-tab-tab-name"
          onClick={onSelect}
          title={displayName}
        >
          {displayName}
        </button>
        {menuSlot}
      </div>
    );
  }
  return (
    <div className="moodboard-tab-inner">
      <div className="moodboard-tab-inner-content">
        {editing ? (
          <input
            type="text"
            className="moodboard-tab-input"
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onBlur={onSubmitEdit}
            onKeyDown={onKeyDown}
            autoFocus
            aria-label="Nazwa moodboarda"
          />
        ) : (
          <button
            type="button"
            className="moodboard-tab-label"
            onClick={onStartEdit}
            title="Kliknij, aby edytować nazwę"
          >
            {displayName}
          </button>
        )}
      </div>
      {menuSlot}
    </div>
  );
}

function TabMenu({
  board: _board,
  isActive: _isActive,
  canDelete,
  onRename,
  onDelete,
  isOpen,
  onToggle,
  onClose,
}: {
  board: MoodboardBoard;
  isActive: boolean;
  canDelete: boolean;
  onRename: () => void;
  onDelete: () => void;
  isOpen: boolean;
  onToggle: (e: React.MouseEvent) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const handleRename = () => {
    onRename();
    onClose();
  };
  const handleDelete = () => {
    if (canDelete && window.confirm('Usunąć ten moodboard?')) {
      onDelete();
    }
    onClose();
  };

  return (
    <div className="moodboard-tab-menu-wrap" ref={menuRef}>
      <button
        type="button"
        className="moodboard-tab-menu-btn"
        onClick={onToggle}
        title="Opcje moodboarda"
        aria-label="Opcje moodboarda"
        aria-expanded={isOpen}
      >
        <span className="moodboard-tab-menu-dots" aria-hidden>
          ⋮
        </span>
      </button>
      {isOpen && (
        <div className="moodboard-tab-menu-dropdown">
          <button
            type="button"
            className="moodboard-tab-menu-item"
            onClick={handleRename}
          >
            Zmień nazwę
          </button>
          <button
            type="button"
            className="moodboard-tab-menu-item moodboard-tab-menu-item--danger"
            onClick={handleDelete}
            disabled={!canDelete}
            title={
              canDelete
                ? 'Usuń moodboard'
                : 'Musi zostać co najmniej jeden moodboard'
            }
          >
            Usuń moodboard
          </button>
        </div>
      )}
    </div>
  );
}

export default function MoodboardTab({ isAdmin = false }: MoodboardTabProps) {
  const {
    boards,
    activeId,
    setActiveBoard,
    setMoodboardName,
    deleteBoard,
    createNewMoodboard,
    name,
  } = useMoodboard();
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(name ?? DEFAULT_NAME);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renameRequestedForId, setRenameRequestedForId] = useState<
    string | null
  >(null);

  useEffect(() => {
    setInputValue(name?.trim() || DEFAULT_NAME);
  }, [name]);

  useEffect(() => {
    if (renameRequestedForId && renameRequestedForId === activeId) {
      setInputValue(
        boards.find((b) => b.id === activeId)?.name?.trim() || DEFAULT_NAME
      );
      setEditing(true);
      setRenameRequestedForId(null);
    }
  }, [renameRequestedForId, activeId, boards]);

  const activeBoard = boards.find((b) => b.id === activeId) ?? boards[0];
  const canDeleteAny = boards.length > 1;

  const startEdit = useCallback(() => {
    setInputValue(activeBoard?.name?.trim() || DEFAULT_NAME);
    setEditing(true);
  }, [activeBoard?.name]);

  const submitEdit = useCallback(() => {
    setEditing(false);
    const v = inputValue.trim();
    setMoodboardName(v || DEFAULT_NAME);
  }, [inputValue, setMoodboardName]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitEdit();
      }
      if (e.key === 'Escape') {
        setInputValue(activeBoard?.name?.trim() || DEFAULT_NAME);
        setEditing(false);
      }
    },
    [submitEdit, activeBoard?.name]
  );

  const menuFor = (b: MoodboardBoard) => (
    <TabMenu
      board={b}
      isActive={activeId === b.id}
      canDelete={canDeleteAny}
      onRename={() => {
        setActiveBoard(b.id);
        setRenameRequestedForId(b.id);
      }}
      onDelete={() => deleteBoard(b.id)}
      isOpen={openMenuId === b.id}
      onToggle={(e) => {
        e.stopPropagation();
        setOpenMenuId((prev) => (prev === b.id ? null : b.id));
      }}
      onClose={() => setOpenMenuId(null)}
    />
  );

  const renderTabWithMenu = (
    b: MoodboardBoard,
    isActive: boolean,
    tabLabelProps: {
      onSelect: () => void;
      onStartEdit: () => void;
      editing: boolean;
      inputValue: string;
      onInputChange: (v: string) => void;
      onSubmitEdit: () => void;
      onKeyDown: (e: React.KeyboardEvent) => void;
    }
  ) => (
    <TabLabel
      board={b}
      isActive={isActive}
      {...tabLabelProps}
      menuSlot={isActive ? menuFor(b) : undefined}
    />
  );

  const tabBar = (
    <div className="moodboard-tab">
      <div className="moodboard-tab-group">
        {boards.map((b) => (
          <React.Fragment key={b.id}>
            {renderTabWithMenu(
              b,
              b.id === activeId,
              b.id === activeId
                ? {
                    onSelect: () => {},
                    onStartEdit: startEdit,
                    editing,
                    inputValue,
                    onInputChange: setInputValue,
                    onSubmitEdit: submitEdit,
                    onKeyDown: handleKeyDown,
                  }
                : {
                    onSelect: () => setActiveBoard(b.id),
                    onStartEdit: () => {},
                    editing: false,
                    inputValue: '',
                    onInputChange: () => {},
                    onSubmitEdit: () => {},
                    onKeyDown: () => {},
                  }
            )}
          </React.Fragment>
        ))}
        {isAdmin && (
          <button
            type="button"
            className="moodboard-tab-add-btn"
            title="Nowy, czysty moodboard"
            aria-label="Nowy, czysty moodboard"
            onClick={createNewMoodboard}
          >
            +
          </button>
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(tabBar, document.body);
  }
  return tabBar;
}
