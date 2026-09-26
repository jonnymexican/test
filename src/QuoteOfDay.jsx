import * as React from 'react';
import { todaysQuoteOfDay } from './dailyQuote';
import { copyToClipboard } from './clipboard';
import { buildQuoteUrl } from './shareTarget';

export default function QuoteOfDay({ onViewDaily }) {
  // useState initializer keeps today's quote stable for the lifetime of the page,
  // even if the clock ticks past midnight while the tab is open.
  const [quote] = React.useState(todaysQuoteOfDay);
  const [copied, setCopied] = React.useState(null);

  React.useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async (value, kind) => {
    const ok = await copyToClipboard(value);
    setCopied(ok ? kind : 'failed');
  };

  const shareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Quote of the day',
          text: `“${quote}”`,
          url: buildQuoteUrl(quote, { daily: true }),
        });
      } catch {
        // User dismissed the share sheet — nothing to do.
      }
    }
  };

  return (
    <section className="quote-of-day" aria-label="Quote of the day">
      <p className="quote-of-day-label">Quote of the day</p>
      <p className="quote-of-day-quote">{quote}</p>
      <div className="quote-of-day-actions">
        <button type="button" className="chip" onClick={() => copy(quote, 'quote')}>
          {copied === 'quote' ? '✓ Copied!' : '📋 Copy quote'}
        </button>
        <button
          type="button"
          className="chip"
          onClick={() => copy(buildQuoteUrl(quote, { daily: true }), 'link')}
        >
          {copied === 'link' ? '✓ Link copied!' : '🔗 Copy link'}
        </button>
        {typeof navigator.share === 'function' && (
          <button type="button" className="chip" onClick={shareNative}>
            📤 Share…
          </button>
        )}
      </div>
      {onViewDaily && (
        <button type="button" className="quote-of-day-show" onClick={onViewDaily}>
          Show today's quote in the feed
        </button>
      )}
    </section>
  );
}
