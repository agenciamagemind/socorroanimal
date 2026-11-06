// Monetary input stays in integer cents throughout the donation flow.
export const MIN_AMOUNT_CENTS = 1;
export const MAX_AMOUNT_CENTS = 2147483647;

export function isValidAmountCents(amount) {
  return Number.isInteger(amount) && amount >= MIN_AMOUNT_CENTS && amount <= MAX_AMOUNT_CENTS;
}

export function parseAmountToCents(value) {
  let text = String(value ?? '').trim().replace(/^R\$\s*/i, '');
  if (text.includes(',')) {
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(text)) return null;
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, '');
  } else if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    return null;
  }
  const [whole, fraction = ''] = text.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return isValidAmountCents(amount) ? amount : null;
}
