/* ==========================================================================
   ESPEJO · Banco de calibración
   --------------------------------------------------------------------------
   Las bandas que convierten magnitud física en índice 0–100 se fijaron sobre
   imágenes sintéticas. Esto sirve para rehacerlas con rostros reales del
   propio equipo, capturados con la MISMA tableta y la MISMA luz del puesto.

   Método: se toman entre 15 y 20 muestras, se leen las cinco magnitudes
   físicas de cada una y se colocan los extremos de cada banda en los
   percentiles 10 y 90 observados. Así, en el evento, una piel corriente cae
   a media escala y sólo los extremos reales marcan «alto».

   Sólo se guardan NÚMEROS. Ninguna imagen se almacena ni sale del navegador.
   Oculto tras #calibrar: un visitante no llega aquí por accidente.
   ========================================================================== */
(function (global) {
  'use strict';

  var E = global.ESPEJO_ENGINE;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  var nf = function (v, d) {
    return Number(v).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
  };

  var CLAVE = 'espejo.calibracion.v1';
  var MIN_MUESTRAS = 15;

  /* Cada métrica: de dónde sale el valor físico, cómo se presenta y a qué
     entrada de BANDAS corresponde. */
  var METRICAS = [
    { id: 'brillo', nom: 'Brillo zona T', uni: '% área', dec: 1, escala: 100,
      leer: function (g) { return g.brilloT; } },
    { id: 'eritema', nom: 'Índice de eritema', uni: 'UI', dec: 2, escala: 1,
      leer: function (g) { return g.eritema; } },
    { id: 'textura', nom: 'Densidad de textura', uni: 'σL*', dec: 3, escala: 1,
      leer: function (g) { return g.textura; } },
    { id: 'imperfecciones', nom: 'Imperfecciones', uni: 'focos', dec: 0, escala: 1,
      leer: function (g) { return g.lesiones; } },
    { id: 'uniformidad', nom: 'Heterogeneidad de tono', uni: '° ITA', dec: 2, escala: 1,
      leer: function (g) { return g.itaSd; } }
  ];

  var muestras = [];
  var api = {};

  /* ------------------------------------------------------------ ALMACÉN */
  function cargar() {
    try {
      var s = localStorage.getItem(CLAVE);
      muestras = s ? JSON.parse(s) : [];
      if (!Array.isArray(muestras)) muestras = [];
    } catch (e) { muestras = []; }
  }
  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(muestras)); } catch (e) {}
  }

  /* --------------------------------------------------------- ESTADÍSTICA */
  /* Percentil con interpolación lineal. Con n pequeña el método importa:
     tomar «el elemento en la posición n·p» redondeando descarta información
     y hace que añadir una muestra mueva el resultado a saltos. */
  function percentil(valores, p) {
    if (!valores.length) return NaN;
    var v = valores.slice().sort(function (a, b) { return a - b; });
    if (v.length === 1) return v[0];
    var pos = (v.length - 1) * p;
    var bajo = Math.floor(pos), alto = Math.ceil(pos);
    if (bajo === alto) return v[bajo];
    return v[bajo] + (v[alto] - v[bajo]) * (pos - bajo);
  }

  function estadisticas() {
    return METRICAS.map(function (M) {
      var vals = muestras.map(function (m) { return m[M.id]; })
                         .filter(function (v) { return typeof v === 'number' && isFinite(v); });
      var p10 = percentil(vals, 0.10), p50 = percentil(vals, 0.50), p90 = percentil(vals, 0.90);
      /* Dispersión relativa. Una banda estrecha no es precisión: es una escala
         que salta de 0 a 100 con una variación mínima. Ocurre cuando todas las
         muestras se parecen demasiado entre sí — mismo tipo de piel, misma
         persona repetida, o un puñado de capturas. */
      var base = Math.abs(p50) > 1e-6 ? Math.abs(p50) : Math.abs(p90) || 1;
      var disp = vals.length ? (p90 - p10) / base : NaN;
      return {
        M: M, n: vals.length, p10: p10, p50: p50, p90: p90, disp: disp,
        pobre: vals.length >= 3 && isFinite(disp) && disp < 0.15,
        min: vals.length ? Math.min.apply(null, vals) : NaN,
        max: vals.length ? Math.max.apply(null, vals) : NaN,
        actual: E.BANDAS[M.id]
      };
    });
  }

  /* Redondeo a cifras significativas, para que el bloque generado sea legible
     y no arrastre dieciséis decimales de ruido. */
  function sig(v, n) {
    if (!isFinite(v) || v === 0) return 0;
    var d = Math.ceil(Math.log10(Math.abs(v)));
    var p = Math.pow(10, n - d);
    return Math.round(v * p) / p;
  }

  function bloqueBandas() {
    var est = estadisticas();
    var anchoNom = 16;
    var lineas = est.map(function (e) {
      var lo = sig(e.p10, 3), hi = sig(e.p90, 3);
      if (e.M.id === 'imperfecciones') { lo = Math.floor(e.p10); hi = Math.ceil(e.p90); }
      var nom = (e.M.id + ':').padEnd(anchoNom, ' ');
      return '    ' + nom + '[' + lo + ', ' + hi + '],'
             + '   // ' + e.M.nom + ' · ' + e.M.uni;
    });
    return '  /* Bandas calibradas con ' + muestras.length + ' rostros reales · ' +
           new Date().toLocaleDateString('es-ES') + '\n' +
           '     Extremos en los percentiles 10 y 90 observados. */\n' +
           '  var BANDAS = {\n' + lineas.join('\n').replace(/,(\s+\/\/[^\n]*)$/, '$1') + '\n  };';
  }

  function aplicarEnSesion() {
    estadisticas().forEach(function (e) {
      if (!e.n || !isFinite(e.p10) || !isFinite(e.p90) || e.p90 <= e.p10) return;
      if (e.pobre) return;                 // banda degenerada: mejor la actual
      E.BANDAS[e.M.id][0] = e.p10;
      E.BANDAS[e.M.id][1] = e.p90;
    });
  }

  /* ------------------------------------------------------------- ANÁLISIS */
  function analizarArchivo(file, cb) {
    var img = new Image();
    img.onload = function () {
      var c = document.createElement('canvas');
      c.width = E.CANVAS_W; c.height = E.CANVAS_H;
      var ctx = c.getContext('2d', { willReadFrequently: true });
      var k = Math.max(E.CANVAS_W / img.naturalWidth, E.CANVAS_H / img.naturalHeight);
      var sw = E.CANVAS_W / k, sh = E.CANVAS_H / k;
      ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2,
                    sw, sh, 0, 0, E.CANVAS_W, E.CANVAS_H);
      var res = null, err = null;
      try { res = E.analizar(c); } catch (e) { err = e; }
      URL.revokeObjectURL(img.src);
      cb(res, err, file.name);
    };
    img.onerror = function () { cb(null, new Error('no se pudo leer la imagen'), file.name); };
    img.src = URL.createObjectURL(file);
  }

  api.registrar = function (res, origen) {
    if (!res) return;
    var g = res.global;
    var fila = {
      t: Date.now(),
      origen: origen || 'cámara',
      confianza: res.confianza,
      wb: res.wb.aplicado,
      ITA: g.ITA,
      cobertura: g.cobertura
    };
    METRICAS.forEach(function (M) { fila[M.id] = M.leer(g); });
    muestras.push(fila);
    guardar();
  };

  /* ------------------------------------------------------------------ UI */
  var ganchos = {};

  function pintar() {
    if (!ganchos.seccion) return;       // aún no montado
    var est = estadisticas();
    var n = muestras.length;
    var suficiente = n >= MIN_MUESTRAS;

    var H = [];
    H.push('<p class="eyebrow">Modo técnico · no visible para visitantes</p>');
    H.push('<h2 class="display" style="font-size:34px;margin:9px 0 8px">Calibración de bandas</h2>');
    H.push('<p class="lede" style="margin-bottom:20px">Captura entre ' + MIN_MUESTRAS +
      ' y 20 rostros del equipo con esta misma tableta y esta misma luz. Al terminar, ' +
      'los extremos de cada banda se colocan en los percentiles 10 y 90 observados, ' +
      'y una piel corriente pasa a caer a media escala en lugar de saturar el indicador.</p>');

    H.push('<div class="aviso" style="margin-bottom:22px"><p class="small">' +
      '<b>Sólo se guardan números.</b> De cada captura se conservan las cinco magnitudes ' +
      'físicas y nada más: ninguna imagen se almacena, ni aquí ni en ningún servidor. ' +
      'Los datos viven en el almacenamiento local de este navegador.</p></div>');

    /* Estado */
    H.push('<div class="cal-estado ' + (suficiente ? 'ok' : '') + '">' +
      '<div><span class="cal-n num">' + n + '</span>' +
      '<span class="eyebrow eyebrow--mudo" style="display:block;margin-top:4px">muestras</span></div>' +
      '<p class="small" style="margin:0">' +
      (suficiente
        ? 'Muestra suficiente. Las bandas propuestas ya son utilizables; añadir más las estabiliza.'
        : 'Faltan ' + (MIN_MUESTRAS - n) + ' para llegar al mínimo de ' + MIN_MUESTRAS +
          '. Con menos, los percentiles se mueven demasiado con cada captura nueva.') +
      '</p></div>');

    H.push('<div class="btn-row" style="margin:20px 0 26px">' +
      '<button class="btn btn--solido" id="cal-capturar">Capturar muestra</button>' +
      '<label class="btn btn--sm" style="cursor:pointer">Importar fotos' +
      '<input type="file" accept="image/*" multiple id="cal-archivos" hidden></label>' +
      (n ? '<button class="btn btn--sm" id="cal-borrar">Borrar todo</button>' : '') +
      '</div>');
    H.push('<p class="tiny" style="margin-top:-16px;margin-bottom:26px">Las fotos importadas ' +
      'se recortan al mismo encuadre, pero no pasan por las cinco comprobaciones de captura. ' +
      'Úsalas sólo si se tomaron en las condiciones del puesto.</p>');

    /* Percentiles y bandas propuestas */
    H.push('<div class="sec-cab"><span class="idx">A</span><h3>Bandas propuestas</h3>' +
      '<span class="der">p10 – p90</span></div>');
    H.push('<div style="overflow-x:auto"><table class="zt"><thead><tr>' +
      '<th>Magnitud</th><th>p10</th><th>p50</th><th>p90</th><th>Disp.</th>' +
      '<th>Banda actual</th><th>Propuesta</th></tr></thead><tbody>');
    est.forEach(function (e) {
      var M = e.M, k = M.escala;
      if (!e.n) {
        H.push('<tr class="inval"><td>' + esc(M.nom) + '</td><td colspan="6">sin datos</td></tr>');
        return;
      }
      var cambia = Math.abs(e.p10 - e.actual[0]) > 1e-9 || Math.abs(e.p90 - e.actual[1]) > 1e-9;
      H.push('<tr><td>' + esc(M.nom) + '<span class="cal-uni">' + esc(M.uni) + '</span></td>' +
        '<td>' + nf(e.p10 * k, M.dec) + '</td>' +
        '<td>' + nf(e.p50 * k, M.dec) + '</td>' +
        '<td>' + nf(e.p90 * k, M.dec) + '</td>' +
        '<td style="color:' + (e.pobre ? 'var(--st-max)' : 'var(--ink-3)') + '">' +
        nf(e.disp * 100, 0) + ' %</td>' +
        '<td style="color:var(--ink-3)">' + nf(e.actual[0] * k, M.dec) + ' – ' + nf(e.actual[1] * k, M.dec) + '</td>' +
        '<td style="color:' + (e.pobre ? 'var(--st-max)' : (cambia ? 'var(--accent)' : 'var(--ink-3)')) + '">' +
        (e.pobre ? 'dispersión insuficiente'
                 : nf(e.p10 * k, M.dec) + ' – ' + nf(e.p90 * k, M.dec)) +
        '</td></tr>');
    });
    H.push('</tbody></table></div>');

    var pobres = est.filter(function (e) { return e.pobre; });
    if (pobres.length) {
      H.push('<div class="aviso" style="margin-top:14px;border-left-color:var(--st-max)">' +
        '<p class="small"><b>Dispersión insuficiente en ' + pobres.length + ' magnitud(es): ' +
        pobres.map(function (e) { return esc(e.M.nom.toLowerCase()); }).join(', ') + '.</b> ' +
        'El recorrido entre p10 y p90 es menor del 15 % del valor típico, de modo que la escala ' +
        'saltaría de «óptimo» a «alto» con una variación mínima. Suele significar que las muestras ' +
        'se parecen demasiado entre sí: añade rostros de distinto fototipo, distinta edad y ' +
        'distinto estado de la piel. Esas bandas no se aplican y se conserva la actual.</p></div>');
    } else if (n >= 3) {
      H.push('<p class="tiny" style="margin-top:12px">La columna Disp. es el recorrido p10–p90 ' +
        'relativo al valor típico. Por debajo del 15 % la banda se considera degenerada y no se aplica.</p>');
    }

    if (n) {
      H.push('<div class="btn-row" style="margin-top:16px">' +
        '<button class="btn btn--sm" id="cal-aplicar">Aplicar en esta sesión</button>' +
        '<span class="tiny">Cambia las bandas del motor ya cargado para poder probar un ' +
        'informe. Se pierde al recargar: para fijarlas, pega el bloque de abajo en engine.js.</span></div>');

      H.push('<div class="sec-cab" style="margin-top:34px"><span class="idx">B</span>' +
        '<h3>Bloque para engine.js</h3><span class="der">sustituye var BANDAS</span></div>');
      H.push('<textarea class="cal-code" id="cal-bloque" readonly rows="9" spellcheck="false">' +
        esc(bloqueBandas()) + '</textarea>');
      H.push('<div class="btn-row" style="margin-top:10px">' +
        '<button class="btn btn--sm" id="cal-copiar">Copiar bloque</button>' +
        '<span class="tiny" id="cal-copia-eco"></span></div>');

      /* Muestras */
      H.push('<div class="sec-cab" style="margin-top:34px"><span class="idx">C</span>' +
        '<h3>Muestras registradas</h3><span class="der">' + n + '</span></div>');
      H.push('<div style="overflow-x:auto"><table class="zt"><thead><tr>' +
        '<th>#</th><th>Brillo T<br>%</th><th>Eritema<br>UI</th><th>Textura<br>σL*</th>' +
        '<th>Focos</th><th>Δ tono<br>°</th><th>ITA<br>°</th><th>Conf.</th><th>BB</th><th></th>' +
        '</tr></thead><tbody>');
      muestras.forEach(function (m, i) {
        H.push('<tr><td>' + (i + 1) + '</td>' +
          '<td>' + nf(m.brillo * 100, 1) + '</td>' +
          '<td>' + nf(m.eritema, 2) + '</td>' +
          '<td>' + nf(m.textura, 3) + '</td>' +
          '<td>' + m.imperfecciones + '</td>' +
          '<td>' + nf(m.uniformidad, 2) + '</td>' +
          '<td>' + nf(m.ITA, 1) + '</td>' +
          '<td>' + m.confianza + '</td>' +
          '<td style="color:' + (m.wb ? 'var(--st-ok)' : 'var(--st-mid)') + '">' + (m.wb ? 'sí' : 'no') + '</td>' +
          '<td><button class="cal-x" data-i="' + i + '" title="Eliminar muestra ' + (i + 1) + '">×</button></td></tr>');
      });
      H.push('</tbody></table></div>');
      H.push('<p class="tiny" style="margin-top:10px">BB indica si esa captura tuvo ' +
        'normalización cromática por esclerótica. Una muestra con BB «no» arrastra el sesgo ' +
        'de color de su iluminación: si hay varias, conviene repetirlas antes de fijar bandas.</p>');

      /* Copia de seguridad */
      H.push('<div class="sec-cab" style="margin-top:34px"><span class="idx">D</span>' +
        '<h3>Copia de seguridad</h3><span class="der">json</span></div>');
      H.push('<textarea class="cal-code" id="cal-json" rows="4" spellcheck="false">' +
        esc(JSON.stringify(muestras)) + '</textarea>');
      H.push('<div class="btn-row" style="margin-top:10px">' +
        '<button class="btn btn--sm" id="cal-importar">Reemplazar desde el cuadro</button>' +
        '<span class="tiny" id="cal-json-eco">Cópialo a un sitio seguro antes de borrar datos del navegador.</span></div>');
    }

    H.push('<div class="btn-row" style="margin-top:40px">' +
      '<button class="btn btn--sm" id="cal-salir">Volver al modo visitante</button></div>');

    ganchos.seccion.innerHTML = H.join('');
    conectar();
  }

  function conectar() {
    var b;
    if ((b = $('cal-capturar'))) b.addEventListener('click', function () { ganchos.nuevaMuestra(); });
    if ((b = $('cal-borrar'))) b.addEventListener('click', function () {
      if (!global.confirm('Se borrarán las ' + muestras.length + ' muestras. ¿Continuar?')) return;
      muestras = []; guardar(); pintar();
    });
    if ((b = $('cal-aplicar'))) b.addEventListener('click', function () {
      aplicarEnSesion(); pintar();
    });
    if ((b = $('cal-salir'))) b.addEventListener('click', function () {
      try { location.hash = ''; } catch (e) {}
      ganchos.salir();
    });
    if ((b = $('cal-copiar'))) b.addEventListener('click', function () {
      var ta = $('cal-bloque'), eco = $('cal-copia-eco');
      ta.removeAttribute('readonly'); ta.select(); ta.setSelectionRange(0, 99999);
      var hecho = false;
      try { hecho = document.execCommand('copy'); } catch (e) {}
      ta.setAttribute('readonly', '');
      if (hecho) { eco.textContent = 'Copiado al portapapeles.'; return; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(ta.value).then(
          function () { eco.textContent = 'Copiado al portapapeles.'; },
          function () { eco.textContent = 'El portapapeles está bloqueado: el texto queda seleccionado, cópialo a mano.'; });
      } else {
        eco.textContent = 'El portapapeles está bloqueado: el texto queda seleccionado, cópialo a mano.';
      }
    });
    if ((b = $('cal-importar'))) b.addEventListener('click', function () {
      var eco = $('cal-json-eco');
      try {
        var datos = JSON.parse($('cal-json').value);
        if (!Array.isArray(datos)) throw new Error('el contenido no es una lista');
        muestras = datos; guardar(); pintar();
      } catch (e) {
        eco.textContent = 'No se pudo leer: ' + e.message;
        eco.style.color = 'var(--st-max)';
      }
    });
    Array.prototype.forEach.call(ganchos.seccion.querySelectorAll('.cal-x'), function (x) {
      x.addEventListener('click', function () {
        muestras.splice(parseInt(x.dataset.i, 10), 1); guardar(); pintar();
      });
    });
    if ((b = $('cal-archivos'))) b.addEventListener('change', function (e) {
      var files = Array.prototype.slice.call(e.target.files || []);
      if (!files.length) return;
      var pendientes = files.length, fallos = [];
      files.forEach(function (f) {
        analizarArchivo(f, function (res, err, nombre) {
          if (err) fallos.push(nombre + ': ' + err.message);
          else api.registrar(res, 'archivo');
          if (--pendientes === 0) {
            pintar();
            if (fallos.length) global.alert('No se pudieron analizar:\n' + fallos.join('\n'));
          }
        });
      });
    });
  }

  /* ------------------------------------------------------------- PÚBLICO */
  api.activa = function () { return location.hash === '#calibrar'; };
  api.montar = function (g) { ganchos = g; cargar(); };
  api.pintar = pintar;
  api.nMuestras = function () { return muestras.length; };

  global.ESPEJO_CAL = api;
})(window);
