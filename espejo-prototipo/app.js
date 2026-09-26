/* ==========================================================================
   ESPEJO · Controlador de sesión e informe
   ========================================================================== */
(function () {
  'use strict';

  var E = window.ESPEJO_ENGINE, P = window.ESPEJO_PERFIL;
  var I = window.I18N;
  var T = function (k) { return I.t(k); };
  var TF = function (k, v) { return I.tf(k, v); };
  var TX = function (o) { return I.tx(o); };
  var CAT = window.ESPEJO_CATALOGO || null;
  var CAL = window.ESPEJO_CAL || null;
  function enCalibracion() { return !!(CAL && CAL.activa()); }
  var $ = function (id) { return document.getElementById(id); };
  var el = function (t, c, h) {
    var n = document.createElement(t);
    if (c) n.className = c;
    if (h !== undefined) n.innerHTML = h;
    return n;
  };
  var esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  var nf = function (v, d) {
    var loc = I.idioma() === 'es' ? 'es-ES' : I.idioma() === 'ko' ? 'ko-KR' : 'en-GB';
    return Number(v).toLocaleString(loc, { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  /* Separador decimal coherente con el idioma en cifras compuestas a mano. */
  var dec = function (txt) { return I.idioma() === 'es' ? txt.replace('.', ',') : txt; };

  /* ------------------------------------------------------------- ESTADO */
  var S = {
    fase: 0,
    stream: null,
    lienzo: null,
    ctx: null,
    optico: null,
    respuestas: [],
    qIndex: 0,
    seguidas: 0,
    contando: false,
    listoCaptura: false,
    condiciones: null,
    inicio: new Date(),
    modoFoto: 'directo'
  };

  var FASES = [
    { id: 's-intro',        nom: 'fase.intro' },
    { id: 's-correo',       nom: 'fase.correo' },
    { id: 's-captura',      nom: 'fase.captura' },
    { id: 's-analisis',     nom: 'fase.proceso' },
    { id: 's-cuestionario', nom: 'fase.cuest' },
    { id: 's-informe',      nom: 'fase.informe' }
  ];
  /* Índices con nombre: el orden de FASES puede cambiar sin que haya que
     buscar números sueltos por todo el fichero. */
  var F_INTRO = 0, F_CORREO = 1, F_CAPTURA = 2, F_ANALISIS = 3, F_CUEST = 4, F_INFORME = 5;
  var F_CALIB = -1;

  var CHECKS = [
    { k: 'encuadre' }, { k: 'exposicion' }, { k: 'uniformidad' },
    { k: 'enfoque' },  { k: 'estabilidad' }
  ];

  /* --------------------------------------------------------------- HUD */
  function iniciarHud() {
    var id = 'MD' + String(S.inicio.getFullYear()).slice(2) +
             '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    $('hud-sesion').textContent = id;
    S.sesionId = id;
    var ua = navigator.userAgent;
    /* El nombre del equipo también es texto: 'Escritorio' no puede quedarse
       en castellano cuando la interfaz está en inglés. */
    S.equipoClave = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
      ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : 'hud.escritorio';
    pintarEquipo();
    function reloj() {
      $('hud-hora').textContent = new Date().toLocaleTimeString('es-ES',
        { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    reloj(); setInterval(reloj, 1000);
  }

  function pintarEquipo() {
    S.equipo = S.equipoClave === 'hud.escritorio' ? T('hud.escritorio') : S.equipoClave;
    $('hud-equipo').textContent = S.equipo;
  }

  function pintarRail() {
    var r = $('rail'); r.innerHTML = '';
    if (S.fase === F_CALIB) {
      var c = el('div', 'rail-step active');
      c.innerHTML = '<span class="num">··</span><span>' + T('rail.calib') + '</span>';
      r.appendChild(c);
      var pieC = el('div', 'rail-foot');
      pieC.innerHTML = TF('rail.calibPie', { n: CAL ? CAL.nMuestras() : 0 });
      r.appendChild(pieC);
      return;
    }
    FASES.forEach(function (f, i) {
      var cls = 'rail-step' + (i === S.fase ? ' active' : i < S.fase ? ' done' : '');
      var n = el('div', cls);
      n.innerHTML = '<span class="num">' + String(i + 1).padStart(2, '0') + '</span><span>' + T(f.nom) + '</span>';
      r.appendChild(n);
    });
    var pie = el('div', 'rail-foot');
    pie.innerHTML = T('rail.pie');
    r.appendChild(pie);
  }

  function irA(i) {
    $('s-calibracion').hidden = true;
    S.fase = i;
    FASES.forEach(function (f, k) { $(f.id).hidden = k !== i; });
    pintarRail();
    window.scrollTo(0, 0);
    reiniciarInactividad();
  }

  /* ------------------------------------------------------------ CORREO
     El correo es opcional a propósito. Condicionar el análisis a aceptar
     marketing convierte el consentimiento en un peaje, y un consentimiento
     que no es libre no vale como consentimiento. */
  /* El servidor dice si hay proveedor de correo configurado. La página no
     promete un envío que no puede cumplir: sin proveedor, el paso vuelve a
     ser una suscripción opcional y se dice tal cual. Prometer un envío que
     no ocurre no es sólo una mentira al visitante, es declarar una finalidad
     de tratamiento falsa. */
  S.puedeEnviar = false;

  function consultarCapacidad() {
    return fetch('/api/capacidad')
      .then(function (r) { return r.json(); })
      .then(function (d) { S.puedeEnviar = !!(d && d.envio); })
      .catch(function () { S.puedeEnviar = false; })
      .then(function () { aplicarModoCorreo(); });
  }

  function aplicarModoCorreo() {
    var env = S.puedeEnviar;
    /* Lococo pide que el paso se presente siempre como el correo del informe
       (2026-09-26), esté o no configurado el envío. Sin proveedor, el texto
       de apoyo no promete plazo de entrega. */
    $('cor-h2').setAttribute('data-i18n', 'cor.h2Envio');
    $('cor-lede').setAttribute('data-i18n', env ? 'cor.ledeEnvio' : 'cor.ledeSinEnvio');
    /* Sin envío, el correo solo sirve para marketing y tiene que poder
       omitirse: exigirlo convertiría el análisis en un peaje por la publicidad.
       Con envío, el correo es el servicio pedido y el botón sobra. */
    $('btn-correo-saltar').hidden = env;
    I.aplicarEstaticos();
  }

  function pintarCorreo() {
    var err = $('cor-error');
    err.hidden = true; err.textContent = '';
    $('correo').removeAttribute('aria-invalid');
    $('btn-correo-ok').disabled = false;
    $('btn-correo-ok').textContent = T('cor.continuar');
    aplicarModoCorreo();
    reiniciarInactividad();
  }

  function irACaptura() { irA(F_CAPTURA); arrancarCamara(); }

  function enviarCorreo() {
    var campo = $('correo'), err = $('cor-error');
    var email = (campo.value || '').trim();
    var consiente = $('cor-consent').checked;

    function fallo(clave) {
      err.textContent = T(clave);
      err.hidden = false;
      campo.setAttribute('aria-invalid', 'true');
    }
    /* Atajo de pruebas para el equipo: con «test» o «prueba» en el campo de
       correo se salta la cámara y el cuestionario y se abre un informe de
       ejemplo sobre un rostro sintético. No guarda nada ni envía nada. */
    /* «admin» lleva a la página de gestión (el código se pide allí). */
    if (/^admin$/i.test(email)) { campo.value = ''; window.location.href = '/admin'; return; }
    /* «encuesta»: se salta sólo la cámara (rostro sintético) y se hace el
       cuestionario de verdad, con la pausa y el informe. Tampoco se guarda. */
    if (/^encuesta(@\S*)?$/i.test(email)) {
      campo.value = '';
      window.ESPEJO_CUESTIONARIO();
      return;
    }
    if (/^(test|prueba)(@\S*)?$/i.test(email)) {
      campo.value = '';
      window.ESPEJO_DEMO();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fallo('cor.errFormato');
    /* El informe se envía a quien escribe su correo en este paso: el paso se
       presenta como «el correo donde quieres recibir tu informe», así que
       escribirlo es pedirlo (Lococo, 2026-09-26: sin casilla aparte). Se
       explica en /privacidad. La casilla de novedades sigue siendo aparte y
       voluntaria. */
    /* La casilla de marketing nunca bloquea: sin ella el correo simplemente
       no se guarda para novedades y el análisis sigue igual. */
    S.correo = email;
    S.consintioSalud = S.puedeEnviar;   // pedido al escribir el correo

    var boton = $('btn-correo-ok');
    boton.disabled = true;
    boton.textContent = T('cor.guardando');

    /* Si el alta falla no se bloquea a nadie: el análisis es lo que la persona
       vino a hacer, y perder un correo importa menos que perder al visitante. */
    /* El correo se guarda siempre (Lococo quiere ver quién ha pasado por el
       puesto); la casilla sólo decide si se le puede escribir con novedades.
       El texto «Qué guardamos» lo dice así. */
    var alta = fetch('/api/lead', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: email, idioma: I.idioma(), sesion: S.sesionId, consentimiento: consiente
      })
    }).then(function (r) { if (!r.ok) throw new Error('http ' + r.status); });

    alta.then(function () {
      campo.value = '';
      irACaptura();
    }).catch(function () {
      /* Si falla el alta de marketing no se retiene a nadie: el correo ya
         está guardado en memoria para el envío del informe, que es lo que
         la persona vino a pedir. */
      campo.value = '';
      irACaptura();
    });
  }

  /* ----------------------------------------------------------- CAPTURA */
  function pintarChecks(c) {
    var cont = $('checks');
    if (!cont.childElementCount) {
      CHECKS.forEach(function (ch) {
        var n = el('div', 'check');
        n.id = 'chk-' + ch.k;
        n.innerHTML = '<span class="led"></span><span class="nom">' + T('chk.' + ch.k) +
                      '</span><span class="val">—</span>';
        cont.appendChild(n);
      });
    }
    var falla = null;
    CHECKS.forEach(function (ch) {
      var n = $('chk-' + ch.k), r = c[ch.k];
      n.className = 'check ' + (r.ok ? 'ok' : 'bad');
      n.querySelector('.nom').textContent = T('chk.' + ch.k);
      n.querySelector('.val').textContent = r.texto + ' ' + r.unidad;
      if (!r.ok && !falla) falla = ch;
    });
    return falla;
  }

  /* El panel de condiciones vive en la columna derecha en tableta y
     superpuesto al visor en teléfono. Se MUEVE el mismo nodo en lugar de
     duplicarlo: dos copias del mismo estado acabarían divergiendo. */
  var mqEstrecho = window.matchMedia('(max-width: 700px)');
  var ranuraAncha = null;

  function colocarChecks() {
    var c = $('checks');
    if (!c) return;
    if (!ranuraAncha) ranuraAncha = c.parentNode;
    var destino = mqEstrecho.matches ? $('checks-movil') : ranuraAncha;
    if (destino && c.parentNode !== destino) {
      // En la columna ancha el panel va justo antes del renglón de pistas.
      if (destino === ranuraAncha) destino.insertBefore(c, $('pista'));
      else destino.appendChild(c);
    }
  }

  function checksVacios() {
    var o = {};
    CHECKS.forEach(function (c) { o[c.k] = { ok: false, texto: '—', unidad: '' }; });
    return o;
  }

  /* Repinta lo que esté en pantalla tras un cambio de idioma. El cálculo no se
     rehace: los resultados viven en S y sólo cambia cómo se rotulan. */
  function rerenderizar() {
    pintarEquipo();
    pintarRail();
    if (S.fase === F_CALIB) { if (CAL) CAL.pintar(); return; }
    if (S.fase === F_CAPTURA) {
      var f = pintarChecks(S.condiciones || checksVacios());
      $('pista').textContent = S.condiciones ? (f ? T('chk.' + f.k + '.p') : T('cap.ok')) : '';
      if (S.avisoCam) $('aviso-cam-txt').textContent = S.avisoCam();
    }
    if (S.fase === F_ANALISIS && S.optico) {
      $('log').innerHTML = '';
      for (var i = 0; i < S.revelado; i++) pintarPaso(i);
    }
    if (S.fase === F_CUEST) pintarPregunta();
    if (S.fase === F_INFORME && S.optico) construirInforme(true);
  }

  function pintarIdioma() {
    Array.prototype.forEach.call($('hud-lang').children, function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-lang') === I.idioma() ? 'true' : 'false');
    });
  }

  function coverDraw(fuente, fw, fh) {
    var s = Math.max(E.CANVAS_W / fw, E.CANVAS_H / fh);
    var sw = E.CANVAS_W / s, sh = E.CANVAS_H / s;
    S.ctx.drawImage(fuente, (fw - sw) / 2, (fh - sh) / 2, sw, sh, 0, 0, E.CANVAS_W, E.CANVAS_H);
  }

  var ultimo = 0;
  function bucle(ts) {
    if (S.fase !== F_CAPTURA || !S.stream) return;
    requestAnimationFrame(bucle);
    if (ts - ultimo < 125) return;
    ultimo = ts;
    var v = $('video');
    if (!v.videoWidth) return;
    coverDraw(v, v.videoWidth, v.videoHeight);

    var c = E.evaluarEncuadre(S.ctx);
    S.condiciones = c;
    var falla = pintarChecks(c);
    var todo = !falla;

    $('marcas-ok').setAttribute('opacity', todo ? '1' : '0');
    $('aro').classList.toggle('listo', todo);
    $('pista').textContent = todo ? T('cap.ok') : (falla ? T('chk.' + falla.k + '.p') : '');

    /* Durante la cuenta se toleran parpadeos de hasta dos fotogramas
       (~250 ms): una condición que roza el umbral la reiniciaba sin fin y la
       captura no llegaba nunca. La tolerancia sólo afecta a la cuenta; el
       fotograma que se captura tiene que cumplir las cinco condiciones. */
    if (todo) { S.seguidas++; S.fallos = 0; }
    else {
      S.seguidas = 0; S.fallos = (S.fallos || 0) + 1;
      if (!S.contando || S.fallos >= 3) abortarCuenta();
    }
    $('btn-capturar').disabled = !todo;
    if (S.listoCaptura && todo) { capturar(); return; }
    if (S.seguidas >= 5 && !S.contando) iniciarCuenta();
  }

  var tCuenta = null;
  function iniciarCuenta() {
    S.contando = true;
    var n = 3, box = $('cuenta');
    box.hidden = false; box.textContent = n;
    $('barrido').classList.add('on');
    tCuenta = setInterval(function () {
      n--;
      if (n <= 0) {
        clearInterval(tCuenta); box.hidden = true;
        /* No se dispara aquí: el bucle captura en el primer fotograma que
           cumpla las cinco condiciones, que suele ser este mismo. */
        S.listoCaptura = true;
      }
      else box.textContent = n;
    }, 800);
  }
  function abortarCuenta() {
    if (!S.contando) return;
    clearInterval(tCuenta); S.contando = false; S.listoCaptura = false;
    $('cuenta').hidden = true; $('barrido').classList.remove('on');
  }

  function capturar() {
    abortarCuenta();
    S.fallos = 0;
    var pv = $('preview');
    pv.width = E.CANVAS_W; pv.height = E.CANVAS_H;
    pv.getContext('2d').drawImage(S.lienzo, 0, 0);
    pv.hidden = false;
    $('video').hidden = true;
    detenerCamara();
    $('btn-repetir').hidden = false;
    $('btn-capturar').disabled = true;
    setTimeout(correrAnalisis, 380);
  }

  function detenerCamara() {
    if (S.stream) { S.stream.getTracks().forEach(function (t) { t.stop(); }); S.stream = null; }
    $('hud-led').className = 'dot off';
    estadoCam('hud.detenida');
  }

  function arrancarCamara() {
    colocarChecks();
    $('aviso-cam').hidden = true;
    $('video').hidden = false;
    $('preview').hidden = true;
    $('btn-repetir').hidden = true;
    E.reiniciarEncuadre();
    $('aro').classList.remove('listo');
    S.seguidas = 0; S.fallos = 0;
    abortarCuenta();   // una cuenta a medias de la sesión anterior no debe disparar aquí
    S.modoFoto = 'directo';

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return sinCamara(function () { return T('cap.sinApi'); });
    }
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } },
      audio: false
    }).then(function (st) {
      S.stream = st;
      var v = $('video');
      v.srcObject = st;
      v.play().catch(function () {});
      $('hud-led').className = 'dot';
      estadoCam('hud.activa');
      requestAnimationFrame(bucle);
    }).catch(function (err) {
      var nom = (err && err.name) ? err.name : 'error';
      sinCamara(function () {
        return err && err.name === 'NotAllowedError'
          ? T('cap.permisoDenegado')
          : TF('cap.errorCamara', { e: nom });
      });
    });
  }

  /* Se guarda la CLAVE, no el texto: así el rótulo sigue al idioma. */
  function estadoCam(clave) {
    var n = $('hud-cam');
    n.setAttribute('data-i18n', clave);
    n.textContent = T(clave);
  }

  function sinCamara(fabricar) {
    S.avisoCam = fabricar;
    $('aviso-cam-txt').textContent = fabricar();
    $('aviso-cam').hidden = false;
    $('hud-led').className = 'dot off';
    estadoCam('hud.nodisp');
    S.modoFoto = 'sistema';
  }

  function desdeArchivo(file) {
    var img = new Image();
    img.onload = function () {
      coverDraw(img, img.naturalWidth, img.naturalHeight);
      S.condiciones = E.evaluarEncuadre(S.ctx);
      pintarChecks(S.condiciones);
      var pv = $('preview');
      pv.width = E.CANVAS_W; pv.height = E.CANVAS_H;
      pv.getContext('2d').drawImage(S.lienzo, 0, 0);
      pv.hidden = false;
      $('aviso-cam').hidden = true;
      $('btn-repetir').hidden = false;
      URL.revokeObjectURL(img.src);
      setTimeout(correrAnalisis, 420);
    };
    img.src = URL.createObjectURL(file);
  }

  /* ---------------------------------------------------------- ANÁLISIS

     El avance de fase NO puede colgar de una cadena de setTimeout. Los
     navegadores congelan los temporizadores de una pestaña oculta, de modo
     que si alguien bloquea el iPad o cambia de aplicación mientras se procesa,
     el informe no llega nunca y el puesto se queda muerto. Aquí el resultado
     se calcula de una vez y sólo la CADENCIA de lectura es temporal: en
     cuanto la página vuelve a ser visible se vuelca todo lo pendiente y se
     avanza, y si ya estaba lista se avanza sin esperar.                    */

  function correrAnalisis() {
    irA(F_ANALISIS);
    var log = $('log'); log.innerHTML = '';
    $('prog').style.width = '4%';

    requestAnimationFrame(function () {
      var res;
      try {
        res = E.analizar(S.lienzo);
      } catch (err) {
        log.appendChild(el('div', 'log-row',
          '<span class="i">!!</span><span class="t">' + T('ana.error') + '<span class="d">' +
          esc(TF('ana.errorDet', { m: err && err.message ? err.message : String(err) })) +
          '</span></span>'));
        $('btn-repetir').hidden = false;
        return;
      }
      S.optico = res;
      S.revelado = 0;
      S.revelando = true;
      S.tPaso = 0;
      requestAnimationFrame(bucleRevelado);
    });
  }

  function pintarPaso(i) {
    var p = S.optico.pasos[i];
    $('log').appendChild(el('div', 'log-row',
      '<span class="i">' + String(i + 1).padStart(2, '0') + '</span>' +
      '<span class="t">' + esc(TX(p.titulo)) + '<span class="d">' + esc(TX(p.detalle)) + '</span></span>'));
    $('prog').style.width = (4 + 96 * (i + 1) / S.optico.pasos.length) + '%';
  }

  /* Ritmo de lectura del análisis y de la pausa previa al informe: 0,8 s por
     paso (≈ 6 s el análisis, ≈ 3 s la pausa). El cálculo ya está hecho de
     antemano; esto es sólo el tiempo que se da para leerlo. Lococo, 2026-09-26:
     230 ms parecía que no hacía nada; 1,1 s se hacía largo. */
  var PASO_MS = 800;

  function bucleRevelado(ts) {
    if (!S.revelando || !S.optico) return;
    if (!S.tPaso) S.tPaso = ts;
    if (ts - S.tPaso >= PASO_MS) {
      S.tPaso = ts;
      if (S.revelado < S.optico.pasos.length) {
        pintarPaso(S.revelado); S.revelado++;
      } else {
        return terminarAnalisis();
      }
    }
    requestAnimationFrame(bucleRevelado);
  }

  /* Vuelca de golpe lo que quede y pasa al cuestionario. */
  function volcarAnalisis() {
    if (!S.revelando || !S.optico) return;
    while (S.revelado < S.optico.pasos.length) { pintarPaso(S.revelado); S.revelado++; }
    terminarAnalisis();
  }

  function terminarAnalisis() {
    if (!S.revelando) return;
    S.revelando = false;
    $('prog').style.width = '100%';
    if (S.calibrando && enCalibracion()) {
      S.calibrando = false;
      CAL.registrar(S.optico, 'cámara');
      mostrarCalibracion();
      return;
    }
    irA(F_CUEST);
    pintarPregunta();
  }

  function mostrarCalibracion() {
    detenerCamara();
    FASES.forEach(function (f) { $(f.id).hidden = true; });
    $('s-calibracion').hidden = false;
    S.fase = F_CALIB;
    pintarRail();
    window.scrollTo(0, 0);
    CAL.pintar();
  }

  /* ------------------------------------------------------ CUESTIONARIO */
  /* Pausa entre la última respuesta y el informe (Lococo, 2026-09-26): saltar
     directamente parecía que no se había tenido en cuenta lo respondido.
     Tres pasos de ~1,1 s en la misma tarjeta del cuestionario. El informe de
     ejemplo («test») no pasa por aquí. */
  var tPrep = null;
  function prepararInforme() {
    var card = $('q-card');
    var pasos = ['prep.p1', 'prep.p2', 'prep.p3'];
    $('btn-atras').parentNode.hidden = true;
    $('q-prog').hidden = true;
    card.innerHTML = '<h3 class="q-texto" style="margin-top:0">' + T('prep.h') + '</h3>' +
      '<div class="barra-prog" style="margin:18px 0 16px"><i id="prog-prep"></i></div>' +
      '<div class="log" id="log-prep"></div>';
    var i = 0;
    function siguiente() {
      if (S.fase !== F_CUEST) return;               // sesión cerrada entretanto
      if (i < pasos.length) {
        $('log-prep').appendChild(el('div', 'log-row',
          '<span class="i">' + String(i + 1).padStart(2, '0') + '</span><span class="t">' + T(pasos[i]) + '</span>'));
        i++;
        $('prog-prep').style.width = (100 * i / pasos.length) + '%';
        tPrep = setTimeout(siguiente, PASO_MS);
      } else {
        $('btn-atras').parentNode.hidden = false;
        $('q-prog').hidden = false;
        construirInforme();
      }
    }
    requestAnimationFrame(function () { $('prog-prep').style.width = '4%'; siguiente(); });
  }

  function pintarPregunta() {
    var q = P.PREGUNTAS[S.qIndex];
    var card = $('q-card');
    card.innerHTML = '';
    card.appendChild(el('p', 'q-num', TF('cue.num', { i: S.qIndex + 1, n: P.PREGUNTAS.length })));
    card.appendChild(el('h3', 'q-texto', esc(TX(q.texto))));
    card.appendChild(el('p', 'q-ayuda', esc(TX(q.ayuda))));
    var ops = el('div', 'q-ops');
    q.ops.forEach(function (o, i) {
      var b = el('button', 'q-op');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', S.respuestas[S.qIndex] === i ? 'true' : 'false');
      b.innerHTML = '<span class="mk"></span><span>' + esc(TX(o.t)) + '</span>';
      b.addEventListener('click', function () {
        S.respuestas[S.qIndex] = i;
        Array.prototype.forEach.call(ops.children, function (c, k) {
          c.setAttribute('aria-checked', k === i ? 'true' : 'false');
        });
        setTimeout(function () {
          if (S.qIndex < P.PREGUNTAS.length - 1) { S.qIndex++; pintarPregunta(); }
          else prepararInforme();
        }, 200);
      });
      ops.appendChild(b);
    });
    ops.setAttribute('role', 'radiogroup');
    card.appendChild(ops);

    var prog = $('q-prog'); prog.innerHTML = '';
    P.PREGUNTAS.forEach(function (_, i) {
      var t = el('i', i === S.qIndex ? 'cur' : (S.respuestas[i] !== undefined ? 'on' : ''));
      prog.appendChild(t);
    });
    $('btn-atras').disabled = S.qIndex === 0;
    $('q-contador').textContent = TF('cue.eje', { e: T('eje.' + q.eje) });
    reiniciarInactividad();
  }

  /* --------------------------------------------------------- GRÁFICOS */
  var RAMPAS = {
    eritema: ['--ery-1', '--ery-2', '--ery-3', '--ery-4', '--ery-5'],
    brillo:  ['--bri-1', '--bri-2', '--bri-3', '--bri-4', '--bri-5'],
    textura: ['--tex-1', '--tex-2', '--tex-3', '--tex-4', '--tex-5']
  };
  /* oscuroDesde: paso de la rampa a partir del cual el relleno es lo bastante
     luminoso como para que la etiqueta tenga que ir en tinta oscura. */
  var MAPAS = {
    eritema: { nom: 'mapa.eritema', uni: { es: 'UI', en: 'units', ko: 'UI' }, dom: [10, 34], dec: 1, oscuroDesde: 3,
               val: function (z) { return z.EI; } },
    brillo:  { nom: 'mapa.brillo',  uni: { es: '%', en: '%', ko: '%' }, dom: [0, 40],  dec: 0, oscuroDesde: 3,
               val: function (z) { return z.brilloArea * 100; } },
    textura: { nom: 'mapa.textura', uni: { es: 'σL*', en: 'σL*', ko: 'σL*' }, dom: [0.4, 3.4], dec: 2, oscuroDesde: 4,
               val: function (z) { return z.textura; } }
  };

  function pasoColor(v, dom) {
    var t = (v - dom[0]) / (dom[1] - dom[0]);
    return Math.max(0, Math.min(4, Math.floor(t * 5)));
  }

  /* Indicador radial. Barrido de 270° desde las 7:30 en sentido horario.
     El número exacto vive en el centro, de modo que el arco aporta la lectura
     de un vistazo sin que se pierda precisión: un ángulo se estima mal, una
     cifra no. Las marcas exteriores son los cortes de banda 30 / 55 / 78. */
  var G_CX = 66, G_CY = 64, G_R = 46, G_INI = 135, G_ARCO = 270;

  function polar(r, grados) {
    var a = grados * Math.PI / 180;
    return [G_CX + r * Math.cos(a), G_CY + r * Math.sin(a)];
  }
  function trazoArco(r, d0, d1) {
    var p0 = polar(r, d0), p1 = polar(r, d1);
    var largo = (d1 - d0) > 180 ? 1 : 0;
    return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) +
           ' A' + r + ' ' + r + ' 0 ' + largo + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2);
  }

  var COLOR_BANDA = { ok: 'var(--st-ok)', mid: 'var(--st-mid)', hi: 'var(--st-hi)', max: 'var(--st-max)' };

  function svgIndicador(m) {
    var col = COLOR_BANDA[m.banda.clave];
    var fin = G_INI + G_ARCO * Math.max(0, Math.min(100, m.indice)) / 100;
    var s = ['<svg viewBox="0 0 132 122" width="132" height="122" role="img" aria-label="' +
             esc(TX(m.nombre)) + ': ' + Math.round(m.indice) + '/100 · ' + esc(TX(m.banda.etiqueta)) + '">'];

    s.push('<path d="' + trazoArco(G_R, G_INI, G_INI + G_ARCO) +
           '" fill="none" stroke="var(--line-2)" stroke-width="7"/>');

    if (m.indice > 0.4) {
      s.push('<path d="' + trazoArco(G_R, G_INI, fin) + '" fill="none" stroke="' + col +
             '" stroke-width="11" opacity=".18"/>');
      s.push('<path d="' + trazoArco(G_R, G_INI, fin) + '" fill="none" stroke="' + col +
             '" stroke-width="7"/>');
    }

    [30, 55, 78].forEach(function (t) {
      var g = G_INI + G_ARCO * t / 100;
      var a = polar(G_R + 6, g), b = polar(G_R + 11, g);
      s.push('<line x1="' + a[0].toFixed(2) + '" y1="' + a[1].toFixed(2) +
             '" x2="' + b[0].toFixed(2) + '" y2="' + b[1].toFixed(2) +
             '" stroke="var(--ink-3)" stroke-width="1"/>');
    });

    var e0 = polar(G_R + 15, G_INI), e1 = polar(G_R + 15, G_INI + G_ARCO);
    s.push('<text x="' + e0[0].toFixed(1) + '" y="' + (e0[1] + 3).toFixed(1) +
           '" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="8" fill="var(--ink-3)">0</text>');
    s.push('<text x="' + e1[0].toFixed(1) + '" y="' + (e1[1] + 3).toFixed(1) +
           '" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="8" fill="var(--ink-3)">100</text>');

    s.push('<text x="' + G_CX + '" y="' + (G_CY + 6) + '" text-anchor="middle" ' +
           'font-family="ui-monospace, Menlo, monospace" font-size="27" font-weight="600" fill="var(--ink)">' +
           Math.round(m.indice) + '</text>');
    s.push('<text x="' + G_CX + '" y="' + (G_CY + 20) + '" text-anchor="middle" ' +
           'font-family="ui-monospace, Menlo, monospace" font-size="7.5" letter-spacing="0.4" fill="var(--ink-3)">' +
           T('inf.indice') + '</text>');
    s.push('</svg>');
    return s.join('');
  }

  function centroide(poly) {
    var x = 0, y = 0;
    poly.forEach(function (p) { x += p[0]; y += p[1]; });
    return [x / poly.length, y / poly.length];
  }

  /* ------------------------------------------------------- LUPA
     Vista ampliada de tres zonas sobre la MISMA foto que se ha medido: no hay
     segunda captura ni imagen inventada. Se recorta la zona útil (0,26 mm/px),
     se amplía y se marca encima lo que el motor ya ha calculado:
       · puntos de poro: mínimos locales de la banda de textura r1–r4 (la
         misma que da el índice de textura) por debajo de −1,8 σ de la zona.
         Son candidatos ópticos, no un recuento clínico de poros. Se descartan
         en brillo especular y a su alrededor: el borde de un reflejo es un
         escalón de luminancia que la banda confunde con un hueco.
       · focos: las lesiones que ya detecta el paso 5, a su tamaño real.     */
  /* Secciones del informe que Lococo ha retirado (2026-09-26). Se apagan
     aquí en vez de borrarlas: volver a mostrarlas es cambiar un valor. */
  var MOSTRAR_LUPA = false;
  var MOSTRAR_CUESTIONARIO = false;
  var MOSTRAR_SESION = false;       // «Condiciones de la sesión» (2026-09-26)
  var MOSTRAR_LEGAL = false;        // aviso legal al pie del informe (2026-09-26)
  var MAX_EVITAR = 3;               // «Mejor evitar»: sólo los más relevantes

  /* Enlace a la ficha del producto en la tienda (lococo.beauty, Shopify).
     Sólo si el catálogo trae su handle (`h`): los que no se venden online
     no llevan enlace. Las UTM permiten ver en Shopify qué ventas vinieron
     del puesto y cuáles del correo. */
  var TIENDA = 'https://lococo.beauty';
  /* Enlaces del correo: pasan por /r de este mismo servidor, que cuenta el
     clic y redirige a la tienda con las mismas UTM. Así se ve en /admin
     cuántas veces se pulsa cada enlace y desde qué informe (sesión). */
  function clicCorreo(url, tipo) {
    return location.origin + '/r?s=' + encodeURIComponent(S.sesionId || '') +
      '&t=' + tipo + '&u=' + encodeURIComponent(url);
  }
  function urlTienda(ruta, medio) {
    return TIENDA + ruta + '?utm_source=espejo&utm_medium=' + medio + '&utm_campaign=madrid2026';
  }
  function urlProducto(pr, medio) {
    if (!pr || !pr.h) return null;
    return TIENDA + '/products/' + encodeURIComponent(pr.h) +
      '?utm_source=espejo&utm_medium=' + medio + '&utm_campaign=madrid2026';
  }

  var LUPA_ZONAS = ['nariz', 'mejillaD', 'frente'];
  var LUPA_PX = 56;                                       // lado del recorte
  var LUPA_ZOOM = 5;
  var LUPA_MM = Math.round(LUPA_PX * E.MM_PER_PX);        // ≈ 15 mm

  /* Dónde mirar dentro de cada zona. Con un recorte de 25 mm centrado en el
     polígono, la nariz enseñaba las fosas nasales y la frente el nacimiento
     del pelo. El recorte es ahora más pequeño y se BUSCA dentro de la zona:
     gana la ventana con más piel limpia (máscara de piel y sin píxeles
     oscuros: pelo, fosas, sombra). El ancla desempata hacia el sitio que
     interesa mirar: dorso de la nariz, parte baja de la frente. */
  var LUPA_ANCLA = { nariz: [0.5, 0.48], frente: [0.5, 0.22] };

  function enPoligono(px, py, poly) {
    var dentro = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) dentro = !dentro;
    }
    return dentro;
  }

  function colocarLupa(res, Z, luma) {
    var u = res.util, W = u.w, H = u.h, m = res.mapas.mascara, L = LUPA_PX;
    // Mediana de luminancia de la piel de la zona: la referencia de "oscuro".
    var hist = new Uint32Array(256), n = 0, x, y, i;
    for (y = 0; y < H; y += 2) for (x = 0; x < W; x += 2) {
      i = y * W + x;
      if (m[i] && enPoligono(x / W, y / H, Z.poly)) { hist[luma[i]]++; n++; }
    }
    var med = 0;
    for (var a = 0, v = 0; v < 256; v++) { a += hist[v]; if (a >= n / 2) { med = v; break; } }
    var oscuro = med * 0.72;

    var c = LUPA_ANCLA[Z.id] || centroide(Z.poly);
    var ax = c[0] * W, ay = c[1] * H, diag = Math.hypot(W, H);
    var mejor = null;
    for (var y0 = 0; y0 <= H - L; y0 += 4) for (var x0 = 0; x0 <= W - L; x0 += 4) {
      // La ventana entera tiene que caer dentro de la zona.
      if (!enPoligono(x0 / W, y0 / H, Z.poly) || !enPoligono((x0 + L) / W, y0 / H, Z.poly) ||
          !enPoligono(x0 / W, (y0 + L) / H, Z.poly) || !enPoligono((x0 + L) / W, (y0 + L) / H, Z.poly)) continue;
      var ok = 0, tot = 0;
      for (y = y0; y < y0 + L; y += 2) for (x = x0; x < x0 + L; x += 2) {
        i = y * W + x; tot++;
        if (m[i] && luma[i] >= oscuro) ok++;
      }
      var d = Math.hypot(x0 + L / 2 - ax, y0 + L / 2 - ay) / diag;
      var nota = ok / tot - d * 0.6;
      if (!mejor || nota > mejor.nota) mejor = { x0: x0, y0: y0, nota: nota };
    }
    if (mejor) return mejor;
    // Zona más estrecha que la ventana: se centra en el ancla, como antes.
    return {
      x0: Math.max(0, Math.min(W - L, Math.round(ax - L / 2))),
      y0: Math.max(0, Math.min(H - L, Math.round(ay - L / 2)))
    };
  }

  function puntosPoro(res, x0, y0, lado) {
    var u = res.util, m = res.mapas, W = u.w, H = u.h, esp = m.especular;
    function brilla(i) {
      for (var dy = -3; dy <= 3; dy++) for (var dx = -3; dx <= 3; dx++) {
        var j = i + dy * W + dx; if (j >= 0 && j < esp.length && esp[j] > 0.42) return true;
      }
      return false;
    }
    var x1 = Math.min(W - 1, x0 + lado), y1 = Math.min(H - 1, y0 + lado);
    var s = 0, s2 = 0, n = 0, x, y, i;
    for (y = y0; y < y1; y++) for (x = x0; x < x1; x++) {
      i = y * W + x; if (!m.mascara[i]) continue;
      s += m.textura[i]; s2 += m.textura[i] * m.textura[i]; n++;
    }
    if (n < 200) return { puntos: [], area: n };
    var med = s / n, sd = Math.sqrt(Math.max(1e-6, s2 / n - med * med)), umbral = med - 1.8 * sd;
    var puntos = [];
    for (y = Math.max(1, y0); y < y1 - 1; y++) for (x = Math.max(1, x0); x < x1 - 1; x++) {
      i = y * W + x;
      if (!m.mascara[i]) continue;
      var v = m.textura[i];
      if (v >= umbral || brilla(i)) continue;
      if (v > m.textura[i - 1] || v > m.textura[i + 1] || v > m.textura[i - W] || v > m.textura[i + W] ||
          v > m.textura[i - W - 1] || v > m.textura[i - W + 1] || v > m.textura[i + W - 1] || v > m.textura[i + W + 1]) continue;
      puntos.push({ x: x - x0, y: y - y0, p: Math.min(1, (umbral - v) / sd) });
    }
    return { puntos: puntos, area: n };
  }

  function pintarLupas(res) {
    if (!res.mapas || !res.util) return;
    var u = res.util, dpr = Math.min(2, window.devicePixelRatio || 1);
    var px = u.ctx.getImageData(0, 0, u.w, u.h).data, luma = new Uint8Array(u.w * u.h);
    for (var q = 0; q < luma.length; q++) {
      luma[q] = (px[q * 4] * 54 + px[q * 4 + 1] * 183 + px[q * 4 + 2] * 19) >> 8;
    }
    Array.prototype.forEach.call(document.querySelectorAll('#informe .lupa'), function (fig) {
      var id = fig.getAttribute('data-zona');
      var Z = E.ZONES.filter(function (q) { return q.id === id; })[0];
      var z = res.zonas.filter(function (q) { return q.id === id; })[0];
      var pos = colocarLupa(res, Z, luma), x0 = pos.x0, y0 = pos.y0;
      var lado = LUPA_PX * LUPA_ZOOM, k = LUPA_ZOOM * dpr;

      var cv = fig.querySelector('canvas');
      cv.width = lado * dpr; cv.height = lado * dpr;
      var ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(u.canvas, x0, y0, LUPA_PX, LUPA_PX, 0, 0, cv.width, cv.height);

      // Fuera de la máscara de piel (ojo, pelo, fondo) se apaga: ahí no se mide.
      var m = res.mapas.mascara;
      ctx.fillStyle = 'rgba(4,8,12,.62)';
      for (var yy = 0; yy < LUPA_PX; yy++) for (var xx = 0; xx < LUPA_PX; xx++) {
        if (!m[(y0 + yy) * u.w + x0 + xx]) ctx.fillRect(xx * k, yy * k, k + 0.5, k + 0.5);
      }

      var pp = puntosPoro(res, x0, y0, LUPA_PX);

      var focos = res.lesiones.filter(function (l) {
        var lx = l.x * u.w - x0, ly = l.y * u.h - y0;
        return lx >= 0 && ly >= 0 && lx < LUPA_PX && ly < LUPA_PX;
      });
      // Dentro de un foco el hueco es la lesión, no un poro.
      pp.puntos = pp.puntos.filter(function (q) {
        return !focos.some(function (l) {
          var r = Math.sqrt(l.areaMm2 / Math.PI) / E.MM_PER_PX + 1.5;
          var dx = q.x - (l.x * u.w - x0), dy = q.y - (l.y * u.h - y0);
          return dx * dx + dy * dy < r * r;
        });
      });
      ctx.lineWidth = 1.1 * dpr;
      pp.puntos.forEach(function (q) {
        ctx.strokeStyle = 'rgba(110,151,255,' + (0.45 + 0.5 * q.p).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc((q.x + 0.5) * k, (q.y + 0.5) * k, (1.6 + q.p) * dpr * 1.4, 0, 6.2832); ctx.stroke();
      });
      ctx.strokeStyle = '#FF5C55'; ctx.lineWidth = 1.6 * dpr;
      focos.forEach(function (l) {
        var r = Math.sqrt(l.areaMm2 / Math.PI) / E.MM_PER_PX;
        ctx.beginPath(); ctx.arc((l.x * u.w - x0) * k, (l.y * u.h - y0) * k, r * k + 4 * dpr, 0, 6.2832); ctx.stroke();
      });

      // En porcentaje del lado: el lienzo se escala con la tarjeta.
      fig.querySelector('.lupa-esc i').style.width = (5 / E.MM_PER_PX / LUPA_PX * 100).toFixed(2) + '%';
      var cm2 = pp.area * E.MM_PER_PX * E.MM_PER_PX / 100;
      var dens = cm2 > 0 ? pp.puntos.length / cm2 : 0;
      fig.querySelector('.lupa-datos').innerHTML =
        '<span><b>' + pp.puntos.length + '</b> ' + T('lupa.poros') + ' · ' + nf(dens, 0) + '/cm²</span>' +
        '<span><b>' + focos.length + '</b> ' + T('lupa.focos') + '</span>' +
        '<span>' + T('mapa.textura') + ' <b>' + nf(z.textura, 2) + '</b> σL*</span>';
    });
  }

  function svgMapa(clave, res) {
    var M = MAPAS[clave], R = RAMPAS[clave];
    var W = 240, H = Math.round(240 * E.RETICLE.h / E.RETICLE.w);
    var s = ['<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' +
             esc(T(M.nom)) + '">'];

    s.push('<ellipse cx="' + (W / 2) + '" cy="' + (H / 2) + '" rx="' + (W / 2 - 3) +
           '" ry="' + (H / 2 - 3) + '" fill="var(--panel-2)" stroke="var(--line-hot)" stroke-width="1"/>');

    res.zonas.forEach(function (z) {
      var Z = E.ZONES.filter(function (q) { return q.id === z.id; })[0];
      var pts = Z.poly.map(function (p) {
        return (p[0] * W).toFixed(1) + ',' + (p[1] * H).toFixed(1);
      }).join(' ');
      if (!z.valido) {
        s.push('<polygon points="' + pts + '" fill="var(--line-2)" stroke="var(--line)" stroke-width="1" stroke-dasharray="3 3"/>');
        return;
      }
      var v = M.val(z), p = pasoColor(v, M.dom);
      s.push('<polygon points="' + pts + '" fill="var(' + R[p] + ')" stroke="var(--ground)" stroke-width="2"/>');
      var c = centroide(Z.poly);
      s.push('<text x="' + (c[0] * W).toFixed(1) + '" y="' + (c[1] * H + 3.5).toFixed(1) +
             '" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="9.5" ' +
             'font-weight="500" fill="' + (p >= M.oscuroDesde ? '#050814' : '#E8EEFF') + '">' +
             nf(v, M.dec) + '</text>');
    });

    // Rasgos de referencia: ojos y labios quedan fuera del análisis
    E.EXCLUDE.forEach(function (B) {
      s.push('<rect x="' + (B[0] * W).toFixed(1) + '" y="' + (B[1] * H).toFixed(1) +
             '" width="' + ((B[2] - B[0]) * W).toFixed(1) + '" height="' + ((B[3] - B[1]) * H).toFixed(1) +
             '" fill="none" stroke="var(--line)" stroke-width="1" stroke-dasharray="2 3" rx="2"/>');
    });
    s.push('</svg>');
    return s.join('');
  }

  function leyenda(clave, res) {
    var M = MAPAS[clave], R = RAMPAS[clave];
    var vals = res.validas.map(M.val);
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    var pos = function (v) {
      return Math.max(0, Math.min(100, (v - M.dom[0]) / (M.dom[1] - M.dom[0]) * 100));
    };
    var h = '<div class="leyenda">';
    R.forEach(function (r) { h += '<span class="paso" style="background:var(' + r + ')"></span>'; });
    h += '</div>';
    h += '<div style="position:relative;height:11px;margin-top:2px">' +
         '<span style="position:absolute;left:' + pos(mn).toFixed(1) + '%;transform:translateX(-50%);' +
         'font-family:var(--mono);font-size:9px;color:var(--accent)">▲</span>' +
         (Math.abs(mx - mn) > 0.001 ? '<span style="position:absolute;left:' + pos(mx).toFixed(1) +
         '%;transform:translateX(-50%);font-family:var(--mono);font-size:9px;color:var(--accent)">▲</span>' : '') +
         '</div>';
    var uni = TX(M.uni);
    h += '<div class="leyenda-ejes"><span>' + nf(M.dom[0], M.dec) + ' ' + uni +
         '</span><span>' + nf(M.dom[1], M.dec) + ' ' + uni + '</span></div>';
    h += '<p class="tiny" style="margin-top:7px">' +
         TF('mapa.medido', { a: nf(mn, M.dec), b: nf(mx, M.dec), u: uni }) + '</p>';
    return h;
  }

  /* ----------------------------------------------------------- INFORME */
  function construirInforme(conservarScroll) {
    var perfil = P.calcular(S.respuestas, S.optico);
    var rec = P.recomendar(perfil, S.optico);
    var res = S.optico, g = res.global;
    S.perfil = perfil;

    var H = [];
    var sec = function (idx, titulo, der) {
      return '<div class="sec"><div class="sec-cab"><span class="idx">' + idx +
             '</span><h3>' + titulo + '</h3>' +
             (der ? '<span class="der">' + der + '</span>' : '') + '</div>';
    };
    var mmpx = dec(E.MM_PER_PX.toFixed(3));

    /* --- Hero ------------------------------------------------------- */
    H.push('<div class="rep-hero"><div>' +
      '<p class="eyebrow">' + TF('inf.cab', { s: esc(S.sesionId) }) + '</p>' +
      '<h2>' + esc(TX(g.patron.etiqueta)) + '<br>' +
      esc(TX(perfil.ejes.SR.etiqueta).toLowerCase()) +
      (I.idioma() === 'ko' ? ' · ' : I.idioma() === 'en' ? ' and ' : ' y ') +
      esc(TX(perfil.ejes.PN.etiqueta).toLowerCase()) + '</h2>' +
      '<p class="lede">' +
      TF('inf.tono', { t: esc(TX(g.tono.cat)), i: nf(g.ITA, 1), c: g.tono.codigo }) +
      TF('inf.patron.' + g.patron.clave, { r: nf(g.ratioTU, 1) }) +
      '</p></div>' +
      '<div><div class="codigo">' + perfil.codigo + '</div>' +
      '<p class="codigo-pie">' + T('inf.baumann') + '</p></div></div>');

    /* --- 01 Medición óptica ----------------------------------------- */
    H.push(sec('01', T('inf.s1'), T('inf.s1der')));
    H.push('<div class="gauges">');
    res.metricas.forEach(function (m) {
      H.push('<div class="gauge">' + svgIndicador(m) + '<div class="g-txt">' +
        '<span class="pill c-' + m.banda.clave + '">' + esc(TX(m.banda.etiqueta)) + '</span>' +
        '<span class="g-nom">' + esc(TX(m.nombre)) + '</span>' +
        '<span class="g-fis">' + esc(TX(m.fisico)) + '</span>' +
        '<span class="g-desc">' + esc(TX(m.desc)) + '</span></div></div>');
    });
    H.push('</div><p class="tiny" style="margin-top:12px">' + T('inf.s1nota') + '</p></div>');

    /* --- 02 Mapa por zonas ------------------------------------------ */
    H.push(sec('02', T('inf.s2'), mmpx + ' mm/px'));
    H.push('<div class="seg" id="seg-mapa">' +
      '<button type="button" data-m="eritema" aria-pressed="true">' + T('mapa.eritema') + '</button>' +
      '<button type="button" data-m="brillo" aria-pressed="false">' + T('mapa.brillo') + '</button>' +
      '<button type="button" data-m="textura" aria-pressed="false">' + T('mapa.textura') + '</button></div>');
    H.push('<div class="mapa-grid"><div class="mapa-caja"><div id="mapa-svg"></div>' +
      '<div id="mapa-leyenda"></div></div>' +
      '<div style="overflow-x:auto"><table class="zt"><thead><tr><th>' + T('inf.zona') + '</th>' +
      '<th>' + T('mapa.eritema') + '<br>' + TX(MAPAS.eritema.uni) + '</th>' +
      '<th>' + T('mapa.brillo') + '<br>' + T('inf.areaPc') + '</th>' +
      '<th>' + T('mapa.textura') + '<br>σL*</th>' +
      '<th>ITA<br>°</th><th>' + T('inf.focos') + '</th></tr></thead><tbody>');
    res.zonas.forEach(function (z) {
      if (!z.valido) {
        H.push('<tr class="inval"><td>' + esc(TX(z.nombre)) + '</td><td colspan="5">' +
          T('inf.sinMuestra') + '</td></tr>');
        return;
      }
      H.push('<tr><td>' + esc(TX(z.nombre)) + '</td><td>' + nf(z.EI, 1) + '</td><td>' +
        nf(z.brilloArea * 100, 1) + '</td><td>' + nf(z.textura, 2) + '</td><td>' +
        nf(z.ITA, 1) + '</td><td>' + z.lesiones + '</td></tr>');
    });
    H.push('</tbody></table>');
    if (g.deltaCentral > 2.5) {
      H.push('<p class="tiny" style="margin-top:12px">' +
        TF('inf.centrofacial', { d: nf(g.deltaCentral, 1) }) + '</p>');
    }
    // Cierra la tabla con scroll, la rejilla y la sección 02. Faltaba el
    // último: el resto del informe quedaba anidado dentro de esta sección.
    H.push('</div></div></div>');

    /* --- 03 Análisis ampliado --------------------------------------- */
    if (MOSTRAR_LUPA) {
    H.push(sec('03', T('lupa.titulo'), '×' + LUPA_ZOOM + ' · ' + LUPA_MM + ' mm'));
    H.push('<div class="lupa-grid">');
    LUPA_ZONAS.forEach(function (id) {
      var z = res.zonas.filter(function (q) { return q.id === id; })[0];
      if (!z || !z.valido) return;
      H.push('<figure class="lupa" data-zona="' + id + '">' +
        '<div class="lupa-vis"><canvas class="lupa-cv"></canvas><span class="lupa-barrido"></span>' +
        '<span class="lupa-esc"><i></i>5 mm</span>' +
        '<span class="lupa-tag">' + esc(TX(z.nombre)) + '</span></div>' +
        '<figcaption class="lupa-datos"></figcaption></figure>');
    });
    H.push('</div><p class="lupa-ley"><span class="lp"></span>' + T('lupa.leyPoro') +
      '<span class="ll"></span>' + T('lupa.leyFoco') + '</p>' +
      '<p class="tiny" style="margin-top:10px">' + TF('lupa.nota', { m: mmpx }) + '</p></div>');
    }

    /* --- 04 Perfil por cuestionario --------------------------------- */
    if (MOSTRAR_CUESTIONARIO) {
    H.push(sec('04', T('inf.s3'), T('inf.s3der')));
    ['DO', 'SR', 'PN', 'WT'].forEach(function (k) {
      var d = perfil.definiciones[k], e = perfil.ejes[k];
      var pos = (e.norm + 1) / 2 * 100;
      H.push('<div class="eje">' +
        '<div class="eje-top"><span class="eje-nom">' + esc(TX(e.etiqueta)) + '</span>' +
        '<span class="eje-val">' + (e.norm >= 0 ? '+' : '') + nf(e.norm, 2) +
        (e.limitrofe ? ' <span class="tag-lim">' + T('inf.limite') + '</span>' : '') + '</span></div>' +
        '<div class="eje-esc"><div class="eje-pista"></div><div class="eje-centro"></div>' +
        '<div class="eje-punto" style="left:' + pos.toFixed(1) + '%"></div></div>' +
        '<div class="eje-pies"><span>' + esc(TX(d.neg)) + '</span><span>' + esc(TX(d.pos)) + '</span></div>' +
        '<p class="eje-desc">' + esc(TX(d.desc)) + '</p></div>');
    });
    H.push('<div class="eje"><div class="eje-top"><span class="eje-nom">' + T('inf.hidrat') + ' · ' +
      esc(TX(perfil.hidratacion.etiqueta)) + '</span><span class="eje-val">' + T('inf.autoinf') + '</span></div>' +
      '<p class="eje-desc">' + T('inf.hidratNota') + '</p></div>');

    if (perfil.discrepancias.length) {
      H.push('<div class="aviso" style="margin-top:20px"><p class="eyebrow">' + T('inf.contraste') + '</p>');
      perfil.discrepancias.forEach(function (d) {
        H.push('<p class="small" style="margin-top:9px"><b>' + esc(d.eje) + '.</b> ' +
          esc(TX(d.texto)) + '</p>');
      });
      H.push('</div>');
    }
    H.push('</div>');
    }

    /* --- 04 Activos ------------------------------------------------- */
    /* Ingredientes de la tienda (ver perfil.js › INGREDIENTES), cada uno con
       enlace a su colección en lococo.beauty. */
    H.push(sec('05', T('inf.s4'), ''));
    H.push('<div class="act">');
    P.ingredientesTienda(perfil, res, 3).forEach(function (a) {
      H.push('<div class="act-fila act-fila--ing">' +
        '<div><div class="act-nom">' + esc(TX(a.n)) + '</div>' +
        '<p class="act-por">' + esc(TX(a.p)) + '</p>' +
        '<a class="prod-link" href="' + esc(urlTienda(a.url, 'pantalla')) + '" target="_blank" rel="noopener">' +
        T('inf.verIngrediente') + ' →</a></div></div>');
    });
    H.push('</div></div>');

    /* --- 05 Rutina Lococo (productos reales) ------------------------ */
    var rut = null;
    if (CAT) {
      rut = CAT.rutina(perfil, res);
      H.push(sec('06', T('inf.sProd'), T('inf.sProdDer')));
      H.push('<p class="small" style="margin-bottom:16px">' + T('inf.prodIntro') + '</p>');

      /* El motivo de cada prioridad se enuncia UNA vez. Repetir la misma
         frase bajo los cinco productos no informaba de nada y hacía que la
         recomendación pareciese un molde. */
      H.push('<p class="eyebrow eyebrow--mudo" style="margin-bottom:9px">' +
        T('inf.prodPrio') + '</p><div class="prio-lista">');
      rut.prioridades.forEach(function (q, i) {
        var nom = rut.metas[q.clave] || { es: q.clave, en: q.clave };
        H.push('<div class="prio-fila"><span class="n">' + String(i + 1).padStart(2, '0') +
          '</span><span class="m">' + esc(TX(nom)) + '</span>' +
          '<span class="d">' + esc(TX(q.motivo)) + '</span></div>');
      });
      H.push('</div>');

      rut.pasos.forEach(function (paso, i) {
        H.push('<div class="prod">' +
          '<span class="prod-n">' + String(i + 1).padStart(2, '0') + '</span>' +
          '<div><span class="prod-ranura">' + esc(TX(paso.ranura)) + '</span>' +
          '<div class="prod-marca">' + esc(paso.producto.b) + '</div>' +
          '<div class="prod-nom">' + esc(paso.producto.n) + '</div>' +
          (paso.cubre
            ? '<p class="prod-cubre">' + T('inf.cubre') + ' · <b>' + esc(TX(paso.cubre)) + '</b></p>'
            : '') +
          '<div class="prod-metas">' +
          paso.metas.map(function (m) { return '<span class="prod-meta">' + esc(TX(m)) + '</span>'; }).join('') +
          '</div>' +
          (urlProducto(paso.producto, 'pantalla')
            ? '<a class="prod-link" href="' + esc(urlProducto(paso.producto, 'pantalla')) +
              '" target="_blank" rel="noopener">' + T('inf.verProducto') + ' →</a>'
            : '') + '</div>' +
          '<span class="prod-precio">' + esc(paso.producto.p) + ' €</span></div>');
      });
      H.push('<p class="tiny" style="margin-top:14px">' + T('inf.prodNota') + '</p></div>');
    }

    /* --- 06 Estructura de rutina ------------------------------------ */
    H.push(sec('07', T('inf.s5'), T('inf.s5der')));
    H.push('<div class="rut-grid"><div class="rut"><h4>' + T('inf.manana') + '</h4>');
    rec.manana.forEach(function (p2, i) {
      H.push('<div class="rut-paso"><span class="n">' + (i + 1) + '</span><div>' +
        '<div class="c">' + esc(TX(p2.cat)) + '</div><div class="nt">' + esc(TX(p2.nota)) + '</div></div></div>');
    });
    H.push('</div><div class="rut"><h4>' + T('inf.noche') + '</h4>');
    rec.noche.forEach(function (p2, i) {
      H.push('<div class="rut-paso"><span class="n">' + (i + 1) + '</span><div>' +
        '<div class="c">' + esc(TX(p2.cat)) + '</div><div class="nt">' + esc(TX(p2.nota)) + '</div></div></div>');
    });
    H.push('</div></div></div>');

    /* --- 06 Evitar -------------------------------------------------- */
    H.push(sec('08', T('inf.s6'), ''));
    H.push('<ul class="evitar">');
    rec.evitar.slice(0, MAX_EVITAR).forEach(function (e) { H.push('<li>' + esc(TX(e)) + '</li>'); });
    H.push('</ul></div>');

    /* --- 07 Método -------------------------------------------------- */
    H.push(sec('09', T('inf.s7'), T('inf.s7der')));
    var metodos = [
      [{ es: 'Brillo superficial', en: 'Surface shine', ko: "표면 유분" },
       { es: 'Modelo dicromático de reflexión (Shafer, 1985). La componente especular es acromática, ' +
             'de modo que se suma por igual a R, G y B y eleva el <b>mínimo</b> de los tres canales. ' +
             'Tomando como línea base difusa el percentil 55 de ese canal mínimo sobre piel válida, el ' +
             'exceso por encima es reflexión especular: película sebácea. <b>Limitación:</b> esto mide ' +
             'brillo, no sebo en µg/cm². La correlación con sebumetría es buena pero no es equivalencia, ' +
             'y una base matificante reciente la anula.',
         en: 'Dichromatic reflection model (Shafer, 1985). The specular component is achromatic, so it ' +
             'adds equally to R, G and B and lifts the <b>minimum</b> of the three channels. Taking the ' +
             '55th percentile of that minimum channel over valid skin as the diffuse baseline, everything ' +
             'above it is specular reflection: the sebum film. <b>Limitation:</b> this measures shine, ' +
             'not sebum in µg/cm². Correlation with sebumetry is good but it is not equivalence, and a ' +
             'recent mattifying base wipes it out.',
         ko: "이색성 반사 모델(Shafer, 1985). 정반사 성분은 무채색이라 R·G·B에 똑같이 더해지고 세 채널의 <b>최솟값</b>을 끌어올립니다. 유효 피부 영역에서 그 최소 채널의 55백분위를 확산 반사 기준선으로 삼으면, 그 위로 넘는 부분이 정반사 — 즉 피지막입니다. <b>한계:</b> 이것은 유분의 <b>광택</b>을 재는 것이지 µg/cm² 단위의 피지량이 아닙니다. 피지측정기와 상관관계는 좋지만 동일하지 않으며, 직전에 바른 매트 베이스가 있으면 무력해집니다." }],
      [{ es: 'Índice de eritema', en: 'Erythema index', ko: "홍반지수" },
       { es: 'Índice hemoglobínico 100·log₁₀(R/G) sobre reflectancia linealizada (base de Dawson et al., 1980). ' +
             'La hemoglobina absorbe con fuerza en verde (bandas de 540 y 577 nm) y poco en rojo, de modo que ' +
             'el cociente R/G sigue la concentración de hemoglobina superficial. <b>Limitación:</b> en fototipos ' +
             'altos la melanina compite por la misma señal y comprime el índice; el valor absoluto se lee peor ' +
             'que la comparación entre zonas del mismo rostro.',
         en: 'Haemoglobin index 100·log₁₀(R/G) over linearised reflectance (after Dawson et al., 1980). ' +
             'Haemoglobin absorbs strongly in green (the 540 and 577 nm bands) and weakly in red, so the R/G ' +
             'ratio tracks superficial haemoglobin concentration. <b>Limitation:</b> in darker phototypes ' +
             'melanin competes for the same signal and compresses the index; the absolute value reads worse ' +
             'than the comparison between zones of the same face.',
         ko: "선형화한 반사율에 대한 헤모글로빈 지수 100·log₁₀(R/G) (Dawson 외, 1980 기반). 헤모글로빈은 녹색(540·577 nm 대역)을 강하게, 적색을 약하게 흡수하므로 R/G 비율이 표층 헤모글로빈 농도를 따라갑니다. <b>한계:</b> 어두운 피부형에서는 멜라닌이 같은 신호를 두고 경쟁해 지수를 압축합니다. 절대값보다 같은 얼굴 안의 부위 간 비교가 더 신뢰할 만합니다." }],
      [{ es: 'Densidad de textura', en: 'Texture density', ko: "결 밀도" },
       { es: 'Filtro paso-banda por diferencia de cajas (radio 1 a radio 4) sobre el canal L* de CIELAB. ' +
             'La imagen se reescala a 512 px de ancho útil sobre una anchura bicigomática asumida de 133 mm, ' +
             'lo que fija la escala en ' + mmpx + ' mm/px y sitúa la banda analizada entre 0,26 y 2,08 mm: ' +
             'el tamaño del poro y el microrrelieve. <b>Limitación:</b> el vello facial, el maquillaje con ' +
             'partícula y las gafas entran en la misma banda espacial.',
         en: 'Band-pass filter by box difference (radius 1 to radius 4) over the L* channel of CIELAB. ' +
             'The image is rescaled to 512 px of working width against an assumed bizygomatic breadth of ' +
             '133 mm, which fixes the scale at ' + mmpx + ' mm/px and places the analysed band between ' +
             '0.26 and 2.08 mm: the size of pores and microrelief. <b>Limitation:</b> facial hair, ' +
             'particle make-up and glasses all fall in the same spatial band.',
         ko: "CIELAB의 L* 채널에 대해 박스 차분(반경 1~4)으로 만든 대역통과 필터. 광대뼈 사이 너비를 133 mm로 가정하고 유효 폭 512 px로 재조정하므로 척도가 고정되고, 분석 대역이 0.26~2.08 mm — 모공과 미세 요철의 크기 — 에 놓입니다. <b>한계:</b> 얼굴 솜털, 입자가 든 메이크업, 안경이 모두 같은 공간 대역에 들어옵니다." }],
      [{ es: 'Imperfecciones focales', en: 'Focal blemishes', ko: "국소 잡티" },
       { es: 'Sobre el mapa de eritema se resta su mediana local de radio 18 px (≈ 4,7 mm) para eliminar el ' +
             'rubor difuso y dejar sólo lo focal. El umbral es local, no global: se estima el ruido en un ' +
             'entorno de 6 mm y se exige z > 2,5, porque un umbral único se desbordaba alrededor de los ' +
             'brillos y llenaba la frente de focos inexistentes. <b>Limitación:</b> no distingue una pápula ' +
             'activa de una mácula posinflamatoria ni de un lunar plano enrojecido. Cuenta focos, no ' +
             'diagnostica lesiones.',
         en: 'The local median of radius 18 px (≈ 4.7 mm) is subtracted from the erythema map to remove ' +
             'diffuse flush and leave only focal signal. The threshold is local, not global: noise is ' +
             'estimated over a 6 mm neighbourhood and z > 2.5 is required, because a single global threshold ' +
             'overflowed around specular highlights and filled the forehead with foci that were not there. ' +
             '<b>Limitation:</b> it does not distinguish an active papule from a post-inflammatory macule ' +
             'or a reddened flat mole. It counts foci; it does not diagnose lesions.',
         ko: "홍반 맵에서 반경 18 px(≈ 4.7 mm)의 국소 중앙값을 빼 확산성 붉은기를 제거하고 국소 신호만 남깁니다. 임계값은 전역이 아니라 <b>국소</b>입니다 — 6 mm 이웃에서 노이즈를 추정하고 z > 2.5를 요구합니다. 전역 임계값 하나로는 정반사 주변에서 넘쳐 이마에 없는 병변을 만들어냈기 때문입니다. <b>한계:</b> 활동성 구진과 염증 후 색소반, 붉어진 편평 점을 구분하지 못합니다. 병변을 세는 것이지 진단하지 않습니다." }],
      [{ es: 'Tono y ángulo tipológico', en: 'Tone and typology angle', ko: "피부톤과 유형각" },
       { es: 'Conversión sRGB → XYZ → CIELAB con iluminante D65 y observador 2°, y cálculo del Individual ' +
             'Typology Angle (Chardon et al., 1991), ITA = arctan((L*−50)/b*)·180/π. Es el estándar de la ' +
             'industria cosmética para clasificar tono constitutivo. <b>Limitación:</b> depende por completo ' +
             'del balance de blancos; sin referencia acromática fiable el ángulo se desplaza.',
         en: 'sRGB → XYZ → CIELAB conversion with D65 illuminant and 2° observer, then the Individual ' +
             'Typology Angle (Chardon et al., 1991), ITA = arctan((L*−50)/b*)·180/π. It is the cosmetic ' +
             'industry standard for classifying constitutive tone. <b>Limitation:</b> it depends entirely ' +
             'on white balance; without a reliable achromatic reference the angle shifts.',
         ko: "D65 광원·2° 관찰자 기준으로 sRGB → XYZ → CIELAB 변환 후 개인 유형각(Chardon 외, 1991) ITA = arctan((L*−50)/b*)·180/π 를 계산합니다. 고유 피부톤 분류에 쓰이는 화장품 업계 표준입니다. <b>한계:</b> 화이트 밸런스에 전적으로 의존합니다 — 신뢰할 만한 무채색 기준이 없으면 각도가 밀립니다." }],
      [{ es: 'Normalización cromática', en: 'Chromatic normalisation', ko: "색보정" },
       { es: (res.wb.aplicado
               ? 'Aplicada. Se localizaron ' + res.wb.n + ' píxeles acromáticos de esclerótica y se usaron ' +
                 'como referencia de blanco por el método de von Kries, con ganancias R/G/B de ' +
                 res.wb.ganancia.map(function (x) { return nf(x, 3); }).join(' / ') + '.'
               : 'No aplicada en esta sesión: no se encontró una referencia acromática válida en las cajas ' +
                 'oculares. Los valores colorimétricos absolutos (ITA y eritema) pierden precisión, aunque ' +
                 'la comparación entre zonas sigue siendo válida porque todas comparten el mismo sesgo.') +
             ' La esclerótica es la única superficie acromática fiable presente en un retrato, y es lo que ' +
             'permite comparar dos sesiones hechas con luces distintas.',
         en: (res.wb.aplicado
               ? 'Applied. ' + res.wb.n + ' achromatic sclera pixels were located and used as the white ' +
                 'reference by the von Kries method, with R/G/B gains of ' +
                 res.wb.ganancia.map(function (x) { return nf(x, 3); }).join(' / ') + '.'
               : 'Not applied in this session: no valid achromatic reference was found in the eye boxes. ' +
                 'Absolute colorimetric values (ITA and erythema) lose precision, though comparison between ' +
                 'zones remains valid because they all share the same bias.') +
             ' The sclera is the only reliable achromatic surface present in a portrait, and it is what ' +
             'makes two sessions shot under different lights comparable.',
         ko: (res.wb.aplicado
               ? '적용됨. 공막에서 무채색 화소 ' + res.wb.n + '개를 찾아 von Kries 방식의 화이트 ' +
                 '레퍼런스로 사용했으며, R/G/B 게인은 ' +
                 res.wb.ganancia.map(function (x) { return nf(x, 3); }).join(' / ') + ' 입니다.'
               : '이번 세션에서는 적용되지 않았습니다 — 눈 영역에서 유효한 무채색 기준을 찾지 못했습니다. ' +
                 'ITA와 홍반 같은 절대 색채값의 정밀도가 떨어지지만, 모든 부위가 동일한 편향을 공유하므로 ' +
                 '부위 간 비교는 여전히 유효합니다.') +
             ' 공막은 인물 사진에 존재하는 유일하게 신뢰할 만한 무채색 면이며, 서로 다른 조명에서 찍은 ' +
             '두 세션을 비교 가능하게 만드는 근거입니다.' }],
      [{ es: 'Sistema de referencia espacial', en: 'Spatial reference system', ko: "공간 기준계" },
       { es: 'No se usa un modelo de puntos faciales. La cara se alinea contra un retículo fijo y las zonas se ' +
             'definen geométricamente en ese sistema de coordenadas, igual que un dermatoscopio de consulta ' +
             'fija la cabeza con un reposacabezas. Es más reproducible entre sesiones y no depende de descargar ' +
             'ningún modelo. <b>Limitación:</b> exige que el encuadre sea correcto, y por eso la captura está ' +
             'condicionada a las cinco comprobaciones de la fase anterior.',
         en: 'No facial landmark model is used. The face is aligned against a fixed reticle and the zones are ' +
             'defined geometrically in that coordinate system, the same way a clinic dermatoscope fixes the ' +
             'head with a chin rest. It is more reproducible between sessions and depends on downloading no ' +
             'model at all. <b>Limitation:</b> it demands correct framing, which is why capture is gated on ' +
             'the five checks of the previous step.',
         ko: "얼굴 랜드마크 모델을 쓰지 않습니다. 고정된 조준 타원에 얼굴을 맞추고 그 좌표계 위에서 부위를 기하학적으로 정의합니다 — 진료실 더모스코프가 턱받침으로 머리를 고정하는 것과 같은 원리입니다. 세션 간 재현성이 더 높고 어떤 모델도 내려받을 필요가 없습니다. <b>한계:</b> 구도가 정확해야 하며, 그래서 촬영이 앞 단계의 다섯 가지 검사에 걸려 있습니다." }]
    ];
    metodos.forEach(function (m) {
      H.push('<details class="metodo"><summary>' + esc(TX(m[0])) + '</summary>' +
        '<div class="cuerpo">' + TX(m[1]) + '</div></details>');
    });
    H.push('</div>');

    /* --- 08 Condiciones --------------------------------------------- */
    if (MOSTRAR_SESION) {
    H.push(sec('10', T('inf.s8'), T('inf.s8der')));
    H.push('<div class="conf-grid"><div style="text-align:center">' +
      '<div class="conf-num">' + res.confianza + '</div>' +
      '<p class="eyebrow eyebrow--mudo" style="margin-top:5px">' + T('inf.confianza') + '</p></div><div>');
    if (res.notasConfianza.length) {
      H.push('<p class="small">' + T('inf.reducen') +
        res.notasConfianza.map(function (n) { return esc(TX(n)); }).join(' · ') + '.</p>');
    } else {
      H.push('<p class="small">' + T('inf.sinIncidencias') + '</p>');
    }
    H.push('</div></div>');

    var c = S.condiciones || {};
    var modo = S.modoFoto === 'directo' ? T('inf.directo')
             : S.modoFoto === 'prevista' ? T('inf.prevista') : T('inf.sistema');
    H.push('<div class="spec" style="margin-top:20px">');
    [
      [T('inf.sesion'), S.sesionId],
      [T('inf.equipo'), S.equipo + ' · ' + modo],
      [T('inf.fecha'), S.inicio.toLocaleString(I.idioma() === 'es' ? 'es-ES' : I.idioma() === 'ko' ? 'ko-KR' : 'en-GB')],
      [T('inf.cobertura'), TF('inf.coberturaV', { v: nf(g.cobertura * 100, 1) })],
      [T('inf.escala'), TF('inf.escalaV', { v: mmpx })],
      [T('inf.bb'), res.wb.aplicado ? TF('inf.bbSi', { n: res.wb.n }) : T('inf.bbNo')],
      [T('inf.expMedia'), c.exposicion ? TF('inf.expMediaV', { v: c.exposicion.texto }) : '—'],
      [T('inf.deseq'), c.uniformidad ? c.uniformidad.texto + ' %' : '—'],
      [T('inf.nitidez'), c.enfoque ? c.enfoque.texto + ' σ² lap' : '—']
    ].forEach(function (r) {
      H.push('<div class="spec-row"><span class="k">' + esc(r[0]) + '</span>' +
        '<span class="v">' + esc(r[1]) + '</span></div>');
    });
    H.push('</div></div>');
    }

    /* --- Legal + evento --------------------------------------------- */
    if (MOSTRAR_LEGAL) {
      H.push('<div class="legal">' + T('legal') +
        '<br><a class="enlace-priv" href="/privacidad" target="_blank" rel="noopener">' + T('priv.enlace') + '</a></div>');
    }

    H.push('<div class="evento"><div>' +
      '<p class="eyebrow">' + T('evento.eyebrow') + '</p>' +
      '<p class="display" style="margin-top:8px">Beauty Inside &amp; Out</p>' +
      '<p class="tiny" style="margin-top:8px;max-width:52ch">' + T('evento.nota') + '</p></div>' +
      '<div class="btn-row"><button class="btn btn--sm" id="btn-imprimir">' +
      T('evento.imprimir') + '</button>' +
      '<button class="btn btn--solido btn--sm" id="btn-fin">' + T('evento.finalizar') + '</button>' +
      '<p class="cor-envio" id="envio-eco" style="width:100%;margin:0"></p></div></div>');

    var y = window.scrollY;
    $('informe').innerHTML = H.join('');
    irA(F_INFORME);
    if (conservarScroll) window.scrollTo(0, y);

    if (MOSTRAR_LUPA) pintarLupas(res);

    /* Interacciones del informe */
    var mapaActual = 'eritema';
    function pintarMapa() {
      $('mapa-svg').innerHTML = svgMapa(mapaActual, res);
      $('mapa-leyenda').innerHTML = leyenda(mapaActual, res);
    }
    pintarMapa();
    Array.prototype.forEach.call($('seg-mapa').children, function (b) {
      b.addEventListener('click', function () {
        mapaActual = b.dataset.m;
        Array.prototype.forEach.call($('seg-mapa').children, function (o) {
          o.setAttribute('aria-pressed', o === b ? 'true' : 'false');
        });
        pintarMapa();
      });
    });
    $('btn-imprimir').addEventListener('click', function () { window.print(); });
    $('btn-fin').addEventListener('click', reiniciarSesion);

    if (!conservarScroll) enviarInforme(res, perfil, rec, typeof rut !== 'undefined' ? rut : null);
    if (!conservarScroll) guardarAnalisis(res, perfil, typeof rut !== 'undefined' ? rut : null);
  }

  /* ---------------------------------------------------------- ENVÍO
     El informe de pantalla no sirve como correo: los clientes de correo no
     entienden variables CSS, cuadrículas ni SVG, y muchos fuerzan fondo
     claro. Se compone una versión aparte, con tablas y estilos en línea,
     que es lo único que sobrevive en Gmail y Outlook. */

  /* Paleta del correo: azul de marca Lococo (#2966FF) sobre blanco y un
     azul muy pálido para los bloques. Sin espaciado de letras: en coreano el
     tracking abierto separa las sílabas y se lee mal.
     Colores explícitos en todo: Gmail y Outlook ignoran variables CSS. */
  var CO = { fondo: '#F2F5FB', papel: '#FFFFFF', tinta: '#111827', suave: '#6B7280', linea: '#E6EAF2',
             azul: '#2966FF', palido: '#F3F6FF', borde: '#DCE5FF',
             ok: '#2966FF', mid: '#E0A100', hi: '#F2762E', max: '#E5484D' };
  var FUENTE = "-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic','Segoe UI',Roboto,Helvetica,Arial,sans-serif";

  function tituloCorreo(t, sub) {
    return '<tr><td style="padding:34px 0 14px">' +
      '<table role="presentation" cellpadding="0" cellspacing="0"><tr>' +
      '<td style="width:4px;background:' + CO.azul + ';border-radius:2px">&nbsp;</td>' +
      '<td style="padding-left:10px;font-size:18px;font-weight:700;color:' + CO.tinta + ';letter-spacing:-0.3px">' + t + '</td>' +
      '</tr></table>' +
      (sub ? '<p style="margin:6px 0 0;font-size:13px;color:' + CO.suave + ';letter-spacing:-0.2px">' + sub + '</p>' : '') +
      '</td></tr>';
  }

  /* Barra horizontal hecha con dos celdas: es la única forma de dibujar un
     indicador que se vea igual en Gmail, Apple Mail y Outlook. */
  function barraCorreo(pct, color) {
    pct = Math.max(3, Math.min(100, Math.round(pct)));
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">' +
      '<tr><td width="' + pct + '%" style="height:8px;background:' + color + ';border-radius:4px;font-size:0;line-height:0">&nbsp;</td>' +
      (pct < 100 ? '<td style="height:8px;background:' + CO.palido + ';border-radius:0 4px 4px 0;font-size:0;line-height:0">&nbsp;</td>' : '') +
      '</tr></table>';
  }

  function correoHTML(res, perfil, rec, rut) {
    var g = res.global, H = [];
    var fecha = S.inicio.toLocaleDateString(I.idioma() === 'ko' ? 'ko-KR' : I.idioma() === 'en' ? 'en-GB' : 'es-ES',
      { day: 'numeric', month: 'long', year: 'numeric' });
    var ls = ';letter-spacing:-0.2px';

    H.push('<div style="margin:0;padding:28px 12px;background:' + CO.fondo + ';font-family:' + FUENTE + '">' +
      '<table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" ' +
      'style="max-width:600px;margin:0 auto;background:' + CO.papel + ';border-radius:20px;border-collapse:separate;overflow:hidden">');

    /* Hero azul */
    H.push('<tr><td style="background:' + CO.azul + ';padding:30px 28px 28px;border-radius:20px 20px 0 0">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
      /* Logo alojado en este mismo origen: los clientes de correo bloquean
         las imágenes en data:, y con location.origin sigue valiendo si la
         página cambia de dominio. 360 px de ancho, se muestra a 120 (3x). */
      '<td><img src="' + location.origin + '/img/lococo-logo-white.png" width="120" height="' + 28 +
      '" alt="Lococo" style="display:block;border:0;outline:none;width:120px;height:auto"></td>' +
      '<td align="right" style="font-size:12px;color:#DCE5FF' + ls + '">' + esc(fecha) + '</td></tr></table>' +
      '<p style="margin:30px 0 6px;font-size:14px;color:#DCE5FF' + ls + '">' + T('correo.hola') + '</p>' +
      '<h1 style="margin:0 0 8px;font-size:30px;line-height:1.25;font-weight:800;color:#FFFFFF;letter-spacing:-0.8px">' +
      esc(TX(g.patron.etiqueta)) + '</h1>' +
      '<p style="margin:0;font-size:14px;line-height:1.6;color:#E8EEFF' + ls + '">' +
      TF('inf.tono', { t: esc(TX(g.tono.cat)), i: nf(g.ITA, 1), c: g.tono.codigo }) + '</p>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ' +
      'style="margin-top:24px;border-collapse:separate;border-spacing:0"><tr>');
    ['DO', 'SR', 'PN', 'WT'].forEach(function (k, i) {
      var e = perfil.ejes[k];
      H.push('<td width="25%" align="center" style="padding:0 ' + (i < 3 ? '6px' : '0') + ' 0 0">' +
        '<div style="background:#FFFFFF;border-radius:14px;padding:16px 4px 14px">' +
        '<div style="font-size:30px;font-weight:800;color:' + CO.azul + ';line-height:1">' + e.letra + '</div>' +
        '<div style="margin-top:8px;font-size:12.5px;font-weight:600;line-height:1.3;color:' + CO.tinta + ls + '">' +
        esc(TX(e.etiqueta)) + '</div></div></td>');
    });
    H.push('</tr></table>' +
      '<p style="margin:14px 0 0;font-size:12.5px;color:#DCE5FF' + ls + '">' + T('correo.tipo') +
      ' <b style="color:#FFFFFF;letter-spacing:1px">' + perfil.codigo + '</b></p></td></tr>');

    H.push('<tr><td style="padding:4px 28px 30px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">');

    /* Medición óptica */
    H.push(tituloCorreo(T('inf.s1'), T('correo.medido')));
    H.push('<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">');
    res.metricas.forEach(function (m, i) {
      var col = CO[m.banda.clave] || CO.mid;
      H.push('<tr><td style="padding:14px 0;' + (i ? 'border-top:1px solid ' + CO.linea : '') + '">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
        '<td style="font-size:15px;font-weight:700;color:' + CO.tinta + ls + '">' + esc(TX(m.nombre)) + '</td>' +
        '<td align="right"><span style="display:inline-block;padding:3px 10px;border-radius:10px;background:' +
        (m.banda.clave === 'ok' ? CO.palido : '#FFF6EC') + ';font-size:12px;font-weight:700;color:' + col + ls + '">' +
        esc(TX(m.banda.etiqueta)) + '</span></td></tr></table>' +
        '<div style="padding:9px 0 6px">' + barraCorreo(m.indice, CO.azul) + '</div>' +
        '<div style="font-size:12px;color:' + CO.suave + ls + '">' + esc(TX(m.fisico)) + '</div>' +
        '</td></tr>');
    });
    H.push('</table></td></tr>');

    /* Lo que la cámara no mide: se declara como tal */
    if (MOSTRAR_CUESTIONARIO) {
    H.push(tituloCorreo(T('inf.s3'), T('correo.declarado')));
    H.push('<tr><td style="background:' + CO.palido + ';border-radius:14px;padding:8px 18px">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">');
    var filas = [[T('inf.hidrat'), TX(perfil.hidratacion.etiqueta)]];
    ['DO', 'SR', 'PN', 'WT'].forEach(function (k) {
      var d = perfil.definiciones[k];
      filas.push([TX(d.neg) + ' · ' + TX(d.pos), TX(perfil.ejes[k].etiqueta)]);
    });
    filas.forEach(function (f, i) {
      H.push('<tr><td style="padding:10px 0;font-size:14px;color:' + CO.suave + ls +
        (i ? ';border-top:1px solid ' + CO.borde : '') + '">' + esc(f[0]) + '</td>' +
        '<td align="right" style="padding:10px 0;font-size:14px;font-weight:700;color:' + (i ? CO.tinta : CO.azul) + ls +
        (i ? ';border-top:1px solid ' + CO.borde : '') + '">' + esc(f[1]) + '</td></tr>');
    });
    H.push('</table></td></tr>');
    }

    /* Rutina Lococo */
    if (rut && rut.pasos.length) {
      H.push(tituloCorreo(T('inf.sProd'), T('correo.pasos')));
      rut.pasos.forEach(function (paso, i) {
        H.push('<tr><td style="padding:0 0 10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" ' +
          'style="border:1px solid ' + CO.linea + ';border-radius:14px;border-collapse:separate"><tr>' +
          '<td width="44" valign="top" style="padding:18px 0 0 16px">' +
          '<div style="width:28px;height:28px;line-height:28px;border-radius:14px;background:' + CO.azul +
          ';color:#FFFFFF;font-size:14px;font-weight:800;text-align:center">' + (i + 1) + '</div></td>' +
          '<td style="padding:16px 12px 16px 10px">' +
          '<div style="font-size:12px;font-weight:700;color:' + CO.azul + ls + '">' + esc(TX(paso.ranura)) + '</div>' +
          '<div style="margin-top:4px;font-size:15px;line-height:1.4;color:' + CO.tinta + ls + '"><b>' + esc(paso.producto.b) + '</b><br>' +
          esc(paso.producto.n) + '</div>' +
          (paso.cubre ? '<div style="margin-top:6px;font-size:12px;color:' + CO.suave + ls + '">' + T('inf.cubre') + ' · ' + esc(TX(paso.cubre)) + '</div>' : '') +
          (urlProducto(paso.producto, 'email')
            ? '<a href="' + esc(clicCorreo(urlProducto(paso.producto, 'email'), 'producto')) + '" style="display:inline-block;margin-top:10px;font-size:13px;font-weight:700;color:' +
              CO.azul + ';text-decoration:none' + ls + '">' + T('inf.verProducto') + ' →</a>'
            : '') +
          '</td><td align="right" valign="top" style="padding:18px 16px 0 0;font-size:15px;font-weight:800;color:' + CO.tinta +
          ';white-space:nowrap">' + esc(paso.producto.p) + ' €</td></tr></table></td></tr>');
      });
    }

    /* Activos, como etiquetas */
    H.push(tituloCorreo(T('inf.s4'), ''));
    H.push('<tr><td style="line-height:2.4">');
    P.ingredientesTienda(perfil, res, 3).forEach(function (a) {
      H.push('<a href="' + esc(clicCorreo(urlTienda(a.url, 'email'), 'ingrediente')) + '" style="display:inline-block;margin:0 6px 8px 0;padding:6px 13px;border-radius:16px;background:' +
        CO.palido + ';font-size:13px;font-weight:600;line-height:1.4;color:' + CO.azul + ';text-decoration:none' + ls + '">' + esc(TX(a.n)) + ' →</a>');
    });
    H.push('</td></tr>');

    /* Pie */
    H.push('<tr><td style="padding:28px 0 0"><p style="margin:0;padding:16px 18px;background:' + CO.fondo +
      ';border-radius:14px;font-size:12px;line-height:1.7;color:' + CO.suave + ls + '">' + T('legal') + '</p>' +
      '<p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:' + CO.suave + ls + '">' + T('correo.privacidad') + '</p>' +
      '</td></tr>');

    H.push('</table></td></tr></table>' +
      '<p style="margin:18px 0 0;text-align:center;font-size:12px;color:' + CO.suave + ls + '">' +
      'Lococo × Oki Doki Labs · Madrid 2026</p></div>');
    return H.join('');
  }

  /* Se dispara una vez, al terminar el informe. No bloquea: quien está
     delante ya tiene sus resultados en pantalla. */
  /* Registro del análisis (2026-09-26, a petición de Lococo): resultados,
     el correo del paso 2 (si lo dejó) y la foto de la zona útil (JPEG
     512 px). El servidor borra las fotos a los 30 días. Se explica en
     /privacidad, enlazada desde la portada; Lococo decidió no pedir casilla
     aparte.
     El informe de ejemplo («test») no se registra. Un fallo aquí no afecta
     al visitante. */
  function guardarAnalisis(res, perfil, rut) {
    if (S.analisisGuardado || S.modoFoto === 'prevista' || !res) return;
    S.analisisGuardado = true;
    var g = res.global;
    var datos = {
      sesion: S.sesionId, idioma: I.idioma(), modo: S.modoFoto || '',
      codigo: perfil.codigo, tono: g.tono && g.tono.codigo, ITA: +g.ITA.toFixed(1),
      patron: g.patron && g.patron.clave, confianza: res.confianza,
      metricas: res.metricas.map(function (m) {
        return { id: m.id, valor: +(+m.valor).toFixed(2), indice: Math.round(m.indice) };
      }),
      zonas: res.zonas.map(function (z) {
        return { id: z.id, valido: !!z.valido, EI: z.EI, brillo: z.brilloArea, textura: z.textura, ITA: z.ITA, lesiones: z.lesiones };
      }),
      respuestas: S.respuestas.slice(),
      productos: rut && rut.pasos ? rut.pasos.map(function (p) { return p.producto.b + ' · ' + p.producto.n; }) : [],
      email: S.correo || null
    };
    if (res.util && res.util.canvas) {
      try { datos.foto = res.util.canvas.toDataURL('image/jpeg', 0.82); } catch (e) {}
    }
    fetch('/api/analisis', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(datos)
    }).catch(function () {});
  }

  function enviarInforme(res, perfil, rec, rut) {
    if (!S.puedeEnviar || !S.correo || !S.consintioSalud || S.informeEnviado) return;
    S.informeEnviado = true;

    var eco = $('envio-eco');
    if (eco) { eco.className = 'cor-envio'; eco.textContent = T('cor.envEnviando'); }

    fetch('/api/informe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: S.correo,
        asunto: T('correo.asunto'),
        html: correoHTML(res, perfil, rec, rut),
        consentimientoSalud: true
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      if (eco) { eco.className = 'cor-envio ok'; eco.textContent = TF('cor.envHecho', { e: S.correo }); }
    }).catch(function () {
      S.informeEnviado = false;
      if (eco) { eco.className = 'cor-envio mal'; eco.textContent = T('cor.envFallo'); }
    });
  }

  /* ------------------------------------------------------- INACTIVIDAD */
  var tIdle = null, tCuentaIdle = null;
  function reiniciarInactividad() {
    clearTimeout(tIdle);
    if (S.fase !== F_INFORME) return;         // sólo vigila el informe
    tIdle = setTimeout(avisarInactividad, 4 * 60 * 1000);
  }
  function avisarInactividad() {
    var n = 20, dlg = $('dlg-idle');
    $('idle-seg').textContent = n;
    if (typeof dlg.showModal === 'function' && !dlg.open) dlg.showModal();
    tCuentaIdle = setInterval(function () {
      n--; $('idle-seg').textContent = n;
      if (n <= 0) { clearInterval(tCuentaIdle); dlg.close(); reiniciarSesion(); }
    }, 1000);
  }
  function cancelarIdle() {
    clearInterval(tCuentaIdle);
    var dlg = $('dlg-idle');
    if (dlg.open) dlg.close();
    reiniciarInactividad();
  }

  function reiniciarSesion() {
    clearInterval(tCuentaIdle); clearTimeout(tIdle); clearTimeout(tPrep);
    $('btn-atras').parentNode.hidden = false; $('q-prog').hidden = false;
    var dlg = $('dlg-idle'); if (dlg.open) dlg.close();
    detenerCamara();
    // Destrucción de los datos de la sesión
    S.ctx.clearRect(0, 0, E.CANVAS_W, E.CANVAS_H);
    var pv = $('preview');
    pv.getContext('2d').clearRect(0, 0, pv.width, pv.height);
    pv.width = 1; pv.height = 1;
    S.optico = null; S.perfil = null; S.respuestas = []; S.qIndex = 0;
    S.condiciones = null; S.seguidas = 0;
    $('informe').innerHTML = '';
    $('log').innerHTML = '';
    $('correo').value = '';
    $('cor-consent').checked = false;
    S.correo = null; S.consintioSalud = false;
    S.analisisGuardado = false;
    $('video').hidden = false;
    S.inicio = new Date();
    iniciarHud();
    irA(F_INTRO);
  }

  /* --------------------------------------------------------- ARRANQUE */
  function init() {
    S.lienzo = document.createElement('canvas');
    S.lienzo.width = E.CANVAS_W; S.lienzo.height = E.CANVAS_H;
    S.ctx = S.lienzo.getContext('2d', { willReadFrequently: true });

    iniciarHud();
    pintarRail();
    pintarChecks(checksVacios());

    if (CAL) {
      CAL.montar({
        seccion: $('s-calibracion'),
        nuevaMuestra: function () { S.calibrando = true; irA(F_CAPTURA); arrancarCamara(); },
        salir: function () { S.calibrando = false; reiniciarSesion(); }
      });
      // El modo técnico responde también si se añade el hash con la página ya
      // abierta: obligar a recargar para entrar sería una trampa innecesaria.
      window.addEventListener('hashchange', function () {
        if (enCalibracion()) mostrarCalibracion();
        else if (S.fase === F_CALIB) { S.calibrando = false; reiniciarSesion(); }
      });
      if (enCalibracion()) mostrarCalibracion();
    }

    /* Tres disparadores, porque uno solo no basta: el evento de matchMedia no
       llega en todos los entornos, y colocar mal el panel deja al usuario sin
       ver qué condición falla. Reubicar es idempotente, así que sobra con que
       alguno de los tres acierte. */
    I.aplicarEstaticos();
    pintarIdioma();
    $('hud-lang').addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('button[data-lang]') : null;
      if (b) I.fijar(b.getAttribute('data-lang'));
    });
    I.alCambiar(function () { pintarIdioma(); aplicarModoCorreo(); rerenderizar(); });

    consultarCapacidad();

    colocarChecks();
    if (mqEstrecho.addEventListener) mqEstrecho.addEventListener('change', colocarChecks);
    else if (mqEstrecho.addListener) mqEstrecho.addListener(colocarChecks);
    window.addEventListener('resize', colocarChecks);

    $('btn-empezar').addEventListener('click', function () { irA(F_CORREO); pintarCorreo(); });
    $('btn-correo-ok').addEventListener('click', enviarCorreo);
    $('btn-correo-saltar').addEventListener('click', irACaptura);
    $('correo').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') enviarCorreo();
    });
    $('btn-capturar').addEventListener('click', capturar);
    $('btn-repetir').addEventListener('click', function () { irA(F_CAPTURA); arrancarCamara(); });
    $('file-input').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) desdeArchivo(e.target.files[0]);
    });
    $('btn-atras').addEventListener('click', function () {
      if (S.qIndex > 0) { S.qIndex--; pintarPregunta(); }
    });
    $('btn-sigo').addEventListener('click', cancelarIdle);
    $('btn-cerrar-ya').addEventListener('click', function () {
      clearInterval(tCuentaIdle); $('dlg-idle').close(); reiniciarSesion();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      // Los temporizadores han estado congelados: recuperar sin esperar.
      if (S.revelando) volcarAnalisis();
      if (S.fase === F_CAPTURA && !S.stream && S.modoFoto === 'directo' && $('preview').hidden) arrancarCamara();
      reiniciarInactividad();
    });

    ['pointerdown', 'keydown'].forEach(function (ev) {
      document.addEventListener(ev, function () {
        if (!$('dlg-idle').open) reiniciarInactividad();
      }, { passive: true });
    });
  }

  /* ------------------------------------------------------------- PREVISTA
     Renderiza un informe completo sin pasar por la cámara ni por los tiempos
     de lectura. Pensado para que el equipo revise la maqueta del informe
     antes del evento, y para poder verificar la salida en un entorno sin
     cámara. Uso desde la consola:

       ESPEJO_DEMO()                 → rostro sintético y respuestas medias
       ESPEJO_DEMO(canvas)           → una imagen propia
       ESPEJO_DEMO(canvas, [0,1,...]) → además, respuestas concretas          */
  function rostroSintetico() {
    var c = document.createElement('canvas');
    c.width = E.CANVAS_W; c.height = E.CANVAS_H;
    var x = c.getContext('2d');
    var R = E.RETICLE;
    var PX = function (n) { return R.x + n * R.w; }, PY = function (n) { return R.y + n * R.h; };
    x.fillStyle = '#2b2b2e'; x.fillRect(0, 0, c.width, c.height);
    x.save();
    x.beginPath(); x.ellipse(360, 480, 268, 372, 0, 0, 7); x.clip();
    x.fillStyle = 'rgb(219,172,144)'; x.fillRect(0, 0, c.width, c.height);
    [[0.245, 0.555], [0.755, 0.555]].forEach(function (p) {
      var g = x.createRadialGradient(PX(p[0]), PY(p[1]), 4, PX(p[0]), PY(p[1]), 95);
      g.addColorStop(0, 'rgba(205,90,70,.40)'); g.addColorStop(1, 'rgba(205,90,70,0)');
      x.fillStyle = g; x.beginPath(); x.arc(PX(p[0]), PY(p[1]), 95, 0, 7); x.fill();
    });
    [[0.50, 0.19, 58], [0.50, 0.50, 24], [0.50, 0.33, 18]].forEach(function (p) {
      var g = x.createRadialGradient(PX(p[0]), PY(p[1]), 2, PX(p[0]), PY(p[1]), p[2]);
      g.addColorStop(0, 'rgba(255,252,248,.74)'); g.addColorStop(1, 'rgba(255,252,248,0)');
      x.fillStyle = g; x.beginPath(); x.arc(PX(p[0]), PY(p[1]), p[2], 0, 7); x.fill();
    });
    var sm = 2024, rnd = function () { return (sm = (sm * 1103515245 + 12345) % 2147483648) / 2147483648; };
    for (var i = 0; i < 16; i++) {
      x.fillStyle = 'rgba(178,58,44,.72)';
      x.beginPath(); x.arc(PX(0.20 + rnd() * 0.60), PY(0.14 + rnd() * 0.74), 2.6 + rnd() * 2.4, 0, 7); x.fill();
    }
    [[0.30, 0.405], [0.70, 0.405]].forEach(function (p) {
      x.fillStyle = '#f2f2ee'; x.beginPath(); x.ellipse(PX(p[0]), PY(p[1]), 46, 19, 0, 0, 7); x.fill();
      x.fillStyle = '#4a3524'; x.beginPath(); x.arc(PX(p[0]), PY(p[1]), 17, 0, 7); x.fill();
      x.fillStyle = '#1a1210'; x.beginPath(); x.arc(PX(p[0]), PY(p[1]), 7, 0, 7); x.fill();
    });
    x.fillStyle = '#5a4331';
    [[0.30, 0.345], [0.70, 0.345]].forEach(function (p) {
      x.beginPath(); x.ellipse(PX(p[0]), PY(p[1]), 50, 8, 0, 0, 7); x.fill();
    });
    x.fillStyle = '#a85a55'; x.beginPath(); x.ellipse(PX(0.5), PY(0.715), 62, 24, 0, 0, 7); x.fill();
    x.restore();
    var d = x.getImageData(0, 0, c.width, c.height), px = d.data;
    for (i = 0; i < px.length; i += 4) {
      var n = (Math.random() - 0.5) * 12;
      px[i] += n; px[i + 1] += n * 0.9; px[i + 2] += n * 0.8;
    }
    x.putImageData(d, 0, 0);
    return c;
  }

  window.ESPEJO_CUESTIONARIO = function () {
    S.ctx.clearRect(0, 0, E.CANVAS_W, E.CANVAS_H);
    S.ctx.drawImage(rostroSintetico(), 0, 0, E.CANVAS_W, E.CANVAS_H);
    S.condiciones = E.evaluarEncuadre(S.ctx);
    S.modoFoto = 'prevista';            // no se registra (ver guardarAnalisis)
    S.optico = E.analizar(S.lienzo);
    S.respuestas = []; S.qIndex = 0; S.revelando = false;
    irA(F_CUEST);
    pintarPregunta();
  };

  window.ESPEJO_DEMO = function (fuente, respuestas) {
    S.ctx.clearRect(0, 0, E.CANVAS_W, E.CANVAS_H);
    S.ctx.drawImage(fuente || rostroSintetico(), 0, 0, E.CANVAS_W, E.CANVAS_H);
    S.condiciones = E.evaluarEncuadre(S.ctx);
    S.modoFoto = 'prevista';
    S.optico = E.analizar(S.lienzo);
    S.respuestas = respuestas || P.PREGUNTAS.map(function (q, i) {
      return Math.min(q.ops.length - 1, i % q.ops.length);
    });
    S.revelando = false;
    construirInforme();
    return S.optico;
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
