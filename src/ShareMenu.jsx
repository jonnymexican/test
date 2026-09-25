import * as React from 'react';
import { buildMailtoUrl, openMailClient } from './mailto';
import { copyToClipboard } from './clipboard';

export default function ShareMenu({ quote }) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  React.useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const close = () => setOpen(false);

  const shareEmail = () => {
    openMailClient(buildMailtoUrl(quote));
    close();
  };

  const shareCopy = async () => {
    const ok = await copyToClipboard(quote);
    setCopied(ok);
    if (ok) close();
  };

  const shareX = () => {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(`“${quote}”`)}`,
      '_blank',
      'noopener,noreferrer'
    );
    close();
  };

  const shareWhatsApp = () => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`“${quote}” — shared from Get Inspired App`)}`,
      '_blank',
      'noopener,noreferrer'
    );
    close();
  };

  const shareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'An inspirational quote', text: `“${quote}”` });
      } catch {
        // User dismissed the share sheet — nothing to do.
      }
    }
    close();
  };

  return (
    <div className="share-menu" ref={containerRef}>
      <button
        type="button"
        className={`share-button ${copied ? 'copied' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Share quote"
        title="Share this quote"
      >
        {copied ? '✓ Copied!' : 'Share'}
      </button>
      {open && (
        <div className="share-popover" role="menu" aria-label="Share options">
          <button type="button" role="menuitem" className="share-option" onClick={shareEmail}>
            <span aria-hidden="true">✉️</span> Email draft
          </button>
          <button type="button" role="menuitem" className="share-option" onClick={shareCopy}>
            <span aria-hidden="true">📋</span> Copy to clipboard
          </button>
          <button type="button" role="menuitem" className="share-option" onClick={shareX}>
            <span aria-hidden="true">𝕏</span> Post on X
          </button>
          <button type="button" role="menuitem" className="share-option" onClick={shareWhatsApp}>
            <span aria-hidden="true">💬</span> WhatsApp
          </button>
          {typeof navigator.share === 'function' && (
            <button type="button" role="menuitem" className="share-option" onClick={shareNative}>
              <span aria-hidden="true">📤</span> More…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
