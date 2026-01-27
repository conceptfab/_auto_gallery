/**
 * Inicjuje pobieranie pliku (tworzy link <a>, ustawia href/download, wywołuje click).
 */
export function downloadFile(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
}
