import * as React from 'react';
import { VIBES, DURATIONS, CITIES } from '../lib/questCatalog';

export default function Welcome({ onGo, onUseLocation, locating }) {
  const [vibe, setVibe] = React.useState('all');
  const [duration, setDuration] = React.useState('quick');
  const [cityIndex, setCityIndex] = React.useState(() => Math.floor(Math.random() * CITIES.length));

  return (
    <div className="welcome">
      <header className="hero">
        <h1>
          vicinity<span className="hero-accent">Go</span>
        </h1>
        <p className="hero-tag">Micro-adventures within walking distance. No feed, no ads, no account.</p>
      </header>

      <section className="card form-card" aria-label="Adventure setup">
        <h2 className="card-title">Where to today?</h2>

        <fieldset className="field">
          <legend>Pick a vibe</legend>
          <div className="option-grid" role="radiogroup" aria-label="Vibe">
            <button
              type="button"
              role="radio"
              aria-checked={vibe === 'all'}
              className={vibe === 'all' ? 'option selected' : 'option'}
              onClick={() => setVibe('all')}
            >
              🎲 Anything
            </button>
            {VIBES.map((v) => (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={vibe === v.id}
                className={vibe === v.id ? 'option selected' : 'option'}
                onClick={() => setVibe(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend>How long have you got?</legend>
          <div className="option-grid" role="radiogroup" aria-label="Duration">
            {DURATIONS.map((d) => (
              <button
                key={d.id}
                type="button"
              role="radio"
                aria-checked={duration === d.id}
                className={duration === d.id ? 'option selected' : 'option'}
                onClick={() => setDuration(d.id)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="cta-stack">
          <button
            type="button"
            className="primary-cta"
            onClick={() => onUseLocation({ vibe, duration })}
            disabled={locating}
          >
            {locating ? '📡 Finding you…' : '📍 Use my location'}
          </button>
          <button
            type="button"
            className="secondary-cta"
            onClick={() => onGo({ vibe, duration, cityIndex })}
          >
            Or explore a district by name →
          </button>
        </div>
        <p className="fine-print">No permissions needed for the district option.</p>
      </section>
    </div>
  );
}
