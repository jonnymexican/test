import * as React from 'react';

export default function AddQuoteForm({ onAdd }) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState('');
  const [error, setError] = React.useState('');
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    if (!saved) return undefined;
    const timer = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [saved]);

  const submit = (event) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Write a quote first.');
      return;
    }
    if (trimmed.length > 200) {
      setError('Keep it under 200 characters.');
      return;
    }
    onAdd(trimmed);
    setText('');
    setError('');
    setSaved(true);
  };

  return (
    <div className="add-quote">
      <button
        type="button"
        className="add-quote-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {saved ? '✓ Saved to My quotes!' : open ? '− Close' : '+ Add your own quote'}
      </button>
      {open && (
        <form className="add-quote-form" onSubmit={submit}>
          <textarea
            className="add-quote-input"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setError('');
            }}
            placeholder="e.g. The cave you fear to enter holds the treasure you seek. — Joseph Campbell"
            rows={2}
            maxLength={220}
            aria-label="Your quote"
            autoFocus
          />
          {error && <p className="add-quote-error" role="alert">{error}</p>}
          <button type="submit" className="add-quote-submit">Save quote</button>
        </form>
      )}
    </div>
  );
}
