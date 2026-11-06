import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAmountToCents} from '../site/assets/amount.js';

test('accepts Brazilian monetary input and preserves exact cents', () => {
  for (const [input, cents] of [
    ['25',2500], ['25,50',2550], ['25,5',2550], ['37.45',3745],
    ['1.000',100000], ['1.234,56',123456], ['R$ 1.234,56',123456],
    [' 0,01 ',1], ['0,29',29], ['21474836,47',2147483647]
  ]) assert.equal(parseAmountToCents(input), cents, input);
});

test('rejects missing, nonpositive, malformed and out-of-range amounts', () => {
  for (const input of ['', null, ' ', '0', '0,00', '-10', '+10', '1e3', 'NaN',
    'Infinity', '25,', '1,234', '12.34,56', '25,50,00', '12abc', '<script>',
    '1 000', '21474836,48', '999999999999999999999999']) {
    assert.equal(parseAmountToCents(input), null, String(input));
  }
});
