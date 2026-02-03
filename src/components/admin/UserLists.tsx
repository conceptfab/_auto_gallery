import React from 'react';

export interface UserListsProps {
  whitelist: string[];
  blacklist: string[];
  newWhitelistEmail: string;
  newBlacklistEmail: string;
  processing: string | null;
  expandedSections: Set<string>;
  onToggleSection: (sectionId: string) => void;
  onWhitelistEmailChange: (value: string) => void;
  onBlacklistEmailChange: (value: string) => void;
  onAddToList: (email: string, listType: 'whitelist' | 'blacklist') => void;
  onRemoveFromList: (
    email: string,
    listType: 'whitelist' | 'blacklist'
  ) => void;
}

const SECTION_WHITELIST = 'whitelist';
const SECTION_BLACKLIST = 'blacklist';

export const UserLists: React.FC<UserListsProps> = ({
  whitelist,
  blacklist,
  newWhitelistEmail,
  newBlacklistEmail,
  processing,
  expandedSections,
  onToggleSection,
  onWhitelistEmailChange,
  onBlacklistEmailChange,
  onAddToList,
  onRemoveFromList,
}) => {
  return (
    <>
      {/* Biała lista */}
      <section className="admin-section">
        <h2
          className="admin-section-title admin-section-title--success admin-section-title-clickable"
          onClick={() => onToggleSection(SECTION_WHITELIST)}
        >
          <span>Biała lista ({whitelist.length})</span>
          <i
            className={`las la-angle-up admin-section-toggle ${
              expandedSections.has(SECTION_WHITELIST) ? '' : 'collapsed'
            }`}
          />
        </h2>

        {expandedSections.has(SECTION_WHITELIST) && (
          <>
            <div className="admin-form-box" style={{ marginBottom: '16px' }}>
              <div
                style={{
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'center',
                }}
              >
                <input
                  type="email"
                  placeholder="Dodaj email do białej listy"
                  value={newWhitelistEmail}
                  onChange={(e) => onWhitelistEmailChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onAddToList(newWhitelistEmail, 'whitelist');
                    }
                  }}
                  className="admin-input"
                  style={{ flex: 1 }}
                />
                <button
                  onClick={() => onAddToList(newWhitelistEmail, 'whitelist')}
                  disabled={
                    processing?.startsWith('add-whitelist-') ||
                    !newWhitelistEmail.trim()
                  }
                  type="button"
                  className="admin-btn admin-btn--success"
                >
                  Dodaj
                </button>
              </div>
            </div>

            {whitelist.length === 0 ? (
              <p className="admin-empty-msg">Brak emaili na białej liście</p>
            ) : (
              <div className="admin-list-grid">
                {whitelist.map((email) => (
                  <div
                    key={email}
                    className="admin-list-item admin-list-item--success"
                  >
                    <span>{email}</span>
                    <button
                      onClick={() => onRemoveFromList(email, 'whitelist')}
                      disabled={processing === email}
                      type="button"
                      className="admin-btn admin-btn--danger-sm"
                    >
                      Usuń
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* Czarna lista */}
      <section className="admin-section">
        <h2
          className="admin-section-title admin-section-title-clickable"
          onClick={() => onToggleSection(SECTION_BLACKLIST)}
        >
          <span>Czarna lista ({blacklist.length})</span>
          <i
            className={`las la-angle-up admin-section-toggle ${
              expandedSections.has(SECTION_BLACKLIST) ? '' : 'collapsed'
            }`}
          />
        </h2>

        {expandedSections.has(SECTION_BLACKLIST) && (
          <>
            <div className="admin-form-box" style={{ marginBottom: '16px' }}>
              <div
                style={{
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'center',
                }}
              >
                <input
                  type="email"
                  placeholder="Dodaj email do czarnej listy"
                  value={newBlacklistEmail}
                  onChange={(e) => onBlacklistEmailChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onAddToList(newBlacklistEmail, 'blacklist');
                    }
                  }}
                  className="admin-input"
                  style={{ flex: 1 }}
                />
                <button
                  onClick={() => onAddToList(newBlacklistEmail, 'blacklist')}
                  disabled={
                    processing?.startsWith('add-blacklist-') ||
                    !newBlacklistEmail.trim()
                  }
                  type="button"
                  className="admin-btn admin-btn--danger"
                >
                  Dodaj
                </button>
              </div>
            </div>

            {blacklist.length === 0 ? (
              <p className="admin-empty-msg">Brak emaili na czarnej liście</p>
            ) : (
              <div className="admin-list-grid">
                {blacklist.map((email) => (
                  <div
                    key={email}
                    className="admin-list-item admin-list-item--danger"
                  >
                    <span>{email}</span>
                    <button
                      onClick={() => onRemoveFromList(email, 'blacklist')}
                      disabled={processing === email}
                      type="button"
                      className="admin-btn admin-btn--danger-sm"
                    >
                      Usuń
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
};
