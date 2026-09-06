import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  db, now, transact, moveStock, logActivity, bumpVersion, getVersion,
  readState, productById, orderById, orderItemsOf, getMeta,
  ensureAccessCodes, createSession, roleForToken, destroySession,
} from "./db.mjs";
import { seedIfEmpty } from "./seed.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "public");
const PORT = Number(process.env.PORT || 4321);

const seeded = seedIfEmpty();
const CODES = ensureAccessCodes();

/* ------------------------------------------------------------------ 유틸 */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(payload);
}
const fail = (res, status, message) => send(res, status, { error: message });

function readCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 1_000_000) throw new Error("요청이 너무 큽니다");
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("잘못된 JSON입니다");
  }
}

/** 프록시 뒤에서 HTTPS로 서비스될 때는 쿠키에 Secure 를 붙인다. */
function isSecure(req) {
  return (req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}
const clientIp = (req) =>
  (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";

/* 6자리 코드가 인터넷에 노출되므로 무차별 대입을 막는다: IP당 10분에 10회 실패까지. */
const loginFails = new Map();
const LOGIN_WINDOW = 10 * 60 * 1000;
const LOGIN_MAX = 10;

function loginBlocked(ip) {
  const rec = loginFails.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.first > LOGIN_WINDOW) { loginFails.delete(ip); return false; }
  return rec.count >= LOGIN_MAX;
}
function noteLoginFail(ip) {
  const rec = loginFails.get(ip);
  if (!rec || Date.now() - rec.first > LOGIN_WINDOW) loginFails.set(ip, { first: Date.now(), count: 1 });
  else rec.count += 1;
}

const str = (v, max = 300) => String(v ?? "").trim().slice(0, max);
const posInt = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** 요청 본문의 items 를 [{productId, qty}] 로 정리하고, 같은 제품은 합친다. */
function normalizeItems(raw) {
  if (!Array.isArray(raw)) return [];
  const merged = new Map();
  for (const it of raw.slice(0, 200)) {
    const pid = str(it?.productId, 64);
    const qty = posInt(it?.qty);
    if (!pid || !qty) continue;
    if (!productById.get(pid)) continue;
    merged.set(pid, (merged.get(pid) || 0) + qty);
  }
  return [...merged].map(([productId, qty]) => ({ productId, qty }));
}

/* ------------------------------------------------------------------ 준비된 문장 */

const insertOrder = db.prepare(
  `INSERT INTO orders (order_no, customer, dest, note, status, created_at)
   VALUES (?, ?, ?, ?, 'new', ?)`
);
const insertOrderItem = db.prepare(
  "INSERT INTO order_items (order_id, product_id, qty) VALUES (?, ?, ?)"
);
const setOrderPicking = db.prepare(
  "UPDATE orders SET status = 'picking', started_at = ? WHERE id = ?"
);
const setItemPicked = db.prepare(
  "UPDATE order_items SET picked = ? WHERE order_id = ? AND product_id = ?"
);
const setOrderShipped = db.prepare(
  `UPDATE orders SET status = 'shipped', shipped_at = ?, courier = ?, tracking = ? WHERE id = ?`
);
const setOrderCancelled = db.prepare(
  "UPDATE orders SET status = 'cancelled', cancelled_at = ? WHERE id = ?"
);
const orderNoExists = db.prepare("SELECT 1 FROM orders WHERE order_no = ?");
const insertInbound = db.prepare(
  "INSERT INTO inbounds (ref, supplier, date, note, created_at) VALUES (?, ?, ?, ?, ?)"
);
const insertInboundItem = db.prepare(
  "INSERT INTO inbound_items (inbound_id, product_id, qty) VALUES (?, ?, ?)"
);
const insertProduct = db.prepare(
  `INSERT INTO products (id, brand, name, cost, stock, min_stock, created_at)
   VALUES (?, ?, ?, ?, 0, ?, ?)`
);
const movesOfProduct = db.prepare(
  `SELECT delta, reason, ref, actor, created_at AS ts
     FROM stock_moves WHERE product_id = ? ORDER BY id DESC LIMIT 100`
);

/* ------------------------------------------------------------------ API */

const routes = [
  {
    method: "POST",
    path: /^\/api\/login$/,
    open: true,
    async handle(req, res, _m, body) {
      const ip = clientIp(req);
      if (loginBlocked(ip)) {
        return fail(res, 429, "시도가 너무 많습니다. 10분 뒤에 다시 해주세요.");
      }
      const code = str(body.code, 40);
      let role = null;
      if (code && code === getMeta("code_brand")) role = "brand";
      else if (code && code === getMeta("code_wh")) role = "warehouse";
      if (!role) {
        noteLoginFail(ip);
        return fail(res, 401, "접속 코드가 맞지 않습니다.");
      }
      loginFails.delete(ip);
      const token = createSession(role);
      const flags = `HttpOnly; SameSite=Lax; Path=/${isSecure(req) ? "; Secure" : ""}`;
      send(res, 200, { role }, {
        "set-cookie": `isty=${token}; ${flags}; Max-Age=${60 * 60 * 24 * 90}`,
      });
    },
  },
  {
    method: "POST",
    path: /^\/api\/logout$/,
    open: true,
    async handle(req, res) {
      destroySession(readCookies(req).isty);
      send(res, 200, { ok: true }, { "set-cookie": "isty=; HttpOnly; Path=/; Max-Age=0" });
    },
  },
  {
    method: "GET",
    path: /^\/api\/session$/,
    async handle(req, res, _m, _b, role) {
      send(res, 200, { role });
    },
  },
  {
    method: "GET",
    path: /^\/api\/version$/,
    async handle(req, res) {
      send(res, 200, { version: getVersion() });
    },
  },
  {
    method: "GET",
    path: /^\/api\/state$/,
    async handle(req, res, _m, _b, role) {
      send(res, 200, { ...readState(), role });
    },
  },

  /* ---- 주문 ---- */
  {
    method: "POST",
    path: /^\/api\/orders$/,
    roles: ["brand"],
    async handle(req, res, _m, body, role) {
      const items = normalizeItems(body.items);
      if (!items.length) return fail(res, 400, "담을 제품을 하나 이상 넣어주세요.");

      let orderNo = str(body.orderNo, 60);
      if (!orderNo) {
        const { n } = db.prepare("SELECT COUNT(*) AS n FROM orders").get();
        orderNo = `ISTY-${1001 + n}`;
      }
      if (orderNoExists.get(orderNo)) return fail(res, 409, "같은 주문번호가 이미 있습니다.");

      const id = transact(() => {
        const { lastInsertRowid } = insertOrder.run(
          orderNo, str(body.customer, 120) || "이름 없음",
          str(body.dest, 300), str(body.note, 500), now()
        );
        for (const it of items) insertOrderItem.run(lastInsertRowid, it.productId, it.qty);
        const units = items.reduce((a, i) => a + i.qty, 0);
        logActivity(role, `주문 ${orderNo} 등록 · ${units}개`);
        bumpVersion();
        return lastInsertRowid;
      });
      send(res, 201, { id, orderNo });
    },
  },
  {
    method: "POST",
    path: /^\/api\/orders\/(\d+)\/start$/,
    async handle(req, res, m, _b, role) {
      const order = orderById.get(Number(m[1]));
      if (!order) return fail(res, 404, "주문을 찾을 수 없습니다.");
      if (order.status !== "new") return fail(res, 409, "이미 작업이 시작된 주문입니다.");
      transact(() => {
        setOrderPicking.run(now(), order.id);
        logActivity(role, `주문 ${order.order_no} 포장 시작`);
        bumpVersion();
      });
      send(res, 200, { ok: true });
    },
  },
  {
    method: "POST",
    path: /^\/api\/orders\/(\d+)\/pick$/,
    async handle(req, res, m, body, role) {
      const order = orderById.get(Number(m[1]));
      if (!order) return fail(res, 404, "주문을 찾을 수 없습니다.");
      if (order.status !== "new" && order.status !== "picking") {
        return fail(res, 409, "이미 마감된 주문입니다.");
      }
      const productId = str(body.productId, 64);
      const picked = body.picked ? 1 : 0;
      transact(() => {
        setItemPicked.run(picked, order.id, productId);
        if (order.status === "new" && picked) setOrderPicking.run(now(), order.id);
        bumpVersion();
      });
      send(res, 200, { ok: true });
    },
  },
  {
    method: "POST",
    path: /^\/api\/orders\/(\d+)\/ship$/,
    async handle(req, res, m, body, role) {
      const order = orderById.get(Number(m[1]));
      if (!order) return fail(res, 404, "주문을 찾을 수 없습니다.");
      if (order.status === "shipped") return fail(res, 409, "이미 발송된 주문입니다.");
      if (order.status === "cancelled") return fail(res, 409, "취소된 주문입니다.");

      const items = orderItemsOf.all(order.id);
      const short = items
        .map((it) => ({ it, p: productById.get(it.product_id) }))
        .filter(({ it, p }) => !p || p.stock < it.qty);
      if (short.length) {
        const names = short.map(({ it, p }) => `${p ? p.name : it.product_id} (창고 ${p ? p.stock : 0}개)`);
        return fail(res, 409, `창고 재고가 모자랍니다: ${names.join(", ")}`);
      }

      const courier = str(body.courier, 60);
      const tracking = str(body.tracking, 80);
      transact(() => {
        for (const it of items) {
          moveStock({
            productId: it.product_id, delta: -it.qty, reason: "shipment",
            ref: order.order_no, actor: role,
          });
        }
        setOrderShipped.run(now(), courier, tracking, order.id);
        logActivity(role, `주문 ${order.order_no} 발송 완료${tracking ? ` · 송장 ${tracking}` : ""}`);
        bumpVersion();
      });
      send(res, 200, { ok: true });
    },
  },
  {
    method: "POST",
    path: /^\/api\/orders\/(\d+)\/cancel$/,
    roles: ["brand"],
    async handle(req, res, m, _b, role) {
      const order = orderById.get(Number(m[1]));
      if (!order) return fail(res, 404, "주문을 찾을 수 없습니다.");
      if (order.status === "cancelled") return fail(res, 409, "이미 취소된 주문입니다.");

      transact(() => {
        // 이미 나간 물건이면 재고를 창고로 되돌린다.
        if (order.status === "shipped") {
          for (const it of orderItemsOf.all(order.id)) {
            moveStock({
              productId: it.product_id, delta: it.qty, reason: "return",
              ref: order.order_no, actor: role,
            });
          }
        }
        setOrderCancelled.run(now(), order.id);
        logActivity(role, `주문 ${order.order_no} 취소${order.status === "shipped" ? " · 재고 반환" : ""}`);
        bumpVersion();
      });
      send(res, 200, { ok: true });
    },
  },

  /* ---- 입고 · 제품 ---- */
  {
    method: "POST",
    path: /^\/api\/inbounds$/,
    roles: ["brand"],
    async handle(req, res, _m, body, role) {
      const items = normalizeItems(body.items);
      if (!items.length) return fail(res, 400, "입고할 품목을 하나 이상 넣어주세요.");
      const ref = str(body.ref, 60) || `IB-${now().slice(0, 10)}`;

      transact(() => {
        const { lastInsertRowid: inboundId } = insertInbound.run(
          ref, str(body.supplier, 120), str(body.date, 20) || now().slice(0, 10),
          str(body.note, 500), now()
        );
        for (const it of items) {
          insertInboundItem.run(inboundId, it.productId, it.qty);
          moveStock({ productId: it.productId, delta: it.qty, reason: "inbound", ref, actor: role });
        }
        const units = items.reduce((a, i) => a + i.qty, 0);
        logActivity(role, `입고 ${ref} · ${items.length}개 품목 ${units}개 반영`);
        bumpVersion();
      });
      send(res, 201, { ok: true });
    },
  },
  {
    method: "POST",
    path: /^\/api\/products$/,
    roles: ["brand"],
    async handle(req, res, _m, body, role) {
      const brand = str(body.brand, 80);
      const name = str(body.name, 200);
      if (!brand || !name) return fail(res, 400, "브랜드와 제품명을 입력해주세요.");
      const id = str(body.id, 64) || `SKU${Date.now().toString(36).toUpperCase()}`;
      if (productById.get(id)) return fail(res, 409, "같은 바코드의 제품이 이미 있습니다.");
      const cost = Math.max(0, Number(body.cost) || 0);
      const minStock = Math.max(0, Math.floor(Number(body.minStock) || 2));

      transact(() => {
        insertProduct.run(id, brand, name, cost, minStock, now());
        logActivity(role, `제품 등록 · ${brand} ${name}`);
        bumpVersion();
      });
      send(res, 201, { id });
    },
  },
  {
    method: "POST",
    path: /^\/api\/products\/([^/]+)\/adjust$/,
    roles: ["brand"],
    async handle(req, res, m, body, role) {
      const product = productById.get(decodeURIComponent(m[1]));
      if (!product) return fail(res, 404, "제품을 찾을 수 없습니다.");
      const delta = Math.floor(Number(body.delta) || 0);
      if (!delta) return fail(res, 400, "조정할 수량을 입력해주세요.");
      if (product.stock + delta < 0) return fail(res, 409, "현재고보다 많이 뺄 수 없습니다.");

      transact(() => {
        moveStock({
          productId: product.id, delta, reason: "adjust",
          ref: str(body.reason, 120), actor: role,
        });
        logActivity(role, `재고 조정 · ${product.name} ${delta > 0 ? "+" : ""}${delta} → ${product.stock + delta}`);
        bumpVersion();
      });
      send(res, 200, { ok: true });
    },
  },
  {
    method: "GET",
    path: /^\/api\/products\/([^/]+)\/moves$/,
    roles: ["brand"],
    async handle(req, res, m) {
      const product = productById.get(decodeURIComponent(m[1]));
      if (!product) return fail(res, 404, "제품을 찾을 수 없습니다.");
      send(res, 200, { product: { id: product.id, name: product.name }, moves: movesOfProduct.all(product.id) });
    },
  },
];

/* ------------------------------------------------------------------ 정적 파일 */

async function serveStatic(req, res, pathname) {
  const rel = pathname === "/" ? "/index.html" : pathname;
  const full = join(PUBLIC, normalize(rel).replace(/^(\.\.[/\\])+/, ""));
  if (!full.startsWith(PUBLIC)) return fail(res, 403, "허용되지 않는 경로입니다.");
  try {
    const buf = await readFile(full);
    res.writeHead(200, {
      "content-type": MIME[extname(full)] || "application/octet-stream",
      "cache-control": "no-cache",
    });
    res.end(buf);
  } catch {
    if (extname(full)) return fail(res, 404, "찾을 수 없습니다.");
    return serveStatic(req, res, "/index.html"); // SPA 폴백
  }
}

/* ------------------------------------------------------------------ 서버 */

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  if (!pathname.startsWith("/api/")) return serveStatic(req, res, pathname);

  const route = routes.find((r) => r.method === req.method && r.path.test(pathname));
  if (!route) return fail(res, 404, "없는 API입니다.");

  const role = roleForToken(readCookies(req).isty);
  if (!route.open && !role) return fail(res, 401, "로그인이 필요합니다.");
  if (route.roles && !route.roles.includes(role)) {
    return fail(res, 403, "이 작업은 브랜드 계정만 할 수 있습니다.");
  }

  try {
    const body = req.method === "POST" ? await readBody(req) : {};
    await route.handle(req, res, pathname.match(route.path), body, role);
  } catch (err) {
    if (!res.headersSent) fail(res, 400, err.message || "요청을 처리하지 못했습니다.");
  }
});

server.listen(PORT, () => {
  const line = "─".repeat(46);
  console.log(`\n${line}`);
  console.log("  ISTY 재고 데스크");
  console.log(`  http://localhost:${PORT}`);
  console.log(line);
  console.log(`  브랜드(미니) 접속 코드 : ${CODES.brand}`);
  console.log(`  창고(실장님) 접속 코드 : ${CODES.wh}`);
  console.log(line);
  if (seeded) console.log("  PI00786492 발주분 39개 품목 314개를 넣었습니다.");
  console.log(`  데이터베이스: ${process.env.ISTY_DB || "data/isty.db"}\n`);
});
