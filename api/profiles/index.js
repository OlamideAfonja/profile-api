import { pool } from "../../lib/db";
import { getAgeGroup, safeFetch } from "../../lib/utils";
import { v7 as uuidv7 } from "uuid";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      const result = await pool.query(
        "SELECT id, name, gender, age, age_group, country_id FROM profiles"
      );

      res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate");

      return res.status(200).json({
        status: "success",
        count: result.rows.length,
        data: result.rows
      });
    }

    if (req.method === "POST") {
      const { name } = req.body || {};

      if (!name || typeof name !== "string") {
        return res.status(400).json({ status: "error", message: "Invalid name" });
      }

      const trimmedName = name.trim().toLowerCase();

      const existing = await pool.query(
        "SELECT * FROM profiles WHERE name=$1",
        [trimmedName]
      );

      if (existing.rows.length > 0) {
        return res.status(200).json({
          status: "success",
          message: "Profile already exists",
          data: existing.rows[0]
        });
      }

      const [genderData, ageData, natData] = await Promise.all([
        safeFetch(`https://api.genderize.io?name=${encodeURIComponent(trimmedName)}`),
        safeFetch(`https://api.agify.io?name=${encodeURIComponent(trimmedName)}`),
        safeFetch(`https://api.nationalize.io?name=${encodeURIComponent(trimmedName)}`)
      ]);

      const profile = {
        id: uuidv7(),
        name: trimmedName,
        gender: genderData?.gender || null,
        gender_probability: genderData?.probability || 0,
        sample_size: genderData?.count || 0,
        age: ageData?.age ?? null,
        age_group: getAgeGroup(ageData?.age ?? null),
        country_id: natData?.country?.[0]?.country_id || null,
        country_probability: natData?.country?.[0]?.probability || 0,
        created_at: new Date().toISOString()
      };

      await pool.query(
        `INSERT INTO profiles 
        (id, name, gender, gender_probability, sample_size, age, age_group, country_id, country_probability, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        Object.values(profile)
      );

      return res.status(201).json({ status: "success", data: profile });
    }

    return res.status(405).json({ message: "Method Not Allowed" });

  } catch (err) {
    return res.status(500).json({ status: "error", message: "Internal Server Error" });
  }
}
