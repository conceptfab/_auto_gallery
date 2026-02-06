import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/src/contexts/AuthContext';
import type { Project } from '@/src/types/projects';

export function useProjects(enabled: boolean) {
  const router = useRouter();
  const { refetchAuth } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
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
      setLoading(false);
    }
  }, [refetchAuth, router]);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    refresh();
  }, [enabled, refresh]);

  return { projects, loading, refresh };
}

export function useProject(id: string | undefined, enabled: boolean) {
  const { projects, loading, refresh } = useProjects(enabled && !!id);

  const project = id
    ? projects.find((p) => p.slug === id || p.id === id) ?? null
    : null;

  return { project, loading, refresh };
}
