import Database from "better-sqlite3";

export const db = new Database("./payments.db");

db.exec(`
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS accounts (
  id             TEXT PRIMARY KEY,
  owner_name     TEXT NOT NULL,
  currency       TEXT NOT NULL CHECK (length(currency)=3),
  balance_cents  INTEGER NOT NULL CHECK (balance_cents >= 0)
);

CREATE TABLE IF NOT EXISTS transfers (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  code                 TEXT NOT NULL UNIQUE,            -- código único da operação (ULID)
  idempotency_key      TEXT NOT NULL UNIQUE,            -- evita duplicidade
  from_account_id      TEXT NOT NULL,
  to_account_id        TEXT NOT NULL,
  currency             TEXT NOT NULL,
  amount_cents         INTEGER NOT NULL CHECK (amount_cents > 0),
  status               TEXT NOT NULL CHECK (status IN ('COMPLETED','REVERSED','FAILED')),
  created_at           TEXT NOT NULL,
  error_message        TEXT
);

-- índices úteis
CREATE INDEX IF NOT EXISTS idx_transfers_from ON transfers(from_account_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to   ON transfers(to_account_id);
`);

// Seeds de exemplo (executa só se vazio)
const hasAccounts = db.prepare(`SELECT COUNT(*) as n FROM accounts`).get().n > 0;
if (!hasAccounts) {
  const seed = db.prepare(`
    INSERT INTO accounts (id, owner_name, currency, balance_cents)
    VALUES (?, ?, ?, ?)
  `);
  seed.run("A-100", "Alice", "BRL", 200_00);   // R$ 200,00
  seed.run("B-200", "Bob",   "BRL",  50_00);   // R$ 50,00
}
