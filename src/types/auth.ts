export interface LoginCode {
  email: string;
  code: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface EmailRequest {
  email: string;
  ip?: string;
}

export interface LoginRequest {
  email: string;
  code: string;
}

export interface EmailStatus {
  email: string;
  status: 'whitelist' | 'blacklist' | 'pending';
  addedAt: Date;
}

export interface AdminAction {
  email: string;
  action: 'approve' | 'reject';
}