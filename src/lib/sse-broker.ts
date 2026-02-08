import type { ServerResponse } from 'http';

export interface SSEClient {
  id: string;
  res: ServerResponse;
  boardId: string;
  email: string;
}

const USER_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f97316',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b',
];

class SSEBroker {
  private clients: Map<string, SSEClient> = new Map();
  private colorIndex = 0;
  private userColors: Map<string, string> = new Map();

  addClient(client: SSEClient): void {
    this.clients.set(client.id, client);
  }

  removeClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  /** Send event to all clients in the room EXCEPT excludeId */
  broadcast(boardId: string, event: string, data: unknown, excludeId?: string): void {
    for (const client of this.clients.values()) {
      if (client.boardId === boardId && client.id !== excludeId) {
        try {
          client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch {
          // Client disconnected — will be cleaned up on 'close'
        }
      }
    }
  }

  /** Send event to ALL clients in the room (including sender) */
  broadcastAll(boardId: string, event: string, data: unknown): void {
    for (const client of this.clients.values()) {
      if (client.boardId === boardId) {
        try {
          client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch {
          // ignore
        }
      }
    }
  }

  getOnlineUsers(boardId: string): { email: string; color: string }[] {
    const seen = new Set<string>();
    const users: { email: string; color: string }[] = [];
    for (const client of this.clients.values()) {
      if (client.boardId === boardId && !seen.has(client.email)) {
        seen.add(client.email);
        users.push({ email: client.email, color: this.getUserColor(client.email) });
      }
    }
    return users;
  }

  getUserColor(email: string): string {
    if (!this.userColors.has(email)) {
      this.userColors.set(email, USER_COLORS[this.colorIndex % USER_COLORS.length]);
      this.colorIndex++;
    }
    return this.userColors.get(email)!;
  }
}

export const sseBroker = new SSEBroker();
