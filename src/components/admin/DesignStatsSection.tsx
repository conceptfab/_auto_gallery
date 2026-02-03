import React, { useEffect, useState } from 'react';

interface DesignStatsData {
  totalListViews: number;
  totalProjectViews: number;
  totalRevisionViews: number;
  topProjects: Array<{
    projectId: string;
    projectName: string;
    views: number;
  }>;
  topRevisions: Array<{
    projectId: string;
    revisionId: string;
    projectName: string;
    revisionLabel: string;
    views: number;
  }>;
  recentDesignActivity: Array<{
    email: string;
    action: string;
    target: string;
    timestamp: string;
  }>;
}

type DateRange = 'today' | 'week' | 'month' | 'all';

export const DesignStatsSection: React.FC = () => {
  const [data, setData] = useState<DesignStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('week');

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const rangeParam = dateRange === 'all' ? '' : `?range=${dateRange}`;
        const response = await fetch(
          `/api/admin/stats/design-overview${rangeParam}`
        );
        const result = await response.json();
        if (result.success) {
          setData(result.data);
        } else {
          setData(null);
        }
      } catch (error) {
        console.error('Error fetching design stats:', error);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [dateRange]);

  if (loading) {
    return <div>Ładowanie statystyk Design...</div>;
  }

  if (!data) {
    return <div>Brak danych statystyk Design</div>;
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
          <h4>Wyświetlenia listy Design</h4>
          <div className="stats-value">{data.totalListViews}</div>
        </div>
        <div className="stats-card">
          <h4>Wyświetlenia projektów</h4>
          <div className="stats-value">{data.totalProjectViews}</div>
        </div>
        <div className="stats-card">
          <h4>Wyświetlenia rewizji</h4>
          <div className="stats-value">{data.totalRevisionViews}</div>
        </div>
      </div>

      <div className="stats-section">
        <h3>Najpopularniejsze projekty</h3>
        {data.topProjects.length === 0 ? (
          <p style={{ margin: 0, color: '#666' }}>
            Brak danych w wybranym okresie.
          </p>
        ) : (
          <table className="stats-table">
            <thead>
              <tr>
                <th>Projekt</th>
                <th>Wyświetlenia</th>
              </tr>
            </thead>
            <tbody>
              {data.topProjects.map((row) => (
                <tr key={row.projectId}>
                  <td>
                    <strong>{row.projectName}</strong>
                  </td>
                  <td>{row.views}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="stats-section">
        <h3>Najpopularniejsze rewizje</h3>
        {data.topRevisions.length === 0 ? (
          <p style={{ margin: 0, color: '#666' }}>
            Brak danych w wybranym okresie.
          </p>
        ) : (
          <table className="stats-table">
            <thead>
              <tr>
                <th>Projekt / Rewizja</th>
                <th>Wyświetlenia</th>
              </tr>
            </thead>
            <tbody>
              {data.topRevisions.map((row) => (
                <tr key={`${row.projectId}-${row.revisionId}`}>
                  <td>
                    <strong>{row.projectName}</strong>
                    {row.revisionLabel && ` — ${row.revisionLabel}`}
                  </td>
                  <td>{row.views}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="stats-section">
        <h3>Ostatnia aktywność Design</h3>
        {data.recentDesignActivity.length === 0 ? (
          <p style={{ margin: 0, color: '#666' }}>
            Brak aktywności w wybranym okresie.
          </p>
        ) : (
          <div className="activity-timeline">
            {data.recentDesignActivity.map((activity, idx) => (
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
        )}
      </div>
    </div>
  );
};
