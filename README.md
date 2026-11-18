# GearRent backend

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`.
3. Set `MONGODB_URI` to your local MongoDB or Atlas connection string.
4. Start the API with `npm run dev`.

The API listens on port `5000` by default. `GET /api/health` reports whether
MongoDB is connected.
The server uses Cloudflare and Google DNS resolvers for MongoDB Atlas SRV
lookups.

## Featured equipment

`GET /api/equipment/featured` returns at most six approved equipment documents.
New equipment defaults to `approvalStatus: "pending"` and is not included until
an administrator or database process changes it to `"approved"`.

Each equipment document has `name`, `category`, `location`, `dailyRate`,
`image`, `description`, and `approvalStatus` fields. `image` should be a URL or
path usable by the frontend.

Example document to add in the `equipments` collection:

```json
{
  "name": "Professional Drill Kit",
  "category": "Power tools",
  "location": "Dhaka",
  "dailyRate": 850,
  "image": "/images/tools-rental-banner.jpg",
  "description": "A drill kit for everyday building and repair work.",
  "approvalStatus": "approved"
}
```

## Registration and profile photos

Set `IMGBB_API_KEY` in `.env` to enable profile photo uploads. Get a key from
the [ImgBB API page](https://api.imgbb.com/). Keep the key in the backend
environment; do not add it to a `NEXT_PUBLIC_` variable.

`POST /api/uploads/profile-photo` accepts one `image` file as
`multipart/form-data`, checks its image type and a 5 MB size limit, then returns
the ImgBB URL. This public pre-registration endpoint is rate-limited.

`POST /api/auth/register` accepts `name`, `email`, `photo`, and `password`.
Passwords must contain at least six characters, including uppercase and
lowercase letters, and are stored as bcrypt hashes. Emails are normalized to
lowercase and must be unique. Registration creates the account but does not
start a login session.
