// instrumentation.ts
// Inicjalizacja serwisów przy starcie serwera Next.js

export async function register() {
  // Tylko na serwerze (nie w edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initScheduler } = await import('./src/services/schedulerService');

    console.log('[Instrumentation] Initializing cache scheduler...');
    initScheduler();
    console.log('[Instrumentation] Cache scheduler initialized');
  }
}
