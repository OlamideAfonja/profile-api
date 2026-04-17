import { pool } from "../../lib/db.js";

export default async function handler(req, res) {
  const { id } = req.query;

  try {
    if (req.method === "GET") {
      const result = await pool.query(
        "SELECT * FROM profiles WHERE id=$1",
        [id]
      );

      if (!result.rows.length) {
        return res.status(404).json({ status: "error", message: "Profile not found" });
      }

      return res.status(200).json({ status: "success", data: result.rows[0] });
    }

    if (req.method === "DELETE") {
      const result = await pool.query(
        "DELETE FROM profiles WHERE id=$1",
        [id]
      );

      if (!result.rowCount) {
        return res.status(404).json({ status: "error", message: "Profile not found" });
      }

      return res.status(204).end();
    }

    return res.status(405).json({ message: "Method Not Allowed" });

  } catch {
    return res.status(500).json({ status: "error", message: "Internal Server Error" });
  }
}
