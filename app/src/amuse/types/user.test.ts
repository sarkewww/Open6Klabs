import { describe, expect, it } from 'vitest';
import { Cover, MusicSource, Provider, Theme } from './user';

// Exact member sets extracted from `.omo/_beautify/user.interface.js` and
// cross-checked against `widget/assets/user.interface-DOh0J4ZW.js`.
// These assertions fail if any member is renamed, re-cased, re-hyphenated,
// added, or removed.

describe('Provider', () => {
  it('has exactly the 8 original members', () => {
    expect(Object.keys(Provider).sort()).toEqual(
      [
        'DISCORD',
        'EMAIL',
        'FACEBOOK',
        'GOOGLE',
        'SPOTIFY',
        'TWITCH',
        'TWITTER',
        'YTMDESKTOP',
      ].sort(),
    );
  });

  it('maps each member to its exact original string', () => {
    expect(Object.values(Provider).sort()).toEqual(
      [
        'discord',
        'email',
        'facebook',
        'google',
        'spotify',
        'twitch',
        'twitter',
        'ytmdesktop',
      ].sort(),
    );
  });
});

describe('Cover', () => {
  it('has exactly the 4 original members', () => {
    expect(Object.keys(Cover).sort()).toEqual(
      ['CANVAS', 'NONE', 'SQUARE', 'VINYL'].sort(),
    );
  });

  it('maps each member to its exact original string', () => {
    expect(Object.values(Cover).sort()).toEqual(
      ['canvas', 'none', 'square', 'vinyl'].sort(),
    );
  });
});

describe('MusicSource', () => {
  it('has exactly the 6 original members', () => {
    expect(Object.keys(MusicSource).sort()).toEqual(
      [
        'APPLE',
        'PEAR_DESKTOP',
        'SPICETIFY',
        'SPOTIFY',
        'TIDAL',
        'YTM_DESKTOP',
      ].sort(),
    );
  });

  it('maps each member to its exact original string', () => {
    expect(Object.values(MusicSource).sort()).toEqual(
      [
        'apple-music',
        'pear-desktop',
        'spicetify',
        'spotify',
        'tidal',
        'ytm-desktop',
      ].sort(),
    );
  });
});

describe('Theme', () => {
  it('has exactly the 2 original members', () => {
    expect(Object.keys(Theme).sort()).toEqual(['DARK', 'LIGHT'].sort());
  });

  it('maps each member to its exact original string', () => {
    expect(Object.values(Theme).sort()).toEqual(
      ['default_dark', 'default_light'].sort(),
    );
  });
});
