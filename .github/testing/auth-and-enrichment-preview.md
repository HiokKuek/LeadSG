# Auth + Enrichment Preview Testing Guide

This guide validates current partial implementation:
- Clerk login/session behavior
- Enrichment endpoint integration against DB schema
- Frontend preview controls on home page

## 1) Prepare environment

Set required variables in `.env.local`:

- `DATABASE_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_SIGN_IN_URL=/login`
- `CLERK_SIGN_UP_URL=/sign-up`
- `CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/`
- `CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/`
- `GOOGLE_PLACES_DETAILS_PRICE_PER_1000_USD` (for pricing math)
- `ENRICHMENT_USER_PRICE_PER_1000_USD` (optional override)

## 2) Apply schema

Run:

```bash
npm run db:push
```

This ensures payment and enrichment tables exist.

## 3) Create test users

- Use Clerk Dashboard to create users, or sign up at `/sign-up`.
- Set user tier via Clerk `publicMetadata.tier` (for example `free`, `pro`, `premium`).
- Set admin role via Clerk `publicMetadata.role = "admin"`.

## 4) Run app

```bash
npm run dev
```

## 5) Visual test checklist

1. Open `/` and verify unauthenticated state shows **Sign in**.
2. Go to `/login`, sign in with Clerk credentials.
3. Return to `/` and verify signed-in email+tier appear.
4. Verify **Enrichment (Preview Controls)** panel is visible only when signed in.
5. In panel, input SSIC list (e.g. `62011,62012`) and run preflight estimate.
6. Confirm preflight request and verify it appears in "Your confirmed preflight requests".
7. As admin, issue single-use payment code for that request from admin dashboard queue.
8. As normal user, select request, redeem issued code, then start job.
9. Refresh job status and confirm no 401/500 errors.

## 6) Admin queue + quota test

- Sign in as admin and verify:
  - internal quota pool is visible,
  - quota adjustment works (positive and negative deltas),
  - preflight queue shows requester email,
  - issue code and admin bypass start actions are available.

Expected:
- Admin-issued code is bound to one preflight request and one user.
- Admin bypass start decrements internal quota and fails when quota is insufficient.

## 7) Current known limitation

- Jobs are created and tracked, but worker execution pipeline (queue + Google API calls) is not implemented yet.
- UI in this phase is a preview integration panel, not final production UX.
