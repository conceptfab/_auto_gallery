import React from 'react';

export interface PendingRequest {
  email: string;
  timestamp: string;
  ip: string;
}

interface PendingRequestsSectionProps {
  pending: PendingRequest[];
  processing: string | null;
  onAction: (email: string, action: 'approve' | 'reject') => void;
}

export const PendingRequestsSection: React.FC<PendingRequestsSectionProps> = ({
  pending,
  processing,
  onAction,
}) => (
  <section className="admin-section">
    <h2 className="admin-section-title">
      Oczekujące wnioski ({pending.length})
    </h2>

    {pending.length === 0 ? (
      <p className="admin-empty-msg">Brak oczekujących wniosków</p>
    ) : (
      <div className="admin-cards-grid">
        {pending.map((request) => (
          <div key={request.email} className="admin-card">
            <div style={{ marginBottom: '10px' }}>
              <strong>Email:</strong> {request.email}
            </div>
            <div
              style={{
                marginBottom: '10px',
                fontSize: '14px',
                color: '#666',
              }}
            >
              <strong>IP:</strong> {request.ip} |<strong> Data:</strong>{' '}
              {new Date(request.timestamp).toLocaleString('pl-PL')}
            </div>

            <div className="admin-card-actions">
              <button
                onClick={() => onAction(request.email, 'approve')}
                disabled={processing === request.email}
                type="button"
                className="admin-btn admin-btn--success"
              >
                {processing === request.email
                  ? 'Przetwarzanie...'
                  : 'Zatwierdź'}
              </button>

              <button
                onClick={() => onAction(request.email, 'reject')}
                disabled={processing === request.email}
                type="button"
                className="admin-btn admin-btn--danger"
              >
                {processing === request.email ? 'Przetwarzanie...' : 'Odrzuć'}
              </button>
            </div>
          </div>
        ))}
      </div>
    )}
  </section>
);
