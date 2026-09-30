import React, { useMemo, useState } from 'react';
import { useLeague } from './useLeague';
import { OP_LABEL, dateKey } from './puzzle';

const STATUS_LABEL = { idle: '', syncing: 'syncing…', ok: 'synced', error: 'sync problem' };

function ClueRow({ clue, revealed }) {
  return (
    <li className={`clue ${revealed ? 'clue-revealed' : 'clue-hidden'}`}>
      <span className="clue-num">{revealed ? '•' : clue.i + 1}</span>
      {revealed ? (
        <span className="clue-text">
          <strong>{OP_LABEL[clue.op]}</strong> {clue.r}
        </span>
      ) : (
        <span className="clue-text clue-masked">clue #{clue.i + 1} — hidden</span>
      )}
    </li>
  );
}

function GamePanel({ league }) {
  const [guessText, setGuessText] = useState('');
  const [feedback, setFeedback] = useState(null);
  const { puzzle, solved, todayEntry, guesses } = league;

  const submit = (e) => {
    e.preventDefault();
    const values = guessText
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    if (values.length !== 4 || values.some((v) => !Number.isInteger(v))) {
      setFeedback({ kind: 'bad', text: 'Enter exactly four whole numbers, e.g. 3 5 7 8' });
      return;
    }
    if (league.solveDay(values)) {
      setFeedback(null);
      setGuessText('');
    } else {
      setFeedback({ kind: 'nope', text: 'Nope — that set breaks at least one clue.' });
    }
  };

  if (solved) {
    return (
      <section className="panel game-panel" aria-label="Today's puzzle">
        <div className="solved-banner" role="status">
          <span className="solved-emoji">🎉</span>
          <div>
            <strong>Cracked it!</strong>
            <div className="solved-detail">
              {todayEntry.guesses === 1
                ? 'First guess. Ruthless.'
                : `Solved in ${todayEntry.guesses} guesses with ${todayEntry.clues} clues.`}{' '}
              <span className="solved-score">+{todayEntry.base} pts</span>
            </div>
          </div>
        </div>
        <div className="reveal-row">
          The numbers were <strong>{puzzle.solution.join(' · ')}</strong>
        </div>
      </section>
    );
  }

  return (
    <section className="panel game-panel" aria-label="Today's puzzle">
      <form className="guess-form" onSubmit={submit}>
        <input
          className="form-input guess-input"
          type="text"
          inputMode="numeric"
          placeholder="e.g. 3 5 7 8"
          value={guessText}
          onChange={(e) => {
            setGuessText(e.target.value);
            setFeedback(null);
          }}
          aria-label="Your four numbers"
        />
        <button type="submit" className="btn-primary">
          Guess
        </button>
      </form>
      {feedback && (
        <p className={`feedback feedback-${feedback.kind}`} role="status">
          {feedback.text}
        </p>
      )}
      {guesses > 0 && !feedback && (
        <p className="feedback feedback-nope" role="status">
          {guesses} wrong {guesses === 1 ? 'guess' : 'guesses'} so far.
        </p>
      )}
    </section>
  );
}

function CluePanel({ league }) {
  const { puzzle, todayEntry, minStartingClues } = league;
  const revealed = todayEntry ? todayEntry.clues : minStartingClues;

  if (!puzzle) {
    return (
      <section className="panel" aria-label="Clues">
        <p className="muted">Today's puzzle couldn't be generated — check back tomorrow.</p>
      </section>
    );
  }

  return (
    <section className="panel" aria-label="Clues">
      <h2 className="panel-title">Clues</h2>
      <ol className="clue-list">
        {puzzle.clues.map((clue) => (
          <ClueRow key={clue.i} clue={clue} revealed={clue.i < revealed} />
        ))}
      </ol>
      {!todayEntry?.solvedAt && revealed < puzzle.clues.length && (
        <button type="button" className="btn-secondary btn-small" onClick={league.revealClue}>
          Reveal another clue (−10 pts)
        </button>
      )}
      <p className="clue-hint">
        Four distinct numbers from 2 to 9 — order never matters.
      </p>
    </section>
  );
}

function IdentityPanel({ league }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  if (league.me) {
    return (
      <section className="panel identity-panel" aria-label="Your player card">
        <div className="identity-row">
          <span className="identity-name">
            Playing as <strong>{league.me.name}</strong>
          </span>
          <button type="button" className="btn-secondary btn-small" onClick={league.signOut}>
            Leave league roster
          </button>
        </div>
      </section>
    );
  }

  const submit = (e) => {
    e.preventDefault();
    setError('');
    try {
      league.register(name);
      setName('');
    } catch {
      setError('Give yourself a name first.');
    }
  };

  return (
    <section className="panel identity-panel" aria-label="Join the roster">
      <h2 className="panel-title">Who's playing?</h2>
      <p className="muted">Pick a name — it's how you'll appear on the league board.</p>
      <form className="identity-form" onSubmit={submit}>
        <input
          className="form-input"
          type="text"
          maxLength={24}
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Player name"
        />
        <button type="submit" className="btn-primary">
          That's me
        </button>
      </form>
      {error && <p className="feedback feedback-bad">{error}</p>}
    </section>
  );
}

function LeaguePanel({ league }) {
  const [url, setUrl] = useState('https://bureau-vault.jonnymexican.workers.dev');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const todayDayNum = league.todayDayNum;

  const join = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await league.startLeague(url, code);
      setCode('');
    } catch (err) {
      const msgs = {
        network: 'Could not reach the vault URL.',
        unauthorized: 'That league code was rejected.',
        bad_response: 'The vault sent something unexpected.',
      };
      setError(msgs[err.code] || 'Could not join that league.');
    } finally {
      setBusy(false);
    }
  };

  const create = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const fresh = `PL-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;
    try {
      await league.startLeague(url, fresh);
    } catch (err) {
      setError(err.code === 'conflict' ? 'That code is taken — try again.' : 'Could not create the league.');
    } finally {
      setBusy(false);
    }
  };

  if (!league.vaultInfo) {
    return (
      <section className="panel league-panel" aria-label="Shared league">
        <h2 className="panel-title">Play a league</h2>
        <p className="muted">
          Solve alone, or share a league code with friends — scores sync both ways, like a
          FriendCredit bureau.
        </p>
        <form className="league-form" onSubmit={join}>
          <input
            className="form-input"
            type="url"
            placeholder="Vault URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-label="Vault URL"
          />
          <input
            className="form-input"
            type="text"
            placeholder="League code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-label="League code"
          />
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Joining…' : 'Join league'}
          </button>
        </form>
        <button type="button" className="btn-secondary btn-small" onClick={create} disabled={busy}>
          Start a fresh league
        </button>
        {error && <p className="feedback feedback-bad">{error}</p>}
      </section>
    );
  }

  const shareText = `🧩 Daily Puzzle League — join my league with code ${league.vaultInfo.code}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <section className="panel league-panel" aria-label="League board">
      <div className="league-status-row">
        <span className={`vault-dot vault-${league.vaultStatus}`} aria-hidden="true" />
        <span>
          League <strong>{league.vaultInfo.code}</strong>
          {STATUS_LABEL[league.vaultStatus] ? ` · ${STATUS_LABEL[league.vaultStatus]}` : ''}
          {league.vaultError ? ` · ${league.vaultError}` : ''}
        </span>
        <button type="button" className="btn-secondary btn-small" onClick={league.stopLeague}>
          Leave
        </button>
      </div>
      <div className="share-row">
        <button type="button" className="btn-secondary btn-small" onClick={copy}>
          {copied ? '✓ Copied' : 'Copy invite'}
        </button>
        <a
          className="btn-secondary btn-small"
          href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          WhatsApp
        </a>
      </div>
      {league.board.length === 0 ? (
        <p className="muted">No scores yet — solve today's puzzle to post the first one.</p>
      ) : (
        <table className="board">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Player</th>
              <th scope="col">Pts</th>
              <th scope="col">Solved</th>
              <th scope="col">🔥</th>
            </tr>
          </thead>
          <tbody>
            {league.board.map((row, i) => (
              <tr key={row.playerId} className={league.me && row.playerId === league.me.id ? 'board-me' : undefined}>
                <td>{i + 1}</td>
                <td>{row.name}</td>
                <td>{row.total}</td>
                <td>{row.solved}</td>
                <td>{row.streak > 0 ? row.streak : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted board-note">Scores counted through day {todayDayNum} ( Puzzle of {dateKey(new Date())} ).</p>
    </section>
  );
}

function TodayBoard({ league }) {
  const players = league.board;
  const solvedRows = players.filter((p) => p.today && p.today.solved);
  const unsolvedRows = players.filter((p) => p.today && !p.today.solved);
  const meSolved = league.solved;

  return (
    <section className="panel today-panel" aria-label="Today's board">
      <h2 className="panel-title">Today</h2>
      {!meSolved && (
        <p className="muted">You haven't cracked it yet — no peeking at theirs.</p>
        )}
      {meSolved && solvedRows.length === 0 && (
        <p className="muted">You're the first to crack it. Brag accordingly.</p>
      )}
      {meSolved && solvedRows.length > 0 && (
        <ul className="today-list">
          {solvedRows.map((row) => (
            <li key={row.playerId} className="today-row">
              <span className="today-name">{row.name}</span>
              <span className="today-detail">
                cracked it with {row.today.clues} clue{row.today.clues === 1 ? '' : 's'}
                {league.me && row.playerId === league.me.id ? ' (you)' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      {meSolved && unsolvedRows.length > 0 && (
        <p className="muted today-pending">
          Still thinking: {unsolvedRows.map((r) => r.name).join(', ')}
        </p>
      )}
      {players.length === 0 && (
        <p className="muted">No league joined — today it's just you vs. the numbers.</p>
      )}
    </section>
  );
}

export default function App() {
  const league = useLeague();
  const streakLabel = useMemo(() => {
    if (league.streak <= 0) return 'No streak yet';
    return `${league.streak} day${league.streak === 1 ? '' : 's'} 🔥`;
  }, [league.streak]);

  return (
    <main className="app">
      <header className="app-header">
        <h1>Daily Puzzle League</h1>
        <p className="tagline">One puzzle a day — the same one for everyone.</p>
        <div className="streak-pill" role="status">
          {streakLabel}
        </div>
      </header>

      <CluePanel league={league} />
      <GamePanel league={league} />
      <TodayBoard league={league} />
      <IdentityPanel league={league} />
      <LeaguePanel league={league} />

      <footer className="app-footer">
        Your results live on this device{league.vaultInfo ? ' and in your shared league' : ''}. No
        accounts, no tracking.{' '}
        <a className="app-footer-link" href="https://jonnymexican.github.io/test/hub.html">
          ← Jon's Apps
        </a>
      </footer>
    </main>
  );
}
