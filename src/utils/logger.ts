type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private level: LogLevel;
  private isDev: boolean;
  
  constructor() {
    this.isDev = process.env.NODE_ENV !== 'production';
    this.level = this.isDev ? 'debug' : 'warn';
  }
  
  private shouldLog(level: LogLevel): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }
  
  private formatMessage(level: LogLevel, message: string, ...args: any[]): [string, ...any[]] {
    const timestamp = new Date().toISOString();
    const emoji = this.getEmoji(level);
    const formattedMessage = `[${timestamp}] ${emoji} ${message}`;
    return [formattedMessage, ...args];
  }
  
  private getEmoji(level: LogLevel): string {
    switch (level) {
      case 'debug': return '🔍';
      case 'info': return 'ℹ️';
      case 'warn': return '⚠️';
      case 'error': return '❌';
      default: return '📝';
    }
  }
  
  debug(message: string, ...args: any[]) {
    if (this.shouldLog('debug')) {
      console.log(...this.formatMessage('debug', message, ...args));
    }
  }
  
  info(message: string, ...args: any[]) {
    if (this.shouldLog('info')) {
      console.info(...this.formatMessage('info', message, ...args));
    }
  }
  
  warn(message: string, ...args: any[]) {
    if (this.shouldLog('warn')) {
      console.warn(...this.formatMessage('warn', message, ...args));
    }
  }
  
  error(message: string, ...args: any[]) {
    if (this.shouldLog('error')) {
      console.error(...this.formatMessage('error', message, ...args));
    }
  }
  
  // Gallery specific methods for backward compatibility
  galleryStart(url: string) {
    this.info(`Starting gallery scan: ${url}`);
  }
  
  galleryComplete(folderCount: number, totalImages: number) {
    this.info(`Gallery scan complete: ${folderCount} folders, ${totalImages} images`);
  }
  
  galleryError(url: string, error: any) {
    this.error(`Gallery scan failed for ${url}:`, error);
  }
  
  cacheStatus(message: string, ...args: any[]) {
    this.debug(`Cache: ${message}`, ...args);
  }
  
  authEvent(action: string, email?: string, ...args: any[]) {
    this.info(`Auth ${action}${email ? ` for ${email}` : ''}`, ...args);
  }
  
  apiRequest(method: string, path: string, clientId?: string) {
    this.debug(`API ${method} ${path}${clientId ? ` from ${clientId}` : ''}`);
  }
  
  emailEvent(action: string, recipient?: string, ...args: any[]) {
    this.info(`Email ${action}${recipient ? ` to ${recipient}` : ''}`, ...args);
  }
}

export const logger = new Logger();

// Legacy compatibility functions for gradual migration
export const logInfo = (message: string, ...args: any[]) => logger.info(message, ...args);
export const logError = (message: string, ...args: any[]) => logger.error(message, ...args);
export const logDebug = (message: string, ...args: any[]) => logger.debug(message, ...args);
export const logWarn = (message: string, ...args: any[]) => logger.warn(message, ...args);