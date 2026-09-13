import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

export function useIntersectionObserver(
  ref: RefObject<Element | null>,
  options: IntersectionObserverInit = {}
): boolean {
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
    }, options);

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [ref, options.root, options.rootMargin, options.threshold]);

  return isIntersecting;
}
