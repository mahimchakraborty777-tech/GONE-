export const APP_ROUTES = ['welcome', 'onboarding', 'home', 'add', 'expenses', 'dashboard', 'savings', 'split'];

export const NAV_ITEMS = [
  { route: 'home', label: 'Home', icon: '⌂' },
  { route: 'expenses', label: 'Entries', icon: '↘' },
  { route: 'dashboard', label: 'Insights', icon: '◒' },
  { route: 'savings', label: 'Savings', icon: '✳' },
  { route: 'split', label: 'Split', icon: '⤴' }
];

export const CATEGORIES = [
  { value: 'Food', icon: '☕' },
  { value: 'Travel', icon: '🚇' },
  { value: 'Shopping', icon: '🛍️' },
  { value: 'Bills', icon: '⚡' },
  { value: 'Other', icon: '✦' }
];

// These are reminder templates, not transaction history. No spending is recorded until the user toggles one.
export const STARTER_REMINDERS = [
  { id: 'chai', title: 'Chai', amount: 20, category: 'Food', icon: '☕' },
  { id: 'metro', title: 'Metro', amount: 50, category: 'Travel', icon: '🚇' },
  { id: 'recharge', title: 'Recharge', amount: 99, category: 'Bills', icon: '📱' }
];
