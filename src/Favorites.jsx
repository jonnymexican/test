export default function Favorites({ favorites, onRemove, onClear }) {
  return (
    <section className="favorites" aria-label="Favorite quotes">
      <div className="favorites-header">
        <h2 className="favorites-heading">Favorites</h2>
        {favorites.length > 0 && (
          <button
            type="button"
            className="favorites-clear"
            onClick={onClear}
            aria-label="Clear all favorite quotes"
          >
            Clear all
          </button>
        )}
      </div>
      {favorites.length === 0 ? (
        <p className="favorites-empty">
          Tap the ♥ on a quote to save it here.
        </p>
        ) : (
        <ul className="favorites-list">
          {favorites.map((quote) => (
            <li key={quote} className="favorites-item">
              <span className="favorites-quote">{quote}</span>
              <button
                type="button"
                className="favorites-remove"
                onClick={() => onRemove(quote)}
                aria-label={`Remove quote: ${quote}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
