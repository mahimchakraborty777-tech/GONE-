const LEGACY_KEY = 'gone.browser-app.v3';
const OLDER_LEGACY_KEY = 'gone.clean-ledger.v1';
const ACCOUNT_KEY_PREFIX = 'gone.account-cache.v1.';
const IMPORT_MARKER_KEY = 'gone.account-legacy-decisions.v1';
const moneyFormat = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

export function createId(prefix = 'id') {
  const token = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${token}`;
}

export function localISODate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(dateString, amount) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return localISODate(date);
}

export function monthKey(dateString = localISODate()) {
  return dateString.slice(0, 7);
}

export function formatMoney(value) {
  return moneyFormat.format(Number(value) || 0);
}

export function formatDate(dateString) {
  if (!dateString) return '';
  const today = localISODate();
  if (dateString === today) return 'Today';
  if (dateString === addDays(today, -1)) return 'Yesterday';
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(date);
}

export function formatMonth(dateString = localISODate()) {
  const date = new Date(`${dateString.slice(0, 7)}-15T12:00:00`);
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(date);
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validEntry(entry) {
  return entry && typeof entry.id === 'string'
    && typeof entry.title === 'string'
    && Number.isFinite(Number(entry.amount)) && Number(entry.amount) > 0
    && ['spent', 'received'].includes(entry.kind)
    && validDate(entry.date);
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function normalizeState(raw = {}) {
  const profile = raw.profile && typeof raw.profile === 'object' ? raw.profile : {};
  const entries = Array.isArray(raw.entries) ? raw.entries.filter(validEntry).map((entry) => ({
    id: entry.id,
    title: entry.title.slice(0, 100),
    amount: Number(entry.amount),
    kind: entry.kind,
    category: typeof entry.category === 'string' ? entry.category.slice(0, 32) : 'Other',
    date: entry.date,
    source: typeof entry.source === 'string' ? entry.source : 'manual',
    reminderId: typeof entry.reminderId === 'string' ? entry.reminderId : '',
    autoLogged: Boolean(entry.autoLogged)
  })) : [];
  const reminders = Array.isArray(raw.reminders) ? raw.reminders.filter((item) => item && typeof item.id === 'string' && typeof item.title === 'string' && positiveNumber(item.amount) > 0).map((item) => ({
    id: item.id,
    title: item.title.slice(0, 60),
    amount: positiveNumber(item.amount),
    category: typeof item.category === 'string' ? item.category.slice(0, 32) : 'Other',
    icon: typeof item.icon === 'string' ? item.icon.slice(0, 8) : '✦',
    createdOn: validDate(item.createdOn) ? item.createdOn : localISODate()
  })) : [];
  const splits = Array.isArray(raw.splits) ? raw.splits.filter((item) => item && typeof item.id === 'string' && Number(item.total) > 0 && Array.isArray(item.friends)).map((item) => ({
    id: item.id,
    description: String(item.description || 'Shared bill').slice(0, 80),
    total: positiveNumber(item.total),
    friends: item.friends.map((name) => String(name).slice(0, 40)).filter(Boolean).slice(0, 20),
    date: validDate(item.date) ? item.date : localISODate()
  })) : [];

  return {
    version: 3,
    onboardingComplete: Boolean(raw.onboardingComplete),
    profile: {
      name: typeof profile.name === 'string' ? profile.name.trim().slice(0, 40) : '',
      budget: positiveNumber(profile.budget),
      monthlyIncome: positiveNumber(profile.monthlyIncome)
    },
    savingGoal: positiveNumber(raw.savingGoal) || null,
    entries,
    reminders,
    reminderDays: raw.reminderDays && typeof raw.reminderDays === 'object' && !Array.isArray(raw.reminderDays) ? raw.reminderDays : {},
    lastSeenDate: validDate(raw.lastSeenDate) ? raw.lastSeenDate : '',
    lastAutoLogDate: validDate(raw.lastAutoLogDate) ? raw.lastAutoLogDate : '',
    splits
  };
}

export function createEmptyState() {
  return normalizeState({
    onboardingComplete: false,
    profile: { name: '', budget: 0, monthlyIncome: 0 },
    savingGoal: null,
    entries: [],
    reminders: [],
    reminderDays: {},
    lastSeenDate: '',
    lastAutoLogDate: '',
    splits: []
  });
}

export function hasMeaningfulData(raw) {
  const state = normalizeState(raw);
  return state.entries.length > 0
    || state.reminders.length > 0
    || state.splits.length > 0
    || Boolean(state.profile.name || state.profile.budget || state.profile.monthlyIncome || state.savingGoal)
    || state.onboardingComplete;
}

function mergeLegacyStates(current, older) {
  const newer = normalizeState(current);
  const previous = normalizeState(older);
  const mergeRows = (primary, secondary) => {
    const rows = new Map(primary.map((row) => [row.id, row]));
    secondary.forEach((row) => { if (!rows.has(row.id)) rows.set(row.id, row); });
    return [...rows.values()];
  };
  const reminderDays = { ...previous.reminderDays, ...newer.reminderDays };
  for (const [date, values] of Object.entries(previous.reminderDays)) {
    reminderDays[date] = { ...values, ...(newer.reminderDays[date] || {}) };
  }
  return normalizeState({
    ...previous,
    ...newer,
    onboardingComplete: newer.onboardingComplete || previous.onboardingComplete,
    profile: {
      name: newer.profile.name || previous.profile.name,
      budget: newer.profile.budget || previous.profile.budget,
      monthlyIncome: newer.profile.monthlyIncome || previous.profile.monthlyIncome
    },
    savingGoal: newer.savingGoal || previous.savingGoal,
    entries: mergeRows(newer.entries, previous.entries),
    reminders: mergeRows(newer.reminders, previous.reminders),
    splits: mergeRows(newer.splits, previous.splits),
    reminderDays,
    lastSeenDate: newer.lastSeenDate > previous.lastSeenDate ? newer.lastSeenDate : previous.lastSeenDate,
    lastAutoLogDate: newer.lastAutoLogDate > previous.lastAutoLogDate ? newer.lastAutoLogDate : previous.lastAutoLogDate
  });
}

export function loadLegacyState() {
  try {
    const currentRaw = localStorage.getItem(LEGACY_KEY);
    const olderRaw = localStorage.getItem(OLDER_LEGACY_KEY);
    const current = currentRaw ? normalizeState(JSON.parse(currentRaw)) : null;
    if (!olderRaw) return current || createEmptyState();
    const olderData = JSON.parse(olderRaw);
    const older = normalizeState({
      onboardingComplete: Boolean((Array.isArray(olderData?.entries) && olderData.entries.length) || Number(olderData?.savingGoal) > 0),
      profile: { name: '', budget: 0, monthlyIncome: 0 },
      savingGoal: olderData?.savingGoal,
      entries: Array.isArray(olderData?.entries) ? olderData.entries : [],
      reminders: [],
      reminderDays: {},
      lastSeenDate: '',
      lastAutoLogDate: '',
      splits: []
    });
    if (!current) return older;
    if (!hasMeaningfulData(current)) return older;
    return hasMeaningfulData(older) ? mergeLegacyStates(current, older) : current;
  } catch {
    return createEmptyState();
  }
}

function accountStorageKey(userId) {
  const id = String(userId ?? '');
  return /^\d{1,20}$/.test(id) ? `${ACCOUNT_KEY_PREFIX}${id}` : '';
}

export function loadUserState(userId) {
  const key = accountStorageKey(userId);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveUserState(userId, state) {
  const key = accountStorageKey(userId);
  if (!key) return false;
  try {
    localStorage.setItem(key, JSON.stringify(normalizeState(state)));
    return true;
  } catch {
    return false;
  }
}

export function legacyDecisionMade(userId) {
  try {
    const decisions = JSON.parse(localStorage.getItem(IMPORT_MARKER_KEY) || '{}');
    return Boolean(decisions[String(userId)]);
  } catch {
    return false;
  }
}

export function markLegacyDecision(userId) {
  try {
    const decisions = JSON.parse(localStorage.getItem(IMPORT_MARKER_KEY) || '{}');
    decisions[String(userId)] = true;
    localStorage.setItem(IMPORT_MARKER_KEY, JSON.stringify(decisions));
    return true;
  } catch {
    return false;
  }
}
