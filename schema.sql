-- ISTY 재고 데스크 · D1 스키마
-- 적용:  npx wrangler d1 execute isty --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id         TEXT PRIMARY KEY,           -- 바코드 (없으면 자체 SKU)
  brand      TEXT NOT NULL,
  name       TEXT NOT NULL,
  cost       REAL NOT NULL DEFAULT 0,    -- EUR 매입 단가
  sell_price REAL NOT NULL DEFAULT 0,    -- EUR 판매가 (IVA 포함). 0 이면 미설정
  stock      INTEGER NOT NULL DEFAULT 0, -- 창고 실물 수량
  min_stock  INTEGER NOT NULL DEFAULT 2,
  archived   INTEGER NOT NULL DEFAULT 0,
  memo       TEXT NOT NULL DEFAULT '',  -- 실장님 메모 (양쪽 모두 보임)
  memo_brand TEXT NOT NULL DEFAULT '',  -- 민희님 전용 메모
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inbounds (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ref        TEXT NOT NULL,              -- PI 번호
  supplier   TEXT NOT NULL DEFAULT '',
  date       TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  voided_at  TEXT,                       -- 입고를 되돌린 시각
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inbound_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  inbound_id INTEGER NOT NULL REFERENCES inbounds(id),
  product_id TEXT    NOT NULL REFERENCES products(id),
  qty        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no     TEXT NOT NULL UNIQUE,
  customer     TEXT NOT NULL DEFAULT '',
  dest         TEXT NOT NULL DEFAULT '',
  note         TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'new',  -- new | picking | shipped | cancelled
  courier      TEXT NOT NULL DEFAULT '',
  tracking     TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  started_at   TEXT,
  shipped_at   TEXT,
  cancelled_at TEXT,
  hidden       INTEGER NOT NULL DEFAULT 0   -- 1이면 화면에서 감춤 (기록은 남음)
);

CREATE TABLE IF NOT EXISTS order_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id),
  product_id TEXT    NOT NULL REFERENCES products(id),
  qty        INTEGER NOT NULL,
  picked     INTEGER NOT NULL DEFAULT 0
);

-- 모든 재고 변동의 원장. products.stock 은 이 원장의 합계와 항상 일치해야 한다.
CREATE TABLE IF NOT EXISTS stock_moves (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT    NOT NULL REFERENCES products(id),
  delta      INTEGER NOT NULL,
  reason     TEXT    NOT NULL,   -- inbound | shipment | adjust | return | void
  ref        TEXT    NOT NULL DEFAULT '',
  actor      TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS activity (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  actor      TEXT NOT NULL,
  text       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT '',  -- 알림 종류: stock_adjust | pack_done | order_cancel | stock_memo | stock_check
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  role       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_inbound_items_ib  ON inbound_items(inbound_id);
CREATE INDEX IF NOT EXISTS idx_moves_product     ON stock_moves(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);

-- 로그인 무차별 대입 방어. IP 하나가 짧은 시간에 여러 번 틀리면 잠근다.
CREATE TABLE IF NOT EXISTS login_attempts (
  ip       TEXT PRIMARY KEY,
  count    INTEGER NOT NULL DEFAULT 0,
  first_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_checks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  inbound_id INTEGER REFERENCES inbounds(id),
  batch      TEXT NOT NULL DEFAULT '',
  checker    TEXT NOT NULL,
  memo       TEXT NOT NULL DEFAULT '',
  actor      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
