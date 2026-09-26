import * as React from 'react';
import Welcome from './components/Welcome';
import StatsBar from './components/StatsBar';
import QuestCard from './components/QuestCard';
import QuestDetail from './components/QuestDetail';
import useGeolocation from './lib/useGeolocation';
import useVicinityStore from './lib/useVicinityStore';
import { hashSeed, cityNameFor, offsetLatLng } from './lib/questEngine';
import { CITIES } from './lib/questCatalog';

export default function App() {
  const geo = useGeolocation();
  const store = useVicinityStore();
  const [selectedQuestId, setSelectedQuestId] = React.useState(null);
  const pendingRef = React.useRef(null);
  const startedRef = React.useRef(false);

  const runActive = store.origin != null && store.quests.length > 0;

  // When GPS comes back with a position, start the run with the pending filters.
  React.useEffect(() => {
    if (geo.status !== 'granted' || !geo.position || startedRef.current) return;
    startedRef.current = true;
    const pending = pendingRef.current ?? { vibe: 'all', duration: 'quick' };
    const seed = hashSeed(`${Math.round(geo.position.lat)}:${Math.round(geo.position.lng)}:${pending.vibe}:${pending.duration}`);
    const city = cityNameFor(geo.position, seed);
    store.startRun({ origin: geo.position, city, vibe: pending.vibe, duration: pending.duration, seed });
  }, [geo.status, geo.position]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUseLocation = ({ vibe, duration }) => {
    startedRef.current = false;
    pendingRef.current = { vibe, duration };
    geo.locate();
  };

  // District mode: deterministic fictional coordinates per district.
  const handleDistrict = ({ vibe, duration, cityIndex }) => {
    startedRef.current = true;
    const base = { lat: 47.6062 + cityIndex * 0.045, lng: -122.3321 + cityIndex * 0.06 };
    const origin = offsetLatLng(base, 400 + cityIndex * 350, cityIndex * 72);
    const seed = hashSeed(`district:${cityIndex}:${vibe}:${duration}`);
    const city = CITIES[cityIndex].name;
    store.startRun({ origin, city, vibe, duration, seed });
    setSelectedQuestId(null);
  };

  const selectedQuest = store.quests.find((q) => q.id === selectedQuestId) ?? null;

  if (!runActive) {
    return (
      <div className="app-shell">
        <Welcome onGo={handleDistrict} onUseLocation={handleUseLocation} locating={geo.status === 'locating'} />
        {(geo.status === 'denied' || geo.status === 'error') && (
          <div className="toast toast-error" role="alert">
            <strong>{geo.status === 'denied' ? 'Location unavailable.' : 'Location error.'}</strong>{' '}
            {geo.error}. You can still explore a district by name below.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <StatsBar stats={store.stats} onNewAdventure={store.endRun} />
      <main className="run-layout">
        <section className="quest-list" aria-label="Nearby quests">
          <h2 className="list-title">
            {store.quests.length} quests near {store.city}
          </h2>
          {store.quests.map((q) => (
            <QuestCard
              key={q.id}
              quest={q}
              selected={q.id === selectedQuestId}
              onSelect={() => setSelectedQuestId(q.id === selectedQuestId ? null : q.id)}
            />
          ))}
          <p className="fine-print">
            Progress saves on this device. Checkpoints are honor-system — the adventure is the point.
          </p>
        </section>
        {selectedQuest && (
          <QuestDetail quest={selectedQuest} origin={store.origin} onComplete={store.completeCheckpoint} />
        )}
      </main>
    </div>
  );
}
