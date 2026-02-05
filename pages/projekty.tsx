import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import LoadingOverlay from '@/src/components/LoadingOverlay';
import { useStatsTracker } from '@/src/hooks/useStatsTracker';
import { useProtectedAuth, useAuth } from '@/src/contexts/AuthContext';

interface Project {
  id: string;
  slug?: string;
  name: string;
  description?: string;
  createdAt: string;
}

const ProjectsPage: React.FC = () => {
  const router = useRouter();
  const { authStatus, authLoading } = useProtectedAuth();
  const { refetchAuth } = useAuth();
  const { trackDesignView } = useStatsTracker();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);

  useEffect(() => {
    if (!authStatus?.isLoggedIn || authLoading) return;
    trackDesignView('design_list', 'projekty', 'Projekty');
  }, [authStatus?.isLoggedIn, authLoading, trackDesignView]);

  useEffect(() => {
    if (!authStatus?.isLoggedIn) return;
    const fetchProjects = async () => {
      try {
        const res = await fetch('/api/projects');
        if (res.status === 401) {
          await refetchAuth();
          router.replace('/login');
          return;
        }
        const data = await res.json();
        if (data.success && Array.isArray(data.projects)) {
          setProjects(data.projects);
        }
      } catch (error) {
        console.error('Error fetching projects:', error);
      } finally {
        setProjectsLoading(false);
      }
    };
    setProjectsLoading(true);
    fetchProjects();
  }, [authStatus?.isLoggedIn, refetchAuth, router]);

  if (authLoading && !authStatus) {
    return <LoadingOverlay message="Sprawdzanie autoryzacji..." />;
  }

  if (!authStatus?.isLoggedIn) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Projekty – Content Browser</title>
        <meta name="description" content="Projekty – Content Browser" />
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
                onClick={() => router.push(`/projekty/${p.slug || p.id}`)}
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

export async function getServerSideProps() {
  return {
    props: {},
  };
}
