import {
  now, getMeta, bumpVersionStmt, activityStmt, moveStockStmts, movePackingStmts,
  readState, getProduct, getOrder, getOrderItems, getInbound, getInboundItems, getPackingMaterial,
  createSession, roleForToken, destroySession, reconcileStock, getVersion, markAlertsSeen,
} from "./db.js";
import { seedIfEmpty } from "./seed.js";

/* ------------------------------------------------------------------ 응답 */

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

const fail = (status, message) => json({ error: message }, status);

/* ------------------------------------------------------------------ 입력 정리 */

const str = (v, max = 300) => String(v ?? "").trim().slice(0, max);
const posInt = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

function readCookies(request) {
  const out = {};
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** 요청의 items 를 [{productId, qty}] 로 정리하고 같은 제품은 합친다. 없는 제품은 버린다. */
async function normalizeItems(db, raw) {
  if (!Array.isArray(raw)) return [];
  const merged = new Map();
  for (const it of raw.slice(0, 200)) {
    const pid = str(it?.productId, 64);
    const qty = posInt(it?.qty);
    if (!pid || !qty) continue;
    merged.set(pid, (merged.get(pid) || 0) + qty);
  }
  const out = [];
  for (const [productId, qty] of merged) {
    if (await getProduct(db, productId)) out.push({ productId, qty });
  }
  return out;
}

/** 조건이 참일 때만 남는 활동 기록. 경합으로 실제 변경이 없었으면 로그도 남지 않는다. */
const guardedActivityStmt = (db, actor, text, guard, kind = "") =>
  db
    .prepare(`INSERT INTO activity (actor, text, kind, created_at) SELECT ?, ?, ?, ? WHERE ${guard.sql}`)
    .bind(actor, text, kind, now(), ...guard.binds);

/* ------------------------------------------------------------------ 시도 제한 */

/**
 * 로그인 무차별 대입 방어. 접속 코드가 짧을수록 이게 실질적인 방어선이 된다.
 * IP 하나가 WINDOW 안에 MAX 번 틀리면, 그 창이 지날 때까지 맞는 코드도 받지 않는다.
 */
const LOGIN_MAX = 8;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;

const clientIp = (request) =>
  request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";

async function loginBlocked(db, ip) {
  const row = await db.prepare("SELECT count, first_at AS firstAt FROM login_attempts WHERE ip = ?").bind(ip).first();
  if (!row) return false;
  if (Date.now() - new Date(row.firstAt).getTime() > LOGIN_WINDOW_MS) {
    await db.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ip).run();
    return false;
  }
  return row.count >= LOGIN_MAX;
}

async function noteLoginFail(db, ip) {
  await db
    .prepare(
      `INSERT INTO login_attempts (ip, count, first_at) VALUES (?, 1, ?)
       ON CONFLICT(ip) DO UPDATE SET count = login_attempts.count + 1`
    )
    .bind(ip, now())
    .run();
}

const clearLoginFails = (db, ip) => db.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ip).run();

/* ------------------------------------------------------------------ 라우팅 */

const ROUTES = [
  ["POST", /^\/api\/login$/, login, { open: true }],
  ["POST", /^\/api\/logout$/, logout, { open: true }],
  ["GET", /^\/api\/session$/, (c) => json({ role: c.role })],
  ["GET", /^\/api\/version$/, async (c) => json({ version: await getVersion(c.db) })],
  ["GET", /^\/api\/state$/, async (c) => json({ ...(await readState(c.db, c.role)), role: c.role })],

  ["POST", /^\/api\/orders$/, createOrder, { roles: ["brand"] }],
  ["POST", /^\/api\/orders\/(\d+)\/edit$/, editOrder, { roles: ["brand"] }],
  ["POST", /^\/api\/orders\/(\d+)\/start$/, startPicking],
  ["POST", /^\/api\/orders\/(\d+)\/pick$/, pickItem],
  ["POST", /^\/api\/orders\/(\d+)\/ship$/, shipOrder],
  ["POST", /^\/api\/orders\/(\d+)\/pickup$/, pickupOrder],
  ["POST", /^\/api\/orders\/(\d+)\/cancel$/, cancelOrder],   // 권한은 핸들러 안에서 나눈다

  ["POST", /^\/api\/inbounds$/, createInbound, { roles: ["brand"] }],
  ["POST", /^\/api\/inbounds\/(\d+)\/void$/, voidInbound, { roles: ["brand"] }],

  ["POST", /^\/api\/products$/, createProduct, { roles: ["brand"] }],
  ["POST", /^\/api\/products\/([^/]+)\/adjust$/, adjustStock],
  ["POST", /^\/api\/products\/([^/]+)\/archive$/, archiveProduct, { roles: ["brand"] }],
  ["POST", /^\/api\/products\/([^/]+)\/price$/, setSellPrice, { roles: ["brand"] }],
  ["GET", /^\/api\/products\/([^/]+)\/moves$/, productMoves],   // 실장님도 볼 수 있다
  ["POST", /^\/api\/products\/([^/]+)\/memo$/, setProductMemo],  // 메모는 양쪽 다

  ["POST", /^\/api\/stock-checks$/, createStockCheck],   // 점검은 양쪽 다

  ["POST", /^\/api\/packing$/, createPackingType, { roles: ["brand"] }],
  ["POST", /^\/api\/packing\/(\d+)\/adjust$/, adjustPacking],   // 조정은 양쪽 다 (재고 조정과 동일)

  ["POST", /^\/api\/notifications\/seen$/, seenAlerts, { roles: ["brand"] }],
  ["GET", /^\/api\/export$/, exportAll, { roles: ["brand"] }],
  ["POST", /^\/api\/reconcile$/, reconcile, { roles: ["brand"] }],
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (!env.DB) return fail(500, "데이터베이스가 연결되지 않았습니다.");

    const route = ROUTES.find(([m, re]) => m === request.method && re.test(url.pathname));
    if (!route) return fail(404, "없는 API입니다.");
    const [, re, handler, opts = {}] = route;

    const db = env.DB;
    const token = readCookies(request).isty;
    const role = await roleForToken(db, token);

    if (!opts.open && !role) return fail(401, "로그인이 필요합니다.");
    if (opts.roles && !opts.roles.includes(role)) {
      return fail(403, "이 작업은 브랜드 계정만 할 수 있습니다.");
    }

    let body = {};
    if (request.method === "POST") {
      try {
        const text = await request.text();
        body = text ? JSON.parse(text) : {};
      } catch {
        return fail(400, "잘못된 JSON입니다.");
      }
    }

    try {
      return await handler({ db, env, request, role, body, m: url.pathname.match(re), token });
    } catch (err) {
      return fail(500, `요청을 처리하지 못했습니다: ${err.message}`);
    }
  },
};

/* ------------------------------------------------------------------ 로그인 */

async function login({ db, env, body, request }) {
  const ip = clientIp(request);
  if (await loginBlocked(db, ip)) {
    return fail(429, "시도가 너무 많습니다. 10분 뒤에 다시 해주세요.");
  }

  const code = str(body.code, 60);
  if (!code) return fail(401, "접속 코드를 입력해주세요.");

  const brandCode = env.ISTY_BRAND_CODE || (await getMeta(db, "code_brand"));
  const whCode = env.ISTY_WAREHOUSE_CODE || (await getMeta(db, "code_wh"));

  let role = null;
  if (brandCode && code === brandCode) role = "brand";
  else if (whCode && code === whCode) role = "warehouse";
  if (!role) {
    await noteLoginFail(db, ip);
    return fail(401, "접속 코드가 맞지 않습니다.");
  }
  await clearLoginFails(db, ip);

  // 처음 들어온 사람이 빈 데이터베이스를 만나지 않도록, 비어 있으면 여기서 채운다.
  await seedIfEmpty(db);

  const token = await createSession(db, role);
  return json(
    { role },
    200,
    { "set-cookie": `isty=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 90}` }
  );
}

async function logout({ db, token }) {
  await destroySession(db, token);
  return json({ ok: true }, 200, { "set-cookie": "isty=; HttpOnly; Secure; Path=/; Max-Age=0" });
}

/* ------------------------------------------------------------------ 주문 */

async function createOrder({ db, body, role }) {
  const items = await normalizeItems(db, body.items);
  if (!items.length) return fail(400, "담을 제품을 하나 이상 넣어주세요.");

  let orderNo = str(body.orderNo, 60);
  if (!orderNo) {
    const { n } = await db.prepare("SELECT COUNT(*) AS n FROM orders WHERE hidden = 0").first();
    orderNo = `ISTY-${1001 + n}`;
  }
  if (await db.prepare("SELECT 1 AS x FROM orders WHERE order_no = ?").bind(orderNo).first()) {
    return fail(409, "같은 주문번호가 이미 있습니다.");
  }

  const ts = now();
  const units = items.reduce((a, i) => a + i.qty, 0);
  const orderRef = "(SELECT id FROM orders WHERE order_no = ? ORDER BY id DESC LIMIT 1)";
  const visitNo = posInt(body.visitNo) || null;

  const stmts = [
    db
      .prepare(
        `INSERT INTO orders (order_no, customer, dest, note, courier, tracking, visit_no, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)`
      )
      .bind(
        orderNo, str(body.customer, 120) || "이름 없음", str(body.dest, 300), str(body.note, 500),
        str(body.courier, 60), str(body.tracking, 80), visitNo, ts
      ),
    ...items.map((it) =>
      db
        .prepare(`INSERT INTO order_items (order_id, product_id, qty) VALUES (${orderRef}, ?, ?)`)
        .bind(orderNo, it.productId, it.qty)
    ),
    activityStmt(db, role, `주문 ${orderNo} 등록 · ${units}개`),
    bumpVersionStmt(db),
  ];

  await db.batch(stmts);
  const created = await db.prepare("SELECT id FROM orders WHERE order_no = ?").bind(orderNo).first();
  return json({ id: created.id, orderNo }, 201);
}

/**
 * 주문 정보를 고친다. 취소된 주문은 품목을 못 건드린다 (이미 끝난 건이라 의미가 없다).
 *
 * 품목을 바꿀 때:
 *  - 아직 포장 완료 전(new/picking)이면 재고는 손대지 않는다 — "출고대기"는 order_items 에서
 *    바로 계산되는 값이라, 여기서 그냥 order_items 만 바꾸면 자동으로 맞다.
 *  - 이미 포장 완료(shipped)된 주문이면 그때 이미 실물 재고가 빠져나간 상태라, 옛 수량과
 *    새 수량의 차이만큼 재고를 실제로 되돌리거나 더 빼야 원장(stock_moves)과 어긋나지 않는다.
 */
async function editOrder({ db, m, body, role }) {
  const id = Number(m[1]);
  const order = await getOrder(db, id);
  if (!order) return fail(404, "주문을 찾을 수 없습니다.");

  const customer = str(body.customer, 120) || order.customer;
  const dest = str(body.dest, 300);
  const note = str(body.note, 500);
  const courier = str(body.courier, 60);
  const tracking = str(body.tracking, 80);
  const visitNo = posInt(body.visitNo) || null;

  const changes = [];
  if (customer !== order.customer) changes.push(`고객명 "${order.customer}" → "${customer}"`);
  if (dest !== order.dest) changes.push("배송지 변경");
  if (courier !== order.courier) changes.push(`택배사 "${order.courier || "—"}" → "${courier || "—"}"`);
  if (tracking !== order.tracking) changes.push(`송장번호 "${order.tracking || "—"}" → "${tracking || "—"}"`);
  if ((order.visit_no || null) !== visitNo) changes.push(`이용 횟수 ${order.visit_no || "—"} → ${visitNo || "—"}`);
  if (note !== order.note) changes.push("메모 수정");

  const stmts = [];

  if (Array.isArray(body.items)) {
    if (order.status === "cancelled") return fail(409, "취소된 주문은 품목을 수정할 수 없습니다.");

    const newItems = await normalizeItems(db, body.items);
    if (!newItems.length) return fail(400, "담을 제품을 하나 이상 넣어주세요.");

    const oldItems = await getOrderItems(db, id);
    const oldQty = new Map(oldItems.map((it) => [it.product_id, it.qty]));
    const oldPicked = new Map(oldItems.map((it) => [it.product_id, it.picked]));
    const newQty = new Map(newItems.map((it) => [it.productId, it.qty]));

    const sameAsBefore =
      oldQty.size === newQty.size && [...oldQty].every(([pid, qty]) => newQty.get(pid) === qty);

    if (!sameAsBefore) {
      // 이미 포장 완료된 주문이면, 바뀐 만큼 실제 재고도 같이 맞춘다.
      if (order.status === "shipped") {
        const allIds = new Set([...oldQty.keys(), ...newQty.keys()]);
        const short = [];
        for (const pid of allIds) {
          const before = oldQty.get(pid) || 0;
          const after = newQty.get(pid) || 0;
          const delta = before - after;   // 늘었으면 음수(재고 더 뺌), 줄었으면 양수(재고 돌려줌)
          if (delta === 0) continue;

          const product = await getProduct(db, pid);
          if (delta < 0 && product && product.stock + delta < 0) {
            short.push(`${product.name} (창고 ${product.stock}개, ${-delta}개 더 필요)`);
            continue;
          }
          stmts.push(
            ...moveStockStmts(db, {
              productId: pid, delta, reason: "adjust", ref: `주문 ${order.order_no} 품목 수정`, actor: role,
              guard: { sql: "(SELECT stock FROM products WHERE id = ?) + ? >= 0", binds: [pid, delta] },
            })
          );
        }
        if (short.length) return fail(409, `창고 재고가 모자랍니다: ${short.join(", ")}`);
      }

      stmts.push(db.prepare("DELETE FROM order_items WHERE order_id = ?").bind(id));
      for (const it of newItems) {
        stmts.push(
          db
            .prepare("INSERT INTO order_items (order_id, product_id, qty, picked) VALUES (?, ?, ?, ?)")
            .bind(id, it.productId, it.qty, oldPicked.get(it.productId) ? 1 : 0)
        );
      }
      changes.push("품목 변경");
    }
  }

  if (!changes.length) return json({ ok: true });   // 바뀐 게 없으면 조용히 넘어간다

  stmts.push(
    db
      .prepare(
        `UPDATE orders SET customer = ?, dest = ?, note = ?, courier = ?, tracking = ?, visit_no = ?
          WHERE id = ?`
      )
      .bind(customer, dest, note, courier, tracking, visitNo, id),
    activityStmt(db, role, `주문 ${order.order_no} 정보 수정 · ${changes.join(", ")}`),
    bumpVersionStmt(db)
  );

  await db.batch(stmts);
  return json({ ok: true });
}

async function startPicking({ db, m, role, env }) {
  const id = Number(m[1]);
  const order = await getOrder(db, id);
  if (!order) return fail(404, "주문을 찾을 수 없습니다.");
  if (order.status !== "new") return fail(409, "이미 작업이 시작된 주문입니다.");

  const guard = { sql: "EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'new')", binds: [id] };
  const label = `주문 ${order.order_no} (${order.customer}) 수락 · 포장 시작`;
  // guardedActivityStmt 가 보는 조건(status='new')은 상태를 바꾸는 UPDATE보다 먼저 확인해야 한다.
  const results = await db.batch([
    guardedActivityStmt(db, role, label, guard),
    bumpVersionStmt(db),
    db.prepare("UPDATE orders SET status = 'picking', started_at = ? WHERE id = ? AND status = 'new'").bind(now(), id),
  ]);
  const changed = results[results.length - 1].meta.changes;
  if (!changed) return fail(409, "다른 화면에서 이미 수락됐습니다.");

  if (role === "warehouse") await notifySlack(env, `📥 ${label}`);
  return json({ ok: true });
}

async function pickItem({ db, m, body }) {
  const id = Number(m[1]);
  const order = await getOrder(db, id);
  if (!order) return fail(404, "주문을 찾을 수 없습니다.");
  if (order.status !== "new" && order.status !== "picking") return fail(409, "이미 마감된 주문입니다.");

  // 주문 수락(= 포장 시작) 전에는 품목을 체크할 수 없다.
  if (order.status !== "picking") {
    return fail(409, "먼저 '주문 수락'을 눌러주세요.");
  }

  const productId = str(body.productId, 64);
  const picked = body.picked ? 1 : 0;

  await db.batch([
    db
      .prepare(
        `UPDATE order_items SET picked = ? WHERE order_id = ? AND product_id = ?
           AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'picking')`
      )
      .bind(picked, id, productId, id),
    bumpVersionStmt(db),
  ]);
  return json({ ok: true });
}

async function shipOrder({ db, m, body, role, env }) {
  const id = Number(m[1]);
  const order = await getOrder(db, id);
  if (!order) return fail(404, "주문을 찾을 수 없습니다.");
  if (order.status === "shipped") return fail(409, "이미 포장 완료된 주문입니다.");
  if (order.status === "cancelled") return fail(409, "취소된 주문입니다.");
  if (order.status !== "picking") return fail(409, "먼저 '주문 수락'을 눌러주세요.");

  const items = await getOrderItems(db, id);

  // 화면에서만 막지 말고 여기서도 막는다. 안 담은 게 있으면 내보내지 않는다.
  const notPicked = items.filter((it) => !it.picked);
  if (notPicked.length) {
    return fail(409, `아직 담지 않은 품목이 ${notPicked.length}개 있습니다.`);
  }
  const short = [];
  for (const it of items) {
    const p = await getProduct(db, it.product_id);
    if (!p || p.stock < it.qty) short.push(`${p ? p.name : it.product_id} (창고 ${p ? p.stock : 0}개)`);
  }
  if (short.length) return fail(409, `창고 재고가 모자랍니다: ${short.join(", ")}`);

  const boxId = Math.floor(Number(body.boxId)) || null;
  if (!boxId) return fail(400, "포장 상자를 선택해주세요.");
  const box = await getPackingMaterial(db, boxId);
  if (!box || box.archived) return fail(404, "포장 상자 종류를 찾을 수 없습니다.");
  if (box.stock <= 0) return fail(409, `${box.size} 상자 재고가 없습니다.`);

  // 실장님이 비워서 보내면 민희님이 주문 등록할 때 넣어둔 값을 그대로 둔다.
  const courier = str(body.courier, 60) || order.courier;
  const tracking = str(body.tracking, 80) || order.tracking;

  // 모든 쓰기를 "아직 발송 전" 조건에 건다. 두 번 눌러도 두 번 빠지지 않는다.
  const guard = { sql: "EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'picking')", binds: [id] };
  const stmts = [];
  for (const it of items) {
    stmts.push(
      ...moveStockStmts(db, {
        productId: it.product_id, delta: -it.qty, reason: "shipment",
        ref: order.order_no, actor: role, guard,
      })
    );
  }
  const label = `주문 ${order.order_no} (${order.customer}) 포장 완료${tracking ? ` · 송장 ${tracking}` : ""} · ${box.size} 상자`;
  stmts.push(
    ...movePackingStmts(db, {
      packingId: boxId, delta: -1, reason: "ship", ref: order.order_no, actor: role, guard,
    }),
    guardedActivityStmt(db, role, label, guard, role === "warehouse" ? "pack_done" : ""),
    db
      .prepare(
        `UPDATE orders SET status = 'shipped', shipped_at = ?, courier = ?, tracking = ?, box_id = ?
          WHERE id = ? AND status = 'picking'`
      )
      .bind(now(), courier, tracking, boxId, id),
    bumpVersionStmt(db)
  );

  const results = await db.batch(stmts);
  const changed = results[results.length - 2].meta.changes;
  if (!changed) return fail(409, "다른 화면에서 이미 발송 처리됐습니다.");

  if (role === "warehouse") await notifySlack(env, `📦 ${label}`);
  return json({ ok: true });
}

/** 알림 채널로 한 줄 보낸다. 실패해도 무시한다 — 인앱 알림이 이미 남아있으니 이 요청 자체는 성공으로 둔다. */
async function notifySlack(env, text) {
  if (!env.SLACK_WEBHOOK_URL) return;
  try {
    await fetch(env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    // 슬랙이 잠깐 안 되더라도 픽업 처리 자체는 이미 끝났다.
  }
}

/** 택배 기사가 실제로 픽업해 갔다는 표시. 포장 완료와는 별개의 시각으로 남긴다. */
async function pickupOrder({ db, m, role, env }) {
  const id = Number(m[1]);
  const order = await getOrder(db, id);
  if (!order) return fail(404, "주문을 찾을 수 없습니다.");
  if (order.status !== "shipped") return fail(409, "포장 완료된 주문만 픽업 완료 처리할 수 있습니다.");
  if (order.picked_up_at) return fail(409, "이미 픽업 완료 처리됐습니다.");

  const guard = {
    sql: "EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'shipped' AND picked_up_at IS NULL)",
    binds: [id],
  };
  const label = `주문 ${order.order_no} (${order.customer}) 택배 픽업 완료`;

  // 조건부 문장들이 먼저 "아직 픽업 전" 상태를 확인해야 하므로, 상태를 바꾸는 UPDATE는 맨 뒤에 둔다
  // (guardedActivityStmt 도 같은 조건을 보는데, 앞서 UPDATE 를 해버리면 그 조건이 이미 거짓이 된다).
  const results = await db.batch([
    guardedActivityStmt(db, role, label, guard, "pickup_done"),
    bumpVersionStmt(db),
    db
      .prepare(
        `UPDATE orders SET picked_up_at = ?
          WHERE id = ? AND status = 'shipped' AND picked_up_at IS NULL`
      )
      .bind(now(), id),
  ]);
  const changed = results[results.length - 1].meta.changes;
  if (!changed) return fail(409, "다른 화면에서 이미 처리됐습니다.");

  if (role === "warehouse") await notifySlack(env, `📦 ${label}`);
  return json({ ok: true });
}

async function cancelOrder({ db, m, role }) {
  const id = Number(m[1]);
  const order = await getOrder(db, id);
  if (!order) return fail(404, "주문을 찾을 수 없습니다.");
  if (order.status === "cancelled") return fail(409, "이미 취소된 주문입니다.");

  // 실장님은 본인이 포장 완료한 건을 되돌리는 용도로만 쓸 수 있다.
  if (role !== "brand" && order.status !== "shipped") {
    return fail(403, "포장 완료한 주문만 취소할 수 있습니다.");
  }

  const wasShipped = order.status === "shipped";
  const guard = { sql: "EXISTS (SELECT 1 FROM orders WHERE id = ? AND status <> 'cancelled')", binds: [id] };
  const stmts = [];

  // 이미 나간 물건이면 재고를 창고로 되돌린다.
  if (wasShipped) {
    for (const it of await getOrderItems(db, id)) {
      stmts.push(
        ...moveStockStmts(db, {
          productId: it.product_id, delta: it.qty, reason: "return",
          ref: order.order_no, actor: role, guard,
        })
      );
    }
    // 썼던 상자도 되돌린다.
    if (order.box_id) {
      stmts.push(
        ...movePackingStmts(db, {
          packingId: order.box_id, delta: 1, reason: "return", ref: order.order_no, actor: role, guard,
        })
      );
    }
  }
  stmts.push(
    guardedActivityStmt(
      db, role,
      `주문 ${order.order_no} (${order.customer}) 취소${wasShipped ? " · 재고·포장재 반환" : ""}`,
      guard,
      role === "warehouse" ? "order_cancel" : ""
    ),
    db
      .prepare("UPDATE orders SET status = 'cancelled', cancelled_at = ? WHERE id = ? AND status <> 'cancelled'")
      .bind(now(), id),
    bumpVersionStmt(db)
  );

  await db.batch(stmts);
  return json({ ok: true });
}

/* ------------------------------------------------------------------ 입고 */

async function createInbound({ db, body, role }) {
  const items = await normalizeItems(db, body.items);
  if (!items.length) return fail(400, "입고할 품목을 하나 이상 넣어주세요.");

  const ref = str(body.ref, 60) || `IB-${now().slice(0, 10)}`;
  const ts = now();
  const units = items.reduce((a, i) => a + i.qty, 0);
  const ibRef = "(SELECT id FROM inbounds ORDER BY id DESC LIMIT 1)";

  const stmts = [
    db
      .prepare("INSERT INTO inbounds (ref, supplier, date, note, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(ref, str(body.supplier, 120), str(body.date, 20) || ts.slice(0, 10), str(body.note, 500), ts),
  ];
  for (const it of items) {
    stmts.push(
      db.prepare(`INSERT INTO inbound_items (inbound_id, product_id, qty) VALUES (${ibRef}, ?, ?)`).bind(it.productId, it.qty),
      ...moveStockStmts(db, { productId: it.productId, delta: it.qty, reason: "inbound", ref, actor: role })
    );
  }
  stmts.push(
    activityStmt(db, role, `입고 ${ref} · ${items.length}개 품목 ${units}개 반영`),
    bumpVersionStmt(db)
  );

  await db.batch(stmts);
  return json({ ok: true }, 201);
}

/** 잘못 넣은 입고를 되돌린다. 이미 팔려나가서 재고가 모자라면 거절한다. */
async function voidInbound({ db, m, role }) {
  const id = Number(m[1]);
  const inbound = await getInbound(db, id);
  if (!inbound) return fail(404, "입고 기록을 찾을 수 없습니다.");
  if (inbound.voided_at) return fail(409, "이미 취소된 입고입니다.");

  const items = await getInboundItems(db, id);
  const short = [];
  for (const it of items) {
    const p = await getProduct(db, it.product_id);
    if (!p || p.stock < it.qty) {
      short.push(`${p ? p.name : it.product_id} (현재고 ${p ? p.stock : 0}개 / 되돌릴 ${it.qty}개)`);
    }
  }
  if (short.length) {
    return fail(409, `이미 나간 물량이 있어 되돌릴 수 없습니다: ${short.join(", ")}. 재고 조정으로 맞춰주세요.`);
  }

  const guard = { sql: "EXISTS (SELECT 1 FROM inbounds WHERE id = ? AND voided_at IS NULL)", binds: [id] };
  const stmts = [];
  for (const it of items) {
    stmts.push(
      ...moveStockStmts(db, {
        productId: it.product_id, delta: -it.qty, reason: "void",
        ref: inbound.ref, actor: role, guard,
      })
    );
  }
  stmts.push(
    guardedActivityStmt(db, role, `입고 ${inbound.ref} 취소 · 재고에서 되돌림`, guard),
    db.prepare("UPDATE inbounds SET voided_at = ? WHERE id = ? AND voided_at IS NULL").bind(now(), id),
    bumpVersionStmt(db)
  );

  await db.batch(stmts);
  return json({ ok: true });
}

/* ------------------------------------------------------------------ 제품 · 재고 */

async function createProduct({ db, body, role }) {
  const brand = str(body.brand, 80);
  const name = str(body.name, 200);
  if (!brand || !name) return fail(400, "브랜드와 제품명을 입력해주세요.");

  const id = str(body.id, 64) || `SKU${Date.now().toString(36).toUpperCase()}`;
  if (await getProduct(db, id)) return fail(409, "같은 바코드의 제품이 이미 있습니다.");

  const cost = Math.max(0, Number(body.cost) || 0);
  const sellPrice = Math.max(0, Number(body.sellPrice) || 0);
  const minStock = Math.max(0, Math.floor(Number(body.minStock) || 2));

  await db.batch([
    db
      .prepare("INSERT INTO products (id, brand, name, cost, sell_price, stock, min_stock, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)")
      .bind(id, brand, name, cost, sellPrice, minStock, now()),
    activityStmt(db, role, `제품 등록 · ${brand} ${name}`),
    bumpVersionStmt(db),
  ]);
  return json({ id }, 201);
}

async function adjustStock({ db, m, body, role }) {
  const product = await getProduct(db, decodeURIComponent(m[1]));
  if (!product) return fail(404, "제품을 찾을 수 없습니다.");

  const delta = Math.floor(Number(body.delta) || 0);
  if (!delta) return fail(400, "조정할 수량을 입력해주세요.");
  if (product.stock + delta < 0) return fail(409, "현재고보다 많이 뺄 수 없습니다.");

  // 사유 없이 재고를 건드리면 나중에 왜 그랬는지 알 수 없다.
  const reason = str(body.reason, 200);
  if (!reason) return fail(400, "조정 사유를 적어주세요.");

  const label = `재고 조정 · ${product.name} ${delta > 0 ? "+" : ""}${delta} → ${product.stock + delta} · ${reason}`;

  await db.batch([
    ...moveStockStmts(db, {
      productId: product.id, delta, reason: "adjust", ref: reason, actor: role,
      guard: { sql: "(SELECT stock FROM products WHERE id = ?) + ? >= 0", binds: [product.id, delta] },
    }),
    // 실장님이 만진 조정만 브랜드 알림 대상으로 표시한다.
    activityStmt(db, role, label, role === "warehouse" ? "stock_adjust" : ""),
    bumpVersionStmt(db),
  ]);
  return json({ ok: true });
}

/**
 * 판매가를 고친다. 재고를 건드리지 않으므로 원장(stock_moves)에는 남기지 않고,
 * 활동 기록에 이전 값을 함께 적는다 — 잘못 고쳤을 때 되돌릴 숫자가 로그에 남아야 한다.
 */
async function setSellPrice({ db, m, body, role }) {
  const product = await getProduct(db, decodeURIComponent(m[1]));
  if (!product) return fail(404, "제품을 찾을 수 없습니다.");

  const raw = Number(body.sellPrice);
  if (!Number.isFinite(raw) || raw < 0) return fail(400, "판매가를 다시 확인해주세요.");
  const sellPrice = Math.round(raw * 100) / 100;

  const before = product.sell_price || 0;
  if (before === sellPrice) return json({ ok: true });

  const money = (v) => (v ? `€${v.toFixed(2)}` : "없음");
  await db.batch([
    db.prepare("UPDATE products SET sell_price = ? WHERE id = ?").bind(sellPrice, product.id),
    activityStmt(db, role, `판매가 변경 · ${product.name} · ${money(before)} → ${money(sellPrice)}`),
    bumpVersionStmt(db),
  ]);
  return json({ ok: true });
}

/** 제품을 목록에서 감춘다. 기록은 남으므로 되살릴 수 있다. */
async function archiveProduct({ db, m, body, role }) {
  const product = await getProduct(db, decodeURIComponent(m[1]));
  if (!product) return fail(404, "제품을 찾을 수 없습니다.");

  const archived = body.archived === false ? 0 : 1;
  if (archived && product.stock !== 0) {
    return fail(409, `재고가 ${product.stock}개 남아 있습니다. 0으로 맞춘 뒤에 보관해주세요.`);
  }

  await db.batch([
    db.prepare("UPDATE products SET archived = ? WHERE id = ?").bind(archived, product.id),
    activityStmt(db, role, `제품 ${archived ? "보관" : "복원"} · ${product.brand} ${product.name}`),
    bumpVersionStmt(db),
  ]);
  return json({ ok: true });
}

async function productMoves({ db, m }) {
  const product = await getProduct(db, decodeURIComponent(m[1]));
  if (!product) return fail(404, "제품을 찾을 수 없습니다.");

  const { results } = await db
    .prepare(
      `SELECT delta, reason, ref, actor, created_at AS ts
         FROM stock_moves WHERE product_id = ? ORDER BY id DESC LIMIT 100`
    )
    .bind(product.id)
    .all();
  return json({ product: { id: product.id, name: product.name, stock: product.stock }, moves: results });
}

/** 제품에 붙여두는 쪽지. 조정 사유와 달리 계속 남아 양쪽 화면에 보인다. */
async function setProductMemo({ db, m, body, role }) {
  const product = await getProduct(db, decodeURIComponent(m[1]));
  if (!product) return fail(404, "제품을 찾을 수 없습니다.");

  const memo = str(body.memo, 300);
  // 민희님이 쓰면 본인만 보는 칸, 실장님이 쓰면 양쪽 다 보는 칸.
  const isBrand = role === "brand";
  const column = isBrand ? "memo_brand" : "memo";
  const before = isBrand ? product.memo_brand : product.memo;
  if (memo === before) return json({ ok: true });   // 바뀐 게 없으면 조용히 넘어간다

  const label = memo
    ? `${isBrand ? "내 메모" : "제품 메모"} · ${product.name} — "${memo}"`
    : `${isBrand ? "내 메모" : "제품 메모"} 지움 · ${product.name}`;

  await db.batch([
    db.prepare(`UPDATE products SET ${column} = ? WHERE id = ?`).bind(memo, product.id),
    activityStmt(db, role, label, isBrand ? "" : "stock_memo"),
    bumpVersionStmt(db),
  ]);
  return json({ ok: true });
}

/* ------------------------------------------------------------------ 포장재 */

/** 새 상자 규격 등록. 지금은 25×20×15 하나뿐이지만 나중에 다른 규격이 늘어날 수 있다. */
async function createPackingType({ db, body, role }) {
  const size = str(body.size, 60);
  if (!size) return fail(400, "상자 규격을 입력해주세요.");

  const stock = Math.max(0, Math.floor(Number(body.stock) || 0));

  await db.batch([
    db.prepare("INSERT INTO packing_materials (size, stock, created_at) VALUES (?, ?, ?)").bind(size, stock, now()),
    activityStmt(db, role, `포장재 종류 추가 · ${size} 상자 (${stock}개)`),
    bumpVersionStmt(db),
  ]);
  return json({ ok: true }, 201);
}

/** 포장재 수량 조정. 재고 조정과 완전히 같은 패턴 — 사유가 있어야 저장된다. */
async function adjustPacking({ db, m, body, role }) {
  const id = Number(m[1]);
  const box = await getPackingMaterial(db, id);
  if (!box) return fail(404, "포장 상자를 찾을 수 없습니다.");

  const delta = Math.floor(Number(body.delta) || 0);
  if (!delta) return fail(400, "조정할 수량을 입력해주세요.");
  if (box.stock + delta < 0) return fail(409, "현재 수량보다 많이 뺄 수 없습니다.");

  const reason = str(body.reason, 200);
  if (!reason) return fail(400, "조정 사유를 적어주세요.");

  const label = `포장재 조정 · ${box.size} 상자 ${delta > 0 ? "+" : ""}${delta} → ${box.stock + delta} · ${reason}`;

  await db.batch([
    ...movePackingStmts(db, {
      packingId: box.id, delta, reason: "adjust", ref: reason, actor: role,
      guard: { sql: "(SELECT stock FROM packing_materials WHERE id = ?) + ? >= 0", binds: [box.id, delta] },
    }),
    activityStmt(db, role, label, role === "warehouse" ? "stock_adjust" : ""),
    bumpVersionStmt(db),
  ]);
  return json({ ok: true });
}

/* ------------------------------------------------------------------ 복구 */

/** 재고 개수 점검 기록. 제품을 지정하면 그 제품의 입고 점검, 지정 안 하면 전체(발주 단위) 점검. */
async function createStockCheck({ db, body, role }) {
  const checker = str(body.checker, 20);
  if (checker !== "Lococo" && checker !== "ISTY") {
    return fail(400, "점검한 쪽을 Lococo 또는 ISTY 중에서 골라주세요.");
  }

  const inboundId = Math.floor(Number(body.inboundId)) || null;
  let batch = str(body.batch, 120);
  if (inboundId) {
    const ib = await getInbound(db, inboundId);
    if (!ib) return fail(404, "발주 건을 찾을 수 없습니다.");
    if (!batch) batch = ib.ref;
  }

  const productId = body.productId ? str(body.productId, 120) : null;
  let product = null;
  if (productId) {
    product = await getProduct(db, productId);
    if (!product) return fail(404, "제품을 찾을 수 없습니다.");
  }

  const checkerLabel = checker === "Lococo" ? "민희" : "실장님";
  const label = product
    ? `입고 점검 · ${product.name} · ${batch || "발주 미지정"} · ${checkerLabel}`
    : `재고 개수 점검 · ${batch || "발주 미지정"} · ${checkerLabel}`;

  await db.batch([
    db
      .prepare(
        `INSERT INTO stock_checks (inbound_id, product_id, batch, checker, memo, actor, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(inboundId, productId, batch, checker, str(body.memo, 500), role, now()),
    activityStmt(db, role, label, role === "warehouse" ? "stock_check" : ""),
    bumpVersionStmt(db),
  ]);
  return json({ ok: true }, 201);
}

/** 브랜드가 실장님 알림을 다 확인했다고 표시한다. */
async function seenAlerts({ db }) {
  const upTo = await markAlertsSeen(db);
  return json({ ok: true, upTo });
}

/** 전체를 JSON 한 덩어리로 내려준다. 언제든 받아두면 그 시점으로 되돌릴 근거가 된다. */
async function exportAll({ db }) {
  const tables = [
    "products", "inbounds", "inbound_items", "orders", "order_items", "stock_moves", "activity",
    "stock_checks", "packing_materials", "packing_moves",
  ];
  const dump = { exportedAt: now(), version: await getVersion(db) };
  for (const t of tables) {
    const { results } = await db.prepare(`SELECT * FROM ${t}`).all();
    dump[t] = results;
  }
  return json(dump, 200, {
    "content-disposition": `attachment; filename="isty-backup-${now().slice(0, 10)}.json"`,
  });
}

/** products.stock 을 원장 합계로 다시 맞춘다. */
async function reconcile({ db, role }) {
  const fixed = await reconcileStock(db);
  if (fixed.length) {
    await db.batch([
      activityStmt(db, role, `재고 재동기화 · ${fixed.length}개 품목 보정`),
      bumpVersionStmt(db),
    ]);
  }
  return json({ fixed });
}
