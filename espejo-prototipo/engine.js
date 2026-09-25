/* ==========================================================================
   ESPEJO · Motor de análisis cutáneo óptico
   --------------------------------------------------------------------------
   Todo el procesamiento ocurre en el dispositivo. Ninguna imagen sale del
   navegador. No hay llamadas de red en este archivo.

   Fundamento de cada medida documentado junto a su implementación.
   ========================================================================== */
(function (global) {
  'use strict';

  /* ---------------------------------------------------------------- GEOMETRÍA
     Lienzo de trabajo fijo 720 x 960 (3:4 vertical). El retículo define el
     sistema de coordenadas normalizado en el que viven las zonas faciales.
     Al fijar la posición de la cara (como hace el reposacabezas de un
     dermatoscopio de consulta) evitamos depender de un modelo de landmarks,
     y la medición se vuelve reproducible entre sesiones.                    */
  var CANVAS_W = 720, CANVAS_H = 960;
  var RETICLE = { x: 90, y: 106, w: 540, h: 748 };

  /* Anclaje antropométrico: la anchura bicigomática media en población adulta
     es ~137 mm (hombres) / ~129 mm (mujeres). Usamos 133 mm sobre el ancho
     útil del retículo para convertir píxeles a milímetros. */
  var FACE_WIDTH_MM = 133;
  var WORK_W = 512;                    // la zona útil se reescala a 512 px
  var MM_PER_PX = FACE_WIDTH_MM / WORK_W;   // ≈ 0,26 mm/px

  /* Polígonos en coordenadas normalizadas del retículo (0..1, origen arriba-izq).
     Izquierda / derecha son las del SUJETO, no las del espectador. */
  var ZONES = [
    { id: 'frente',   nombre: { es: 'Frente', en: 'Forehead', ko: "이마" }, grupo: 'T',
      poly: [[0.30,0.11],[0.70,0.11],[0.76,0.28],[0.24,0.28]] },
    { id: 'glabela',  nombre: { es: 'Glabela', en: 'Glabella', ko: "미간" }, grupo: 'T',
      poly: [[0.435,0.305],[0.565,0.305],[0.565,0.40],[0.435,0.40]] },
    { id: 'nariz',    nombre: { es: 'Nariz', en: 'Nose', ko: "코" }, grupo: 'T',
      poly: [[0.435,0.42],[0.565,0.42],[0.625,0.615],[0.375,0.615]] },
    { id: 'mejillaD', nombre: { es: 'Mejilla derecha', en: 'Right cheek', ko: "오른쪽 볼" }, grupo: 'U',
      poly: [[0.145,0.455],[0.345,0.475],[0.335,0.655],[0.175,0.60]] },
    { id: 'mejillaI', nombre: { es: 'Mejilla izquierda', en: 'Left cheek', ko: "왼쪽 볼" }, grupo: 'U',
      poly: [[0.855,0.455],[0.655,0.475],[0.665,0.655],[0.825,0.60]] },
    { id: 'menton',   nombre: { es: 'Mentón', en: 'Chin', ko: "턱" }, grupo: 'U',
      poly: [[0.395,0.795],[0.605,0.795],[0.585,0.915],[0.415,0.915]] }
  ];

  /* Regiones excluidas del análisis de piel: ojos, cejas y labios. */
  var EXCLUDE = [
    [0.17, 0.325, 0.43, 0.455],   // ojo + ceja derecha del sujeto
    [0.57, 0.325, 0.83, 0.455],   // ojo + ceja izquierda del sujeto
    [0.345, 0.655, 0.655, 0.775]  // labios
  ];

  /* Parámetros de detección focal. Se exponen a propósito: las bandas de
     referencia de este motor están fijadas sobre imágenes sintéticas de
     validación, y conviene reajustarlas contra rostros reales del propio
     equipo antes de darlas por buenas. */
  var PARAM = {
    zUmbral: 2.5,   // desviaciones sobre el ruido LOCAL
    minAbs: 0.32,   // contraste mínimo absoluto, en UI de eritema
    radioFondo: 18, // radio del fondo local (≈ 4,7 mm)
    radioRuido: 24  // radio de estimación del ruido (≈ 6,2 mm)
  };

  /* Bandas de referencia que convierten magnitud física en índice 0–100.
     PROVISIONALES. Están fijadas sobre imágenes sintéticas de validación, no
     sobre una muestra poblacional. Antes del evento conviene capturar entre
     15 y 20 rostros reales del equipo con la misma tableta y la misma luz,
     leer los valores físicos y colocar los extremos de cada banda en los
     percentiles 10 y 90 observados. Hasta entonces el valor fiable es la
     magnitud física y la comparación entre zonas, no el índice. */
  var BANDAS = {
    brillo:         [0.02, 0.42],   // fracción de área especular, zona T
    eritema:        [10, 34],       // UI hemoglobínicas
    textura:        [0.45, 3.4],    // σ L* en la banda del poro
    imperfecciones: [0, 34],        // nº de focos
    uniformidad:    [1.2, 14]       // desviación del ITA entre zonas, en grados
  };

  /* Cajas de búsqueda de esclerótica para el balance de blancos. */
  var SCLERA_BOXES = [
    [0.205, 0.378, 0.395, 0.432],
    [0.605, 0.378, 0.795, 0.432]
  ];

  /* ------------------------------------------------------------ COLORIMETRÍA */

  var LUT_LIN = new Float32Array(256);
  for (var i = 0; i < 256; i++) {
    var c = i / 255;
    LUT_LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  var Xn = 0.95047, Yn = 1.00000, Zn = 1.08883;   // iluminante D65, obs. 2°

  function fLab(t) {
    return t > 0.008856451679 ? Math.cbrt(t) : (903.2962962 * t + 16) / 116;
  }

  /* sRGB (0..255) -> CIELAB D65 */
  function rgbToLab(r, g, b, out) {
    var R = LUT_LIN[r], G = LUT_LIN[g], B = LUT_LIN[b];
    var X = 0.4124564 * R + 0.3575761 * G + 0.1804375 * B;
    var Y = 0.2126729 * R + 0.7151522 * G + 0.0721750 * B;
    var Z = 0.0193339 * R + 0.1191920 * G + 0.9503041 * B;
    var fx = fLab(X / Xn), fy = fLab(Y / Yn), fz = fLab(Z / Zn);
    out[0] = 116 * fy - 16;           // L*
    out[1] = 500 * (fx - fy);         // a*
    out[2] = 200 * (fy - fz);         // b*
    return out;
  }

  /* Individual Typology Angle (Chardon et al., 1991).
     Estándar de la industria cosmética para clasificar tono constitutivo. */
  function ita(L, b) {
    return Math.atan2(L - 50, b) * 180 / Math.PI;
  }

  function clasificarITA(v) {
    if (v > 55)  return { cat: { es: 'muy claro',  en: 'very light', ko: "매우 밝음" },   codigo: 'I'   };
    if (v > 41)  return { cat: { es: 'claro',      en: 'light', ko: "밝음" },        codigo: 'II'  };
    if (v > 28)  return { cat: { es: 'intermedio', en: 'intermediate', ko: "중간" }, codigo: 'III' };
    if (v > 10)  return { cat: { es: 'mate',       en: 'tan', ko: "중간 어두움" },          codigo: 'IV'  };
    if (v > -30) return { cat: { es: 'moreno',     en: 'brown', ko: "어두움" },        codigo: 'V'   };
    return             { cat: { es: 'oscuro',      en: 'dark', ko: "매우 어두움" },         codigo: 'VI'  };
  }

  /* Índice de eritema (base Dawson et al., 1980):
     EI = 100 · [log10(1/G) − log10(1/R)] = 100 · log10(R/G)
     La hemoglobina absorbe fuertemente en verde (~540/577 nm) y poco en rojo,
     de modo que el cociente R/G sigue la concentración de hemoglobina
     superficial. Índice de melanina análogo sobre el canal rojo. */
  function eritema(Rl, Gl) {
    return 100 * Math.log10((Rl + 1e-4) / (Gl + 1e-4));
  }
  function melanina(Rl) {
    return 100 * Math.log10(1 / (Rl + 1e-4));
  }

  /* ------------------------------------------------------------- UTILIDADES */

  function percentil(arr, n, p) {
    var copia = arr.slice(0, n);
    Array.prototype.sort.call(copia, function (a, b) { return a - b; });
    var idx = Math.max(0, Math.min(n - 1, Math.round((n - 1) * p)));
    return copia[idx];
  }

  function media(arr, n) {
    var s = 0; for (var i = 0; i < n; i++) s += arr[i];
    return n ? s / n : 0;
  }

  function desviacion(arr, n, m) {
    if (n < 2) return 0;
    var s = 0; for (var i = 0; i < n; i++) { var d = arr[i] - m; s += d * d; }
    return Math.sqrt(s / (n - 1));
  }

  /* Desenfoque de caja separable — aproxima una gaussiana en 2 pasadas y
     mantiene el coste lineal con el número de píxeles. */
  function desenfoqueCaja(src, dst, w, h, radio) {
    var tmp = new Float32Array(w * h);
    var div = radio * 2 + 1, x, y, i, acc;
    for (y = 0; y < h; y++) {
      var fila = y * w; acc = 0;
      for (i = -radio; i <= radio; i++) acc += src[fila + Math.min(w - 1, Math.max(0, i))];
      for (x = 0; x < w; x++) {
        tmp[fila + x] = acc / div;
        acc -= src[fila + Math.min(w - 1, Math.max(0, x - radio))];
        acc += src[fila + Math.min(w - 1, Math.max(0, x + radio + 1))];
      }
    }
    for (x = 0; x < w; x++) {
      acc = 0;
      for (i = -radio; i <= radio; i++) acc += tmp[Math.min(h - 1, Math.max(0, i)) * w + x];
      for (y = 0; y < h; y++) {
        dst[y * w + x] = acc / div;
        acc -= tmp[Math.min(h - 1, Math.max(0, y - radio)) * w + x];
        acc += tmp[Math.min(h - 1, Math.max(0, y + radio + 1)) * w + x];
      }
    }
    return dst;
  }

  /* Desenfoque NORMALIZADO por máscara.

     Un desenfoque normal sobre una imagen enmascarada es una trampa: los
     píxeles de fuera de la máscara valen 0 y arrastran la media hacia abajo
     en toda la orla interior. Al restar ese fondo aparece un anillo de
     residuo positivo pegado a cada borde — cejas, contorno facial, labios —
     que el detector interpreta como lesiones. Fue exactamente el fallo que
     poblaba la frente de imperfecciones inexistentes.

     La solución estándar es dividir el desenfoque de la señal enmascarada
     entre el desenfoque de la propia máscara: cada píxel promedia sólo con
     vecinos válidos, sin importar cuántos tenga. */
  function desenfoqueMascara(src, mascara, w, h, radio) {
    var n = w * h, i;
    var senal = new Float32Array(n), peso = new Float32Array(n);
    for (i = 0; i < n; i++) {
      if (mascara[i]) { senal[i] = src[i]; peso[i] = 1; }
    }
    var bs = desenfoqueCaja(senal, new Float32Array(n), w, h, radio);
    var bp = desenfoqueCaja(peso, new Float32Array(n), w, h, radio);
    var out = new Float32Array(n);
    for (i = 0; i < n; i++) {
      out[i] = bp[i] > 0.06 ? bs[i] / bp[i] : (mascara[i] ? src[i] : 0);
    }
    return out;
  }

  function puntoEnPoligono(px, py, poly) {
    var dentro = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > py) !== (yj > py)) &&
          (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) dentro = !dentro;
    }
    return dentro;
  }

  /* --------------------------------------------------- CONTROL DE ENCUADRE
     Cinco comprobaciones sobre el vídeo en directo. La captura sólo se
     habilita cuando las cinco pasan de forma sostenida. Son las mismas
     condiciones que se controlan en fotografía clínica estandarizada.      */

  var frameAnterior = null;

  function evaluarEncuadre(ctx) {
    var W = 192, H = 256;
    var d = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
    // submuestreo rápido a 192x256
    var gris = new Float32Array(W * H);
    var px = d.data, sx = CANVAS_W / W, sy = CANVAS_H / H;
    var x, y, k;
    for (y = 0; y < H; y++) {
      for (x = 0; x < W; x++) {
        var o = (((y * sy) | 0) * CANVAS_W + ((x * sx) | 0)) * 4;
        gris[y * W + x] = 0.2126 * px[o] + 0.7152 * px[o + 1] + 0.0722 * px[o + 2];
      }
    }

    // Ventana del retículo en el espacio submuestreado
    var rx0 = (RETICLE.x / CANVAS_W * W) | 0, rx1 = ((RETICLE.x + RETICLE.w) / CANVAS_W * W) | 0;
    var ry0 = (RETICLE.y / CANVAS_H * H) | 0, ry1 = ((RETICLE.y + RETICLE.h) / CANVAS_H * H) | 0;

    // 1 · Exposición — luminancia media dentro del retículo
    var sum = 0, n = 0;
    for (y = ry0; y < ry1; y++) for (x = rx0; x < rx1; x++) { sum += gris[y * W + x]; n++; }
    var lumMedia = sum / n;

    // 2 · Uniformidad — desequilibrio izquierda/derecha (luz lateral)
    /* Se mide SOLO sobre píxeles de piel y se parte por el centroide de la
       cara, no por el centro del retículo. Medido sobre el retículo entero,
       una pared más clara a un lado suspendía la prueba con la cara bien
       iluminada, y el fondo diluía una luz lateral real sobre la cara: la
       prueba fallaba cuando no debía y pasaba cuando no debía. */
    var esPiel = new Uint8Array(W * H), nPiel = 0, sumX = 0;
    for (y = ry0; y < ry1; y++) {
      for (x = rx0; x < rx1; x++) {
        var op = (((y * sy) | 0) * CANVAS_W + ((x * sx) | 0)) * 4;
        var pr = px[op], pg = px[op + 1], pb = px[op + 2];
        var pY = 0.299 * pr + 0.587 * pg + 0.114 * pb;
        var pCb = 128 - 0.168736 * pr - 0.331264 * pg + 0.5 * pb;
        var pCr = 128 + 0.5 * pr - 0.418688 * pg - 0.081312 * pb;
        if (pY > 40 && pCb > 72 && pCb < 137 && pCr > 130 && pCr < 182) {
          esPiel[y * W + x] = 1; nPiel++; sumX += x;
        }
      }
    }
    var sumI = 0, nI = 0, sumD = 0, nD = 0, mitad;
    if (nPiel > 400) {
      mitad = sumX / nPiel;
      for (y = ry0; y < ry1; y++) for (x = rx0; x < rx1; x++) {
        if (!esPiel[y * W + x]) continue;
        if (x < mitad) { sumI += gris[y * W + x]; nI++; } else { sumD += gris[y * W + x]; nD++; }
      }
    }
    if (nI < 100 || nD < 100) {
      // Sin cara suficiente no hay piel que comparar: se vuelve al retículo.
      sumI = nI = sumD = nD = 0; mitad = (rx0 + rx1) >> 1;
      for (y = ry0; y < ry1; y++) {
        for (x = rx0; x < mitad; x++) { sumI += gris[y * W + x]; nI++; }
        for (x = mitad; x < rx1; x++) { sumD += gris[y * W + x]; nD++; }
      }
    }
    var mI = sumI / nI, mD = sumD / nD;
    var desequilibrio = Math.abs(mI - mD) / Math.max(1, (mI + mD) / 2);

    // 3 · Enfoque — varianza del laplaciano (Pech-Pacheco et al., 2000)
    var lapSum = 0, lapSq = 0, lapN = 0;
    for (y = ry0 + 1; y < ry1 - 1; y++) {
      for (x = rx0 + 1; x < rx1 - 1; x++) {
        var l = -4 * gris[y * W + x] + gris[(y - 1) * W + x] + gris[(y + 1) * W + x] +
                gris[y * W + x - 1] + gris[y * W + x + 1];
        lapSum += l; lapSq += l * l; lapN++;
      }
    }
    var varLap = lapSq / lapN - Math.pow(lapSum / lapN, 2);

    // 4 · Encuadre — fracción de píxeles con cromaticidad de piel
    var piel = 0, tot = 0;
    for (y = ry0; y < ry1; y += 2) {
      for (x = rx0; x < rx1; x += 2) {
        var oo = (((y * sy) | 0) * CANVAS_W + ((x * sx) | 0)) * 4;
        var r = px[oo], g = px[oo + 1], b = px[oo + 2];
        var Y = 0.299 * r + 0.587 * g + 0.114 * b;
        var Cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        var Cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
        if (Y > 40 && Cb > 72 && Cb < 137 && Cr > 130 && Cr < 182) piel++;
        tot++;
      }
    }
    var fraccionPiel = piel / tot;

    // 5 · Estabilidad — diferencia entre fotogramas consecutivos
    /* Por bloques de 8x8 y percentil 95, no media píxel a píxel. La media por
       píxel medía sobre todo el ruido del sensor: con la cara quieta, el
       grano de una sala normal ya la suspendía, mientras que un
       desplazamiento real de la cara (que sólo cambia los bordes) apenas la
       movía. Promediar el bloque cancela el ruido (√64 = 8 veces menos) y el
       percentil 95 recoge los bordes, que es donde se ve el movimiento. */
    var BW = W >> 3, BH = H >> 3, bloques = new Float32Array(BW * BH);
    for (y = 0; y < BH * 8; y++) for (x = 0; x < BW * 8; x++) bloques[(y >> 3) * BW + (x >> 3)] += gris[y * W + x];
    for (k = 0; k < bloques.length; k++) bloques[k] /= 64;
    var movimiento = 1;
    if (frameAnterior && frameAnterior.length === bloques.length) {
      var difs = new Float32Array(bloques.length);
      for (k = 0; k < bloques.length; k++) difs[k] = Math.abs(bloques[k] - frameAnterior[k]);
      Array.prototype.sort.call(difs);
      movimiento = difs[Math.floor(difs.length * 0.95)];
    }
    frameAnterior = bloques;

    return {
      exposicion:   { valor: lumMedia,      ok: lumMedia > 92 && lumMedia < 196,
                      texto: lumMedia.toFixed(0), unidad: 'cd·rel' },
      uniformidad:  { valor: desequilibrio, ok: desequilibrio < 0.14,
                      texto: (desequilibrio * 100).toFixed(1), unidad: '% Δ L-R' },
      enfoque:      { valor: varLap,        ok: varLap > 34,
                      texto: varLap.toFixed(0), unidad: 'σ² lap' },
      encuadre:     { valor: fraccionPiel,  ok: fraccionPiel > 0.34 && fraccionPiel < 0.95,
                      texto: (fraccionPiel * 100).toFixed(0), unidad: '% área' },
      estabilidad:  { valor: movimiento,    ok: movimiento < 3.2,
                      texto: movimiento.toFixed(2), unidad: 'Δ/fot' }
    };
  }

  function reiniciarEncuadre() { frameAnterior = null; }

  /* ====================================================================== */
  /*                            ANÁLISIS COMPLETO                           */
  /* ====================================================================== */

  /* Extrae el retículo del lienzo de captura y lo reescala a 512 px de ancho,
     de modo que la escala espacial (mm/px) sea constante entre sesiones —
     requisito para que el índice de textura sea comparable. */
  function extraerZonaUtil(canvasCaptura) {
    var WH = Math.round(WORK_W * RETICLE.h / RETICLE.w);
    var c = document.createElement('canvas');
    c.width = WORK_W; c.height = WH;
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvasCaptura, RETICLE.x, RETICLE.y, RETICLE.w, RETICLE.h, 0, 0, WORK_W, WH);
    return { canvas: c, ctx: ctx, w: WORK_W, h: WH };
  }

  /* PASO 1 · Balance de blancos por esclerótica.
     La esclerótica es la única superficie acromática fiable presente en el
     encuadre. Buscamos en las cajas oculares los píxeles más luminosos de
     baja saturación y los usamos como referencia de blanco (von Kries).
     Si no hay suficientes, se omite y se penaliza la confianza. */
  function balanceBlancos(img, w, h) {
    var cand = [];
    for (var s = 0; s < SCLERA_BOXES.length; s++) {
      var B = SCLERA_BOXES[s];
      var x0 = (B[0] * w) | 0, y0 = (B[1] * h) | 0, x1 = (B[2] * w) | 0, y1 = (B[3] * h) | 0;
      for (var y = y0; y < y1; y++) {
        for (var x = x0; x < x1; x++) {
          var o = (y * w + x) * 4;
          var r = img[o], g = img[o + 1], b = img[o + 2];
          var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          if (mx < 96 || mx > 252) continue;          // ni sombra ni quemado
          var sat = mx === 0 ? 0 : (mx - mn) / mx;
          if (sat > 0.22) continue;                    // acromático
          cand.push([r, g, b, mx]);
        }
      }
    }
    if (cand.length < 60) return { aplicado: false, ganancia: [1, 1, 1], n: cand.length };

    cand.sort(function (a, b) { return b[3] - a[3]; });
    var top = cand.slice(0, Math.max(40, (cand.length * 0.25) | 0));
    var sr = 0, sg = 0, sb = 0;
    for (var i = 0; i < top.length; i++) { sr += top[i][0]; sg += top[i][1]; sb += top[i][2]; }
    var wr = sr / top.length, wg = sg / top.length, wb = sb / top.length;
    var ref = (wr + wg + wb) / 3;
    var gan = [ref / wr, ref / wg, ref / wb];

    // Rechazo de referencias implausibles (una dominante >25 % indica que no
    // hemos encontrado esclerótica sino piel o una sombra coloreada).
    var maxDesv = Math.max(Math.abs(gan[0] - 1), Math.abs(gan[1] - 1), Math.abs(gan[2] - 1));
    if (maxDesv > 0.25) return { aplicado: false, ganancia: [1, 1, 1], n: top.length, motivo: 'desviación excesiva' };

    for (var p = 0; p < img.length; p += 4) {
      img[p]     = Math.min(255, img[p]     * gan[0]);
      img[p + 1] = Math.min(255, img[p + 1] * gan[1]);
      img[p + 2] = Math.min(255, img[p + 2] * gan[2]);
    }
    return { aplicado: true, ganancia: gan, n: top.length,
             tempRel: (gan[2] / gan[0]) };
  }

  /* PASO 2 · Segmentación adaptativa de piel.
     En lugar de umbrales YCbCr fijos (calibrados históricamente sobre pieles
     claras y poco fiables en fototipos altos), tomamos como prototipo la
     mediana cromática de las mejillas del propio sujeto y admitimos los
     píxeles dentro de una distancia en el plano (a*, b*). Funciona en todo
     el rango de fototipos. */
  function segmentarPiel(img, w, h, lab) {
    var muestrasA = new Float32Array(20000), muestrasB = new Float32Array(20000), nm = 0;
    var zonasRef = [ZONES[3].poly, ZONES[4].poly];
    var tmp = [0, 0, 0], x, y, o;
    for (var z = 0; z < zonasRef.length; z++) {
      for (y = 0; y < h; y += 2) {
        for (x = 0; x < w; x += 2) {
          if (nm >= 20000) break;
          if (!puntoEnPoligono(x / w, y / h, zonasRef[z])) continue;
          o = (y * w + x) * 4;
          rgbToLab(img[o], img[o + 1], img[o + 2], tmp);
          muestrasA[nm] = tmp[1]; muestrasB[nm] = tmp[2]; nm++;
        }
      }
    }
    var protA = nm ? percentil(muestrasA, nm, 0.5) : 14;
    var protB = nm ? percentil(muestrasB, nm, 0.5) : 18;

    var mascara = new Uint8Array(w * h);
    var cuenta = 0;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        var nx = x / w, ny = y / h;
        var fuera = false;
        for (var e = 0; e < EXCLUDE.length; e++) {
          var E = EXCLUDE[e];
          if (nx > E[0] && nx < E[2] && ny > E[1] && ny < E[3]) { fuera = true; break; }
        }
        if (fuera) continue;
        o = (y * w + x) * 4;
        var idx = y * w + x;
        var L = lab[idx * 3], A = lab[idx * 3 + 1], Bb = lab[idx * 3 + 2];
        if (L < 14 || L > 97) continue;                       // sombra dura / quemado
        var dist = Math.hypot(A - protA, Bb - protB);
        if (dist > 26) continue;                              // fuera del cono de piel
        mascara[idx] = 1; cuenta++;
      }
    }
    return { mascara: mascara, n: cuenta, prototipo: [protA, protB] };
  }

  /* PASO 3 · Separación difusa / especular.
     Modelo dicromático de reflexión (Shafer, 1985): la componente especular
     es acromática, por lo que se suma por igual a los tres canales y eleva
     el MÍNIMO de (R,G,B). Tomando como línea base difusa el percentil 55 del
     canal mínimo sobre piel, el exceso por encima de esa base es reflexión
     especular — es decir, película sebácea superficial.

     Nota honesta: esto mide BRILLO, no cantidad de sebo en µg/cm². La
     correlación entre brillo especular y sebumetría es buena pero no es una
     equivalencia. Se reporta como índice relativo. */
  function separarEspecular(img, w, h, mascara) {
    var n = w * h;
    var minCanal = new Float32Array(n);
    var muestras = new Float32Array(n), nm = 0;
    for (var i = 0; i < n; i++) {
      if (!mascara[i]) continue;
      var o = i * 4;
      var mn = Math.min(img[o], Math.min(img[o + 1], img[o + 2]));
      minCanal[i] = mn;
      muestras[nm++] = mn;
    }
    var base = nm ? percentil(muestras, nm, 0.55) : 0;
    var techo = nm ? percentil(muestras, nm, 0.995) : 255;
    var rango = Math.max(8, techo - base);
    var espec = new Float32Array(n);
    for (i = 0; i < n; i++) {
      if (!mascara[i]) continue;
      espec[i] = Math.max(0, (minCanal[i] - base)) / rango;   // 0..~1
    }
    return { mapa: espec, base: base, rango: rango };
  }

  /* PASO 4 · Banda de textura.
     Filtro paso-banda (diferencia de cajas) sobre L* a la escala del poro.
     A 0,26 mm/px, un poro de 0,1–0,6 mm ocupa 0,4–2,3 px, de modo que la
     banda útil está entre radio 1 y radio 4. La desviación típica del
     residuo dentro de la zona es el índice de textura. */
  function bandaTextura(lab, w, h, mascara) {
    var n = w * h;
    var L = new Float32Array(n);
    for (var i = 0; i < n; i++) L[i] = lab[i * 3];
    var finoB = desenfoqueMascara(L, mascara, w, h, 1);
    var gruesoB = desenfoqueMascara(L, mascara, w, h, 4);
    var banda = new Float32Array(n);
    for (i = 0; i < n; i++) banda[i] = mascara[i] ? (finoB[i] - gruesoB[i]) : 0;
    return banda;
  }

  /* PASO 5 · Detección de imperfecciones.
     Sobre el mapa de eritema restamos su mediana local (radio 18 px ≈ 4,7 mm)
     para eliminar el rubor difuso y quedarnos con lesiones focales. Umbral
     robusto a 3,0 · MAD, componentes conexas por inundación, y filtrado por
     área entre 0,45 y 12 mm² — el rango de una pápula o una mácula
     posinflamatoria. Por debajo es ruido; por encima, rubor de zona.

     Dos precauciones aprendidas en validación:
     · El mapa se presuaviza a radio 1 px. Sin ello el ruido del sensor genera
       manchas de 2–3 px que pasan el filtro de área.
     · El fondo local se calcula con convolución normalizada por máscara,
       no con un desenfoque plano (ver desenfoqueMascara).
     · Los píxeles con reflexión especular apreciable quedan EXCLUIDOS. El
       brillo satura el canal rojo antes que el verde, dispara el cociente R/G
       y fabrica lesiones inexistentes justo en el dorso nasal y los pómulos —
       precisamente donde más brilla la piel. */
  function detectarImperfecciones(mapaEI, w, h, mascaraPiel, mapaEspecular) {
    var n = w * h, i;

    /* Máscara efectiva: piel válida y no especular. El brillo satura el canal
       rojo antes que el verde, dispara el cociente R/G y fabrica lesiones
       justo donde más brilla la piel — dorso nasal y pómulos. */
    var valido = new Uint8Array(n);
    for (i = 0; i < n; i++) {
      valido[i] = (mascaraPiel[i] && (!mapaEspecular || mapaEspecular[i] < 0.42)) ? 1 : 0;
    }

    /* Residuo focal: señal menos su fondo local, ambos con convolución
       normalizada por máscara para que los bordes no generen orlas. */
    var suave = desenfoqueMascara(mapaEI, valido, w, h, 1);
    var fondo = desenfoqueMascara(suave, valido, w, h, PARAM.radioFondo);
    var resid = new Float32Array(n);
    for (i = 0; i < n; i++) if (valido[i]) resid[i] = suave[i] - fondo[i];

    /* Umbral LOCAL, no global.
       Un único umbral derivado de la MAD de todo el rostro asume que el ruido
       es homogéneo, y no lo es: alrededor de un brillo especular amplio la
       varianza local se dispara, de modo que un umbral global se desborda
       precisamente ahí. En validación eso llenaba la frente de focos
       inexistentes de forma reproducible.

       Se estima la escala del ruido en un entorno de 24 px (≈ 6 mm) y se
       trabaja con la puntuación tipificada z = residuo / escala local. */
    var absR = new Float32Array(n);
    for (i = 0; i < n; i++) absR[i] = valido[i] ? Math.abs(resid[i]) : 0;
    var escala = desenfoqueMascara(absR, valido, w, h, PARAM.radioRuido);

    var z = new Float32Array(n);
    for (i = 0; i < n; i++) {
      if (!valido[i]) continue;
      z[i] = resid[i] / Math.max(0.22, escala[i] * 1.4826);
    }

    var zUmbral = PARAM.zUmbral;
    var minAbs = PARAM.minAbs;

    var visto = new Uint8Array(n);
    var pila = new Int32Array(8192);
    var areaMinPx = Math.max(5, Math.round(0.45 / (MM_PER_PX * MM_PER_PX)));
    var areaMaxPx = Math.round(12 / (MM_PER_PX * MM_PER_PX));
    var lesiones = [];

    for (i = 0; i < n; i++) {
      if (visto[i] || !valido[i] || z[i] < zUmbral) continue;
      var sp = 0; pila[sp++] = i; visto[i] = 1;
      var px = [], sumInt = 0, pico = 0;
      while (sp > 0 && px.length < areaMaxPx + 1) {
        var p = pila[--sp];
        px.push(p); sumInt += resid[p];
        if (resid[p] > pico) pico = resid[p];
        var y = (p / w) | 0, x = p - y * w;
        var vec = [
          x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1,
          y > 0 ? p - w : -1, y < h - 1 ? p + w : -1
        ];
        for (var k = 0; k < 4; k++) {
          var q = vec[k];
          if (q < 0 || visto[q] || !valido[q] || z[q] < zUmbral) continue;
          visto[q] = 1;
          if (sp < pila.length) pila[sp++] = q;
        }
      }
      /* Una lesión real tiene tamaño de pápula o mácula Y contraste
         apreciable en términos absolutos, no sólo respecto al ruido. */
      if (px.length < areaMinPx || px.length > areaMaxPx || pico < minAbs) continue;
      var cx = 0, cy = 0;
      for (var j = 0; j < px.length; j++) { cy += (px[j] / w) | 0; cx += px[j] % w; }
      lesiones.push({
        x: cx / px.length / w, y: cy / px.length / h,
        areaMm2: px.length * MM_PER_PX * MM_PER_PX,
        intensidad: sumInt / px.length
      });
    }
    return { lesiones: lesiones, umbral: zUmbral, minAbs: minAbs };
  }

  /* ------------------------------------------------------- ESCALAS DE BANDA
     Convierten magnitudes físicas en un índice 0–100 sobre bandas de
     referencia. IMPORTANTE: estas bandas son operativas, calibradas para las
     condiciones de captura de este dispositivo. No son normas poblacionales
     publicadas. Se expone SIEMPRE el valor físico junto al índice.          */
  function escalar(valor, min, max) {
    return Math.max(0, Math.min(100, (valor - min) / (max - min) * 100));
  }

  function banda(indice) {
    if (indice < 30) return { clave: 'ok',  etiqueta: { es: 'Óptimo',   en: 'Optimal', ko: "최적" } };
    if (indice < 55) return { clave: 'mid', etiqueta: { es: 'Moderado', en: 'Moderate', ko: "중등도" } };
    if (indice < 78) return { clave: 'hi',  etiqueta: { es: 'Elevado',  en: 'Elevated', ko: "상승" } };
    return              { clave: 'max', etiqueta: { es: 'Alto',     en: 'High', ko: "높음" } };
  }

  /* ---------------------------------------------------------- ORQUESTACIÓN */

  function analizar(canvasCaptura, onPaso) {
    var pasos = [];
    function paso(titulo, detalle) {
      pasos.push({ titulo: titulo, detalle: detalle });
      if (onPaso) onPaso(titulo, detalle, pasos.length);
    }

    var util = extraerZonaUtil(canvasCaptura);
    var w = util.w, h = util.h, n = w * h;
    var d = util.ctx.getImageData(0, 0, w, h);
    var img = d.data;

    // 1 · Balance de blancos
    var wb = balanceBlancos(img, w, h);
    var ganTxt = wb.ganancia.map(function (g) { return g.toFixed(3); }).join(' / ');
    paso({ es: 'Normalización cromática', en: 'Chromatic normalisation', ko: "색보정" },
      wb.aplicado
        ? { es: 'Blanco de referencia sobre esclerótica · ' + wb.n + ' px · ganancia R/G/B ' + ganTxt,
            en: 'White reference from sclera · ' + wb.n + ' px · R/G/B gain ' + ganTxt }
        : { es: 'Sin referencia acromática válida — se omite la corrección' +
                (wb.motivo ? ' (' + wb.motivo + ')' : '') + '. Confianza reducida.',
            en: 'No valid achromatic reference — correction skipped' +
                (wb.motivo ? ' (deviation too large)' : '') + '. Confidence reduced.' });

    // Tabla LAB completa
    var lab = new Float32Array(n * 3);
    var tmp = [0, 0, 0];
    for (var i = 0; i < n; i++) {
      var o = i * 4;
      rgbToLab(img[o], img[o + 1], img[o + 2], tmp);
      lab[i * 3] = tmp[0]; lab[i * 3 + 1] = tmp[1]; lab[i * 3 + 2] = tmp[2];
    }

    // 2 · Segmentación
    var seg = segmentarPiel(img, w, h, lab);
    var cobertura = seg.n / n;
    var segTxt = (seg.n / 1000).toFixed(1) + ' k px · ' + (cobertura * 100).toFixed(1) +
      ' % · a*' + seg.prototipo[0].toFixed(1) + ' b*' + seg.prototipo[1].toFixed(1);
    paso({ es: 'Segmentación de piel', en: 'Skin segmentation', ko: "피부 영역 분할" },
      { es: (seg.n / 1000).toFixed(1) + ' k px válidos · ' + (cobertura * 100).toFixed(1) +
            ' % del encuadre · prototipo a*' + seg.prototipo[0].toFixed(1) +
            ' b*' + seg.prototipo[1].toFixed(1),
        en: (seg.n / 1000).toFixed(1) + ' k valid px · ' + (cobertura * 100).toFixed(1) +
            ' % of frame · prototype a*' + seg.prototipo[0].toFixed(1) +
            ' b*' + seg.prototipo[1].toFixed(1) });

    // 3 · Especular
    var esp = separarEspecular(img, w, h, seg.mascara);
    paso({ es: 'Separación difusa / especular', en: 'Diffuse / specular separation', ko: "확산 / 정반사 분리" },
      { es: 'Modelo dicromático · línea base difusa en ' + esp.base.toFixed(0) +
            '/255 · rango especular ' + esp.rango.toFixed(0),
        en: 'Dichromatic model · diffuse baseline at ' + esp.base.toFixed(0) +
            '/255 · specular range ' + esp.rango.toFixed(0) });

    // 4 · Eritema y melanina
    var mapaEI = new Float32Array(n), mapaMI = new Float32Array(n);
    for (i = 0; i < n; i++) {
      if (!seg.mascara[i]) continue;
      var oo = i * 4;
      var Rl = LUT_LIN[img[oo]], Gl = LUT_LIN[img[oo + 1]];
      mapaEI[i] = eritema(Rl, Gl);
      mapaMI[i] = melanina(Rl);
    }
    paso({ es: 'Mapa de eritema', en: 'Erythema map', ko: "홍반 맵" },
      { es: 'Índice hemoglobínico 100·log₁₀(R/G) sobre reflectancia linealizada',
        en: 'Haemoglobin index 100·log₁₀(R/G) over linearised reflectance' });

    // 5 · Textura
    var mapaTex = bandaTextura(lab, w, h, seg.mascara);
    paso({ es: 'Banda de textura', en: 'Texture band', ko: "결 대역" },
      { es: 'Paso-banda r1–r4 sobre L* · escala ' + MM_PER_PX.toFixed(3) +
            ' mm/px · ventana 0,26–2,08 mm',
        en: 'Band-pass r1–r4 over L* · scale ' + MM_PER_PX.toFixed(3) +
            ' mm/px · window 0.26–2.08 mm' });

    // 6 · Imperfecciones
    var imp = detectarImperfecciones(mapaEI, w, h, seg.mascara, esp.mapa);
    paso({ es: 'Detección de imperfecciones', en: 'Blemish detection', ko: "잡티 검출" },
      { es: imp.lesiones.length + ' focos entre 0,45 y 12 mm² · z > ' + imp.umbral.toFixed(1) +
            ' sobre ruido local · zonas especulares excluidas',
        en: imp.lesiones.length + ' foci between 0.45 and 12 mm² · z > ' + imp.umbral.toFixed(1) +
            ' over local noise · specular areas excluded' });

    // 7 · Consolidación por zonas
    var buf = new Float32Array(n);
    var resultadoZonas = ZONES.map(function (Z) {
      var idxs = [];
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var id = y * w + x;
          if (!seg.mascara[id]) continue;
          if (!puntoEnPoligono(x / w, y / h, Z.poly)) continue;
          idxs.push(id);
        }
      }
      var m = idxs.length;
      if (m < 200) {
        return { id: Z.id, nombre: Z.nombre, grupo: Z.grupo, valido: false, n: m };
      }
      function agregar(mapa, p) {
        for (var k = 0; k < m; k++) buf[k] = mapa[idxs[k]];
        return p === undefined ? media(buf, m) : percentil(buf, m, p);
      }
      // Brillo: área con reflexión especular apreciable + intensidad media
      var areaEsp = 0;
      for (var k = 0; k < m; k++) if (esp.mapa[idxs[k]] > 0.42) areaEsp++;
      var brilloArea = areaEsp / m;
      var brilloInt = agregar(esp.mapa);

      var EI = agregar(mapaEI);
      var MI = agregar(mapaMI);

      for (k = 0; k < m; k++) buf[k] = lab[idxs[k] * 3];
      var Lm = media(buf, m), Lsd = desviacion(buf, m, Lm);
      for (k = 0; k < m; k++) buf[k] = lab[idxs[k] * 3 + 1];
      var Am = media(buf, m);
      for (k = 0; k < m; k++) buf[k] = lab[idxs[k] * 3 + 2];
      var Bm = media(buf, m);

      for (k = 0; k < m; k++) buf[k] = mapaTex[idxs[k]];
      var texM = media(buf, m);
      var texSd = desviacion(buf, m, texM);

      var lesZona = imp.lesiones.filter(function (l) {
        return puntoEnPoligono(l.x, l.y, Z.poly);
      });

      return {
        id: Z.id, nombre: Z.nombre, grupo: Z.grupo, valido: true, n: m,
        brilloArea: brilloArea, brilloInt: brilloInt,
        EI: EI, MI: MI, L: Lm, a: Am, b: Bm, Lsd: Lsd,
        ITA: ita(Lm, Bm),
        textura: texSd,
        lesiones: lesZona.length,
        areaLesionMm2: lesZona.reduce(function (s, l) { return s + l.areaMm2; }, 0)
      };
    });

    var validas = resultadoZonas.filter(function (z) { return z.valido; });
    paso({ es: 'Consolidación por zonas', en: 'Zone consolidation', ko: "부위별 집계" },
      { es: validas.length + '/' + ZONES.length + ' zonas con muestra suficiente',
        en: validas.length + '/' + ZONES.length + ' zones with sufficient sample' });

    /* ------------------------------------------------ MÉTRICAS GLOBALES */
    function prom(campo, grupo) {
      var sel = validas.filter(function (z) { return !grupo || z.grupo === grupo; });
      if (!sel.length) return 0;
      return sel.reduce(function (s, z) { return s + z[campo]; }, 0) / sel.length;
    }

    var brilloT = prom('brilloArea', 'T'), brilloU = prom('brilloArea', 'U');
    var eiGlobal = prom('EI'), texGlobal = prom('textura');
    var Lglobal = prom('L'), bGlobal = prom('b');
    var itaGlobal = ita(Lglobal, bGlobal);

    // Uniformidad de tono: dispersión del ITA entre zonas
    var itas = validas.map(function (z) { return z.ITA; });
    var itaMedia = itas.reduce(function (a, b) { return a + b; }, 0) / (itas.length || 1);
    var itaSd = Math.sqrt(itas.reduce(function (s, v) {
      return s + Math.pow(v - itaMedia, 2);
    }, 0) / Math.max(1, itas.length - 1));

    var totalLesiones = validas.reduce(function (s, z) { return s + z.lesiones; }, 0);

    // Patrón seborreico: T alto y U bajo = mixta; ambos altos = grasa
    var ratioTU = brilloU > 0.01 ? brilloT / brilloU : (brilloT > 0.03 ? 8 : 1);
    var patron;
    if (brilloT > 0.18 && brilloU > 0.12)
      patron = { clave: 'grasa',  etiqueta: { es: 'Seborreica difusa', en: 'Diffusely seborrhoeic', ko: "전반적 지성" } };
    else if (brilloT > 0.085 && ratioTU > 1.7)
      patron = { clave: 'mixta',  etiqueta: { es: 'Mixta (zona T)', en: 'Combination (T-zone)', ko: "복합성 (T존)" } };
    else if (brilloT < 0.05 && brilloU < 0.045)
      patron = { clave: 'seca',   etiqueta: { es: 'Alípica', en: 'Alipidic', ko: "건성" } };
    else
      patron = { clave: 'normal', etiqueta: { es: 'Eudérmica', en: 'Eudermic', ko: "정상" } };

    // Eritema centrofacial (patrón rosaceiforme) — mejillas vs frente
    var eiMej = prom('EI', 'U'), eiFrente = 0;
    var zf = validas.filter(function (z) { return z.id === 'frente'; })[0];
    if (zf) eiFrente = zf.EI;
    var deltaCentral = eiMej - eiFrente;

    /* ---------------------------------------------------------- ÍNDICES */
    var areaLes = validas.reduce(function (s2, z) { return s2 + z.areaLesionMm2; }, 0).toFixed(1);
    var metricas = [
      {
        id: 'brillo',
        nombre: { es: 'Brillo superficial', en: 'Surface shine', ko: "표면 유분" },
        valor: brilloT * 100,
        indice: escalar(brilloT, BANDAS.brillo[0], BANDAS.brillo[1]),
        fisico: { es: (brilloT * 100).toFixed(1) + ' % · U ' + (brilloU * 100).toFixed(1) + ' %',
                  en: (brilloT * 100).toFixed(1) + ' % · U ' + (brilloU * 100).toFixed(1) + ' %' },
        desc: { es: 'Fracción de superficie con reflexión especular por encima de la línea base difusa.',
                en: 'Fraction of the surface with specular reflection above the diffuse baseline.', ko: "확산 반사 기준선을 넘는 정반사가 나타나는 표면 비율." }
      },
      {
        id: 'eritema',
        nombre: { es: 'Índice de eritema', en: 'Erythema index', ko: "홍반지수" },
        valor: eiGlobal,
        indice: escalar(eiGlobal, BANDAS.eritema[0], BANDAS.eritema[1]),
        fisico: { es: eiGlobal.toFixed(1) + ' UI · a* ' + prom('a').toFixed(1),
                  en: eiGlobal.toFixed(1) + ' units · a* ' + prom('a').toFixed(1) },
        desc: { es: 'Concentración relativa de hemoglobina superficial por absorción diferencial R/G.',
                en: 'Relative superficial haemoglobin concentration from differential R/G absorption.', ko: "R/G 차등 흡수로 산출한 표층 헤모글로빈 상대 농도." }
      },
      {
        id: 'textura',
        nombre: { es: 'Densidad de textura', en: 'Texture density', ko: "결 밀도" },
        valor: texGlobal,
        indice: escalar(texGlobal, BANDAS.textura[0], BANDAS.textura[1]),
        fisico: { es: texGlobal.toFixed(2) + ' σL* @ 0,26–2,08 mm',
                  en: texGlobal.toFixed(2) + ' σL* @ 0.26–2.08 mm' },
        desc: { es: 'Amplitud del relieve en la banda espacial del poro y el microrrelieve.',
                en: 'Relief amplitude in the spatial band of pores and microrelief.', ko: "모공과 미세 요철에 해당하는 공간 대역의 굴곡 진폭." }
      },
      {
        id: 'imperfecciones',
        nombre: { es: 'Imperfecciones focales', en: 'Focal blemishes', ko: "국소 잡티" },
        valor: totalLesiones,
        indice: escalar(totalLesiones, BANDAS.imperfecciones[0], BANDAS.imperfecciones[1]),
        fisico: { es: totalLesiones + ' focos · ' + areaLes + ' mm²',
                  en: totalLesiones + ' foci · ' + areaLes + ' mm²' },
        desc: { es: 'Lesiones eritematosas focales de 0,3 a 12 mm² sobre el fondo de rubor difuso.',
                en: 'Focal erythematous lesions of 0.3 to 12 mm² above the diffuse flush background.', ko: "확산성 붉은기 위에 나타나는 0.3~12 mm² 크기의 국소 홍반 병변." }
      },
      {
        id: 'uniformidad',
        nombre: { es: 'Heterogeneidad del tono', en: 'Tone heterogeneity', ko: "피부톤 불균일도" },
        valor: itaSd,
        indice: escalar(itaSd, BANDAS.uniformidad[0], BANDAS.uniformidad[1]),
        fisico: { es: '±' + itaSd.toFixed(1) + '° entre ' + validas.length + ' zonas',
                  en: '±' + itaSd.toFixed(1) + '° across ' + validas.length + ' zones' },
        desc: { es: 'Dispersión del ángulo tipológico entre zonas; sigue la irregularidad pigmentaria.',
                en: 'Spread of the typology angle across zones; tracks pigmentary irregularity.', ko: "부위 간 유형각의 산포도 — 색소 불균일을 반영합니다." }
      }
    ];
    metricas.forEach(function (m) { m.banda = banda(m.indice); });

    /* ------------------------------------------------------- CONFIANZA */
    var confianza = 100;
    var notas = [];
    if (!wb.aplicado) {
      confianza -= 22;
      notas.push({ es: 'Sin normalización cromática por esclerótica',
                   en: 'No chromatic normalisation from the sclera', ko: "공막 기준 색보정 없음" });
    }
    if (cobertura < 0.30) {
      confianza -= 20;
      notas.push({ es: 'Cobertura de piel baja (' + (cobertura * 100).toFixed(0) + ' %)',
                   en: 'Low skin coverage (' + (cobertura * 100).toFixed(0) + ' %)' });
    }
    if (validas.length < ZONES.length) {
      var faltan = ZONES.length - validas.length;
      confianza -= faltan * 7;
      notas.push({ es: faltan + ' zona(s) sin muestra suficiente',
                   en: faltan + ' zone(s) without sufficient sample' });
    }
    confianza = Math.max(35, Math.round(confianza));

    return {
      zonas: resultadoZonas, validas: validas, metricas: metricas,
      pasos: pasos,
      global: {
        ITA: itaGlobal, tono: clasificarITA(itaGlobal),
        L: Lglobal, b: bGlobal, a: prom('a'),
        patron: patron, ratioTU: ratioTU,
        brilloT: brilloT, brilloU: brilloU,
        eritema: eiGlobal, deltaCentral: deltaCentral,
        textura: texGlobal, itaSd: itaSd, lesiones: totalLesiones,
        cobertura: cobertura, mmPorPx: MM_PER_PX
      },
      wb: wb,
      confianza: confianza, notasConfianza: notas,
      lesiones: imp.lesiones,
      util: util,
      /* Sólo para la vista ampliada del informe. Viven en memoria como el
         resto del resultado y se descartan al cerrar la sesión. */
      mapas: { textura: mapaTex, mascara: seg.mascara, especular: esp.mapa }
    };
  }

  global.ESPEJO_ENGINE = {
    CANVAS_W: CANVAS_W, CANVAS_H: CANVAS_H, RETICLE: RETICLE,
    ZONES: ZONES, EXCLUDE: EXCLUDE, MM_PER_PX: MM_PER_PX,
    PARAM: PARAM, BANDAS: BANDAS,
    evaluarEncuadre: evaluarEncuadre, reiniciarEncuadre: reiniciarEncuadre,
    analizar: analizar, clasificarITA: clasificarITA, banda: banda
  };
})(window);
