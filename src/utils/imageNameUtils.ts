/**
 * Nazwa do wyświetlania: bez rozszerzenia, bez __Shot, podkreślniki → spacje, uppercase.
 */
export function getDisplayName(src: string): string {
  const fileName = src.split('/').pop() || src;
  const lastDotIndex = fileName.lastIndexOf('.');
  let baseName =
    lastDotIndex === -1 ? fileName : fileName.substring(0, lastDotIndex);
  const shotIndex = baseName.indexOf('__Shot');
  if (shotIndex !== -1) baseName = baseName.substring(0, shotIndex);
  return baseName.replace(/_+/g, ' ').trim().toUpperCase();
}
