import React, { useEffect, useState } from 'react';

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

type DateRange = 'today' | 'week' | 'month' | 'all';

export const StatsOverview: React.FC = () => {
  const [data, setData] = useState<StatsOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('week');

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
        // eslint-disable-next-line no-console
        console.error('Error fetching stats:', error);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [dateRange]);

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
              <tr key={user.email}>
                <td>{user.email}</td>
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
    </div>
  );
};
