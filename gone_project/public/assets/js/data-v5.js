export const APP_ROUTES = ['welcome', 'register', 'login', 'recover', 'account-created', 'import-data', 'onboarding', 'tour', 'account', 'home', 'add', 'expenses', 'dashboard', 'savings', 'split'];

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

export const RECOVERY_QUESTIONS = [
  { id: 'first_school', label: 'What was the name of your first school?' },
  { id: 'childhood_nickname', label: 'What was your childhood nickname?' },
  { id: 'first_pet', label: 'What was the name of your first pet?' },
  { id: 'childhood_best_friend', label: 'What was your childhood best friend’s name?' },
  { id: 'memorable_place', label: 'What was the name of a memorable childhood place?' },
  { id: 'favorite_childhood_book', label: 'What was your favorite childhood book?' }
];

// Reminder templates are not transaction history. No spending is recorded until the user toggles one.
export const STARTER_REMINDERS = [
  { id: 'chai', title: 'Chai', amount: 20, category: 'Food', icon: '☕' },
  { id: 'metro', title: 'Metro', amount: 50, category: 'Travel', icon: '🚇' },
  { id: 'recharge', title: 'Recharge', amount: 99, category: 'Bills', icon: '📱' }
];
