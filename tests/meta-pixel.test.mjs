import test from 'node:test';
import assert from 'node:assert/strict';
import {trackConfirmedDonation} from '../site/assets/meta-pixel.js';

test('Meta Purchase is emitted only for a confirmed production donation, once per payment', async () => {
  const events = [];
  const stored = new Map();
  globalThis.window = {fbq: (...args) => events.push(args)};
  globalThis.localStorage = {
    getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value)
  };

  const payment = {status:'paid', sandbox:false, token:'test-donation-unique-1', amount:3745};
  assert.equal(await trackConfirmedDonation({...payment, status:'pending'}), false);
  assert.equal(await trackConfirmedDonation({...payment, sandbox:true}), false);
  assert.equal(await trackConfirmedDonation({...payment, amount:0}), false);
  assert.equal(await trackConfirmedDonation(payment), true);
  assert.equal(await trackConfirmedDonation(payment), false);
  assert.equal(await trackConfirmedDonation({...payment, token:'test-donation-unique-2'}), true);
  assert.deepEqual(events, [
    ['track', 'Purchase', {value:37.45, currency:'BRL'}],
    ['track', 'Purchase', {value:37.45, currency:'BRL'}]
  ]);
  assert.equal(stored.size, 2);
  assert.ok([...stored.keys()].every(key => !key.includes('test-donation-unique-')));
});
