import React, { useState, useEffect } from 'react';

interface CacheProgressProps {
  onComplete: () => void;
}

interface ProgressData {
  current: number;
  total: number;
  currentFile: string;
  stage: 'fetching' | 'converting' | 'complete';
  error?: string;
}

const CacheProgress: React.FC<CacheProgressProps> = ({ onComplete }) => {
  const [progress, setProgress] = useState<ProgressData>({
    current: 0,
    total: 0,
    currentFile: '',
    stage: 'fetching'
  });
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    startCacheProcess();
  }, []);

  const startCacheProcess = async () => {
    try {
      const response = await fetch('/api/cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'start' }),
      });

      if (!response.body) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              setProgress(data);
              
              if (data.stage === 'complete') {
                setTimeout(() => {
                  setIsVisible(false);
                  setTimeout(onComplete, 500);
                }, 1000);
              }
            } catch (e) {
              console.error('Error parsing progress data:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Cache process error:', error);
      setProgress(prev => ({ ...prev, error: 'Błąd procesu cache' }));
    }
  };

  const getStageText = (stage: string) => {
    switch (stage) {
      case 'fetching': return 'Pobieranie obrazów...';
      case 'converting': return 'Konwersja do WebP...';
      case 'complete': return 'Zakończono!';
      default: return 'Przetwarzanie...';
    }
  };

  const progressPercent = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  if (!isVisible) return null;

  return (
    <div className="cache-progress-overlay">
      <div className="cache-progress-modal">
        <div className="cache-progress-header">
          <h3>Optymalizacja galerii</h3>
          <p>Aktualizowanie cache obrazów WebP...</p>
        </div>
        
        <div className="cache-progress-content">
          <div className="progress-info">
            <span className="stage-text">{getStageText(progress.stage)}</span>
            <span className="progress-counter">
              {progress.current} / {progress.total}
            </span>
          </div>
          
          <div className="progress-bar-container">
            <div 
              className="progress-bar-fill" 
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          
          {progress.currentFile && progress.stage !== 'complete' && (
            <div className="current-file">
              <span>Przetwarzanie: </span>
              <span className="filename">{progress.currentFile}</span>
            </div>
          )}
          
          {progress.error && (
            <div className="error-message">
              {progress.error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CacheProgress;