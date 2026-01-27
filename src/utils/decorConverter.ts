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

  // Wyczyść cache
  clearCache() {
    this.table = null;
  }

  private async loadTable(): Promise<DecorMap> {
    if (this.table) return this.table;

    try {
      const response = await fetch('/decor-conversion.json?t=' + Date.now());
      this.table = await response.json();
      return this.table!;
    } catch (error) {
      console.error('Błąd ładowania tabeli:', error);
      // Fallback
      this.table = {
        stelaż: {
          white: 'white_RAL9003.webp',
          grey: 'grey_RAL9006.webp',
          black: 'black_RAL9005.webp',
        },
        blat: {
          W210: 'W210.webp',
          W240: 'W240.webp',
          W250: 'W250.webp',
        },
      };
      return this.table;
    }
  }

  async processKeywords(imageName: string): Promise<{
    highlightedText: string;
    icons: Array<{ icon: string; color: string; keyword: string }>;
  }> {
    const table = await this.loadTable();
    const icons: Array<{ icon: string; color: string; keyword: string }> = [];

    // Pobierz wszystkie słowa kluczowe dynamicznie z JSON
    const allKeywords = new Set<string>();

    // Dodaj słowa z stelaż
    if (table.stelaż) {
      Object.keys(table.stelaż).forEach((key) => allKeywords.add(key));
    }

    // Dodaj słowa z blat
    if (table.blat) {
      Object.keys(table.blat).forEach((key) => allKeywords.add(key));
    }

    let highlightedName = imageName;

    // Dla każdego słowa kluczowego - koloruj i dodaj ikonę
    for (const keyword of allKeywords) {
      const regex = new RegExp(`\\b(${keyword})\\b`, 'gi');
      if (regex.test(imageName)) {
        const color = this.getColorForKeyword(keyword);

        // Dodaj ikonę
        icons.push({
          icon: 'las la-circle',
          color: color,
          keyword: keyword,
        });

        // Koloruj w tekście
        highlightedName = highlightedName.replace(
          regex,
          `<span style="color: ${color}; font-weight: bold;">$1</span>`,
        );
      }
    }

    return {
      highlightedText: highlightedName,
      icons: icons,
    };
  }

  async findBlatImage(
    imageName: string,
    kolorystykaImages: ImageFile[],
  ): Promise<ImageFile | null> {
    const table = await this.loadTable();

    // Sprawdź wszystkie słowa kluczowe z blat
    if (table.blat) {
      for (const [key, fileName] of Object.entries(table.blat)) {
        const regex = new RegExp(`\\b${key}\\b`, 'gi');
        if (regex.test(imageName)) {
          return kolorystykaImages.find((img) => img.name === fileName) || null;
        }
      }
    }

    return null;
  }

  async findStelazImage(
    imageName: string,
    kolorystykaImages: ImageFile[],
  ): Promise<ImageFile | null> {
    const table = await this.loadTable();

    // Sprawdź wszystkie słowa kluczowe z stelaż
    if (table.stelaż) {
      for (const [key, fileName] of Object.entries(table.stelaż)) {
        const regex = new RegExp(`\\b${key}\\b`, 'gi');
        if (regex.test(imageName)) {
          return kolorystykaImages.find((img) => img.name === fileName) || null;
        }
      }
    }

    return null;
  }

  private getColorForKeyword(keyword: string): string {
    // Hash funkcja do generowania koloru na podstawie słowa kluczowego
    let hash = 0;
    for (let i = 0; i < keyword.length; i++) {
      const char = keyword.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    // Konwertuj hash na kolor HSL z wysoką saturacją
    const hue = Math.abs(hash) % 360;
    const saturation = 70 + (Math.abs(hash) % 30); // 70-100%
    const lightness = 35 + (Math.abs(hash) % 15); // 35-50% (ciemniejsze kolory)

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }

  async highlightKeywords(imageName: string): Promise<string> {
    const table = await this.loadTable();

    // Pobierz wszystkie słowa kluczowe dynamicznie z JSON
    const allKeywords = new Set<string>();

    // Dodaj słowa z stelaż
    if (table.stelaż) {
      Object.keys(table.stelaż).forEach((key) => allKeywords.add(key));
    }

    // Dodaj słowa z blat
    if (table.blat) {
      Object.keys(table.blat).forEach((key) => allKeywords.add(key));
    }

    let highlightedName = imageName;

    // Koloruj każde znalezione słowo kluczowe unikalnym kolorem
    for (const keyword of allKeywords) {
      const regex = new RegExp(`\\b(${keyword})\\b`, 'gi');
      const color = this.getColorForKeyword(keyword);
      highlightedName = highlightedName.replace(
        regex,
        `<span style="color: ${color}; font-weight: bold;">$1</span>`,
      );
    }

    return highlightedName;
  }

  /**
   * Znajduje wszystkie obrazy dla słów kluczowych w nazwie pliku
   * @returns tablica {keyword, image} dla każdego znalezionego słowa
   */
  async findAllKeywordImages(
    imageName: string,
    kolorystykaImages: ImageFile[],
  ): Promise<Array<{ keyword: string; image: ImageFile }>> {
    const table = await this.loadTable();
    const results: Array<{ keyword: string; image: ImageFile }> = [];

    // Sprawdź stelaż
    if (table.stelaż) {
      for (const [keyword, fileName] of Object.entries(table.stelaż)) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        if (regex.test(imageName)) {
          const image = kolorystykaImages.find((img) => img.name === fileName);
          if (image) {
            results.push({ keyword, image });
          }
        }
      }
    }

    // Sprawdź blat
    if (table.blat) {
      for (const [keyword, fileName] of Object.entries(table.blat)) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        if (regex.test(imageName)) {
          const image = kolorystykaImages.find((img) => img.name === fileName);
          if (image) {
            results.push({ keyword, image });
          }
        }
      }
    }

    return results;
  }
}

export const decorConverter = new DecorConverter();
export default decorConverter;
