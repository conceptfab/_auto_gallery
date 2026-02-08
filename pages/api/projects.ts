import { NextApiResponse } from 'next';
import { getProjects, getAllProjects } from '@/src/utils/projectsStorage';
import { withGroupAccess, GroupScopedRequest } from '@/src/utils/groupAccessMiddleware';

/**
 * GET – lista projektów dla zalogowanego użytkownika.
 * User: widzi tylko projekty swojej grupy.
 * Admin: widzi wszystkie (lub filtruje per ?groupId=).
 */
async function handler(
  req: GroupScopedRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (req.isAdmin) {
      const filterGroupId = req.query.groupId as string | undefined;
      if (filterGroupId) {
        const projects = await getProjects(filterGroupId);
        return res.status(200).json({ success: true, projects });
      }
      const projects = await getAllProjects();
      return res.status(200).json({ success: true, projects });
    }

    // Zwykły user: projekty swojej grupy
    const projects = await getProjects(req.userGroupId);
    return res.status(200).json({ success: true, projects });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return res.status(500).json({ error: 'Błąd ładowania projektów' });
  }
}

export default withGroupAccess(handler);
