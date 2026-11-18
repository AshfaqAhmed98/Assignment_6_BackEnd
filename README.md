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
