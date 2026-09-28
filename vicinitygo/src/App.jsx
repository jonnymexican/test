import * as React from 'react';
import Welcome from './components/Welcome';
import StatsBar from './components/StatsBar';
import QuestCard from './components/QuestCard';
import QuestDetail from './components/QuestDetail';
import BackupRestore from './components/BackupRestore';
import AppNav from './components/AppNav';
import useGeolocation from './lib/useGeolocation';
import useVicinityStore from './lib/useVicinityStore';
import { hashSeed, cityNameFor, offsetLatLng } from './lib/questEngine';
import { CITIES } from './lib/questCatalog';
import { fetchRealPlaces, fetchPlaceName } from './lib/osmPlaces';
import { composeRealQuests, DURATION_MAX_KM } from './lib/realQuests';
import { parseShareTarget } from './lib/shareIntake';

export default function App() {
  const geo = useGeolocation();
  const store = useVicinityStore();
  const [selectedQuestId, setSelectedQuestId] = React.useState(null);
  const pendingRef = React.useRef(null);
  const startedRef = React.useRef(false);
  const [realStatus, setRealStatus] = React.useState(null); // 'loading' | 'live' | 'fallback'
  const [shared, setShared] = React.useState(() => {
    try {
      return parseShareTarget(new URLSearchParams(window.location.search));
    } catch {
      return null;
    }
  });

  const runActive = store.origin != null && store.quests.length > 0;

  const loadSharedPoint = React.useCallback(
    (intake) => {
      if (!intake?.coords) return;
      startedRef.current = true;
      setRealStatus('loading');
      const { lat, lng } = intake.coords;
      const origin = { lat, lng };
      const seed = hashSeed(`share:${lat}:${lng}`);

      (async () => {
        let city = 'Shared place';
        let quests = null;
        try {
          const places = await fetchRealPlaces(origin, { maxKm: DURATION_MAX_KM.quick });
          const named = await fetchPlaceName(origin, city);
          city = named;
          if (places.length >= 4) {
            quests = composeRealQuests(places, origin, { city, duration: 'quick', seed });
            setRealStatus('live');
          }
        } catch {
          // fall through to fictional districts around the shared point
        }
        if (!quests) {
          setRealStatus('fallback');
        }
        store.startRun({ origin, city, vibe: 'all', duration: 'quick', seed, quests });
        // Consume the share so a reload (or a later "New adventure") doesn't
        // resurrect a stale intake.
        window.history.replaceState(null, '', window.location.pathname);
        setShared(null);
      })();
    },
    [store]
  );

  // A share-target launch lands on start_url with ?title/text/url; turn it
  // into a run centered on the shared point (only when no run is active).
  React.useEffect(() => {
    if (!shared?.coords || runActive) return;
    loadSharedPoint(shared);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When GPS comes back, try real OSM places first; fall back to the
  // fictional districts if Overpass is down or returns too little.
  React.useEffect(() => {
    if (geo.status !== 'granted' || !geo.position || startedRef.current) return;
    startedRef.current = true;
    const { lat, lng } = geo.position;
    const pending = pendingRef.current ?? { vibe: 'all', duration: 'quick' };
    const seed = hashSeed(`${Math.round(lat)}:${Math.round(lng)}:${pending.vibe}:${pending.duration}`);
    const fallbackCity = cityNameFor(geo.position, seed);

    let cancelled = false;
    setRealStatus('loading');

    (async () => {
      let city = fallbackCity;
      let quests = null;
      try {
        const places = await fetchRealPlaces(geo.position, {
          maxKm: DURATION_MAX_KM[pending.duration] ?? 1.4,
        });
        const named = await fetchPlaceName(geo.position, fallbackCity);
        city = named;
        if (!cancelled && places.length >= 4) {
          quests = composeRealQuests(places, geo.position, {
            city,
            duration: pending.duration,
            seed,
          });
          setRealStatus('live');
        }
      } catch {
        // fall through to the fictional districts
      }
      if (cancelled) return;
      if (!quests) setRealStatus('fallback');
      store.startRun({
        origin: geo.position,
        city,
        vibe: pending.vibe,
        duration: pending.duration,
        seed,
        quests,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [geo.status, geo.position]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUseLocation = ({ vibe, duration }) => {
    startedRef.current = false;
    setRealStatus(null);
    pendingRef.current = { vibe, duration };
    geo.locate();
  };

  // District mode: deterministic fictional coordinates per district.
  const handleDistrict = ({ vibe, duration, cityIndex }) => {
    startedRef.current = true;
    setRealStatus(null);
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
        <AppNav current="/test/vicinitygo/" />
        {shared && (
          <div className="toast" role="status">
            {shared.coords ? (
              <>
                <strong>Shared place received{shared.label ? `: “${shared.label}”` : ''}.</strong>{' '}
                Want a micro-adventure around it?
                <div className="cta-row">
                  <button type="button" className="primary-cta" onClick={() => loadSharedPoint(shared)}>
                    Generate quests here
                  </button>
                  <button type="button" className="secondary-cta" onClick={() => setShared(null)}>
                    Not now
                  </button>
                </div>
              </>
            ) : (
              <>
                <strong>Shared: “{shared.label}”.</strong> We couldn't find map coordinates in
                that — share a Maps or OpenStreetMap link instead.
                <div className="cta-row">
                  <button type="button" className="secondary-cta" onClick={() => setShared(null)}>
                    Dismiss
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        <Welcome onGo={handleDistrict} onUseLocation={handleUseLocation} locating={geo.status === 'locating' || realStatus === 'loading'} />
        {realStatus === 'loading' && (
          <div className="toast" role="status">
            <strong>Finding real places near you…</strong> Asking OpenStreetMap what's within
            walking distance.
          </div>
        )}
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
      <AppNav current="/test/vicinitygo/" />
      <StatsBar stats={store.stats} onNewAdventure={store.endRun} />
      {realStatus === 'fallback' && (
        <div className="toast toast-error" role="status">
          Couldn't reach the map just now — running a fictional district instead. Try your location
          again later for real quests.
        </div>
      )}
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
            {store.quests.some((q) => q.real)
              ? 'Real places from OpenStreetMap. '
              : ''}
            Progress saves on this device. Checkpoints are honor-system — the adventure is the point.
          </p>
          <BackupRestore />
        </section>
        {selectedQuest && (
          <QuestDetail quest={selectedQuest} origin={store.origin} onComplete={store.completeCheckpoint} />
        )}
      </main>
    </div>
  );
}
