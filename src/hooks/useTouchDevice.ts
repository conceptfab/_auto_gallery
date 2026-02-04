import { useState, useEffect } from 'react';

/**
 * Wykrywa urządzenie dotykowe (tablet/mobile) przez media query.
 * (hover: none) and (pointer: coarse) = brak hovera + gruby wskaźnik (palec).
 */
export function useTouchDevice(): boolean {
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(hover: none) and (pointer: coarse)');
    setIsTouchDevice(mq.matches);

    const handler = (e: MediaQueryListEvent) => setIsTouchDevice(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isTouchDevice;
}
