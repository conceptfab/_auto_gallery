'use client';

import React, { useEffect, createContext, useContext } from 'react';
import {
  initThumbnailCache,
  clearThumbnailCache,
} from '@/src/utils/imageUtils';

const ThumbnailCacheContext = createContext<boolean>(false);

/**
 * Provider inicjuje cache miniaturek przy mount i czyści przy unmount (PERF-003, PERF-009).
 */
export function ThumbnailCacheProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    initThumbnailCache();
    return () => clearThumbnailCache();
  }, []);

  return (
    <ThumbnailCacheContext.Provider value={true}>
      {children}
    </ThumbnailCacheContext.Provider>
  );
}

export function useThumbnailCacheReady(): boolean {
  return useContext(ThumbnailCacheContext);
}
