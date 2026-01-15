import { useEffect, useState } from "react";

export function useMediaQuery(query: string, defaultValue: boolean | null = false) {
  const [matches, setMatches] = useState<boolean | null>(defaultValue);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const update = () => setMatches(mediaQuery.matches);
    update();
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", update);
      return () => mediaQuery.removeEventListener("change", update);
    }
    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  }, [query]);

  return matches;
}
