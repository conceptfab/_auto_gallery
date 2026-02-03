import { useState, useCallback } from 'react';
import type { AdminData } from '@/src/types/admin';
import { logger } from '@/src/utils/logger';

export function useAdminData() {
  const [data, setData] = useState<AdminData>({
    pending: [],
    whitelist: [],
    blacklist: [],
  });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/admin/pending-emails');
      const result = await response.json();
      setData(result);
    } catch (error) {
      logger.error('Error fetching data', error);
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, setLoading, fetchData };
}
