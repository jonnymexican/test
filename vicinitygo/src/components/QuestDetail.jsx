import * as React from 'react';
import Radar from './Radar';
import { formatDistance, bearingDegrees, distanceMeters } from '../lib/geo';
import { buildBragText, shareToFacebook, shareToWhatsApp, shareNative, hasNativeShare } from '../lib/social';

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export default function QuestDetail({ quest, origin, onComplete }) {
  const remaining = quest.checkpoints.filter((c) => !c.done);

  return (
    <section className="card quest-detail" aria-label={`Quest: ${quest.title}`}>
      <h2 className="card-title">{quest.title}</h2>
      <p className="quest-intro">{quest.intro}</p>

      <div className="radar-wrap">
        <Radar origin={origin} checkpoints={quest.checkpoints} />
      </div>

      <ol className="checkpoint-list">
        {quest.checkpoints.map((c, i) => {
          const dist = distanceMeters(origin, c);
          const brg = COMPASS[Math.round(bearingDegrees(origin, c) / 45) % 8];
          return (
            <li key={c.id} className={c.done ? 'checkpoint done' : 'checkpoint'}>
              <span className="checkpoint-head">
                <span className="checkpoint-name">
                  {i + 1}. {c.icon} {c.name}
                </span>
                <span className="checkpoint-dist">
                  {formatDistance(dist)} · {brg}
                </span>
              </span>
              <p className="checkpoint-detail">{c.detail}</p>
              <p className="checkpoint-task">{c.task}</p>
              {!c.done && (
                <button type="button" className="check-button" onClick={() => onComplete(quest.id, c.id)}>
                  ✓ I'm here — done
                </button>
              )}
              {c.done && <span className="checkpoint-done-note">Logged ✓</span>}
            </li>
          );
        })}
      </ol>

      {remaining.length === 0 && (
        <div className="quest-complete">
          <p className="quest-complete-note">
            🎉 Quest complete — {quest.xp} XP earned. Find another one from the list!
          </p>
          <div className="brag-row" aria-label="Share your quest win">
            <span className="brag-label">Tell the group:</span>
            <button
              type="button"
              className="brag-btn"
              onClick={() => shareToFacebook(buildBragText(quest, quest.city))}
            >
              📘 Facebook
            </button>
            <button
              type="button"
              className="brag-btn"
              onClick={() => shareToWhatsApp(buildBragText(quest, quest.city))}
            >
              💬 WhatsApp
            </button>
            {hasNativeShare() && (
              <button
                type="button"
                className="brag-btn"
                onClick={() => shareNative({ title: 'vicinityGo', text: buildBragText(quest, quest.city) })}
              >
                📤 More…
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
