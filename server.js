import express from "express";
const app = express();

app.get("/health", (_req, res) => res.status(200).json({ ok: true, ts: Date.now() }));

// rota “quente” pra simular carga e ver o autoscale reagir:
app.get("/hot", (_req, res) => {
  const end = Date.now() + 200; // 200 ms de CPU
  while (Date.now() < end) {}   // busy loop só para teste
  res.json({ hot: true, ts: Date.now() });
});

app.listen(process.env.PORT || 8080);
