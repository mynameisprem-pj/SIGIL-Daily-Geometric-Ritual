import { useCallback, useSyncExternalStore } from 'react';
import { soundEngine } from '../audio/soundEngine';

const subscribe = (cb: () => void) => soundEngine.subscribe(cb);
const getSnapshot = () => soundEngine.isMuted();
const getServerSnapshot = () => false;

export function useSoundSettings() {
  const muted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggleMuted = useCallback(() => {
    soundEngine.toggleMuted();
  }, []);

  return { muted, toggleMuted };
}