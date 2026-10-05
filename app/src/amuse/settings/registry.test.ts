import { describe, expect, it } from 'vitest';
import { SubscriptionStatus } from '../types/subscription';
import { Cover, Theme } from '../types/user';
import {
  COVERS,
  FONTS,
  FONT_GROUPS,
  getAnimationById,
  getCurrentFont,
  getVisibleSkins,
  HIDE_ANIMATIONS,
  HIDE_ANIMATION_IDS,
  HIDE_DELAY_OPTIONS,
  HIDE_DELAY_VALUES,
  isSkinAvailable,
  isSkinLocked,
  isSubscriptionActive,
  SCRIPT_LABELS,
  SHOW_ANIMATIONS,
  SHOW_ANIMATION_IDS,
  Skin,
  SKINS,
  SkinTier,
  SPOTIFY_NO_COVER_IMAGE,
  THEMES,
  VISIBLE_DURATION_OPTIONS,
  VISIBLE_DURATION_VALUES,
  WINDOWS_98_PLAYER,
} from './registry';

// Every value below is copied verbatim from `.omo/_beautify/useAmuseSettings.js`
// (skin registry `c`, cover `I`, theme `E`, font `y`, durations `s`/`_`,
// animations `R`/`D`) and cross-checked against the minified
// `widget/assets/useAmuseSettings-CqN9zWcV.js`.

const skinById = (id: string) => {
  const found = SKINS.find((entry) => entry.id === id);
  if (!found) throw new Error(`unknown skin id: ${id}`);
  return found;
};

describe('registry counts', () => {
  it('matches the original 8/4/2/14/12/12', () => {
    expect(SKINS).toHaveLength(8);
    expect(COVERS).toHaveLength(4);
    expect(THEMES).toHaveLength(2);
    expect(FONTS).toHaveLength(14);
    expect(SHOW_ANIMATIONS).toHaveLength(12);
    expect(HIDE_ANIMATIONS).toHaveLength(12);
  });

  it('has 5 font groups and 24 total animation ids', () => {
    expect(FONT_GROUPS).toHaveLength(5);
    expect(SHOW_ANIMATION_IDS).toHaveLength(12);
    expect(HIDE_ANIMATION_IDS).toHaveLength(12);
    expect([...SHOW_ANIMATION_IDS, ...HIDE_ANIMATION_IDS]).toHaveLength(24);
  });
});

describe('skins', () => {
  it('has the 8 original ids in original order', () => {
    expect(SKINS.map((entry) => entry.id)).toEqual([
      'compact',
      'boxy',
      'gallery',
      'minimal',
      'macos',
      'shell',
      'windows98',
      'discord',
    ]);
  });

  it('carries tier/hasCover/isNew verbatim per skin', () => {
    expect(
      SKINS.map((entry) => [entry.id, entry.tier, entry.hasCover, entry.isNew]),
    ).toEqual([
      ['compact', SkinTier.FREE, true, false],
      ['boxy', SkinTier.FREE, true, false],
      ['gallery', SkinTier.FREE, true, false],
      ['minimal', SkinTier.FREE, true, true],
      ['macos', SkinTier.FREE, true, false],
      ['shell', SkinTier.FREE, false, false],
      ['windows98', SkinTier.PRO, true, true],
      ['discord', SkinTier.DISCORD, true, false],
    ]);
  });

  it('keeps the verbatim source field `status` in sync with `tier`', () => {
    for (const entry of SKINS) {
      expect(entry.status).toBe(entry.tier);
      expect(entry.index).toBe(entry.id);
    }
  });

  it('uses the numeric SkinTier enum values FREE=0, PRO=1, DISCORD=2', () => {
    expect(SkinTier).toEqual({ FREE: 0, PRO: 1, DISCORD: 2 });
    expect(skinById('windows98').tier).toBe(1);
    expect(skinById('discord').tier).toBe(2);
  });

  it('maps image paths verbatim', () => {
    expect(skinById('compact').image).toBe('/assets/compact-CQiUdgmT.svg');
    expect(skinById('boxy').image).toBe('/assets/boxy-BucZ6z4D.svg');
    expect(skinById('gallery').image).toBe('/assets/big-cover-DUHeEaO7.svg');
    expect(skinById('minimal').image).toBe('/assets/minimal-lTckpbhQ.svg');
    expect(skinById('macos').image).toBe('/assets/macOS-DHIESALH.svg');
    expect(skinById('shell').image).toBe('/assets/shell-fSpeMdMs.svg');
    expect(skinById('windows98').image).toBe('/assets/windows98-DTy_973X.svg');
    expect(skinById('discord').image).toBe('/assets/discord-hPuUPOwv.svg');
  });
});

describe('WINDOWS_98_PLAYER feature flag', () => {
  it('uses the original flag key', () => {
    expect(WINDOWS_98_PLAYER).toBe('WINDOWS_98_PLAYER');
  });

  it('filters out windows98 only when the flag is off', () => {
    expect(getVisibleSkins(true).map((entry) => entry.id)).toContain(
      'windows98',
    );
    expect(getVisibleSkins(true)).toHaveLength(8);
    expect(getVisibleSkins(false).map((entry) => entry.id)).not.toContain(
      'windows98',
    );
    expect(getVisibleSkins(false)).toHaveLength(7);
  });

  it('isSkinAvailable only excludes the windows98 skin', () => {
    expect(isSkinAvailable(skinById('windows98'), false)).toBe(false);
    expect(isSkinAvailable(skinById('windows98'), true)).toBe(true);
    expect(isSkinAvailable(skinById('compact'), false)).toBe(true);
  });
});

describe('covers', () => {
  it('has the 4 original covers with ids and indices', () => {
    expect(COVERS.map((entry) => entry.id)).toEqual([
      Cover.SQUARE,
      Cover.CANVAS,
      Cover.VINYL,
      Cover.NONE,
    ]);
    expect(COVERS.map((entry) => entry.index)).toEqual([
      'square',
      'video',
      'vinyl',
      'none',
    ]);
  });

  it('hasCover false only for none', () => {
    expect(COVERS.map((entry) => entry.hasCover)).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });
});

describe('themes', () => {
  it('has the 2 original themes', () => {
    expect(THEMES.map((entry) => entry.id)).toEqual([Theme.DARK, Theme.LIGHT]);
    expect(THEMES.map((entry) => entry.index)).toEqual([
      'default_dark',
      'default_light',
    ]);
  });
});

describe('fonts', () => {
  it('has the 14 original families with verbatim fontClass values', () => {
    expect(FONTS.map((font) => [font.id, font.fontClass])).toEqual([
      ['poppins', 'font-poppins'],
      ['fredoka', 'font-fredoka'],
      ['spacemono', 'font-spacemono'],
      ['silkscreen', 'font-silkscreen'],
      ['bagelFatOne', 'font-bagel-fat-one tracking-wider'],
      ['gasoekOne', 'font-gasoek-one'],
      ['zcoolKuaile', 'font-zcool-kuaile'],
      ['zcoolQingkeHuangyou', 'font-zcool-qingke-huangyou'],
      ['singleDay', 'font-single-day'],
      ['jua', 'font-jua'],
      ['russoOne', 'font-russo-one'],
      ['monomakh', 'font-monomakh'],
      ['notoSerifDisplay', 'font-noto-serif-display'],
      ['openDyslexic', 'font-open-dyslexic'],
    ]);
  });

  it('keeps every title/artist/songTime class override', () => {
    const poppins = getCurrentFont('poppins');
    expect(poppins).toMatchObject({
      titleClassName: 'text-lg font-bold',
      artistClassName: 'text-sm',
      songTimeClassName: 'text-sm font-bold',
      scripts: ['latin'],
    });
    expect(getCurrentFont('singleDay').titleClassName).toBe('text-xl');
    expect(getCurrentFont('jua').songTimeClassName).toBe(
      'text-xs leading-[22px]',
    );
  });

  it('groups fonts by script in original order', () => {
    expect(FONT_GROUPS.map((group) => group.id)).toEqual([
      'general',
      'accessibility',
      'korean',
      'chinese',
      'cyrillic',
    ]);
    expect(
      FONT_GROUPS.find((group) => group.id === 'general')?.fonts.map(
        (font) => font.id,
      ),
    ).toEqual([
      'poppins',
      'fredoka',
      'spacemono',
      'silkscreen',
      'bagelFatOne',
      'gasoekOne',
      'zcoolKuaile',
      'russoOne',
      'notoSerifDisplay',
    ]);
    expect(
      FONT_GROUPS.find((group) => group.id === 'accessibility')?.fonts.map(
        (font) => font.id,
      ),
    ).toEqual(['openDyslexic']);
  });

  it('exposes the script labels verbatim', () => {
    expect(SCRIPT_LABELS).toEqual({
      latin: null,
      korean: 'KR',
      chinese: 'CN',
      cyrillic: 'CYR',
      accessibility: 'A11Y',
    });
  });

  it('falls back to the first font for unknown ids', () => {
    expect(getCurrentFont('does-not-exist')).toBe(FONTS[0]);
  });
});

describe('duration options', () => {
  it('hide delay values are 0/5/10/20/30/40/50/60', () => {
    expect(HIDE_DELAY_VALUES).toEqual([0, 5, 10, 20, 30, 40, 50, 60]);
    expect(HIDE_DELAY_OPTIONS.map((option) => option.value)).toEqual([
      '0',
      '5',
      '10',
      '20',
      '30',
      '40',
      '50',
      '60',
    ]);
    expect(HIDE_DELAY_OPTIONS[0]).toEqual({
      label: 'No delay',
      value: '0',
    });
  });

  it('visible duration values are 5/10/15/20/25/30', () => {
    expect(VISIBLE_DURATION_VALUES).toEqual([5, 10, 15, 20, 25, 30]);
    expect(VISIBLE_DURATION_OPTIONS.map((option) => option.value)).toEqual([
      '5',
      '10',
      '15',
      '20',
      '25',
      '30',
    ]);
    expect(VISIBLE_DURATION_OPTIONS[0]).toEqual({
      label: '5 seconds',
      value: '5',
    });
  });
});

describe('animations', () => {
  it('has the 12 original show ids in order', () => {
    expect(SHOW_ANIMATION_IDS).toEqual([
      'default_in',
      'fade_in',
      'slide_in_left',
      'slide_in_right',
      'slide_in_top',
      'slide_in_bottom',
      'grow_in',
      'shrink_in',
      'swing_rotate_in_left',
      'swing_rotate_in_right',
      'tilt_in_right',
      'tilt_in_left',
    ]);
  });

  it('has the 12 original hide ids in order', () => {
    expect(HIDE_ANIMATION_IDS).toEqual([
      'default_out',
      'fade_out',
      'slide_out_left',
      'slide_out_right',
      'slide_out_top',
      'slide_out_bottom',
      'grow_out',
      'shrink_out',
      'swing_rotate_out_left',
      'swing_rotate_out_right',
      'tilt_out_right',
      'tilt_out_left',
    ]);
  });

  it('keeps verbatim names and directions', () => {
    expect(SHOW_ANIMATIONS[0]).toMatchObject({ name: 'Original' });
    expect(SHOW_ANIMATIONS[2]).toMatchObject({
      name: 'Slide',
      direction: 'left',
    });
    expect(HIDE_ANIMATIONS[11]).toMatchObject({
      name: 'Tilt',
      direction: 'left',
    });
    // Every definition carries the four required param keys.
    for (const animation of [...SHOW_ANIMATIONS, ...HIDE_ANIMATIONS]) {
      expect(animation).toHaveProperty('initial');
      expect(animation).toHaveProperty('animate');
      expect(animation).toHaveProperty('exit');
      expect(animation).toHaveProperty('transition');
    }
  });

  it('resolves size-relative offsets through the resolver', () => {
    const r = (scale = 1) => ({
      x: Math.round(scale * 400),
      y: Math.round(scale * 300),
    });
    const show = getAnimationById('default_in', r);
    // -r(0.2).y -> -(0.2 * 300) = -60
    expect(show?.initial.y).toBe(-60);
    const tilt = getAnimationById('tilt_in_right', r);
    // r(0.4).x -> 0.4 * 400 = 160
    expect(tilt?.initial.x).toBe(160);
  });

  it('looks up animations across show and hide', () => {
    expect(getAnimationById('fade_in')?.name).toBe('Fade');
    expect(getAnimationById('fade_out')?.name).toBe('Fade');
    expect(getAnimationById('nope')).toBeUndefined();
  });
});

describe('isSubscriptionActive', () => {
  it('is true only for the active status', () => {
    expect(isSubscriptionActive(SubscriptionStatus.ACTIVE)).toBe(true);
    expect(isSubscriptionActive(SubscriptionStatus.INACTIVE)).toBe(false);
    expect(isSubscriptionActive(SubscriptionStatus.CANCELED)).toBe(false);
    expect(isSubscriptionActive(SubscriptionStatus.REVOKED)).toBe(false);
    expect(isSubscriptionActive(undefined)).toBe(false);
  });
});

describe('isSkinLocked gating truth table', () => {
  const free = skinById('compact');
  const pro = skinById('windows98');
  const discord = skinById('discord');

  it('free skins are always unlocked', () => {
    expect(isSkinLocked(free, {})).toBe(false);
    expect(
      isSkinLocked(free, { subscriptionStatus: SubscriptionStatus.INACTIVE }),
    ).toBe(false);
    expect(
      isSkinLocked(free, { subscriptionStatus: SubscriptionStatus.ACTIVE }),
    ).toBe(false);
  });

  it('PRO skins require an active subscription', () => {
    expect(
      isSkinLocked(pro, { subscriptionStatus: SubscriptionStatus.INACTIVE }),
    ).toBe(true);
    expect(
      isSkinLocked(pro, { subscriptionStatus: SubscriptionStatus.ACTIVE }),
    ).toBe(false);
    // Discord membership alone does not unlock PRO skins.
    expect(
      isSkinLocked(pro, {
        hasDiscordConnection: true,
        isDiscordMember: true,
      }),
    ).toBe(true);
  });

  it('DISCORD skins unlock with discord membership', () => {
    expect(
      isSkinLocked(discord, {
        hasDiscordConnection: true,
        isDiscordMember: true,
      }),
    ).toBe(false);
  });

  it('DISCORD skins unlock with an active subscription', () => {
    expect(
      isSkinLocked(discord, { subscriptionStatus: SubscriptionStatus.ACTIVE }),
    ).toBe(false);
  });

  it('DISCORD skins are locked without membership or active subscription', () => {
    expect(isSkinLocked(discord, {})).toBe(true);
    expect(
      isSkinLocked(discord, {
        subscriptionStatus: SubscriptionStatus.INACTIVE,
      }),
    ).toBe(true);
    // Connection without membership is not enough.
    expect(
      isSkinLocked(discord, {
        hasDiscordConnection: true,
        isDiscordMember: false,
      }),
    ).toBe(true);
    // Membership without connection is not enough.
    expect(
      isSkinLocked(discord, {
        hasDiscordConnection: false,
        isDiscordMember: true,
      }),
    ).toBe(true);
  });

  it('full truth table (free/pro/discord x contexts)', () => {
    const contexts = [
      { label: 'none', context: {} },
      {
        label: 'inactive',
        context: { subscriptionStatus: SubscriptionStatus.INACTIVE },
      },
      {
        label: 'active',
        context: { subscriptionStatus: SubscriptionStatus.ACTIVE },
      },
      {
        label: 'discord member',
        context: { hasDiscordConnection: true, isDiscordMember: true },
      },
      {
        label: 'discord member + inactive',
        context: {
          hasDiscordConnection: true,
          isDiscordMember: true,
          subscriptionStatus: SubscriptionStatus.INACTIVE,
        },
      },
    ];
    const table = contexts.map(({ label, context }) => [
      label,
      isSkinLocked(free, context),
      isSkinLocked(pro, context),
      isSkinLocked(discord, context),
    ]);
    expect(table).toEqual([
      ['none', false, true, true],
      ['inactive', false, true, true],
      ['active', false, false, false],
      ['discord member', false, true, false],
      ['discord member + inactive', false, true, false],
    ]);
  });
});

describe('fallback cover image', () => {
  it('is the verbatim spotify_no_cover asset', () => {
    expect(SPOTIFY_NO_COVER_IMAGE).toBe(
      '/assets/spotify_no_cover-DlW0D82t.svg',
    );
  });
});

describe('Skin enum', () => {
  it('matches the original 8 members', () => {
    expect(Skin).toEqual({
      COMPACT: 'compact',
      BOXY: 'boxy',
      GALLERY: 'gallery',
      MACOS: 'macos',
      SHELL: 'shell',
      DISCORD: 'discord',
      MINIMAL: 'minimal',
      WINDOWS98: 'windows98',
    });
  });
});
