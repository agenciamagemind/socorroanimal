import {parseAmountToCents} from './amount.js';

const tiers = [...document.querySelectorAll('.donate__tiers-grid .tier-btn')];
const mainButton = document.getElementById('mainDonateBtn');
const feedback = document.getElementById('tierFeedbackText');
const customButton = document.getElementById('customAmountButton');
const customFields = document.getElementById('customDonationFields');
const customInput = document.getElementById('customDonationAmount');
const customError = document.getElementById('customDonationError');
const money = new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'});
const inputMoney = new Intl.NumberFormat('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
const values = [1000, 2000, 3000, 5000, 10000, 25000, 50000];
const impacts = [
  'você ajuda a garantir alimentação nutritiva por 2 dias para um cãozinho resgatado!',
  'você ajuda com medicamentos e vermífugo para os animais resgatados!',
  'você ajuda a garantir uma semana de comida para um cãozinho resgatado!',
  'você contribui com consultas veterinárias e vacinas!',
  'você ajuda no tratamento e no resgate de animais que precisam de cuidados!',
  'você contribui com cirurgias veterinárias de emergência!',
  'você ajuda a manter os cuidados intensivos de animais em recuperação!'
];
let selected = 1;
let showError = false;

function renderAmount(amount, impact) {
  mainButton.dataset.amountCents = amount === null ? '' : String(amount);
  mainButton.dataset.amount = amount === null ? '' : String(amount / 100);
  mainButton.dataset.currency = 'BRL';
  const span = document.createElement('span');
  if (amount === null) {
    span.textContent = 'Ajudar com Pix';
    feedback.textContent = 'Escolha o valor da sua ajuda. Cada gesto faz a diferença para os animais.';
  } else {
    const strong = document.createElement('strong');
    strong.textContent = money.format(amount / 100);
    span.append('Ajudar com ', strong);
    const feedbackAmount = document.createElement('strong');
    feedbackAmount.textContent = money.format(amount / 100);
    feedback.replaceChildren('Com ', feedbackAmount, ' ' + impact);
  }
  mainButton.replaceChildren(span);
}

function updateCustom() {
  const amount = parseAmountToCents(customInput.value);
  const invalid = showError && amount === null;
  customInput.setAttribute('aria-invalid', String(invalid));
  customError.hidden = !invalid;
  customError.textContent = invalid ? 'Digite um valor maior que zero, como 25,00.' : '';
  renderAmount(amount, 'você ajuda a levar alimento, cuidado e esperança aos animais resgatados!');
  return amount;
}

function selectTier(index) {
  selected = index;
  const custom = tiers[index] === customButton;
  tiers.forEach((button, i) => {
    button.classList.toggle('tier-btn--active', i === index);
    button.classList.toggle('selected', i === index);
    button.setAttribute('aria-pressed', String(i === index));
  });
  customButton.setAttribute('aria-expanded', String(custom));
  customFields.hidden = !custom;
  showError = false;
  customError.hidden = true;
  customInput.setAttribute('aria-invalid', 'false');
  if (custom) {
    updateCustom();
    customInput.focus({preventScroll:true});
  } else {
    renderAmount(values[index], impacts[index]);
  }
}

tiers.forEach((button, index) => button.addEventListener('click', () => selectTier(index)));
customInput.addEventListener('input', () => {
  if (tiers[selected] === customButton) updateCustom();
});
customInput.addEventListener('blur', () => {
  if (tiers[selected] !== customButton) return;
  const amount = parseAmountToCents(customInput.value);
  if (amount !== null) customInput.value = inputMoney.format(amount / 100);
  showError = showError || customInput.value.trim() !== '';
  updateCustom();
});
customInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    mainButton.click();
  }
});
mainButton.addEventListener('click', event => {
  if (tiers[selected] === customButton && parseAmountToCents(customInput.value) === null) {
    event.preventDefault();
    event.stopImmediatePropagation();
    showError = true;
    updateCustom();
    customInput.focus();
  }
}, true);
feedback.setAttribute('aria-live', 'polite');
selectTier(1);
