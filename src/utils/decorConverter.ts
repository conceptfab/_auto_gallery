import { ImageFile } from '@/src/types/gallery';
import decorConversion from '../../data/decor-conversion.json';

interface DecorMap {
  stelaż: {
    [key: string]: string;
  };
  blat: {
    [key: string]: string;
  };
}

class DecorConverter {
  private table: DecorMap;

  constructor() {
    this.table = decorConversion as DecorMap;
  }

  findBlatImage(imageName: string, kolorystykaImages: ImageFile[]): ImageFile | null {
    // Wyciągnij kod blatu (W210, W240, etc.)
    const blatMatch = imageName.match(/W\d+/i);
    if (!blatMatch) return null;
    
    const blatCode = blatMatch[0].toUpperCase();
    const fileName = this.table.blat[blatCode];
    if (!fileName) return null;

    // Znajdź plik po nazwie
    return kolorystykaImages.find(img => img.name === fileName) || null;
  }

  findStelazImage(imageName: string, kolorystykaImages: ImageFile[]): ImageFile | null {
    // Wyciągnij kolor stelaża
    const colorMatch = imageName.match(/(grey|gray|black|white|silver)/i);
    if (!colorMatch) return null;
    
    let color = colorMatch[0].toLowerCase();
    
    // Mapowanie legacy
    if (color === 'gray') color = 'grey';
    if (color === 'silver') color = 'grey';
    
    const fileName = this.table.stelaż[color];
    if (!fileName) return null;

    // Znajdź plik po nazwie
    return kolorystykaImages.find(img => img.name === fileName) || null;
  }
}

export const decorConverter = new DecorConverter();
export default decorConverter;