# GONE Phase 2 implementation notes

This local working copy implements Phase 2 from the supplied prompt: GONE ID registration, password authentication, two-question GONE ID recovery, user activity counts, and server-enforced account data boundaries. Per the user's later request, it also connects the existing setup flow to a one-time three-step feature tour before Home. The Phase 3 five-minute setup expansion and all other Phases 3–10 remain out of scope.

- User authentication uses Django's standard password/session system; only password hashes are stored.
- A GONE ID is the Django username/unique key and is never accepted as authorization by itself.
- The registration form no longer presents a valid-looking sample ID as its placeholder. If a chosen ID is occupied, the exact duplicate warning now explains sign-in vs. choosing another ID and offers an explicit generated-ID fallback; blank IDs are generated server-side with collision retries.
- The signed-in header ID opens Account details, where the user can view and copy the GONE ID after registration.
- Recovery answers are Unicode-normalized, case-folded, whitespace-normalized, and stored with Django's password hasher.
- Unowned legacy Profile, Entry, Reminder, and Split rows remain unowned. The APIs never expose them to a new account.
- The browser asks before importing old local-only ledger data. Account-local caches are namespaced by the authenticated database user ID; session tokens are not stored in localStorage.
- Local preview uses SQLite. `DATABASE_URL` enables PostgreSQL/Supabase support, but live Supabase/Vercel behavior cannot be verified until the user connects the project and sets durable deployment credentials.
- Verification in this sandbox: all 15 Django regression/security tests passed; Django checks and migration drift check passed; the account templates and public preview assets return successfully. A synthetic QA registration was confirmed through account-created, setup, all three tour steps, and Home; the synthetic account was then deleted from the local preview database.
- No GitHub commit/push or production deployment is part of this work.
