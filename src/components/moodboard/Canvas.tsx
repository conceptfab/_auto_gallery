'use client';

import './drawing/konva-fix';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMoodboard } from '@/src/contexts/MoodboardContext';
import { MOODBOARD_MAX_IMAGE_BYTES } from '@/src/types/moodboard';
import ImageItem from './ImageItem';
import CommentItem from './CommentItem';
import SketchItem from './SketchItem';
import ContextMenu from './ContextMenu';
import GroupItem from './GroupItem';
import CommentEditPanel from './CommentEditPanel';
import GroupEditPanel from './GroupEditPanel';
import PresenceBar from './PresenceBar';

const DEFAULT_IMAGE_WIDTH = 200;
const DEFAULT_IMAGE_HEIGHT = 150;
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const ZOOM_SENSITIVITY = 0.0012;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > MOODBOARD_MAX_IMAGE_BYTES) {
      reject(new Error('Plik jest za duży (max 10 MB).'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Nie udało się odczytać pliku.'));
    reader.readAsDataURL(file);
  });
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

async function uploadMoodboardImage(
  boardId: string,
  imageId: string,
  dataUrl: string
): Promise<string> {
  const res = await fetch('/api/moodboard/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ boardId, imageId, dataUrl }),
    credentials: 'same-origin',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string })?.error || 'Upload failed');
  }
  const data = await res.json();
  return data.imagePath;
}

interface PanStart {
  pointerId: number;
  clientX: number;
  clientY: number;
  startTranslateX: number;
  startTranslateY: number;
}

export default function Canvas() {
  const {
    images,
    comments,
    groups = [],
    sketches = [],
    addImage,
    addComment,
    updateComment,
    addGroup,
    updateGroup,
    removeGroup,
    addSketch,
    setSelected,
    activeId,
    viewport,
    updateViewport,
    drawingMode,
    setDrawingMode,
    setActiveTool,
    onlineUsers,
    drawingUsers,
  } = useMoodboard();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  
  // Initialize from context if available, otherwise defaults
  const [scale, setScale] = useState(viewport?.scale ?? 1);
  const [translateX, setTranslateX] = useState(viewport?.translateX ?? 0);
  const [translateY, setTranslateY] = useState(viewport?.translateY ?? 0);
  
  const [spacePressed, setSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<PanStart | null>(null);

  // Sync state when active board changes
  const lastActiveIdRef = useRef(activeId);
  const isFirstMountRef = useRef(true);

  useEffect(() => {
    // On first mount OR when active board changes, sync from context
    if (isFirstMountRef.current || activeId !== lastActiveIdRef.current) {
      isFirstMountRef.current = false;
      lastActiveIdRef.current = activeId;
      
      if (viewport) {
        setScale(viewport.scale);
        setTranslateX(viewport.translateX);
        setTranslateY(viewport.translateY);
      } else {
        // Fallback or auto-fit if new board
        setScale(1);
        setTranslateX(0);
        setTranslateY(0);
      }
    }
  }, [activeId, viewport]);

  // Handle persistence to server (debounced via effect)
  const lastSyncedRef = useRef({ scale, translateX, translateY });
  useEffect(() => {
    const timer = setTimeout(() => {
      // Only update if it actually changed from current context value AND it's different from what we last synced
      if (
        (scale !== viewport?.scale ||
        translateX !== viewport?.translateX ||
        translateY !== viewport?.translateY) &&
        (scale !== lastSyncedRef.current.scale ||
        translateX !== lastSyncedRef.current.translateX ||
        translateY !== lastSyncedRef.current.translateY)
      ) {
        lastSyncedRef.current = { scale, translateX, translateY };
        updateViewport({ scale, translateX, translateY });
      }
    }, 1500); // 1.5s local debounce
    return () => clearTimeout(timer);
  }, [scale, translateX, translateY, updateViewport, viewport]);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; contentX: number; contentY: number } | null>(null);
  const [editingComment, setEditingComment] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [editingGroup, setEditingGroup] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);

  const drawingModeRef = useRef(drawingMode);
  drawingModeRef.current = drawingMode;

  // Shift selection state
  const [shiftPressed, setShiftPressed] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const selectionStartRef = useRef<{ clientX: number; clientY: number; contentX: number; contentY: number } | null>(null);

  useEffect(() => {
    const isEditable = (el: EventTarget | null) => {
      if (!el || !(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return true;
      return (el as HTMLElement).isContentEditable;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isEditable(e.target)) {
        e.preventDefault();
        setSpacePressed(true);
      }
      if (e.key === 'Shift') {
        setShiftPressed(true);
      }
      // Drawing shortcuts
      if (!isEditable(e.target)) {
        if (e.key === 'd' || e.key === 'D') setDrawingMode(!drawingModeRef.current);
        if (e.key === 'Escape') setDrawingMode(false);
        if (e.key === 'p' || e.key === 'P') setActiveTool('pen');
        if (e.key === 'r') setActiveTool('rect');
        if (e.key === 'c') setActiveTool('circle');
        if (e.key === 'l' || e.key === 'L') setActiveTool('line');
        if (e.key === 'e') setActiveTool('eraser');
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isEditable(e.target)) {
        e.preventDefault();
        setSpacePressed(false);
        if (panStartRef.current) {
          setIsPanning(false);
          panStartRef.current = null;
        }
      }
      if (e.key === 'Shift') {
        setShiftPressed(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [setActiveTool, setDrawingMode]);

  const transformRef = useRef({ scale: 1, translateX: 0, translateY: 0 });
  transformRef.current = { scale, translateX, translateY };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Zoom działa przez Ctrl+scroll LUB zwykły scroll gdy kursor jest na pustym obszarze
      const target = e.target as HTMLElement;
      const isOnItem = target.closest('.moodboard-image-item') || target.closest('.moodboard-comment-item') || target.closest('.moodboard-sketch-item');

      if (!e.ctrlKey && isOnItem) return; // Na elemencie bez Ctrl - nie zoomuj

      e.preventDefault();
      const { scale: s, translateX: tx, translateY: ty } = transformRef.current;
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const contentX = (mouseX - tx) / s;
      const contentY = (mouseY - ty) / s;
      const factor = 1 - e.deltaY * ZOOM_SENSITIVITY;
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * factor));
      setTranslateX(mouseX - contentX * newScale);
      setTranslateY(mouseY - contentY * newScale);
      setScale(newScale);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const clientToContent = useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current;
      if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      return {
        x: (clientX - rect.left - translateX) / scale,
        y: (clientY - rect.top - translateY) / scale,
      };
    },
    [scale, translateX, translateY]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
      setDropError(null);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      setDropError(null);
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith('image/')
      );
      if (files.length === 0) {
        setDropError('Przeciągnij tylko pliki obrazków (PNG, JPG, itp.).');
        return;
      }
      const { x, y } = clientToContent(e.clientX, e.clientY);
      let offsetX = 0;
      let offsetY = 0;
      for (const file of files) {
        try {
          const dataUrl = await fileToDataUrl(file);
          const imageId = generateId();
          const imagePath = await uploadMoodboardImage(activeId, imageId, dataUrl);
          addImage({
            imagePath,
            x: x + offsetX,
            y: y + offsetY,
            width: DEFAULT_IMAGE_WIDTH,
            height: DEFAULT_IMAGE_HEIGHT,
          });
          offsetX += 20;
          offsetY += 20;
        } catch (err) {
          setDropError(
            err instanceof Error ? err.message : 'Błąd wczytywania pliku.'
          );
        }
      }
    },
    [addImage, clientToContent, activeId]
  );

  const handleFitToView = useCallback(() => {
    if (!containerRef.current || (images.length === 0 && comments.length === 0 && groups.length === 0 && sketches.length === 0)) {
      setScale(1);
      setTranslateX(0);
      setTranslateY(0);
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    images.forEach((img) => {
      minX = Math.min(minX, img.x);
      minY = Math.min(minY, img.y);
      maxX = Math.max(maxX, img.x + img.width);
      maxY = Math.max(maxY, img.y + img.height);
    });

    comments.forEach((c) => {
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x + c.width);
      maxY = Math.max(maxY, c.y + c.height);
    });

    groups.forEach((g) => {
      minX = Math.min(minX, g.x);
      minY = Math.min(minY, g.y - (g.labelSize || 14) - 10);
      maxX = Math.max(maxX, g.x + g.width);
      maxY = Math.max(maxY, g.y + g.height);
    });

    sketches.forEach((sk) => {
      minX = Math.min(minX, sk.x);
      minY = Math.min(minY, sk.y);
      maxX = Math.max(maxX, sk.x + sk.width);
      maxY = Math.max(maxY, sk.y + sk.height);
    });

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    if (contentWidth <= 0 || contentHeight <= 0 || minX === Infinity) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const padding = 60;
    const availableWidth = containerRect.width - padding * 2;
    const availableHeight = containerRect.height - padding * 2;

    let newScale = Math.min(
      availableWidth / contentWidth,
      availableHeight / contentHeight
    );
    newScale = Math.min(1.5, Math.max(MIN_SCALE, newScale));

    const offsetX = (containerRect.width - contentWidth * newScale) / 2;
    const offsetY = (containerRect.height - contentHeight * newScale) / 2;

    setTranslateX(offsetX - minX * newScale);
    setTranslateY(offsetY - minY * newScale);
    setScale(newScale);
  }, [images, comments, groups, sketches]);

  const isEmptyArea = useCallback((el: EventTarget | null) => {
    const node = el as HTMLElement;
    if (!node?.closest) return true;
    return (
      !node.closest('.moodboard-image-item') &&
      !node.closest('.moodboard-comment-item') &&
      !node.closest('.moodboard-group-item') &&
      !node.closest('.moodboard-sketch-item') &&
      !node.closest('.moodboard-comment-edit-panel') &&
      !node.closest('.moodboard-group-edit-panel') &&
      !node.closest('.moodboard-canvas-bottom-controls')
    );
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Close menus on any click
      setContextMenu(null);
      setEditingComment(null);
      setEditingGroup(null);

      // Shift + left click on empty area = selection box
      if (e.button === 0 && e.shiftKey && isEmptyArea(e.target)) {
        e.preventDefault();
        setSelected(null, null);
        const content = clientToContent(e.clientX, e.clientY);
        selectionStartRef.current = {
          clientX: e.clientX,
          clientY: e.clientY,
          contentX: content.x,
          contentY: content.y,
        };
        setSelectionBox({
          startX: content.x,
          startY: content.y,
          endX: content.x,
          endY: content.y,
        });
        containerRef.current?.setPointerCapture(e.pointerId);
        return;
      }

      // Left click on empty area = pan (blocked in drawingMode unless Space is held)
      if (e.button === 0 && isEmptyArea(e.target)) {
        if (drawingMode && !spacePressed) {
          e.preventDefault();
          setSelected(null, null);
          return;
        }
        e.preventDefault();
        setSelected(null, null);
        const el = containerRef.current;
        if (el) {
          el.setPointerCapture(e.pointerId);
          setIsPanning(true);
          panStartRef.current = {
            pointerId: e.pointerId,
            clientX: e.clientX,
            clientY: e.clientY,
            startTranslateX: translateX,
            startTranslateY: translateY,
          };
        }
        return;
      }
    },
    [translateX, translateY, setSelected, isEmptyArea, clientToContent, drawingMode, spacePressed]
  );

  // Handle context menu (right-click)
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const target = e.target as HTMLElement;
      const commentItem = target.closest('.moodboard-comment-item');
      const groupItem = target.closest('.moodboard-group-item');
      
      const content = clientToContent(e.clientX, e.clientY);

      if (commentItem) {
        e.preventDefault();
        return;
      }

      if (groupItem) {
        // Find group ID. GroupItem doesn't have data-id yet, but let's assume we'll add it or find it.
        // Actually, let's check GroupItem.tsx, it might need data-id.
        // For now, let's use the first group that contains the target (hacky but works if nested)
        // Better: let's add data-id to GroupItem.tsx as well.
        const id = (groupItem as HTMLElement).getAttribute('data-id');
        if (id) {
          setSelected(id, 'group');
          setEditingGroup({
            id,
            x: e.clientX,
            y: e.clientY,
          });
          setEditingComment(null);
          setContextMenu(null);
          return;
        }
      }

      setEditingComment(null);
      setEditingGroup(null);
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        contentX: content.x,
        contentY: content.y,
      });
    },
    [clientToContent, setSelected]
  );

  // Handle adding comment from context menu
  const handleAddCommentFromMenu = useCallback(() => {
    if (!contextMenu) return;
    addComment({
      text: '',
      color: 'yellow',
      font: 'sans',
      fontWeight: 'normal',
      x: contextMenu.contentX,
      y: contextMenu.contentY,
      width: 200,
      height: 120,
    });
  }, [contextMenu, addComment]);

  const handleAddSketchFromMenu = useCallback(() => {
    if (!contextMenu) return;
    const nextNum = sketches.length + 1;
    addSketch({
      name: `Szkic ${nextNum}`,
      x: contextMenu.contentX,
      y: contextMenu.contentY,
      width: 400,
      height: 300,
      backgroundColor: '#ffffff',
      drawing: { strokes: [], shapes: [] },
    });
  }, [contextMenu, addSketch, sketches.length]);

  const handleOpenCommentEdit = useCallback((id: string, pos: { x: number; y: number }) => {
    setSelected(id, 'comment');
    setEditingComment({ id, x: pos.x, y: pos.y });
    setEditingGroup(null);
    setContextMenu(null);
  }, [setSelected]);

  const handleOpenGroupEdit = useCallback((groupId: string, pos: { x: number; y: number }) => {
    setSelected(groupId, 'group');
    setEditingGroup({ id: groupId, x: pos.x, y: pos.y });
    setEditingComment(null);
    setContextMenu(null);
  }, [setSelected]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isPanning || !panStartRef.current) return;

    const onMove = (e: PointerEvent) => {
      const start = panStartRef.current;
      if (!start || e.pointerId !== start.pointerId) return;
      e.preventDefault();
      setTranslateX(start.startTranslateX + (e.clientX - start.clientX));
      setTranslateY(start.startTranslateY + (e.clientY - start.clientY));
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== panStartRef.current?.pointerId) return;
      e.preventDefault();
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      setIsPanning(false);
      panStartRef.current = null;
    };

    el.addEventListener('pointermove', onMove, { capture: true });
    el.addEventListener('pointerup', onUp, { capture: true });
    el.addEventListener('pointercancel', onUp, { capture: true });
    return () => {
      el.removeEventListener('pointermove', onMove, { capture: true });
      el.removeEventListener('pointerup', onUp, { capture: true });
      el.removeEventListener('pointercancel', onUp, { capture: true });
    };
  }, [isPanning]);

  // Track selection box while shift-dragging
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !selectionBox || !selectionStartRef.current) return;

    const onMove = (e: PointerEvent) => {
      const content = clientToContent(e.clientX, e.clientY);
      setSelectionBox((prev) =>
        prev ? { ...prev, endX: content.x, endY: content.y } : null
      );
    };

    const onUp = () => {
      if (selectionBox && selectionStartRef.current) {
        const x1 = Math.min(selectionBox.startX, selectionBox.endX);
        const y1 = Math.min(selectionBox.startY, selectionBox.endY);
        const x2 = Math.max(selectionBox.startX, selectionBox.endX);
        const y2 = Math.max(selectionBox.startY, selectionBox.endY);
        
        const width = x2 - x1;
        const height = y2 - y1;

        // Only create group if selection box is large enough
        if (width > 10 && height > 10) {
          const selectedMemberIds: string[] = [];

          // Find images inside selection
          images.forEach(img => {
            if (img.x >= x1 && img.x + img.width <= x2 && 
                img.y >= y1 && img.y + img.height <= y2) {
              selectedMemberIds.push(img.id);
            }
          });

          // Find comments inside selection
          comments.forEach(c => {
            if (c.x >= x1 && c.x + c.width <= x2 &&
                c.y >= y1 && c.y + c.height <= y2) {
              selectedMemberIds.push(c.id);
            }
          });

          // Find sketches inside selection
          sketches.forEach(sk => {
            if (sk.x >= x1 && sk.x + sk.width <= x2 &&
                sk.y >= y1 && sk.y + sk.height <= y2) {
              selectedMemberIds.push(sk.id);
            }
          });

          if (selectedMemberIds.length > 0) {
            addGroup({
              name: `Grupa ${groups.length + 1}`,
              x: x1,
              y: y1,
              width,
              height,
              memberIds: selectedMemberIds,
            });
          }
        }
      }
      
      setSelectionBox(null);
      selectionStartRef.current = null;
    };

    el.addEventListener('pointermove', onMove, { capture: true });
    el.addEventListener('pointerup', onUp, { capture: true });
    el.addEventListener('pointercancel', onUp, { capture: true });
    return () => {
      el.removeEventListener('pointermove', onMove, { capture: true });
      el.removeEventListener('pointerup', onUp, { capture: true });
      el.removeEventListener('pointercancel', onUp, { capture: true });
    };
  }, [selectionBox, clientToContent, images, comments, sketches, addGroup, groups.length]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    // Clear selection box
    if (selectionBox) {
      setSelectionBox(null);
      selectionStartRef.current = null;
    }
    if (e.button === 0 && panStartRef.current?.pointerId === e.pointerId) {
      try {
        containerRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      setIsPanning(false);
      panStartRef.current = null;
    }
  }, [selectionBox]);

  const allMemberIds = React.useMemo(() => {
    const set = new Set<string>();
    groups.forEach(g => g.memberIds.forEach(id => set.add(id)));
    return set;
  }, [groups]);

  const standaloneImages = React.useMemo(() => 
    images.filter(img => !allMemberIds.has(img.id)),
    [images, allMemberIds]
  );

  const standaloneComments = React.useMemo(() =>
    comments.filter(c => !allMemberIds.has(c.id)),
    [comments, allMemberIds]
  );

  const standaloneSketches = React.useMemo(() =>
    sketches.filter(sk => !allMemberIds.has(sk.id)),
    [sketches, allMemberIds]
  );

  return (
    <div
      ref={containerRef}
      className={`moodboard-canvas ${
        isDragOver ? 'moodboard-canvas--drag-over' : ''
      } ${spacePressed ? 'moodboard-canvas--space' : ''} ${
        isPanning ? 'moodboard-canvas--panning' : ''
      } ${shiftPressed ? 'moodboard-canvas--shift' : ''}${
        drawingMode ? ' moodboard-canvas--drawing' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={handleContextMenu}
    >
      <div
        className="moodboard-canvas-inner"
        style={{
          transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
          transformOrigin: '0 0',
        }}
      >
        {dropError && (
          <div className="moodboard-drop-error" role="alert">
            {dropError}
          </div>
        )}
        {standaloneImages.map((img) => (
          <ImageItem key={img.id} image={img} />
        ))}
        {standaloneComments.map((c) => (
          <CommentItem key={c.id} comment={c} onOpenEditMenu={handleOpenCommentEdit} />
        ))}
        {standaloneSketches.map((sk) => (
          <SketchItem key={sk.id} sketch={sk} />
        ))}
        {groups.map((g) => {
          const groupImages = images.filter((img) => g.memberIds.includes(img.id));
          const groupComments = comments.filter((c) => g.memberIds.includes(c.id));
          const groupSketches = sketches.filter((sk) => g.memberIds.includes(sk.id));

          return (
            <GroupItem
              key={g.id}
              group={g}
              onOpenEditMenu={(pos) => handleOpenGroupEdit(g.id, pos)}
            >
              {groupImages.map((img) => (
                <ImageItem
                  key={img.id}
                  image={img}
                  parentX={g.x}
                  parentY={g.y}
                />
              ))}
              {groupComments.map((c) => (
                <CommentItem
                  key={c.id}
                  comment={c}
                  parentX={g.x}
                  parentY={g.y}
                  onOpenEditMenu={handleOpenCommentEdit}
                />
              ))}
              {groupSketches.map((sk) => (
                <SketchItem
                  key={sk.id}
                  sketch={sk}
                  parentX={g.x}
                  parentY={g.y}
                />
              ))}
            </GroupItem>
          );
        })}
      </div>
      <PresenceBar onlineUsers={onlineUsers} drawingUsers={drawingUsers} />
      {/* Zoom na środku, pomoc po prawej stronie ekranu */}
      <div className="moodboard-canvas-bottom-controls" onPointerDown={(e) => e.stopPropagation()}>
        <div className="moodboard-canvas-bottom-controls__spacer" aria-hidden="true" />
        <div className="moodboard-canvas-zoom-controls">
          <button
            type="button"
            className="moodboard-zoom-btn"
            onClick={() => setScale((s) => Math.min(MAX_SCALE, s * 1.25))}
            title="Powiększ (Ctrl + scroll up)"
          >
            +
          </button>
          <span className="moodboard-zoom-level">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            className="moodboard-zoom-btn"
            onClick={() => setScale((s) => Math.max(MIN_SCALE, s / 1.25))}
            title="Pomniejsz (Ctrl + scroll down)"
          >
            −
          </button>
          <button
            type="button"
            className="moodboard-zoom-btn moodboard-zoom-btn--reset"
            onClick={() => {
              setScale(1);
              setTranslateX(0);
              setTranslateY(0);
            }}
            title="Resetuj widok (100%)"
          >
            ⌂
          </button>
          <button
            type="button"
            className="moodboard-zoom-btn moodboard-zoom-btn--fit"
            onClick={handleFitToView}
            title="Pokaż wszystko"
          >
            ⛶
          </button>
        </div>
        <div className="moodboard-canvas-bottom-controls__right">
          <div
            className="moodboard-help-wrapper"
            aria-label="Pomoc"
          >
            <div className="moodboard-help-panel">
              <div className="moodboard-help-panel-title">Funkcje moodboardu</div>
              <ul className="moodboard-help-list">
                <li><strong>Obrazki:</strong> przeciągnij pliki na kanwę; kliknij — zaznaczenie, przesuwanie, 8 uchwytów do zmiany rozmiaru; przycisk × usuwa; „Rysuj” (D) — adnotacje na obrazku.</li>
                <li><strong>Komentarze:</strong> prawy przycisk na pustym miejscu → „Dodaj komentarz”; kliknij — edycja tekstu. Kolor, czcionka, rozmiar tylko przez ikonę ołówka (po zaznaczeniu); kosz usuwa.</li>
                <li><strong>Szkice:</strong> prawy przycisk → „Dodaj szkic”; kliknij — pasek rysowania (D), narzędzia, kolory; prawy przycisk na etykiecie — zmiana nazwy, usunięcie.</li>
                <li><strong>Grupy:</strong> Shift + przeciągnij zaznaczenie na pustym obszarze obejmujące elementy. Prawy przycisk na grupie lub ikona ołówka po zaznaczeniu — menu (nazwa, kolory, rozgrupuj, dodaj komentarz); kosz — usuwa grupę.</li>
                <li><strong>Widok:</strong> lewy przycisk na pustym miejscu — przesuwanie kanwy; Ctrl + scroll — zoom; przyciski +/−, ⌂ (reset), ⛶ (pokaż wszystko).</li>
              </ul>
            </div>
            <button
              type="button"
              className="moodboard-help-btn"
              title="Pomoc — funkcje moodboardu"
              aria-label="Pomoc"
            >
              ?
            </button>
          </div>
        </div>
      </div>
      {/* Selection box for Shift+drag */}
      {selectionBox && (
        <div
          className="moodboard-selection-box"
          style={{
            left: Math.min(selectionBox.startX, selectionBox.endX) * scale + translateX,
            top: Math.min(selectionBox.startY, selectionBox.endY) * scale + translateY,
            width: Math.abs(selectionBox.endX - selectionBox.startX) * scale,
            height: Math.abs(selectionBox.endY - selectionBox.startY) * scale,
          }}
        />
      )}
      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onAddComment={handleAddCommentFromMenu}
          onAddSketch={handleAddSketchFromMenu}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Inline Edit Panel for Comments (Triggered by right-click) */}
      {editingComment && (
        (() => {
          const comment = comments.find(c => c.id === editingComment.id);
          if (!comment) return null;
          
          return (
            <CommentEditPanel
              color={comment.color}
              bgColor={comment.bgColor || '#fef08a'}
              fontColor={comment.fontColor || '#000000'}
              fontSize={comment.fontSize || 16}
              fontWeight={comment.fontWeight || 'normal'}
              onColorChange={(c) => updateComment(comment.id, { color: c })}
              onBgColorChange={(c) => updateComment(comment.id, { bgColor: c })}
              onFontColorChange={(c) => updateComment(comment.id, { fontColor: c })}
              onFontSizeChange={(s) => updateComment(comment.id, { fontSize: s })}
              onFontWeightChange={(w) => updateComment(comment.id, { fontWeight: w })}
              position={{ x: editingComment.x, y: editingComment.y }}
            />
          );
        })()
      )}

      {/* Inline Edit Panel for Groups (Triggered by right-click) */}
      {editingGroup && (
        (() => {
          const group = groups.find(g => g.id === editingGroup.id);
          if (!group) return null;
          
          const handleUngroup = () => {
            if (!window.confirm('Czy na pewno chcesz rozgrupować tę grupę?')) return;
            removeGroup(group.id);
            setEditingGroup(null);
          };

          const handleAddCommentToGroup = () => {
            const commentId = generateId();
            addComment({
              id: commentId,
              text: '',
              color: 'yellow',
              font: 'sans',
              fontWeight: 'normal',
              x: group.x + 20,
              y: group.y + 40,
              width: 150,
              height: 100,
            });
            
            updateGroup(group.id, {
              memberIds: [...group.memberIds, commentId]
            });
            setEditingGroup(null);
          };

          return (
            <GroupEditPanel
              name={group.name}
              color={group.color}
              labelSize={group.labelSize}
              labelColor={group.labelColor}
              onNameChange={(name) => updateGroup(group.id, { name })}
              onColorChange={(color) => updateGroup(group.id, { color })}
              onLabelSizeChange={(size) => updateGroup(group.id, { labelSize: size })}
              onLabelColorChange={(color) => updateGroup(group.id, { labelColor: color })}
              onUngroup={handleUngroup}
              onAddComment={handleAddCommentToGroup}
              position={{ x: editingGroup.x, y: editingGroup.y }}
            />
          );
        })()
      )}
    </div>
  );
}

