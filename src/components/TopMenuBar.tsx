import React from 'react';

interface TopMenuBarProps {
  onRefresh?: () => void;
}

const TopMenuBar: React.FC<TopMenuBarProps> = ({ onRefresh }) => {
  return (
    <nav className="top-menu-bar">
      <div className="menu-container">
        <div className="menu-left">
          <div className="logo">
            <h1>CONCEPTFAB AutoGallery</h1>
          </div>
        </div>
        
        <div className="menu-center">
        </div>
        
        <div className="menu-right">
          {onRefresh && (
            <button onClick={onRefresh} className="refresh-button">
              Odśwież
            </button>
          )}
        </div>
      </div>
    </nav>
  );
};

export default TopMenuBar;