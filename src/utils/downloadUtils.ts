/**
 * Pobiera plik (wymusza download).
 * Opcjonalnie wywołuje funkcję trackFn do rejestrowania pobrania.
 */
export async function downloadFile(
  url: string,
  filename?: string,
  trackFn?: (filePath: string, fileName: string) => Promise<void> | void,
): Promise<void> {
  try {
    if (trackFn && filename) {
      try {
        await trackFn(url, filename);
      } catch (trackError) {
        // eslint-disable-next-line no-console
        console.error('Błąd trackowania pobrania:', trackError);
      }
    }

    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename || 'download';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Błąd pobierania pliku:', error);
  }
}
