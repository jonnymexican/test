import * as React from 'react';
import FancyText from './FancyText';
import Favorites from './Favorites';
import ShareMenu from './ShareMenu';
import AddQuoteForm from './AddQuoteForm';
import QuoteActions from './QuoteActions';
import useFavorites from './useFavorites';
import useQuotePool from './useQuotePool';

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

  if (!quote) {
    return (
      <>
        <p className="lead-in">No quotes in this collection yet</p>
        <AddQuoteForm onAdd={(text) => { addCustomQuote(text); setCategory('custom'); setIndex(0); }} />
        {children}
      </>
    );
  }

  return (
    <>
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
