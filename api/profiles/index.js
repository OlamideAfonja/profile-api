import { getAgeGroup, safeFetch } from "../../lib/utils.js";
import { randomUUID } from "crypto";
import { pool } from "../../lib/db.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    // GET all profiles
    if (req.method === "GET") {
      const { gender, age_group, country_id } = req.query;
      let query = "SELECT id, name, gender, age, age_group, country_id FROM profiles";
      const params = [];
      const conditions = [];

      if (gender) {
        params.push(gender.toLowerCase());
        conditions.push(`LOWER(gender) = $${params.length}`);
      }
      if (age_group) {
        params.push(age_group.toLowerCase());
        conditions.push(`LOWER(age_group) = $${params.length}`);
      }
      if (country_id) {
        params.push(country_id.toUpperCase());
        conditions.push(`UPPER(country_id) = $${params.length}`);
      }

      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }

      const result = await pool.query(query, params);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({
        status: "success",
        count: result.rows.length,
        data: result.rows
      });
    }

    // CREATE profile
    if (req.method === "POST") {
      const { name } = req.body || {};

      if (typeof name !== "string") {
        return res.status(422).json({ status: "error", message: "name must be a string" });
      }
      if (!name.trim()) {
        return res.status(400).json({ status: "error", message: "name is required" });
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

      const age = ageData?.age ?? null;
      const profile = {
        id: randomUUID(),
        name: trimmedNa
