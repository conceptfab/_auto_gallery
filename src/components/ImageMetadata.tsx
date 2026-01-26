import React, { useState, useEffect } from 'react';
import { logger } from '../utils/logger';

interface ImageMetadataProps {
  src: string;
  fileSize?: number;
  lastModified?: string;
  onMetadataLoaded?: (width: number, height: number, fileSize?: number) => void;
}

const ImageMetadata: React.FC<ImageMetadataProps> = ({ src, fileSize, lastModified, onMetadataLoaded }) => {
  const [metadata, setMetadata] = useState<{
    width?: number;
    height?: number;
    fileSize?: number;
  }>({ fileSize });
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    // Jeśli nie ma src lub jest to URL file-proxy.php, pomiń ładowanie metadanych
    if (!src || src.includes('file-proxy.php')) {
      return;
    }

    const img = new Image();
    let isMounted = true;
    
    img.onload = () => {
      if (!isMounted) return;
      
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      
      // Sprawdź czy obraz faktycznie się załadował (nie jest 0x0)
      if (width > 0 && height > 0) {
        setMetadata(prev => ({ ...prev, width, height }));
        onMetadataLoaded?.(width, height, fileSize);
        setLoadError(false);
      }
    };
    
    img.onerror = () => {
      if (!isMounted) return;
      setLoadError(true);
      logger.debug('Failed to load image metadata', { src: src.substring(0, 100) });
    };
    
    // Ustaw timeout - jeśli obraz nie załaduje się w 5 sekund, przerwij
    const timeout = setTimeout(() => {
      if (!isMounted) return;
      setLoadError(true);
      logger.debug('Image metadata load timeout', { src: src.substring(0, 100) });
    }, 5000);
    
    img.src = src;
    
    return () => {
      isMounted = false;
      clearTimeout(timeout);
      img.onload = null;
      img.onerror = null;
      img.src = '';
    };
  }, [src, fileSize, onMetadataLoaded]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatResolution = (width?: number, height?: number): string => {
    if (!width || !height) return '';
    return `${width}×${height}`;
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('pl-PL', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    } catch (error) {
      return '';
    }
  };

  if (!metadata.width && !metadata.height && !metadata.fileSize && !lastModified) {
    return null;
  }

  return (
    <span className="image-metadata">
      {metadata.width && metadata.height && (
        <span className="resolution">{formatResolution(metadata.width, metadata.height)}</span>
      )}
      {metadata.fileSize && (
        <span className="file-size">{formatFileSize(metadata.fileSize)}</span>
      )}
      {lastModified && (
        <span className="last-modified">{formatDate(lastModified)}</span>
      )}
    </span>
  );
};

export default ImageMetadata;