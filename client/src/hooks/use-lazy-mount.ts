import { useEffect, useState } from "react";

/**
 * Держит lazy-компонент смонтированным, пока он не был открыт хотя бы раз,
 * и откладывает размонтирование, чтобы не обрывать fade-out анимацию Radix.
 * Пока возвращает false — dynamic import не триггерится и чанк не скачивается.
 */
export function useLazyMount(isOpen: boolean, unmountDelay = 300): boolean {
  const [mounted, setMounted] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      return;
    }
    if (!mounted) return;
    const timer = setTimeout(() => setMounted(false), unmountDelay);
    return () => clearTimeout(timer);
  }, [isOpen, mounted, unmountDelay]);

  return mounted;
}
