import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the app title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/get inspired/i);
  });

  it('shows an inspirational quote', () => {
    render(<App />);
    expect(screen.getByText(/your inspirational quote is:/i)).toBeInTheDocument();
  });

  it('shows a new quote when the button is clicked', () => {
    render(<App />);
    const quote = screen.getByRole('heading', { level: 3 });
    const firstQuote = quote.textContent;

    fireEvent.click(screen.getByRole('button', { name: /inspire me again/i }));

    expect(quote.textContent).not.toBe(firstQuote);
  });

  it('renders the copyright', () => {
    render(<App />);
    expect(screen.getByText(/©️ 2004/i)).toBeInTheDocument();
  });
});
