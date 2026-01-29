import React from 'react';

interface LoadingOverlayProps {
  message: string;
  showProgressBar?: boolean;
  progress?: number; // 0-100
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message, showProgressBar = true, progress }) => {
  return (
    <>
      {showProgressBar && (
        <div 
          className="loading-progress-bar" 
          style={{
            width: progress !== undefined ? `${Math.max(0, Math.min(100, progress))}%` : undefined
          }}
        ></div>
      )}
      <div className="loading-overlay">
        <div className="loading-message">
          {message}
        </div>
      </div>
    </>
  );
};

export default LoadingOverlay;
