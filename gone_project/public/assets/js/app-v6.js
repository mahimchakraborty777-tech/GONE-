import { APP_ROUTES, CATEGORIES, STARTER_REMINDERS } from './data-v5.js';
import { addDays, createEmptyState, createId, formatMoney, hasMeaningfulData, legacyDecisionMade, loadLegacyState, loadUserState, localISODate, markLegacyDecision, monthKey, normalizeState, saveUserState } from './store-v5.js';
import { apiRequest } from './auth-api-v4.js';
import { renderNav, renderView } from './views-v6.js';

let state = createEmptyState();
const legacyState = loadLegacyState();
let currentUser = null;
let authReady = false;
let authError = '';
let authMessage = '';
let migrationSource = null;
let accountStateBase = null;
let importMode = '';
let syncStatus = 'idle';
let syncQueue = Promise.resolve();
let tourStep = 0;
const ui = {
  appView: document.querySelector('#app-view'),
  desktopNav: document.querySelector('#desktop-nav'),
  bottomNav: document.querySelector('#bottom-nav'),
  floatingAdd: document.querySelector('#floating-add'),
  toast: document.querySelector('#toast'),
  live: document.querySelector('#live-message'),
  routeAnnouncement: document.querySelector('#route-announcement'),
  accountControls: document.querySelector('#account-controls')
};
const filters = { kind: 'all', category: 'all', period: 'month' };
let route = 'welcome';
let toastTimer = 0;
const PUBLIC_ROUTES = new Set(['welcome', 'register', 'login', 'recover']);
const INTRO_ROUTES = new Set(['welcome', 'register', 'login', 'recover', 'account-created', 'import-data', 'onboarding', 'tour']);
const ACCOUNT_SIGNAL_KEY = 'gone.account-session-signal.v1';
const accountChannel = 'BroadcastChannel' in window ? new BroadcastChannel('gone-account-session-v1') : null;

function announceAccountSessionChange() {
  if (accountChannel) {
    accountChannel.postMessage({ type: 'session-change' });
    return;
  }
  try { localStorage.setItem(ACCOUNT_SIGNAL_KEY, String(Date.now())); } catch { /* storage events are a fallback only */ }
}

accountChannel?.addEventListener('message', (event) => {
  if (event.data?.type === 'session-change') void restoreSession();
});
window.addEventListener('storage', (event) => {
  if (event.key === ACCOUNT_SIGNAL_KEY) void restoreSession();
});

function routeFromHash() {
  try {
    const routePart = decodeURIComponent((window.location.hash || '').replace(/^#\/?/, '').split('?')[0]);
    return APP_ROUTES.includes(routePart) ? routePart : '';
  } catch {
    return '';
  }
}

function routeUrl(name) {
  return `#/${name}`;
}

function accountRequest(path, options = {}) {
  if (!currentUser) return Promise.reject(new Error('Sign in to continue.'));
  return apiRequest(path, {
    ...options,
    headers: { ...(options.headers || {}), 'X-GONE-Account': String(currentUser.id) }
  });
}

function replaceRoute(name) {
  route = name;
  history.replaceState(null, '', `${location.pathname}${location.search}${routeUrl(name)}`);
}

function navigate(name) {
  if (!APP_ROUTES.includes(name)) return;
  if (!authReady || !currentUser) {
    if (!PUBLIC_ROUTES.has(name)) name = 'welcome';
  } else if (['register', 'login', 'recover'].includes(name)) {
    name = routeAfterAccountSetup();
  } else if (!state.onboardingComplete && !['welcome', 'onboarding', 'account-created', 'import-data'].includes(name)) {
    name = 'onboarding';
  } else if (state.onboardingComplete && !state.tourComplete && !['welcome', 'onboarding', 'account-created', 'import-data', 'account', 'tour'].includes(name)) {
    name = 'tour';
  } else if (name === 'import-data' && !migrationSource) {
    name = routeAfterAccountSetup();
  }
  const next = routeUrl(name);
  if (location.hash === next) {
    route = name;
    render();
    return;
  }
  location.hash = next;
}

function executeBokehScript(scriptHtml) {
  if (!scriptHtml) return;
  const match = scriptHtml.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
  const code = match ? match[1] : scriptHtml;
  const inject = () => {
    if (typeof window.Bokeh === 'undefined') {
      setTimeout(inject, 50);
      return;
    }
    const el = document.createElement('script');
    el.type = 'text/javascript';
    el.text = code;
    document.body.appendChild(el);
  };
  inject();
}

async function mountBokehInsights(currentState) {
  const catEl = document.getElementById('chart-category');
  const trendEl = document.getElementById('chart-trend');
  const monthlyEl = document.getElementById('chart-monthly');
  if (!catEl && !trendEl && !monthlyEl) return;

  try {
    const data = await accountRequest('/api/bokeh/insights/', { method: 'POST', body: {} });
    if (data.status !== 'ok' || !data.charts) return;

    if (catEl && data.charts.category) {
      catEl.innerHTML = data.charts.category.div;
      executeBokehScript(data.charts.category.script);
    }
    if (trendEl && data.charts.trend) {
      trendEl.className = 'chart-target';
      trendEl.innerHTML = data.charts.trend.div;
      executeBokehScript(data.charts.trend.script);
    }
    if (monthlyEl && data.charts.monthly) {
      monthlyEl.className = 'chart-target';
      monthlyEl.innerHTML = data.charts.monthly.div;
      executeBokehScript(data.charts.monthly.script);
    }
  } catch (err) {
    console.debug('Bokeh insights chart fallback to CSS:', err);
  }
}

async function mountBokehSavings(currentState) {
  const savingsEl = document.getElementById('chart-savings-trend');
  if (!savingsEl) return;

  try {
    const data = await accountRequest('/api/bokeh/savings/', { method: 'POST', body: {} });
    if (data.status !== 'ok' || !data.charts || !data.charts.savings) return;

    savingsEl.className = 'chart-target';
    savingsEl.style.display = 'block';
    savingsEl.innerHTML = data.charts.savings.div;
    executeBokehScript(data.charts.savings.script);
  } catch (err) {
    console.debug('Bokeh savings chart fallback to CSS:', err);
  }
}

function persistLocal(currentState = state) {
  return currentUser ? saveUserState(currentUser.id, currentState) : false;
}

function syncBackend(currentState = state, { quiet = false } = {}) {
  if (!currentUser) return Promise.resolve(false);
  const ownerId = currentUser.id;
  const snapshot = normalizeState(currentState);
  const saved = saveUserState(ownerId, snapshot);
  syncStatus = 'syncing';
  updateAccountControls();
  syncQueue = syncQueue.catch(() => false).then(async () => {
    if (currentUser?.id !== ownerId) return false;
    await accountRequest('/api/state/sync/', { method: 'POST', body: snapshot });
    if (currentUser?.id !== ownerId) return false;
    syncStatus = 'synced';
    updateAccountControls();
    return true;
  }).catch((error) => {
    if (currentUser?.id === ownerId) {
      syncStatus = 'error';
      updateAccountControls();
      if (!quiet) toast('Saved in this account’s browser cache, but account sync failed. Try again.');
    }
    console.warn('GONE account sync failed:', error.status || error.message);
    return false;
  });
  if (!saved && !quiet) toast('Your account cache could not be saved in this browser; the server sync will still be attempted.');
  return syncQueue;
}

function updateAccountControls() {
  if (!ui.accountControls) return;
  ui.accountControls.replaceChildren();
  if (!authReady) {
    const status = document.createElement('span');
    status.className = 'account-id-pill';
    status.textContent = 'Checking account…';
    ui.accountControls.append(status);
    return;
  }
  if (!currentUser) {
    const link = document.createElement('a');
    link.className = 'account-control-link';
    link.href = '#/login';
    link.dataset.route = 'login';
    link.textContent = 'Sign in';
    ui.accountControls.append(link);
    return;
  }
  const pill = document.createElement('a');
  pill.className = 'account-id-pill';
  pill.href = '#/account';
  pill.dataset.route = 'account';
  pill.setAttribute('aria-label', `Open Account details for ${currentUser.goneId}`);
  pill.title = syncStatus === 'error' ? 'Account sync needs attention · open Account details' : `Account details · signed in as ${currentUser.goneId}`;
  const label = document.createElement('span');
  label.textContent = syncStatus === 'syncing' ? 'Syncing…' : syncStatus === 'error' ? 'Sync issue' : currentUser.goneId;
  pill.append(label);
  const logout = document.createElement('button');
  logout.type = 'button';
  logout.className = 'account-control-button';
  logout.dataset.action = 'sign-out';
  logout.textContent = 'Sign out';
  const live = document.createElement('span');
  live.className = 'live-users';
  live.title = 'GONE IDs created so far';
  live.setAttribute('aria-label', 'GONE IDs created so far');
  live.innerHTML = '<i class="live-dot" aria-hidden="true"></i><b data-live-number>–</b>';
  ui.accountControls.append(pill, logout, live);
  paintLiveCount();
}

// Live count of GONE IDs created so far. Shown as a number only.
// Shows "–" until the server answers, never a made-up number.
let liveUserCount = null;

function paintLiveCount() {
  document.querySelectorAll('[data-live-number]').forEach((el) => {
    el.textContent = liveUserCount === null ? '–' : liveUserCount.toLocaleString('en-IN');
  });
}

async function refreshLiveCount() {
  try {
    const response = await fetch('/api/public/stats/', { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    const count = Number(data.registeredUsers);
    if (!Number.isFinite(count)) return;
    liveUserCount = count;
    paintLiveCount();
  } catch {
    // keep the last known number; a network hiccup should not blank the badge
  }
}

function render(announceRoute = false) {
  const intro = INTRO_ROUTES.has(route) || !currentUser;
  document.body.classList.toggle('is-intro', intro);
  ui.appView.innerHTML = renderView(route, state, { filters, user: currentUser, authError, authMessage, importMode, tourStep, nextRoute: routeAfterAccountSetup() });
  if (route === 'home') void refreshLiveCount();
  ui.desktopNav.innerHTML = renderNav(route, 'desktop');
  ui.bottomNav.innerHTML = renderNav(route, 'mobile');
  ui.desktopNav.hidden = intro || !currentUser;
  ui.bottomNav.hidden = intro || !currentUser;
  ui.floatingAdd.hidden = intro || route === 'add' || !currentUser;
  updateAccountControls();
  const title = {
    welcome: 'Welcome', register: 'Create account', login: 'Sign in', recover: 'Recover GONE ID',
    'account-created': 'Your GONE ID', 'import-data': 'Choose your ledger', onboarding: 'Set up your money', tour: 'A quick GONE tour', home: 'Home', add: 'Add an entry',
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

  // Mount Interactive Bokeh Visualizations
  if (route === 'dashboard') {
    mountBokehInsights(state);
  } else if (route === 'savings') {
    mountBokehSavings(state);
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
  const saved = persistLocal(state);
  if (currentUser) void syncBackend(state);
  if (nextRoute) navigate(nextRoute);
  else render();
  toast(saved ? message : 'Your account cache could not be saved in this browser. Check its storage settings.');
}

function mergeRows(primary = [], secondary = []) {
  const rows = new Map(primary.map((row) => [row.id, row]));
  secondary.forEach((row) => { if (!rows.has(row.id)) rows.set(row.id, row); });
  return [...rows.values()];
}

function mergeLedger(primary, secondary) {
  const cloud = normalizeState(primary || {});
  const local = normalizeState(secondary || {});
  const mergedDays = { ...local.reminderDays, ...cloud.reminderDays };
  for (const [date, localDay] of Object.entries(local.reminderDays)) {
    mergedDays[date] = { ...localDay, ...(cloud.reminderDays[date] || {}) };
  }
  return normalizeState({
    ...cloud,
    onboardingComplete: cloud.onboardingComplete || local.onboardingComplete,
    tourComplete: cloud.tourComplete || local.tourComplete,
    profile: {
      name: cloud.profile.name || local.profile.name,
      budget: cloud.profile.budget || local.profile.budget,
      monthlyIncome: cloud.profile.monthlyIncome || local.profile.monthlyIncome
    },
    savingGoal: cloud.savingGoal || local.savingGoal,
    entries: mergeRows(cloud.entries, local.entries),
    reminders: mergeRows(cloud.reminders, local.reminders),
    splits: mergeRows(cloud.splits, local.splits),
    reminderDays: mergedDays,
    lastSeenDate: cloud.lastSeenDate > local.lastSeenDate ? cloud.lastSeenDate : local.lastSeenDate,
    lastAutoLogDate: cloud.lastAutoLogDate > local.lastAutoLogDate ? cloud.lastAutoLogDate : local.lastAutoLogDate
  });
}

function routeAfterAccountSetup() {
  if (!state.onboardingComplete) return 'onboarding';
  return state.tourComplete ? 'home' : 'tour';
}

async function activateAccount(user, { registered = false } = {}) {
  currentUser = user;
  tourStep = 0;
  authReady = true;
  authError = '';
  authMessage = '';
  syncStatus = 'idle';
  try {
    const response = await accountRequest('/api/state/');
    const remoteState = normalizeState(response || {});
    accountStateBase = remoteState;
    const cachedState = loadUserState(user.id);
    const cacheNeedsMerge = response.hasData && cachedState && hasMeaningfulData(cachedState)
      && JSON.stringify(normalizeState(cachedState)) !== JSON.stringify(remoteState);

    if (response.hasData) {
      state = remoteState;
      if (cacheNeedsMerge) {
        migrationSource = cachedState;
        importMode = 'merge';
        route = 'import-data';
      } else if (hasMeaningfulData(legacyState) && !legacyDecisionMade(user.id)) {
        migrationSource = legacyState;
        importMode = 'merge';
        route = 'import-data';
      } else {
        migrationSource = null;
        importMode = '';
        persistLocal(state);
        route = routeAfterAccountSetup();
      }
    } else if (cachedState && hasMeaningfulData(cachedState)) {
      state = cachedState;
      migrationSource = null;
      importMode = '';
      route = routeAfterAccountSetup();
      persistLocal(state);
      void syncBackend(state, { quiet: true });
    } else if (hasMeaningfulData(legacyState) && !legacyDecisionMade(user.id)) {
      state = createEmptyState();
      migrationSource = legacyState;
      importMode = 'import';
      route = 'import-data';
    } else {
      state = createEmptyState();
      state.profile.name = String(user.displayName || '').trim().slice(0, 40);
      migrationSource = null;
      importMode = '';
      persistLocal(state);
      route = routeAfterAccountSetup();
    }

    let changed = processPreviousDay();
    changed = syncMonthlyIncome() || changed;
    if (changed) {
      persistLocal(state);
      void syncBackend(state, { quiet: true });
    }
    if (registered) route = 'account-created';
    if (location.hash !== routeUrl(route)) replaceRoute(route);
    render();
    return true;
  } catch (error) {
    currentUser = null;
    state = createEmptyState();
    authError = 'Your account is signed in, but GONE could not load its private ledger. Check your connection and try again.';
    route = 'welcome';
    render();
    console.warn('GONE account restore failed:', error.status || error.message);
    return false;
  }
}

async function restoreSession() {
  try {
    const response = await apiRequest('/api/auth/session/');
    if (response?.authenticated && response.user) {
      await activateAccount(response.user);
      return;
    }
    currentUser = null;
    state = createEmptyState();
    authReady = true;
    route = PUBLIC_ROUTES.has(routeFromHash()) ? routeFromHash() : 'welcome';
    if (location.hash !== routeUrl(route)) replaceRoute(route);
    render();
  } catch (error) {
    currentUser = null;
    state = createEmptyState();
    authReady = true;
    authError = 'GONE could not check your session. Check your connection and try again.';
    authMessage = authError;
    route = PUBLIC_ROUTES.has(routeFromHash()) ? routeFromHash() : 'welcome';
    if (location.hash !== routeUrl(route)) replaceRoute(route);
    render();
  }
}

function setFormMessage(form, message, tone = 'error') {
  const target = form.querySelector('[data-auth-message]');
  if (!target) {
    toast(message);
    return;
  }
  target.textContent = message;
  target.className = `auth-feedback auth-feedback--${tone}`;
  target.hidden = !message;
}

function setFormBusy(form, busy) {
  form.querySelectorAll('button[type="submit"]').forEach((button) => {
    button.disabled = busy;
    if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
    button.textContent = busy ? 'Please wait…' : button.dataset.originalText;
  });
}

async function registerAccount(form) {
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const password = String(data.get('password') || '');
  const passwordConfirm = String(data.get('passwordConfirm') || '');
  if (password !== passwordConfirm) {
    setFormMessage(form, 'The passwords do not match.');
    return;
  }
  setFormBusy(form, true);
  try {
    const response = await apiRequest('/api/auth/register/', {
      method: 'POST',
      body: {
        goneId: String(data.get('goneId') || '').trim(),
        displayName: String(data.get('displayName') || '').trim(),
        password,
        passwordConfirm,
        recoveryQuestion1: String(data.get('recoveryQuestion1') || ''),
        recoveryAnswer1: String(data.get('recoveryAnswer1') || ''),
        recoveryQuestion2: String(data.get('recoveryQuestion2') || ''),
        recoveryAnswer2: String(data.get('recoveryAnswer2') || '')
      }
    });
    announceAccountSessionChange();
    await activateAccount(response.user, { registered: true });
  } catch (error) {
    setFormBusy(form, false);
    if (error.status === 409) {
      const idInput = form.querySelector('[name="goneId"]');
      idInput?.setAttribute('aria-invalid', 'true');
      setFormMessage(form, `${error.message} If this is already your account, sign in below. Otherwise choose another ID or use “Use a GONE-generated ID instead”.`);
      idInput?.focus({ preventScroll: true });
    } else {
      setFormMessage(form, error.message || 'Your account could not be created. Try again.');
    }
  }
}

async function loginAccount(form) {
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  setFormBusy(form, true);
  try {
    const response = await apiRequest('/api/auth/login/', {
      method: 'POST',
      body: { goneId: String(data.get('goneId') || '').trim(), password: String(data.get('password') || '') }
    });
    announceAccountSessionChange();
    await activateAccount(response.user);
  } catch (error) {
    setFormBusy(form, false);
    setFormMessage(form, error.message || 'The GONE ID or password is incorrect.');
  }
}

async function recoverGoneId(form) {
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  setFormMessage(form, '');
  try {
    const response = await apiRequest('/api/auth/recover-gone-id/', {
      method: 'POST',
      body: {
        question1: String(data.get('question1') || ''),
        answer1: String(data.get('answer1') || ''),
        question2: String(data.get('question2') || ''),
        answer2: String(data.get('answer2') || '')
      }
    });
    const result = form.querySelector('[data-recovery-result]');
    if (result) {
      result.textContent = `Your GONE ID is ${response.goneId}. Use it with your password to sign in.`;
      result.hidden = false;
    }
    form.querySelectorAll('input[type="password"]').forEach((input) => { input.value = ''; });
  } catch (error) {
    setFormMessage(form, error.message || 'We could not verify both answers. Check them and try again.');
  } finally {
    if (button) button.disabled = false;
  }
}

async function chooseLedger(action) {
  if (!currentUser || !migrationSource) return;
  let nextState;
  if (action === 'keep-account-ledger') {
    nextState = accountStateBase || createEmptyState();
  } else if (action === 'merge-legacy') {
    nextState = mergeLedger(accountStateBase || state, migrationSource);
  } else if (action === 'import-legacy') {
    nextState = normalizeState(migrationSource);
  } else if (action === 'start-account-fresh') {
    nextState = createEmptyState();
    nextState.profile.name = String(currentUser.displayName || '').trim().slice(0, 40);
  } else {
    return;
  }

  state = normalizeState(nextState);
  persistLocal(state);
  if (action !== 'keep-account-ledger' && !await syncBackend(state, { quiet: true })) {
    authMessage = 'GONE could not save that choice to your account. Nothing was moved; check your connection and try again.';
    render();
    return;
  }
  markLegacyDecision(currentUser.id);
  accountStateBase = normalizeState(state);
  migrationSource = null;
  importMode = '';
  authMessage = '';
  route = routeAfterAccountSetup();
  replaceRoute(route);
  render(true);
}

async function signOut() {
  try {
    await syncQueue.catch(() => false);
    await apiRequest('/api/auth/logout/', { method: 'POST', body: {} });
    announceAccountSessionChange();
    currentUser = null;
    state = createEmptyState();
    migrationSource = null;
    accountStateBase = null;
    importMode = '';
    authError = '';
    authMessage = '';
    syncStatus = 'idle';
    route = 'welcome';
    replaceRoute('welcome');
    render(true);
    toast('You are signed out. Your account data remains private to your GONE account.');
  } catch (error) {
    toast(error.message || 'GONE could not sign you out. Try again.');
  }
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
      persistLocal(state);
      if (currentUser) void syncBackend(state);
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
  commit('Your account setup is ready.', routeAfterAccountSetup());
}

function skipOnboarding() {
  if (!state.onboardingComplete) {
    state.onboardingComplete = true;
    state.profile = { name: '', budget: 0, monthlyIncome: 0 };
    state.reminders = [];
    state.lastSeenDate = localISODate();
    persistLocal(state);
    if (currentUser) void syncBackend(state);
  }
  navigate(routeAfterAccountSetup());
  toast(state.tourComplete ? 'Your blank ledger is ready.' : 'Your setup is saved. Let’s take a quick tour.');
}

function finishTour() {
  state.tourComplete = true;
  persistLocal(state);
  if (currentUser) void syncBackend(state, { quiet: true });
  tourStep = 0;
  navigate('home');
  toast('Your GONE ledger is ready.');
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
  if (event.target.matches('#register-form [name="goneId"]')) {
    event.target.removeAttribute('aria-invalid');
    const feedback = event.target.form?.querySelector('[data-auth-message]');
    if (feedback?.textContent.startsWith('This GONE ID is already taken.')) setFormMessage(event.target.form, '');
  }
  if (event.target.matches('#entry-form [data-currency-input]')) formatCurrencyField(event.target);
}

async function handleAction(action) {
  switch (action) {
    case 'use-generated-id': {
      const form = document.querySelector('#register-form');
      const idInput = form?.querySelector('[name="goneId"]');
      if (!form || !idInput) return;
      idInput.value = '';
      idInput.removeAttribute('aria-invalid');
      setFormMessage(form, 'GONE will create a fresh unique ID when you submit.', 'success');
      idInput.focus({ preventScroll: true });
      return;
    }
    case 'next-tour-step':
      tourStep = Math.min(2, tourStep + 1);
      render(true);
      return;
    case 'finish-tour':
    case 'skip-tour': finishTour(); return;
    case 'sign-out': await signOut(); return;
    case 'retry-account-load': await restoreSession(); return;
    case 'retry-sync': await syncBackend(state); return;
    case 'continue-account-setup':
      navigate(migrationSource ? 'import-data' : routeAfterAccountSetup());
      return;
    case 'copy-gone-id': {
      const id = document.querySelector('[data-gone-id]')?.textContent || currentUser?.goneId || '';
      try {
        await navigator.clipboard.writeText(id);
        toast('GONE ID copied. Keep it with your account details.');
      } catch {
        toast(id ? `Your GONE ID is ${id}.` : 'Your GONE ID could not be copied.');
      }
      return;
    }
    case 'import-legacy':
    case 'merge-legacy':
    case 'keep-account-ledger':
    case 'start-account-fresh':
      await chooseLedger(action);
      return;
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
    void handleAction(actionControl.dataset.action);
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

async function handleSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.id === 'register-form') {
    event.preventDefault();
    await registerAccount(form);
    return;
  }
  if (form.id === 'login-form') {
    event.preventDefault();
    await loginAccount(form);
    return;
  }
  if (form.id === 'recovery-form') {
    event.preventDefault();
    await recoverGoneId(form);
    return;
  }
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
    commit('Split calculated and saved to your GONE account.');
  }
}

function initialize() {
  refreshLiveCount();
  setInterval(refreshLiveCount, 15000);
  route = 'welcome';
  if (!location.hash) replaceRoute('welcome');
  render();
  document.addEventListener('click', handleClick);
  document.addEventListener('submit', handleSubmit);
  document.addEventListener('input', handleInput);
  window.addEventListener('hashchange', () => {
    const previousRoute = route;
    let next = routeFromHash() || 'welcome';
    if (!authReady || !currentUser) {
      if (!PUBLIC_ROUTES.has(next)) next = 'welcome';
    } else if (['register', 'login', 'recover'].includes(next)) {
      next = routeAfterAccountSetup();
    } else if (!state.onboardingComplete && !['welcome', 'onboarding', 'account', 'account-created', 'import-data'].includes(next)) {
      next = 'onboarding';
    } else if (state.onboardingComplete && !state.tourComplete && !['welcome', 'onboarding', 'account', 'account-created', 'import-data', 'tour'].includes(next)) {
      next = 'tour';
    } else if (next === 'import-data' && !migrationSource) {
      next = routeAfterAccountSetup();
    }
    if (location.hash !== routeUrl(next)) replaceRoute(next);
    else route = next;
    render(route !== previousRoute);
  });
  scheduleMidnightAutoLog();
  void restoreSession();
}

initialize();
