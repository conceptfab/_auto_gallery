// instrumentation.ts
// Inicjalizacja serwisów przy starcie serwera Next.js.
// Scheduler startuje tutaj; jeśli po deployu nie zadziała (np. inny worker),
// uruchomi się automatycznie przy pierwszym żądaniu do /api/auth/status (strona główna, login)
// lub /api/cron/scan albo /api/admin/cache/status.

export async function register() {
  // Tylko na serwerze (nie w edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initScheduler } = await import('./src/services/schedulerService');

    console.log('[Instrumentation] Initializing cache scheduler...');
    initScheduler();
    console.log('[Instrumentation] Cache scheduler initialized');
  }
}
