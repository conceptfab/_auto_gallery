export interface Revision {
  id: string;
  label?: string;
  description?: string;
  embedUrl?: string;
  /** Ścieżka do pliku miniaturki (np. projectId/revisionId.webp) – preferowane */
  thumbnailPath?: string;
  /** @deprecated miniaturka w JSON – tylko do odczytu dla starych danych */
  thumbnailDataUrl?: string;
  /** @deprecated użyj thumbnailDataUrl */
  screenshotDataUrl?: string;
  /** Ścieżki do obrazów galerii (np. projectId/revisionId/uuid.webp) */
  galleryPaths?: string[];
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  revisions?: Revision[];
}
