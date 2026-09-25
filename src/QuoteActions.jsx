import * as React from 'react';

export default function QuoteActions({ quote, onSave, onDelete }) {
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState(quote.text);
  const [error, setError] = React.useState('');

  const startEdit = () => {
    setText(quote.text);
    setError('');
    setEditing(true);
  };

  const save = (event) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      setError('The quote cannot be empty.');
      return;
    }
    if (trimmed.length > 200) {
      setError('Keep it under 200 characters.');
      return;
    }
    onSave(trimmed);
    setEditing(false);
  };

  if (editing) {
    return (
      <form className="quote-edit-form" onSubmit={save}>
        <textarea
          className="add-quote-input"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setError('');
          }}
          rows={2}
          maxLength={220}
          aria-label="Edit quote"
          autoFocus
        />
        {error && <p className="add-quote-error" role="alert">{error}</p>}
        <div className="quote-edit-buttons">
          <button type="submit" className="add-quote-submit">Save changes</button>
          <button
            type="button"
            className="quote-cancel"
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="quote-actions">
      <button
        type="button"
        className="quote-edit"
        onClick={startEdit}
        aria-label="Edit this quote"
        title="Edit quote"
      >
        ✏️ Edit
      </button>
      <button
        type="button"
        className="quote-delete"
        onClick={() => onDelete()}
        aria-label="Delete this quote"
        title="Delete quote"
      >
        🗑 Delete
      </button>
    </div>
  );
}
