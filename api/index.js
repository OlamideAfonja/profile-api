export default function handler(req, res) {
  res.status(200).json({
    message: "API is running",
    endpoints: [
      "/api/health",
      "/api/profiles"
    ]
  });
}
