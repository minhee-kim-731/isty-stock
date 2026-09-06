import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.ISTY_DB || join(HERE, "data", "isty.db");

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

/* ------------------------------------------------------------------ schema */

db.exec(`
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id         TEXT PRIMARY KEY,          -- 바코드 (없으면 자체 SKU)
  brand      TEXT NOT NULL,
  name       TEXT NOT NULL,
  cost       REAL NOT NULL DEFAULT 0,   -- EUR 매입 단가
  stock      INTEGER NOT NULL DEFAULT 0,-- 창고 실물 수량
  min_stock  INTEGER NOT NULL DEFAULT 2,
  archived   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inbounds (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ref        TEXT NOT NULL,             -- PI 번호
  supplier   TEXT NOT NULL DEFAULT '',
  date       TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inbound_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  inbound_id INTEGER NOT NULL REFERENCES inbounds(id) ON DELETE CASCADE,
  product_id TEXT    NOT NULL REFERENCES products(id),
  qty        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no     TEXT NOT NULL UNIQUE,
  customer     TEXT NOT NULL DEFAULT '',
  dest         TEXT NOT NULL DEFAULT '',
  note         TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'new',   -- new | picking | shipped | cancelled
  courier      TEXT NOT NULL DEFAULT '',
  tracking     TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  started_at   TEXT,
  shipped_at   TEXT,
  cancelled_at TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT    NOT NULL REFERENCES products(id),
  qty        INTEGER NOT NULL,
  picked     INTEGER NOT NULL DEFAULT 0
);

-- 모든 재고 변동의 원장. products.stock 은 이 원장의 합계와 항상 일치해야 한다.
CREATE TABLE IF NOT EXISTS stock_moves (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT    NOT NULL REFERENCES products(id),
  delta      INTEGER NOT NULL,
  reason     TEXT    NOT NULL,          -- inbound | shipment | adjust | return
  ref        TEXT    NOT NULL DEFAULT '',
  actor      TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS activity (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  actor      TEXT NOT NULL,
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  role       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_moves_product     ON stock_moves(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);
`);

/* ------------------------------------------------------------------ helpers */

export const now = () => new Date().toISOString();

const getMetaStmt = db.prepare("SELECT value FROM meta WHERE key = ?");
const setMetaStmt = db.prepare(
  "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
);
export const getMeta = (k) => getMetaStmt.get(k)?.value ?? null;
export const setMeta = (k, v) => setMetaStmt.run(k, String(v));

/** 데이터가 바뀔 때마다 오르는 숫자. 브라우저는 이 값만 폴링해서 변경을 감지한다. */
export function bumpVersion() {
  const next = Number(getMeta("version") || 0) + 1;
  setMeta("version", next);
  return next;
}
export const getVersion = () => Number(getMeta("version") || 0);

export function transact(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

const insertMove = db.prepare(
  `INSERT INTO stock_moves (product_id, delta, reason, ref, actor, created_at)
   VALUES (?, ?, ?, ?, ?, ?)`
);
const bumpStock = db.prepare("UPDATE products SET stock = stock + ? WHERE id = ?");

/** 재고를 옮기면서 반드시 원장에 남긴다. transact() 안에서만 호출할 것. */
export function moveStock({ productId, delta, reason, ref = "", actor = "" }) {
  bumpStock.run(delta, productId);
  insertMove.run(productId, delta, reason, ref, actor, now());
}

const insertActivity = db.prepare(
  "INSERT INTO activity (actor, text, created_at) VALUES (?, ?, ?)"
);
export const logActivity = (actor, text) => insertActivity.run(actor, text, now());

/* ------------------------------------------------------------------ queries */

const qProducts = db.prepare(`
  SELECT p.id, p.brand, p.name, p.cost, p.stock, p.min_stock AS minStock,
         COALESCE((
           SELECT SUM(oi.qty) FROM order_items oi
             JOIN orders o ON o.id = oi.order_id
            WHERE oi.product_id = p.id AND o.status IN ('new','picking')
         ), 0) AS allocated
    FROM products p
   WHERE p.archived = 0
   ORDER BY p.brand COLLATE NOCASE, p.name COLLATE NOCASE
`);

const qOrders = db.prepare(`
  SELECT id, order_no AS orderNo, customer, dest, note, status, courier, tracking,
         created_at AS createdAt, started_at AS startedAt,
         shipped_at AS shippedAt, cancelled_at AS cancelledAt
    FROM orders ORDER BY id DESC LIMIT 300
`);

const qOrderItems = db.prepare(`
  SELECT oi.order_id AS orderId, oi.product_id AS productId, oi.qty, oi.picked,
         p.name, p.brand, p.stock
    FROM order_items oi JOIN products p ON p.id = oi.product_id
   ORDER BY oi.id
`);

const qInbounds = db.prepare(`
  SELECT id, ref, supplier, date, note, created_at AS createdAt
    FROM inbounds ORDER BY id DESC LIMIT 100
`);

const qInboundItems = db.prepare(`
  SELECT ii.inbound_id AS inboundId, ii.product_id AS productId, ii.qty, p.name, p.brand
    FROM inbound_items ii JOIN products p ON p.id = ii.product_id
   ORDER BY ii.id
`);

const qActivity = db.prepare(
  "SELECT actor, text, created_at AS ts FROM activity ORDER BY id DESC LIMIT 40"
);

/** 화면 한 장을 그리는 데 필요한 전부를 한 번에 돌려준다. */
export function readState() {
  const products = qProducts.all();
  const orders = qOrders.all();
  const inbounds = qInbounds.all();

  const itemsByOrder = new Map();
  for (const it of qOrderItems.all()) {
    if (!itemsByOrder.has(it.orderId)) itemsByOrder.set(it.orderId, []);
    itemsByOrder.get(it.orderId).push(it);
  }
  const itemsByInbound = new Map();
  for (const it of qInboundItems.all()) {
    if (!itemsByInbound.has(it.inboundId)) itemsByInbound.set(it.inboundId, []);
    itemsByInbound.get(it.inboundId).push(it);
  }

  return {
    version: getVersion(),
    products: products.map((p) => ({ ...p, available: p.stock - p.allocated })),
    orders: orders.map((o) => ({ ...o, items: itemsByOrder.get(o.id) || [] })),
    inbounds: inbounds.map((i) => ({ ...i, items: itemsByInbound.get(i.id) || [] })),
    activity: qActivity.all(),
  };
}

export const productById = db.prepare("SELECT * FROM products WHERE id = ?");
export const orderById = db.prepare("SELECT * FROM orders WHERE id = ?");
export const orderItemsOf = db.prepare(
  "SELECT * FROM order_items WHERE order_id = ? ORDER BY id"
);

/* ------------------------------------------------------------------ 접속 코드 */

/** 처음 실행할 때 브랜드/창고 접속 코드를 만들어 DB에 보관한다. */
export function ensureAccessCodes() {
  const make = () => randomBytes(3).readUIntBE(0, 3).toString().padStart(6, "0").slice(-6);
  if (!getMeta("code_brand")) setMeta("code_brand", process.env.ISTY_BRAND_CODE || make());
  if (!getMeta("code_wh")) setMeta("code_wh", process.env.ISTY_WAREHOUSE_CODE || make());
  return { brand: getMeta("code_brand"), wh: getMeta("code_wh") };
}

const insertSession = db.prepare(
  "INSERT INTO sessions (token, role, created_at) VALUES (?, ?, ?)"
);
const findSession = db.prepare("SELECT role FROM sessions WHERE token = ?");
const dropSession = db.prepare("DELETE FROM sessions WHERE token = ?");

export function createSession(role) {
  const token = randomBytes(24).toString("hex");
  insertSession.run(token, role, now());
  return token;
}
export const roleForToken = (token) => (token ? findSession.get(token)?.role ?? null : null);
export const destroySession = (token) => token && dropSession.run(token);
