import { NextApiRequest, NextApiResponse } from 'next';
import { updateProject, findProjectById } from '@/src/utils/projectsStorage';
import { withAdminAuth } from '@/src/utils/adminMiddleware';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { id, name, description, groupId, currentGroupId } = req.body;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Id projektu jest wymagane' });
    }
    const updates: { name?: string; description?: string; groupId?: string } = {};
    if (name !== undefined) {
      if (typeof name !== 'string') {
        return res.status(400).json({ error: 'Nazwa musi być tekstem' });
      }
      updates.name = name;
    }
    if (description !== undefined) {
      if (typeof description !== 'string') {
        return res.status(400).json({ error: 'Opis musi być tekstem' });
      }
      updates.description = description;
    }
    if (groupId !== undefined) {
      updates.groupId = typeof groupId === 'string' ? groupId : undefined;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Podaj name, description lub groupId' });
    }
    // Resolve group via explicit param or findProjectById
    let resolvedGroupId = currentGroupId as string | undefined;
    if (!resolvedGroupId) {
      const [, foundGroupId] = await findProjectById(id);
      resolvedGroupId = foundGroupId;
    }
    const project = await updateProject(id, updates, resolvedGroupId);
    if (!project) {
      return res.status(404).json({ error: 'Projekt nie znaleziony' });
    }
    return res.status(200).json({ success: true, project });
  } catch (error) {
    console.error('Error updating project:', error);
    return res.status(500).json({ error: 'Błąd aktualizacji projektu' });
  }
}

export default withAdminAuth(handler);
