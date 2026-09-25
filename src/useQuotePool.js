import { useEffect, useMemo, useState } from 'react';
import quotes from './quotes';
import jungQuotes from './jungQuotes';

const STORAGE_KEY = 'get-inspired:custom-quotes';

const CLASSICS = quotes.map((text) => ({ id: null, text, category: 'classics' }));
const JUNG = jungQuotes.map((text) => ({ id: null, text, category: 'jung' }));

function makeId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `q-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadCustomQuotes() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((q) => q && typeof q.text === 'string' && q.text.trim())
      .map((q) => ({
        id: typeof q.id === 'string' && q.id ? q.id : makeId(),
        text: q.text,
        category: 'custom',
      }));
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
    setCustomQuotes((current) => [...current, { id: makeId(), text: trimmed, category: 'custom' }]);
    return true;
  };

  const updateCustomQuote = (id, text) => {
    const trimmed = text.trim();
    if (!id || !trimmed) return false;
    setCustomQuotes((current) =>
      current.map((q) => (q.id === id ? { ...q, text: trimmed } : q))
    );
    return true;
  };

  const deleteCustomQuote = (id) => {
    if (!id) return false;
    setCustomQuotes((current) => current.filter((q) => q.id !== id));
    return true;
  };

  const pool = useMemo(() => {
    const customs = customQuotes.map((q) => ({ id: q.id, text: q.text, category: 'custom' }));
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

  return { pool, categories, addCustomQuote, updateCustomQuote, deleteCustomQuote, quotesFor };
}
