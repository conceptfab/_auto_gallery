import type { NextApiRequest, NextApiResponse } from 'next';
import { sseBroker } from '@/src/lib/sse-broker';
import { getEmailFromCookie } from '@/src/utils/auth';

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const boardId = req.query.boardId as string;
  if (!boardId) return res.status(400).json({ error: 'boardId required' });

  const email = getEmailFromCookie(req);
  if (!email) return res.status(401).json({ error: 'Unauthorized' });

  const clientId = `${email}-${Date.now()}`;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  // Send initial state: who is online
  const onlineUsers = sseBroker.getOnlineUsers(boardId);
  res.write(`event: init\ndata: ${JSON.stringify({
    users: onlineUsers,
    yourColor: sseBroker.getUserColor(email),
  })}\n\n`);

  // Register client
  sseBroker.addClient({ id: clientId, res, boardId, email });

  // Notify others
  sseBroker.broadcast(boardId, 'user:join', {
    email,
    color: sseBroker.getUserColor(email),
    timestamp: Date.now(),
  }, clientId);

  // Heartbeat every 30s
  const heartbeat = setInterval(() => {
    try {
      res.write(`:heartbeat\n\n`);
    } catch {
      // ignore — cleanup will happen on 'close'
    }
  }, 30_000);

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    sseBroker.removeClient(clientId);
    sseBroker.broadcast(boardId, 'user:leave', { email });
  });
}
