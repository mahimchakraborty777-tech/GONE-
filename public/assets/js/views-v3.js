import { CATEGORIES, NAV_ITEMS, STARTER_REMINDERS } from './data-v3.js';
import { addDays, formatDate, formatMoney, formatMonth, localISODate, monthKey } from './store-v3.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const entriesNewestFirst = (entries) => [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
const sum = (entries) => entries.reduce((total, entry) => total + Number(entry.amount || 0), 0);
const thisMonth = (entries) => entries.filter((entry) => entry.date.startsWith(monthKey()));

export function renderNav(activeRoute, placement = 'desktop') {
  const active = activeRoute === 'add' ? 'home' : activeRoute;
  return NAV_ITEMS.map((item) => `<a class="nav-item nav-item--${placement}${active === item.route ? ' is-active' : ''}" href="#/${item.route}" data-route="${item.route}"${active === item.route ? ' aria-current="page"' : ''}>
    <span class="nav-item__icon" aria-hidden="true">${item.icon}</span><span class="nav-item__label">${item.label}</span>
  </a>`).join('');
}

function entryRow(entry, compact = false) {
  const received = entry.kind === 'received';
  const sign = received ? '+' : '−';
  const badge = entry.autoLogged ? '<span class="entry-badge">Auto-logged</span>' : '';
  const source = entry.source === 'monthly-income' ? '<span class="entry-badge entry-badge--soft">Monthly</span>' : '';
  return `<li class="entry-row${compact ? ' entry-row--compact' : ''}${received ? ' entry-row--received' : ''}">
    <span class="entry-icon" aria-hidden="true">${received ? '↗' : '↘'}</span>
    <div class="entry-copy"><div class="entry-title-line"><strong>${esc(entry.title)}</strong>${badge}${source}</div><span>${esc(entry.category || 'Other')} · ${formatDate(entry.date)}</span></div>
    <div class="entry-amount-wrap"><strong class="entry-amount">${sign}${formatMoney(entry.amount)}</strong><button class="text-action" type="button" data-delete-entry="${esc(entry.id)}" aria-label="Remove ${esc(entry.title)}">Remove</button></div>
  </li>`;
}

function entryList(entries, emptyText = 'Nothing here yet. Add a note when you are ready.') {
  if (!entries.length) return `<div class="empty-card"><span class="empty-card__mark" aria-hidden="true">✳</span><p>${esc(emptyText)}</p></div>`;
  return `<ul class="entry-list">${entries.map((entry) => entryRow(entry)).join('')}</ul>`;
}

function pageHead(eyebrow, title, subtitle = '') {
  return `<div class="page-head"><div><p class="eyebrow">${esc(eyebrow)}</p><h1>${title}</h1>${subtitle ? `<p class="page-subtitle">${esc(subtitle)}</p>` : ''}</div></div>`;
}

function categoryChips(selected = 'Food') {
  return `<div class="category-chips" role="group" aria-label="Choose a category">${CATEGORIES.map((category) => `<button type="button" class="category-chip${selected === category.value ? ' is-selected' : ''}" data-entry-category="${esc(category.value)}" aria-pressed="${selected === category.value}"><span aria-hidden="true">${category.icon}</span>${esc(category.value)}</button>`).join('')}</div><select name="category" class="sr-only" tabindex="-1" aria-label="Entry category" required>${CATEGORIES.map((category) => `<option value="${esc(category.value)}"${selected === category.value ? ' selected' : ''}>${esc(category.value)}</option>`).join('')}<option value="Income"${selected === 'Income' ? ' selected' : ''}>Income</option></select>`;
}

function welcomeView(state) {
  return `<section class="welcome-screen">
    <div class="welcome-art" aria-hidden="true"><span class="coin coin--one">₹</span><span class="coin coin--two">✳</span><span class="coin coin--three">G</span><span class="welcome-sun"></span></div>
    <div class="welcome-copy"><p class="eyebrow">Growth Over Needless Expenses</p><h1>GONE<span class="brand-dot">.</span></h1><p class="welcome-tagline">Know where it went.</p><p class="welcome-text">A little less guessing. A little more knowing. Keep the numbers that matter, skip the fuss.</p>
      <div class="welcome-actions"><a class="button button--primary" href="#/onboarding" data-route="onboarding">Get started <span aria-hidden="true">↗</span></a>${state.onboardingComplete ? '<a class="button button--quiet" href="#/home" data-route="home">Continue in this browser</a>' : '<button class="button button--quiet" type="button" data-action="skip-setup">Start with an empty ledger</button>'}</div>
      <p class="local-note"><span class="local-dot" aria-hidden="true"></span>No account needed. Your setup stays in this browser.</p>
    </div>
    <div class="welcome-stamp"><span>YOUR MONEY,</span><strong>on your terms.</strong></div>
  </section>`;
}

function onboardingView(state) {
  const editing = state.onboardingComplete;
  const reminders = state.reminders.map((item) => item.id);
  const useDefaults = !editing && state.reminders.length === 0;
  return `<section class="onboarding-view">
    <div class="onboarding-intro"><a class="back-link" href="#/welcome" data-route="welcome">← Back</a><p class="eyebrow">${editing ? 'Your local setup' : 'A quick first step'}</p><h1>${editing ? 'Make GONE yours.' : 'Start with what matters.'}</h1><p class="page-subtitle">No password, no account, no cloud. This setup only lives in this browser.</p></div>
    <form id="setup-form" class="onboarding-card">
      <div class="form-section"><p class="form-step">01 <span>Your starting point</span></p><label class="form-field">What should we call you? <span class="optional">Optional</span><input type="text" name="display_name" maxlength="40" autocomplete="given-name" placeholder="Your name" value="${esc(state.profile.name)}"></label><label class="form-field">Monthly spending budget <span class="optional">Optional</span><span class="money-field"><span>₹</span><input type="number" name="budget" min="0" max="999999999" step="100" inputmode="decimal" placeholder="Set one if useful" value="${state.profile.budget || ''}"></span><small>We’ll show how much remains this month. You can change this later.</small></label></div>
      <div class="form-section"><p class="form-step">02 <span>Optional daily reminders</span></p><p class="form-help">These are reminders, not preset expenses. Mark one done, skip it for today, or let unmarked reminders auto-log at day’s end while GONE is open—or when you return if it was closed.</p><div class="suggestion-list">${STARTER_REMINDERS.map((item) => {
        const checked = state.reminders.length ? reminders.includes(item.id) : useDefaults;
        return `<label class="suggestion-row"><input type="checkbox" name="reminder-option" value="${esc(item.id)}"${checked ? ' checked' : ''}><span class="suggestion-icon" aria-hidden="true">${item.icon}</span><span class="suggestion-copy"><strong>${esc(item.title)}</strong><small>${esc(item.category)} reminder</small></span><span class="suggestion-price">${formatMoney(item.amount)}</span></label>`;
      }).join('')}</div></div>
      <div class="onboarding-footer"><button class="button button--primary" type="submit">${editing ? 'Save my setup' : 'Open my ledger'} <span aria-hidden="true">↗</span></button><button class="text-action text-action--large" type="button" data-action="skip-setup">${editing ? 'Cancel' : 'Skip setup'}</button></div>
    </form>
  </section>`;
}

function reminderRow(reminder, status) {
  const complete = status === 'done' || status === 'auto';
  const statusCopy = status === 'auto' ? 'Auto-logged' : status === 'skipped' ? 'Skipped today' : complete ? 'Logged today' : 'Tap if you had it';
  return `<article class="reminder-row${complete ? ' is-complete' : ''}${status === 'auto' ? ' is-auto' : ''}">
    <span class="reminder-icon" aria-hidden="true">${esc(reminder.icon || '✳')}</span><span class="reminder-copy"><strong>${esc(reminder.title)} <small>${formatMoney(reminder.amount)}</small></strong><span>${esc(statusCopy)}</span></span>
    <button type="button" class="toggle-switch${complete ? ' is-on' : ''}" role="switch" aria-checked="${complete}" aria-label="${complete ? 'Undo' : 'Log'} ${esc(reminder.title)} for today" data-reminder-toggle="${esc(reminder.id)}"><span></span></button>
    <button type="button" class="icon-action reminder-remove" aria-label="Remove ${esc(reminder.title)} reminder" data-delete-reminder="${esc(reminder.id)}">×</button>
  </article>`;
}

function homeView(state) {
  const today = localISODate();
  const monthEntries = thisMonth(state.entries);
  const spentMonth = sum(monthEntries.filter((entry) => entry.kind === 'spent'));
  const receivedMonth = sum(monthEntries.filter((entry) => entry.kind === 'received'));
  const budget = Number(state.profile.budget) || 0;
  const remaining = budget ? Math.max(0, budget - spentMonth) : 0;
  const used = budget ? Math.min(100, Math.round((spentMonth / budget) * 100)) : 0;
  const budgetColor = used >= 90 ? 'var(--terracotta)' : used >= 70 ? 'var(--sand)' : 'var(--sage)';
  const mondayOffset = (new Date(`${today}T12:00:00`).getDay() + 6) % 7;
  const weekStart = addDays(today, -mondayOffset);
  const spentToday = sum(state.entries.filter((entry) => entry.kind === 'spent' && entry.date === today));
  const spentWeek = sum(state.entries.filter((entry) => entry.kind === 'spent' && entry.date >= weekStart && entry.date <= today));
  const largest = [...monthEntries].filter((entry) => entry.kind === 'spent').sort((a, b) => b.amount - a.amount)[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Winding down';
  const name = state.profile.name ? `, ${esc(state.profile.name)}` : '';
  const reminders = state.reminders;
  const dayLog = state.reminderDays[today] || {};
  const pending = reminders.filter((item) => !dayLog[item.id]).length;
  const recent = entriesNewestFirst(state.entries).slice(0, 5);
  return `<section class="home-view">
    <div class="home-hero"><div><p class="eyebrow">${formatMonth()}</p><h1>${greeting}${name}.</h1><p class="page-subtitle">A clear little picture of your money, without the lecture.</p></div><button class="button button--primary hero-add" type="button" data-route="add"><span aria-hidden="true">＋</span> Add an entry</button></div>
    <div class="home-overview">
      <article class="budget-card" style="--used:${used}%;--budget-color:${budgetColor}"><div class="budget-copy"><p class="eyebrow">Money left this month</p>${budget ? `<strong class="budget-amount">${formatMoney(remaining)}</strong><p>of ${formatMoney(budget)} monthly budget</p><div class="budget-track"><span style="width:${used}%"></span></div><small>${used}% used · ${formatMoney(spentMonth)} spent</small>` : `<strong class="budget-amount">Start with a budget</strong><p>No budget set. Your received and spent totals still work without one.</p><button class="text-link" type="button" data-route="onboarding">Set a budget <span aria-hidden="true">↗</span></button>`}</div><div class="budget-dial"><span>${budget ? `${used}%` : '₹'}</span><small>used</small></div></article>
      <div class="stat-grid"><article class="stat-card stat-card--rose"><span class="stat-label">Spent today</span><strong>${formatMoney(spentToday)}</strong><span class="stat-symbol">↘</span></article><article class="stat-card stat-card--olive"><span class="stat-label">Spent this week</span><strong>${formatMoney(spentWeek)}</strong><span class="stat-symbol">◷</span></article><article class="stat-card stat-card--camel"><span class="stat-label">Biggest this month</span><strong>${largest ? formatMoney(largest.amount) : '—'}</strong><span class="stat-note">${largest ? esc(largest.category) : 'Nothing yet'}</span></article></div>
    </div>
    <div class="content-grid">
      <section class="surface reminder-panel"><div class="section-title"><div><p class="eyebrow">A gentle nudge</p><h2>Today’s reminders</h2></div><span class="count-pill">${reminders.length} ${reminders.length === 1 ? 'item' : 'items'}</span></div>
        <p class="section-note">Mark one when it happens, or skip it. Anything left unmarked logs at midnight while GONE is open—or next time you visit if it was closed.</p>
        ${reminders.length ? `<div class="reminder-list">${reminders.map((item) => reminderRow(item, dayLog[item.id] || '')).join('')}</div><div class="reminder-actions"><button class="text-action" type="button" data-action="skip-all"${pending === 0 ? ' disabled' : ''}>Skip all today</button><span>${pending ? `${pending} still unmarked` : 'You’re all caught up'}</span></div>` : `<div class="empty-card empty-card--small"><p>No daily reminders yet. Add only the ones that fit your life.</p><button class="text-link" type="button" data-action="add-starter-reminders">Add the suggested reminders <span aria-hidden="true">↗</span></button></div>`}
        <form id="reminder-form" class="reminder-form"><input name="reminder_title" maxlength="50" placeholder="Add your own reminder" aria-label="Reminder name" required><span class="money-field money-field--small"><span>₹</span><input name="reminder_amount" type="number" min="1" step="1" inputmode="decimal" placeholder="Amount" aria-label="Reminder amount" required></span><select name="reminder_category" aria-label="Reminder category">${CATEGORIES.map((item) => `<option value="${esc(item.value)}">${esc(item.value)}</option>`).join('')}</select><button class="icon-add" type="submit" aria-label="Save reminder">＋</button></form>
      </section>
      <section class="surface recent-panel"><div class="section-title"><div><p class="eyebrow">The latest</p><h2>Recent entries</h2></div><button class="text-link" type="button" data-route="expenses" data-period="week">See all <span aria-hidden="true">↗</span></button></div>${entryList(recent, 'Your page is still blank. Add the first thing you want to remember.')}</section>
    </div>
    <section class="quick-links" aria-label="Explore GONE">${[
      ['dashboard', '◒', 'See where it went', 'Spending insights'],
      ['savings', '✳', 'Grow a little further', 'Your savings goal'],
      ['split', '⤴', 'Split with friends', 'Settle a shared bill']
    ].map(([route, icon, title, note]) => `<a class="quick-link" href="#/${route}" data-route="${route}"><span class="quick-link__icon" aria-hidden="true">${icon}</span><span><strong>${title}</strong><small>${note}</small></span><span class="quick-link__arrow" aria-hidden="true">↗</span></a>`).join('')}</section>
  </section>`;
}

function addView() {
  return `<section class="page-view add-view">${pageHead('A small note, not a confession', 'Log the money move.', 'Pick what happened, add the details, and get back to your day.')}
    <form id="entry-form" class="surface entry-form">
      <label class="form-field form-field--amount">Amount <span class="money-field"><span>₹</span><input name="amount" type="text" maxlength="14" inputmode="decimal" autocomplete="off" data-currency-input placeholder="0" required></span></label>
      <div class="entry-type-switch" role="group" aria-label="Entry type"><button class="is-selected" type="button" data-entry-kind="spent" aria-pressed="true">I spent</button><button type="button" data-entry-kind="received" aria-pressed="false">I received</button></div><input type="hidden" name="kind" value="spent">
      <label class="form-field form-field--large"><span id="entry-title-label">What did you buy?</span><input id="entry-title-input" name="title" data-entry-title type="text" maxlength="70" placeholder="A small detail helps later" autocomplete="off" required></label>
      <div class="entry-fields entry-fields--date"><label class="form-field">Date<input class="input" name="date" type="date" value="${localISODate()}" required></label></div>
      <fieldset id="entry-category-field" class="category-field"><legend>A little label</legend>${categoryChips()}</fieldset><button class="button button--primary button--wide" type="submit">LOG IT <span aria-hidden="true">↗</span></button><p class="form-footnote">Stored on this browser only; anyone using this profile may see it.</p>
    </form>
  </section>`;
}

function expenseView(state, filters) {
  const today = localISODate();
  const startWeek = addDays(today, -6);
  let entries = entriesNewestFirst(state.entries);
  if (filters.kind !== 'all') entries = entries.filter((entry) => entry.kind === filters.kind);
  if (filters.category !== 'all') entries = entries.filter((entry) => filters.category === 'Income' ? entry.kind === 'received' : entry.category === filters.category);
  if (filters.period === 'week') entries = entries.filter((entry) => entry.date >= startWeek && entry.date <= today);
  if (filters.period === 'month') entries = entries.filter((entry) => entry.date.startsWith(monthKey()));
  const categories = ['all', ...CATEGORIES.map((item) => item.value), 'Everyday', 'Extra', 'Income'];
  const received = sum(entries.filter((entry) => entry.kind === 'received'));
  const spent = sum(entries.filter((entry) => entry.kind === 'spent'));
  return `<section class="page-view">${pageHead('Everything in one place', 'The damage report.', 'Filter your entries by type, category, or time.')}
    <div class="surface filters-panel"><div class="filter-row"><span class="filter-label">Type</span><div class="filter-chips">${[['all','All'],['spent','Spent'],['received','Received']].map(([value,label]) => `<button type="button" class="filter-chip${filters.kind === value ? ' is-selected' : ''}" data-filter-kind="${value}" aria-pressed="${filters.kind === value}">${label}</button>`).join('')}</div></div>
      <div class="filter-row"><span class="filter-label">When</span><div class="filter-chips">${[['month','This month'],['week','Last 7 days'],['all','All time']].map(([value,label]) => `<button type="button" class="filter-chip${filters.period === value ? ' is-selected' : ''}" data-filter-period="${value}" aria-pressed="${filters.period === value}">${label}</button>`).join('')}</div></div>
      <div class="filter-row"><span class="filter-label">Category</span><div class="filter-chips filter-chips--wrap">${categories.map((value) => `<button type="button" class="filter-chip${filters.category === value ? ' is-selected' : ''}" data-filter-category="${esc(value)}" aria-pressed="${filters.category === value}">${value === 'all' ? 'All categories' : esc(value)}</button>`).join('')}</div></div>
    </div>
    <div class="entry-summary-strip"><span><strong>${entries.length}</strong> ${entries.length === 1 ? 'entry' : 'entries'}</span><span class="positive-text">Received ${formatMoney(received)}</span><span class="negative-text">Spent ${formatMoney(spent)}</span></div>
    <section class="surface list-panel">${entryList(entries, 'Nothing matches these filters. Try another view or add an entry.')}</section>
  </section>`;
}

function trendDays() {
  const today = localISODate();
  return Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
}

function dashboardView(state) {
  const monthEntries = thisMonth(state.entries);
  const spent = monthEntries.filter((entry) => entry.kind === 'spent');
  const received = monthEntries.filter((entry) => entry.kind === 'received');
  const byCategory = new Map();
  spent.forEach((entry) => byCategory.set(entry.category || 'Other', (byCategory.get(entry.category || 'Other') || 0) + Number(entry.amount)));
  const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const maxCategory = Math.max(1, ...categories.map(([, amount]) => amount));
  const days = trendDays().map((date) => ({ date, amount: sum(spent.filter((entry) => entry.date === date)) }));
  const maxDay = Math.max(1, ...days.map((item) => item.amount));
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setDate(15);
    date.setMonth(date.getMonth() - (5 - index));
    const key = monthKey(localISODate(date));
    return { key, label: new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(date), amount: sum(state.entries.filter((entry) => entry.kind === 'spent' && entry.date.startsWith(key))) };
  });
  const maxMonth = Math.max(1, ...months.map((item) => item.amount));
  return `<section class="page-view">${pageHead('Patterns, not pressure', 'See where it went.', 'A quick pulse from the entries you chose to keep.')}
    <div class="insight-stats"><article class="insight-stat insight-stat--terra"><span>Spent this month</span><strong>${formatMoney(sum(spent))}</strong><small>${spent.length} ${spent.length === 1 ? 'entry' : 'entries'}</small></article><article class="insight-stat insight-stat--olive"><span>Received this month</span><strong>${formatMoney(sum(received))}</strong><small>Money in, not wishful thinking</small></article><article class="insight-stat insight-stat--camel"><span>Net this month</span><strong>${formatMoney(sum(received) - sum(spent))}</strong><small>Received minus spent</small></article></div>
    <div class="chart-grid"><section class="surface chart-card"><div class="section-title"><div><p class="eyebrow">This month</p><h2>Where it all went</h2></div><span class="chart-mark">01</span></div><div id="chart-category" class="chart-target">${categories.length ? `<div class="horizontal-bars">${categories.map(([name, amount]) => `<div class="horizontal-bar-row"><span>${esc(name)}</span><div class="bar-track"><span style="width:${Math.round(amount / maxCategory * 100)}%"></span></div><strong>${formatMoney(amount)}</strong></div>`).join('')}</div>` : '<div class="chart-empty">Your category picture will appear after your first entry.</div>'}</div></section>
      <section class="surface chart-card"><div class="section-title"><div><p class="eyebrow">Last seven days</p><h2>Your spending pulse</h2></div><span class="chart-mark">02</span></div><div id="chart-trend" class="vertical-bars chart-target">${days.map((item) => `<div class="vertical-bar-column" title="${formatDate(item.date)} · ${formatMoney(item.amount)}"><div class="vertical-bar-track"><span style="height:${Math.max(item.amount ? 8 : 2, Math.round(item.amount / maxDay * 100))}%"></span></div><small>${new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(new Date(`${item.date}T12:00:00`))}</small></div>`).join('')}</div></section>
      <section class="surface chart-card chart-card--wide"><div class="section-title"><div><p class="eyebrow">Six month view</p><h2>Month by month</h2></div><span class="chart-mark">03</span></div><div id="chart-monthly" class="monthly-bars chart-target">${months.map((item) => `<div class="monthly-bar-column"><strong>${item.amount ? formatMoney(item.amount) : '—'}</strong><div class="monthly-bar-track"><span style="height:${Math.max(item.amount ? 8 : 2, Math.round(item.amount / maxMonth * 100))}%"></span></div><small>${item.label}</small></div>`).join('')}</div></section></div>
  </section>`;
}

function savingsView(state) {
  const entries = thisMonth(state.entries);
  const received = sum(entries.filter((entry) => entry.kind === 'received'));
  const spent = sum(entries.filter((entry) => entry.kind === 'spent'));
  const saved = Math.max(0, received - spent);
  const goal = Number(state.savingGoal) || 0;
  const progress = goal ? Math.min(100, Math.round(saved / goal * 100)) : 0;
  const status = !goal ? 'A goal is optional. Start when it feels right.' : progress >= 100 ? 'Goal crushed. That deserves a small celebration.' : progress >= 70 ? 'Almost there. Keep the gentle momentum.' : 'Small steps count. Keep building.';
  return `<section class="page-view">${pageHead('A little future, in progress', 'The treasure you’re building.', 'Your progress is based on this month’s received money minus spending.')}
    <div class="savings-hero"><div><p class="eyebrow">You’ve saved this month</p><strong class="savings-total">${formatMoney(saved)}</strong><p>${status}</p></div><div class="savings-ring" style="--goal-progress:${progress}%"><span>${goal ? `${progress}%` : '✳'}</span><small>of goal</small></div></div>
    <div class="savings-grid"><section class="surface savings-card"><div class="section-title"><div><p class="eyebrow">Your target</p><h2>${goal ? 'Saving goal' : 'Set a savings goal'}</h2></div><span class="chart-mark">✳</span></div>${goal ? `<p class="goal-big">${formatMoney(goal)}</p><div class="goal-track"><span style="width:${progress}%"></span></div><p class="section-note">${formatMoney(saved)} saved · ${formatMoney(Math.max(0, goal - saved))} to go</p>` : '<p class="section-note">Choose one monthly target. You can change or remove it at any time.</p>'}<form id="goal-form" class="compact-form"><label class="form-field">Monthly target <span class="money-field"><span>₹</span><input name="target_amount" type="number" min="0" step="100" inputmode="decimal" placeholder="Your goal" value="${goal || ''}"></span></label><div class="form-actions"><button class="button button--primary" type="submit">${goal ? 'Update goal' : 'Save goal'}</button>${goal ? '<button class="button button--quiet" type="button" data-action="remove-goal">Remove</button>' : ''}</div></form></section>
      <section class="surface savings-card"><div class="section-title"><div><p class="eyebrow">An amount that repeats</p><h2>Monthly income</h2></div><span class="chart-mark">↗</span></div><p class="section-note">Set this once; GONE adds it to each new month automatically in this browser.</p><form id="income-form" class="compact-form"><label class="form-field">Monthly income <span class="money-field"><span>₹</span><input name="monthly_income" type="number" min="0" step="100" inputmode="decimal" placeholder="0" value="${state.profile.monthlyIncome || ''}"></span></label><button class="button button--primary" type="submit">Save income</button></form><form id="bonus-form" class="compact-form compact-form--bonus"><p class="form-label">One-time bonus income</p><label class="form-field">Source<input class="input" name="bonus_source" maxlength="60" placeholder="Freelance, gift, refund…" required></label><label class="form-field">Amount<span class="money-field"><span>₹</span><input name="bonus_amount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" required></span></label><button class="button button--quiet" type="submit">Add bonus</button></form></section></div>
    <section class="surface journey-card"><div class="section-title"><div><p class="eyebrow">The last six months</p><h2>Your savings journey</h2></div><span class="chart-mark">↗</span></div><p class="section-note">How your savings grew over time. A local view of received money minus spending.</p><div id="chart-savings-trend" class="journey-line">${Array.from({ length: 6 }, (_, index) => {
      const date = new Date(); date.setDate(15); date.setMonth(date.getMonth() - (5 - index));
      const key = monthKey(localISODate(date));
      const monthEntries = state.entries.filter((entry) => entry.date.startsWith(key));
      const net = Math.max(0, sum(monthEntries.filter((entry) => entry.kind === 'received')) - sum(monthEntries.filter((entry) => entry.kind === 'spent')));
      return `<div class="journey-point"><span style="--point:${Math.max(4, Math.min(100, goal ? Math.round(net / goal * 100) : net ? 60 : 4))}%"></span><small>${new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(date)}</small></div>`;
    }).join('')}</div></section>
    <div class="quick-links quick-links--savings" aria-label="Savings shortcuts">
      <a class="quick-link" href="#/expenses" data-route="expenses" data-period="week"><span class="quick-link__icon" aria-hidden="true">📝</span><span><strong>View expenses</strong><small>Last 7 days</small></span><span class="quick-link__arrow" aria-hidden="true">↗</span></a>
      <button class="quick-link quick-link--button" type="button" data-action="adjust-goal"><span class="quick-link__icon" aria-hidden="true">🎯</span><span><strong>Adjust goal</strong><small>Reopen the saving goal</small></span><span class="quick-link__arrow" aria-hidden="true">↗</span></button>
    </div>
  </section>`;
}

function splitView(state) {
  return `<section class="page-view">${pageHead('The math, minus the awkwardness', 'Split the little things.', 'Work out an even share. The calculation stays on this device; GONE does not send payment requests.')}
    <div class="split-grid"><form id="split-form" class="surface split-form"><p class="eyebrow">A shared bill</p><label class="form-field">What was the bill for?<input class="input" name="description" maxlength="80" placeholder="Dinner, a cab, the cabin…" required></label><label class="form-field">Total amount<span class="money-field"><span>₹</span><input name="total_amount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" required></span></label><label class="form-field">Friends’ names <span class="optional">Comma separated</span><input class="input" name="friends" maxlength="300" placeholder="Asha, Sam, Dev" required></label><p class="split-note">Your share is included. We’ll divide the total evenly between you and each friend.</p><button class="button button--primary button--wide" type="submit">Calculate the split ↗</button></form>
      <section class="surface split-history"><div class="section-title"><div><p class="eyebrow">Saved on this device</p><h2>Shared bills</h2></div><span class="count-pill">${state.splits.length}</span></div>${state.splits.length ? `<ul class="split-list">${state.splits.map((split) => {
        const people = split.friends.length + 1;
        const each = Number(split.total) / people;
        return `<li class="split-item"><div><strong>${esc(split.description)}</strong><small>${esc(split.friends.join(', '))} + you · ${formatDate(split.date)}</small><small>${split.friends.length ? `${esc(split.friends.join(' and '))} ${split.friends.length === 1 ? 'owes' : 'each owe'} ${formatMoney(each)} each` : 'Add a friend to calculate a share'}</small></div><div><strong>${formatMoney(split.total)}</strong><button class="text-action" type="button" data-delete-split="${esc(split.id)}">Remove</button></div></li>`;
      }).join('')}</ul>` : '<div class="empty-card"><span class="empty-card__mark">⤴</span><p>No shared bills yet. Add one to see each person’s equal share.</p></div>'}</section></div>
  </section>`;
}

export function renderView(route, state, context = {}) {
  switch (route) {
    case 'welcome': return welcomeView(state);
    case 'onboarding': return onboardingView(state);
    case 'home': return homeView(state);
    case 'add': return addView();
    case 'expenses': return expenseView(state, context.filters || { kind: 'all', category: 'all', period: 'month' });
    case 'dashboard': return dashboardView(state);
    case 'savings': return savingsView(state);
    case 'split': return splitView(state);
    default: return state.onboardingComplete ? homeView(state) : welcomeView(state);
  }
}
