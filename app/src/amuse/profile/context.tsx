/**
 * React context for the profile settings.
 *
 * The original shares the profile settings through the `k()` hook
 * (`useAmuseProfileSettings`, export `h` in `PlayerWindows98-ChpRHqWu.js:106`),
 * which every player component calls. This module mirrors that shared access
 * with the standard React-context pattern so the widget tree can inject
 * settings (tests / multiple roots) and read them through a hook:
 *
 *   const settings = useProfileSettings();
 *
 * With no `settings` prop / no ancestor Provider, the hook falls back to the
 * exact `DEFAULT_PROFILE_SETTINGS` from `./settings` — preserving the
 * original's `a.data?.settings || ds` fallback.
 */

import { createContext, useContext, type ReactNode } from 'react';
import {
  DEFAULT_PROFILE_SETTINGS,
  resolveProfileSettings,
  type AmuseProfileSettings,
} from './settings';

export interface ProfileSettingsContextValue {
  settings: AmuseProfileSettings;
}

/** Default context value = the built-in profile defaults. */
export const ProfileSettingsContext =
  createContext<ProfileSettingsContextValue>({
    settings: DEFAULT_PROFILE_SETTINGS,
  });

export interface ProfileSettingsProviderProps {
  children: ReactNode;
  /** Optional settings override; missing fields fall back to the defaults. */
  settings?: Partial<AmuseProfileSettings> | null;
}

/** Provides resolved profile settings (defaults when omitted). */
export function ProfileSettingsProvider({
  children,
  settings,
}: ProfileSettingsProviderProps) {
  return (
    <ProfileSettingsContext.Provider
      value={{ settings: resolveProfileSettings(settings) }}
    >
      {children}
    </ProfileSettingsContext.Provider>
  );
}

/** Returns the nearest profile settings, falling back to the defaults. */
export function useProfileSettings(): AmuseProfileSettings {
  return useContext(ProfileSettingsContext).settings;
}
