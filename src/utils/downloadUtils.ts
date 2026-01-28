/**
 * Otwiera plik w nowym oknie/karcie przeglądarki.
 */
export function downloadFile(url: string, _filename?: string): void {
  window.open(url, '_blank');
}
