# Profile API

A REST API that enriches a name with gender, age, and nationality data from three public APIs, then stores and serves the result.

## Tech Stack

- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** PostgreSQL (via `pg`)
- **IDs:** UUID v7

---

## Local Setup

```bash
git clone <your-repo-url>
cd profile-api
npm install
```

Create a `.env` file:
```
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

Then run:
```bash
npm start
```

---

## Vercel Deployment (Step-by-Step)

### 1. Set up a free PostgreSQL database (Neon)

1. Go to [neon.tech](https://neon.tech) and sign up for free
2. Create a new project
3. Copy the **Connection string** — looks like:
   ```
   postgresql://user:password@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require
   ```

### 2. Deploy to Vercel

```bash
npm install -g vercel
vercel
```

Follow the prompts (link to your GitHub repo or deploy directly).

### 3. Add the environment variable

In your Vercel project dashboard:
- Go to **Settings → Environment Variables**
- Add `DATABASE_URL` = your Neon connection string
- Set it for **Production**, **Preview**, and **Development**

### 4. Redeploy

```bash
vercel --prod
```

Your API will be live at `https://your-app.vercel.app`

---

## Endpoints

### `POST /api/profiles`
Create a profile. Returns existing one if name already stored.

```bash
curl -X POST https://your-app.vercel.app/api/profiles \
  -H "Content-Type: application/json" \
  -d '{"name": "ella"}'
```

### `GET /api/profiles`
List all profiles. Supports filters (all case-insensitive):

```bash
GET /api/profiles?gender=female&country_id=NG&age_group=adult
```

### `GET /api/profiles/:id`
Get a single profile by UUID.

### `DELETE /api/profiles/:id`
Delete a profile. Returns `204 No Content`.

---

## Age Group Classification

| Range | Group      |
|-------|------------|
| 0–12  | child      |
| 13–19 | teenager   |
| 20–59 | adult      |
| 60+   | senior     |

---

## Error Responses

```json
{ "status": "error", "message": "..." }
```

| Code | Condition |
|------|-----------|
| 400  | Missing or empty `name` |
| 422  | `name` is not a string |
| 404  | Profile not found |
| 502  | External API returned null/invalid data |
| 500  | Server error |
