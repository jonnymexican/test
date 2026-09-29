// Full-app smoke test: renders the real App and clicks through the core
// flows the way a player would (district path — no geolocation needed).
// A failure here blocks the Pages deploy.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import App from './App';

const readProgress = () => {
  try {
    return JSON.parse(window.localStorage.getItem('vicinitygo:progress') || 'null');
  } catch {
    return null;
  }
};

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(window, 'open').mockImplementation(() => null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('vicinityGo smoke: core flows', () => {
  it('starts a district run, completes checkpoints, earns XP and shows the brag row', async () => {
    render(<App />);

    // Start a run via the no-permissions district path.
    fireEvent.click(screen.getByRole('button', { name: /explore a district by name/i }));

    // The quest list appears with a district heading and quest cards.
    await waitFor(() => expect(screen.getByRole('region', { name: /nearby quests/i })).toBeTruthy());
    const questCards = screen.getAllByRole('button').filter((b) =>
      /checkpoints/i.test(b.textContent)
    );
    expect(questCards.length).toBeGreaterThan(0);
    expect(readProgress().quests.length).toBeGreaterThan(0);

    // Open the first quest's detail view.
    const questIdUnderTest = readProgress().quests[0].id;
    fireEvent.click(questCards[0]);
    const detailRegion = screen.getByRole('region', { name: /quest:/i });
    expect(detailRegion.textContent).toContain("I'm here — done");

    // Log every checkpoint, one at a time (they all render at once).
    for (let i = 0; i < 10; i += 1) {
      const buttons = screen.queryAllByRole('button', { name: /i'm here — done/i });
      if (buttons.length === 0) break;
      fireEvent.click(buttons[0]);
      await waitFor(() => expect(screen.getAllByText('Logged ✓')).toHaveLength(i + 1));
    }
    expect(screen.queryAllByRole('button', { name: /i'm here — done/i })).toHaveLength(0);

    // Quest complete: the quest is flagged done and the brag row appears.
    await waitFor(() => expect(screen.getByText(/quest complete/i)).toBeTruthy());
    expect(screen.getByRole('button', { name: /facebook/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /whatsapp/i })).toBeTruthy();

    const doneQuest = readProgress().quests.find((q) => q.id === questIdUnderTest);
    expect(doneQuest.done).toBe(true);
    expect(doneQuest.checkpoints.every((c) => c.done)).toBe(true);
    expect(doneQuest.xp).toBeGreaterThan(0);
  });

  it('persists progress across a remount (the save system)', async () => {
    const first = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /explore a district by name/i }));
    await waitFor(() => expect(screen.getByRole('region', { name: /nearby quests/i })).toBeTruthy());
    const questsBefore = readProgress().quests.length;
    first.unmount();

    // A brand-new mount restores the run from localStorage.
    render(<App />);
    expect(screen.getByRole('region', { name: /nearby quests/i })).toBeTruthy();
    expect(readProgress().quests).toHaveLength(questsBefore);
    expect(screen.queryByRole('button', { name: /explore a district/i })).toBeNull();
  });

  it('offers export/import of progress in the footer', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /explore a district by name/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /export progress/i })).toBeTruthy());
    expect(screen.getByRole('button', { name: /import progress/i })).toBeTruthy();
  });
});
