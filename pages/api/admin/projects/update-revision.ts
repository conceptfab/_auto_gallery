import { NextApiRequest, NextApiResponse } from 'next';
import {
  updateProjectRevision,
  findProjectById,
} from '@/src/utils/projectsStorage';
import { withAdminAuth } from '@/src/utils/adminMiddleware';

export const config = {
  api: {
    bodyParser: { sizeLimit: '4mb' },
  },
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const body = req.body ?? {};
    const {
      projectId,
      revisionId,
      label,
      description,
      embedUrl,
      thumbnailDataUrl,
      screenshotDataUrl,
      groupId,
    } = body;
    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ error: 'Id projektu jest wymagane' });
    }
    if (!revisionId || typeof revisionId !== 'string') {
      return res.status(400).json({ error: 'Id rewizji jest wymagane' });
    }
    const updates: {
      label?: string;
      description?: string;
      embedUrl?: string;
      thumbnailDataUrl?: string;
      screenshotDataUrl?: string;
    } = {};
    if (label !== undefined)
      updates.label = typeof label === 'string' ? label : '';
    if (description !== undefined)
      updates.description = typeof description === 'string' ? description : '';
    if (embedUrl !== undefined)
      updates.embedUrl = typeof embedUrl === 'string' ? embedUrl : '';
    if (thumbnailDataUrl !== undefined)
      updates.thumbnailDataUrl =
        typeof thumbnailDataUrl === 'string' ? thumbnailDataUrl : '';
    if (screenshotDataUrl !== undefined)
      updates.screenshotDataUrl =
        typeof screenshotDataUrl === 'string' ? screenshotDataUrl : '';
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error:
          'Podaj label, description, embedUrl, thumbnailDataUrl lub screenshotDataUrl',
      });
    }
    let resolvedGroupId = groupId as string | undefined;
    if (!resolvedGroupId) {
      const [foundProject, foundGroupId] = await findProjectById(projectId);
      if (!foundProject) {
        return res.status(404).json({ error: 'Projekt nie znaleziony' });
      }
      resolvedGroupId = foundGroupId;
      const revisionExists = (foundProject.revisions ?? []).some((r) => r.id === revisionId);
      if (!revisionExists) {
        return res.status(404).json({ error: 'Rewizja nie znaleziona' });
      }
    }
    const revision = await updateProjectRevision(
      projectId,
      revisionId,
      updates,
      resolvedGroupId
    );
    if (!revision) {
      return res
        .status(404)
        .json({ error: 'Projekt lub rewizja nie znaleziona' });
    }
    return res.status(200).json({ success: true, revision });
  } catch (error) {
    console.error('Error updating revision:', error);
    return res.status(500).json({ error: 'Błąd aktualizacji rewizji' });
  }
}

export default withAdminAuth(handler);
