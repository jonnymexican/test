import { useEffect, useMemo, useState } from 'react';
import quotes from './quotes';
import jungQuotes from './jungQuotes';

const STORAGE_KEY = 'get-inspired:custom-quotes';

const CLASSICS = quotes.map((text) => ({ text, category: 'classics' }));
const JUNG = jungQuotes.map((text) => ({ text, category: 'jung' }));

function loadCustomQuotes() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (q) => q && typeof q.text === 'string' && q.text.trim() && typeof q.category === 'string'
    );
  } catch {
    return [];
  }
}

export default function useQuotePool() {
  const [customQuotes, setCustomQuotes] = useState(loadCustomQuotes);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(customQuotes));
    } catch {
      // Storage unavailable — custom quotes just won't persist.
    }
  }, [customQuotes]);

  const addCustomQuote = (text) => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    setCustomQuotes((current) => [...current, { text: trimmed, category: 'custom' }]);
    return true;
  };

  const pool = useMemo(() => {
    const customs = customQuotes.map((q) => ({ text: q.text, category: 'custom' }));
    return [...CLASSICS, ...JUNG, ...customs];
  }, [customQuotes]);

  const categories = useMemo(
    () => [
      { id: 'all', label: 'All' },
      { id: 'classics', label: 'Classics', available: CLASSICS.length > 0 },
      { id: 'jung', label: 'Carl Jung', available: JUNG.length > 0 },
      {
        id: 'custom',
        label: 'My quotes',
        available: pool.some((q) => q.category === 'custom'),
      },
    ],
    [pool]
  );

  const quotesFor = (categoryId) => {
    if (!categoryId || categoryId === 'all') return pool;
    return pool.filter((q) => q.category === categoryId);
  };

  return { pool, categories, addCustomQuote, quotesFor };
}
