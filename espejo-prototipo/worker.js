/* ==========================================================================
   ESPEJO · Worker
   --------------------------------------------------------------------------
   Sirve los ficheros estáticos y expone tres rutas.

   GET  /api/capacidad  → ¿está configurado el envío de informes?
   POST /api/lead       → alta de correo. Guarda SÓLO datos de contacto.
   POST /api/informe    → envía el informe por correo. NO LO GUARDA.

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
      /* Sin consentimiento no se guarda. El RGPD no admite un consentimiento
         deducido del silencio ni de una casilla premarcada. */
      if (cuerpo.consentimiento !== true) return json({ error: 'consentimiento' }, 400);

      try {
        await env.espejo_leads.prepare(
          `INSERT INTO leads (email, idioma, consentimiento, sesion, creado)
           VALUES (?, ?, 1, ?, ?)
           ON CONFLICT(email) DO UPDATE SET
             idioma = excluded.idioma,
             sesion = excluded.sesion,
             creado = excluded.creado`
        ).bind(email, idioma, sesion, new Date().toISOString()).run();
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

    return env.ASSETS.fetch(request);
  }
};
