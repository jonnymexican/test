import { useEffect, useState } from 'react';

const STORAGE_KEY = 'get-inspired:favorites';

function loadFavorites() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((q) => typeof q === 'string') : [];
  } catch {
    return [];
  }
}

export default function useFavorites() {
  const [favorites, setFavorites] = useState(loadFavorites);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    } catch {
      // Storage unavailable (private mode, quota) — favorites just won't persist.
    }
  }, [favorites]);

  const isFavorite = (quote) => favorites.includes(quote);

  const toggle = (quote) =>
    setFavorites((current) =>
      current.includes(quote)
        ? current.filter((q) => q !== quote)
        : [...current, quote]
    );

  const clear = () => setFavorites([]);

  return { favorites, isFavorite, toggle, clear };
}
