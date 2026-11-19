import { grantsAccess, isPaidPlanKey, monthlyAmount } from './plans.js';

describe('grantsAccess', () => {
  it.each(['active', 'trialing', 'past_due'])('%s keeps Pro', (status) => {
    expect(grantsAccess(status)).toBe(true);
  });

  it.each([
    'canceled',
    'unpaid',
    'incomplete',
    'incomplete_expired',
    'paused',
    null,
    undefined,
  ])('%s means Free', (status) => {
    expect(grantsAccess(status)).toBe(false);
  });
});

describe('monthlyAmount', () => {
  it('counts monthly plans as is', () => {
    expect(monthlyAmount('pro_monthly')).toBe(900);
  });

  it('spreads yearly plans over 12 months', () => {
    expect(monthlyAmount('pro_yearly')).toBe(750);
  });
});

describe('isPaidPlanKey', () => {
  it('accepts our plans only', () => {
    expect(isPaidPlanKey('pro_monthly')).toBe(true);
    expect(isPaidPlanKey('free')).toBe(false);
    expect(isPaidPlanKey(null)).toBe(false);
  });
});
