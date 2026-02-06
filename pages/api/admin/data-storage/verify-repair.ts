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
  };
  adopted: {
    revisionDirs: string[];
    galleryFiles: string[];
  };
  orphans: {
    projectDirs: string[];
    revisionDirs: string[];
  };
  errors: string[];
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const report: VerifyRepairReport = {
    success: true,
    repaired: { projects: 0, revisions: 0, galleryPaths: 0 },
    adopted: { revisionDirs: [], galleryFiles: [] },
    orphans: { projectDirs: [], revisionDirs: [] },
    errors: [],
  };

  try {
    const dataDir = await getDataDir();
    const projectsDir = path.join(dataDir, 'projects');

    let projectIds: string[] = [];
    try {
      projectIds = await fsp.readdir(projectsDir);
    } catch {
      return res.status(200).json(report);
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
        report.orphans.projectDirs.push(`projects/${projectId}`);
        report.errors.push(`Brak lub uszkodzony project.json: projects/${projectId}`);
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
          report.adopted.revisionDirs.push(...missingInMeta.map((revId) => `projects/${projectId}/rewizje/${revId}`));
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
              ...missingInRev.map((f) => `projects/${projectId}/rewizje/${revisionId}/gallery/${f}`)
            );
          }
        }
      }
    }
  } catch (err) {
    report.success = false;
    report.errors.push(err instanceof Error ? err.message : String(err));
  }

  return res.status(200).json(report);
}

export default withAdminAuth(handler);
