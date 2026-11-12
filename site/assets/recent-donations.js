// Keep examples visibly distinct from real, confirmed payments.
const exampleAmounts = Object.freeze([1000, 2000, 1500, 1000, 3000, 1000, 2000, 1000, 1500, 2000]);
const maxVisibleTotalCents = 16000;
const money = new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'});

function relativeTime(date, now = Date.now()) {
  const paidAt = Date.parse(date);
  if (!Number.isFinite(paidAt) || paidAt > now + 60000) return '';
  const minutes = Math.max(0, Math.floor((now - paidAt) / 60000));
  if (minutes < 1) return 'Agora mesmo';
  if (minutes < 60) return `Há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Há ${days} ${days === 1 ? 'dia' : 'dias'}`;
}

export function withinVisibleLimit(amounts, limit = maxVisibleTotalCents) {
  let sum = 0;
  return amounts.filter(amount => {
    if (!Number.isInteger(amount) || amount <= 0 || amount > limit || sum + amount > limit) return false;
    sum += amount;
    return true;
  }).slice(0, 10);
}

const ticker = document.getElementById('recentDonationsTicker');
const track = document.getElementById('tickerItems');
const count = document.getElementById('tickerCounter');
const heading = document.getElementById('tickerHeading');

if (ticker && track && count && heading) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let index = 0;
  let total = 0;
  let timer;

  function display() {
    track.style.transform = `translateX(-${index * 100}%)`;
    count.textContent = `${index + 1}/${total}`;
    [...track.children].forEach((slide, i) => slide.setAttribute('aria-hidden', String(i !== index)));
  }

  function advance(direction) {
    if (!total) return;
    index = (index + direction + total) % total;
    display();
  }

  function stop() {
    clearInterval(timer);
    timer = undefined;
  }

  function start() {
    stop();
    if (total < 2 || reducedMotion.matches || document.hidden || ticker.matches(':hover, :focus-within')) return;
    timer = setInterval(() => advance(1), 4500);
  }

  function show(donations, confirmed) {
    const validAmounts = withinVisibleLimit(donations.map(donation => donation.amount_cents));
    // Keep each donation's timestamp paired with its amount when a record is excluded.
    const visible = [];
    let totalAmount = 0;
    for (const donation of donations) {
      const amount = donation.amount_cents;
      if (!Number.isInteger(amount) || amount <= 0 || totalAmount + amount > maxVisibleTotalCents) continue;
      visible.push(donation);
      totalAmount += amount;
      if (visible.length === validAmounts.length) break;
    }
    if (!visible.length) return;
    heading.textContent = 'Doações ao vivo';
    const slides = visible.map(donation => {
      const slide = document.createElement('div');
      slide.className = 'ticker-slide';
      const item = document.createElement('div');
      item.className = 'ticker-item';
      const elapsed = confirmed && typeof donation.paid_at === 'string' ? relativeTime(donation.paid_at) : '';
      item.append(document.createTextNode(confirmed ? `🟢 ${elapsed || 'Pix confirmado'} • ` : '🐾 Exemplo de contribuição • '));
      const value = document.createElement('strong');
      value.textContent = money.format(donation.amount_cents / 100);
      item.append(value);
      if (confirmed && typeof donation.city === 'string' && donation.city.trim()) {
        const city = donation.city.trim().slice(0, 70);
        item.append(document.createTextNode(` (${city})`));
      }
      slide.append(item);
      return slide;
    });
    track.replaceChildren(...slides);
    total = slides.length;
    index = 0;
    display();
    start();
  }

  ticker.querySelector('.ticker-nav-btn--prev')?.addEventListener('click', () => { advance(-1); start(); });
  ticker.querySelector('.ticker-nav-btn--next')?.addEventListener('click', () => { advance(1); start(); });
  ticker.addEventListener('mouseenter', stop);
  ticker.addEventListener('mouseleave', start);
  ticker.addEventListener('focusin', stop);
  ticker.addEventListener('focusout', start);
  document.addEventListener('visibilitychange', start);
  reducedMotion.addEventListener('change', start);

  show(exampleAmounts.map(amount_cents => ({amount_cents})), false);

  const api = document.getElementById('pixScript')?.dataset.api;
  async function loadConfirmed() {
    if (!api) return;
    try {
      const url = new URL(api, location.href);
      url.searchParams.set('action', 'recent');
      const response = await fetch(url, {credentials: 'omit', cache: 'no-store', headers: {Accept: 'application/json'}});
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data.donations) && data.donations.length) {
        if (withinVisibleLimit(data.donations.map(item => item.amount_cents)).length) show(data.donations, true);
      }
    } catch { /* Illustrative examples remain visible when the service is offline. */ }
  }

  void loadConfirmed();
  setInterval(() => { if (!document.hidden) void loadConfirmed(); }, 60000);
}
