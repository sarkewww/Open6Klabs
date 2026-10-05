/**
 * Widget runtime barrel — the wiring layer that connects the rewrite's modules
 * (settings / adapters / realtime / session) to the React root.
 */

export {
  createWidgetBootstrap,
  createWidgetSource,
  fetchWidgetProfile,
  isMusicServiceEnabled,
  normalizeSubscriptionStatus,
  resolveActiveMusicService,
  resolveDiscordMembership,
  resolveProfileWidgetStatus,
  resolveSkinGating,
  widgetProfileUrl,
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_MUSIC_SERVICE,
  DEFAULT_PROFILE_ID,
  WIDGET_SETTINGS_URL,
  WIDGET_SUBSCRIPTION_URL,
} from './bootstrap';
export type {
  WidgetBootstrap,
  WidgetBootstrapOptions,
  WidgetBootstrapState,
  WidgetFeatureFlags,
  WidgetGeneralSettings,
  WidgetProfile,
  WidgetProfileFetchError,
  WidgetProfileFetchResult,
  WidgetSourceAdapter,
  WidgetSourceContext,
  WidgetSourceFactory,
  WidgetSubscription,
} from './bootstrap';
export { useWidgetRuntime } from './useWidgetRuntime';
export type {
  UseWidgetRuntimeOptions,
  UseWidgetRuntimeResult,
} from './useWidgetRuntime';
