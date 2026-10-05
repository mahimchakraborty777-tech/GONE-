const STORAGE_KEY = 'gone.browser-app.v3';
const LEGACY_KEY = 'gone.clean-ledger.v1';
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

function normalizeState(raw) {
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
    reminderDays: raw.reminderDays && typeof raw.reminderDays === 'object' ? raw.reminderDays : {},
    lastSeenDate: validDate(raw.lastSeenDate) ? raw.lastSeenDate : '',
    lastAutoLogDate: validDate(raw.lastAutoLogDate) ? raw.lastAutoLogDate : '',
    splits
  };
}

function emptyState() {
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

export function loadState() {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) return normalizeState(JSON.parse(current));
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) return emptyState();
    const previous = JSON.parse(legacy);
    const hasExistingLedger = Boolean((Array.isArray(previous?.entries) && previous.entries.length) || Number(previous?.savingGoal) > 0);
    return normalizeState({
      onboardingComplete: hasExistingLedger,
      profile: { name: '', budget: 0, monthlyIncome: 0 },
      savingGoal: previous?.savingGoal,
      entries: Array.isArray(previous?.entries) ? previous.entries : [],
      reminders: [],
      reminderDays: {},
      lastSeenDate: '',
      lastAutoLogDate: '',
      splits: []
    });
  } catch {
    return emptyState();
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
