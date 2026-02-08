import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import LoadingOverlay from '@/src/components/LoadingOverlay';
import { useStatsTracker } from '@/src/hooks/useStatsTracker';
import { useProtectedAuth } from '@/src/contexts/AuthContext';
import { useProjects } from '@/src/hooks/useProjects';
import type { UserGroup } from '@/src/types/admin';

const ProjectsPage: React.FC = () => {
  const router = useRouter();
  const { authStatus, authLoading } = useProtectedAuth();
  const { trackDesignView } = useStatsTracker();
  const { projects, loading: projectsLoading } = useProjects(
    !!authStatus?.isLoggedIn
  );
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const isAdmin = authStatus?.isAdmin ?? false;

  useEffect(() => {
    if (!authStatus?.isLoggedIn || authLoading) return;
    trackDesignView('design_list', 'projekty', 'Projekty');
  }, [authStatus?.isLoggedIn, authLoading, trackDesignView]);

  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/auth/admin/groups/list', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((data) => setGroups(data.groups ?? []))
      .catch(() => setGroups([]));
  }, [isAdmin]);

  if (authLoading && !authStatus) {
    return <LoadingOverlay message="Sprawdzanie autoryzacji..." />;
  }

  if (!authStatus?.isLoggedIn) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Projekty – ConceptDesk</title>
        <meta name="description" content="Projekty – ConceptDesk" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="design-page">
        {projectsLoading ? (
          <LoadingOverlay message="Ładowanie projektów..." />
        ) : projects.length === 0 ? (
          <div className="design-page-empty">Brak projektów.</div>
        ) : (
          <div className="design-projects-grid">
            {projects.map((p) => {
              const color = isAdmin && p.groupId
                ? groups.find((g) => g.id === p.groupId)?.color
                : undefined;
              return (
                <button
                  key={p.id}
                  type="button"
                  className="design-project-tile"
                  onClick={() => router.push(`/projekty/${p.id}`)}
                  style={
                    color
                      ? {
                          borderLeftWidth: '4px',
                          borderLeftStyle: 'solid',
                          borderLeftColor: color,
                        }
                      : undefined
                  }
                >
                  <div className="design-project-tile-icon" aria-hidden>
                    <i className="las la-folder-open" />
                  </div>
                  <h3 className="design-project-tile-title">{p.name}</h3>
                  {p.description && (
                    <p className="design-project-tile-desc">{p.description}</p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
};

export default ProjectsPage;
