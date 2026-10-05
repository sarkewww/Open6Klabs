import { motion } from 'framer-motion';
import { useParams } from '@tanstack/react-router';
import Player from './player/Player';
import { useWidgetRuntime } from './runtime';

/**
 * Shared widget root for BOTH overlay routes:
 *   /widget/amuse/$widget_token
 *   /widget/amuse/$widget_token/$profile_id
 *
 * The original overlay (widget/overlay.html) mounts this same component for
 * both route ids - `_widget_token-Be9ST3-c.js` re-exports `component` from
 * `AmuseWidget-*.js`, and the profile route re-exports the identical widget
 * entry.
 *
 * The root keeps the `data-testid="amuse-widget-root"` hook and the
 * `amuse-widget-root` class, then mounts the player wrapper (`Player`, the
 * original `Er` composition root) which renders the selected skin + cover.
 *
 * `useWidgetRuntime` is the original `Di()` bootstrap: it fetches the widget
 * settings + profile + subscription, resolves the profile settings and music
 * service, starts the matching source adapter and connects the realtime/session
 * channels. The resolved store + settings are handed to `Player` so the widget
 * renders a real skin + cover instead of an empty LOADING shell.
 */
export type WidgetRouteParams = {
  widget_token?: string;
  profile_id?: string;
};

export default function WidgetRoot() {
  const params = useParams({ strict: false }) as WidgetRouteParams;
  const widgetToken = params.widget_token ?? '';
  const profileId = params.profile_id ?? '';

  const { store, settings } = useWidgetRuntime({ widgetToken, profileId });

  return (
    <motion.div
      data-testid="amuse-widget-root"
      data-widget-token={widgetToken}
      data-profile-id={profileId}
      className="amuse-widget-root h-screen w-full overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <Player store={store} settings={settings} />
    </motion.div>
  );
}
