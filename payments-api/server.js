import express from "express";
import { db } from "./db.js";
import { ulid } from "ulid";
import winston from "winston";
import { z } from "zod";

const app = express();
app.use(express.json());

// Logger
const logger = winston.createLogger({
  level: "info",
  transports: [new winston.transports.Console()],
  format: winston.format.json()
});

// Schemas
const transferBodySchema = z.object({
  fromAccountId: z.string().min(1),
  toAccountId:   z.string().min(1).refine((v, ctx) => {
    // nada impede transferência para a própria conta, mas geralmente bloqueamos
    return true;
  }),
  currency: z.string().length(3),
  amount:   z.number().positive().finite()  // em unidades (ex.: 12.34)
}).refine(d => d.fromAccountId !== d.toAccountId, { message: "Contas devem ser distintas", path:["toAccountId"]});

// Helpers
const BRLfmt = (cents) => (cents/100).toFixed(2);

// Endpoint de saúde (monitor/ACA)
app.get("/health", (_req, res) =>
  res.status(200).json({ ok: true, ts: Date.now() })
);

/**
 * POST /transfer
 * Headers:  Idempotency-Key: <uuid/ulid do cliente>
 * Body:     { fromAccountId, toAccountId, currency, amount }
 * Resposta: { code, status, amount, currency, fromBalance, toBalance, createdAt }
 */
app.post("/transfer", (req, res) => {
  // 1) Idempotência
  const idem = String(req.header("Idempotency-Key") || "").trim();
  if (!idem) {
    return res.status(400).json({ error: "Idempotency-Key header is required" });
  }

  // 2) Validação de payload
  const parse = transferBodySchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(422).json({ error: "Invalid payload", details: parse.error.issues });
  }
  const { fromAccountId, toAccountId, currency, amount } = parse.data;
  const amountCents = Math.round(amount * 100);

  try {
    // 3) Se já existe por idempotência, retorna a mesma operação
    const existing = db
      .prepare(`SELECT * FROM transfers WHERE idempotency_key = ?`)
      .get(idem);
    if (existing) {
      return res.status(200).json({
        code: existing.code,
        status: existing.status,
        currency: existing.currency,
        amount: Number(existing.amount_cents) / 100,
        createdAt: existing.created_at
      });
    }

    // 4) Transação atômica
    const result = db.transaction(() => {
      // Carrega contas
      const getAcc = db.prepare(`SELECT * FROM accounts WHERE id = ? AND currency = ?`);
      const from = getAcc.get(fromAccountId, currency);
      const to   = getAcc.get(toAccountId,   currency);

      if (!from || !to) {
        throw Object.assign(new Error("Conta inexistente ou moeda divergente"), { http: 404 });
      }

      if (from.balance_cents < amountCents) {
        throw Object.assign(new Error("Saldo insuficiente"), { http: 409 });
      }

      // Debita e credita
      const upd = db.prepare(`UPDATE accounts SET balance_cents = ? WHERE id = ?`);
      upd.run(from.balance_cents - amountCents, fromAccountId);
      upd.run(to.balance_cents   + amountCents, toAccountId);

      // Registra transferência
      const code = ulid();
      const now  = new Date().toISOString();

      db.prepare(`
        INSERT INTO transfers (
          code, idempotency_key, from_account_id, to_account_id,
          currency, amount_cents, status, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 'COMPLETED', ?)
      `).run(code, idem, fromAccountId, toAccountId, currency, amountCents, now);

      const fromNew = db.prepare(`SELECT balance_cents FROM accounts WHERE id=?`).get(fromAccountId).balance_cents;
      const toNew   = db.prepare(`SELECT balance_cents FROM accounts WHERE id=?`).get(toAccountId).balance_cents;

      logger.info("transfer.completed", {
        code, idem, fromAccountId, toAccountId, currency, amountCents, createdAt: now
      });

      return { code, now, fromNew, toNew };
    })();

    return res.status(201).json({
      code: result.code,
      status: "COMPLETED",
      currency,
      amount,
      fromBalance: Number(result.fromNew) / 100,
      toBalance:   Number(result.toNew)   / 100,
      createdAt: result.now
    });

  } catch (err) {
    const http = err.http || 500;

    
    if (http === 500 && String(req.header("Idempotency-Key") || "")) {
      try {
        db.prepare(`
          INSERT INTO transfers (code, idempotency_key, from_account_id, to_account_id, currency, amount_cents, status, created_at, error_message)
          VALUES (?, ?, ?, ?, ?, ?, 'FAILED', ?, ?)
        `).run(ulid(), req.header("Idempotency-Key"), req.body?.fromAccountId, req.body?.toAccountId,
               req.body?.currency, Math.round((req.body?.amount || 0)*100), new Date().toISOString(), String(err.message));
      } catch { /* best effort */ }
    }

    logger.error("transfer.error", { message: err.message, stack: err.stack });
    return res.status(http).json({ error: err.message });
  }
});

// Inicializa
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  logger.info(`payments api listening on :${PORT}`);
});

// saldo da conta
app.get('/accounts/:id', (req, res) => {
  const acc = db.getAccount(req.params.id);
  if (!acc) return res.status(404).json({ error: 'account_not_found' });
  res.json(acc);
});

// buscar transferência por id
app.get('/transfers/:id', (req, res) => {
  const tx = db.getTransactionById?.(req.params.id); // se não tiver, use o por idempotency
  if (!tx) return res.status(404).json({ error: 'transfer_not_found' });
  res.json(tx);
});
