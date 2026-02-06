import React, { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import LoadingOverlay from '@/src/components/LoadingOverlay';
import { useStatsTracker } from '@/src/hooks/useStatsTracker';
import { useProtectedAuth } from '@/src/contexts/AuthContext';
import { useProjects } from '@/src/hooks/useProjects';

const ProjectsPage: React.FC = () => {
  const router = useRouter();
  const { authStatus, authLoading } = useProtectedAuth();
  const { trackDesignView } = useStatsTracker();
  const { projects, loading: projectsLoading } = useProjects(!!authStatus?.isLoggedIn);

  useEffect(() => {
    if (!authStatus?.isLoggedIn || authLoading) return;
    trackDesignView('design_list', 'projekty', 'Projekty');
  }, [authStatus?.isLoggedIn, authLoading, trackDesignView]);

  if (authLoading && !authStatus) {
    return <LoadingOverlay message="Sprawdzanie autoryzacji..." />;
  }

  if (!authStatus?.isLoggedIn) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Projekty – ConceptView</title>
        <meta name="description" content="Projekty – ConceptView" />
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
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                className="design-project-tile"
                onClick={() => router.push(`/projekty/${p.id}`)}
              >
                <div className="design-project-tile-icon" aria-hidden>
                  <i className="las la-folder-open" />
                </div>
                <h3 className="design-project-tile-title">{p.name}</h3>
                {p.description && (
                  <p className="design-project-tile-desc">{p.description}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </main>
    </>
  );
};

export default ProjectsPage;

