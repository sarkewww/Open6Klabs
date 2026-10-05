import { describe, expect, it } from 'vitest';
import { SubscriptionStatus, Tier } from './subscription';

// Exact member sets extracted from `.omo/_beautify/subscription.interface.js`
// and cross-checked against
// `widget/assets/subscription.interface-Z04-ZM87.js`.
// These assertions fail if any member is renamed, re-cased, re-hyphenated,
// added, or removed.

describe('SubscriptionStatus', () => {
  it('has exactly the 4 original members', () => {
    expect(Object.keys(SubscriptionStatus).sort()).toEqual(
      ['ACTIVE', 'CANCELED', 'INACTIVE', 'REVOKED'].sort(),
    );
  });

  it('maps each member to its exact original string', () => {
    expect(Object.values(SubscriptionStatus).sort()).toEqual(
      ['active', 'canceled', 'inactive', 'revoked'].sort(),
    );
  });
});

describe('Tier', () => {
  it('has exactly the 3 original members', () => {
    expect(Object.keys(Tier).sort()).toEqual(
      ['FREE', 'PRO', 'SUPPORTER'].sort(),
    );
  });

  it('maps each member to its exact original string', () => {
    expect(Object.values(Tier).sort()).toEqual(
      ['free', 'pro', 'supporter'].sort(),
    );
  });
});
