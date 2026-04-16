const express = require("express");
const { Pool } = require("pg");
const { v7: uuidv7 } = require("uuid");

const app = express();

// CORS
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

app.use(express.json());

// Health
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Profile API is running" });
});

// DB (singleton)
let pool;
function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL not set");
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pool;
}

let dbReady = false;
async function initDB() {
  const db = getPool();
  if (!dbReady) {
    await db.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        gender TEXT,
        gender_probability REAL,
        sample_size INTEGER,
        age INTEGER,
        age_group TEXT,
        country_id TEXT,
        country_probability REAL,
        created_at TEXT
      )
    `);
    dbReady = true;
  }
  return db;
}

// Helpers
function getAgeGroup(age) {
  if (!age) return null;
  if (age <= 12) return "child";
  if (age <= 19) return "teenager";
  if (age <= 59) return "adult";
  return "senior";
}

// SAFE external fetch (never throws)
async function safeFetch(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error("External API failed:", url);
    return null;
  }
}

// POST /api/profiles
app.post("/api/profiles", async (req, res) => {
  try {
    const db = await initDB();
    const { name } = req.body;

    if (!name || typeof name !== "string") {
      return res.status(400).json({ status: "error", message: "Invalid name" });
    }

    const trimmedName = name.trim().toLowerCase();

    // Idempotency
    const existing = await db.query("SELECT * FROM profiles WHERE name=$1", [trimmedName]);
    if (existing.rows.length > 0) {
      return res.status(200).json({
        status: "success",
        message: "Profile already exists",
        data: existing.rows[0],
      });
    }

    // Parallel safe calls (won't crash)
    const [genderData, ageData, natData] = await Promise.all([
      safeFetch(`https://api.genderize.io?name=${encodeURIComponent(trimmedName)}`),
      safeFetch(`https://api.agify.io?name=${encodeURIComponent(trimmedName)}`),
      safeFetch(`https://api.nationalize.io?name=${encodeURIComponent(trimmedName)}`)
    ]);

    // Fallbacks (critical fix)
    const gender = genderData?.gender || null;
    const genderProb = genderData?.probability || 0;
    const count = genderData?.count || 0;

    const age = ageData?.age ?? null;
    const ageGroup = getAgeGroup(age);

    const topCountry = natData?.country?.[0] || {};
    const country_id = topCountry.country_id || null;
    const country_probability = topCountry.probability || 0;

    const profile = {
      id: uuidv7(),
      name: trimmedName,
      gender,
      gender_probability: genderProb,
      sample_size: count,
      age,
      age_group: ageGroup,
      country_id,
      country_probability,
      created_at: new Date().toISOString(),
    };

    await db.query(
      `INSERT INTO profiles 
      (id, name, gender, gender_probability, sample_size, age, age_group, country_id, country_probability, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        profile.id,
        profile.name,
        profile.gender,
        profile.gender_probability,
        profile.sample_size,
        profile.age,
        profile.age_group,
        profile.country_id,
        profile.country_probability,
        profile.created_at,
      ]
    );

    return res.status(201).json({
      status: "success",
      data: profile,
    });

  } catch (err) {
    console.error("POST ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
});

// GET /api/profiles
app.get("/api/profiles", async (req, res) => {
  try {
    const db = await initDB();

    const result = await db.query(
      "SELECT id, name, gender, age, age_group, country_id FROM profiles"
    );

    return res.status(200).json({
      status: "success",
      count: result.rows.length,
      data: result.rows,
    });
  } catch (err) {
    console.error("GET ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
});

// GET /api/profiles/:id
app.get("/api/profiles/:id", async (req, res) => {
  try {
    const db = await initDB();

    const result = await db.query(
      "SELECT * FROM profiles WHERE id=$1",
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        status: "error",
        message: "Profile not found",
      });
    }

    return res.status(200).json({
      status: "success",
      data: result.rows[0],
    });
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
});

// DELETE /api/profiles/:id
app.delete("/api/profiles/:id", async (req, res) => {
  try {
    const db = await initDB();

    const result = await db.query(
      "DELETE FROM profiles WHERE id=$1",
      [req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        status: "error",
        message: "Profile not found",
      });
    }

    return res.status(204).end();
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
});

module.exports = app;
