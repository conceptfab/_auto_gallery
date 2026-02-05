import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fsp from 'fs/promises';
import { withAdminAuth } from '@/src/utils/adminMiddleware';
import {
  saveThumbnailFile,
  updateProjectRevision,
  getProjects,
} from '@/src/utils/projectsStorage';
import sharp from 'sharp';

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
    maxFileSize: 10 * 1024 * 1024, // 10 MB
    keepExtensions: false,
  });

  const [err, fields, files] = await new Promise<
    [Error | null, formidable.Fields, formidable.Files]
  >((resolve) => {
    form.parse(
      req,
      (
        e: Error | null,
        flds: formidable.Fields,
        fls: formidable.Files
      ) => resolve([e, flds, fls])
    );
  });

  if (err) {
    console.error('Upload thumbnail parse error:', err);
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

  const file = Array.isArray(files.file) ? files.file[0] : files.file;
  if (!file?.filepath) {
    return res.status(400).json({ error: 'Brak pliku obrazu (pole: file)' });
  }

  const mime = file.mimetype || '';
  if (!ALLOWED_TYPES.includes(mime)) {
    await fsp.unlink(file.filepath).catch(() => {});
    return res
      .status(400)
      .json({ error: 'Dozwolone formaty: JPEG, PNG, WebP' });
  }

  const projects = await getProjects();
  const revision = projects
    .find((p) => p.id === projectId)
    ?.revisions?.find((r) => r.id === revisionId);
  if (!revision) {
    await fsp.unlink(file.filepath).catch(() => {});
    return res.status(404).json({ error: 'Projekt lub rewizja nie znaleziona' });
  }

  let buffer: Buffer;
  try {
    const raw = await fsp.readFile(file.filepath);
    buffer = await sharp(raw)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch (e) {
    console.error('Thumbnail process error:', e);
    await fsp.unlink(file.filepath).catch(() => {});
    return res.status(400).json({ error: 'Nie udało się przetworzyć obrazu' });
  } finally {
    await fsp.unlink(file.filepath).catch(() => {});
  }

  const relativePath = await saveThumbnailFile(projectId, revisionId, buffer);
  const updated = await updateProjectRevision(projectId, revisionId, {
    thumbnailPath: relativePath,
  });

  if (!updated) {
    return res.status(500).json({ error: 'Błąd zapisu rewizji' });
  }

  return res.status(200).json({ success: true, revision: updated });
}

export default withAdminAuth(handler);
