type LogFn = (message: string, ...args: unknown[]) => void;

interface Logger {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  galleryStart: (url: string) => void;
  galleryComplete: (folderCount: number, totalImages: number) => void;
  galleryError: (url: string, error: unknown) => void;
  cacheStatus: LogFn;
  authEvent: (action: string, email?: string, ...args: unknown[]) => void;
  apiRequest: (method: string, path: string, clientId?: string) => void;
  emailEvent: (action: string, recipient?: string, ...args: unknown[]) => void;
}

const isDev = process.env.NODE_ENV !== 'production';
const noop: LogFn = () => {};

export const logger: Logger = {
  debug: isDev ? (m, ...a) => console.log('[DEBUG]', m, ...a) : noop,
  info: isDev ? (m, ...a) => console.info('[INFO]', m, ...a) : noop,
  warn: (m, ...a) => console.warn('[WARN]', m, ...a),
  error: (m, ...a) => console.error('[ERROR]', m, ...a),
  galleryStart: (url) =>
    (isDev ? console.info : noop)('[INFO]', `Starting gallery scan: ${url}`),
  galleryComplete: (folderCount, totalImages) =>
    (isDev ? console.info : noop)(
      '[INFO]',
      `Gallery scan complete: ${folderCount} folders, ${totalImages} images`,
    ),
  galleryError: (url, err) =>
    console.error('[ERROR]', `Gallery scan failed for ${url}:`, err),
  cacheStatus: isDev
    ? (m, ...a) => console.log('[DEBUG]', `Cache: ${m}`, ...a)
    : noop,
  authEvent: (action, email, ...a) =>
    (isDev ? console.info : noop)(
      '[INFO]',
      `Auth ${action}${email ? ` for ${email}` : ''}`,
      ...a,
    ),
  apiRequest: (method, path, clientId) =>
    (isDev ? console.log : noop)(
      '[DEBUG]',
      `API ${method} ${path}${clientId ? ` from ${clientId}` : ''}`,
    ),
  emailEvent: (action, recipient, ...a) =>
    (isDev ? console.info : noop)(
      '[INFO]',
      `Email ${action}${recipient ? ` to ${recipient}` : ''}`,
      ...a,
    ),
};
