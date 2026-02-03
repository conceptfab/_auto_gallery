import type { NextApiRequest, NextApiResponse } from 'next';
import { withAdminAuth } from '@/src/utils/adminMiddleware';
import {
  getProjects,
  saveGalleryFile,
  appendRevisionGalleryPaths,
} from '@/src/utils/projectsStorage';

function decodeDataUrlToBuffer(dataUrl: string): Buffer | null {
  const match = /^data:image\/\w+;base64,(.+)$/.exec((dataUrl || '').trim());
  if (!match) return null;
  try {
    return Buffer.from(match[1], 'base64');
  } catch {
    return null;
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { projectId, revisionId, images } = req.body as {
    projectId?: string;
    revisionId?: string;
    images?: string[];
  };

  if (
    !projectId ||
    typeof projectId !== 'string' ||
    !revisionId ||
    typeof revisionId !== 'string'
  ) {
    return res.status(400).json({ error: 'Brak projectId lub revisionId' });
  }

  if (!Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: 'Brak obrazów do zapisania' });
  }

  const projects = await getProjects();
  const project = projects.find((p) => p.id === projectId);
  const revision = project?.revisions?.find((r) => r.id === revisionId);
  if (!revision) {
    return res
      .status(404)
      .json({ error: 'Projekt lub rewizja nie znaleziona' });
  }

  const relativePaths: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const dataUrl = images[i];
    if (typeof dataUrl !== 'string') continue;
    const buffer = decodeDataUrlToBuffer(dataUrl);
    if (!buffer || buffer.length === 0) continue;
    const ext = dataUrl.includes('image/png')
      ? '.png'
      : dataUrl.includes('image/jpeg') || dataUrl.includes('image/jpg')
      ? '.jpg'
      : '.webp';
    const relativePath = await saveGalleryFile(
      projectId,
      revisionId,
      buffer,
      ext
    );
    relativePaths.push(relativePath);
  }

  if (relativePaths.length === 0) {
    return res
      .status(400)
      .json({ error: 'Żaden obraz nie został poprawnie odczytany' });
  }

  const updated = await appendRevisionGalleryPaths(
    projectId,
    revisionId,
    relativePaths
  );

  return res.status(200).json({
    success: true,
    revision: updated,
    added: relativePaths.length,
  });
}

export default withAdminAuth(handler);
