import { formatDistance } from '../lib/geo';

export default function QuestCard({ quest, selected, onSelect }) {
  const doneCount = quest.checkpoints.filter((c) => c.done).length;
  const total = quest.checkpoints.length;
  const pct = Math.round((doneCount / total) * 100);

  return (
    <button
      type="button"
      className={`quest-card ${selected ? 'selected' : ''} ${quest.done ? 'done' : ''}`}
      onClick={onSelect}
      aria-expanded={selected}
    >
      <span className="quest-top">
        <span className="quest-title">{quest.title}</span>
        <span className={`quest-xp ${quest.done ? 'xp-earned' : ''}`}>
          {quest.done ? `✓ ${quest.xp} XP` : `${quest.xp} XP`}
        </span>
      </span>
      <span className="quest-meta">
        {quest.walkMinutes} min · {formatDistance(quest.distanceMeters)} · {quest.city}
      </span>
      <span
        className="quest-progress"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progress on ${quest.title}`}
      >
        <span className="quest-progress-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="quest-count">
        {doneCount}/{total} checkpoints
      </span>
    </button>
  );
}
