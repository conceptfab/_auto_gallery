import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fsp from 'fs/promises';
import { withAdminAuth } from '@/src/utils/adminMiddleware';
import { getDataDir } from '@/src/utils/dataDir';

const REVISION_THUMBNAIL_FILENAME = 'thumbnail.webp';
const IMAGE_EXT = /\.(webp|jpg|jpeg|png|gif)$/i;

export interface VerifyRepairReport {
  success: boolean;
  repaired: {
    projects: number;
    revisions: number;
    galleryPaths: number;
    moodboardBoards: number;
    moodboardImageDirs: number;
  };
  adopted: {
    revisionDirs: string[];
    galleryFiles: string[];
    moodboardBoardFiles: string[];
    moodboardImageDirs: string[];
  };
  orphans: {
    projectDirs: string[];
    revisionDirs: string[];
  };
  errors: string[];
}

async function verifyRepairMoodboardDir(
  moodboardDir: string,
  prefix: string,
  report: VerifyRepairReport
): Promise<void> {
  const indexPath = path.join(moodboardDir, 'index.json');
  let index: { boardIds: string[]; activeId: string } | null = null;
  try {
    const raw = await fsp.readFile(indexPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { boardIds?: unknown[] }).boardIds)
    ) {
      const boardIds = ((parsed as { boardIds: unknown[] }).boardIds || [])
        .filter((id): id is string => typeof id === 'string' && id.trim() !== '');
      const activeId =
        typeof (parsed as { activeId?: unknown }).activeId === 'string'
          ? (parsed as { activeId: string }).activeId
          : boardIds[0] || '';
      index = { boardIds, activeId };
    }
  } catch {
    // Brak index.json lub uszkodzony – pomijamy moodboard
    return;
  }
  if (!index) return;

  const entries = await fsp.readdir(moodboardDir, { withFileTypes: true }).catch(() => []);
  const boardFiles = entries.filter(
    (entry) =>
      entry.isFile() &&
      entry.name.endsWith('.json') &&
      entry.name !== 'index.json' &&
      entry.name !== 'state.json'
  );
  const listedBoardIds = new Set(index.boardIds);

  for (const entry of boardFiles) {
    const boardId = entry.name.slice(0, -'.json'.length);
    if (listedBoardIds.has(boardId)) continue;

    const boardPath = path.join(moodboardDir, entry.name);
    await fsp.unlink(boardPath).catch(() => undefined);
    report.repaired.moodboardBoards++;
    report.adopted.moodboardBoardFiles.push(`${prefix}${entry.name}`);

    const imageDir = path.join(moodboardDir, 'images', boardId);
    const imageStat = await fsp.stat(imageDir).catch(() => null);
    if (imageStat?.isDirectory()) {
      await fsp.rm(imageDir, { recursive: true, force: true }).catch(() => undefined);
      report.repaired.moodboardImageDirs++;
      report.adopted.moodboardImageDirs.push(`${prefix}images/${boardId}`);
    }
  }

  // Zaktualizuj index.json jeśli zawiera ID boardów bez plików.
  const entriesAfterCleanup = await fsp.readdir(moodboardDir, { withFileTypes: true }).catch(() => []);
  const existingBoardIds = new Set(
    entriesAfterCleanup
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith('.json') &&
          entry.name !== 'index.json' &&
          entry.name !== 'state.json'
      )
      .map((entry) => entry.name.slice(0, -'.json'.length))
  );
  const normalizedBoardIds = index.boardIds.filter((id) => existingBoardIds.has(id));
  const normalizedActiveId =
    normalizedBoardIds.includes(index.activeId) ? index.activeId : normalizedBoardIds[0] || '';

  if (
    normalizedBoardIds.length !== index.boardIds.length ||
    normalizedActiveId !== index.activeId
  ) {
    await fsp.writeFile(
      indexPath,
      JSON.stringify({ boardIds: normalizedBoardIds, activeId: normalizedActiveId }, null, 2),
      'utf8'
    );
    report.repaired.moodboardBoards++;
  }
}

async function verifyRepairProjectsDir(
  projectsDir: string,
  prefix: string,
  report: VerifyRepairReport
): Promise<void> {
  let projectIds: string[] = [];
  try {
    projectIds = await fsp.readdir(projectsDir);
  } catch {
    return;
  }

  for (const projectId of projectIds) {
    const projectPath = path.join(projectsDir, projectId);
    const stat = await fsp.stat(projectPath).catch(() => null);
    if (!stat?.isDirectory()) continue;

    const projectJsonPath = path.join(projectPath, 'project.json');
    let meta: {
      id: string;
      name: string;
      slug?: string;
      description?: string;
      createdAt: string;
      revisionIds: string[];
    };

    try {
      const raw = await fsp.readFile(projectJsonPath, 'utf8');
      meta = JSON.parse(raw) as typeof meta;
      if (!meta.id) meta.id = projectId;
      if (!meta.revisionIds) meta.revisionIds = [];
    } catch {
      report.orphans.projectDirs.push(`${prefix}${projectId}`);
      report.errors.push(`Brak lub uszkodzony project.json: ${prefix}${projectId}`);
      continue;
    }

    const rewizjeDir = path.join(projectPath, 'rewizje');
    let rawRevisions: string[] = [];
    try {
      rawRevisions = await fsp.readdir(rewizjeDir);
    } catch {
      rawRevisions = [];
    }
    const actualRevisionIds: string[] = [];
    for (const name of rawRevisions) {
      const p = path.join(rewizjeDir, name);
      const s = await fsp.stat(p).catch(() => null);
      if (s?.isDirectory()) actualRevisionIds.push(name);
    }

    const missingInMeta = actualRevisionIds.filter((id) => !meta.revisionIds.includes(id));
    const inMetaNotOnDisk = meta.revisionIds.filter((id) => !actualRevisionIds.includes(id));
    const needsUpdate = missingInMeta.length > 0 || inMetaNotOnDisk.length > 0;

    if (needsUpdate) {
      meta.revisionIds = actualRevisionIds;
      await fsp.writeFile(projectJsonPath, JSON.stringify(meta, null, 2), 'utf8');
      report.repaired.projects++;
      if (missingInMeta.length > 0) {
        report.adopted.revisionDirs.push(...missingInMeta.map((revId) => `${prefix}${projectId}/rewizje/${revId}`));
      }
    }

    for (const revisionId of actualRevisionIds) {
      const revDir = path.join(rewizjeDir, revisionId);
      const revJsonPath = path.join(revDir, 'revision.json');
      let revMeta: {
        id: string;
        label?: string;
        description?: string;
        embedUrl?: string;
        createdAt: string;
        thumbnailPath?: string;
        galleryPaths?: string[];
      };

      try {
        const raw = await fsp.readFile(revJsonPath, 'utf8');
        revMeta = JSON.parse(raw) as typeof revMeta;
        if (!revMeta.id) revMeta.id = revisionId;
        if (!revMeta.createdAt) revMeta.createdAt = new Date().toISOString();
      } catch {
        revMeta = {
          id: revisionId,
          createdAt: new Date().toISOString(),
        };
        await fsp.writeFile(revJsonPath, JSON.stringify(revMeta, null, 2), 'utf8');
        report.repaired.revisions++;
      }

      const thumbPath = path.join(revDir, REVISION_THUMBNAIL_FILENAME);
      const thumbExists = await fsp.access(thumbPath).then(() => true).catch(() => false);
      if (thumbExists && !revMeta.thumbnailPath) {
        revMeta.thumbnailPath = REVISION_THUMBNAIL_FILENAME;
        await fsp.writeFile(revJsonPath, JSON.stringify(revMeta, null, 2), 'utf8');
        report.repaired.revisions++;
      } else if (!thumbExists && revMeta.thumbnailPath) {
        revMeta.thumbnailPath = undefined;
        await fsp.writeFile(revJsonPath, JSON.stringify(revMeta, null, 2), 'utf8');
        report.repaired.revisions++;
      }

      const galleryDir = path.join(revDir, 'gallery');
      let filesOnDisk: string[] = [];
      try {
        const all = await fsp.readdir(galleryDir);
        filesOnDisk = all.filter((f) => IMAGE_EXT.test(f));
      } catch {
        // brak gallery
      }

      const currentPaths = revMeta.galleryPaths || [];
      const missingInRev = filesOnDisk.filter((f) => !currentPaths.includes(f));
      const inRevNotOnDisk = currentPaths.filter((f) => !filesOnDisk.includes(f));

      if (missingInRev.length > 0 || inRevNotOnDisk.length > 0) {
        revMeta.galleryPaths = filesOnDisk.length > 0 ? filesOnDisk : undefined;
        await fsp.writeFile(revJsonPath, JSON.stringify(revMeta, null, 2), 'utf8');
        report.repaired.revisions++;
        if (missingInRev.length > 0) {
          report.repaired.galleryPaths += missingInRev.length;
          report.adopted.galleryFiles.push(
            ...missingInRev.map((f) => `${prefix}${projectId}/rewizje/${revisionId}/gallery/${f}`)
          );
        }
      }
    }
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const report: VerifyRepairReport = {
    success: true,
    repaired: { projects: 0, revisions: 0, galleryPaths: 0, moodboardBoards: 0, moodboardImageDirs: 0 },
    adopted: { revisionDirs: [], galleryFiles: [], moodboardBoardFiles: [], moodboardImageDirs: [] },
    orphans: { projectDirs: [], revisionDirs: [] },
    errors: [],
  };

  try {
    const dataDir = await getDataDir();

    // Global projects
    await verifyRepairProjectsDir(path.join(dataDir, 'projects'), 'projects/', report);
    // Global moodboard
    await verifyRepairMoodboardDir(path.join(dataDir, 'moodboard'), 'moodboard/', report);

    // Group projects
    const groupsDir = path.join(dataDir, 'groups');
    try {
      const groupDirs = await fsp.readdir(groupsDir);
      for (const gid of groupDirs) {
        if (gid === 'groups.json') continue;
        const groupProjectsDir = path.join(groupsDir, gid, 'projects');
        const gstat = await fsp.stat(groupProjectsDir).catch(() => null);
        if (gstat?.isDirectory()) {
          await verifyRepairProjectsDir(groupProjectsDir, `groups/${gid}/projects/`, report);
        }
        await verifyRepairMoodboardDir(
          path.join(groupsDir, gid, 'moodboard'),
          `groups/${gid}/moodboard/`,
          report
        );
      }
    } catch {
      // brak groups
    }
  } catch (err) {
    report.success = false;
    report.errors.push(err instanceof Error ? err.message : String(err));
  }

  return res.status(200).json(report);
}

export default withAdminAuth(handler);
