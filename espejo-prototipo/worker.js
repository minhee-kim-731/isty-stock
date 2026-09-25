/* ==========================================================================
   ESPEJO · Worker
   --------------------------------------------------------------------------
   Sirve los ficheros estáticos y expone tres rutas.

   GET  /api/capacidad  → ¿está configurado el envío de informes?
   POST /api/lead       → alta de correo. Guarda SÓLO datos de contacto y si
                          acepta novedades (consentimiento 1/0).
   POST /api/informe    → envía el informe por correo. NO LO GUARDA.
   GET  /admin          → página de consulta del listado (código ADMIN_CODE).
   GET  /api/admin/leads, POST /api/admin/borrar → listado y bajas.

   La distinción entre las dos últimas es deliberada. Los índices de una piel
   son dato de salud a efectos del RGPD (art. 9). Enviarlos a quien los ha
   generado, con su consentimiento explícito y sin conservar copia, es una
   cosa; almacenarlos en una base de datos es otra muy distinta, con
   obligaciones que un puesto de feria no puede sostener. Aquí el informe
   atraviesa este Worker y no deja rastro: ni en D1, ni en logs, ni en KV.

   La página pregunta primero por /api/capacidad y adapta lo que promete. Sin
   proveedor configurado no dice que vaya a enviar nada — prometer un envío
   que no ocurre no es sólo una mentira, es una finalidad de tratamiento
   falsa.
   ========================================================================== */

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_HTML = 400 * 1024;   // un informe ronda los 30 kB; esto es techo, no objetivo

function json(datos, estado) {
  return new Response(JSON.stringify(datos), {
    status: estado || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function mismoOrigen(request, url) {
  const origen = request.headers.get('origin');
  return !origen || new URL(origen).host === url.host;
}

/* Resend: una sola llamada, sin SDK. Si algún día se cambia de proveedor,
   esta función es lo único que hay que tocar. */
async function enviar(env, para, asunto, html) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'authorization': 'Bearer ' + env.RESEND_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      from: env.REMITENTE || 'Espejo <espejo@lococo.beauty>',
      to: [para],
      subject: asunto,
      html: html
    })
  });
  if (!r.ok) throw new Error('proveedor ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

/* ----------------------------------------------------------- admin
   El listado de correos es de Lococo, no del puesto: se consulta desde una
   página aparte con un código guardado como secreto (ADMIN_CODE), nunca en
   el repositorio. La comparación es de tiempo constante para no filtrar el
   código carácter a carácter. Sin secreto configurado, la ruta no existe. */
async function autorizado(request, env) {
  if (!env.ADMIN_CODE) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(request.headers.get('x-admin-code') || '')),
    crypto.subtle.digest('SHA-256', enc.encode(env.ADMIN_CODE))
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

const ADMIN_HTML = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Espejo · 이메일 명단</title>
<style>
:root{ color-scheme:light dark; --bg:#f6f7f9; --fg:#14181f; --mut:#667085; --line:#e4e7ec; --card:#fff; --acc:#2966FF; --bad:#d92d20; }
@media (prefers-color-scheme:dark){ :root{ --bg:#0b0f14; --fg:#e6ebf2; --mut:#8a94a6; --line:#1f2733; --card:#121821; } }
*{ box-sizing:border-box; }
body{ margin:0; background:var(--bg); color:var(--fg); font:15px/1.5 -apple-system,BlinkMacSystemFont,'Pretendard','Apple SD Gothic Neo',system-ui,sans-serif; letter-spacing:-.01em; }
main{ max-width:860px; margin:0 auto; padding:32px 16px 60px; }
h1{ font-size:22px; margin:0 0 4px; }
p.mut{ color:var(--mut); margin:0 0 20px; font-size:13.5px; }
.card{ background:var(--card); border:1px solid var(--line); border-radius:12px; padding:18px; }
input{ font:inherit; padding:10px 12px; border:1px solid var(--line); border-radius:8px; background:transparent; color:inherit; width:100%; max-width:320px; }
button{ font:inherit; font-weight:600; padding:10px 16px; border-radius:8px; border:1px solid var(--acc); background:var(--acc); color:#fff; cursor:pointer; }
button.sec{ background:transparent; color:var(--acc); }
button.x{ padding:4px 10px; font-size:12.5px; border-color:var(--line); background:transparent; color:var(--mut); }
button.x:hover{ border-color:var(--bad); color:var(--bad); }
.fila{ display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
table{ width:100%; border-collapse:collapse; font-size:14px; }
th,td{ text-align:left; padding:9px 8px; border-bottom:1px solid var(--line); }
th{ font-size:12.5px; color:var(--mut); font-weight:600; }
td.n{ font-variant-numeric:tabular-nums; color:var(--mut); white-space:nowrap; }
.err{ color:var(--bad); font-size:13.5px; margin-top:10px; }
.wrap{ overflow-x:auto; }
</style></head><body><main>
<h1>Espejo 이메일 명단</h1>
<p class="mut">부스에서 이메일을 입력한 방문자 전체입니다. 소식 메일은 <b>마케팅 동의 = 예</b>인 사람에게만 보낼 수 있습니다. 분석 결과나 사진은 저장되지 않습니다.</p>
<div class="card" id="login">
  <form id="f" class="fila">
    <input id="code" type="password" placeholder="관리자 코드" autocomplete="current-password">
    <button>열기</button>
  </form>
  <p class="err" id="err" hidden></p>
</div>
<div id="lista" hidden>
  <div class="fila" style="justify-content:space-between;margin-bottom:12px">
    <strong id="cuenta"></strong>
    <div class="fila"><button class="sec" id="csv">CSV 다운로드</button><button class="sec" id="salir">잠그기</button></div>
  </div>
  <div class="card wrap"><table>
    <thead><tr><th>이메일</th><th>마케팅 동의</th><th>언어</th><th>등록 시각 (마드리드)</th><th></th></tr></thead>
    <tbody id="tb"></tbody>
  </table></div>
  <p class="mut" style="margin-top:12px">수신거부 요청(sales@lococo.beauty)이 오면 해당 줄의 삭제를 눌러주세요. 삭제는 되돌릴 수 없으니 필요하면 먼저 CSV를 받아두세요.</p>
</div>
<script>
var datos = [];
var codigo = '';
try { codigo = sessionStorage.getItem('espejo.admin') || ''; } catch (e) {}
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function hora(iso){ try { return new Date(iso).toLocaleString('ko-KR', { timeZone:'Europe/Madrid', dateStyle:'short', timeStyle:'short' }); } catch (e) { return iso; } }
function pedir(ruta, op){ op = op || {}; op.headers = Object.assign({ 'x-admin-code': codigo }, op.headers || {}); return fetch(ruta, op); }
function error(t){ var e = document.getElementById('err'); e.textContent = t; e.hidden = false; }
function cargar(){
  return pedir('/api/admin/leads').then(function(r){
    if (r.status === 401) throw new Error('코드가 맞지 않습니다.');
    if (!r.ok) throw new Error('불러오지 못했습니다 (' + r.status + ').');
    return r.json();
  }).then(function(d){
    try { sessionStorage.setItem('espejo.admin', codigo); } catch (e) {}
    datos = d.leads || [];
    document.getElementById('login').hidden = true;
    document.getElementById('lista').hidden = false;
    var si = datos.filter(function(l){ return l.consentimiento; }).length;
    document.getElementById('cuenta').textContent = '총 ' + datos.length + '명 · 마케팅 동의 ' + si + '명';
    document.getElementById('tb').innerHTML = datos.map(function(l){
      return '<tr><td>' + esc(l.email) + '</td><td>' + (l.consentimiento ? '<b style="color:var(--acc)">예</b>' : '<span class="n">아니오</span>') + '</td><td class="n">' + esc(l.idioma) + '</td><td class="n">' + esc(hora(l.creado)) +
        '</td><td><button class="x" data-id="' + l.id + '" data-email="' + esc(l.email) + '">삭제</button></td></tr>';
    }).join('') || '<tr><td colspan="5" class="n">아직 없습니다.</td></tr>';
  });
}
document.getElementById('f').addEventListener('submit', function(ev){
  ev.preventDefault(); codigo = document.getElementById('code').value.trim();
  document.getElementById('err').hidden = true;
  cargar().catch(function(e){ error(e.message); });
});
document.getElementById('salir').addEventListener('click', function(){
  try { sessionStorage.removeItem('espejo.admin'); } catch (e) {}
  location.reload();
});
document.getElementById('csv').addEventListener('click', function(){
  var filas = [['email','marketing','idioma','creado']].concat(datos.map(function(l){ return [l.email, l.consentimiento ? 'si' : 'no', l.idioma, l.creado]; }));
  var csv = filas.map(function(f){ return f.map(function(v){ return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(','); }).join('\\r\\n');
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\\ufeff' + csv], { type:'text/csv;charset=utf-8' }));
  a.download = 'espejo-leads-' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
});
document.getElementById('tb').addEventListener('click', function(ev){
  var b = ev.target.closest('button.x'); if (!b) return;
  if (!confirm(b.getAttribute('data-email') + ' 을(를) 명단에서 삭제할까요? 되돌릴 수 없습니다.')) return;
  pedir('/api/admin/borrar', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ id: Number(b.getAttribute('data-id')) }) })
    .then(function(r){ if (!r.ok) throw new Error('삭제하지 못했습니다 (' + r.status + ').'); return cargar(); })
    .catch(function(e){ alert(e.message); });
});
if (codigo) cargar().catch(function(){ codigo = ''; });
</script></main></body></html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* ------------------------------------------------------ capacidad */
    if (url.pathname === '/api/capacidad') {
      return json({ envio: Boolean(env.RESEND_API_KEY) });
    }

    /* ----------------------------------------------------------- lead */
    if (url.pathname === '/api/lead') {
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
      if (!mismoOrigen(request, url)) return json({ error: 'origen' }, 403);

      let cuerpo;
      try { cuerpo = await request.json(); } catch { return json({ error: 'json' }, 400); }

      const email = String(cuerpo.email || '').trim().toLowerCase();
      const idioma = String(cuerpo.idioma || '').slice(0, 5);
      const sesion = String(cuerpo.sesion || '').slice(0, 32);
      if (!CORREO.test(email) || email.length > 254) return json({ error: 'email' }, 400);
      /* El correo se guarda con o sin casilla; lo que la casilla decide es si
         se le puede escribir con novedades. Sólo cuenta un `true` explícito:
         el RGPD no admite un consentimiento deducido del silencio. */
      const consiente = cuerpo.consentimiento === true ? 1 : 0;

      try {
        await env.espejo_leads.prepare(
          `INSERT INTO leads (email, idioma, consentimiento, sesion, creado)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(email) DO UPDATE SET
             idioma = excluded.idioma,
             -- Volver sin marcar no retira un consentimiento dado: la baja
             -- se pide por correo y se hace desde /admin.
             consentimiento = MAX(consentimiento, excluded.consentimiento),
             sesion = excluded.sesion,
             creado = excluded.creado`
        ).bind(email, idioma, consiente, sesion, new Date().toISOString()).run();
      } catch {
        return json({ error: 'db' }, 500);
      }
      return json({ ok: true });
    }

    /* -------------------------------------------------------- informe */
    if (url.pathname === '/api/informe') {
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
      if (!mismoOrigen(request, url)) return json({ error: 'origen' }, 403);
      if (!env.RESEND_API_KEY) return json({ error: 'sin_proveedor' }, 503);

      let cuerpo;
      try { cuerpo = await request.json(); } catch { return json({ error: 'json' }, 400); }

      const email = String(cuerpo.email || '').trim().toLowerCase();
      const asunto = String(cuerpo.asunto || 'Espejo').slice(0, 160);
      const html = String(cuerpo.html || '');

      if (!CORREO.test(email) || email.length > 254) return json({ error: 'email' }, 400);
      /* El informe contiene datos de salud: aquí hace falta consentimiento
         EXPLÍCITO, no el genérico del alta de correo. */
      if (cuerpo.consentimientoSalud !== true) return json({ error: 'consentimiento_salud' }, 400);
      if (!html || html.length > MAX_HTML) return json({ error: 'html' }, 400);

      try {
        await enviar(env, email, asunto, html);
      } catch (e) {
        return json({ error: 'envio', detalle: String(e.message || e).slice(0, 200) }, 502);
      }
      /* Nada que guardar: el informe ya voló y de él no queda copia. */
      return json({ ok: true });
    }

    /* ---------------------------------------------------------- admin */
    if (url.pathname === '/admin') {
      if (!env.ADMIN_CODE) return new Response('Not found', { status: 404 });
      return new Response(ADMIN_HTML, {
        headers: {
          'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
          'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer'
        }
      });
    }
    if (url.pathname === '/api/admin/leads') {
      if (!(await autorizado(request, env))) return json({ error: 'no_autorizado' }, 401);
      const { results } = await env.espejo_leads.prepare(
        'SELECT id, email, idioma, consentimiento, creado FROM leads ORDER BY creado DESC'
      ).all();
      return json({ leads: results });
    }
    if (url.pathname === '/api/admin/borrar') {
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
      if (!mismoOrigen(request, url)) return json({ error: 'origen' }, 403);
      if (!(await autorizado(request, env))) return json({ error: 'no_autorizado' }, 401);
      let cuerpo;
      try { cuerpo = await request.json(); } catch { return json({ error: 'json' }, 400); }
      const id = Number(cuerpo.id);
      if (!Number.isInteger(id) || id <= 0) return json({ error: 'id' }, 400);
      await env.espejo_leads.prepare('DELETE FROM leads WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    return env.ASSETS.fetch(request);
  }
};
