import * as React from 'react';
import FancyText from './FancyText';
import QuoteOfDay from './QuoteOfDay';
import Favorites from './Favorites';
import ShareMenu from './ShareMenu';
import AddQuoteForm from './AddQuoteForm';
import QuoteActions from './QuoteActions';
import useFavorites from './useFavorites';
import useQuotePool from './useQuotePool';
import useTheme from './useTheme';
import { todaysQuoteOfDay } from './dailyQuote';

export default function InspirationGenerator({children}) {
  const { pool, categories, addCustomQuote, updateCustomQuote, deleteCustomQuote } = useQuotePool();
  const [category, setCategory] = React.useState('all');
  const [index, setIndex] = React.useState(0);

  const activeQuotes = React.useMemo(() => {
    if (category === 'all') return pool;
    return pool.filter((q) => q.category === category);
  }, [pool, category]);

  const active = activeQuotes.length > 0 ? activeQuotes[index % activeQuotes.length] : null;
  const quote = active?.text ?? null;
  const isCustom = active?.category === 'custom';

  const next = () =>
    setIndex((current) => {
      let nextIndex;
      do {
        nextIndex = Math.floor(Math.random() * activeQuotes.length);
      } while (activeQuotes.length > 1 && nextIndex === current);
      return nextIndex;
    });

  const selectCategory = (id) => {
    setCategory(id);
    setIndex(0);
  };

  const { favorites, isFavorite, toggle, clear } = useFavorites();
  const { theme, toggleTheme } = useTheme();

  // Show a linked quote (?q=<text> or ?q=daily) once, on first load.
  const deepLinkApplied = React.useRef(false);
  React.useEffect(() => {
    if (deepLinkApplied.current) return;
    deepLinkApplied.current = true;

    const param = new URLSearchParams(window.location.search).get('q');
    if (!param) return;

    if (param === 'daily') {
      setCategory('all');
      const dailyIndex = pool.findIndex((q) => q.text === todaysQuoteOfDay());
      if (dailyIndex >= 0) setIndex(dailyIndex);
      document.querySelector('.quote-of-day')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      return;
    }

    const target = pool.find((q) => q.text === param);
    if (!target) return;
    setCategory(target.category);
    const categoryQuotes = target.category === 'all' ? pool : pool.filter((q) => q.category === target.category);
    setIndex(Math.max(0, categoryQuotes.findIndex((q) => q === target)));
  }, [pool]);

  const showDailyInFeed = () => {
    setCategory('all');
    setIndex(Math.max(0, pool.findIndex((q) => q.text === todaysQuoteOfDay())));
    try {
      const params = new URLSearchParams(window.location.search);
      params.set('q', 'daily');
      window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
    } catch {
      // URL cosmetics only — ignore environments that disallow it.
    }
  };

  if (!quote) {
    return (
      <>
        <QuoteOfDay onViewDaily={showDailyInFeed} />
        <p className="lead-in">No quotes in this collection yet</p>
        <AddQuoteForm onAdd={(text) => { addCustomQuote(text); setCategory('custom'); setIndex(0); }} />
        {children}
      </>
    );
  }

  return (
    <>
      <QuoteOfDay onViewDaily={showDailyInFeed} />
      <p className="lead-in">Your inspirational quote is:</p>
      <FancyText text={quote} />
      {isCustom && (
        <QuoteActions
          quote={active}
          onSave={(text) => updateCustomQuote(active.id, text)}
          onDelete={() => {
            deleteCustomQuote(active.id);
            setIndex(0);
          }}
        />
      )}
      <div className="chips" role="group" aria-label="Quote collections">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`chip ${category === c.id ? 'active' : ''}`}
            onClick={() => selectCategory(c.id)}
            aria-pressed={category === c.id}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="actions">
        <button className="next-button" onClick={next}>Inspire me again</button>
        <button
          type="button"
          className={`heart-button ${isFavorite(quote) ? 'active' : ''}`}
          onClick={() => toggle(quote)}
          aria-pressed={isFavorite(quote)}
          aria-label={isFavorite(quote) ? 'Remove quote from favorites' : 'Add quote to favorites'}
          title={isFavorite(quote) ? 'Remove from favorites' : 'Add to favorites'}
        >
          {isFavorite(quote) ? '♥' : '♡'}
        </button>
        <ShareMenu quote={quote} />
      </div>
      <AddQuoteForm onAdd={(text) => { addCustomQuote(text); selectCategory('custom'); }} />
      <Favorites favorites={favorites} onRemove={toggle} onClear={clear} />
      {children}
    </>
  );
}
