import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fsp from 'fs/promises';
import sharp from 'sharp';
import { withAdminAuth } from '@/src/utils/adminMiddleware';
import {
  getProjects,
  saveGalleryFile,
  appendRevisionGalleryPaths,
} from '@/src/utils/projectsStorage';

export const config = {
  api: {
    bodyParser: false,
  },
};

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = formidable({
    maxFileSize: 10 * 1024 * 1024,
    maxFiles: 50,
    keepExtensions: false,
  });

  const [err, fields, files] = await new Promise<
    [Error | null, formidable.Fields, formidable.Files]
  >((resolve) => {
    form.parse(
      req,
      (e: Error | null, flds: formidable.Fields, fls: formidable.Files) =>
        resolve([e, flds, fls])
    );
  });

  if (err) {
    console.error('Upload gallery parse error:', err);
    return res.status(400).json({ error: 'Błąd odczytu formularza' });
  }

  const projectId = Array.isArray(fields.projectId)
    ? fields.projectId[0]
    : fields.projectId;
  const revisionId = Array.isArray(fields.revisionId)
    ? fields.revisionId[0]
    : fields.revisionId;

  if (!projectId || !revisionId) {
    return res
      .status(400)
      .json({ error: 'Brak projectId lub revisionId w formularzu' });
  }

  const rawFiles = files.files;
  const fileList = Array.isArray(rawFiles) ? rawFiles : rawFiles ? [rawFiles] : [];
  if (fileList.length === 0) {
    return res.status(400).json({ error: 'Brak obrazów do zapisania' });
  }

  const projects = await getProjects();
  const project = projects.find((p) => p.id === projectId);
  const revision = project?.revisions?.find((r) => r.id === revisionId);
  if (!revision) {
    for (const f of fileList) await fsp.unlink(f.filepath).catch(() => {});
    return res
      .status(404)
      .json({ error: 'Projekt lub rewizja nie znaleziona' });
  }

  const relativePaths: string[] = [];
  for (const file of fileList) {
    const mime = file.mimetype || '';
    if (!ALLOWED_TYPES.includes(mime)) {
      await fsp.unlink(file.filepath).catch(() => {});
      continue;
    }
    try {
      const raw = await fsp.readFile(file.filepath);
      const buffer = await sharp(raw).webp({ quality: 85 }).toBuffer();
      const relativePath = await saveGalleryFile(
        projectId,
        revisionId,
        buffer,
        '.webp'
      );
      relativePaths.push(relativePath);
    } catch (e) {
      console.error('Gallery image process error:', e);
    } finally {
      await fsp.unlink(file.filepath).catch(() => {});
    }
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
