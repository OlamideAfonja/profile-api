const express = require("express");
const { Pool } = require("pg");
const { v7: uuidv7 } = require("uuid");

const app = express();

// ─── CORS — must be first, before any other middleware ────────────────────────
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

app.use(express.json());

// ─── Database — lazy singleton so module load never crashes ───────────────────
let pool;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

async function initDB() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS profiles (
      id                  TEXT PRIMARY KEY,
      name                TEXT UNIQUE NOT NULL,
      gender              TEXT NOT NULL,
      gender_probability  REAL NOT NULL,
      sample_size         INTEGER NOT NULL,
      age                 INTEGER NOT NULL,
      age_group           TEXT NOT NULL,
      country_id          TEXT NOT NULL,
      country_probability REAL NOT NULL,
      created_at          TEXT NOT NULL
    )
  `);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getAgeGroup(age) {
  if (age <= 12) return "child";
  if (age <= 19) return "teenager";
  if (age <= 59) return "adult";
  return "senior";
}

function apiError(res, status, message) {
  return res.status(status).json({ status: "error", message });
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.json();
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /api/profiles
app.post("/api/profiles", async (req, res) => {
  try {
    await initDB();
    const db = getPool();
    const { name } = req.body;

    if (name === undefined || name === null || name === "") {
      return apiError(res, 400, "Missing or empty name");
    }
    if (typeof name !== "string") {
      return apiError(res, 422, "Invalid type");
    }
    const trimmedName = name.trim().toLowerCase();
    if (trimmedName === "") {
      return apiError(res, 400, "Missing or empty name");
    }

    // Idempotency check
    const existing = await db.query("SELECT * FROM profiles WHERE name = $1", [trimmedName]);
    if (existing.rows.length > 0) {
      return res.status(200).json({
        status: "success",
        message: "Profile already exists",
        data: existing.rows[0],
      });
    }

    // Call all three external APIs in parallel
    let genderData, agifyData, nationalizeData;
    try {
      [genderData, agifyData, nationalizeData] = await Promise.all([
        fetchJson(`https://api.genderize.io?name=${encodeURIComponent(trimmedName)}`),
        fetchJson(`https://api.agify.io?name=${encodeURIComponent(trimmedName)}`),
        fetchJson(`https://api.nationalize.io?name=${encodeURIComponent(trimmedName)}`),
      ]);
    } catch (err) {
      return apiError(res, 502, "An external API returned an invalid response");
    }

    // Validate each API response
    if (!genderData.gender || genderData.count === 0) {
      return apiError(res, 502, "Genderize returned an invalid response");
    }
    if (agifyData.age === null || agifyData.age === undefined) {
      return apiError(res, 502, "Agify returned an invalid response");
    }
    if (!nationalizeData.country || nationalizeData.country.length === 0) {
      return apiError(res, 502, "Nationalize returned an invalid response");
    }

    const topCountry = nationalizeData.country.reduce((best, cur) =>
      cur.probability > best.probability ? cur : best
    );

    const profile = {
      id: uuidv7(),
      name: trimmedName,
      gender: genderData.gender,
      gender_probability: genderData.probability,
      sample_size: genderData.count,
      age: agifyData.age,
      age_group: getAgeGroup(agifyData.age),
      country_id: topCountry.country_id,
      country_probability: topCountry.probability,
      created_at: new Date().toISOString(),
    };

    try {
      await db.query(
        `INSERT INTO profiles
          (id, name, gender, gender_probability, sample_size, age, age_group, country_id, country_probability, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          profile.id, profile.name, profile.gender, profile.gender_probability,
          profile.sample_size, profile.age, profile.age_group,
          profile.country_id, profile.country_probability, profile.created_at,
        ]
      );
    } catch (err) {
      if (err.code === "23505") {
        const race = await db.query("SELECT * FROM profiles WHERE name = $1", [trimmedName]);
        return res.status(200).json({
          status: "success",
          message: "Profile already exists",
          data: race.rows[0],
        });
      }
      console.error("Insert error:", err);
      return apiError(res, 500, "Failed to save profile");
    }

    return res.status(201).json({ status: "success", data: profile });
  } catch (err) {
    console.error("POST /api/profiles error:", err);
    return apiError(res, 500, "Internal server error");
  }
});

// GET /api/profiles
app.get("/api/profiles", async (req, res) => {
  try {
    await initDB();
    const db = getPool();
    const { gender, country_id, age_group } = req.query;

    const conditions = [];
    const params = [];

    if (gender) {
      params.push(gender.toLowerCase());
      conditions.push(`LOWER(gender) = $${params.length}`);
    }
    if (country_id) {
      params.push(country_id.toLowerCase());
      conditions.push(`LOWER(country_id) = $${params.length}`);
    }
    if (age_group) {
      params.push(age_group.toLowerCase());
      conditions.push(`LOWER(age_group) = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await db.query(
      `SELECT id, name, gender, age, age_group, country_id FROM profiles ${where}`,
      params
    );

    return res.status(200).json({
      status: "success",
      count: result.rows.length,
      data: result.rows,
    });
  } catch (err) {
    console.error("GET /api/profiles error:", err);
    return apiError(res, 500, "Internal server error");
  }
});

// GET /api/profiles/:id
app.get("/api/profiles/:id", async (req, res) => {
  try {
    await initDB();
    const result = await getPool().query(
      "SELECT * FROM profiles WHERE id = $1",
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return apiError(res, 404, "Profile not found");
    }
    return res.status(200).json({ status: "success", data: result.rows[0] });
  } catch (err) {
    console.error("GET /api/profiles/:id error:", err);
    return apiError(res, 500, "Internal server error");
  }
});

// DELETE /api/profiles/:id
app.delete("/api/profiles/:id", async (req, res) => {
  try {
    await initDB();
    const result = await getPool().query(
      "DELETE FROM profiles WHERE id = $1",
      [req.params.id]
    );
    if (result.rowCount === 0) {
      return apiError(res, 404, "Profile not found");
    }
    return res.status(204).end();
  } catch (err) {
    console.error("DELETE /api/profiles/:id error:", err);
    return apiError(res, 500, "Internal server error");
  }
});

// 404 catch-all
app.use((req, res) => apiError(res, 404, "Route not found"));

// ─── Local dev ────────────────────────────────────────────────────────────────
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`✅ Profile API running on port ${PORT}`));
}

module.exports = app;
