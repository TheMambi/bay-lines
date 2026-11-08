import { useSyncExternalStore } from 'react';

export const useClockMinute = (clock) =>
  useSyncExternalStore(clock.subscribe, () => Math.floor(clock.minute));

export const useClockPlaying = (clock) => useSyncExternalStore(clock.subscribe, () => clock.playing);

export const useClockSpeed = (clock) => useSyncExternalStore(clock.subscribe, () => clock.perSecond);
