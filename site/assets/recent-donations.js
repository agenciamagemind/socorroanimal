// Keep illustrative amounts visibly distinct from actual confirmed payments.
const exampleAmounts = Object.freeze([1000, 2000, 1500, 1000, 3000, 1000, 2000, 1000, 1500, 2000]);
const maxVisibleTotalCents = 16000;
const money = new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'});

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

  function show(amounts, confirmed) {
    const visible = withinVisibleLimit(amounts);
    if (!visible.length) return;
    heading.textContent = confirmed ? 'Doações confirmadas:' : 'Exemplos de contribuições:';
    const slides = visible.map(amount => {
      const slide = document.createElement('div');
      slide.className = 'ticker-slide';
      const item = document.createElement('div');
      item.className = 'ticker-item';
      item.append(document.createTextNode(confirmed ? '🟢 Pix confirmado • ' : '🐾 Valor ilustrativo • '));
      const value = document.createElement('strong');
      value.textContent = money.format(amount / 100);
      item.append(value);
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

  show(exampleAmounts, false);

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
        const amounts = data.donations.map(item => item.amount_cents);
        if (withinVisibleLimit(amounts).length) show(amounts, true);
      }
    } catch { /* Illustrative examples remain visible when the service is offline. */ }
  }

  void loadConfirmed();
  setInterval(() => { if (!document.hidden) void loadConfirmed(); }, 60000);
}
