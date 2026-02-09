// src/instrumentation.ts
// Start serwera = start schedulera. Deploy to początek odliczania.

import { logger } from './utils/logger';

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  try {
    logger.info('[Instrumentation] Starting cache scheduler...');
    const { initScheduler } = await import('./services/schedulerService');
    initScheduler();
    logger.info(
      '[Instrumentation] Cache scheduler started (deploy = start of countdown)'
    );
  } catch (err) {
    logger.error('[Instrumentation] Failed to start scheduler:', err);
  }
}
