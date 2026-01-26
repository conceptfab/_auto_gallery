import React, { useState, useEffect } from 'react';

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

  useEffect(() => {
    const img = new Image();
    
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      
      setMetadata(prev => ({ ...prev, width, height }));
      onMetadataLoaded?.(width, height, fileSize);
    };
    
    img.onerror = () => {
      console.warn('Failed to load image metadata for:', src);
    };
    
    img.src = src;
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