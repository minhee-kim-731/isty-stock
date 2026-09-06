/**
 * D1 데이터 계층.
 *
 * D1 에는 대화형 트랜잭션이 없다. 대신 `db.batch([...])` 가 하나의 트랜잭션으로 원자 실행된다.
 * 그래서 "읽어서 확인하고 → 쓴다" 를 그대로 옮기면 두 번 눌렀을 때 두 번 적용될 수 있다.
 * 이 파일의 쓰기들은 전부 **조건을 SQL 안에 넣어서**, 상태가 이미 바뀌었으면 아무 일도
 * 일어나지 않도록 만들었다. 자세한 건 각 함수의 주석 참고.
 */

export const now = () => new Date().toISOString();

/* ------------------------------------------------------------------ meta */

export async function getMeta(db, key) {
  const row = await db.prepare("SELECT value FROM meta WHERE key = ?").bind(key).first();
  return row ? row.value : null;
}

export async function setMeta(db, key, value) {
  await db
    .prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(key, String(value))
    .run();
}

/** 데이터가 바뀔 때마다 오르는 숫자. 브라우저는 이 값만 폴링해서 변경을 감지한다. */
export const bumpVersionStmt = (db) =>
  db.prepare(
    `INSERT INTO meta (key, value) VALUES ('version', '1')
     ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(meta.value AS INTEGER) + 1 AS TEXT)`
  );

export async function getVersion(db) {
  return Number((await getMeta(db, "version")) || 0);
}

/* ------------------------------------------------------------------ 로그 · 원장 */

export const activityStmt = (db, actor, text, kind = "") =>
  db
    .prepare("INSERT INTO activity (actor, text, kind, created_at) VALUES (?, ?, ?, ?)")
    .bind(actor, text, kind, now());

/**
 * 재고 이동 한 건. `guardSql` 이 주어지면 그 조건이 참일 때만 원장에 남고 재고가 움직인다.
 * 재고 UPDATE 와 원장 INSERT 에 **똑같은 조건**을 걸어서 둘이 항상 같이 일어나게 한다.
 */
export function moveStockStmts(db, { productId, delta, reason, ref = "", actor = "", guard }) {
  const ts = now();
  const where = guard ? ` AND ${guard.sql}` : "";
  const extra = guard ? guard.binds : [];

  return [
    db
      .prepare(
        `INSERT INTO stock_moves (product_id, delta, reason, ref, actor, created_at)
         SELECT ?, ?, ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM products WHERE id = ?)${where}`
      )
      .bind(productId, delta, reason, ref, actor, ts, productId, ...extra),
    db
      .prepare(`UPDATE products SET stock = stock + ? WHERE id = ?${where}`)
      .bind(delta, productId, ...extra),
  ];
}

/* ------------------------------------------------------------------ 조회 */

const SQL_PRODUCTS = `
  SELECT p.id, p.brand, p.name, p.cost, p.sell_price AS sellPrice,
         p.stock, p.min_stock AS minStock, p.memo, p.memo_brand AS memoBrand,
         COALESCE((
           SELECT SUM(oi.qty) FROM order_items oi
             JOIN orders o ON o.id = oi.order_id
            WHERE oi.product_id = p.id AND o.status IN ('new','picking') AND o.hidden = 0
         ), 0) AS allocated
    FROM products p
   WHERE p.archived = 0
   ORDER BY p.brand COLLATE NOCASE, p.name COLLATE NOCASE`;

const SQL_ORDERS = `
  SELECT id, order_no AS orderNo, customer, dest, note, status, courier, tracking,
         created_at AS createdAt, started_at AS startedAt,
         shipped_at AS shippedAt, cancelled_at AS cancelledAt
    FROM orders WHERE hidden = 0 ORDER BY id DESC LIMIT 200`;

const SQL_ORDER_ITEMS = `
  SELECT oi.order_id AS orderId, oi.product_id AS productId, oi.qty, oi.picked,
         p.name, p.brand, p.stock
    FROM order_items oi JOIN products p ON p.id = oi.product_id
   WHERE oi.order_id IN (SELECT id FROM orders WHERE hidden = 0 ORDER BY id DESC LIMIT 200)
   ORDER BY oi.id`;

const SQL_INBOUNDS = `
  SELECT id, ref, supplier, date, note, voided_at AS voidedAt, created_at AS createdAt
    FROM inbounds ORDER BY id DESC LIMIT 60`;

const SQL_INBOUND_ITEMS = `
  SELECT ii.inbound_id AS inboundId, ii.product_id AS productId, ii.qty, p.name, p.brand
    FROM inbound_items ii JOIN products p ON p.id = ii.product_id
   WHERE ii.inbound_id IN (SELECT id FROM inbounds ORDER BY id DESC LIMIT 60)
   ORDER BY ii.id`;

const SQL_ACTIVITY = "SELECT id, actor, text, kind, created_at AS ts FROM activity ORDER BY id DESC LIMIT 40";

const SQL_CHECKS = `
  SELECT id, inbound_id AS inboundId, batch, checker, memo, actor, created_at AS ts
    FROM stock_checks ORDER BY id DESC LIMIT 50`;

/** 브랜드가 아직 못 본, 실장님이 일으킨 알림거리. */
const SQL_ALERTS = `
  SELECT id, actor, text, kind, created_at AS ts
    FROM activity
   WHERE id > ? AND actor = 'warehouse'
     AND kind IN ('stock_adjust', 'pack_done', 'order_cancel', 'stock_memo', 'stock_check')
   ORDER BY id DESC LIMIT 20`;

const group = (rows, key) => {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r[key])) map.set(r[key], []);
    map.get(r[key]).push(r);
  }
  return map;
};

/** 화면 한 장을 그리는 데 필요한 전부를 한 번에 돌려준다. */
export async function readState(db, role) {
  const seenId = Number((await getMeta(db, "brand_seen_activity_id")) || 0);
  const [products, orders, orderItems, inbounds, inboundItems, activity, checks, alerts, version] = await Promise.all([
    db.prepare(SQL_PRODUCTS).all(),
    db.prepare(SQL_ORDERS).all(),
    db.prepare(SQL_ORDER_ITEMS).all(),
    db.prepare(SQL_INBOUNDS).all(),
    db.prepare(SQL_INBOUND_ITEMS).all(),
    db.prepare(SQL_ACTIVITY).all(),
    db.prepare(SQL_CHECKS).all(),
    db.prepare(SQL_ALERTS).bind(seenId).all(),
    getVersion(db),
  ]);

  const itemsByOrder = group(orderItems.results, "orderId");
  const itemsByInbound = group(inboundItems.results, "inboundId");

  return {
    version,
    products: products.results.map((p) => {
      const out = { ...p, available: p.stock - p.allocated };
      // 민희님 전용 메모는 창고 화면으로 아예 내려보내지 않는다.
      if (role !== "brand") delete out.memoBrand;
      return out;
    }),
    orders: orders.results.map((o) => ({ ...o, items: itemsByOrder.get(o.id) || [] })),
    inbounds: inbounds.results.map((i) => ({ ...i, items: itemsByInbound.get(i.id) || [] })),
    activity: activity.results,
    checks: checks.results,
    alerts: alerts.results,
  };
}

/** 브랜드가 알림을 다 봤다고 표시한다. */
export async function markAlertsSeen(db) {
  const row = await db.prepare("SELECT COALESCE(MAX(id), 0) AS maxId FROM activity").first();
  await setMeta(db, "brand_seen_activity_id", row.maxId);
  return row.maxId;
}

export const getProduct = (db, id) =>
  db.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();

export const getOrder = (db, id) =>
  db.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();

export async function getOrderItems(db, orderId) {
  const { results } = await db
    .prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id")
    .bind(orderId)
    .all();
  return results;
}

export const getInbound = (db, id) =>
  db.prepare("SELECT * FROM inbounds WHERE id = ?").bind(id).first();

export async function getInboundItems(db, inboundId) {
  const { results } = await db
    .prepare("SELECT * FROM inbound_items WHERE inbound_id = ? ORDER BY id")
    .bind(inboundId)
    .all();
  return results;
}

/* ------------------------------------------------------------------ 세션 */

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function createSession(db, role) {
  const token = hex(crypto.getRandomValues(new Uint8Array(24)));
  await db.prepare("INSERT INTO sessions (token, role, created_at) VALUES (?, ?, ?)").bind(token, role, now()).run();
  return token;
}

export async function roleForToken(db, token) {
  if (!token) return null;
  const row = await db.prepare("SELECT role FROM sessions WHERE token = ?").bind(token).first();
  return row ? row.role : null;
}

export const destroySession = (db, token) =>
  token ? db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run() : Promise.resolve();

/* ------------------------------------------------------------------ 무결성 */

/**
 * products.stock 을 원장 합계로 다시 맞춘다. 어긋났을 때의 복구 수단.
 * 무엇이 얼마나 어긋나 있었는지 함께 돌려준다.
 */
export async function reconcileStock(db) {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.name, p.stock,
              COALESCE((SELECT SUM(delta) FROM stock_moves WHERE product_id = p.id), 0) AS ledger
         FROM products p
        WHERE p.stock <> COALESCE((SELECT SUM(delta) FROM stock_moves WHERE product_id = p.id), 0)`
    )
    .all();

  if (results.length) {
    await db.batch([
      db.prepare(
        `UPDATE products SET stock = COALESCE((SELECT SUM(delta) FROM stock_moves WHERE product_id = products.id), 0)`
      ),
      bumpVersionStmt(db),
    ]);
  }
  return results;
}
