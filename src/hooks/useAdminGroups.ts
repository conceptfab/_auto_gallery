import { useState, useCallback } from 'react';
import type { UserGroup } from '@/src/types/admin';
import { logger } from '@/src/utils/logger';

export interface FolderStatusMap {
  [groupId: string]: {
    exists: boolean;
    foldersCount?: number;
    filesCount?: number;
    error?: string;
  };
}

export function useAdminGroups() {
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [folderStatus, setFolderStatus] = useState<FolderStatusMap>({});

  const checkFoldersStatus = useCallback(async (groupsList: UserGroup[]) => {
    if (groupsList.length === 0) {
      setFolderStatus({});
      return;
    }
    try {
      const response = await fetch('/api/admin/files/check-folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: groupsList.map((g) => ({
            id: g.id,
            path: g.galleryFolder || '',
          })),
        }),
      });
      const data = await response.json();
      setFolderStatus(data.statuses ?? {});
    } catch (error) {
      logger.error('Error checking folders', error);
      const fallback: FolderStatusMap = {};
      for (const g of groupsList) {
        fallback[g.id] = { exists: false, error: 'Błąd sprawdzania' };
      }
      setFolderStatus(fallback);
    }
  }, []);

  const fetchGroups = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/admin/groups/list');
      const result = await response.json();
      if (result.success) {
        setGroups(result.groups ?? []);
        await checkFoldersStatus(result.groups ?? []);
      }
    } catch (error) {
      logger.error('Error fetching groups', error);
    }
  }, [checkFoldersStatus]);

  return {
    groups,
    folderStatus,
    fetchGroups,
  };
}
