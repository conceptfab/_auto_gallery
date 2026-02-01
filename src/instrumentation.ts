// src/instrumentation.ts
// Start serwera = start schedulera. Deploy to początek odliczania.

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  try {
    console.log('[Instrumentation] Starting cache scheduler...');
    const { initScheduler } = await import('./services/schedulerService');
    initScheduler();
    console.log(
      '[Instrumentation] Cache scheduler started (deploy = start of countdown)'
    );
  } catch (err) {
    console.error('[Instrumentation] Failed to start scheduler:', err);
  }
}
