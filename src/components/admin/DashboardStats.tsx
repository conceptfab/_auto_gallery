import React from 'react';
import { StatsOverview } from './StatsOverview';

export interface DashboardStatsProps {
  isExpanded: boolean;
  onToggleSection: () => void;
}

export const DashboardStats: React.FC<DashboardStatsProps> = ({
  isExpanded,
  onToggleSection,
}) => (
  <section className="admin-section">
    <h2
      className="admin-section-title admin-section-title-clickable"
      onClick={onToggleSection}
    >
      <span>Statystyki użytkowników</span>
      <i
        className={`las la-angle-up admin-section-toggle ${
          isExpanded ? '' : 'collapsed'
        }`}
      />
    </h2>
    {isExpanded && <StatsOverview />}
  </section>
);
