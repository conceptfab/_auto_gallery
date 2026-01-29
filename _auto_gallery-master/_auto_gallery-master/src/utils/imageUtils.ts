import { ImageFile } from '@/src/types/gallery';

/**
 * Zwraca URL obrazka przez proxy (thumb lub full).
 */
export function getOptimizedImageUrl(
  image: ImageFile,
  size: 'thumb' | 'full' = 'full',
): string {
  return `/api/image-proxy?url=${encodeURIComponent(image.url)}&size=${size}`;
}
