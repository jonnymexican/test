export function buildMailtoUrl(quote) {
  const subject = 'An inspirational quote for you';
  const body = `“${quote}”\n\n— shared from Get Inspired App`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function openMailClient(url) {
  window.location.href = url;
}
