/* ==========================================================================
   ESPEJO · Worker
   --------------------------------------------------------------------------
   Sirve los ficheros estáticos y expone tres rutas.

   GET  /api/capacidad  → ¿está configurado el envío de informes?
   POST /api/lead       → alta de correo. Guarda SÓLO datos de contacto y si
                          acepta novedades (consentimiento 1/0).
   POST /api/informe    → envía el informe por correo. NO LO GUARDA.
   POST /api/analisis   → registro del análisis: resultados anónimos siempre;
                          correo + foto sólo con casilla explícita (30 días).
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
const MAX_ANALISIS = 700 * 1024;   // JSON + foto JPEG 512 px en base64 (~100 kB)
const DIAS_FOTO = 30;

/* La tabla se crea al primer uso: el token de despliegue no tiene permiso
   para ejecutar SQL en D1 desde fuera, pero el Worker sí. Idempotente. */
let tablaLista = false;
async function asegurarTabla(db) {
  if (tablaLista) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS analisis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creado TEXT NOT NULL,
    sesion TEXT, idioma TEXT, modo TEXT,
    codigo TEXT, tono TEXT, ita REAL, patron TEXT, confianza INTEGER,
    datos TEXT NOT NULL,
    email TEXT,
    foto TEXT,
    nombre TEXT
  )`).run();
  // Tablas creadas antes de añadir el nombre: la columna se añade una vez.
  for (const t of ['analisis', 'leads']) {
    try { await db.prepare(`ALTER TABLE ${t} ADD COLUMN nombre TEXT`).run(); } catch (e) {}
  }
  tablaLista = true;
}
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
      from: env.REMITENTE || 'Lococo Skin Type Test <espejo@lococo.beauty>',
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
/* Bloqueo por intentos: el código es corto (lo elige Lococo), así que sin
   límite se podría adivinar probando. 10 fallos en 10 minutos desde la misma
   IP bloquean esa IP hasta que pasen los 10 minutos. */
const MAX_FALLOS = 10, VENTANA_MS = 10 * 60 * 1000;
let tablaFallos = false;
async function bloqueado(request, env) {
  const db = env.espejo_leads;
  if (!tablaFallos) {
    await db.prepare('CREATE TABLE IF NOT EXISTS admin_fallos (ip TEXT NOT NULL, t INTEGER NOT NULL)').run();
    tablaFallos = true;
  }
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const desde = Date.now() - VENTANA_MS;
  const fila = await db.prepare('SELECT COUNT(*) AS n FROM admin_fallos WHERE ip = ? AND t > ?').bind(ip, desde).first();
  return { ip, lleno: (fila ? fila.n : 0) >= MAX_FALLOS };
}
async function registrarFallo(env, ip) {
  await env.espejo_leads.batch([
    env.espejo_leads.prepare('INSERT INTO admin_fallos (ip, t) VALUES (?, ?)').bind(ip, Date.now()),
    env.espejo_leads.prepare('DELETE FROM admin_fallos WHERE t < ?').bind(Date.now() - VENTANA_MS)
  ]);
}

async function autorizado(request, env) {
  if (!env.ADMIN_CODE) return false;
  const b = await bloqueado(request, env);
  if (b.lleno) return 'bloqueado';
  const ok = await coincide(request, env);
  if (!ok) await registrarFallo(env, b.ip);
  return ok;
}

async function coincide(request, env) {
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
<title>Lococo Skin Type Test · 관리</title>
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
th{ font-size:12.5px; color:var(--mut); font-weight:600; white-space:nowrap; }
td.n{ font-variant-numeric:tabular-nums; color:var(--mut); white-space:nowrap; }
.err{ color:var(--bad); font-size:13.5px; margin-top:10px; }
.wrap{ overflow-x:auto; }
.tab{ background:transparent; color:var(--mut); border-color:var(--line); }
.tab[aria-pressed="true"]{ background:var(--acc); color:#fff; border-color:var(--acc); }
td.p{ font-size:12.5px; color:var(--mut); min-width:220px; }
img.foto{ display:block; max-width:240px; border-radius:8px; margin-top:8px; }
button.ver{ padding:3px 9px; font-size:12.5px; }
</style></head><body><main>
<h1>Lococo Skin Type Test 관리</h1>
<p class="mut">이메일 명단과 분석 결과. 코드가 있는 사람만 볼 수 있습니다.</p>
<div class="card" id="login">
  <form id="f" class="fila">
    <input id="code" type="password" placeholder="관리자 코드" autocomplete="current-password">
    <button>열기</button>
  </form>
  <p class="err" id="err" hidden></p>
</div>
<div class="fila tabs" id="tabs" hidden style="margin-bottom:16px">
  <button class="tab" data-tab="lista" aria-pressed="true">이메일 명단</button>
  <button class="tab" data-tab="res" aria-pressed="false">분석 결과</button>
</div>
<div id="res" hidden>
  <div class="fila" style="justify-content:space-between;margin-bottom:12px">
    <strong id="rcuenta"></strong>
    <button class="sec" id="rcsv">CSV 다운로드</button>
  </div>
  <div class="card wrap"><table>
    <thead><tr><th>시각 (마드리드)</th><th>타입</th><th>유분</th><th>홍반</th><th>결</th><th>잡티</th><th>톤균일</th><th>추천 제품</th><th>이름 · 이메일</th><th></th></tr></thead>
    <tbody id="rtb"></tbody>
  </table></div>
  <p class="mut" style="margin-top:12px">모든 분석 결과가 저장되고, 방문자가 이름·이메일을 남겼으면 함께 보입니다. 사진은 저장하지 않습니다. 지수는 0–100.</p>
</div>
<div id="lista" hidden>
  <p class="mut">부스에서 이메일을 입력한 방문자 전체입니다. 소식 메일은 <b>마케팅 동의 = 예</b>인 사람에게만 보낼 수 있습니다.</p>
  <div class="fila" style="justify-content:space-between;margin-bottom:12px">
    <strong id="cuenta"></strong>
    <div class="fila"><button class="sec" id="csv">CSV 다운로드</button><button class="sec" id="salir">잠그기</button></div>
  </div>
  <div class="card wrap"><table>
    <thead><tr><th>이름</th><th>이메일</th><th>마케팅 동의</th><th>언어</th><th>등록 시각 (마드리드)</th><th></th></tr></thead>
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
    if (r.status === 429) throw new Error('틀린 코드를 여러 번 넣어서 10분간 잠겼습니다. 잠시 후 다시 시도하세요.');
    if (!r.ok) throw new Error('불러오지 못했습니다 (' + r.status + ').');
    return r.json();
  }).then(function(d){
    try { sessionStorage.setItem('espejo.admin', codigo); } catch (e) {}
    datos = d.leads || [];
    document.getElementById('login').hidden = true;
    document.getElementById('tabs').hidden = false;
    if (document.getElementById('res').hidden) document.getElementById('lista').hidden = false;
    var si = datos.filter(function(l){ return l.consentimiento; }).length;
    document.getElementById('cuenta').textContent = '총 ' + datos.length + '명 · 마케팅 동의 ' + si + '명';
    document.getElementById('tb').innerHTML = datos.map(function(l){
      return '<tr><td>' + esc(l.nombre || '') + '</td><td>' + esc(l.email) + '</td><td>' + (l.consentimiento ? '<b style="color:var(--acc)">예</b>' : '<span class="n">아니오</span>') + '</td><td class="n">' + esc(l.idioma) + '</td><td class="n">' + esc(hora(l.creado)) +
        '</td><td><button class="x" data-id="' + l.id + '" data-email="' + esc(l.email) + '">삭제</button></td></tr>';
    }).join('') || '<tr><td colspan="6" class="n">아직 없습니다.</td></tr>';
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
  var filas = [['nombre','email','marketing','idioma','creado']].concat(datos.map(function(l){ return [l.nombre || '', l.email, l.consentimiento ? 'si' : 'no', l.idioma, l.creado]; }));
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
var analisis = [];
function met(d, id){ var m = (d.metricas || []).filter(function(x){ return x.id === id; })[0]; return m ? m.indice : ''; }
function cargarRes(){
  return pedir('/api/admin/analisis').then(function(r){ if (!r.ok) throw new Error('불러오지 못했습니다 (' + r.status + ').'); return r.json(); })
  .then(function(d){
    analisis = (d.analisis || []).map(function(a){ try { a.d = JSON.parse(a.datos); } catch (e) { a.d = {}; } return a; });
    var conFoto = analisis.filter(function(a){ return a.tiene_foto; }).length;
    document.getElementById('rcuenta').textContent = '총 ' + analisis.length + '건 · 사진 ' + conFoto + '건';
    document.getElementById('rtb').innerHTML = analisis.map(function(a){
      var d = a.d || {};
      return '<tr><td class="n">' + esc(hora(a.creado)) + '</td><td><b>' + esc(a.codigo) + '</b><div class="n">' + esc(a.tono) + ' · ITA ' + esc(a.ita) + '</div></td>' +
        ['brillo','eritema','textura','imperfecciones','uniformidad'].map(function(k){ return '<td class="n">' + esc(met(d, k)) + '</td>'; }).join('') +
        '<td class="p">' + (d.productos || []).map(esc).join('<br>') + '</td>' +
        '<td>' + (a.nombre ? '<b>' + esc(a.nombre) + '</b><br>' : '') + (a.email ? esc(a.email) : '<span class="n">없음</span>') +
        (a.tiene_foto ? '<br><button class="sec ver" data-foto="' + a.id + '">사진 보기</button><div id="f' + a.id + '"></div>' : '') + '</td>' +
        '<td><button class="x" data-ra="' + a.id + '">삭제</button></td></tr>';
    }).join('') || '<tr><td colspan="10" class="n">아직 없습니다.</td></tr>';
  });
}
document.getElementById('tabs').addEventListener('click', function(ev){
  var b = ev.target.closest('.tab'); if (!b) return;
  var t = b.getAttribute('data-tab');
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function(x){ x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
  document.getElementById('lista').hidden = t !== 'lista';
  document.getElementById('res').hidden = t !== 'res';
  if (t === 'res') cargarRes().catch(function(e){ alert(e.message); });
});
document.getElementById('rtb').addEventListener('click', function(ev){
  var f = ev.target.closest('button[data-foto]');
  if (f) {
    var id = f.getAttribute('data-foto');
    pedir('/api/admin/foto?id=' + id).then(function(r){ if (!r.ok) throw new Error('사진이 없습니다 (30일이 지나 삭제되었을 수 있습니다).'); return r.blob(); })
      .then(function(bl){ document.getElementById('f' + id).innerHTML = '<img class="foto" alt="" src="' + URL.createObjectURL(bl) + '">'; f.remove(); })
      .catch(function(e){ alert(e.message); });
    return;
  }
  var x = ev.target.closest('button[data-ra]'); if (!x) return;
  if (!confirm('이 분석 기록을 삭제할까요? 되돌릴 수 없습니다.')) return;
  pedir('/api/admin/borrar-analisis', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ id: Number(x.getAttribute('data-ra')) }) })
    .then(function(r){ if (!r.ok) throw new Error('삭제하지 못했습니다 (' + r.status + ').'); return cargarRes(); })
    .catch(function(e){ alert(e.message); });
});
document.getElementById('rcsv').addEventListener('click', function(){
  var cab = ['creado','nombre','codigo','tono','ita','patron','confianza','brillo','eritema','textura','imperfecciones','uniformidad','productos','respuestas','email','foto'];
  var filas = [cab].concat(analisis.map(function(a){ var d = a.d || {};
    return [a.creado, a.nombre || '', a.codigo, a.tono, a.ita, a.patron, a.confianza, met(d,'brillo'), met(d,'eritema'), met(d,'textura'), met(d,'imperfecciones'), met(d,'uniformidad'),
      (d.productos || []).join(' | '), (d.respuestas || []).join(' '), a.email || '', a.tiene_foto ? 'si' : 'no']; }));
  var csv = filas.map(function(f){ return f.map(function(v){ return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(','); }).join('\\r\\n');
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\\ufeff' + csv], { type:'text/csv;charset=utf-8' }));
  a.download = 'espejo-analisis-' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
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
      const nombre = String(cuerpo.nombre || '').trim().slice(0, 80) || null;
      if (!CORREO.test(email) || email.length > 254) return json({ error: 'email' }, 400);
      /* El correo se guarda con o sin casilla; lo que la casilla decide es si
         se le puede escribir con novedades. Sólo cuenta un `true` explícito:
         el RGPD no admite un consentimiento deducido del silencio. */
      const consiente = cuerpo.consentimiento === true ? 1 : 0;

      try {
        await asegurarTabla(env.espejo_leads);
        await env.espejo_leads.prepare(
          `INSERT INTO leads (email, idioma, consentimiento, sesion, creado, nombre)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(email) DO UPDATE SET
             idioma = excluded.idioma,
             -- Volver sin marcar no retira un consentimiento dado: la baja
             -- se pide por correo y se hace desde /admin.
             consentimiento = MAX(consentimiento, excluded.consentimiento),
             sesion = excluded.sesion,
             creado = excluded.creado,
             nombre = COALESCE(excluded.nombre, nombre)`
        ).bind(email, idioma, consiente, sesion, new Date().toISOString(), nombre).run();
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
      const asunto = String(cuerpo.asunto || 'Lococo Skin Type Test').slice(0, 160);
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

    /* ------------------------------------------------------- analisis */
    if (url.pathname === '/api/analisis') {
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
      if (!mismoOrigen(request, url)) return json({ error: 'origen' }, 403);
      const texto = await request.text();
      if (texto.length > MAX_ANALISIS) return json({ error: 'tamano' }, 413);
      let c;
      try { c = JSON.parse(texto); } catch { return json({ error: 'json' }, 400); }
      const corto = (v, n) => (v == null ? null : String(v).slice(0, n));
      /* Nombre y correo del paso 2, si los hay (el paso 2 avisa de que se
         guardan con los resultados). La foto sólo con consentimiento
         explícito; hoy la página no la envía. */
      let email = null, foto = null;
      const e = String(c.email || '').trim().toLowerCase();
      if (CORREO.test(e) && e.length <= 254) email = e;
      const nombre = corto(String(c.nombre || '').trim() || null, 80);
      if (c.consentimientoFoto === true && email && typeof c.foto === 'string' &&
          /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(c.foto)) foto = c.foto;
      const datos = JSON.stringify({
        metricas: Array.isArray(c.metricas) ? c.metricas.slice(0, 10) : [],
        zonas: Array.isArray(c.zonas) ? c.zonas.slice(0, 10) : [],
        respuestas: Array.isArray(c.respuestas) ? c.respuestas.slice(0, 20) : [],
        productos: Array.isArray(c.productos) ? c.productos.slice(0, 10).map(p => corto(p, 160)) : []
      });
      try {
        await asegurarTabla(env.espejo_leads);
        await env.espejo_leads.batch([
          env.espejo_leads.prepare(
            `INSERT INTO analisis (creado, sesion, idioma, modo, codigo, tono, ita, patron, confianza, datos, email, foto, nombre)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(new Date().toISOString(), corto(c.sesion, 32), corto(c.idioma, 5), corto(c.modo, 16),
                 corto(c.codigo, 8), corto(c.tono, 8), Number.isFinite(+c.ITA) ? +c.ITA : null,
                 corto(c.patron, 16), Number.isFinite(+c.confianza) ? Math.round(+c.confianza) : null,
                 datos, email, foto, nombre),
          // Caducidad de las fotos: se aplica en cada alta, sin cron.
          env.espejo_leads.prepare(
            `UPDATE analisis SET foto = NULL WHERE foto IS NOT NULL AND creado < ?`
          ).bind(new Date(Date.now() - DIAS_FOTO * 864e5).toISOString())
        ]);
      } catch {
        return json({ error: 'db' }, 500);
      }
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
      { const a = await autorizado(request, env); if (a === 'bloqueado') return json({ error: 'bloqueado' }, 429); if (a !== true) return json({ error: 'no_autorizado' }, 401); }
      await asegurarTabla(env.espejo_leads);
      const { results } = await env.espejo_leads.prepare(
        'SELECT id, email, nombre, idioma, consentimiento, creado FROM leads ORDER BY creado DESC'
      ).all();
      return json({ leads: results });
    }
    if (url.pathname === '/api/admin/analisis') {
      { const a = await autorizado(request, env); if (a === 'bloqueado') return json({ error: 'bloqueado' }, 429); if (a !== true) return json({ error: 'no_autorizado' }, 401); }
      await asegurarTabla(env.espejo_leads);
      const { results } = await env.espejo_leads.prepare(
        `SELECT id, creado, idioma, modo, codigo, tono, ita, patron, confianza, datos, email, nombre,
                foto IS NOT NULL AS tiene_foto
         FROM analisis ORDER BY creado DESC LIMIT 2000`
      ).all();
      return json({ analisis: results });
    }
    if (url.pathname === '/api/admin/foto') {
      { const a = await autorizado(request, env); if (a === 'bloqueado') return json({ error: 'bloqueado' }, 429); if (a !== true) return json({ error: 'no_autorizado' }, 401); }
      const id = Number(url.searchParams.get('id'));
      if (!Number.isInteger(id) || id <= 0) return json({ error: 'id' }, 400);
      const fila = await env.espejo_leads.prepare('SELECT foto FROM analisis WHERE id = ?').bind(id).first();
      if (!fila || !fila.foto) return json({ error: 'sin_foto' }, 404);
      const b = atob(fila.foto.split(',')[1]);
      const bytes = new Uint8Array(b.length);
      for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i);
      return new Response(bytes, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'no-store' } });
    }
    if (url.pathname === '/api/admin/borrar-analisis') {
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
      if (!mismoOrigen(request, url)) return json({ error: 'origen' }, 403);
      { const a = await autorizado(request, env); if (a === 'bloqueado') return json({ error: 'bloqueado' }, 429); if (a !== true) return json({ error: 'no_autorizado' }, 401); }
      let cuerpo;
      try { cuerpo = await request.json(); } catch { return json({ error: 'json' }, 400); }
      const id = Number(cuerpo.id);
      if (!Number.isInteger(id) || id <= 0) return json({ error: 'id' }, 400);
      await env.espejo_leads.prepare('DELETE FROM analisis WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }
    if (url.pathname === '/api/admin/borrar') {
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
      if (!mismoOrigen(request, url)) return json({ error: 'origen' }, 403);
      { const a = await autorizado(request, env); if (a === 'bloqueado') return json({ error: 'bloqueado' }, 429); if (a !== true) return json({ error: 'no_autorizado' }, 401); }
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
