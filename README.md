# Profile API

A REST API that enriches a name with gender, age, and nationality data, then stores and serves the result.

## Tech Stack

- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** PostgreSQL via Supabase
- **IDs:** UUID v7

---

## Vercel + Supabase Deployment

### Step 1 — Create a Supabase database (free)

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New project**, give it a name, set a password, choose a region
3. Wait ~1 minute for it to provision
4. Go to **Project Settings → Database**
5. Scroll to **Connection string → URI** and copy it — looks like:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres
   ```
6. Replace `[YOUR-PASSWORD]` with the password you set in step 2

### Step 2 — Deploy to Vercel

Push your code to GitHub, then:

```bash
npm i -g vercel
vercel
```

### Step 3 — Add environment variable in Vercel

1. Go to your Vercel project dashboard
2. **Settings → Environment Variables**
3. Add:
   - **Key:** `DATABASE_URL`
   - **Value:** your Supabase connection string from Step 1
   - Enable for **Production**, **Preview**, **Development**

### Step 4 — Redeploy

```bash
vercel --prod
```

---

## Local Development

```bash
npm install
# create a .env file:
echo "DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres" > .env
npm start
```

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/profiles` | Create profile (idempotent by name) |
| GET | `/api/profiles` | List all profiles |
| GET | `/api/profiles/:id` | Get single profile |
| DELETE | `/api/profiles/:id` | Delete profile |

### Filters on GET /api/profiles (all case-insensitive)
```
?gender=male
?country_id=NG
?age_group=adult
```

---

## Age Groups

| Age | Group |
|-----|-------|
| 0–12 | child |
| 13–19 | teenager |
| 20–59 | adult |
| 60+ | senior |

---

## Error Format

```json
{ "status": "error", "message": "..." }
```

| Code | Reason |
|------|--------|
| 400 | Missing or empty name |
| 422 | name is not a string |
| 404 | Profile not found |
| 502 | External API returned invalid data |
| 500 | Server error |
