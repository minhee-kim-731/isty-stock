(function () {
  "use strict";

  var ROOT = document.getElementById("root");
  var S = null;                 // 서버에서 받은 최신 상태
  var ROLE = null;              // 'brand' | 'warehouse'
  var VIEW = null;              // 브랜드가 창고 화면을 미리 볼 때 쓰는 전환값
  var busy = false;

  var STATUS = {
    "new":       { label: "포장 대기중", cls: "accent" },
    "picking":   { label: "포장 중",     cls: "warn" },
    "shipped":   { label: "포장 완료",   cls: "ok" },
    "cancelled": { label: "취소",        cls: "neutral" },
  };
  var STATUS_ORDER = ["new", "picking", "shipped", "cancelled"];

  var UI = load("isty.ui", { tab: "dash", q: "", brand: "all", ofilter: "all" });
  if (UI.v !== 2) { UI.ofilter = "all"; UI.v = 2; }   // 포장 완료 건이 기본으로 안 보이던 문제
  var DRAFT = load("isty.draft.order", blankOrder());
  var IN = load("isty.draft.inbound", blankInbound());
  UI.openOrder = null;        // 상세 페이지는 새로고침하면 목록으로 돌아간다

  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function blankOrder() { return { orderNo: "", customer: "", dest: "", note: "", courier: "", tracking: "", visitNo: "", items: [] }; }
  function blankInbound() { return { ref: "", date: today(), supplier: "실리콘투", note: "", items: [] }; }
  function today() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  /* ------------------------------------------------------------ 유틸 */

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function prod(id) { for (var i = 0; i < S.products.length; i++) if (S.products[i].id === id) return S.products[i]; return null; }
  function pname(id) { var p = prod(id); return p ? p.name : id; }
  function pbrand(id) { var p = prod(id); return p ? p.brand : "—"; }
  function openOrders() { return S.orders.filter(function (o) { return o.status === "new" || o.status === "picking"; }); }
  function orderUnits(o) { return sum(o.items, function (i) { return i.qty; }); }
  function sum(a, f) { var n = 0; for (var i = 0; i < a.length; i++) n += f(a[i]); return n; }
  function stockState(p) {
    if (p.available <= 0) return { cls: "crit", label: "품절" };
    if (p.available <= p.minStock) return { cls: "warn", label: "부족" };
    return { cls: "ok", label: "정상" };
  }
  function fmtTime(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "—";
    return (d.getMonth() + 1) + "/" + d.getDate() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function fmtClock(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "—" : pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function isToday(iso) {
    if (!iso) return false;
    var d = new Date(iso), n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  }
  function brands() {
    var seen = {}, out = [];
    S.products.forEach(function (p) { if (!seen[p.brand]) { seen[p.brand] = 1; out.push(p.brand); } });
    return out.sort();
  }
  function toast(msg, bad) {
    var t = document.createElement("div");
    t.className = "toast" + (bad ? " bad" : "");
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, bad ? 5200 : 2600);
  }

  /* ------------------------------------------------------------ 서버 통신 */

  function api(method, path, body) {
    return fetch(path, {
      method: method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) {
          var err = new Error(data.error || "요청을 처리하지 못했습니다.");
          err.status = r.status;
          throw err;
        }
        return data;
      });
    });
  }

  function refresh() {
    return api("GET", "/api/state").then(function (state) {
      S = state;
      ROLE = state.role;
      render();
    });
  }

  /** 버튼 하나를 눌렀을 때: 서버에 보내고, 성공하면 최신 상태를 다시 받아 그린다. */
  function act(promise, okMsg) {
    if (busy) return;
    busy = true;
    render();
    promise
      .then(function () { return refresh(); })
      .then(function () { if (okMsg) toast(okMsg); })
      .catch(function (err) {
        if (err.status === 401) return showLogin();
        toast(err.message, true);
        return refresh();
      })
      .then(function () { busy = false; render(); });
  }

  /* ------------------------------------------------------------ 로그인 */

  function showLogin(message) {
    S = null;
    document.body.innerHTML = "";
    var host = document.createElement("div");
    host.className = "login";
    host.innerHTML =
      '<form id="loginform">'
      + '<div><h1>ISTY 재고 데스크</h1><p>받으신 접속 코드를 입력해주세요.</p></div>'
      + '<input type="password" inputmode="numeric" autocomplete="one-time-code" id="code" placeholder="접속 코드" maxlength="40" autofocus>'
      + '<div class="err" id="loginerr">' + esc(message || "") + "</div>"
      + '<button class="btn primary big wide" type="submit">들어가기</button>'
      + "</form>";
    document.body.appendChild(host);
    var form = document.getElementById("loginform");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var code = document.getElementById("code").value.trim();
      api("POST", "/api/login", { code: code })
        .then(function () { location.reload(); })
        .catch(function (err) { document.getElementById("loginerr").textContent = err.message; });
    });
  }

  /* ------------------------------------------------------------ 렌더 */

  function currentView() {
    if (ROLE === "warehouse") return "wh";
    return VIEW === "wh" ? "wh" : "brand";
  }

  function render() {
    if (!S) return;
    var isWh = currentView() === "wh";
    var oc = openOrders().length;
    var tabs = isWh
      ? [["fulfil", "출고 작업", oc], ["history", "처리 내역", 0], ["stock", "재고 조회", 0]]
      : [["dash", "현황", (S.alerts || []).length], ["orders", "주문", oc], ["stock", "재고", 0], ["inbound", "입고", 0]];
    if (!tabs.some(function (t) { return t[0] === UI.tab; })) UI.tab = tabs[0][0];

    // 실장님 화면에서는 상단바에 브랜드로 넘어가는 버튼을 두지 않는다.
    // (브랜드 계정이 미리보기 중일 때만 본문 위쪽 띠로 빠져나갈 길을 둔다)
    var roleSwitch = ROLE === "brand" && !isWh
      ? '<button class="btn ghost" data-act="view" data-v="wh">실장님 화면 보기</button>'
      : "";

    ROOT.innerHTML =
      '<header class="topbar"><div class="wrap">'
      + '<div class="brandmark"><b>ISTY 재고 데스크</b><span>' + (ROLE === "brand" ? "BRAND" : "WAREHOUSE") + "</span></div>"
      + '<div class="whoami">' + roleSwitch
      + '<button class="btn ghost" data-act="logout">로그아웃</button>'
      + "</div></div></header>"
      + '<nav class="tabs"><div class="wrap" role="tablist">'
      + tabs.map(function (t) {
          return '<button role="tab" data-act="tab" data-v="' + t[0] + '" aria-selected="' + (UI.tab === t[0]) + '">'
            + esc(t[1]) + (t[2] ? '<span class="badge">' + t[2] + "</span>" : "") + "</button>";
        }).join("")
      + "</div></nav>"
      + '<main><div class="wrap stack">'
      + (ROLE === "brand" && isWh
          ? '<div class="previewbar"><span>브랜드 계정으로 실장님 화면을 미리 보는 중입니다. '
            + "실장님께는 이 띠가 보이지 않습니다.</span>"
            + '<button class="btn" data-act="view" data-v="brand">브랜드 화면으로</button></div>'
          : "")
      + viewFor(UI.tab) + "</div></main>";

    save("isty.ui", UI);
  }

  function viewFor(tab) {
    // 주문 상세는 출고 작업·처리 내역 양쪽에서 열 수 있다.
    if (tab === "fulfil" || tab === "history") {
      if (UI.openOrder) {
        var open = S.orders.filter(function (o) { return o.id === UI.openOrder; })[0];
        if (open) return orderDetail(open);
        UI.openOrder = null;   // 사라진 주문이면 목록으로 되돌린다
      }
    }
    if (tab === "history") return viewHistory();
    if (tab === "dash") return viewDash();
    if (tab === "orders") return viewOrders();
    if (tab === "stock") return viewStock();
    if (tab === "inbound") return viewInbound();
    if (tab === "fulfil") return viewFulfil();
    return "";
  }

  function stat(label, value, unit, cls) {
    return '<div class="stat ' + (cls || "") + '"><span class="eyebrow">' + esc(label) + "</span>"
      + '<span class="v">' + esc(value) + (unit ? '<span class="u">' + esc(unit) + "</span>" : "") + "</span></div>";
  }
  function prodCell(p) {
    return '<div class="prod-brand">' + esc(p.brand) + "</div>"
      + '<div class="prod-name">' + esc(p.name) + "</div>"
      + '<div class="bc">' + esc(p.id) + "</div>";
  }
  /**
   * 메모 칸. 실장님 메모는 양쪽 다 보이고, 내 메모는 브랜드에게만 보인다.
   * 누르면 '내가 쓸 수 있는 메모'가 열린다 (브랜드=내 메모, 창고=실장님 메모).
   */
  function memoCell(p) {
    var mine = ROLE === "brand" ? (p.memoBrand || "") : (p.memo || "");
    var out = "";
    if (p.memo) {
      out += '<div class="memo-line shared"><span class="memo-tag">실장님</span>' + esc(p.memo) + "</div>";
    }
    if (ROLE === "brand" && p.memoBrand) {
      out += '<div class="memo-line own"><span class="memo-tag">나만</span>' + esc(p.memoBrand) + "</div>";
    }
    return out
      + '<button class="memo-btn' + (mine ? "" : " empty") + '" data-act="memo" data-id="' + esc(p.id) + '">'
      + (mine ? "메모 고치기" : "메모 달기") + "</button>";
  }

  /** 제품별 입고 점검 칩. 가장 최근 입고분을 점검했으면 완료로, 새 발주가 들어오면 다시 미점검으로 보인다. */
  function checkChip(p) {
    var label = p.checked ? "점검 완료 · " + (p.lastCheckBy === "Lococo" ? "민희" : "실장님") : "입고 점검";
    return '<button class="chip' + (p.checked ? " ok" : "") + '" aria-pressed="' + !!p.checked + '"'
      + ' data-act="check-open" data-id="' + esc(p.id) + '" style="padding:4px 10px;font-size:11.5px">'
      + esc(label) + "</button>";
  }

  /** 상태별 개수 칩. 누르면 그 상태만 걸러 본다. */
  function chip(value, label, count, cls) {
    return '<button class="chip ' + (cls || "") + '" data-act="ofilter" data-v="' + esc(value) + '"'
      + ' aria-pressed="' + (UI.ofilter === value) + '">'
      + esc(label) + '<span class="chip-n">' + count + "</span></button>";
  }

  function field(label, inner) { return '<label class="f"><span>' + esc(label) + "</span>" + inner + "</label>"; }
  function opt(v, label, cur) { return '<option value="' + esc(v) + '"' + (cur === v ? " selected" : "") + ">" + esc(label) + "</option>"; }

  function productSelect(id) {
    var by = {};
    S.products.forEach(function (p) { (by[p.brand] = by[p.brand] || []).push(p); });
    var html = '<select id="' + id + '">';
    brands().forEach(function (b) {
      html += '<optgroup label="' + esc(b) + '">';
      by[b].forEach(function (p) {
        html += '<option value="' + esc(p.id) + '">' + esc(p.name) + " (가용 " + p.available + ")</option>";
      });
      html += "</optgroup>";
    });
    return html + "</select>";
  }

  /**
   * 판매가 대비 마진. 스페인 IVA 21% 를 뺀 순매출 기준이라 표시가를 그대로 쓰지 않는다.
   * 여기 마진은 "매입가" 기준이다 — 가격 시트의 마진율은 3PL·픽업·포장재까지 더한
   * 랜딩코스트 기준이라 더 낮게 나오므로, 두 숫자를 같은 것으로 보면 안 된다.
   */
  function marginPct(p) {
    if (!p.sellPrice) return null;
    var net = p.sellPrice / 1.21;
    if (net <= 0) return null;
    return ((net - p.cost) / net) * 100;
  }

  function marginCell(p) {
    var m = marginPct(p);
    if (m === null) return '<span class="muted">—</span>';
    var cls = m >= 40 ? "ok" : m >= 20 ? "warn" : "bad";
    return '<span class="margin ' + cls + '">' + m.toFixed(0) + "%</span>";
  }

  /* ---------- 현황 ---------- */
  function viewDash() {
    var open = openOrders();
    var shippedToday = S.orders.filter(function (o) { return o.status === "shipped" && isToday(o.shippedAt); });
    var totalUnits = sum(S.products, function (p) { return p.stock; });
    var low = S.products.filter(function (p) { return p.available <= p.minStock; });
    var value = sum(S.products, function (p) { return p.stock * p.cost; });
    // 창고에 쌓인 재고를 다 팔면 들어오는 돈 (IVA 포함 표시가 기준).
    var retail = sum(S.products, function (p) { return p.stock * (p.sellPrice || 0); });
    var priced = S.products.filter(function (p) { return p.sellPrice > 0; }).length;
    var packingTotal = sum(S.packing || [], function (b) { return b.stock; });

    var h = "";

    if (S.alerts && S.alerts.length) {
      h += '<section class="card alertcard"><div class="card-h">'
        + "<h2>실장님이 처리한 일</h2>"
        + '<span class="sub">' + S.alerts.length + "건</span>"
        + '<div class="right"><button class="btn" data-act="alerts-seen"' + (busy ? " disabled" : "") + ">확인했어요</button></div>"
        + "</div><ul class=\"log\">"
        + S.alerts.map(function (a) {
            return "<li><time>" + fmtTime(a.ts) + "</time><span>" + esc(a.text) + "</span></li>";
          }).join("")
        + "</ul></section>";
    }

    h += '<section class="stats">'
      + stat("출고 대기", open.length, "건", open.length ? "hot" : "")
      + stat("오늘 포장 완료", shippedToday.length, "건", "")
      + stat("총 재고", totalUnits, "개", "")
      + stat("포장재", packingTotal, "개", packingTotal <= 0 ? "bad" : "")
      + stat("재고 부족", low.length, "SKU", low.length ? "bad" : "")
      + stat("재고 원가", "€" + value.toFixed(0), "", "")
      + stat("재고 판매가", "€" + retail.toFixed(0),
             priced < S.products.length ? "판매가 미설정 " + (S.products.length - priced) + "개 제외" : "", "")
      + "</section>";

    h += '<section class="card"><div class="card-h"><h2>재고 부족 · 품절</h2>'
      + '<span class="sub">가용 재고가 안전 수량 이하</span></div>';
    if (!low.length) {
      h += '<div class="empty">부족한 품목이 없습니다.</div>';
    } else {
      h += '<div class="scrollx"><table><thead><tr><th>제품</th><th class="r">현재고</th><th class="r">출고대기</th><th class="r">가용</th><th>상태</th></tr></thead><tbody>'
        + low.map(function (p) {
            var st = stockState(p);
            return "<tr><td>" + prodCell(p) + "</td>"
              + '<td class="r num">' + p.stock + "</td>"
              + '<td class="r num">' + p.allocated + "</td>"
              + '<td class="r qtybig' + (p.available < 0 ? " neg" : "") + '">' + p.available + "</td>"
              + '<td><span class="pill ' + st.cls + '">' + st.label + "</span></td></tr>";
          }).join("")
        + "</tbody></table></div>";
    }
    h += "</section>";

    h += '<section class="card"><div class="card-h"><h2>활동 기록</h2></div>'
      + (S.activity.length
          ? '<ul class="log">' + S.activity.slice(0, 14).map(function (l) {
              return "<li><time>" + fmtTime(l.ts) + '</time><span class="who">'
                + (l.actor === "warehouse" ? "창고" : "브랜드") + "</span><span>" + esc(l.text) + "</span></li>";
            }).join("") + "</ul>"
          : '<div class="empty">기록이 없습니다.</div>')
      + "</section>";

    h += '<section class="card"><div class="card-h"><h2>안전장치</h2>'
      + '<span class="sub">잘못 눌렀을 때 되돌리는 수단</span></div>'
      + '<div class="pad" style="display:flex;flex-direction:column;gap:12px">'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
      +   '<button class="btn" data-act="export">백업 내려받기</button>'
      +   '<button class="btn" data-act="reconcile">재고 재동기화</button>'
      + "</div>"
      + '<p style="font-size:12.5px;color:var(--muted);line-height:1.6;margin:0">'
      +   "백업은 지금 시점의 제품·주문·입고·재고 이력 전부를 JSON 파일 하나로 내려받습니다. "
      +   "재동기화는 재고 숫자가 이력의 합계와 어긋났을 때 이력 쪽에 맞춰 바로잡습니다. "
      +   "그보다 크게 잘못됐다면 데이터베이스 자체를 지난 30일 중 아무 시점으로나 되돌릴 수 있습니다 "
      +   "(README의 '되돌리기' 참고)."
      + "</p></div></section>";
    return h;
  }

  /* ---------- 주문 ---------- */
  function viewOrders() {
    var h = '<section class="card"><div class="card-h"><h2>주문 등록</h2>'
      + '<span class="sub">등록하면 실장님 화면에 바로 뜹니다</span></div><div class="pad stack">'
      + '<div class="grid2">'
      + field("주문번호", '<input type="text" data-d="orderNo" value="' + esc(DRAFT.orderNo) + '" placeholder="비우면 자동으로 매깁니다">')
      + field("고객명", '<input type="text" data-d="customer" value="' + esc(DRAFT.customer) + '" placeholder="예: Laura García">')
      + "</div>"
      + field("배송지", '<input type="text" data-d="dest" value="' + esc(DRAFT.dest) + '" placeholder="예: Calle Mayor 12, 28013 Madrid">')
      + '<div class="grid2">'
      +   field("택배회사", '<input type="text" data-d="courier" value="' + esc(DRAFT.courier) + '" placeholder="예: Correos">')
      +   field("송장번호", '<input type="text" data-d="tracking" value="' + esc(DRAFT.tracking) + '" placeholder="지금 몰라도 됩니다 — 실장님이 넣을 수 있어요">')
      + "</div>"
      + field("몇 번째 이용 고객인가요 (Lococo 이용 횟수)",
          '<input type="number" min="1" data-d="visitNo" value="' + esc(DRAFT.visitNo) + '" placeholder="예: 3 — 출고 인쇄물에 표시됩니다">')
      + field("실장님께 남길 메모", '<textarea data-d="note" placeholder="예: 샘플 2종 동봉, 완충재 넉넉히">' + esc(DRAFT.note) + "</textarea>")
      + '<div><span class="eyebrow">담을 제품</span><div class="itemrows" style="margin-top:6px">' + draftItemRows() + "</div></div>"
      + '<div class="grid2" style="align-items:end">'
      + field("제품 선택", productSelect("add-order-pid"))
      + '<div style="display:flex;gap:8px;align-items:end">'
      + '<label class="f" style="flex:1"><span>수량</span><input type="number" min="1" value="1" id="add-order-qty"></label>'
      + '<button class="btn" data-act="order-add-item">품목 추가</button></div>'
      + "</div>"
      + '<div style="display:flex;gap:8px;justify-content:flex-end;border-top:1px solid var(--line);padding-top:14px">'
      + '<button class="btn ghost" data-act="order-clear">초기화</button>'
      + '<button class="btn primary" data-act="order-submit"' + (DRAFT.items.length && !busy ? "" : " disabled") + ">"
      + (busy ? "등록 중…" : "주문 등록") + "</button></div>"
      + "</div></section>";

    var filtered = S.orders.filter(function (o) {
      if (UI.ofilter === "all") return true;
      if (UI.ofilter === "open") return o.status === "new" || o.status === "picking";  // 예전 저장값
      return o.status === UI.ofilter;
    });

    h += '<section class="card"><div class="card-h"><h2>주문 내역</h2>'
      + '<span class="sub">눌러서 걸러 볼 수 있습니다</span></div>'
      + '<div class="pad" style="padding-bottom:0"><div class="chips">'
      +   chip("all", "전체", S.orders.length, "")
      +   STATUS_ORDER.map(function (k) {
            return chip(k, STATUS[k].label,
              S.orders.filter(function (o) { return o.status === k; }).length, STATUS[k].cls);
          }).join("")
      + "</div></div>";

    if (!filtered.length) {
      h += '<div class="empty">해당하는 주문이 없습니다.</div>';
    } else {
      h += '<div class="scrollx"><table><thead><tr><th>주문</th><th>제품</th><th class="r">수량</th><th>상태</th><th>송장</th><th></th></tr></thead><tbody>'
        + filtered.map(function (o) {
            var st = STATUS[o.status];
            return "<tr>"
              + '<td><div class="num" style="font-weight:600">' + esc(o.orderNo) + "</div>"
              + '<div style="font-size:12px;color:var(--ink2)">' + esc(o.customer) + "</div>"
              + '<div class="bc">' + fmtTime(o.createdAt) + "</div></td>"
              + '<td style="min-width:220px">' + o.items.map(function (it) {
                  return '<div style="font-size:12.5px"><span class="num" style="font-weight:600">' + it.qty + "</span> · " + esc(it.name) + "</div>";
                }).join("") + "</td>"
              + '<td class="r qtybig">' + orderUnits(o) + "</td>"
              + '<td><span class="pill ' + st.cls + '">' + st.label + "</span>"
            +   (o.status === "shipped" && o.shippedAt
                  ? '<div class="bc" style="margin-top:3px">' + fmtTime(o.shippedAt) + "</div>" : "")
            + "</td>"
              + '<td class="bc">' + (o.tracking ? esc(o.courier) + " " + esc(o.tracking) : "—") + "</td>"
              + '<td class="r" style="white-space:nowrap">'
              +   '<button class="btn ghost" data-act="order-edit" data-id="' + o.id + '">수정</button> '
              +   (o.status !== "cancelled"
                    ? '<button class="btn ghost danger" data-act="order-cancel" data-id="' + o.id + '" data-no="' + esc(o.orderNo) + '" data-shipped="' + (o.status === "shipped") + '">취소</button>'
                    : "") + "</td></tr>";
          }).join("")
        + "</tbody></table></div>";
    }
    return h + "</section>";
  }

  function draftItemRows() {
    if (!DRAFT.items.length) return '<div class="empty" style="padding:18px">아직 담은 제품이 없습니다.</div>';
    return DRAFT.items.map(function (it, i) {
      var p = prod(it.productId);
      var a = p ? p.available : 0;
      return '<div class="itemrow"><div class="body">'
        + '<div class="prod-brand">' + esc(pbrand(it.productId)) + "</div>"
        + '<div class="prod-name">' + esc(pname(it.productId)) + "</div>"
        + (it.qty > a ? '<div class="short" style="color:var(--crit);font-size:11.5px;font-weight:600">재고 부족 · 가용 ' + a + "개</div>" : "")
        + "</div>"
        + '<span class="qtybig">' + it.qty + "</span>"
        + '<button class="btn ghost" data-act="order-del-item" data-i="' + i + '" aria-label="품목 삭제">✕</button></div>';
    }).join("");
  }

  /* ---------- 재고 ---------- */
  function viewStock() {
    var q = (UI.q || "").toLowerCase();
    var list = S.products.filter(function (p) {
      if (UI.brand !== "all" && p.brand !== UI.brand) return false;
      if (!q) return true;
      return (p.name + " " + p.brand + " " + p.id).toLowerCase().indexOf(q) >= 0;
    });
    var canManage = ROLE === "brand" && currentView() === "brand";  // 단가·이력·보관
    var canAdjust = true;                                            // 조정은 실장님도

    var h = '<section class="card"><div class="card-h"><h2>재고</h2>'
      + '<span class="sub">' + list.length + " / " + S.products.length + " SKU</span>"
      + '<div class="right filters">'
      + '<input type="text" data-act="q" value="' + esc(UI.q) + '" placeholder="제품·브랜드·바코드 검색">'
      + '<select data-act="brandf">' + opt("all", "전체 브랜드", UI.brand)
      + brands().map(function (b) { return opt(b, b, UI.brand); }).join("") + "</select>"
      + '<button class="btn" data-act="check-open">개수 점검</button>'
      + "</div></div>";

    if (!list.length) return h + '<div class="empty">검색 결과가 없습니다.</div></section>';

    if (!canManage) {
      h += '<div class="pad" style="padding-bottom:0"><div class="banner info">'
        + "실물과 숫자가 다르면 −/+ 로 고쳐주세요. 왜 고쳤는지 한 줄 적으면 민희님께 바로 전달됩니다. "
        + "그동안 이 제품이 어떻게 드나들었는지는 오른쪽 이력에서 볼 수 있습니다."
        + "</div></div>";
    }

    h += '<div class="scrollx"><table><thead><tr>'
      + '<th>제품</th><th class="r">최초재고</th><th class="r">소진</th>'
      + '<th class="r">현재고</th><th class="r">출고대기</th><th class="r">가용</th>'
      + "<th>메모</th>"
      + (canManage ? '<th class="r">매입가</th><th class="r">판매가</th><th class="r">마진</th>' : "")
      + (canAdjust ? '<th class="r">조정</th>' : "")
      + "<th></th>"
      + "</tr></thead><tbody>"
      + list.map(function (p) {
          var consumed = p.received - p.stock;
          var consumedCell = String(consumed);
          // 판매/씨딩 구분은 서버가 role !== "brand" 일 때 아예 빼고 내려보낸다 — 실장님껜 안 보임.
          if (ROLE === "brand" && (p.soldConsumed || p.seedingConsumed)) {
            consumedCell += '<div class="consumed-split">판매 ' + p.soldConsumed + ' · 씨딩 ' + p.seedingConsumed + "</div>";
          }
          return "<tr>"
            + "<td>" + prodCell(p) + "</td>"
            + '<td class="r num">' + p.received + "</td>"
            + '<td class="r num">' + consumedCell + "</td>"
            + '<td class="r num">' + p.stock + "</td>"
            + '<td class="r num">' + p.allocated + "</td>"
            + '<td class="r qtybig' + (p.available < 0 ? " neg" : "") + '">' + p.available + "</td>"
            + '<td class="memo-cell">' + memoCell(p) + "</td>"
            + (canManage
                ? '<td class="r num">€' + p.cost.toFixed(2) + "</td>"
                  + '<td class="r"><input class="pricein num" type="number" min="0" step="0.01" inputmode="decimal"'
                    + ' data-price-for="' + esc(p.id) + '" value="' + (p.sellPrice ? p.sellPrice.toFixed(2) : "")
                    + '" placeholder="—" aria-label="판매가"></td>'
                  + '<td class="r num">' + marginCell(p) + "</td>"
                : "")
            + (canAdjust
                ? '<td class="r"><div class="stepper">'
                  + '<button class="btn ghost" data-act="adj" data-id="' + esc(p.id) + '" data-v="-1" aria-label="재고 빼기">−</button>'
                  + '<button class="btn ghost" data-act="adj" data-id="' + esc(p.id) + '" data-v="1" aria-label="재고 더하기">+</button>'
                  + "</div></td>"
                : "")
            + '<td class="r" style="white-space:nowrap">'
            +   checkChip(p) + " "
            +   '<button class="linkish" data-act="moves" data-id="' + esc(p.id) + '">이력</button>'
            +   (canManage
                  ? ' <button class="linkish" data-act="archive" data-id="' + esc(p.id)
                    + '" data-name="' + esc(p.name) + '">보관</button>'
                  : "")
            + "</td>"
            + "</tr>";
        }).join("")
      + "</tbody></table></div></section>";

    h += checksSection();
    h += packingSection(canManage);
    return h;
  }

  /** 포장재(상자) 재고. 브랜드·창고 화면 양쪽(재고/재고 조회 탭)에 똑같이 보인다. */
  function packingSection(canManage) {
    var list = S.packing || [];
    var h = '<section class="card"><div class="card-h"><h2>포장재</h2>'
      + '<span class="sub">포장 완료 시 자동으로 빠집니다</span></div>';

    if (!list.length) {
      h += '<div class="empty">등록된 포장재가 없습니다.</div>';
    } else {
      h += '<div class="scrollx"><table><thead><tr><th>규격</th><th class="r">재고</th><th class="r">조정</th></tr></thead><tbody>'
        + list.map(function (b) {
            return "<tr><td>" + esc(b.size) + " 상자</td>"
              + '<td class="r qtybig' + (b.stock <= 0 ? " neg" : "") + '">' + b.stock + "</td>"
              + '<td class="r"><div class="stepper">'
              + '<button class="btn ghost" data-act="padj" data-id="' + b.id + '" data-v="-1" aria-label="포장재 빼기">−</button>'
              + '<button class="btn ghost" data-act="padj" data-id="' + b.id + '" data-v="1" aria-label="포장재 더하기">+</button>'
              + "</div></td></tr>";
          }).join("")
        + "</tbody></table></div>";
    }

    if (canManage) {
      h += '<div class="pad" style="padding-top:0">'
        + '<details><summary style="cursor:pointer;font-size:13px;color:var(--muted);padding:4px 0">새 상자 규격 추가</summary>'
        + '<div class="grid2" style="margin-top:10px;align-items:end">'
        +   field("규격", '<input type="text" id="np-box-size" placeholder="예: 30×25×20">')
        +   '<div style="display:flex;gap:8px;align-items:end">'
        +     '<label class="f" style="flex:1"><span>초기 수량</span><input type="number" min="0" value="0" id="np-box-stock"></label>'
        +     '<button class="btn" data-act="new-packing">등록</button></div>'
        + "</div></details></div>";
    }
    return h + "</section>";
  }

  function packingById(id) {
    var list = S.packing || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /** 개수 점검 기록. 브랜드·창고 양쪽에 똑같이 보인다. */
  function checksSection() {
    var list = S.checks || [];
    var h = '<section class="card"><div class="card-h"><h2>개수 점검 기록</h2>'
      + '<span class="sub">양쪽 화면에 똑같이 남습니다</span></div>';

    if (!list.length) {
      return h + '<div class="empty">아직 점검 기록이 없습니다. 재고를 세어보고 기록을 남겨보세요.</div></section>';
    }

    h += '<div class="scrollx"><table><thead><tr>'
      + "<th>일시</th><th>제품</th><th>발주</th><th>검수자</th><th>메모</th>"
      + "</tr></thead><tbody>"
      + list.map(function (c) {
          return "<tr>"
            + '<td class="bc">' + fmtTime(c.ts) + "</td>"
            + "<td>" + (c.productName
                ? '<div class="prod-brand">' + esc(c.productBrand) + "</div>"
                  + '<div class="prod-name" style="font-size:13px">' + esc(c.productName) + "</div>"
                : '<span class="bc">전체</span>') + "</td>"
            + '<td class="num">' + esc(c.batch || "—") + "</td>"
            + '<td><span class="pill ' + (c.checker === "Lococo" ? "accent" : "neutral") + '">'
            +   esc(c.checker === "Lococo" ? "민희" : "실장님") + "</span></td>"
            + '<td style="font-size:12.5px;color:var(--ink2);line-height:1.5">' + esc(c.memo || "—") + "</td>"
            + "</tr>";
        }).join("")
      + "</tbody></table></div></section>";
    return h;
  }

  var CHECK_PRODUCT = null;  // 지금 점검 중인 productId (없으면 전체 점검)

  /** 점검 창 열기 — 제품을 지정하면 그 제품이 포함된 발주만, 아니면 전체 발주를 보여준다. */
  function openCheck(productId) {
    CHECK_PRODUCT = productId || null;
    var p = CHECK_PRODUCT ? prod(CHECK_PRODUCT) : null;

    document.getElementById("check-title").textContent = p ? "입고 점검" : "재고 개수 점검";
    var box = document.getElementById("check-product");
    if (p) {
      document.getElementById("check-brand").textContent = p.brand;
      document.getElementById("check-name").textContent = p.name;
      box.hidden = false;
    } else {
      box.hidden = true;
    }

    var ibs = S.inbounds || [];
    // 오래된 것부터 1차, 2차… 번호를 매긴다.
    var numbered = ibs.slice().sort(function (a, b) { return a.id - b.id; })
      .map(function (ib, i) { return { ib: ib, no: i + 1 }; });
    // 제품을 지정했으면 그 제품이 실제로 들어있는 발주만 고를 수 있게 거른다.
    if (p) {
      numbered = numbered.filter(function (x) {
        return x.ib.items.some(function (it) { return it.productId === p.id; });
      });
    }

    var sel = document.getElementById("check-batch");
    if (!numbered.length) {
      sel.innerHTML = '<option value="">발주 기록 없음</option>';
    } else {
      sel.innerHTML = numbered.map(function (x) {
        var label = x.no + "차 발주 · " + x.ib.ref;
        return '<option value="' + x.ib.id + '" data-label="' + esc(label) + '">'
          + esc(label + " (" + x.ib.date + ")") + "</option>";
      }).join("");
      sel.value = String(numbered[numbered.length - 1].ib.id);
    }
    document.getElementById("check-who").value = ROLE === "brand" ? "Lococo" : "ISTY";
    document.getElementById("check-memo").value = "";
    document.getElementById("check-err").textContent = "";
    document.getElementById("check").showModal();
  }

  function saveCheck() {
    var sel = document.getElementById("check-batch");
    var o = sel.options[sel.selectedIndex];
    var checker = document.getElementById("check-who").value;
    if (!checker) {
      document.getElementById("check-err").textContent = "점검한 쪽을 골라주세요.";
      return;
    }
    var payload = {
      inboundId: sel.value ? Number(sel.value) : null,
      batch: o ? o.getAttribute("data-label") || "" : "",
      checker: checker,
      memo: document.getElementById("check-memo").value.trim(),
      productId: CHECK_PRODUCT || null,
    };
    document.getElementById("check").close();
    CHECK_PRODUCT = null;
    act(api("POST", "/api/stock-checks", payload), "점검 기록을 남겼습니다.");
  }

  /* ---------- 입고 ---------- */
  function viewInbound() {
    var h = '<section class="card"><div class="card-h"><h2>입고 등록</h2>'
      + '<span class="sub">실리콘투 발주분이 도착하면 여기서 재고에 더합니다</span></div><div class="pad stack">'
      + '<div class="grid2">'
      + field("PI / 발주번호", '<input type="text" data-n="ref" value="' + esc(IN.ref) + '" placeholder="예: PI00786492">')
      + field("공급처", '<input type="text" data-n="supplier" value="' + esc(IN.supplier) + '">')
      + field("입고일", '<input type="date" data-n="date" value="' + esc(IN.date) + '">')
      + "</div>"
      + field("메모", '<input type="text" data-n="note" value="' + esc(IN.note) + '" placeholder="예: 2차 주문 · 파손 1개 제외">')
      + '<div><span class="eyebrow">입고 품목</span><div class="itemrows" style="margin-top:6px">' + inboundItemRows() + "</div></div>"
      + '<div class="grid2" style="align-items:end">'
      + field("제품 선택", productSelect("add-in-pid"))
      + '<div style="display:flex;gap:8px;align-items:end">'
      + '<label class="f" style="flex:1"><span>수량</span><input type="number" min="1" value="1" id="add-in-qty"></label>'
      + '<button class="btn" data-act="in-add-item">품목 추가</button></div>'
      + "</div>"
      + '<details><summary style="cursor:pointer;font-size:13px;color:var(--muted);padding:4px 0">카탈로그에 없는 새 제품 추가</summary>'
      + '<div class="grid2" style="margin-top:10px;align-items:end">'
      + field("브랜드", '<input type="text" id="np-brand" placeholder="예: SKIN1004">')
      + field("제품명", '<input type="text" id="np-name" placeholder="예: Madagascar Centella Ampoule 100ml">')
      + field("바코드", '<input type="text" id="np-code" placeholder="8809...">')
      + '<div style="display:flex;gap:8px;align-items:end">'
      + '<label class="f" style="flex:1"><span>매입가 (EUR)</span><input type="number" min="0" step="0.01" id="np-cost" value="0"></label>'
      + '<label class="f" style="flex:1"><span>판매가 (EUR)</span><input type="number" min="0" step="0.01" id="np-sell" value="0"></label>'
      + '<button class="btn" data-act="new-product">제품 등록</button></div>'
      + "</div></details>"
      + '<div style="display:flex;gap:8px;justify-content:flex-end;border-top:1px solid var(--line);padding-top:14px">'
      + '<button class="btn ghost" data-act="in-clear">초기화</button>'
      + '<button class="btn primary" data-act="in-submit"' + (IN.items.length && !busy ? "" : " disabled") + ">재고에 반영</button></div>"
      + "</div></section>";

    h += '<section class="card"><div class="card-h"><h2>입고 이력</h2></div>';
    if (!S.inbounds.length) {
      h += '<div class="empty">입고 기록이 없습니다.</div>';
    } else {
      h += '<div class="scrollx"><table><thead><tr><th>발주번호</th><th>공급처</th><th>입고일</th><th class="r">품목</th><th class="r">수량</th><th>메모</th><th></th></tr></thead><tbody>'
        + S.inbounds.map(function (ib) {
            var voided = !!ib.voidedAt;
            return '<tr' + (voided ? ' style="opacity:.55"' : "") + '>'
              + '<td class="num" style="font-weight:600">' + esc(ib.ref)
              +   (voided ? ' <span class="pill neutral">취소됨</span>' : "") + "</td>"
              + "<td>" + esc(ib.supplier) + "</td>"
              + '<td class="num">' + esc(ib.date) + "</td>"
              + '<td class="r num">' + ib.items.length + "</td>"
              + '<td class="r qtybig">' + sum(ib.items, function (i) { return i.qty; }) + "</td>"
              + '<td style="color:var(--muted);font-size:12.5px">' + esc(ib.note) + "</td>"
              + '<td class="r">' + (voided ? ""
                  : '<button class="btn ghost danger" data-act="void-inbound" data-id="' + ib.id
                    + '" data-ref="' + esc(ib.ref) + '">되돌리기</button>') + "</td></tr>";
          }).join("")
        + "</tbody></table></div>";
    }
    return h + "</section>";
  }

  function inboundItemRows() {
    if (!IN.items.length) return '<div class="empty" style="padding:18px">입고할 품목을 추가하세요.</div>';
    return IN.items.map(function (it, i) {
      return '<div class="itemrow"><div class="body">'
        + '<div class="prod-brand">' + esc(pbrand(it.productId)) + "</div>"
        + '<div class="prod-name">' + esc(pname(it.productId)) + "</div></div>"
        + '<span class="qtybig">+' + it.qty + "</span>"
        + '<button class="btn ghost" data-act="in-del-item" data-i="' + i + '" aria-label="품목 삭제">✕</button></div>';
    }).join("");
  }

  /* ---------- 출고 작업 ---------- */
  function viewFulfil() {
    var open = openOrders();
    var doneToday = S.orders.filter(function (o) { return o.status === "shipped" && isToday(o.shippedAt); });
    var packingTotal = sum(S.packing || [], function (b) { return b.stock; });

    var h = '<section class="stats">'
      + stat("처리할 주문", open.length, "건", open.length ? "hot" : "")
      + stat("담을 제품", sum(open, orderUnits), "개", "")
      + stat("오늘 포장 완료", doneToday.length, "건", "")
      + stat("포장재", packingTotal, "개", packingTotal <= 0 ? "bad" : "")
      + "</section>";

    if (!open.length) {
      h += '<section class="card"><div class="empty">지금 처리할 주문이 없습니다. 새 주문이 등록되면 여기에 표시됩니다.</div></section>';
    } else {
      h += '<div class="card-h" style="border:0;padding:0 2px"><h2>처리 대기 ' + open.length + "건</h2>"
        + '<div class="right"><button class="btn" data-act="copy-list">출고 목록 복사</button></div></div>'
        + '<div class="orderlist">' + open.map(orderRow).join("") + "</div>";
    }

    // 오늘 처리한 건은 '처리 내역' 탭에서 날짜별로 봅니다. 여기는 할 일만 둡니다.
    if (doneToday.length) {
      h += '<div class="donehint">오늘 ' + doneToday.length
        + '건을 포장했습니다. <button class="linkish" data-act="tab" data-v="history">처리 내역에서 보기</button></div>';
    }
    return h;
  }

  /** 처리가 끝난 주문을 날짜별로 묶어 보여준다. */
  function viewHistory() {
    var done = S.orders.filter(function (o) {
      return o.status === "shipped" || o.status === "cancelled";
    });

    if (!done.length) {
      return '<section class="card"><div class="empty">'
        + "아직 처리한 주문이 없습니다. 포장을 마치면 여기에 날짜별로 쌓입니다."
        + "</div></section>";
    }

    var todayKey = today();
    var weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    var packed = done.filter(function (o) { return o.status === "shipped"; });

    var h = '<section class="stats">'
      + stat("오늘 처리", done.filter(function (o) { return doneKey(o) === todayKey; }).length, "건", "")
      + stat("최근 7일", done.filter(function (o) { return doneKey(o) >= weekAgo; }).length, "건", "")
      + stat("포장 완료", packed.length, "건", "")
      + stat("취소", done.length - packed.length, "건", "")
      + "</section>";

    // 날짜별로 묶는다 (최신 날짜가 위)
    var groups = {};
    done.forEach(function (o) {
      var k = doneKey(o);
      (groups[k] = groups[k] || []).push(o);
    });
    var days = Object.keys(groups).sort().reverse();

    days.forEach(function (k) {
      var list = groups[k].sort(function (a, b) {
        return String(doneAt(b)).localeCompare(String(doneAt(a)));
      });
      var units = sum(list.filter(function (o) { return o.status === "shipped"; }), orderUnits);
      h += '<div class="dayhead"><h2>' + esc(fmtDay(k)) + "</h2>"
        + '<span class="sub">' + list.length + "건"
        + (units ? " · 제품 " + units + "개" : "") + "</span></div>"
        + '<div class="orderlist">'
        + list.map(function (o) { return orderRow(o, true); }).join("")
        + "</div>";
    });
    return h;
  }

  function doneAt(o) { return o.status === "shipped" ? o.shippedAt : o.cancelledAt || o.createdAt; }
  function doneKey(o) { return String(doneAt(o)).slice(0, 10); }

  function fmtDay(key) {
    var d = new Date(key + "T00:00:00");
    if (isNaN(d)) return key;
    var names = ["일", "월", "화", "수", "목", "금", "토"];
    var label = d.getMonth() + 1 + "월 " + d.getDate() + "일 (" + names[d.getDay()] + ")";
    if (key === today()) return label + " · 오늘";
    return label;
  }

  /** 목록의 한 줄. 주문자 이름과 품목 개수만 보여준다. */
  function orderRow(o, showTime) {
    var st = STATUS[o.status];
    var picked = o.items.filter(function (it) { return it.picked; }).length;
    var isOpen = o.status === "new" || o.status === "picking";

    return '<article class="orow" data-s="' + o.status + '" data-act="open-order" data-id="' + o.id + '" tabindex="0" role="button">'
      + '<div class="orow-main">'
      +   '<div class="orow-name">' + esc(o.customer) + "</div>"
      +   '<div class="orow-sub"><span class="num">' + esc(o.orderNo) + "</span>"
      +     '<span class="dot">·</span>' + o.items.length + "개 품목"
      +     '<span class="dot">·</span>' + orderUnits(o) + "개"
      +     (showTime ? '<span class="dot">·</span><span class="num">' + fmtClock(doneAt(o)) + "</span>" : "")
      +     (o.tracking ? '<span class="dot">·</span><span class="bc">' + esc(o.tracking) + "</span>" : "")
      +   "</div>"
      + "</div>"
      + '<div class="orow-side">'
      +   (isOpen && picked ? '<span class="progress">' + picked + " / " + o.items.length + " 담음</span>" : "")
      +   '<span class="pill ' + st.cls + '">' + st.label + "</span>"
      +   (o.status === "new"
            ? '<button class="btn primary" data-act="confirm" data-id="' + o.id + '"' + (busy ? " disabled" : "") + ">주문 수락</button>"
            : "")
      +   '<span class="chev" aria-hidden="true">›</span>'
      + "</div></article>";
  }

  /** 주문 상세. 메모와 담아야 할 품목이 여기 있다. */
  function orderDetail(o) {
    var st = STATUS[o.status];
    var done = o.items.filter(function (it) { return it.picked; }).length;
    var all = done === o.items.length;
    var closed = o.status === "shipped" || o.status === "cancelled";
    var waiting = o.status === "new";   // 아직 수락 전 — 품목을 만질 수 없다

    var h = '<div class="detail-top">'
      + '<button class="btn ghost" data-act="close-order">‹ 목록으로</button>'
      + '<span class="pill ' + st.cls + '">' + st.label + "</span>"
      + '<button class="btn ghost" style="margin-left:auto" data-act="print-order" data-id="' + o.id + '">인쇄</button>'
      + "</div>";

    h += '<section class="card"><div class="pad detail-head">'
      + '<div class="detail-name">' + esc(o.customer) + "</div>"
      + '<div class="detail-no num">' + esc(o.orderNo) + "</div>"
      + (o.dest ? '<div class="detail-addr">' + esc(o.dest) + "</div>" : "")
      + (o.visitNo ? '<div class="bc" style="margin-top:4px">Lococo 이용 ' + o.visitNo + "번째</div>" : "")
      + "</div>"
      + (o.note
          ? '<div class="pad" style="padding-top:0"><div class="ocard-note" style="margin:0">'
            + '<b>메모</b><br>' + esc(o.note) + "</div></div>"
          : "")
      + "</section>";

    if (o.courier || o.tracking) {
      h += '<section class="card trackcard"><div class="pad">'
        + '<div class="track-grid">'
        +   '<div><span class="eyebrow">택배회사</span>'
        +     '<div class="track-courier">' + esc(o.courier || "—") + "</div></div>"
        +   '<div><span class="eyebrow">송장번호</span>'
        +     '<div class="track-no">' + esc(o.tracking || "—") + "</div></div>"
        + "</div>"
        + (o.tracking
            ? '<button class="btn" data-act="copy-tracking" data-v="' + esc(o.tracking) + '">송장번호 복사</button>'
            : "")
        + "</div></section>";
    }

    if (waiting) {
      h += '<section class="card"><div class="pad" style="display:flex;flex-direction:column;gap:12px">'
        + '<div class="banner warn">아직 수락하지 않은 주문입니다. '
        +   "수락해야 제품을 담기 시작할 수 있습니다.</div>"
        + '<button class="btn primary big wide" data-act="confirm" data-id="' + o.id + '"'
        +   (busy ? " disabled" : "") + ">주문 수락</button>"
        + "</div></section>";
    }

    h += '<section class="card"><div class="card-h"><h2>담을 제품</h2>'
      + '<span class="sub">'
      +   (waiting ? "주문 수락 후에 체크할 수 있습니다" : done + " / " + o.items.length + " 담음")
      + "</span></div>"
      + '<div class="picklist">'
      + o.items.map(function (it) {
          return '<label class="pickrow' + (it.picked ? " done" : "") + (waiting ? " locked" : "") + '">'
            + '<input type="checkbox" data-act="pick" data-id="' + o.id + '" data-pid="' + esc(it.productId) + '"'
            +   (it.picked ? " checked" : "") + (busy || closed || waiting ? " disabled" : "") + ">"
            + '<span class="body">'
            +   '<span class="prod-brand">' + esc(it.brand) + "</span>"
            +   '<span class="prod-name" style="display:block">' + esc(it.name) + "</span>"
            +   '<span class="bc">' + esc(it.productId) + "</span>"
            +   (it.qty > it.stock ? '<span class="short" style="display:block">창고 재고 ' + it.stock + "개 — 부족</span>" : "")
            + "</span>"
            + '<span class="q">' + it.qty + "</span></label>";
        }).join("")
      + "</div></section>";

    if (!closed && !waiting) {
      var boxList = S.packing || [];
      var hasBox = boxList.some(function (b) { return b.stock > 0; });
      h += '<section class="card"><div class="pad" style="display:flex;flex-direction:column;gap:10px">'
        + '<div class="ship-fields">'
        +   '<input type="text" id="cr-' + o.id + '" value="' + esc(o.courier) + '" placeholder="택배사 (선택)">'
        +   '<input type="text" id="tr-' + o.id + '" value="' + esc(o.tracking) + '" placeholder="송장번호 (선택)">'
        + "</div>"
        + field("어느 상자에 담았나요", '<select id="box-' + o.id + '">'
            + (boxList.length
                ? boxList.map(function (b) {
                    return '<option value="' + b.id + '"' + (b.stock <= 0 ? " disabled" : "") + ">"
                      + esc(b.size) + " 상자 (재고 " + b.stock + "개)" + "</option>";
                  }).join("")
                : '<option value="">등록된 포장재 없음</option>')
            + "</select>")
        + '<button class="btn primary big wide" data-act="ready" data-id="' + o.id + '"'
        +   (all && hasBox && !busy ? "" : " disabled") + ">"
        +   (!all ? "전부 담으면 포장 완료" : !hasBox ? "포장재가 없습니다" : "포장 완료") + "</button>"
        + '<p style="font-size:12px;color:var(--muted);margin:0;text-align:center">'
        +   "누르면 재고·포장재에서 빠지고 민희님께 알림이 갑니다.</p>"
        + "</div></section>";
    } else if (o.status === "shipped") {
      h += '<section class="card"><div class="pad" style="display:flex;flex-direction:column;gap:12px">'
        + '<div style="font-size:13px;color:var(--muted)">'
        +   "포장 완료 " + fmtTime(o.shippedAt)
        +   (o.tracking ? " · " + esc(o.courier) + " " + esc(o.tracking) : "")
        +   (o.boxSize ? " · " + esc(o.boxSize) + " 상자" : "")
        + "</div>"
        + (o.pickedUpAt
            ? '<div class="banner ok" style="margin:0">택배 픽업 완료 · ' + fmtTime(o.pickedUpAt) + "</div>"
            : '<button class="btn primary wide" data-act="pickup" data-id="' + o.id + '"'
              +   (busy ? " disabled" : "") + ">택배 픽업 완료</button>"
              + '<p style="font-size:12px;color:var(--muted);margin:0;text-align:center">'
              +   "택배 기사가 실제로 가져가면 눌러주세요. 민희님께 알림이 갑니다.</p>")
        + '<button class="btn danger wide" data-act="order-cancel" data-id="' + o.id
        +   '" data-no="' + esc(o.orderNo) + '" data-shipped="true"' + (busy ? " disabled" : "") + ">"
        +   "주문 취소</button>"
        + '<p style="font-size:12px;color:var(--muted);margin:0;text-align:center">'
        +   "잘못 눌렀으면 여기서 되돌립니다. 뺐던 재고가 창고로 돌아옵니다.</p>"
        + "</div></section>";
    }
    return h;
  }

  /* ------------------------------------------------------------ 이벤트 */

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act]");
    if (!el) return;
    var a = el.getAttribute("data-act");

    if (a === "view") {
      VIEW = el.getAttribute("data-v");
      UI.tab = VIEW === "wh" ? "fulfil" : "dash";
      UI.openOrder = null;
      render();
      return;
    }
    if (a === "tab") {
      UI.tab = el.getAttribute("data-v");
      UI.openOrder = null;   // 탭을 바꾸면 상세는 닫는다
      window.scrollTo(0, 0);
      render();
      return;
    }
    if (a === "logout") { api("POST", "/api/logout").then(function () { location.reload(); }); return; }

    if (a === "order-add-item") { addDraftItem(); return; }
    if (a === "order-del-item") { DRAFT.items.splice(+el.getAttribute("data-i"), 1); save("isty.draft.order", DRAFT); render(); return; }
    if (a === "order-clear") { DRAFT = blankOrder(); save("isty.draft.order", DRAFT); render(); return; }
    if (a === "order-submit") { submitOrder(); return; }
    if (a === "order-cancel") { cancelOrder(el); return; }
    if (a === "order-edit") { openOrderEdit(Number(el.getAttribute("data-id"))); return; }
    if (a === "orderedit-save") { saveOrderEdit(); return; }
    if (a === "oe-add-item") { addOrderEditItem(); return; }
    if (a === "oe-del-item") { delOrderEditItem(+el.getAttribute("data-i")); return; }

    if (a === "in-add-item") { addInboundItem(); return; }
    if (a === "in-del-item") { IN.items.splice(+el.getAttribute("data-i"), 1); save("isty.draft.inbound", IN); render(); return; }
    if (a === "in-clear") { IN = blankInbound(); save("isty.draft.inbound", IN); render(); return; }
    if (a === "in-submit") { submitInbound(); return; }
    if (a === "new-product") { addProduct(); return; }
    if (a === "new-packing") { addPackingType(); return; }

    if (a === "adj") { openAdjust("product", el.getAttribute("data-id"), +el.getAttribute("data-v")); return; }
    if (a === "padj") { openAdjust("packing", Number(el.getAttribute("data-id")), +el.getAttribute("data-v")); return; }
    if (a === "adj-step") { stepAdjust(+el.getAttribute("data-v")); return; }
    if (a === "adj-save") { saveAdjust(); return; }
    if (a === "memo") { openMemo(el.getAttribute("data-id")); return; }
    if (a === "memo-save") { saveMemo(false); return; }
    if (a === "memo-clear") { saveMemo(true); return; }
    if (a === "check-open") { openCheck(el.getAttribute("data-id") || null); return; }
    if (a === "check-save") { saveCheck(); return; }
    if (a === "moves") { showMoves(el.getAttribute("data-id")); return; }
    if (a === "open-order") { UI.openOrder = Number(el.getAttribute("data-id")); window.scrollTo(0, 0); render(); return; }
    if (a === "close-order") { UI.openOrder = null; render(); return; }
    if (a === "confirm") { e.stopPropagation(); act(api("POST", "/api/orders/" + el.getAttribute("data-id") + "/start"), "주문을 수락했습니다."); return; }
    if (a === "ready") { ready(el.getAttribute("data-id")); return; }
    if (a === "pickup") { pickup(el.getAttribute("data-id")); return; }
    if (a === "print-order") { printOrder(Number(el.getAttribute("data-id"))); return; }
    if (a === "alerts-seen") { act(api("POST", "/api/notifications/seen")); return; }
    if (a === "copy-list") { copyList(); return; }
    if (a === "copy-tracking") { copyText(el.getAttribute("data-v"), "송장번호를 복사했습니다."); return; }
    if (a === "ofilter") { UI.ofilter = el.getAttribute("data-v"); render(); return; }
    if (a === "void-inbound") { voidInbound(el); return; }
    if (a === "archive") { archiveProduct(el); return; }
    if (a === "export") { exportBackup(); return; }
    if (a === "reconcile") { reconcile(); return; }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var row = e.target.closest && e.target.closest('[data-act="open-order"]');
    if (!row) return;
    e.preventDefault();
    UI.openOrder = Number(row.getAttribute("data-id"));
    window.scrollTo(0, 0);
    render();
  });

  document.addEventListener("change", function (e) {
    var pin = e.target.closest && e.target.closest("[data-price-for]");
    if (pin) { saveSellPrice(pin); return; }

    var el = e.target.closest("[data-act]");
    if (!el) return;
    var a = el.getAttribute("data-act");
    if (a === "pick") {
      act(api("POST", "/api/orders/" + el.getAttribute("data-id") + "/pick", {
        productId: el.getAttribute("data-pid"), picked: el.checked,
      }));
      return;
    }
    if (a === "brandf") { UI.brand = el.value; render(); return; }
  });

  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.hasAttribute && t.hasAttribute("data-d")) { DRAFT[t.getAttribute("data-d")] = t.value; save("isty.draft.order", DRAFT); return; }
    if (t.hasAttribute && t.hasAttribute("data-n")) { IN[t.getAttribute("data-n")] = t.value; save("isty.draft.inbound", IN); return; }
    if (t.getAttribute && t.getAttribute("data-act") === "q") {
      UI.q = t.value; save("isty.ui", UI);
      clearTimeout(t._t);
      t._t = setTimeout(function () {
        var pos = t.selectionStart;
        render();
        var n = ROOT.querySelector('[data-act="q"]');
        if (n) { n.focus(); n.setSelectionRange(pos, pos); }
      }, 220);
    }
  });

  /* ------------------------------------------------------------ 동작 */

  function addDraftItem() {
    var pid = document.getElementById("add-order-pid").value;
    var qty = Math.max(1, parseInt(document.getElementById("add-order-qty").value, 10) || 1);
    var found = false;
    DRAFT.items.forEach(function (it) { if (it.productId === pid) { it.qty += qty; found = true; } });
    if (!found) DRAFT.items.push({ productId: pid, qty: qty });
    save("isty.draft.order", DRAFT); render();
  }
  function submitOrder() {
    if (!DRAFT.items.length) return;
    var payload = {
      orderNo: DRAFT.orderNo, customer: DRAFT.customer, dest: DRAFT.dest,
      note: DRAFT.note, courier: DRAFT.courier, tracking: DRAFT.tracking,
      visitNo: DRAFT.visitNo, items: DRAFT.items,
    };
    if (busy) return;
    busy = true; render();
    api("POST", "/api/orders", payload)
      .then(function (r) {
        DRAFT = blankOrder(); save("isty.draft.order", DRAFT);
        return refresh().then(function () { toast("주문 " + r.orderNo + " 을 등록했습니다."); });
      })
      .catch(function (err) {
        if (err.status === 401) return showLogin();
        toast(err.message, true);
      })
      .then(function () { busy = false; render(); });
  }
  function cancelOrder(el) {
    var shipped = el.getAttribute("data-shipped") === "true";
    var msg = "주문 " + el.getAttribute("data-no") + " 을 취소할까요?\n"
      + (shipped ? "포장 완료된 건이라 뺐던 재고가 창고로 되돌아갑니다." : "잡아둔 재고가 풀립니다.");
    if (!confirm(msg)) return;
    UI.openOrder = null;   // 취소했으면 상세에 남아 있을 이유가 없다
    act(api("POST", "/api/orders/" + el.getAttribute("data-id") + "/cancel"), "취소했습니다.");
  }

  var ORDER_EDIT = null;        // 지금 수정 중인 주문 id
  var ORDER_EDIT_ITEMS = [];    // 그 주문의 담을 제품 초안 [{productId, qty}]
  var ORDER_EDIT_SHIPPED = false;  // 이미 포장 완료된 주문인가 (안내 문구용)

  /** 주문 정보 수정 창. 취소된 주문은 품목 칸을 아예 숨긴다 (서버도 똑같이 막는다). */
  function openOrderEdit(id) {
    var o = S.orders.filter(function (x) { return x.id === id; })[0];
    if (!o) return;
    ORDER_EDIT = id;
    ORDER_EDIT_ITEMS = o.items.map(function (it) { return { productId: it.productId, qty: it.qty }; });
    ORDER_EDIT_SHIPPED = o.status === "shipped";
    document.getElementById("oe-orderno").textContent = o.orderNo;
    document.getElementById("oe-customer").value = o.customer;
    document.getElementById("oe-dest").value = o.dest;
    document.getElementById("oe-courier").value = o.courier;
    document.getElementById("oe-tracking").value = o.tracking;
    document.getElementById("oe-visitno").value = o.visitNo || "";
    document.getElementById("oe-note").value = o.note;
    document.getElementById("oe-err").textContent = "";

    var isCancelled = o.status === "cancelled";
    document.getElementById("oe-items-section").hidden = isCancelled;
    document.getElementById("oe-cancelled-hint").hidden = !isCancelled;
    document.getElementById("oe-items-hint").textContent = ORDER_EDIT_SHIPPED
      ? "이미 포장 완료된 주문이라, 여기서 바꾸면 실제 재고도 그 차이만큼 같이 맞춰집니다."
      : "";
    if (!isCancelled) paintOrderEditItems();
    document.getElementById("orderedit").showModal();
  }

  function paintOrderEditItems() {
    var box = document.getElementById("oe-itemrows");
    box.innerHTML = !ORDER_EDIT_ITEMS.length
      ? '<div class="empty" style="padding:18px">담을 제품이 없습니다.</div>'
      : ORDER_EDIT_ITEMS.map(function (it, i) {
          return '<div class="itemrow"><div class="body">'
            + '<div class="prod-brand">' + esc(pbrand(it.productId)) + "</div>"
            + '<div class="prod-name">' + esc(pname(it.productId)) + "</div></div>"
            + '<span class="qtybig">' + it.qty + "</span>"
            + '<button class="btn ghost" data-act="oe-del-item" data-i="' + i + '" aria-label="품목 삭제">✕</button></div>';
        }).join("");
    document.getElementById("oe-pid-wrap").innerHTML = productSelect("oe-add-pid");
  }

  function addOrderEditItem() {
    var pid = document.getElementById("oe-add-pid").value;
    var qty = Math.max(1, parseInt(document.getElementById("oe-add-qty").value, 10) || 1);
    var found = false;
    ORDER_EDIT_ITEMS.forEach(function (it) { if (it.productId === pid) { it.qty += qty; found = true; } });
    if (!found) ORDER_EDIT_ITEMS.push({ productId: pid, qty: qty });
    paintOrderEditItems();
  }

  function delOrderEditItem(i) {
    ORDER_EDIT_ITEMS.splice(i, 1);
    paintOrderEditItems();
  }

  function saveOrderEdit() {
    if (!ORDER_EDIT) return;
    var customer = document.getElementById("oe-customer").value.trim();
    if (!customer) {
      document.getElementById("oe-err").textContent = "고객명을 입력해주세요.";
      return;
    }
    var itemsVisible = !document.getElementById("oe-items-section").hidden;
    if (itemsVisible && !ORDER_EDIT_ITEMS.length) {
      document.getElementById("oe-err").textContent = "담을 제품을 하나 이상 넣어주세요.";
      return;
    }
    var payload = {
      customer: customer,
      dest: document.getElementById("oe-dest").value,
      courier: document.getElementById("oe-courier").value,
      tracking: document.getElementById("oe-tracking").value,
      visitNo: document.getElementById("oe-visitno").value,
      note: document.getElementById("oe-note").value,
    };
    if (itemsVisible) payload.items = ORDER_EDIT_ITEMS;
    var id = ORDER_EDIT;
    document.getElementById("orderedit").close();
    ORDER_EDIT = null;
    act(api("POST", "/api/orders/" + id + "/edit", payload), "주문 정보를 수정했습니다.");
  }
  function addInboundItem() {
    var pid = document.getElementById("add-in-pid").value;
    var qty = Math.max(1, parseInt(document.getElementById("add-in-qty").value, 10) || 1);
    var found = false;
    IN.items.forEach(function (it) { if (it.productId === pid) { it.qty += qty; found = true; } });
    if (!found) IN.items.push({ productId: pid, qty: qty });
    save("isty.draft.inbound", IN); render();
  }
  function submitInbound() {
    if (!IN.items.length || busy) return;
    var payload = { ref: IN.ref, supplier: IN.supplier, date: IN.date, note: IN.note, items: IN.items };
    busy = true; render();
    api("POST", "/api/inbounds", payload)
      .then(function () {
        IN = blankInbound(); save("isty.draft.inbound", IN);
        return refresh().then(function () { toast("입고를 재고에 반영했습니다."); });
      })
      .catch(function (err) { if (err.status === 401) return showLogin(); toast(err.message, true); })
      .then(function () { busy = false; render(); });
  }
  function addProduct() {
    var body = {
      brand: document.getElementById("np-brand").value,
      name: document.getElementById("np-name").value,
      id: document.getElementById("np-code").value,
      cost: document.getElementById("np-cost").value,
      sellPrice: document.getElementById("np-sell").value,
    };
    act(api("POST", "/api/products", body), "제품을 등록했습니다.");
  }
  function addPackingType() {
    var body = {
      size: document.getElementById("np-box-size").value,
      stock: document.getElementById("np-box-stock").value,
    };
    act(api("POST", "/api/packing", body), "포장재 규격을 등록했습니다.");
  }
  /**
   * 표 안에서 판매가를 고치면 바로 저장한다. 값이 그대로면 서버를 부르지 않는다 —
   * 칸을 눌렀다 빠져나오기만 해도 change 가 뜨기 때문.
   */
  function saveSellPrice(input) {
    var id = input.getAttribute("data-price-for");
    var p = prod(id);
    if (!p || busy) return;

    var raw = input.value.trim();
    var next = raw === "" ? 0 : Number(raw);
    if (!isFinite(next) || next < 0) { toast("판매가를 다시 확인해주세요.", true); render(); return; }
    next = Math.round(next * 100) / 100;
    if (next === (p.sellPrice || 0)) return;

    act(api("POST", "/api/products/" + encodeURIComponent(id) + "/price", { sellPrice: next }),
        p.name + " 판매가를 " + (next ? "€" + next.toFixed(2) : "미설정") + "으로 바꿨습니다.");
  }

  var MEMO = null;  // 지금 메모를 쓰는 중인 productId

  function openMemo(id) {
    var p = prod(id);
    if (!p) return;
    MEMO = id;
    var isBrand = ROLE === "brand";
    var mine = isBrand ? (p.memoBrand || "") : (p.memo || "");

    document.getElementById("memo-brand").textContent = p.brand;
    document.getElementById("memo-name").textContent = p.name;
    document.getElementById("memo-label").textContent = isBrand ? "내 메모 (나만 봅니다)" : "메모";
    document.getElementById("memo-hint").textContent = isBrand
      ? "이 메모는 민희님 화면에만 보입니다. 실장님께는 보이지 않습니다."
      : "이 메모는 민희님께도 그대로 보입니다.";

    // 브랜드에게는 실장님이 남긴 메모를 읽기 전용으로 함께 보여준다.
    var other = document.getElementById("memo-other");
    if (isBrand && p.memo) {
      other.textContent = "실장님 메모: " + p.memo;
      other.hidden = false;
    } else {
      other.hidden = true;
    }

    var box = document.getElementById("memo-text");
    box.value = mine;
    document.getElementById("memo-clear").hidden = !mine;
    document.getElementById("memo").showModal();
    setTimeout(function () { box.focus(); }, 50);
  }

  function saveMemo(clear) {
    if (!MEMO) return;
    var text = clear ? "" : document.getElementById("memo-text").value.trim();
    var id = MEMO;
    document.getElementById("memo").close();
    MEMO = null;
    act(api("POST", "/api/products/" + encodeURIComponent(id) + "/memo", { memo: text }),
        clear ? "메모를 지웠습니다." : "메모를 저장했습니다.");
  }

  var ADJ = null;   // 지금 조정 중인 { kind: 'product'|'packing', id, delta }

  function adjustRecord(kind, id) { return kind === "packing" ? packingById(id) : prod(id); }

  function openAdjust(kind, id, delta) {
    var rec = adjustRecord(kind, id);
    if (!rec) return;
    ADJ = { kind: kind, id: id, delta: delta };
    var isPacking = kind === "packing";
    document.getElementById("adjust-brand").textContent = isPacking ? "포장재" : rec.brand;
    document.getElementById("adjust-name").textContent = isPacking ? rec.size + " 상자" : rec.name;
    document.getElementById("adjust-current").textContent = rec.stock;
    var memoLine = document.getElementById("adjust-memo");
    var memoText = isPacking ? "" : rec.memo;
    memoLine.textContent = memoText ? "메모: " + memoText : "";
    memoLine.hidden = !memoText;
    document.getElementById("adjust-reason").value = "";
    paintAdjust();
    document.getElementById("adjust").showModal();
    setTimeout(function () { document.getElementById("adjust-reason").focus(); }, 50);
  }

  function stepAdjust(by) {
    if (!ADJ) return;
    var rec = adjustRecord(ADJ.kind, ADJ.id);
    var next = ADJ.delta + by;
    if (rec && rec.stock + next < 0) return;     // 없는 수량은 뺄 수 없다
    ADJ.delta = next;
    paintAdjust();
  }

  function paintAdjust() {
    var rec = adjustRecord(ADJ.kind, ADJ.id);
    var after = rec.stock + ADJ.delta;
    document.getElementById("adjust-delta").textContent = (ADJ.delta > 0 ? "+" : "") + ADJ.delta;
    document.getElementById("adjust-delta").className = "adjust-delta " + (ADJ.delta < 0 ? "neg" : ADJ.delta > 0 ? "pos" : "zero");
    document.getElementById("adjust-after").textContent = after;
    document.getElementById("adjust-save").disabled = ADJ.delta === 0;
  }

  function saveAdjust() {
    if (!ADJ || !ADJ.delta) return;
    var reason = document.getElementById("adjust-reason").value.trim();
    if (!reason) {
      document.getElementById("adjust-err").textContent = "왜 조정하는지 적어주세요.";
      document.getElementById("adjust-reason").focus();
      return;
    }
    document.getElementById("adjust-err").textContent = "";
    var payload = { delta: ADJ.delta, reason: reason };
    var kind = ADJ.kind, id = ADJ.id;
    document.getElementById("adjust").close();
    ADJ = null;
    var url = kind === "packing"
      ? "/api/packing/" + id + "/adjust"
      : "/api/products/" + encodeURIComponent(id) + "/adjust";
    act(api("POST", url, payload), kind === "packing" ? "포장재 수량을 조정했습니다." : "재고를 조정했습니다.");
  }
  function ready(id) {
    var cr = document.getElementById("cr-" + id);
    var tr = document.getElementById("tr-" + id);
    var box = document.getElementById("box-" + id);
    if (busy) return;
    if (box && !box.value) { toast("포장 상자를 선택해주세요.", true); return; }
    busy = true; render();
    api("POST", "/api/orders/" + id + "/ship", {
      courier: cr ? cr.value : "", tracking: tr ? tr.value : "",
      boxId: box && box.value ? Number(box.value) : null,
    })
      .then(function () {
        UI.openOrder = null;              // 마감했으면 목록으로 돌아간다
        return refresh().then(function () { toast("준비 완료. 재고에서 빠졌습니다."); });
      })
      .catch(function (err) { if (err.status === 401) return showLogin(); toast(err.message, true); })
      .then(function () { busy = false; render(); });
  }
  function pickup(id) {
    act(api("POST", "/api/orders/" + id + "/pickup"), "택배 픽업 완료로 표시했습니다.");
  }
  /**
   * 주문 내역을 스페인 고객용 종이 한 장으로 인쇄한다. 화면엔 안 보이고 인쇄할 때만 나타난다
   * (styles.css 의 #print-slip / @media print 참고).
   */
  function printOrder(id) {
    var o = S.orders.filter(function (x) { return x.id === id; })[0];
    if (!o) return;

    var slip = document.getElementById("print-slip");
    slip.innerHTML =
      '<img class="slip-logo" src="/lococo-logo.png" alt="Lococo">'
      + '<div class="slip-title">Nº de pedido</div>'
      + '<div class="slip-value">' + esc(o.orderNo) + "</div>"
      + '<div class="slip-title">Cliente</div>'
      + '<div class="slip-value">' + esc(o.customer) + "</div>"
      + '<div class="slip-title">Dirección de envío</div>'
      + '<div class="slip-value">' + esc(o.dest || "—") + "</div>"
      + (o.visitNo
          ? '<div class="slip-visit">¡Gracias por tu confianza! Esta es tu compra número <b>'
            + o.visitNo + "</b> con Lococo.</div>"
          : "");

    // 로고 이미지가 그려질 때까지 기다렸다가 인쇄 창을 연다 (안 그러면 로고가 빈 채로 뜬다).
    var img = slip.querySelector("img");
    var printed = false;
    function go() { if (printed) return; printed = true; window.print(); }
    if (img.complete) go();
    else { img.addEventListener("load", go); img.addEventListener("error", go); }
    setTimeout(go, 800);
  }

  function showMoves(id) {
    api("GET", "/api/products/" + encodeURIComponent(id) + "/moves").then(function (data) {
      var reasons = { inbound: "입고", shipment: "출고", adjust: "조정", return: "반환" };
      document.getElementById("moves-title").textContent = data.product.name;
      document.getElementById("moves-body").innerHTML = data.moves.length
        ? '<table><thead><tr><th>시각</th><th>구분</th><th class="r">변동</th><th>참조</th></tr></thead><tbody>'
          + data.moves.map(function (m) {
              return '<tr><td class="bc">' + fmtTime(m.ts) + "</td>"
                + "<td>" + esc(reasons[m.reason] || m.reason) + "</td>"
                + '<td class="r qtybig' + (m.delta < 0 ? " neg" : "") + '">' + (m.delta > 0 ? "+" : "") + m.delta + "</td>"
                + '<td class="bc">' + esc(m.ref) + "</td></tr>";
            }).join("")
          + "</tbody></table>"
        : '<div class="empty">기록이 없습니다.</div>';
      document.getElementById("moves").showModal();
    }).catch(function (err) { toast(err.message, true); });
  }
  /** 잘못 넣은 입고를 되돌린다. 이미 팔려나갔으면 서버가 막아준다. */
  function voidInbound(el) {
    var ref = el.getAttribute("data-ref");
    if (!confirm("입고 " + ref + " 을 되돌릴까요?\n\n이 입고로 들어온 수량이 재고에서 다시 빠집니다.\n이미 팔려나간 물량이 있으면 되돌릴 수 없습니다.")) return;
    act(api("POST", "/api/inbounds/" + el.getAttribute("data-id") + "/void"), "입고를 되돌렸습니다.");
  }

  /** 안 쓰는 제품을 목록에서 감춘다. 기록은 남으므로 되살릴 수 있다. */
  function archiveProduct(el) {
    var name = el.getAttribute("data-name");
    if (!confirm(name + " 을 목록에서 감출까요?\n\n지우는 게 아니라 감추는 것이고, 재고 이력은 그대로 남습니다.")) return;
    act(api("POST", "/api/products/" + encodeURIComponent(el.getAttribute("data-id")) + "/archive", { archived: true }), "보관했습니다.");
  }

  /** 지금 시점의 전체 데이터를 JSON 파일로 내려받는다. */
  function exportBackup() {
    toast("백업을 만드는 중…");
    api("GET", "/api/export")
      .then(function (dump) {
        var blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "isty-backup-" + today() + ".json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        toast("백업 파일을 내려받았습니다.");
      })
      .catch(function (err) { toast(err.message, true); });
  }

  /** 재고 숫자가 이력 합계와 어긋났으면 이력 쪽에 맞춘다. */
  function reconcile() {
    if (!confirm("재고 숫자를 이력의 합계에 맞춰 다시 계산할까요?")) return;
    if (busy) return;
    busy = true; render();
    api("POST", "/api/reconcile")
      .then(function (r) {
        return refresh().then(function () {
          if (!r.fixed.length) { toast("어긋난 품목이 없습니다. 그대로 둡니다."); return; }
          var lines = r.fixed.map(function (f) { return f.name + ": " + f.stock + " → " + f.ledger; });
          toast(r.fixed.length + "개 품목을 보정했습니다. " + lines.slice(0, 2).join(", "));
        });
      })
      .catch(function (err) { if (err.status === 401) return showLogin(); toast(err.message, true); })
      .then(function () { busy = false; render(); });
  }

  function copyText(text, okMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { toast(okMsg); },
        function () { toast("복사하지 못했습니다.", true); }
      );
    } else {
      toast("이 브라우저에서는 복사할 수 없습니다.", true);
    }
  }

  function copyList() {
    var lines = openOrders().map(function (o) {
      return "■ " + o.orderNo + " / " + o.customer + (o.dest ? "\n   " + o.dest : "")
        + (o.note ? "\n   메모: " + o.note : "") + "\n"
        + o.items.map(function (it) { return "   - " + it.name + " × " + it.qty + "  (" + it.productId + ")"; }).join("\n");
    });
    var text = "ISTY 출고 요청 " + today() + "\n\n" + (lines.join("\n\n") || "출고할 주문 없음");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { toast("출고 목록을 복사했습니다."); },
        function () { toast("복사하지 못했습니다.", true); }
      );
    } else {
      toast("이 브라우저에서는 복사할 수 없습니다.", true);
    }
  }

  /* ------------------------------------------------------------ 시작 · 폴링 */

  refresh().catch(function (err) {
    if (err.status === 401) showLogin();
    else toast(err.message, true);
  });

  setInterval(function () {
    if (!S || busy) return;
    // 탭이 안 보이면 물어보지 않는다 (Workers 무료 한도를 아끼기 위해).
    if (document.hidden) return;
    // 입력 중일 때 화면을 갈아끼우면 타이핑이 끊기므로 건너뛴다.
    var f = document.activeElement;
    if (f && /^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName)) return;
    api("GET", "/api/version")
      .then(function (r) { if (r.version !== S.version) return refresh(); })
      .catch(function () {});
  }, 10000);

  // 탭으로 돌아오면 곧바로 최신 상태를 맞춘다.
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && S && !busy) refresh().catch(function () {});
  });
})();
