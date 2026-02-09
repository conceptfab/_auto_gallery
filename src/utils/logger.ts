type LogFn = (message: string, ...args: unknown[]) => void;

interface Logger {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
}

const isDev = process.env.NODE_ENV !== 'production';
const noop: LogFn = () => {};

export const logger: Logger = {
  debug: isDev ? (m, ...a) => console.log('[DEBUG]', m, ...a) : noop,
  info: isDev ? (m, ...a) => console.info('[INFO]', m, ...a) : noop,
  warn: (m, ...a) => console.warn('[WARN]', m, ...a),
  error: (m, ...a) => console.error('[ERROR]', m, ...a),
};
