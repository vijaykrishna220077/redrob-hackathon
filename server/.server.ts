app.post("/api/copilot", (req, res) => {
  console.log("✅ POST HIT");
  console.log(req.body);

  res.json({
    success: true,
    text: "Express is working!",
  });
});
