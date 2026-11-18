import { expect, it } from 'vitest';
import { cardRequestAction } from './cardRequestAction';

it('does not offer a request before availability is known or when requests are disabled', () => {
  expect(cardRequestAction(null, true)).toBe('none');
  expect(cardRequestAction({ statusCategory: 'UNAVAILABLE' }, false)).toBe('none');
});
it('only offers a request for a title that is not already tracked', () => {
  expect(cardRequestAction({ statusCategory: 'UNAVAILABLE' }, true)).toBe('request');
  expect(cardRequestAction({ statusCategory: 'SEARCHING' }, true)).toBe('request');
  // Already added (or being handled): a "+" would suggest it had not been requested.
  expect(cardRequestAction({ statusCategory: 'UPCOMING' }, true)).toBe('none');
  expect(cardRequestAction({ statusCategory: 'UPCOMING', hasFreeQualityOption: true }, true)).toBe('none');
  expect(cardRequestAction({ statusCategory: 'PROCESSING', hasFreeQualityOption: true }, true)).toBe('none');
  expect(cardRequestAction({ statusCategory: 'IMPORTED', hasFreeQualityOption: true }, true)).toBe('none');
});
it('still opens the page when an available title needs a quality chosen', () => {
  expect(cardRequestAction({ statusCategory: 'AVAILABLE' }, true)).toBe('none');
  expect(cardRequestAction({ statusCategory: 'AVAILABLE', hasFreeQualityOption: true }, true)).toBe('details');
});
it('does not offer duplicate or blocked requests', () => {
  expect(cardRequestAction({ statusCategory: 'UNAVAILABLE', requestStatus: 'approved' }, true)).toBe('none');
  expect(cardRequestAction({ statusCategory: 'BLACKLISTED', hasFreeQualityOption: true }, true)).toBe('none');
});
