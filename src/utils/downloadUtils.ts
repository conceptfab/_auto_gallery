/**
 * Pobiera plik (wymusza download).
 */
export async function downloadFile(url: string, filename?: string): Promise<void> {
  try {
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
    console.error('Błąd pobierania pliku:', error);
  }
}
