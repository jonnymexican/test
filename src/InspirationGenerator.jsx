import * as React from 'react';
import quotes from './quotes';
import FancyText from './FancyText';
import Favorites from './Favorites';
import useFavorites from './useFavorites';
import { buildMailtoUrl, openMailClient } from './mailto';

export default function InspirationGenerator({children}) {
  const [index, setIndex] = React.useState(0);
  const quote = quotes[index];
  const { favorites, isFavorite, toggle, clear } = useFavorites();
  const [sent, setSent] = React.useState(false);

  React.useEffect(() => {
    if (!sent) return undefined;
    const timer = setTimeout(() => setSent(false), 2000);
    return () => clearTimeout(timer);
  }, [sent]);

  const share = () => {
    setSent(true);
    openMailClient(buildMailtoUrl(quote));
  };
  const next = () =>
    setIndex((current) => {
      let nextIndex;
      do {
        nextIndex = Math.floor(Math.random() * quotes.length);
      } while (quotes.length > 1 && nextIndex === current);
      return nextIndex;
    });

  return (
    <>
      <p className="lead-in">Your inspirational quote is:</p>
      <FancyText text={quote} />
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
        <button
          type="button"
          className={`share-button ${sent ? 'sent' : ''}`}
          onClick={share}
          aria-live="polite"
          aria-label={sent ? 'Opening email draft' : 'Share quote by email'}
          title="Share quote by email"
        >
          {sent ? '✓ Draft ready!' : 'Share'}
        </button>
      </div>
      <Favorites favorites={favorites} onRemove={toggle} onClear={clear} />
      {children}
    </>
  );
}
