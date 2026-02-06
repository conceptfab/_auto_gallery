import { NextApiRequest, NextApiResponse } from 'next';
import { getEmailFromCookie } from '../../../src/utils/auth';
import { getUserGroup } from '../../../src/utils/storage';
import { ADMIN_EMAIL } from '../../../src/config/constants';
import { getSchedulerStatus } from '../../../src/services/schedulerService';
import { withRateLimit } from '../../../src/utils/rateLimiter';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Odczyt statusu uruchamia scheduler przy pierwszym wywołaniu (po deployu)
  getSchedulerStatus();

  const email = getEmailFromCookie(req);

  if (!email) {
    return res.status(200).json({
      isLoggedIn: false,
      email: null,
      isAdmin: false,
      group: null,
    });
  }

  const isAdmin = email === ADMIN_EMAIL;
  const userGroup = await getUserGroup(email);

  return res.status(200).json({
    isLoggedIn: true,
    email: email,
    isAdmin: isAdmin,
    group: userGroup
      ? {
          id: userGroup.id,
          name: userGroup.name,
          clientName: userGroup.clientName,
          galleryFolder: userGroup.galleryFolder,
        }
      : null,
  });
}

// 60 żądań na minutę na IP
export default withRateLimit(60, 60 * 1000)(handler);
