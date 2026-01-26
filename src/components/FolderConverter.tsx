import React, { useState } from 'react';

interface ConvertProgress {
  current: number;
  total: number;
  currentFile: string;
  stage: 'scanning' | 'converting' | 'deleting' | 'complete' | 'error';
  converted: string[];
  errors: string[];
}

interface FolderConverterProps {
  folderUrl: string;
  folderName: string;
  onComplete?: () => void;
}

const FolderConverter: React.FC<FolderConverterProps> = ({ folderUrl, folderName, onComplete }) => {
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState<ConvertProgress | null>(null);
  const [deleteOriginals, setDeleteOriginals] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const startConversion = async () => {
    setShowConfirm(false);
    setIsConverting(true);
    setProgress(null);

    try {
      const response = await fetch('/api/convert-folder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          folderUrl,
          deleteOriginals
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              setProgress(data);
              
              if (data.stage === 'complete' || data.stage === 'error') {
                setIsConverting(false);
                if (onComplete) {
                  setTimeout(onComplete, 1000);
                }
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Conversion error:', error);
      setIsConverting(false);
      setProgress({
        current: 0,
        total: 0,
        currentFile: 'Conversion failed',
        stage: 'error',
        converted: [],
        errors: [`Connection error: ${error}`]
      });
    }
  };

  const handleConvertClick = () => {
    setShowConfirm(true);
  };

  const handleConfirm = () => {
    startConversion();
  };

  const handleCancel = () => {
    setShowConfirm(false);
  };

  const getProgressPercentage = () => {
    if (!progress || progress.total === 0) return 0;
    return Math.round((progress.current / progress.total) * 100);
  };

  const getStageText = (stage: string) => {
    switch (stage) {
      case 'scanning': return 'Skanowanie folderu...';
      case 'converting': return 'Konwertowanie...';
      case 'deleting': return 'Usuwanie oryginałów...';
      case 'complete': return 'Zakończono';
      case 'error': return 'Błąd';
      default: return stage;
    }
  };

  return (
    <div className="folder-converter">
      {!isConverting && !progress && (
        <div className="converter-controls">
          <div className="convert-options">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={deleteOriginals}
                onChange={(e) => setDeleteOriginals(e.target.checked)}
              />
              Usuń oryginalne pliki po konwersji
            </label>
          </div>
          <button
            className="convert-button"
            onClick={handleConvertClick}
            title={`Konwertuj folder "${folderName}" do WebP`}
          >
            <i className="las la-exchange-alt"></i>
            Konwertuj do WebP
          </button>
        </div>
      )}

      {showConfirm && (
        <div className="confirm-dialog">
          <div className="confirm-content">
            <h3>Potwierdzenie konwersji</h3>
            <p>Czy chcesz skonwertować folder <strong>{folderName}</strong> do formatu WebP?</p>
            {deleteOriginals && (
              <div className="warning">
                <i className="las la-exclamation-triangle"></i>
                <strong>Uwaga:</strong> Oryginalne pliki zostaną usunięte po konwersji!
              </div>
            )}
            <div className="confirm-buttons">
              <button className="confirm-yes" onClick={handleConfirm}>
                Tak, konwertuj
              </button>
              <button className="confirm-no" onClick={handleCancel}>
                Anuluj
              </button>
            </div>
          </div>
        </div>
      )}

      {(isConverting || progress) && (
        <div className="conversion-progress">
          <div className="progress-header">
            <h4>Konwersja folderu: {folderName}</h4>
            {progress && (
              <span className="progress-stage">
                {getStageText(progress.stage)}
              </span>
            )}
          </div>

          {progress && (
            <>
              <div className="progress-bar">
                <div 
                  className="progress-fill"
                  style={{ width: `${getProgressPercentage()}%` }}
                ></div>
                <span className="progress-text">
                  {progress.current} / {progress.total} ({getProgressPercentage()}%)
                </span>
              </div>

              <div className="current-file">
                {progress.currentFile}
              </div>

              {progress.converted.length > 0 && (
                <div className="progress-summary">
                  <div className="converted-count">
                    <i className="las la-check-circle"></i>
                    Skonwertowane: {progress.converted.length}
                  </div>
                </div>
              )}

              {progress.errors.length > 0 && (
                <div className="progress-errors">
                  <div className="error-count">
                    <i className="las la-exclamation-circle"></i>
                    Błędy: {progress.errors.length}
                  </div>
                  <details className="error-details">
                    <summary>Pokaż błędy</summary>
                    <ul>
                      {progress.errors.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </details>
                </div>
              )}

              {progress.stage === 'complete' && (
                <div className="completion-summary">
                  <div className="completion-message">
                    <i className="las la-check-circle"></i>
                    Konwersja zakończona pomyślnie!
                  </div>
                  <div className="completion-stats">
                    Skonwertowane pliki: {progress.converted.length}
                    {progress.errors.length > 0 && ` | Błędy: ${progress.errors.length}`}
                  </div>
                </div>
              )}

              {progress.stage === 'error' && (
                <div className="error-message">
                  <i className="las la-times-circle"></i>
                  Konwersja nie powiodła się
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default FolderConverter;