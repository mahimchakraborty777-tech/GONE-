import { RECOVERY_QUESTIONS } from './data-v4.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function authFeedback(message = '', tone = 'error') {
  return `<p class="auth-feedback auth-feedback--${tone}" data-auth-message role="status" aria-live="polite"${message ? '' : ' hidden'}>${esc(message)}</p>`;
}

function questionOptions(selected = '') {
  return `<option value="">Choose a question</option>${RECOVERY_QUESTIONS.map((question) => `<option value="${esc(question.id)}"${selected === question.id ? ' selected' : ''}>${esc(question.label)}</option>`).join('')}`;
}

export function registerView(context = {}) {
  return `<section class="account-screen">
    <div class="account-screen__intro"><a class="back-link" href="#/welcome" data-route="welcome">← Back to GONE</a><p class="eyebrow">A quieter way to keep track</p><h1>Create your GONE account.</h1><p class="page-subtitle">No Gmail or phone number needed. Your GONE ID is unique across GONE. Use it to sign in to your GONE account.</p></div>
    <form id="register-form" class="surface account-card">
      <p class="eyebrow">Create account</p><h2>Choose how GONE knows you.</h2>${authFeedback(context.authMessage)}
      <label class="form-field">Choose a GONE ID <span class="optional">Optional — we can make one</span><input class="input" name="goneId" type="text" inputmode="text" autocapitalize="characters" autocomplete="username" maxlength="17" pattern="(?:GONE-)?[A-Za-z0-9]{6,12}" placeholder="GONE-MH7K29"><small>Your GONE ID is unique across GONE. Use it to sign in to your GONE account. Leave this blank and GONE will create one for you.</small></label>
      <label class="form-field">What should GONE call you? <span class="optional">Optional</span><input class="input" name="displayName" maxlength="100" autocomplete="nickname" placeholder="Your name"></label>
      <label class="form-field">Password<input class="input" name="password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required><small>Use at least 8 characters and choose a password you do not reuse elsewhere.</small></label>
      <label class="form-field">Confirm password<input class="input" name="passwordConfirm" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label>
      <div class="account-recovery-block"><h3>Two private recovery questions</h3><p>Choose questions whose answers only you are likely to know. GONE securely hashes your answers; they are never saved as readable text.</p>
        <label class="form-field">Question 1<select class="input" name="recoveryQuestion1" required>${questionOptions()}</select></label><label class="form-field">Answer 1<input class="input" name="recoveryAnswer1" type="password" maxlength="120" autocomplete="off" required></label>
        <label class="form-field">Question 2<select class="input" name="recoveryQuestion2" required>${questionOptions()}</select></label><label class="form-field">Answer 2<input class="input" name="recoveryAnswer2" type="password" maxlength="120" autocomplete="off" required></label>
      </div>
      <button class="button button--primary button--wide" type="submit">Create my GONE account ↗</button>
      <p class="account-recovery-note"><strong>Forgot your GONE ID?</strong> Recover it using the two private recovery questions you choose now. <a href="#/recover" data-route="recover">See recovery</a></p>
      <p class="account-form-note">Already have an account? <a href="#/login" data-route="login">Sign in</a></p>
    </form>
  </section>`;
}

export function loginView(context = {}) {
  return `<section class="account-screen account-screen--narrow">
    <div class="account-screen__intro"><a class="back-link" href="#/welcome" data-route="welcome">← Back to GONE</a><p class="eyebrow">Your money, on your terms</p><h1>Welcome back.</h1><p class="page-subtitle">Sign in with your GONE ID and password. Your GONE ID is an identity, not a password.</p></div>
    <form id="login-form" class="surface account-card">
      <p class="eyebrow">Sign in</p><h2>Your GONE account.</h2>${authFeedback(context.authMessage)}
      <label class="form-field">GONE ID<input class="input" name="goneId" type="text" autocapitalize="characters" autocomplete="username" placeholder="GONE-MH7K29" required></label>
      <label class="form-field">Password<input class="input" name="password" type="password" autocomplete="current-password" required></label>
      <button class="button button--primary button--wide" type="submit">Log in ↗</button>
      <p class="account-recovery-note"><strong>Forgot your GONE ID?</strong> Recover it using the two private recovery questions you selected during registration. <a href="#/recover" data-route="recover">Recover my GONE ID</a></p>
      <p class="account-form-note">New to GONE? <a href="#/register" data-route="register">Create an account</a></p>
    </form>
  </section>`;
}

export function recoverView(context = {}) {
  return `<section class="account-screen account-screen--narrow">
    <div class="account-screen__intro"><a class="back-link" href="#/login" data-route="login">← Back to sign in</a><p class="eyebrow">Account recovery</p><h1>Find your GONE ID.</h1><p class="page-subtitle">Answer both private questions exactly as you remember them. We show the associated GONE ID only after both answers are verified.</p></div>
    <form id="recovery-form" class="surface account-card">
      <p class="eyebrow">Forgot GONE ID</p><h2>Two answers. One ID.</h2>${authFeedback(context.authMessage)}
      <label class="form-field">Question 1<select class="input" name="question1" required>${questionOptions()}</select></label><label class="form-field">Answer 1<input class="input" name="answer1" type="password" maxlength="120" autocomplete="off" required></label>
      <label class="form-field">Question 2<select class="input" name="question2" required>${questionOptions()}</select></label><label class="form-field">Answer 2<input class="input" name="answer2" type="password" maxlength="120" autocomplete="off" required></label>
      <p class="account-recovery-result" data-recovery-result hidden></p><button class="button button--primary button--wide" type="submit">Verify and recover ID ↗</button>
      <p class="account-form-note">Remember your GONE ID? <a href="#/login" data-route="login">Sign in</a></p>
    </form>
  </section>`;
}

export function accountCreatedView(context = {}) {
  const goneId = context.user?.goneId || '';
  return `<section class="account-screen account-screen--narrow">
    <div class="account-created-card surface"><span class="account-created-mark" aria-hidden="true">G</span><p class="eyebrow">Your account is ready</p><h1>Keep this ID close.</h1><p class="page-subtitle">Use this GONE ID with your password whenever you sign in. Knowing the ID alone never opens your financial data.</p><div class="gone-id-display"><span>Your GONE ID</span><strong data-gone-id>${esc(goneId)}</strong></div><button class="button button--quiet" type="button" data-action="copy-gone-id">Copy GONE ID</button><button class="button button--primary button--wide" type="button" data-action="continue-account-setup">Set up your money ↗</button></div>
  </section>`;
}

export function importDataView(context = {}) {
  const merging = context.importMode === 'merge';
  return `<section class="account-screen account-screen--narrow">
    <div class="account-screen__intro"><p class="eyebrow">A careful handoff</p><h1>${merging ? 'Two ledgers, one account.' : 'Bring your ledger with you?'}</h1><p class="page-subtitle">${merging ? 'This GONE account already has saved data, and this browser also has an older local-only ledger. Choose what to do before anything is moved.' : 'This browser has a local-only ledger that is not attached to an account. Nothing has been uploaded. Choose whether to import it or begin with a blank account.'}</p></div>
    <section class="surface account-card migration-card"><div class="migration-callout"><span aria-hidden="true">✳</span><p>${merging ? 'Merging will add local entries, reminders, and shared bills to your account. Items with matching IDs keep the account copy. Your original browser copy remains stored.' : 'Importing sends this browser’s profile, entries, reminders, and shared bills to your signed-in GONE account. Your original browser copy stays in place.'}</p></div>
      ${merging ? '<button class="button button--primary button--wide" type="button" data-action="merge-legacy">Merge browser ledger into my account ↗</button><button class="button button--quiet button--wide" type="button" data-action="keep-account-ledger">Use account ledger; keep browser copy separate</button>' : '<button class="button button--primary button--wide" type="button" data-action="import-legacy">Import this ledger to my account ↗</button><button class="button button--quiet button--wide" type="button" data-action="start-account-fresh">Start with a blank account</button>'}
    </section>
  </section>`;
}
