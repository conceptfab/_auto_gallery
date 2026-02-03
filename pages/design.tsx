import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import LoadingOverlay from '@/src/components/LoadingOverlay';
import { useStatsTracker } from '@/src/hooks/useStatsTracker';

interface AuthStatus {
  isLoggedIn: boolean;
  email: string | null;
  isAdmin: boolean;
}

interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

const DesignPage: React.FC = () => {
  const router = useRouter();
  const { trackDesignView } = useStatsTracker();
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);

  useEffect(() => {
    if (!authStatus?.isLoggedIn || loading) return;
    trackDesignView('design_list', 'design', 'Design');
  }, [authStatus?.isLoggedIn, loading, trackDesignView]);

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const response = await fetch('/api/auth/status');
        const status: AuthStatus = await response.json();
        setAuthStatus(status);
        if (!status.isLoggedIn) {
          router.push('/login');
          return;
        }
      } catch (error) {
        console.error('Error checking auth status:', error);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };
    checkAuthStatus();
  }, [router]);

  useEffect(() => {
    if (!authStatus?.isLoggedIn) return;
    const fetchProjects = async () => {
      try {
        const res = await fetch('/api/projects');
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
  }, [authStatus?.isLoggedIn]);

  if (loading) {
    return <LoadingOverlay message="Sprawdzanie autoryzacji..." />;
  }

  if (!authStatus?.isLoggedIn) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Design – CONCEPTFAB Content Browser</title>
        <meta
          name="description"
          content="Design – CONCEPTFAB Content Browser"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="design-page">
        <h1 className="design-page-title">Design</h1>
        <p className="design-page-intro">Wybierz projekt.</p>

        {projectsLoading ? (
          <p className="design-page-loading">Ładowanie projektów...</p>
        ) : projects.length === 0 ? (
          <p className="design-page-empty">Brak projektów.</p>
        ) : (
          <div className="design-projects-grid">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                className="design-project-tile"
                onClick={() => router.push(`/design/${p.id}`)}
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

export default DesignPage;

export async function getServerSideProps() {
  return {
    props: {},
  };
}
