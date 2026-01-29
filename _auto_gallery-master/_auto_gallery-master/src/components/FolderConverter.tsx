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
              <div className="progress-container">
                <div className="progress-bar">
                  <div 
                    className={`progress-fill ${progress.stage === 'error' ? 'error' : progress.stage === 'complete' ? 'complete' : ''}`}
                    style={{ 
                      width: `${getProgressPercentage()}%`,
                      transition: 'width 0.3s ease-in-out'
                    }}
                  ></div>
                  <span className="progress-text">
                    {progress.current} / {progress.total} ({getProgressPercentage()}%)
                  </span>
                </div>
                
                <div className="progress-stats">
                  <div className="stat">
                    <span className="stat-icon">📷</span>
                    <span className="stat-value">{progress.total}</span>
                    <span className="stat-label">Obrazów</span>
                  </div>
                  <div className="stat">
                    <span className="stat-icon">✅</span>
                    <span className="stat-value">{progress.converted.length}</span>
                    <span className="stat-label">Skonwertowane</span>
                  </div>
                  <div className="stat">
                    <span className="stat-icon">❌</span>
                    <span className="stat-value">{progress.errors.length}</span>
                    <span className="stat-label">Błędy</span>
                  </div>
                  <div className="stat">
                    <span className="stat-icon">⏱️</span>
                    <span className="stat-value">{Math.max(0, progress.total - progress.current)}</span>
                    <span className="stat-label">Pozostało</span>
                  </div>
                </div>
              </div>

              <div className="current-file">
                <div className="file-info">
                  <div className="file-name">
                    <span className="processing-icon">🔄</span>
                    {progress.currentFile}
                  </div>
                  {progress.stage === 'converting' && (
                    <div className="conversion-animation">
                      <span className="format from">PNG/JPG</span>
                      <span className="arrow">→</span>
                      <span className="format to">WebP</span>
                    </div>
                  )}
                </div>
              </div>

              {progress.converted.length > 0 && (
                <div className="progress-summary">
                  <div className="converted-files">
                    <h5>Ostatnio skonwertowane:</h5>
                    <div className="converted-list">
                      {progress.converted.slice(-3).map((fileName, index) => (
                        <div key={index} className="converted-item">
                          <span className="success-icon">✓</span>
                          <span className="filename">{fileName}</span>
                          <span className="format-badge">WebP</span>
                        </div>
                      ))}
                      {progress.converted.length > 3 && (
                        <div className="more-files">
                          +{progress.converted.length - 3} więcej...
                        </div>
                      )}
                    </div>
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
                  <div className="completion-animation">
                    <div className="success-checkmark">
                      <div className="check-icon">
                        <span className="icon-line line-tip"></span>
                        <span className="icon-line line-long"></span>
                        <div className="icon-circle"></div>
                        <div className="icon-fix"></div>
                      </div>
                    </div>
                  </div>
                  <div className="completion-message">
                    <h3>🎉 Konwersja zakończona!</h3>
                    <p>Wszystkie obrazy zostały pomyślnie skonwertowane do formatu WebP</p>
                  </div>
                  <div className="completion-details">
                    <div className="detail-card success">
                      <div className="card-icon">📈</div>
                      <div className="card-content">
                        <div className="card-title">Oszczędność miejsca</div>
                        <div className="card-value">~60-80%</div>
                      </div>
                    </div>
                    <div className="detail-card">
                      <div className="card-icon">✅</div>
                      <div className="card-content">
                        <div className="card-title">Skonwertowane</div>
                        <div className="card-value">{progress.converted.length}</div>
                      </div>
                    </div>
                    {progress.errors.length > 0 && (
                      <div className="detail-card error">
                        <div className="card-icon">⚠️</div>
                        <div className="card-content">
                          <div className="card-title">Błędy</div>
                          <div className="card-value">{progress.errors.length}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {progress.stage === 'error' && (
                <div className="error-summary">
                  <div className="error-animation">
                    <div className="error-icon">
                      <span className="error-x">✕</span>
                    </div>
                  </div>
                  <div className="error-message">
                    <h3>❌ Konwersja przerwana</h3>
                    <p>Wystąpił problem podczas przetwarzania plików</p>
                  </div>
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