import { useState, useEffect } from 'react';

/**
 * Hook do debounce'owania wartości.
 * Opóźnia aktualizację wartości o podany czas.
 * 
 * @param value - wartość do debounce'owania
 * @param delay - opóźnienie w milisekundach
 * @returns zdebounce'owana wartość
 * 
 * @example
 * const [searchTerm, setSearchTerm] = useState('');
 * const debouncedSearch = useDebounce(searchTerm, 300);
 * 
 * useEffect(() => {
 *   // API call tylko gdy użytkownik przestał pisać
 *   fetchResults(debouncedSearch);
 * }, [debouncedSearch]);
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default useDebounce;
