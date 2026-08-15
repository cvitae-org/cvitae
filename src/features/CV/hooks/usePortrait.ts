"use client";

import { useSyncExternalStore } from 'react';
import {
  getPortraitServerSnapshot,
  getPortraitSnapshot,
  subscribePortrait,
  type PortraitState
} from '../portrait';

/**
 * The portrait as currently configured.
 *
 * `hydrated` matters here for the same reason it does for the CV: until
 * IndexedDB has answered, "no uploaded image" and "the uploaded image has not
 * arrived yet" look identical, and the second one must not briefly draw the
 * default over someone's own photograph.
 */
export const usePortrait = (): { portrait: PortraitState; hydrated: boolean } => {
  const { data, hydrated } = useSyncExternalStore(
    subscribePortrait,
    getPortraitSnapshot,
    getPortraitServerSnapshot
  );

  return { portrait: data, hydrated };
};
