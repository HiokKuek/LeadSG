# Auth + Enrichment Preview Testing Guide

This guide validates current partial implementation:
- Auth.js login/session behavior
- Enrichment endpoint integration against DB schema
- Frontend preview controls on home page

## 1) Prepare environment

Set required variables in `.env.local`:

- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_TRUST_HOST=true`
- `ENRICHMENT_ADMIN_API_KEY`
- `GOOGLE_PLACES_DETAILS_PRICE_PER_1000_USD` (for pricing math)
- `ENRICHMENT_USER_PRICE_PER_1000_USD` (optional override)

Notes:
- `AUTH_SECRET` does not require any external dashboard. It is a local/server secret used by NextAuth to sign/encrypt session tokens/cookies.
- Generate one with either command:

```bash
openssl rand -base64 32
# or
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 2) Apply schema

Run:

```bash
npm run db:push
```

This ensures `users`, payment, and enrichment tables exist.

## 3) Create a test user

Generate password hash:

```bash
node -e "const b=require('bcryptjs'); b.hash('Password123!',10).then(h=>console.log(h))"
```

Insert user (replace hash output):

```sql
INSERT INTO users (email, password_hash, tier, is_active)
VALUES ('tester@leadsg.local', '$2b$10$rjvZnzplkdI96scI1IKBOeFtzT7NIqf/pF3aBRDTV9HIq9/VTqyXW', 'paid', true)
ON CONFLICT (email) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    tier = EXCLUDED.tier,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();
```

## 4) Run app

```bash
npm run dev
```

## 5) Visual test checklist

1. Open `/` and verify unauthenticated state shows **Sign in**.
2. Go to `/login`, sign in with test credentials.
3. Return to `/` and verify signed-in email+tier appear.
4. Verify **Enrichment (Preview Controls)** panel is visible only when signed in.
5. In panel, input SSIC list (e.g. `62011,62012`) and run preflight.
6. Confirm preflight response shows candidate count, projected paid calls, estimated price.
7. Redeem a payment code and start a job (after creating/issuing one).
8. Refresh job status and confirm no 401/500 errors.

## 6) Admin quote + code issue test

Example request:

```bash
curl -X POST http://localhost:3000/api/enrichment/admin/quote \
  -H 'Content-Type: application/json' \
  -H "x-admin-key: replace-with-strong-admin-key" \
  -d '{"ssicCodes":["62011","62012"],"issueCode":true,"purchasedDetailCalls":200}'
```

Expected:
- Returns estimated user charge/cost/margin.
- Returns `paymentCode` when `issueCode=true`.

## 7) Current known limitation

- Jobs are created and tracked, but worker execution pipeline (queue + Google API calls) is not implemented yet.
- UI in this phase is a preview integration panel, not final production UX.
