import { APP_ROUTES, CATEGORIES, STARTER_REMINDERS } from './data-v3.js';
import { addDays, createId, formatMoney, localISODate, loadState, monthKey, saveState } from './store-v3.js';
import { renderNav, renderView } from './views-v3.js';

const state = loadState();
const ui = {
  appView: document.querySelector('#app-view'),
  desktopNav: document.querySelector('#desktop-nav'),
  bottomNav: document.querySelector('#bottom-nav'),
  floatingAdd: document.querySelector('#floating-add'),
  toast: document.querySelector('#toast'),
  live: document.querySelector('#live-message'),
  routeAnnouncement: document.querySelector('#route-announcement')
};
const filters = { kind: 'all', category: 'all', period: 'month' };
let route = 'home';
let toastTimer = 0;

function routeFromHash() {
  const routePart = decodeURIComponent((window.location.hash || '').replace(/^#\/?/, '').split('?')[0]);
  return APP_ROUTES.includes(routePart) ? routePart : '';
}

function routeUrl(name) {
  return `#/${name}`;
}

function replaceRoute(name) {
  route = name;
  history.replaceState(null, '', `${location.pathname}${location.search}${routeUrl(name)}`);
}

function navigate(name) {
  if (!APP_ROUTES.includes(name)) return;
  if (!state.onboardingComplete && !['welcome', 'onboarding'].includes(name)) name = 'welcome';
  const next = routeUrl(name);
  if (location.hash === next) {
    route = name;
    render();
    return;
  }
  location.hash = next;
}

function render(announceRoute = false) {
  const intro = route === 'welcome' || route === 'onboarding';
  document.body.classList.toggle('is-intro', intro);
  ui.appView.innerHTML = renderView(route, state, { filters });
  ui.desktopNav.innerHTML = renderNav(route, 'desktop');
  ui.bottomNav.innerHTML = renderNav(route, 'mobile');
  ui.desktopNav.hidden = intro;
  ui.bottomNav.hidden = intro;
  ui.floatingAdd.hidden = intro || route === 'add';
  const title = {
    welcome: 'Welcome', onboarding: 'Your setup', home: 'Home', add: 'Add an entry',
    expenses: 'Entries', dashboard: 'Insights', savings: 'Savings', split: 'Split a bill'
  }[route] || 'Home';
  document.title = `${title} · GONE`;
  if (announceRoute) {
    const renderedRoute = route;
    window.requestAnimationFrame(() => {
      if (route !== renderedRoute) return;
      ui.appView.focus({ preventScroll: true });
      if (ui.routeAnnouncement) ui.routeAnnouncement.textContent = `${title} page`;
    });
  }
}

function toast(message) {
  if (!ui.toast) return;
  window.clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.hidden = false;
  if (ui.live) ui.live.textContent = message;
  toastTimer = window.setTimeout(() => { ui.toast.hidden = true; }, 3200);
}

function commit(message, nextRoute = '') {
  const saved = saveState(state);
  if (nextRoute) navigate(nextRoute);
  else render();
  toast(saved ? message : 'Your browser could not save this change. Check its storage settings.');
}

function entryExists(id) {
  return state.entries.some((entry) => entry.id === id);
}

function syncMonthlyIncome() {
  const key = monthKey();
  const id = `monthly-income-${key}`;
  const index = state.entries.findIndex((entry) => entry.id === id);
  const amount = Number(state.profile.monthlyIncome) || 0;
  if (amount <= 0) {
    if (index >= 0) state.entries.splice(index, 1);
    return index >= 0;
  }
  const monthlyEntry = {
    id, title: 'Monthly income', amount, kind: 'received', category: 'Income',
    date: `${key}-01`, source: 'monthly-income', reminderId: '', autoLogged: false
  };
  if (index >= 0) {
    const existing = state.entries[index];
    if (Number(existing.amount) === amount) return false;
    state.entries[index] = monthlyEntry;
    return true;
  }
  state.entries.push(monthlyEntry);
  return true;
}

function addReminderEntry(reminder, date, autoLogged = false) {
  const id = `reminder-${date}-${reminder.id}`;
  if (!entryExists(id)) {
    state.entries.push({
      id,
      title: reminder.title,
      amount: Number(reminder.amount),
      kind: 'spent',
      category: reminder.category || 'Other',
      date,
      source: 'reminder',
      reminderId: reminder.id,
      autoLogged
    });
  }
  if (!state.reminderDays[date]) state.reminderDays[date] = {};
  state.reminderDays[date][reminder.id] = autoLogged ? 'auto' : 'done';
}

function autoLogDate(date) {
  if (!state.reminderDays[date]) state.reminderDays[date] = {};
  const dayLog = state.reminderDays[date];
  let added = false;
  for (const reminder of state.reminders) {
    if (dayLog[reminder.id]) continue;
    if (reminder.createdOn && reminder.createdOn > date) continue;
    addReminderEntry(reminder, date, true);
    added = true;
  }
  return added;
}

function processPreviousDay() {
  const today = localISODate();
  const yesterday = addDays(today, -1);
  let changed = false;
  if (state.onboardingComplete && state.lastSeenDate && state.lastSeenDate < today && state.lastAutoLogDate !== yesterday) {
    changed = autoLogDate(yesterday) || changed;
    state.lastAutoLogDate = yesterday;
  }
  if (state.onboardingComplete && state.lastSeenDate !== today) {
    state.lastSeenDate = today;
    changed = true;
  }
  return changed;
}

function scheduleMidnightAutoLog() {
  const scheduledDate = localISODate();
  const tomorrow = new Date(`${addDays(scheduledDate, 1)}T00:00:02`);
  const delay = Math.max(1000, tomorrow.getTime() - Date.now());
  window.setTimeout(() => {
    if (state.onboardingComplete && localISODate() !== scheduledDate) {
      const added = autoLogDate(scheduledDate);
      state.lastAutoLogDate = scheduledDate;
      state.lastSeenDate = localISODate();
      saveState(state);
      render();
      if (added) toast('Unmarked reminders were auto-logged for yesterday.');
    }
    scheduleMidnightAutoLog();
  }, delay);
}

function startOnboarding(form) {
  const data = new FormData(form);
  const selected = new Set(data.getAll('reminder-option').map(String));
  const customReminders = state.reminders.filter((item) => !STARTER_REMINDERS.some((starter) => starter.id === item.id));
  state.profile.name = String(data.get('display_name') || '').trim().slice(0, 40);
  state.profile.budget = Math.max(0, Number(data.get('budget')) || 0);
  state.reminders = [...customReminders, ...STARTER_REMINDERS.filter((item) => selected.has(item.id)).map((item) => ({
    ...item,
    createdOn: localISODate()
  }))];
  state.onboardingComplete = true;
  state.lastSeenDate = localISODate();
  syncMonthlyIncome();
  commit('Your local setup is ready.', 'home');
}

function skipOnboarding() {
  if (!state.onboardingComplete) {
    state.onboardingComplete = true;
    state.profile = { name: '', budget: 0, monthlyIncome: 0 };
    state.reminders = [];
    state.lastSeenDate = localISODate();
    saveState(state);
  }
  navigate('home');
  toast('Your blank ledger is ready.');
}

function toggleReminder(id) {
  const reminder = state.reminders.find((item) => item.id === id);
  if (!reminder) return;
  const today = localISODate();
  if (!state.reminderDays[today]) state.reminderDays[today] = {};
  const status = state.reminderDays[today][id];
  const entryId = `reminder-${today}-${id}`;
  if (status === 'done' || status === 'auto') {
    state.entries = state.entries.filter((entry) => entry.id !== entryId);
    state.reminderDays[today][id] = 'skipped';
    commit(`${reminder.title} was removed from today’s entries.`);
    return;
  }
  addReminderEntry(reminder, today, false);
  commit(`${reminder.title} added to today’s spending.`);
}

function skipUnmarkedReminders() {
  const today = localISODate();
  if (!state.reminderDays[today]) state.reminderDays[today] = {};
  let skipped = 0;
  for (const reminder of state.reminders) {
    if (!state.reminderDays[today][reminder.id]) {
      state.reminderDays[today][reminder.id] = 'skipped';
      skipped += 1;
    }
  }
  commit(skipped ? 'Unmarked reminders skipped for today.' : 'Everything is already marked for today.');
}

function addStarterReminders() {
  const known = new Set(state.reminders.map((item) => item.id));
  const additions = STARTER_REMINDERS.filter((item) => !known.has(item.id)).map((item) => ({ ...item, createdOn: localISODate() }));
  if (!additions.length) {
    toast('Those suggested reminders are already here.');
    return;
  }
  state.reminders.push(...additions);
  commit('Suggested daily reminders added.');
}

function setEntryKind(button) {
  const form = button.closest('#entry-form');
  if (!form) return;
  const kind = button.dataset.entryKind;
  form.querySelector('[name="kind"]').value = kind;
  const titleInput = form.querySelector('[data-entry-title]');
  const titleLabel = form.querySelector('#entry-title-label');
  const categoryField = form.querySelector('#entry-category-field');
  const categorySelect = form.querySelector('[name="category"]');
  if (kind === 'received') {
    titleInput.name = 'source';
    titleInput.placeholder = 'Salary, freelance, a gift…';
    titleLabel.textContent = 'Where did it come from?';
    categoryField.hidden = true;
    categorySelect.value = 'Income';
  } else {
    titleInput.name = 'title';
    titleInput.placeholder = 'A small detail helps later';
    titleLabel.textContent = 'What did you buy?';
    categoryField.hidden = false;
    const selectedCategory = form.querySelector('[data-entry-category].is-selected')?.dataset.entryCategory || 'Food';
    categorySelect.value = selectedCategory;
  }
  form.querySelectorAll('[data-entry-kind]').forEach((item) => {
    const selected = item === button;
    item.classList.toggle('is-selected', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
}

function setEntryCategory(button) {
  const form = button.closest('#entry-form');
  if (!form) return;
  const value = button.dataset.entryCategory;
  form.querySelector('[name="category"]').value = value;
  form.querySelectorAll('[data-entry-category]').forEach((item) => {
    const selected = item === button;
    item.classList.toggle('is-selected', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
}

function formatCurrencyField(input) {
  const raw = input.value;
  const caret = input.selectionStart ?? raw.length;
  const digitsBeforeCaret = raw.slice(0, caret).replace(/\D/g, '').length;
  const clean = raw.replace(/[^\d.]/g, '');
  const decimalAt = clean.indexOf('.');
  const integerRaw = decimalAt < 0 ? clean : clean.slice(0, decimalAt);
  const fraction = decimalAt < 0 ? '' : clean.slice(decimalAt + 1).replace(/\./g, '').slice(0, 2);
  const grouped = integerRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const formatted = grouped + (decimalAt < 0 ? '' : `.${fraction}`);
  input.value = formatted;
  let nextCaret = 0;
  let digits = 0;
  while (nextCaret < formatted.length && digits < digitsBeforeCaret) {
    if (/\d/.test(formatted[nextCaret])) digits += 1;
    nextCaret += 1;
  }
  if (input === document.activeElement) input.setSelectionRange(nextCaret, nextCaret);
}

function handleInput(event) {
  if (event.target.matches('#entry-form [data-currency-input]')) formatCurrencyField(event.target);
}

function handleAction(action) {
  switch (action) {
    case 'skip-setup':
      if (route === 'onboarding' && state.onboardingComplete) {
        navigate('home');
        return;
      }
      skipOnboarding();
      return;
    case 'skip-all': skipUnmarkedReminders(); return;
    case 'add-starter-reminders': addStarterReminders(); return;
    case 'adjust-goal': {
      const goalInput = document.querySelector('#goal-form [name="target_amount"]');
      goalInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      goalInput?.focus({ preventScroll: true });
      return;
    }
    case 'remove-goal':
      state.savingGoal = null;
      commit('Saving goal removed.');
      return;
  }
}

function handleClick(event) {
  const routeControl = event.target.closest('[data-route]');
  if (routeControl) {
    event.preventDefault();
    if (routeControl.dataset.period) filters.period = routeControl.dataset.period;
    if (routeControl.dataset.kind) filters.kind = routeControl.dataset.kind;
    if (routeControl.dataset.category) filters.category = routeControl.dataset.category;
    navigate(routeControl.dataset.route);
    if (routeControl.dataset.route === 'onboarding' && state.onboardingComplete) {
      window.setTimeout(() => document.querySelector('[name="budget"]')?.focus(), 80);
    }
    return;
  }
  const actionControl = event.target.closest('[data-action]');
  if (actionControl) {
    handleAction(actionControl.dataset.action);
    return;
  }
  const kindControl = event.target.closest('[data-entry-kind]');
  if (kindControl) { setEntryKind(kindControl); return; }
  const categoryControl = event.target.closest('[data-entry-category]');
  if (categoryControl) { setEntryCategory(categoryControl); return; }
  const reminderControl = event.target.closest('[data-reminder-toggle]');
  if (reminderControl) { toggleReminder(reminderControl.dataset.reminderToggle); return; }
  const deleteEntry = event.target.closest('[data-delete-entry]');
  if (deleteEntry) {
    const id = deleteEntry.dataset.deleteEntry;
    const entry = state.entries.find((item) => item.id === id);
    if (!entry) return;
    state.entries = state.entries.filter((item) => item.id !== id);
    if (entry.reminderId && state.reminderDays[entry.date]) state.reminderDays[entry.date][entry.reminderId] = 'skipped';
    commit(`${entry.title} removed from your ledger.`);
    return;
  }
  const deleteReminder = event.target.closest('[data-delete-reminder]');
  if (deleteReminder) {
    const id = deleteReminder.dataset.deleteReminder;
    const reminder = state.reminders.find((item) => item.id === id);
    state.reminders = state.reminders.filter((item) => item.id !== id);
    commit(reminder ? `${reminder.title} reminder removed.` : 'Reminder removed.');
    return;
  }
  const deleteSplit = event.target.closest('[data-delete-split]');
  if (deleteSplit) {
    state.splits = state.splits.filter((item) => item.id !== deleteSplit.dataset.deleteSplit);
    commit('Shared bill removed.');
    return;
  }
  const kindFilter = event.target.closest('[data-filter-kind]');
  if (kindFilter) { filters.kind = kindFilter.dataset.filterKind; render(); return; }
  const categoryFilter = event.target.closest('[data-filter-category]');
  if (categoryFilter) { filters.category = categoryFilter.dataset.filterCategory; render(); return; }
  const periodFilter = event.target.closest('[data-filter-period]');
  if (periodFilter) { filters.period = periodFilter.dataset.filterPeriod; render(); return; }
}

function handleSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.id === 'setup-form') {
    event.preventDefault();
    startOnboarding(form);
    return;
  }
  if (form.id === 'entry-form') {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const kind = data.get('kind') === 'received' ? 'received' : 'spent';
    const title = String(data.get('title') || data.get('source') || '').trim();
    const amount = Number(String(data.get('amount') || '').replace(/,/g, '').trim());
    const date = String(data.get('date') || '');
    if (!title || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    state.entries.push({
      id: createId('entry'), title: title.slice(0, 70), amount,
      kind,
      category: kind === 'received' ? 'Income' : String(data.get('category') || 'Other'), date, source: 'manual', reminderId: '', autoLogged: false
    });
    commit('Logged. The wallet felt that.', 'home');
    return;
  }
  if (form.id === 'goal-form') {
    event.preventDefault();
    const amount = Number(new FormData(form).get('target_amount'));
    if (!Number.isFinite(amount) || amount < 0) return;
    state.savingGoal = amount > 0 ? amount : null;
    commit(amount > 0 ? 'Saving goal saved.' : 'Saving goal cleared.');
    return;
  }
  if (form.id === 'income-form') {
    event.preventDefault();
    const amount = Number(new FormData(form).get('monthly_income')) || 0;
    if (!Number.isFinite(amount) || amount < 0) return;
    state.profile.monthlyIncome = amount;
    syncMonthlyIncome();
    commit(amount > 0 ? 'Monthly income saved and added for this month.' : 'Monthly income removed.');
    return;
  }
  if (form.id === 'bonus-form') {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const amount = Number(data.get('bonus_amount'));
    const source = String(data.get('bonus_source') || '').trim();
    if (!Number.isFinite(amount) || amount <= 0 || !source) return;
    state.entries.push({
      id: createId('bonus'), title: source.slice(0, 60), amount, kind: 'received',
      category: 'Income', date: localISODate(), source: 'bonus', reminderId: '', autoLogged: false
    });
    commit('Bonus income added.');
    return;
  }
  if (form.id === 'reminder-form') {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const title = String(data.get('reminder_title') || '').trim();
    const amount = Number(data.get('reminder_amount'));
    if (!title || !Number.isFinite(amount) || amount <= 0) return;
    state.reminders.push({
      id: createId('reminder'), title: title.slice(0, 50), amount,
      category: String(data.get('reminder_category') || 'Other'), icon: '✦', createdOn: localISODate()
    });
    commit(`${title} reminder added.`);
    return;
  }
  if (form.id === 'split-form') {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const total = Number(data.get('total_amount'));
    const description = String(data.get('description') || '').trim();
    const friends = [...new Set(String(data.get('friends') || '').split(',').map((name) => name.trim()).filter(Boolean))].slice(0, 20);
    if (!Number.isFinite(total) || total <= 0 || !description || !friends.length) {
      toast('Add at least one friend and a valid total to split the bill.');
      return;
    }
    state.splits.unshift({ id: createId('split'), description: description.slice(0, 80), total, friends, date: localISODate() });
    commit('Split calculated and saved in this browser.');
  }
}

function initialize() {
  const initial = routeFromHash() || (state.onboardingComplete ? 'home' : 'welcome');
  route = initial;
  if (!location.hash) replaceRoute(initial);
  if (!state.onboardingComplete && !['welcome', 'onboarding'].includes(route)) replaceRoute('welcome');
  let changed = processPreviousDay();
  changed = syncMonthlyIncome() || changed;
  if (changed) saveState(state);
  render();
  document.addEventListener('click', handleClick);
  document.addEventListener('submit', handleSubmit);
  document.addEventListener('input', handleInput);
  window.addEventListener('hashchange', () => {
    const previousRoute = route;
    const next = routeFromHash() || (state.onboardingComplete ? 'home' : 'welcome');
    if (!state.onboardingComplete && !['welcome', 'onboarding'].includes(next)) replaceRoute('welcome');
    else route = next;
    render(route !== previousRoute);
  });
  scheduleMidnightAutoLog();
}

initialize();
