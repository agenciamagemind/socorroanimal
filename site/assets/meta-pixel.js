// One purchase conversion per confirmed production Pix payment on this browser.
const trackedInPage = new Set();

async function paymentKey(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return `socorro_meta_purchase:${hash}`;
}

export async function trackConfirmedDonation(payment) {
  if (payment?.status !== 'paid' || payment.sandbox !== false ||
      typeof payment.token !== 'string' || !payment.token ||
      !Number.isSafeInteger(payment.amount) || payment.amount <= 0 ||
      typeof window.fbq !== 'function') return false;

  if (trackedInPage.has(payment.token)) return false;
  trackedInPage.add(payment.token);

  let key = '';
  try {
    key = await paymentKey(payment.token);
    if (localStorage.getItem(key) === '1') return false;
  } catch {
    // Browser storage may be disabled. In-page deduplication still works.
  }

  try {
    window.fbq('track', 'Purchase', {
      value: payment.amount / 100,
      currency: 'BRL'
    });
    try { if (key) localStorage.setItem(key, '1'); } catch {}
    return true;
  } catch {
    trackedInPage.delete(payment.token);
    return false;
  }
}
