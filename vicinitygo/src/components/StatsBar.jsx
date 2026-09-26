export default function StatsBar({ stats, onNewAdventure }) {
  return (
    <header className="stats-bar">
      <div className="stats-left">
        <span className="level-badge">Lv {stats.level}</span>
        <div className="xp-track" role="progressbar" aria-label="Experience to next level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={stats.intoLevel}>
          <div className="xp-fill" style={{ width: `${stats.intoLevel}%` }} />
        </div>
        <span className="xp-text">
          {stats.xp} XP · {stats.questsDone}/{stats.questsTotal} quests
        </span>
      </div>
      <button type="button" className="new-adventure" onClick={onNewAdventure}>
        ↺ New
      </button>
    </header>
  );
}
