(() => {
  'use strict';
  const opener = document.getElementById('mainDonateBtn');
  if (!opener) return;
  const script = document.currentScript;
  const endpoint = new URL(script.dataset.api, script.src);
  const authKey = 'socorro_pix_auth:' + endpoint.pathname;
  let sessionToken = '';
  try { sessionToken = sessionStorage.getItem(authKey) || ''; } catch {}
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const banner = new URL('checkout-banner.jpg', script.src).href;
  const dialog = document.createElement('dialog');
  dialog.id = 'pixDialog';
  dialog.className = 'pix-dialog';
  dialog.setAttribute('aria-labelledby', 'pixTitle');
  dialog.innerHTML = `
    <button type="button" class="pix-close" aria-label="Fechar pagamento Pix">×</button>
    <img class="pix-banner" alt="Sua ajuda importa muito. Obrigado por estar ajudando." width="2000" height="500">
    <div class="pix-body">
      <p class="pix-sandbox" hidden>Ambiente de teste: este Pix não movimenta dinheiro.</p>
      <h2 id="pixTitle">Sua ajuda faz a diferença</h2>
      <p class="pix-amount" id="pixAmount"></p>
      <div class="pix-loading" role="status"><span class="pix-spinner" aria-hidden="true"></span><p>Preparando seu Pix…</p></div>
      <div class="pix-details" hidden>
        <div class="pix-qr" role="img" aria-label="QR Code do Pix da sua doação"></div>
        <div class="pix-instructions">
          <h3>Como ajudar pelo Pix</h3>
          <p>Abra o aplicativo do seu banco e escaneie o QR Code ou use o Pix Copia e Cola.</p>
          <p>Confira o valor e os dados do recebedor antes de confirmar.</p>
          <p class="pix-expiry" hidden></p>
        </div>
        <label for="pixCopyCode">Pix Copia e Cola</label>
        <textarea id="pixCopyCode" readonly rows="3" spellcheck="false" aria-label="Código Pix Copia e Cola"></textarea>
        <button class="pix-primary" type="button" id="pixCopyButton">Copiar código Pix</button>
        <button class="pix-check" type="button">Já paguei, verificar pagamento</button>
      </div>
      <div class="pix-success" hidden><span aria-hidden="true">💚</span><h3>Sua ajuda chegou. Muito obrigado!</h3><p>Seu Pix foi confirmado. Seu gesto ajuda a levar cuidado e esperança aos animais resgatados.</p><button class="pix-check pix-another" type="button">Fazer outra doação</button></div>
      <p class="pix-status" role="status" aria-live="polite"></p>
      <button class="pix-primary pix-retry" type="button" hidden>Tentar novamente</button>
      <p class="pix-provider">Pix processado pela PagueZy</p>
    </div>`;
  dialog.querySelector('.pix-banner').src = banner;
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  let timer, controller, generation = 0, active = null, checking = false;
  const cacheKey = 'socorro_pix_edge_v2';
  function loadCache() { try { return JSON.parse(sessionStorage.getItem(cacheKey) || '{}'); } catch { return {}; } }
  let cache = loadCache();
  if (!cache || typeof cache !== 'object' || Array.isArray(cache)) cache = {};
  function saveCache() { try { sessionStorage.setItem(cacheKey, JSON.stringify(cache)); } catch {} }
  function requestId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const h = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }
  async function api(action, options = {}) {
    const url = new URL(endpoint);
    url.searchParams.set('action', action);
    if (options.token) url.searchParams.set('token', options.token);
    const response = await fetch(url, {method:options.body ? 'POST' : 'GET', credentials:'omit', cache:'no-store', signal:options.signal,
      headers:{...(options.body ? {'Content-Type':'application/json','X-CSRF-Token':options.csrf} : {'Accept':'application/json'}),...(sessionToken ? {'Authorization':'Bearer '+sessionToken} : {})},
      body:options.body ? JSON.stringify(options.body) : undefined});
    let data;
    try { data = await response.json(); } catch { throw new Error('Não foi possível conectar ao pagamento. Tente novamente em instantes.'); }
    if (!response.ok) { const error = new Error(data.error || 'Não foi possível concluir esta solicitação.'); error.status = response.status; throw error; }
    if (data.session_token) { sessionToken = data.session_token; try { sessionStorage.setItem(authKey,sessionToken); } catch {} }
    return data;
  }
  function clearTimer() { clearTimeout(timer); timer = undefined; }
  function schedule() {
    clearTimer();
    if (dialog.open && !document.hidden && active?.payment?.status === 'pending') timer = setTimeout(check, 5000);
  }
  function showPayment(payment) {
    active.payment = payment;
    $('.pix-loading').hidden = true;
    $('.pix-retry').hidden = true;
    $('.pix-success').hidden = payment.status !== 'paid';
    $('.pix-details').hidden = payment.status !== 'pending';
    if (payment.status === 'paid') {
      $('.pix-status').textContent = 'Pagamento confirmado.';
      clearTimer();
      return;
    }
    if (payment.status === 'expired' || payment.status === 'failed') {
      $('.pix-status').textContent = payment.status === 'expired' ? 'Este Pix expirou. Gere um novo código para continuar ajudando.' : 'Este Pix não foi concluído. Você pode gerar um novo código.';
      $('.pix-retry').textContent = 'Gerar novo Pix';
      $('.pix-retry').hidden = false;
      clearTimer();
      return;
    }
    if (!payment.pix_copy_paste) throw new Error('O código Pix ainda não está disponível. Aguarde um pouco e tente novamente.');
    $('#pixCopyCode').value = payment.pix_copy_paste;
    $('.pix-qr').replaceChildren();
    try {
      const qr = qrcode(0, 'M');
      qr.addData(payment.pix_copy_paste, 'Byte');
      qr.make();
      $('.pix-qr').innerHTML = qr.createSvgTag({scalable:true,margin:4});
    } catch {
      $('.pix-qr').textContent = 'Use o código Pix Copia e Cola abaixo para fazer sua doação.';
    }
    $('.pix-expiry').hidden = true;
    if (payment.expires_at) {
      const date = new Date(payment.expires_at);
      if (Number.isFinite(date.getTime())) {
        $('.pix-expiry').textContent = 'Válido até ' + new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(date) + '.';
        $('.pix-expiry').hidden = false;
      }
    }
    $('.pix-status').textContent = 'Aguardando pagamento. A confirmação aparece aqui automaticamente.';
    schedule();
  }
  async function start(reset = false) {
    const call = ++generation;
    controller?.abort(); clearTimer();
    controller = new AbortController();
    const amount = Math.round(Number(opener.dataset.amount || 20) * 100);
    if (![1000,2000,3000,5000,10000,25000,50000,100000].includes(amount)) return;
    active = { amount };
    $('#pixAmount').textContent = money.format(amount / 100);
    $('.pix-loading').hidden = false;
    $('.pix-details').hidden = true; $('.pix-success').hidden = true; $('.pix-retry').hidden = true;
    $('.pix-status').textContent = ''; $('.pix-sandbox').hidden = true;
    if (!dialog.open) dialog.showModal();
    const timeout = setTimeout(() => { if (call === generation) controller.abort(); }, 35000);
    try {
      if (location.protocol === 'file:') throw new Error('Abra a página pelo endereço do site para gerar seu Pix.');
      const boot = await api('bootstrap', {signal:controller.signal});
      if (call !== generation) return;
      $('.pix-sandbox').hidden = !boot.sandbox;
      if (!boot.ready) throw new Error('O pagamento está temporariamente indisponível. Tente novamente em instantes.');
      const key = `${boot.sandbox ? 'sandbox' : 'production'}:${amount}`;
      if (reset) delete cache[key];
      const entry = cache[key] || {request_id:requestId()};
      cache[key] = entry; saveCache(); active.key = key;
      const payment = entry.token
        ? await api('status', {token:entry.token,signal:controller.signal})
        : await api('create', {csrf:boot.csrf,body:{amount,request_id:entry.request_id},signal:controller.signal});
      if (call !== generation) return;
      entry.token = payment.token; saveCache();
      showPayment(payment);
    } catch (e) {
      if (call !== generation || !dialog.open) return;
      if (e.status === 401) { sessionToken=''; try { sessionStorage.removeItem(authKey); } catch {} }
      if (e.status === 404 && active.key) { delete cache[active.key]; saveCache(); }
      $('.pix-loading').hidden = true;
      $('.pix-status').textContent = e.name === 'AbortError' ? 'A conexão demorou mais do que o esperado. Aguarde um pouco antes de tentar novamente.' : e.name === 'TypeError' ? 'Não foi possível conectar ao pagamento. Verifique sua conexão e tente novamente.' : e.message;
      $('.pix-retry').textContent = 'Tentar novamente'; $('.pix-retry').hidden = false;
    } finally { clearTimeout(timeout); }
  }
  async function check() {
    if (!dialog.open || !active?.payment?.token || checking) return;
    checking = true;
    const current = active;
    const button = $('.pix-check'); button.disabled = true;
    const checkController = new AbortController();
    const timeout = setTimeout(() => checkController.abort(), 30000);
    try {
      const payment = await api('status', {token:current.payment.token,signal:checkController.signal});
      if (active === current && dialog.open) showPayment(payment);
    } catch {
      if (active === current && dialog.open) $('.pix-status').textContent = 'Estamos tentando consultar a confirmação. Se você já pagou, aguarde; não é necessário pagar de novo.';
    } finally { clearTimeout(timeout); checking = false; button.disabled = false; if (active === current) schedule(); }
  }
  opener.addEventListener('click', () => start());
  $('.pix-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog) { const r=dialog.getBoundingClientRect(); if (e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom) dialog.close(); } });
  dialog.addEventListener('close', () => { generation++; clearTimer(); controller?.abort(); });
  $('.pix-check').addEventListener('click', check);
  $('.pix-another').addEventListener('click', () => start(true));
  $('.pix-retry').addEventListener('click', () => start(['expired','failed'].includes(active?.payment?.status)));
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimer(); else schedule(); });
  $('#pixCopyButton').addEventListener('click', async () => {
    const code = $('#pixCopyCode');
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(code.value);
      else { code.focus(); code.select(); if (!document.execCommand('copy')) throw new Error(); }
      $('#pixCopyButton').textContent = 'Código copiado!';
      setTimeout(() => { $('#pixCopyButton').textContent='Copiar código Pix'; },2500);
    } catch { code.focus(); code.select(); $('.pix-status').textContent='Selecione e copie o código Pix acima.'; }
  });
})();
