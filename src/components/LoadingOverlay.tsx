import React from 'react';

interface LoadingOverlayProps {
  message: string;
  showProgressBar?: boolean;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message, showProgressBar = true }) => {
  return (
    <>
      {showProgressBar && <div className="loading-progress-bar"></div>}
      <div className="loading-overlay">
        <div className="loading-message">
          {message}
        </div>
      </div>
    </>
  );
};

export default LoadingOverlay;
