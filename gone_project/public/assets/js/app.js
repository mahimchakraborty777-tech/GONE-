const STORAGE_KEY = 'gone.clean-ledger.v1';
const moneyFormat = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});
const state = loadState();
let activeFilter = 'all';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const dom = {
  month: $('#current-month'),
  received: $('#received-total'),
  spent: $('#spent-total'),
  goalAmount: $('#goal-amount'),
  goalHint: $('#goal-hint'),
  goalProgress: $('#goal-progress'),
  goalFill: $('#goal-progress-fill'),
  goalInput: $('#goal-input'),
  removeGoal: $('#remove-goal'),
  entryForm: $('#entry-form'),
  entryList: $('#entry-list'),
  entryCount: $('#entry-count'),
  emptyState: $('#empty-state'),
  live: $('#live-message')
};

function emptyState() {
  return { entries: [], savingGoal: null };
}

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return emptyState();
    const parsed = JSON.parse(stored);
    if (!parsed || !Array.isArray(parsed.entries)) return emptyState();
    return {
      entries: parsed.entries.filter(isValidEntry),
      savingGoal: Number.isFinite(Number(parsed.savingGoal)) && Number(parsed.savingGoal) > 0
        ? Number(parsed.savingGoal)
        : null
    };
  } catch {
    return emptyState();
  }
}

function isValidEntry(entry) {
  return entry && typeof entry.id === 'string'
    && typeof entry.title === 'string'
    && Number.isFinite(Number(entry.amount)) && Number(entry.amount) > 0
    && ['spent', 'received'].includes(entry.kind)
    && /^\d{4}-\d{2}-\d{2}$/.test(entry.date);
}

function localISODate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatMoney(value) {
  return moneyFormat.format(Number(value) || 0);
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function say(message) {
  dom.live.textContent = '';
  window.requestAnimationFrame(() => { dom.live.textContent = message; });
}

function save(message) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render();
    say(message);
    return true;
  } catch {
    render();
    say('This browser could not save your changes. Check its local storage settings.');
    return false;
  }
}

function render() {
  const now = new Date();
  const key = monthKey(now);
  const monthLabel = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(now);
  dom.month.textContent = monthLabel;

  const thisMonth = state.entries.filter((entry) => entry.date.startsWith(key));
  const received = thisMonth.filter((entry) => entry.kind === 'received').reduce((sum, entry) => sum + Number(entry.amount), 0);
  const spent = thisMonth.filter((entry) => entry.kind === 'spent').reduce((sum, entry) => sum + Number(entry.amount), 0);
  dom.received.textContent = formatMoney(received);
  dom.spent.textContent = formatMoney(spent);

  const goal = Number(state.savingGoal) || 0;
  const net = received - spent;
  const progress = goal > 0 ? Math.max(0, Math.min(100, (net / goal) * 100)) : 0;
  dom.goalAmount.textContent = goal > 0 ? formatMoney(goal) : 'Not set yet';
  dom.goalProgress.setAttribute('aria-valuenow', String(Math.round(progress)));
  dom.goalProgress.setAttribute('aria-valuetext', goal > 0 ? `${Math.round(progress)} percent` : 'No goal set');
  dom.goalFill.style.width = `${progress}%`;
  if (goal > 0) {
    dom.goalHint.textContent = `${formatMoney(Math.max(0, net))} net this month · ${Math.round(progress)}% of your goal`;
    dom.goalInput.value = String(goal);
    dom.removeGoal.hidden = false;
  } else {
    dom.goalHint.textContent = 'Add a goal when one feels right.';
    dom.goalInput.value = '';
    dom.removeGoal.hidden = true;
  }

  const ordered = [...state.entries].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const filtered = activeFilter === 'all' ? ordered : ordered.filter((entry) => entry.kind === activeFilter);
  dom.entryCount.textContent = `${state.entries.length} ${state.entries.length === 1 ? 'entry' : 'entries'}`;
  dom.entryList.replaceChildren(...filtered.map(renderEntry));
  dom.emptyState.hidden = filtered.length > 0;
  if (filtered.length === 0) {
    dom.emptyState.textContent = state.entries.length === 0
      ? 'Your page is still blank. Add your first entry when you’re ready.'
      : `No ${activeFilter === 'spent' ? 'spending' : 'received money'} entries yet.`;
  }
}

function renderEntry(entry) {
  const item = document.createElement('li');
  item.className = `entry-row entry-row--${entry.kind}`;

  const symbol = document.createElement('span');
  symbol.className = 'entry-row__symbol';
  symbol.setAttribute('aria-hidden', 'true');
  symbol.textContent = entry.kind === 'received' ? '↗' : '↘';

  const details = document.createElement('div');
  details.className = 'entry-row__details';
  const title = document.createElement('p');
  title.className = 'entry-row__title';
  title.textContent = entry.title;
  const meta = document.createElement('p');
  meta.className = 'entry-row__meta';
  meta.textContent = `${entry.category} · ${formatDate(entry.date)}`;
  details.append(title, meta);

  const side = document.createElement('div');
  side.className = 'entry-row__side';
  const amount = document.createElement('span');
  amount.className = 'entry-row__amount';
  amount.textContent = `${entry.kind === 'received' ? '+' : '−'}${formatMoney(entry.amount)}`;
  const remove = document.createElement('button');
  remove.className = 'remove-button';
  remove.type = 'button';
  remove.dataset.remove = entry.id;
  remove.setAttribute('aria-label', `Remove ${entry.kind === 'received' ? 'received' : 'spent'} entry: ${entry.title}`);
  remove.textContent = 'Remove';
  side.append(amount, remove);
  item.append(symbol, details, side);
  return item;
}

function init() {
  $('#entry-date').value = localISODate();

  $$('.kind-switch__button').forEach((button) => {
    button.addEventListener('click', () => {
      $$('.kind-switch__button').forEach((item) => {
        const selected = item === button;
        item.classList.toggle('is-active', selected);
        item.setAttribute('aria-pressed', String(selected));
      });
      $('#entry-form [name="kind"]').value = button.dataset.kind;
    });
  });

  $('#entry-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const title = String(data.get('title') || '').trim();
    const amount = Number(data.get('amount'));
    const date = String(data.get('date') || '');
    if (!title || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

    state.entries.push({
      id: globalThis.crypto?.randomUUID?.() || `entry-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title,
      amount,
      date,
      kind: data.get('kind') === 'received' ? 'received' : 'spent',
      category: String(data.get('category') || 'Everyday')
    });
    const kind = data.get('kind') === 'received' ? 'received' : 'spent';
    form.reset();
    $('#entry-date').value = localISODate();
    $('#entry-form [name="kind"]').value = kind;
    $$('.kind-switch__button').forEach((button) => {
      const selected = button.dataset.kind === kind;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    activeFilter = 'all';
    setActiveFilter('all');
    $('#entry-title').focus();
    save(`${kind === 'received' ? 'Money received' : 'Spending'} entry added.`);
  });

  $('#goal-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const amount = Number(new FormData(form).get('goal'));
    if (!Number.isFinite(amount) || amount <= 0) return;
    state.savingGoal = amount;
    save('Saving goal saved.');
  });

  dom.removeGoal.addEventListener('click', () => {
    state.savingGoal = null;
    save('Saving goal removed.');
    dom.goalInput.focus();
  });

  dom.entryList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove]');
    if (!button) return;
    const entry = state.entries.find((item) => item.id === button.dataset.remove);
    if (!entry) return;
    state.entries = state.entries.filter((item) => item.id !== entry.id);
    save(`${entry.title} removed from your ledger.`);
  });

  $$('.filter-button').forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = button.dataset.filter;
      setActiveFilter(activeFilter);
      render();
    });
  });

  render();
}

function setActiveFilter(filter) {
  $$('.filter-button').forEach((button) => {
    const selected = button.dataset.filter === filter;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

init();
