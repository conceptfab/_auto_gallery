'use client';

import React, { useCallback, useEffect, useState } from 'react';
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
}) {
  const displayName = board.name?.trim() || DEFAULT_NAME;
  if (!isActive) {
    return (
      <button
        type="button"
        className="moodboard-tab-tab moodboard-tab-tab--inactive"
        onClick={onSelect}
        title={displayName}
      >
        {displayName}
      </button>
    );
  }
  return (
    <div className="moodboard-tab-inner">
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
  );
}

export default function MoodboardTab({ isAdmin = false }: MoodboardTabProps) {
  const {
    boards,
    activeId,
    setActiveBoard,
    setMoodboardName,
    createNewMoodboard,
    name,
  } = useMoodboard();
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(name ?? DEFAULT_NAME);

  useEffect(() => {
    setInputValue(name?.trim() || DEFAULT_NAME);
  }, [name]);

  const activeIndex = boards.findIndex((b) => b.id === activeId);
  const leftBoards = activeIndex <= 0 ? [] : boards.slice(0, activeIndex);
  const centerBoard = boards[activeIndex] ?? boards[0];
  const rightBoards = activeIndex < 0 ? boards : boards.slice(activeIndex + 1);

  const startEdit = useCallback(() => {
    setInputValue(centerBoard?.name?.trim() || DEFAULT_NAME);
    setEditing(true);
  }, [centerBoard?.name]);

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
        setInputValue(centerBoard?.name?.trim() || DEFAULT_NAME);
        setEditing(false);
      }
    },
    [submitEdit, centerBoard?.name]
  );

  return (
    <div className="moodboard-tab">
      <div className="moodboard-tab-left-wrap">
        {leftBoards.map((b) => (
          <TabLabel
            key={b.id}
            board={b}
            isActive={false}
            onSelect={() => setActiveBoard(b.id)}
            onStartEdit={() => {}}
            editing={false}
            inputValue=""
            onInputChange={() => {}}
            onSubmitEdit={() => {}}
            onKeyDown={() => {}}
          />
        ))}
      </div>
      <div className="moodboard-tab-center-wrap">
        {centerBoard && (
          <TabLabel
            board={centerBoard}
            isActive
            onSelect={() => {}}
            onStartEdit={startEdit}
            editing={editing}
            inputValue={inputValue}
            onInputChange={setInputValue}
            onSubmitEdit={submitEdit}
            onKeyDown={handleKeyDown}
          />
        )}
      </div>
      <div className="moodboard-tab-right-wrap">
        {rightBoards.map((b) => (
          <TabLabel
            key={b.id}
            board={b}
            isActive={false}
            onSelect={() => setActiveBoard(b.id)}
            onStartEdit={() => {}}
            editing={false}
            inputValue=""
            onInputChange={() => {}}
            onSubmitEdit={() => {}}
            onKeyDown={() => {}}
          />
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
}
