import express from "express";
const app = express();

app.get("/", (_req, res) =>
  res.type("html").send("<h1>TechMarket API</h1><p>Rotas: /health e /hot</p>")
);

app.get("/health", (_req, res) =>
  res.status(200).json({ ok: true, ts: Date.now() })
);

app.get("/hot", (_req, res) => {
  const end = Date.now() + 200;
  while (Date.now() < end) {}
  res.json({ hot: true, ts: Date.now() });
});

app.listen(process.env.PORT || 8080);
