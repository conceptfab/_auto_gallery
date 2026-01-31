import React, { useEffect, useState } from 'react';
import type {
  UserStats,
  UserLogin,
  ViewEvent,
  DownloadEvent,
  DeviceInfo,
} from '../../types/stats';

interface StatsOverviewData {
  totalUsers: number;
  activeUsers: number;
  totalSessions: number;
  totalViews: number;
  totalDownloads: number;
  topUsers: Array<{
    email: string;
    sessions: number;
    views: number;
    downloads: number;
    lastActive: string;
  }>;
  recentActivity: Array<{
    email: string;
    action: string;
    target: string;
    timestamp: string;
  }>;
}

interface UserDetailsData {
  summary: UserStats;
  logins: UserLogin[];
  views: ViewEvent[];
  downloads: DownloadEvent[];
}

type DateRange = 'today' | 'week' | 'month' | 'all';

function formatDeviceInfo(deviceInfo?: DeviceInfo): string {
  if (!deviceInfo) return '-';
  const parts: string[] = [];
  if (deviceInfo.browser) {
    parts.push(
      `${deviceInfo.browser}${deviceInfo.browserVersion ? ` ${deviceInfo.browserVersion}` : ''}`,
    );
  }
  if (deviceInfo.os) {
    parts.push(
      `(${deviceInfo.os}${deviceInfo.osVersion ? ` ${deviceInfo.osVersion}` : ''}${deviceInfo.deviceType ? `, ${deviceInfo.deviceType}` : ''})`,
    );
  }
  return parts.length > 0 ? parts.join(' ') : '-';
}

export const StatsOverview: React.FC = () => {
  const [data, setData] = useState<StatsOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('week');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [userDetails, setUserDetails] = useState<UserDetailsData | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const rangeParam = dateRange === 'all' ? '' : `?range=${dateRange}`;
        const response = await fetch(`/api/admin/stats/overview${rangeParam}`);
        const result = await response.json();
        if (result.success) {
          setData(result.data);
        } else {
          setData(null);
        }
      } catch (error) {
         
        console.error('Error fetching stats:', error);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [dateRange]);

  useEffect(() => {
    if (!selectedUser) {
      setUserDetails(null);
      return;
    }

    const fetchUserDetails = async () => {
      setLoadingDetails(true);
      try {
        const response = await fetch(
          `/api/admin/stats/user-details?email=${encodeURIComponent(selectedUser)}`,
        );
        const result = await response.json();
        if (result.success) {
          setUserDetails(result.data);
        } else {
          setUserDetails(null);
        }
      } catch (error) {
         
        console.error('Error fetching user details:', error);
        setUserDetails(null);
      } finally {
        setLoadingDetails(false);
      }
    };

    fetchUserDetails();
  }, [selectedUser]);

  if (loading) {
    return <div>Ładowanie statystyk...</div>;
  }

  if (!data) {
    return <div>Brak danych statystycznych</div>;
  }

  return (
    <div className="stats-overview">
      <div className="stats-date-filter">
        {(['today', 'week', 'month', 'all'] as DateRange[]).map((range) => (
          <button
            key={range}
            type="button"
            className={dateRange === range ? 'active' : ''}
            onClick={() => setDateRange(range)}
          >
            {range === 'today' && 'Dziś'}
            {range === 'week' && 'Ostatni tydzień'}
            {range === 'month' && 'Ostatni miesiąc'}
            {range === 'all' && 'Wszystko'}
          </button>
        ))}
      </div>

      <div className="stats-cards">
        <div className="stats-card">
          <h4>Użytkownicy</h4>
          <div className="stats-value">{data.totalUsers}</div>
          <div className="stats-label">aktywnych: {data.activeUsers}</div>
        </div>
        <div className="stats-card">
          <h4>Sesje</h4>
          <div className="stats-value">{data.totalSessions}</div>
        </div>
        <div className="stats-card">
          <h4>Wyświetlenia</h4>
          <div className="stats-value">{data.totalViews}</div>
        </div>
        <div className="stats-card">
          <h4>Pobrania</h4>
          <div className="stats-value">{data.totalDownloads}</div>
        </div>
      </div>

      <div className="stats-section">
        <h3>Najaktywniejsi użytkownicy</h3>
        <table className="stats-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Sesje</th>
              <th>Wyświetlenia</th>
              <th>Pobrania</th>
              <th>Ostatnia aktywność</th>
            </tr>
          </thead>
          <tbody>
            {data.topUsers.map((user) => (
              <tr
                key={user.email}
                style={{
                  cursor: 'pointer',
                  backgroundColor:
                    selectedUser === user.email ? '#f0f0f0' : 'transparent',
                }}
                onClick={() =>
                  setSelectedUser(
                    selectedUser === user.email ? null : user.email,
                  )
                }
              >
                <td>
                  <strong>{user.email}</strong>
                  {selectedUser === user.email && (
                    <span style={{ marginLeft: '8px', fontSize: '0.72em' }}>
                      ▼
                    </span>
                  )}
                </td>
                <td>{user.sessions}</td>
                <td>{user.views}</td>
                <td>{user.downloads}</td>
                <td>
                  {user.lastActive
                    ? new Date(user.lastActive).toLocaleString('pl-PL')
                    : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="stats-section">
        <h3>Ostatnia aktywność</h3>
        <div className="activity-timeline">
          {data.recentActivity.map((activity, idx) => (
            <div key={`${activity.email}-${idx}`} className="activity-item">
              <span className="activity-time">
                {new Date(activity.timestamp).toLocaleString('pl-PL')}
              </span>
              <span className="activity-user">{activity.email}</span>
              <span className="activity-action">{activity.action}</span>
              <span className="activity-target">{activity.target}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Szczegóły użytkownika */}
      {selectedUser && (
        <div className="stats-section" style={{ marginTop: '30px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '15px',
            }}
          >
            <h3>Szczegóły użytkownika: {selectedUser}</h3>
            <button
              type="button"
              onClick={() => setSelectedUser(null)}
              style={{
                padding: '5px 10px',
                cursor: 'pointer',
                border: '1px solid #ccc',
                borderRadius: '4px',
                background: '#fff',
              }}
            >
              Zamknij
            </button>
          </div>

          {loadingDetails ? (
            <div>Ładowanie szczegółów...</div>
          ) : userDetails ? (
            <>
              {/* Podsumowanie */}
              <div style={{ marginBottom: '20px' }}>
                <h4>Podsumowanie</h4>
                <div
                  className="stats-summary-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '10px',
                    marginTop: '10px',
                  }}
                >
                  <div>
                    <strong>Logowania:</strong>{' '}
                    {userDetails.summary.totalLogins}
                  </div>
                  <div>
                    <strong>Sesje:</strong> {userDetails.summary.totalSessions}
                  </div>
                  <div>
                    <strong>Czas spędzony:</strong>{' '}
                    {Math.floor(userDetails.summary.totalTimeSpent / 60)} min
                  </div>
                  <div>
                    <strong>Obejrzane obrazy:</strong>{' '}
                    {userDetails.summary.totalImagesViewed}
                  </div>
                  <div>
                    <strong>Obejrzane foldery:</strong>{' '}
                    {userDetails.summary.totalFoldersViewed}
                  </div>
                  <div>
                    <strong>Pobrania:</strong>{' '}
                    {userDetails.summary.totalDownloads}
                  </div>
                </div>
              </div>

              {/* Logowania */}
              {userDetails.logins.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h4>Historia logowań ({userDetails.logins.length})</h4>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="stats-table">
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>IP</th>
                          <th>Przeglądarka / Urządzenie</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userDetails.logins.map((login, idx) => (
                          <tr key={idx}>
                            <td>
                              {new Date(login.timestamp).toLocaleString(
                                'pl-PL',
                              )}
                            </td>
                            <td>{login.ip || '-'}</td>
                            <td>
                              {login.userAgent ? (
                                <span title={login.userAgent}>
                                  {login.userAgent.length > 60
                                    ? `${login.userAgent.substring(0, 60)}...`
                                    : login.userAgent}
                                </span>
                              ) : (
                                '-'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Wyświetlenia */}
              {userDetails.views.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h4>Wyświetlenia ({userDetails.views.length})</h4>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="stats-table">
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Typ</th>
                          <th>Ścieżka</th>
                          <th>IP</th>
                          <th>Urządzenie</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userDetails.views.map((view) => (
                          <tr key={view.id}>
                            <td>
                              {new Date(view.timestamp).toLocaleString('pl-PL')}
                            </td>
                            <td>{view.type === 'folder' ? '📁' : '🖼️'}</td>
                            <td>
                              {view.folderName || view.imageName || view.path}
                            </td>
                            <td>{view.ip || '-'}</td>
                            <td>
                              {formatDeviceInfo(view.deviceInfo)}
                              {view.deviceInfo?.screenWidth &&
                                view.deviceInfo?.screenHeight && (
                                  <span
                                    style={{
                                      fontSize: '0.68em',
                                      color: '#666',
                                    }}
                                  >
                                    {' '}
                                    [{view.deviceInfo.screenWidth}x
                                    {view.deviceInfo.screenHeight}
                                    {view.deviceInfo.language
                                      ? `, ${view.deviceInfo.language}`
                                      : ''}
                                    ]
                                  </span>
                                )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Pobrania */}
              {userDetails.downloads.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h4>Pobrania ({userDetails.downloads.length})</h4>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="stats-table">
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Plik</th>
                          <th>Rozmiar</th>
                          <th>IP</th>
                          <th>Urządzenie</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userDetails.downloads.map((download) => (
                          <tr key={download.id}>
                            <td>
                              {new Date(download.timestamp).toLocaleString(
                                'pl-PL',
                              )}
                            </td>
                            <td>{download.fileName}</td>
                            <td>
                              {download.fileSize
                                ? `${(download.fileSize / 1024).toFixed(2)} KB`
                                : '-'}
                            </td>
                            <td>{download.ip || '-'}</td>
                            <td>
                              {formatDeviceInfo(download.deviceInfo)}
                              {download.deviceInfo?.screenWidth &&
                                download.deviceInfo?.screenHeight && (
                                  <span
                                    style={{
                                      fontSize: '0.68em',
                                      color: '#666',
                                    }}
                                  >
                                    {' '}
                                    [{download.deviceInfo.screenWidth}x
                                    {download.deviceInfo.screenHeight}
                                    {download.deviceInfo.language
                                      ? `, ${download.deviceInfo.language}`
                                      : ''}
                                    ]
                                  </span>
                                )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div>Brak szczegółów dla tego użytkownika</div>
          )}
        </div>
      )}
    </div>
  );
};
