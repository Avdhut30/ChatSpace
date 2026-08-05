import { describe, expect, it } from 'vitest';
import {
  getIdentityLabel,
  isValidPhoneNumber,
  isValidUsername,
  normalizePhoneNumber,
  normalizeUsername,
} from './identity';

describe('identity helpers', () => {
  it('normalizes and validates usernames', () => {
    expect(normalizeUsername('  @Avdhut_30 ')).toBe('avdhut_30');
    expect(isValidUsername('avdhut_30')).toBe(true);
    expect(isValidUsername('two words')).toBe(false);
  });

  it('normalizes and validates international phone numbers', () => {
    expect(normalizePhoneNumber('00 91 98765-43210')).toBe('+919876543210');
    expect(isValidPhoneNumber('+91 98765 43210')).toBe(true);
    expect(isValidPhoneNumber('9876543210')).toBe(false);
  });

  it('adds the username to contact labels when available', () => {
    expect(getIdentityLabel({ name: 'Ashish', username: 'ashish_1' })).toBe(
      'Ashish (@ashish_1)'
    );
  });
});
