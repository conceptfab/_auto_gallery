import { NextApiRequest, NextApiResponse } from 'next';
import { getEmailFromCookie } from '../../../src/utils/auth';
import { getUserGroup } from '../../../src/utils/storage';
import { ADMIN_EMAIL } from '../../../src/config/constants';
import {
  initScheduler,
  getSchedulerStatus,
} from '../../../src/services/schedulerService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Uruchom scheduler przy pierwszym żądaniu (po deployu instrumentation może nie zadziałać)
  if (!getSchedulerStatus().intervalActive) {
    initScheduler();
  }

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
