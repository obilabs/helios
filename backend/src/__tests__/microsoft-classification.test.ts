/**
 * The Microsoft filing rule. Before it, guests were recognised only by "#EXT#" in the
 * sign-in name and every unlicensed account was filed as a contact, so shared
 * mailboxes and unlicensed staff vanished from the Users tab.
 */
import { describe, it, expect } from '@jest/globals';
import { isMicrosoftGuest, microsoftUserType } from '../lib/microsoft-classification.js';

describe('Microsoft account filing', () => {
  it('a Guest is a guest', () => {
    expect(microsoftUserType({ userType: 'Guest', userPrincipalName: 'a_x.com#EXT#@t.onmicrosoft.com' })).toBe('guest');
  });

  it('an invited account is a guest even when Microsoft calls it a Member', () => {
    expect(isMicrosoftGuest({ userType: 'Member', creationType: 'Invitation' })).toBe(true);
    expect(isMicrosoftGuest({ userType: 'Member', externalUserState: 'Accepted' })).toBe(true);
  });

  it('falls back to #EXT# when Graph did not say', () => {
    expect(isMicrosoftGuest({ userPrincipalName: 'b_y.com#EXT#@t.onmicrosoft.com' })).toBe(true);
  });

  it('an unlicensed member is staff, never a contact', () => {
    expect(microsoftUserType({ userType: 'Member', creationType: null, userPrincipalName: 'info@t.onmicrosoft.com' })).toBe('staff');
  });
});
