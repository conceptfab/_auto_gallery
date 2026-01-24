import { NextApiRequest, NextApiResponse } from 'next';
import { getPendingEmails, getWhitelist, getBlacklist } from '../../../../src/utils/storage';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const pending = getPendingEmails();
    const whitelist = getWhitelist();
    const blacklist = getBlacklist();
    
    console.log('📋 Pobieranie pending emails:', pending.length, 'wniosków');

    res.status(200).json({
      pending,
      whitelist,
      blacklist
    });

  } catch (error) {
    console.error('Error fetching pending emails:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}