import { describe, it, expect } from 'vitest';
import {
  scoreFriends,
  scoreToRank,
  computeAdhdStats,
  mergeById,
  todayStr,
  addDays,
} from '../public/mc/summaries.js';

describe('FriendCredit scoring (mirrors brocredit ledgerLogic)', () => {
  const sam = { id: 'sam', name: 'Sam', createdAt: 1 };
  const emily = { id: 'emily', name: 'emily', createdAt: 2 };

  it('starts at 700 and ranks by net deltas, ties alphabetical', () => {
    const txns = [
      { id: 't1', friendId: 'sam', delta: 20 },
      { id: 't2', friendId: 'emily', delta: -25 },
    ];
    const scored = scoreFriends([emily, sam], txns);
    expect(scored[0].friend.id).toBe('sam');
    expect(scored[0].score).toBe(720);
    expect(scored[0].rank.emoji).toBe('👍');
    expect(scored[1].score).toBe(675);
    expect(scored[1].rank.emoji).toBe('📋');
  });

  it('clamps scores to 300–850', () => {
    const hero = { id: 'h', name: 'Hero', createdAt: 1 };
    const villain = { id: 'v', name: 'Villain', createdAt: 2 };
    const txns = [
      { id: 't1', friendId: 'h', delta: 500 },
      { id: 't2', friendId: 'v', delta: -900 },
    ];
    const [first, last] = scoreFriends([villain, hero], txns);
    expect(first.score).toBe(850);
    expect(last.score).toBe(300);
    expect(first.rank.id).toBe('legend');
    expect(last.rank.id).toBe('pariah');
  });

  it('maps rank tier boundaries exactly', () => {
    expect(scoreToRank(800).id).toBe('legend');
    expect(scoreToRank(799).id).toBe('good-friend');
    expect(scoreToRank(740).id).toBe('good-friend');
    expect(scoreToRank(680).id).toBe('solid');
    expect(scoreToRank(620).id).toBe('probation');
    expect(scoreToRank(550).id).toBe('flake');
    expect(scoreToRank(480).id).toBe('clown');
    expect(scoreToRank(479).id).toBe('pariah');
  });

  it('ignores malformed deltas instead of NaN-ing the score', () => {
    const j = { id: 'j', name: 'Jon', createdAt: 1 };
    const [s] = scoreFriends([j], [{ id: 't1', friendId: 'j', delta: 'oops' }]);
    expect(s.score).toBe(700);
  });
});

describe('adhdTracker stats (mirrors tasksLogic)', () => {
  const TODAY = '2026-10-04';

  it('counts a streak that includes today', () => {
    const tasks = [
      { id: 'a', done: true, completedOn: TODAY },
      { id: 'b', done: true, completedOn: '2026-10-03' },
      { id: 'c', done: true, completedOn: '2026-10-02' },
    ];
    expect(computeAdhdStats(tasks, TODAY).streak).toBe(3);
  });

  it("keeps the streak alive when today has no completions yet", () => {
    const tasks = [
      { id: 'a', done: true, completedOn: '2026-10-03' },
      { id: 'b', done: true, completedOn: '2026-10-02' },
    ];
    expect(computeAdhdStats(tasks, TODAY).streak).toBe(2);
  });

  it('breaks the streak after a missed day', () => {
    const tasks = [{ id: 'a', done: true, completedOn: '2026-10-01' }];
    expect(computeAdhdStats(tasks, TODAY).streak).toBe(0);
  });

  it('rates expectations met, rounding to the nearest percent', () => {
    const tasks = [
      { id: 'a', done: true, completedOn: TODAY, reflection: { met: true } },
      { id: 'b', done: true, completedOn: TODAY, reflection: { met: 'partial' } },
      { id: 'c', done: true, completedOn: TODAY, reflection: { met: false } },
    ];
    const stats = computeAdhdStats(tasks, TODAY);
    expect(stats.totalCompleted).toBe(3);
    expect(stats.reflected).toBe(3);
    expect(stats.expectationRate).toBe(33);
  });

  it('returns a null rate when nothing was reflected on', () => {
    expect(computeAdhdStats([{ id: 'a', done: true, completedOn: TODAY }], TODAY).expectationRate).toBeNull();
    expect(computeAdhdStats([], TODAY).expectationRate).toBeNull();
  });
});

describe('vault merging (mirrors both apps\u2019 sync rules)', () => {
  it('unions by id with newest-wins', () => {
    const local = [{ id: 'a', name: 'Old Sam', createdAt: 1 }];
    const remote = [{ id: 'a', name: 'New Sam', createdAt: 2 }, { id: 'b', name: 'emily', createdAt: 3 }];
    const merged = mergeById(local, remote, []);
    expect(merged).toHaveLength(2);
    expect(merged.find((x) => x.id === 'a').name).toBe('New Sam');
  });

  it('local wins when it is newer', () => {
    const local = [{ id: 'a', name: 'Fresh', createdAt: 10 }];
    const remote = [{ id: 'a', name: 'Stale', createdAt: 2 }];
    expect(mergeById(local, remote, [])[0].name).toBe('Fresh');
  });

  it('tombstones delete live items at least as new', () => {
    const remote = [{ id: 'a', name: 'Ghost', createdAt: 5 }];
    const merged = mergeById([], remote, [{ id: 'a', deletedAt: 6 }]);
    expect(merged).toHaveLength(0);
  });

  it('a newer live item survives an older tombstone', () => {
    const local = [{ id: 'a', name: 'Resurrected', createdAt: 100 }];
    const merged = mergeById(local, [], [{ id: 'a', deletedAt: 6 }]);
    expect(merged).toHaveLength(1);
  });
});

describe('date helpers', () => {
  it('formats local dates as YYYY-MM-DD', () => {
    expect(todayStr(new Date(2026, 9, 4))).toBe('2026-10-04');
  });

  it('walks days across month boundaries', () => {
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
