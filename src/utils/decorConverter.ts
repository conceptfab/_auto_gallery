import { ImageFile } from '@/src/types/gallery';
import { logger } from '@/src/utils/logger';

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

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      // Walidacja struktury
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid JSON structure');
      }

      this.table = data;
      return this.table!;
    } catch (error) {
      logger.error('Błąd ładowania tabeli dekorów', error);

      // Zwróć pusty fallback zamiast hardcoded danych
      this.table = {
        stelaż: {},
        blat: {},
      };
      return this.table!;
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
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Szukaj słowa kluczowego otoczonego przez podkreślenia, spacje, myślniki lub granice słowa
      let regex = new RegExp(
        `(?:^|_|\\s|-|\\b)(${escapedKeyword})(?:_|\\s|-|\\b|$)`,
        'gi',
      );
      if (regex.test(imageName)) {
        const color = this.getColorForKeyword(keyword);

        // Dodaj ikonę
        icons.push({
          icon: 'las la-circle',
          color: color,
          keyword: keyword,
        });

        // Koloruj w tekście - użyj regex bez lookahead/lookbehind dla replace
        const replaceRegex = new RegExp(`(${escapedKeyword})`, 'gi');
        highlightedName = highlightedName.replace(
          replaceRegex,
          `<span style="color: ${color}; font-weight: 400; font-size: 0.75em;">$1</span>`,
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
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Szukaj słowa kluczowego otoczonego przez podkreślenia, spacje, myślniki lub granice słowa
        let regex = new RegExp(
          `(?:^|_|\\s|-|\\b)${escapedKey}(?:_|\\s|-|\\b|$)`,
          'gi',
        );
        if (regex.test(imageName)) {
          return kolorystykaImages.find((img) => img.name === fileName) || null;
        }
        // Fallback: spróbuj bez granic
        regex = new RegExp(escapedKey, 'gi');
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
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Szukaj słowa kluczowego otoczonego przez podkreślenia, spacje, myślniki lub granice słowa
        let regex = new RegExp(
          `(?:^|_|\\s|-|\\b)${escapedKey}(?:_|\\s|-|\\b|$)`,
          'gi',
        );
        if (regex.test(imageName)) {
          return kolorystykaImages.find((img) => img.name === fileName) || null;
        }
        // Fallback: spróbuj bez granic
        regex = new RegExp(escapedKey, 'gi');
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
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Szukaj słowa kluczowego otoczonego przez podkreślenia, spacje, myślniki lub granice słowa
      let regex = new RegExp(
        `(?:^|_|\\s|-|\\b)(${escapedKeyword})(?:_|\\s|-|\\b|$)`,
        'gi',
      );
      if (regex.test(imageName)) {
        const color = this.getColorForKeyword(keyword);
        // Koloruj w tekście - użyj regex bez lookahead/lookbehind dla replace
        const replaceRegex = new RegExp(`(${escapedKeyword})`, 'gi');
        highlightedName = highlightedName.replace(
          replaceRegex,
          `<span style="color: ${color}; font-weight: 400; font-size: 0.75em;">$1</span>`,
        );
      }
    }

    return highlightedName;
  }

  /**
   * Styluje słowa kluczowe w finalnej, wyświetlanej nazwie pliku (już sformatowanej, uppercase).
   * Zawsze stosuje styl (font-weight, font-size). Kolor tylko gdy useColors === true.
   */
  async highlightKeywordsInDisplayName(
    displayName: string,
    useColors: boolean = true,
  ): Promise<string> {
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

    let highlightedName = displayName;

    // Dla każdego słowa kluczowego: zawsze inny styl (klasa + inline), kolor tylko gdy useColors
    const styleBase = 'font-weight: 500; font-size: 0.72em;';
    for (const keyword of allKeywords) {
      const keywordUpper = keyword.toUpperCase();
      const escapedKeywordUpper = this.escapeRegex(keywordUpper);
      const displayRegex = new RegExp(
        `(?:^|\\s|-|\\b)(${escapedKeywordUpper})(?:\\s|-|\\b|$)`,
        'g',
      );
      if (displayRegex.test(displayName)) {
        const style = useColors
          ? `color: ${this.getColorForKeyword(keyword)}; ${styleBase}`
          : styleBase;
        const replaceRegex = new RegExp(`(${escapedKeywordUpper})`, 'g');
        highlightedName = highlightedName.replace(
          replaceRegex,
          `<span class="keyword" style="${style}">$1</span>`,
        );
      }
    }

    return highlightedName;
  }

  /**
   * Escapuje specjalne znaki regex w stringu
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    const foundKeywords: Array<{
      keyword: string;
      fileName: string;
      position: number;
    }> = [];

    logger.debug('findAllKeywordImages', imageName, {
      kolorystykaImagesCount: kolorystykaImages.length,
      stelażKeywords: table.stelaż ? Object.keys(table.stelaż) : [],
      blatKeywords: table.blat ? Object.keys(table.blat) : [],
    });

    // Zbierz wszystkie słowa kluczowe z ich pozycjami w nazwie pliku
    const allKeywords: Array<{
      keyword: string;
      fileName: string;
      category: string;
    }> = [];

    // Dodaj słowa z stelaż
    if (table.stelaż) {
      for (const [keyword, fileName] of Object.entries(table.stelaż)) {
        allKeywords.push({ keyword, fileName, category: 'stelaż' });
      }
    }

    // Dodaj słowa z blat
    if (table.blat) {
      for (const [keyword, fileName] of Object.entries(table.blat)) {
        allKeywords.push({ keyword, fileName, category: 'blat' });
      }
    }

    // Znajdź wszystkie słowa kluczowe i zapisz ich pozycje w nazwie pliku
    console.log(
      '🔍 findAllKeywordImages - szukam słów kluczowych w:',
      imageName,
    );
    console.log(
      '🔍 Dostępne słowa kluczowe:',
      allKeywords.map((k) => k.keyword),
    );

    for (const { keyword, fileName } of allKeywords) {
      // Escapuj specjalne znaki i użyj elastycznego wyszukiwania
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Użyj prostszego podejścia - znajdź wszystkie wystąpienia i sprawdź granice
      const regex = new RegExp(escapedKeyword, 'gi');
      let match: RegExpExecArray | null;

      // Reset regex przed każdym użyciem
      regex.lastIndex = 0;

      console.log(
        `🔍 Sprawdzam słowo kluczowe: "${keyword}" (escaped: "${escapedKeyword}")`,
      );

      // Sprawdź wszystkie wystąpienia i zweryfikuj czy są otoczone odpowiednimi znakami
      while ((match = regex.exec(imageName)) !== null) {
        const position = match.index;
        const before = position > 0 ? imageName[position - 1] : '';
        const after =
          position + match[0].length < imageName.length
            ? imageName[position + match[0].length]
            : '';
        // Sprawdź czy jest otoczone przez podkreślenia, spacje, myślniki lub granice słowa
        // Używamy prostszego podejścia - sprawdzamy czy przed/po jest podkreślenie, spacja, myślnik lub brak znaku (początek/koniec)
        const isValidBoundary = (char: string) => {
          if (!char) return true; // Początek lub koniec stringa
          return /[_\s-]/.test(char); // Podkreślenie, spacja lub myślnik
        };

        const beforeValid = isValidBoundary(before);
        const afterValid = isValidBoundary(after);

        console.log(`  📍 Znaleziono "${keyword}" na pozycji ${position}:`, {
          przed: before || '(początek)',
          po: after || '(koniec)',
          przedOK: beforeValid,
          poOK: afterValid,
          fragment: imageName.substring(
            Math.max(0, position - 5),
            position + match[0].length + 5,
          ),
        });

        if (beforeValid && afterValid) {
          foundKeywords.push({ keyword, fileName, position });
          console.log(
            `✅ DODANO słowo kluczowe: "${keyword}" dla pliku: ${fileName}`,
          );
          break; // Znaleziono pierwsze poprawne wystąpienie
        } else {
          console.log(`❌ ODRZUCONO "${keyword}" - nieprawidłowe granice`);
        }
      }

      if (!match) {
        console.log(`⚠️ Nie znaleziono "${keyword}" w nazwie pliku`);
      }
    }

    console.log(
      '🔍 Znalezione słowa kluczowe:',
      foundKeywords.map((k) => k.keyword),
    );

    // Posortuj według pozycji w nazwie pliku
    foundKeywords.sort((a, b) => a.position - b.position);

    // Znajdź obrazy dla posortowanych słów kluczowych
    const results: Array<{ keyword: string; image: ImageFile }> = [];
    for (const { keyword, fileName } of foundKeywords) {
      const image = kolorystykaImages.find((img) => img.name === fileName);
      if (image) {
        logger.debug('Znaleziono obraz dla słowa', image.name, keyword);
        results.push({ keyword, image });
      } else {
        logger.debug(
          'Nie znaleziono obrazu w kolorystykaImages',
          fileName,
          kolorystykaImages.map((img) => img.name),
        );
      }
    }

    logger.debug(
      'findAllKeywordImages zwraca',
      results.length,
      'wyników dla',
      imageName,
      results.map((r) => r.keyword),
    );
    return results;
  }

  /**
   * Znajduje wszystkie słowa kluczowe w nazwie pliku i zwraca ich listę
   */
  async findKeywordsInName(imageName: string): Promise<string[]> {
    const table = await this.loadTable();
    const foundKeywords: string[] = [];

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

    // Sprawdź które słowa kluczowe występują w nazwie pliku
    // Używamy bardziej elastycznego regex - szukamy zarówno z word boundary jak i bez
    for (const keyword of allKeywords) {
      // Escapuj specjalne znaki regex w keyword
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Szukaj słowa kluczowego otoczonego przez podkreślenia, spacje, myślniki lub granice słowa
      let regex = new RegExp(
        `(?:^|_|\\s|-|\\b)${escapedKeyword}(?:_|\\s|-|\\b|$)`,
        'gi',
      );
      let found = regex.test(imageName);

      // Jeśli nie znaleziono z elastycznym regex, spróbuj bez granic (dla pełnego dopasowania)
      if (!found) {
        regex = new RegExp(escapedKeyword, 'gi');
        found = regex.test(imageName);
      }

      if (found) {
        foundKeywords.push(keyword);
        logger.debug('findKeywordsInName: znaleziono', keyword, 'w', imageName);
      } else {
        logger.debug(
          'findKeywordsInName: NIE znaleziono',
          keyword,
          'w',
          imageName,
        );
      }
    }

    logger.debug(
      'findKeywordsInName dla',
      imageName,
      'znaleziono',
      foundKeywords.length,
      'słów:',
      foundKeywords,
    );
    return foundKeywords;
  }
}

export const decorConverter = new DecorConverter();
export default decorConverter;
