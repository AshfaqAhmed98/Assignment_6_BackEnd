# GearRent Backend

REST API for the **Equipment Rental Platform**, built with Express, MongoDB,
Mongoose, and Better Auth.

## Run locally

Requires Node.js/npm and MongoDB.

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

The API listens on `http://localhost:5000` by default. Check
`GET /api/health` to confirm the service and database are available.

Set these values in `.env`:

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string |
| `FRONTEND_URL` | Frontend origin, usually `http://localhost:3000` |
| `BETTER_AUTH_URL` | Backend origin, usually `http://localhost:5000` |
| `BETTER_AUTH_SECRET` | Random secret of at least 32 characters |
| `BETTER_AUTH_API_KEY` | API key from the Better Auth Dash project |

Generate a secret with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Keep all backend keys and secrets out of source control and frontend variables.

## Features

- Better Auth sessions and JWT-protected APIs with Customer, Owner, and Admin roles
- Equipment search, listing management, approval, and photo uploads
- Rental checkout and payment confirmation through Stripe webhooks
- Customer bookings, favorites, and reviews; Owner and Admin dashboards
- Scheduled booking updates and optional email notifications

## API overview

| Route | Purpose |
| --- | --- |
| `/api/auth` | Sign-up, sign-in, sessions, and JWTs |
| `/api/equipment` | Browse, manage, and approve listings |
| `/api/bookings` | Checkout, customer bookings, and owner rentals |
| `/api/favorites` and `/api/reviews` | Customer features |
| `/api/admin` | Admin analytics and account management |

Protected API requests use `Authorization: Bearer <JWT>`. Admin equipment
approval includes `PATCH /api/equipment/admin/approval/approve-all`; it only
approves currently pending listings.

## Optional integrations

- **Google sign-in:** set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- **Image uploads:** configure `IMGBB_API_KEY`; Cloudinary variables provide
  the backup upload provider.
- **Stripe checkout:** set `STRIPE_SECRET_KEY` and
  `STRIPE_WEBHOOK_SECRET`. For local testing, forward Stripe events with:

  ```powershell
  stripe listen --events checkout.session.completed,checkout.session.expired --forward-to http://localhost:5000/api/payments/stripe/webhook
  ```

- **Email:** configure `SMTP_*` and `CONTACT_EMAIL`.
- **Production booking schedule:** set `CRON_SECRET` in the backend host.

Use the matching production frontend and backend origins in `FRONTEND_URL`,
`BETTER_AUTH_URL`, and `NEXT_PUBLIC_API_URL`.

## Seed sample equipment

The seed command targets an existing Owner and uses the database in `.env`.
It is a dry run unless `--apply` is supplied; apply mode asks for confirmation.
Verify the target database before applying.

```powershell
npm run seed:owner-equipment -- --email owner@example.com
npm run seed:owner-equipment -- --email owner@example.com --apply
```

The 20 sample listings start as pending and use generic site images.

## Development

```powershell
npm test
```

```text
src/config/      Database and application configuration
src/data/        Seed data
src/middleware/  Authentication and authorization
src/models/      MongoDB models
src/routes/      HTTP API routes
src/scripts/     Local maintenance and seed scripts
src/services/    Business logic and integrations
```
