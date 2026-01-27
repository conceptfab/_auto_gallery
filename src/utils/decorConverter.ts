import { ImageFile } from '@/src/types/gallery';

interface DecorMap {
  stelaż: {
    [key: string]: string;
  };
  blat: {
    [key: string]: string;
  };
}

class DecorConverter {
  private table: DecorMap | null = null;

  private async loadTable(): Promise<DecorMap> {
    if (this.table) return this.table;
    
    try {
      const response = await fetch('/decor-conversion.json');
      this.table = await response.json();
      return this.table!;
    } catch (error) {
      console.error('Błąd ładowania tabeli:', error);
      // Fallback
      this.table = {
        stelaż: {
          white: "white_RAL9003.webp",
          grey: "grey_RAL9006.webp", 
          black: "black_RAL9005.webp"
        },
        blat: {
          W210: "W210.webp",
          W240: "W240.webp",
          W250: "W250.webp"
        }
      };
      return this.table;
    }
  }

  async findBlatImage(imageName: string, kolorystykaImages: ImageFile[]): Promise<ImageFile | null> {
    const table = await this.loadTable();
    
    // Wyciągnij kod blatu (W210, W240, etc.)
    const blatMatch = imageName.match(/W\d+/i);
    if (!blatMatch) return null;
    
    const blatCode = blatMatch[0].toUpperCase();
    const fileName = table.blat[blatCode];
    if (!fileName) return null;

    // Znajdź plik po nazwie
    return kolorystykaImages.find(img => img.name === fileName) || null;
  }

  async findStelazImage(imageName: string, kolorystykaImages: ImageFile[]): Promise<ImageFile | null> {
    const table = await this.loadTable();
    
    // Wyciągnij kolor stelaża
    const colorMatch = imageName.match(/(grey|gray|black|white|silver)/i);
    if (!colorMatch) return null;
    
    let color = colorMatch[0].toLowerCase();
    
    // Mapowanie legacy
    if (color === 'gray') color = 'grey';
    if (color === 'silver') color = 'grey';
    
    const fileName = table.stelaż[color];
    if (!fileName) return null;

    // Znajdź plik po nazwie
    return kolorystykaImages.find(img => img.name === fileName) || null;
  }
}

export const decorConverter = new DecorConverter();
export default decorConverter;