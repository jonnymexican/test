import { useCallback, useRef, useState } from 'react';

export default function useGeolocation() {
  const [state, setState] = useState({
    status: 'idle', // idle | locating | granted | denied | error
    position: null,
    error: null,
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  const locate = useCallback(() => {
    if (stateRef.current.status === 'locating') return;
    if (!('geolocation' in navigator)) {
      setState({ status: 'denied', position: null, error: 'Geolocation is not supported here.' });
      return;
    }
    setState((s) => ({ ...s, status: 'locating', error: null }));
    navigator.geolocation.getCurrentPosition(
      (pos) => setState({
        status: 'granted',
        position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        error: null,
      }),
      (err) => setState({
        status: err.code === err.PERMISSION_DENIED ? 'denied' : 'error',
        position: null,
        error: err.message || 'Could not get your location.',
      }),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  return { ...state, locate };
}
