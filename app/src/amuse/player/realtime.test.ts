import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PUSHER_APP_KEY,
  PUSHER_AUTH_ENDPOINT,
  PUSHER_SUBSCRIPTION_ERROR,
  PUSHER_SUBSCRIPTION_SUCCEEDED,
  REALTIME_WS_HOST,
  REALTIME_WS_PORT,
  USER_CHANGED_SETTINGS_EVENT,
  createPusherConfig,
  createRealtimeClient,
  createSpotifyMasterElection,
  realtimeChannelName,
  spotifyChannelName,
  type BroadcastChannelCtor,
  type BroadcastChannelLike,
  type PusherChannelLike,
  type PusherClientLike,
  type PusherFactory,
} from './realtime';
import {
  DEFAULT_PLAYER_TRACK,
  PlaybackState,
  WidgetStatus,
  createPlayerStore,
} from './store';

/* -------------------------------------------------------------------------- */
/* Fakes                                                                       */
/* -------------------------------------------------------------------------- */

class FakeChannel implements PusherChannelLike {
  readonly bindings = new Map<string, Array<(data: unknown) => void>>();
  unbindAllCount = 0;
  unsubscribeCount = 0;

  constructor(
    private readonly owner: FakePusher,
    readonly name: string,
  ) {}

  bind(event: string, handler: (data: unknown) => void): this {
    const list = this.bindings.get(event) ?? [];
    list.push(handler);
    this.bindings.set(event, list);
    return this;
  }

  unbind_all(): void {
    this.unbindAllCount += 1;
    this.bindings.clear();
  }

  unsubscribe(): void {
    this.unsubscribeCount += 1;
    this.owner.unsubscribe(this.name);
  }

  emit(event: string, data: unknown): void {
    (this.bindings.get(event) ?? []).forEach((handler) => handler(data));
  }

  hasBinding(event: string): boolean {
    return (this.bindings.get(event) ?? []).length > 0;
  }
}

class FakePusher implements PusherClientLike {
  readonly subscribed: string[] = [];
  readonly unsubscribed: string[] = [];
  readonly channels = new Map<string, FakeChannel>();
  disconnectCount = 0;

  constructor(
    readonly key: string,
    readonly options: unknown,
  ) {}

  subscribe(channel: string): PusherChannelLike {
    this.subscribed.push(channel);
    const created = new FakeChannel(this, channel);
    this.channels.set(channel, created);
    return created;
  }

  unsubscribe(channel: string): void {
    this.unsubscribed.push(channel);
    this.channels.delete(channel);
  }

  disconnect(): void {
    this.disconnectCount += 1;
  }
}

class FakeBroadcastChannel implements BroadcastChannelLike {
  static readonly instances: FakeBroadcastChannel[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  readonly messages: unknown[] = [];
  closed = false;

  constructor(readonly name: string) {
    FakeBroadcastChannel.instances.push(this);
  }

  static last(): FakeBroadcastChannel {
    const last = FakeBroadcastChannel.instances.at(-1);
    if (!last) throw new Error('no FakeBroadcastChannel created');
    return last;
  }

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  close(): void {
    this.closed = true;
  }

  receive(data: unknown): void {
    this.onmessage?.({ data });
  }
}

const heartbeat = (overrides: Record<string, unknown> = {}) => ({
  type: 'heartbeat',
  masterId: 'zzzz',
  track: {
    ...DEFAULT_PLAYER_TRACK,
    title: 'Song',
    id: 'track-1',
    duration: 120,
    is_playing: true,
  },
  playbackState: PlaybackState.PLAYING,
  widgetState: WidgetStatus.SUCCESS,
  ...overrides,
});

beforeEach(() => {
  FakeBroadcastChannel.instances.length = 0;
});

/* -------------------------------------------------------------------------- */
/* Constants / channel names                                                   */
/* -------------------------------------------------------------------------- */

describe('realtime constants', () => {
  it('keeps the exact pusher app key', () => {
    expect(PUSHER_APP_KEY).toBe('3dd5f6a0-6026-4a71-b223-e1d2697fcec3');
  });

  it('keeps the exact auth endpoint', () => {
    expect(PUSHER_AUTH_ENDPOINT).toBe('/api/pusher/realtime/auth');
  });

  it('prefixes the settings channel with private-amuse-', () => {
    expect(realtimeChannelName('wt-123')).toBe('private-amuse-wt-123');
    expect(realtimeChannelName('wt-123')).toMatch(/^private-amuse-/);
  });

  it('prefixes the spotify channel with amuse-spotify-', () => {
    expect(spotifyChannelName('wt-123')).toBe('amuse-spotify-wt-123');
  });

  it('points pusher at the local ws host with the original auth endpoint', () => {
    const config = createPusherConfig();
    expect(config.wsHost).toBe(REALTIME_WS_HOST);
    expect(config.wsPort).toBe(REALTIME_WS_PORT);
    expect(config.wssPort).toBe(REALTIME_WS_PORT);
    expect(config.forceTLS).toBe(false);
    expect(config.enabledTransports).toEqual(['ws', 'wss']);
    expect(config.channelAuthorization).toEqual({
      endpoint: PUSHER_AUTH_ENDPOINT,
      transport: 'ajax',
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Settings subscription                                                       */
/* -------------------------------------------------------------------------- */

describe('createRealtimeClient', () => {
  it('subscribes to private-amuse-${widget_token} with the exact app key/config', () => {
    const factory = vi.fn(
      (_key: string, _options: unknown) => new FakePusher('', {}),
    );
    const client = createRealtimeClient({
      widgetToken: 'wt-abc',
      onSettingsChanged: vi.fn(),
      pusherFactory: factory as unknown as PusherFactory,
    });

    client.subscribe();

    expect(factory).toHaveBeenCalledTimes(1);
    const [key, config] = factory.mock.calls[0]!;
    expect(key).toBe(PUSHER_APP_KEY);
    expect(config).toMatchObject({
      wsHost: REALTIME_WS_HOST,
      wsPort: REALTIME_WS_PORT,
      channelAuthorization: {
        endpoint: PUSHER_AUTH_ENDPOINT,
        transport: 'ajax',
      },
    });
  });

  it('binds subscription lifecycle + user_changed_settings events', () => {
    const { factory, pusher } = fakeFactory();
    const client = createRealtimeClient({
      widgetToken: 'wt-1',
      onSettingsChanged: vi.fn(),
      pusherFactory: factory,
    });

    client.subscribe();
    const channel = pusher.channels.get('private-amuse-wt-1')!;

    expect(pusher.subscribed).toEqual(['private-amuse-wt-1']);
    expect(channel.hasBinding(PUSHER_SUBSCRIPTION_SUCCEEDED)).toBe(true);
    expect(channel.hasBinding(PUSHER_SUBSCRIPTION_ERROR)).toBe(true);
    expect(channel.hasBinding(USER_CHANGED_SETTINGS_EVENT)).toBe(true);
  });

  it('triggers a settings refresh only for the active profile', () => {
    const { factory, pusher } = fakeFactory();
    const onSettingsChanged = vi.fn();
    const client = createRealtimeClient({
      widgetToken: 'wt-1',
      profileId: 'main',
      onSettingsChanged,
      pusherFactory: factory,
    });
    client.subscribe();
    const channel = pusher.channels.get('private-amuse-wt-1')!;

    channel.emit(USER_CHANGED_SETTINGS_EVENT, {
      profile_id: 'other',
      profile: { a: 1 },
    });
    expect(onSettingsChanged).not.toHaveBeenCalled();

    const payload = { profile_id: 'main', profile: { skin: 'boxy' } };
    channel.emit(USER_CHANGED_SETTINGS_EVENT, payload);
    expect(onSettingsChanged).toHaveBeenCalledTimes(1);
    expect(onSettingsChanged).toHaveBeenCalledWith(payload);
  });

  it('defaults the profile id to "main"', () => {
    const { factory, pusher } = fakeFactory();
    const onSettingsChanged = vi.fn();
    const client = createRealtimeClient({
      widgetToken: 'wt-1',
      onSettingsChanged,
      pusherFactory: factory,
    });
    expect(client.profileId).toBe('main');
    client.subscribe();
    pusher.channels
      .get('private-amuse-wt-1')!
      .emit(USER_CHANGED_SETTINGS_EVENT, {
        profile_id: 'main',
        profile: null,
      });
    expect(onSettingsChanged).toHaveBeenCalledTimes(1);
  });

  it('warns and reports subscription errors', () => {
    const { factory, pusher } = fakeFactory();
    const onSubscriptionError = vi.fn();
    const logger = { warn: vi.fn() };
    const client = createRealtimeClient({
      widgetToken: 'wt-1',
      onSettingsChanged: vi.fn(),
      onSubscriptionError,
      pusherFactory: factory,
      logger,
    });
    client.subscribe();
    const channel = pusher.channels.get('private-amuse-wt-1')!;
    const error = { message: 'nope' };

    channel.emit(PUSHER_SUBSCRIPTION_ERROR, error);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(onSubscriptionError).toHaveBeenCalledWith(error);
  });

  it('unsubscribes with unbind_all + unsubscribe on cleanup', () => {
    const { factory, pusher } = fakeFactory();
    const client = createRealtimeClient({
      widgetToken: 'wt-1',
      onSettingsChanged: vi.fn(),
      pusherFactory: factory,
    });
    const channel = client.subscribe() as FakeChannel;

    client.unsubscribe();

    expect(channel.unbindAllCount).toBe(1);
    expect(channel.unsubscribeCount).toBe(1);
    expect(pusher.channels.size).toBe(0);
  });

  it('does not subscribe without a widget token', () => {
    const { factory, pusher } = fakeFactory();
    const client = createRealtimeClient({
      widgetToken: '',
      onSettingsChanged: vi.fn(),
      pusherFactory: factory,
    });
    expect(client.subscribe()).toBeNull();
    expect(pusher.subscribed).toEqual([]);
  });
});

function fakeFactory(): { factory: PusherFactory; pusher: FakePusher } {
  const pusher = new FakePusher('', {});
  return { factory: () => pusher, pusher };
}

/* -------------------------------------------------------------------------- */
/* Spotify BroadcastChannel master election                                    */
/* -------------------------------------------------------------------------- */

describe('createSpotifyMasterElection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const createElection = (store = createPlayerStore(), instanceId = 'aaaa') =>
    createSpotifyMasterElection({
      widgetToken: 'wt-elec',
      store,
      instanceId,
      BroadcastChannelImpl:
        FakeBroadcastChannel as unknown as BroadcastChannelCtor,
    });

  it('uses the amuse-spotify-${widget_token} channel', () => {
    const election = createElection();
    expect(election.channelName).toBe('amuse-spotify-wt-elec');
    expect(election.instanceId).toBe('aaaa');
    election.stop();
  });

  it('promotes to master after 500ms with no heartbeat and sets SUCCESS', () => {
    const store = createPlayerStore();
    const election = createElection(store);

    election.start();
    expect(election.getIsMaster()).toBe(false);
    expect(FakeBroadcastChannel.last().name).toBe('amuse-spotify-wt-elec');

    vi.advanceTimersByTime(500);

    expect(election.getIsMaster()).toBe(true);
    expect(store.getState().widgetState).toBe(WidgetStatus.SUCCESS);
    expect(FakeBroadcastChannel.last().messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'heartbeat', masterId: 'aaaa' }),
      ]),
    );
    election.stop();
  });

  it('stays slave and adopts a heartbeat while waiting for election', () => {
    const store = createPlayerStore();
    const election = createElection(store);
    election.start();
    const channel = FakeBroadcastChannel.last();

    channel.receive(heartbeat());

    expect(election.getIsMaster()).toBe(false);
    expect(store.getState().currentTrack.title).toBe('Song');
    expect(store.getState().playbackState).toBe(PlaybackState.PLAYING);

    // A heartbeat was seen, so the 500ms timer must NOT promote this tab.
    vi.advanceTimersByTime(500);
    expect(election.getIsMaster()).toBe(false);
    election.stop();
  });

  it('adopts the nothing-playing empty track from a master heartbeat', () => {
    const store = createPlayerStore();
    const election = createElection(store);
    election.start();

    FakeBroadcastChannel.last().receive(
      heartbeat({
        playbackState: PlaybackState.NOTHING_PLAYING,
        widgetState: WidgetStatus.LOADING,
      }),
    );

    expect(store.getState().playbackState).toBe(PlaybackState.NOTHING_PLAYING);
    expect(store.getState().widgetState).toBe(WidgetStatus.LOADING);
    expect(store.getState().currentTrack.title).toBe('Nothing Playing');
    election.stop();
  });

  it('yields master when a lower masterId heartbeats', () => {
    const store = createPlayerStore();
    const election = createElection(store, 'aaaa');
    election.start();
    vi.advanceTimersByTime(500);
    expect(election.getIsMaster()).toBe(true);

    FakeBroadcastChannel.last().receive(heartbeat({ masterId: '0000' }));

    expect(election.getIsMaster()).toBe(false);
    election.stop();
  });

  it('does not yield to a higher masterId', () => {
    const store = createPlayerStore();
    const election = createElection(store, 'aaaa');
    election.start();
    vi.advanceTimersByTime(500);

    FakeBroadcastChannel.last().receive(heartbeat({ masterId: 'zzzz' }));

    expect(election.getIsMaster()).toBe(true);
    election.stop();
  });

  it('promotes after the master goes stale (> 6s)', () => {
    const store = createPlayerStore();
    const election = createElection(store, 'aaaa');
    election.start();
    vi.advanceTimersByTime(500);
    const channel = FakeBroadcastChannel.last();
    channel.receive(heartbeat({ masterId: '0000' }));
    expect(election.getIsMaster()).toBe(false);

    vi.advanceTimersByTime(9000);

    expect(election.getIsMaster()).toBe(true);
    election.stop();
  });

  it('broadcasts a heartbeat every 3s while master', () => {
    const store = createPlayerStore();
    const election = createElection(store);
    election.start();
    vi.advanceTimersByTime(500);
    const channel = FakeBroadcastChannel.last();
    const before = channel.messages.length;

    vi.advanceTimersByTime(3000);

    expect(channel.messages.length).toBeGreaterThan(before);
    election.stop();
  });

  it('reports master changes and cleans up on stop', () => {
    const store = createPlayerStore();
    const onMasterChange = vi.fn();
    const election = createSpotifyMasterElection({
      widgetToken: 'wt-elec',
      store,
      instanceId: 'aaaa',
      BroadcastChannelImpl:
        FakeBroadcastChannel as unknown as BroadcastChannelCtor,
      onMasterChange,
    });
    election.start();
    vi.advanceTimersByTime(500);
    const channel = FakeBroadcastChannel.last();

    expect(onMasterChange).toHaveBeenLastCalledWith(true);

    election.stop();
    expect(channel.closed).toBe(true);
    expect(election.getIsMaster()).toBe(false);
  });

  it('is a no-op when BroadcastChannel is unavailable', () => {
    const store = createPlayerStore();
    const election = createSpotifyMasterElection({
      widgetToken: 'wt-elec',
      store,
      BroadcastChannelImpl: null,
    });
    election.start();
    vi.advanceTimersByTime(2000);
    expect(election.getIsMaster()).toBe(false);
    election.stop();
  });
});
