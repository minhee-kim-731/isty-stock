/* ==========================================================================
   ESPEJO · Idiomas
   --------------------------------------------------------------------------
   Castellano por defecto: el puesto está en Madrid. El inglés cubre a
   visitantes internacionales y a los creadores que no hablan español.

   Cada cadena vive como un objeto {es, en} junto al código que la usa, en
   lugar de en un fichero de claves aparte. Con dos idiomas eso mantiene el
   texto a la vista de quien edita la lógica, que es donde se estropea.
   ========================================================================== */
(function (global) {
  'use strict';

  var CLAVE = 'espejo.idioma';
  var IDIOMAS = ['es', 'en', 'ko'];
  var actual = 'es';
  var oyentes = [];

  try {
    var guardado = localStorage.getItem(CLAVE);
    if (guardado && IDIOMAS.indexOf(guardado) >= 0) actual = guardado;
  } catch (e) {}

  /* Resuelve {es, en} — o devuelve la cadena tal cual si no está traducida. */
  function tx(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    return v[actual] !== undefined ? v[actual] : (v.es !== undefined ? v.es : '');
  }

  function t(clave) {
    var v = D[clave];
    if (v === undefined) return clave;   // visible a propósito: falta traducir
    return tx(v);
  }

  function fijar(l) {
    if (IDIOMAS.indexOf(l) < 0 || l === actual) return;
    actual = l;
    try { localStorage.setItem(CLAVE, l); } catch (e) {}
    document.documentElement.setAttribute('lang', l);
    aplicarEstaticos();
    oyentes.forEach(function (f) { try { f(l); } catch (e) {} });
  }

  /* Rellena todo nodo con data-i18n. Con data-i18n-attr se traduce un
     atributo (aria-label, title) en lugar del contenido. */
  function aplicarEstaticos(raiz) {
    var alcance = raiz || document;
    Array.prototype.forEach.call(alcance.querySelectorAll('[data-i18n]'), function (n) {
      var clave = n.getAttribute('data-i18n');
      var attr = n.getAttribute('data-i18n-attr');
      var valor = D[clave];
      if (valor === undefined) return;
      if (attr) { n.setAttribute(attr, tx(valor)); return; }
      // innerHTML no es fiable dentro de SVG: allí se escribe como texto.
      if (n.namespaceURI === 'http://www.w3.org/2000/svg') n.textContent = tx(valor);
      else n.innerHTML = tx(valor);
    });
  }

  /* ====================================================== DICCIONARIO UI */
  var D = {

    /* --- Cabecera ---------------------------------------------------- */
    'hud.ses':   { es: 'SES', en: 'SES', ko: "세션" },
    'hud.eq':    { es: 'EQ', en: 'DEV', ko: "기기" },
    'hud.opt':   { es: 'Cámara', en: 'OPT', ko: "광학" },
    /* Desde que existe el alta de correo, la página SÍ hace una llamada de
       red. El rótulo se acota al análisis, que es lo que sigue siendo cierto. */
    'hud.proc':  { es: 'ANÁLISIS', en: 'ANALYSIS', ko: "분석" },
    'hud.local': { es: 'local · sin red', en: 'on-device · offline', ko: "기기 내부 · 네트워크 없음" },
    'hud.espera':{ es: 'en espera', en: 'standby', ko: "대기" },
    'hud.activa':{ es: 'activa', en: 'active', ko: "작동 중" },
    'hud.detenida': { es: 'detenida', en: 'stopped', ko: "정지" },
    'hud.nodisp':{ es: 'no disponible', en: 'unavailable', ko: "사용 불가" },
    'hud.idioma':{ es: 'Cambiar idioma', en: 'Change language', ko: "언어 변경" },
    'hud.escritorio': { es: 'Escritorio', en: 'Desktop', ko: "데스크톱" },

    /* --- Fases -------------------------------------------------------- */
    'fase.intro':  { es: 'Presentación', en: 'Overview', ko: "소개" },
    'fase.captura':{ es: 'Captura', en: 'Capture', ko: "촬영" },
    'fase.proceso':{ es: 'Procesamiento', en: 'Processing', ko: "처리" },
    'fase.cuest':  { es: 'Cuestionario', en: 'Questionnaire', ko: "문진" },
    'fase.informe':{ es: 'Informe', en: 'Report', ko: "결과지" },
    'rail.pie': {
      es: 'Las fotos no salen de esta tableta<br>Análisis cosmético, no médico',
      en: 'Runs on this device<br>No data transmitted<br>Cosmetic analysis,<br>not a medical diagnosis', ko: "기기 내부에서 처리<br>데이터 전송 없음<br>미용 목적 분석,<br>의학적 진단 아님" },
    'rail.calib': { es: 'Calibración', en: 'Calibration', ko: "보정" },
    'rail.calibPie': {
      es: 'Modo técnico<br>{n} muestras<br>Sólo se guardan números',
      en: 'Technical mode<br>{n} samples<br>Numbers only are stored',
      ko: "기술 모드<br>{n}개 표본<br>숫자만 저장됨"
    },

    /* --- Intro -------------------------------------------------------- */
    'intro.eyebrow': {
      es: 'Análisis de piel · Madrid 2026',
      en: 'Optical skin analysis · Madrid 2026', ko: "광학 피부 분석 · 마드리드 2026" },
    'intro.h1': {
      es: 'Tu piel en<br><span class="on">3 minutos</span>.',
      en: 'Your skin, <span class="on">measured</span><br>and explained.', ko: "당신의 피부,<br><span class=\"on\">측정</span>하고 설명합니다." },
    'intro.p1': {
      es: 'Espejo hace una foto de tu cara y mide cinco cosas: brillo, rojez, textura, imperfecciones y tono. Después te hace cinco preguntas rápidas y, con todo eso, arma tu perfil de piel.',
      en: 'Espejo photographs your face once and pulls five physical quantities out of that ' +
          'image: specular reflection, haemoglobin absorption, relief in the pore band, focal ' +
          'lesions and the typology angle of your skin tone. It then cross-checks them against ' +
          'a short clinical questionnaire to build a full profile.', ko: "Espejo는 얼굴을 한 번 촬영해 그 이미지에서 다섯 가지 물리량을 뽑아냅니다 — 정반사, 헤모글로빈 흡수, 모공 대역의 요철, 국소 병변, 피부톤의 유형각(ITA). 그다음 짧은 임상 문진과 교차해 전체 프로필을 구성합니다." },
    'intro.p2': {
      es: 'Todo se hace dentro de esta tableta.',
      en: 'The whole thing takes about three minutes and happens entirely on this tablet.', ko: "전 과정은 약 3분이 걸리고, 이 태블릿 안에서만 이루어집니다." },
    'intro.btn':  { es: 'Iniciar análisis', en: 'Start analysis', ko: "분석 시작" },
    'intro.btnNota': {
      es: 'Retira las gafas y aparta el pelo de la frente.',
      en: 'Take off your glasses and move your hair off your forehead.', ko: "안경을 벗고 이마의 머리카락을 넘겨주세요." },
    'intro.specTitulo': { es: 'Qué analizamos', en: 'What is measured, and what is not', ko: "무엇을 측정하고 무엇을 측정하지 않는가" },
    'intro.m1': { es: 'Brillo (sebo)', en: 'Surface shine (sebum)', ko: "표면 유분 (피지)" },
    'intro.m2': { es: 'Rojez', en: 'Erythema · redness', ko: "홍반 · 붉은기" },
    'intro.m3': { es: 'Textura y poros', en: 'Texture and pores', ko: "결과 모공" },
    'intro.m4': { es: 'Imperfecciones', en: 'Focal blemishes', ko: "국소 잡티" },
    'intro.m5': { es: 'Tono de piel', en: 'Constitutive tone · ITA°', ko: "고유 피부톤 · ITA°" },
    'intro.m6': { es: 'Hidratación', en: 'Stratum corneum hydration', ko: "각질층 수분" },
    'intro.m7': { es: 'Sensibilidad', en: 'Reactivity and tolerance', ko: "반응성과 내성" },
    'intro.m8': { es: 'Envejecimiento por el sol', en: 'Photoageing', ko: "광노화" },
    'intro.optico': { es: 'Con la cámara', en: 'Optical', ko: "광학" },
    'intro.cuest':  { es: 'Con preguntas', en: 'Questionnaire', ko: "문진" },
    'intro.nota': {
      es: 'La hidratación real solo se puede medir con un aparato en contacto con la piel. Por eso aquí la sacamos de tus respuestas.',
      en: 'Real stratum corneum hydration is only measurable by capacitive corneometry, with ' +
          'an electrode touching the skin. No camera can obtain it, and this report does not ' +
          'pretend otherwise.', ko: "각질층의 실제 수분량은 전극을 피부에 접촉시키는 정전용량식 코니오미터로만 측정됩니다. 어떤 카메라로도 얻을 수 없으며, 이 결과지는 얻을 수 있는 척하지 않습니다." },
    'intro.privTitulo': { es: 'Privacidad', en: 'Privacy', ko: "개인정보" },
    'intro.priv': {
      es: 'La foto se procesa en esta tableta y no se envía a ningún servidor. No se guarda ni se asocia a tu nombre, y se borra al terminar. Si nos dejas tu correo, ese sí lo guardamos, pero por separado y nunca junto a tu análisis.',
      en: 'The image is processed in this device\'s memory and never sent to a server. It is ' +
          'not written to disk and not linked to your name. It is destroyed when the session ' +
          'ends. If you give us your email, that is stored — but separately, and never joined ' +
          'to your analysis.', ko: "이미지는 이 기기의 메모리에서 처리되며 어떤 서버로도 전송되지 않습니다. 디스크에 저장되지 않고 이름과 연결되지도 않습니다. 세션을 닫으면 파기됩니다. 이메일을 남기시면 그것은 저장되지만, 별도로 저장되며 분석 결과와 결합되지 않습니다." },

    /* --- Correo ------------------------------------------------------- */
    'cor.eyebrow': { es: 'Paso 2 de 6', en: 'Step 02 · Contact', ko: "02단계 · 연락처" },
    'cor.h2':      { es: '¿Te enviamos novedades?', en: 'Want to hear from us?', ko: "소식을 보내드릴까요?" },
    'cor.lede': {
      es: 'Déjanos tu correo si quieres que Lococo te avise de lanzamientos y ofertas. ' +
          'Es opcional: puedes saltar este paso y el análisis funciona igual.',
      en: 'Leave your email if you want Lococo to let you know about launches and offers. ' +
          'It is optional: you can skip this step and the analysis works just the same.', ko: "Lococo의 신제품과 혜택 소식을 받고 싶으시면 이메일을 남겨주세요. 선택 사항이며, 건너뛰어도 분석은 동일하게 진행됩니다." },
    'cor.etiqueta': { es: 'Correo electrónico', en: 'Email address', ko: "이메일 주소" },
    'cor.consent': {
      es: 'Acepto que Lococo guarde mi correo para enviarme novedades y ofertas. ' +
          'Puedo darme de baja cuando quiera escribiendo a hola@lococo.beauty.',
      en: 'I agree that Lococo may store my email to send me news and offers. ' +
          'I can unsubscribe at any time by writing to hola@lococo.beauty.', ko: "Lococo가 신제품·혜택 안내를 위해 제 이메일을 저장하는 데 동의합니다. hola@lococo.beauty 로 언제든 수신을 해지할 수 있습니다." },
    'cor.continuar': { es: 'Continuar', en: 'Continue', ko: "계속" },
    'cor.saltar':    { es: 'Saltar este paso', en: 'Skip this step', ko: "이 단계 건너뛰기" },
    'cor.datosTitulo': { es: 'Qué guardamos', en: 'What is stored, and what is not', ko: "무엇이 저장되고 무엇이 저장되지 않는가" },
    'cor.datos': {
      es: '<b>Tu correo</b> se guarda en un servidor de Cloudflare en Europa, con el idioma y la fecha. Nada más.<br><b>Las fotos y los resultados no se guardan.</b> Se procesan en esta tableta y se borran al terminar. Tu correo nunca se vincula con tu piel.',
      en: '<b>Your email</b> is stored on a Cloudflare server in Europe, along with the language ' +
          'and the date. Nothing else.<br><b>The images and the analysis results are NOT stored</b> ' +
          'anywhere: they are processed on this tablet and destroyed when the session ends. Your ' +
          'email is never linked to your skin.', ko: "<b>이메일</b>은 유럽 소재 Cloudflare 서버에 언어·날짜와 함께 저장됩니다. 그 외에는 없습니다.<br><b>이미지와 분석 결과는 어디에도 저장되지 않습니다</b> — 이 태블릿에서 처리되고 세션 종료 시 파기됩니다. 이메일이 당신의 피부와 연결되는 일은 없습니다." },
    'cor.h2Envio': { es: "Te enviamos tu informe", en: "We’ll send you your report", ko: "검사 결과지를 보내드릴게요" },
    'cor.ledeEnvio': { es: "Necesitamos tu correo para enviarte el informe del análisis en cuanto esté listo. Es el único uso obligatorio: lo demás es opcional.", en: "We need your email to send you the analysis report as soon as it is ready. That is the only required use: everything else is optional.", ko: "분석이 끝나는 대로 결과지를 보내드리려면 이메일이 필요합니다. 필수로 쓰이는 건 이것뿐이고, 나머지는 선택입니다." },
    'cor.consentSalud': { es: "Acepto que Lococo me envíe por correo el informe de este análisis. El informe incluye datos sobre el estado de mi piel; se envía una sola vez y no se guarda copia.", en: "I agree that Lococo may email me the report of this analysis. The report contains data about the condition of my skin; it is sent once and no copy is kept.", ko: "Lococo가 이 분석의 결과지를 이메일로 보내는 데 동의합니다. 결과지에는 제 피부 상태에 관한 정보가 포함되며, 한 번만 발송되고 사본은 보관되지 않습니다." },
    'cor.datosEnvio': { es: "<b>Tu correo</b> se guarda en un servidor de Cloudflare en Europa, junto con el idioma y la fecha.<br><b>El informe</b> se envía a tu correo y no se guarda en ningún sitio: atraviesa el servidor y no deja copia. Las imágenes nunca salen de esta tableta.", en: "<b>Your email</b> is stored on a Cloudflare server in Europe, along with the language and the date.<br><b>The report</b> is sent to your inbox and stored nowhere: it passes through the server and leaves no copy. The images never leave this tablet.", ko: "<b>이메일</b>은 유럽 소재 Cloudflare 서버에 언어·날짜와 함께 저장됩니다.<br><b>결과지</b>는 메일로 발송되며 어디에도 저장되지 않습니다 — 서버를 지나가기만 하고 사본이 남지 않습니다. 이미지는 이 태블릿을 벗어나지 않습니다." },
    'cor.errSalud': { es: "Marca la casilla del informe para poder enviártelo.", en: "Tick the report box so we can send it to you.", ko: "결과지를 보내드리려면 해당 항목에 체크해주세요." },
    'cor.envEnviando': { es: "Enviando el informe…", en: "Sending the report…", ko: "결과지 발송 중…" },
    'cor.envHecho': { es: "Informe enviado a {e}", en: "Report sent to {e}", ko: "{e} 로 결과지를 보냈습니다" },
    'cor.envFallo': { es: "No se ha podido enviar el informe. Puedes fotografiar esta pantalla.", en: "The report could not be sent. You can photograph this screen.", ko: "결과지를 보내지 못했습니다. 이 화면을 촬영해 두셔도 됩니다." },
    'correo.asunto': { es: "Tu informe Espejo · Lococo", en: "Your Espejo report · Lococo", ko: "Espejo 피부 분석 결과지 · Lococo" },
    'correo.hola': { es: "Tu análisis Espejo", en: "Your Espejo analysis", ko: "Espejo 피부 분석 결과" },
    'correo.tipo': { es: "Tipo de piel según Baumann", en: "Baumann skin type", ko: "Baumann 피부 타입" },
    'correo.medido': { es: "Medido con la cámara, sobre tu foto", en: "Measured by the camera, from your photo", ko: "카메라로 사진에서 직접 측정한 값" },
    'correo.declarado': { es: "Según tus respuestas · la hidratación no se puede medir con cámara", en: "From your answers · hydration cannot be measured by camera", ko: "문진 응답 기준 · 수분은 카메라로 측정할 수 없습니다" },
    'correo.pasos': { es: "Cinco pasos elegidos para tu piel", en: "Five steps chosen for your skin", ko: "내 피부에 맞춰 고른 5단계" },
    'correo.privacidad': { es: "Este correo se envía una sola vez y Lococo no guarda copia del informe. Las fotos no salieron de la tableta.", en: "This email is sent once and Lococo keeps no copy of the report. The photos never left the tablet.", ko: "이 메일은 한 번만 발송되며 Lococo는 결과지 사본을 보관하지 않습니다. 사진은 태블릿 밖으로 나가지 않았습니다." },
    'correo.intro': { es: "Este es el informe del análisis que acabas de hacer en el puesto de Lococo × Oki Doki Labs.", en: "This is the report of the analysis you just did at the Lococo × Oki Doki Labs stand.", ko: "Lococo × Oki Doki Labs 부스에서 방금 진행하신 분석의 결과지입니다." },
    'cor.errFormato': { es: 'Ese correo no parece válido.', en: 'That email does not look valid.', ko: "올바른 이메일 형식이 아닙니다." },
    'cor.errConsent': { es: 'Marca la casilla para poder guardar tu correo.',
                        en: 'Tick the box so we can store your email.', ko: "이메일을 저장하려면 동의에 체크해주세요." },
    'cor.errRed':     { es: 'No se ha podido guardar. Puedes saltar este paso y seguir.',
                        en: 'Could not save. You can skip this step and carry on.', ko: "저장하지 못했습니다. 이 단계를 건너뛰고 진행하셔도 됩니다." },
    'cor.guardando':  { es: 'Guardando…', en: 'Saving…', ko: "저장 중…" },
    'fase.correo':    { es: 'Contacto', en: 'Contact', ko: "연락처" },

    /* --- Captura ------------------------------------------------------ */
    'cap.eyebrow': { es: 'Paso 3 de 6', en: 'Step 02 · Capture', ko: "03단계 · 촬영" },
    'cap.h2':      { es: 'Colócate frente a la cámara', en: 'Framing and conditions', ko: "구도와 촬영 조건" },
    'cap.lede': {
      es: 'Pon la cara dentro del óvalo, mirando al frente y con el gesto relajado. La foto se hace sola cuando los cinco indicadores estén en verde.',
      en: 'Place your face inside the oval, looking straight ahead with a relaxed expression. ' +
          'The capture fires by itself once all five conditions turn green.', ko: "얼굴을 타원 안에 넣고 정면을 바라본 채 표정을 풀어주세요. 다섯 가지 조건이 모두 초록색이 되면 자동으로 촬영됩니다." },
    'cap.ledeMovil': {
      es: 'Pon la cara dentro del óvalo. La foto se hace sola.',
      en: 'Place your face inside the oval. The capture fires by itself.', ko: "얼굴을 타원 안에 맞춰주세요. 자동으로 촬영됩니다." },
    'cap.lineaOcular': { es: 'ojos', en: 'EYE LINE', ko: "눈 기준선" },
    'cap.lineaLabial': { es: 'boca', en: 'MOUTH LINE', ko: "입 기준선" },
    'cap.alineado':    { es: 'Perfecto', en: 'ALIGNED', ko: "정렬 완료" },
    'cap.sinCamara':   { es: 'Cámara no disponible', en: 'Camera unavailable', ko: "카메라를 사용할 수 없음" },
    'cap.usarSistema': { es: 'Usar la cámara del sistema', en: 'Use the system camera', ko: "시스템 카메라 사용" },
    'cap.aroPie': {
      es: 'El marco blanco ilumina tu cara. No lo tapes.',
      en: 'This white ring is the light source · do not cover it', ko: "이 흰색 테두리가 광원입니다 · 가리지 마세요" },
    'cap.aroNota': {
      es: 'Es blanco a propósito: una luz de color alteraría la medida de la rojez.',
      en: 'It is neutral on purpose: a coloured halo would skew the erythema index', ko: "의도적으로 무채색입니다. 색이 들어간 빛은 홍반지수를 왜곡시킵니다" },
    'cap.condiciones': { es: 'Antes de la foto', en: 'Capture conditions', ko: "촬영 조건" },
    'cap.btnCapturar': { es: 'Capturar', en: 'Capture', ko: "촬영" },
    'cap.btnRepetir':  { es: 'Repetir', en: 'Retake', ko: "다시 촬영" },
    'cap.nota': {
      es: 'Estas cinco comprobaciones hacen que dos fotos de la misma piel den el mismo resultado.',
      en: 'The five checks reproduce standardised clinical photography protocol. Without them, ' +
          'two captures of the same skin would give different results and the measurement ' +
          'would be worthless.', ko: "다섯 가지 검사는 표준 임상 사진 촬영 프로토콜을 그대로 옮긴 것입니다. 이것이 없으면 같은 피부를 두 번 찍어도 결과가 달라지고, 측정은 아무 가치가 없어집니다." },
    'cap.ok': {
      es: 'Todo bien. No te muevas.',
      en: 'Conditions met. Hold still.', ko: "조건 충족. 자세를 유지하세요." },
    'cap.permisoDenegado': {
      es: 'Permiso de cámara denegado. Puedes hacer la foto con la cámara del sistema.',
      en: 'Camera permission denied. You can take the photo with the system camera instead.', ko: "카메라 권한이 거부되었습니다. 시스템 카메라로 촬영할 수 있습니다." },
    'cap.sinApi': {
      es: 'Este navegador no expone la cámara a la página.',
      en: 'This browser does not expose the camera to the page.', ko: "이 브라우저는 페이지에 카메라를 제공하지 않습니다." },
    'cap.errorCamara': {
      es: 'No se ha podido abrir la cámara en directo ({e}). Usa la cámara del sistema.',
      en: 'Could not open the live camera ({e}). Use the system camera instead.',
      ko: "실시간 카메라를 열지 못했습니다 ({e}). 시스템 카메라를 사용하세요."
    },

    /* Comprobaciones */
    'chk.encuadre':    { es: 'Encuadre', en: 'Framing', ko: "구도" },
    'chk.exposicion':  { es: 'Exposición', en: 'Exposure', ko: "노출" },
    'chk.uniformidad': { es: 'Luz uniforme', en: 'Even light', ko: "균일한 빛" },
    'chk.enfoque':     { es: 'Enfoque', en: 'Focus', ko: "초점" },
    'chk.estabilidad': { es: 'Estabilidad', en: 'Stability', ko: "흔들림" },
    'chk.encuadre.p':  { es: 'Acerca o aleja la cara hasta llenar el óvalo.',
                         en: 'Move closer or further until your face fills the oval.', ko: "얼굴이 타원을 채우도록 가까이 또는 멀리 이동하세요." },
    'chk.exposicion.p':{ es: 'Hay demasiada o muy poca luz. Busca un sitio con una luz más suave.',
                         en: 'Too much or too little light. Turn the tablet towards a more neutral spot.', ko: "빛이 너무 많거나 적습니다. 태블릿을 더 중립적인 쪽으로 돌리세요." },
    'chk.uniformidad.p':{ es: 'La luz te da de lado. Ponte de frente a la luz principal.',
                          en: 'Light is coming from one side. Face the main light source.', ko: "빛이 한쪽에서만 옵니다. 주 광원을 정면으로 마주하세요." },
    'chk.enfoque.p':   { es: 'La imagen sale borrosa. No te muevas y espera a que enfoque.',
                         en: 'The image is soft. Hold the distance and wait for focus.', ko: "이미지가 흐립니다. 거리를 유지하고 초점이 맞을 때까지 기다리세요." },
    'chk.estabilidad.p':{ es: 'No te muevas un momento.', en: 'Hold still for a moment.', ko: "잠시 움직이지 마세요." },

    /* --- Análisis ----------------------------------------------------- */
    'ana.eyebrow': { es: 'Paso 4 de 6', en: 'Step 03 · Processing', ko: "04단계 · 처리" },
    'ana.h2':      { es: 'Analizando tu piel…', en: 'Analysis under way', ko: "분석 진행 중" },
    'ana.error':   { es: 'Error de procesamiento', en: 'Processing error', ko: "처리 오류" },
    'ana.errorDet':{ es: '{m} · vuelve a capturar la imagen',
                     en: '{m} · capture the image again',
      ko: "{m} · 이미지를 다시 촬영하세요"
    },

    /* --- Cuestionario ------------------------------------------------- */
    'cue.eyebrow': { es: 'Paso 5 de 6', en: 'Step 04 · Clinical questionnaire', ko: "05단계 · 임상 문진" },
    'cue.h2':      { es: 'Lo que la cámara no ve', en: 'What the camera cannot see', ko: "카메라가 보지 못하는 것" },
    'cue.lede': {
      es: 'Cinco preguntas rápidas sobre cómo se comporta tu piel. Piensa en cómo está normalmente, no solo hoy.',
      en: 'Five questions about what the camera cannot see: how your skin behaves, how it ' +
          'tolerates and how it holds water. Answer for how it usually is, not today.', ko: "카메라가 볼 수 없는 것에 관한 5개 문항입니다 — 피부의 반응, 내성, 수분. 오늘이 아니라 평소 피부 상태를 기준으로 답해주세요." },
    'cue.atras':   { es: 'Anterior', en: 'Back', ko: "이전" },
    'cue.num':     { es: 'Pregunta {i} de {n}', en: 'Question {i} of {n}',
      ko: "{n}문항 중 {i}번"
    },
    'cue.eje':     { es: 'Eje {e}', en: 'Axis {e}',
      ko: "{e} 축"
    },
    'eje.DO':  { es: 'seca / grasa', en: 'dry / oily', ko: "건성 / 지성" },
    'eje.SR':  { es: 'sensible / resistente', en: 'sensitive / resistant', ko: "민감 / 저항" },
    'eje.PN':  { es: 'pigmentada / no pigmentada', en: 'pigmented / non-pigmented', ko: "색소 / 비색소" },
    'eje.WT':  { es: 'arrugas / tersa', en: 'wrinkled / tight', ko: "주름 / 탄탄" },
    'eje.HID': { es: 'hidratación', en: 'hydration', ko: "수분" },

    /* --- Informe ------------------------------------------------------ */
    'inf.cab':      { es: 'Informe de análisis cutáneo · {s}', en: 'Skin analysis report · {s}',
      ko: "피부 분석 결과지 · {s}"
    },
    'inf.baumann':  { es: 'Tipo Baumann', en: 'Baumann type', ko: "Baumann 유형" },
    'inf.tono': {
      es: 'Tono {t} (ITA {i}°, categoría {c}). ',
      en: '{t} tone (ITA {i}°, category {c}). ',
      ko: "{t} 피부톤 (ITA {i}°, {c}등급). "
    },
    'inf.patron.mixta': {
      es: 'El brillo se concentra en la zona T con una relación T/U de {r}:1.',
      en: 'Shine is concentrated in the T-zone, with a T/U ratio of {r}:1.',
      ko: "유분이 T존에 집중되어 있으며 T/U 비율은 {r}:1입니다."
    },
    'inf.patron.grasa': {
      es: 'La película sebácea cubre tanto la zona T como las mejillas.',
      en: 'The sebum film covers both the T-zone and the cheeks.', ko: "피지막이 T존과 볼 모두를 덮고 있습니다." },
    'inf.patron.seca': {
      es: 'La reflexión especular está por debajo de la banda habitual en todas las zonas.',
      en: 'Specular reflection sits below the usual band across every zone.', ko: "모든 존에서 정반사가 일반적인 범위 아래에 있습니다." },
    'inf.patron.normal': {
      es: 'La distribución sebácea está dentro de la banda de equilibrio.',
      en: 'Sebum distribution sits within the balanced band.', ko: "피지 분포가 균형 범위 안에 있습니다." },

    'inf.s1':     { es: 'Medición óptica', en: 'Optical measurement', ko: "광학 측정" },
    'inf.s1der':  { es: '', en: 'physical values', ko: "물리량" },
    'inf.s1nota': {
      es: 'Las marcas del arco separan los tramos óptimo, moderado, elevado y alto (30, 55 y 78 sobre 100). El índice es una escala propia de este equipo; para comparar entre sesiones, fíjate en la cifra con unidades.',
      en: 'The outer ticks on each arc mark the optimal / moderate / elevated / high bands ' +
          '(30, 55 and 78 out of 100). The index is an operating scale specific to this unit; ' +
          'the figure with units beneath each dial is the physical quantity actually measured, ' +
          'and that is the one to compare across sessions.', ko: "각 게이지 바깥의 눈금은 최적 / 중등도 / 상승 / 높음 구간을 나눕니다 (100 중 30, 55, 78). 지수는 이 장비의 운용 척도이고, 게이지 아래 단위가 붙은 수치가 실제로 측정된 물리량입니다. 세션 간 비교는 그 수치로 하세요." },
    'inf.indice': { es: 'índice', en: 'INDEX', ko: "지수" },

    'lupa.titulo':  { es: 'Tu piel de cerca', en: 'Magnified analysis', ko: "확대 분석" },
    'lupa.poros':   { es: 'puntos de poro', en: 'pore points', ko: "모공 검출점" },
    'lupa.focos':   { es: 'focos', en: 'foci', ko: "국소 병변" },
    'lupa.leyPoro': { es: 'Punto de poro (banda r1–r4)', en: 'Pore point (r1–r4 band)', ko: "모공 검출점 (결 대역 r1–r4)" },
    'lupa.leyFoco': { es: 'Foco eritematoso', en: 'Erythematous focus', ko: "국소 홍반 병변" },
    'lupa.nota': {
      es: 'Es la misma foto que se ha medido, ampliada ({m} mm/px). Los círculos azules marcan posibles poros: son una pista óptica, no un recuento clínico. Las zonas oscurecidas no se han medido.',
      en: 'Digital magnification of the same photo that was measured ({m} mm/px); there is no second capture. ' +
          'Pore points are local minima of the texture band: an optical relief indicator, not a clinical ' +
          'pore count. Dimmed areas are outside the measurement.',
      ko: "측정에 쓴 바로 그 사진을 디지털로 확대한 것입니다({m} mm/px). 따로 한 장 더 찍지 않습니다. 모공 검출점은 결 대역의 국소 최저점으로, 요철을 보여주는 광학 지표이며 임상적인 모공 개수가 아닙니다. 어둡게 처리된 곳은 측정에서 제외된 부분입니다." },
    'inf.s2':    { es: 'Distribución por zona', en: 'Distribution by zone', ko: "부위별 분포" },
    'inf.zona':  { es: 'Zona', en: 'Zone', ko: "부위" },
    'inf.focos': { es: 'Focos', en: 'Foci', ko: "병변" },
    'inf.areaPc':{ es: '% área', en: '% area', ko: "% 면적" },
    'inf.sinMuestra': { es: 'muestra insuficiente', en: 'insufficient sample', ko: "표본 부족" },
    'inf.centrofacial': {
      es: '<b>Patrón centrofacial.</b> El eritema de las mejillas supera al de la frente en ' +
          '{d} UI. Es la distribución característica de la rosácea eritemato-telangiectásica ' +
          'y conviene que la valore un dermatólogo.',
      en: '<b>Centrofacial pattern.</b> Cheek erythema exceeds forehead erythema by {d} units. ' +
          'This is the distribution characteristic of erythematotelangiectatic rosacea and ' +
          'is worth having a dermatologist look at.',
      ko: "<b>중안부 패턴.</b> 볼의 홍반이 이마보다 {d} 단위 높습니다. 홍반·모세혈관확장형 주사(rosacea)의 특징적 분포이므로 피부과 전문의의 진료를 받아보시길 권합니다."
    },
    'mapa.eritema': { es: 'Eritema', en: 'Erythema', ko: "홍반" },
    'mapa.brillo':  { es: 'Brillo', en: 'Shine', ko: "유분" },
    'mapa.textura': { es: 'Textura', en: 'Texture', ko: "결" },
    'mapa.medido': {
      es: 'Medido entre <b>{a}</b> y <b>{b} {u}</b>, marcado con ▲ sobre la escala.',
      en: 'Measured between <b>{a}</b> and <b>{b} {u}</b>, marked ▲ on the scale.',
      ko: "측정 범위 <b>{a}</b> ~ <b>{b} {u}</b>, 척도 위에 ▲로 표시됨."
    },

    'inf.s3':    { es: 'Perfil por cuestionario', en: 'Questionnaire profile', ko: "문진 프로필" },
    'inf.s3der': { es: 'tipo Baumann', en: 'Baumann framework', ko: "Baumann 체계" },
    'inf.limite':{ es: 'límite', en: 'borderline', ko: "경계" },
    'inf.hidrat':{ es: 'Hidratación', en: 'Hydration', ko: "수분" },
    'inf.autoinf':{ es: 'autoinforme', en: 'self-reported', ko: "자가 보고" },
    'inf.hidratNota': {
      es: 'No medible por cámara. Requiere corneometría capacitiva con electrodo en contacto. ' +
          'Este eje procede sólo de tu respuesta.',
      en: 'Not measurable by camera. Requires capacitive corneometry with a contact electrode. ' +
          'This axis comes from your answer alone.', ko: "카메라로 측정 불가. 접촉식 전극을 쓰는 정전용량 코니오메트리가 필요합니다. 이 축은 오직 응답에서만 도출됩니다." },
    'inf.contraste': {
      es: 'Contraste entre medición y respuestas',
      en: 'Measurement versus answers', ko: "측정값과 응답의 대조" },

    'inf.s4':     { es: 'Activos indicados', en: 'Indicated actives', ko: "권장 활성성분" },
    'inf.s4der':  { es: '', en: 'no brands', ko: "브랜드 없음" },
    'inf.porQue': { es: 'Por qué esta selección: ', en: 'Why this selection: ', ko: "이 선택의 근거: " },
    'inf.s4nota': {
      es: 'Concentraciones orientativas de uso cosmético habitual. Introduce un activo nuevo ' +
          'cada dos semanas para poder identificar qué te sienta bien y qué no.',
      en: 'Concentrations are typical cosmetic-use guidance. Introduce one new active every ' +
          'two weeks so you can tell what agrees with your skin and what does not.', ko: "일반적인 화장품 사용 기준의 참고 농도입니다. 무엇이 맞고 안 맞는지 가려내려면 새 성분은 2주에 하나씩 도입하세요." },

    'inf.sProd':    { es: 'Tu rutina Lococo', en: 'Your Lococo routine', ko: "당신의 Lococo 루틴" },
    'inf.sProdDer': { es: 'disponibles hoy', en: 'products in stock', ko: "실제 재고" },
    'inf.prodIntro': {
      es: 'Cinco productos de Lococo elegidos según lo que hemos medido. Arriba, lo que más necesita tu piel; debajo, qué hace cada producto.',
      en: 'Five steps picked from the Lococo range based on what was measured. First the ' +
          'priorities with the figure behind each one; then what each step covers.', ko: "측정 결과를 바탕으로 Lococo 재고에서 고른 5단계입니다. 먼저 우선순위와 그 근거 수치, 그다음 각 단계가 무엇을 담당하는지." },
    'inf.prodPrio': { es: 'Prioridades detectadas', en: 'Detected priorities', ko: "감지된 우선순위" },
    'inf.cubre':    { es: 'Cubre', en: 'Covers', ko: "담당" },
    'inf.prodNota': {
      es: 'Precios de venta al público. La misma piel siempre recibe la misma rutina. Si algo se ha agotado en el puesto, cualquier producto de la misma categoría y con las mismas etiquetas sirve igual.',
      en: 'Retail prices. The selection is deterministic: the same skin always gives the ' +
          'same routine. If something is out of stock at the stand, any product in the same ' +
          'category with the same tags works just as well.', ko: "소비자가 기준입니다. 선택은 결정적입니다 — 같은 피부는 항상 같은 루틴을 받습니다. 현장에 재고가 없으면 같은 카테고리·같은 태그의 다른 제품으로 대체해도 동일합니다." },
    'inf.s5':     { es: 'Estructura de rutina', en: 'Routine structure', ko: "루틴 구성" },
    'inf.s5der':  { es: '', en: 'categories', ko: "카테고리" },
    'inf.manana': { es: 'Mañana', en: 'Morning', ko: "아침" },
    'inf.noche':  { es: 'Noche', en: 'Night', ko: "저녁" },

    'inf.s6': { es: 'Mejor evitar', en: 'What to avoid in your case', ko: "당신의 경우 피해야 할 것" },

    'inf.s7':    { es: 'Cómo se ha medido', en: 'Method and limitations', ko: "방법과 한계" },
    'inf.s7der': { es: '', en: 'technical detail', ko: "기술 설명" },

    'inf.s8':    { es: 'Datos de la sesión', en: 'Session conditions', ko: "세션 조건" },
    'inf.s8der': { es: '', en: 'traceability', ko: "추적성" },
    'inf.confianza': { es: 'Confianza', en: 'Confidence', ko: "신뢰도" },
    'inf.reducen': { es: '<b>Factores que la reducen:</b> ', en: '<b>What lowers it:</b> ', ko: "<b>신뢰도를 낮추는 요인:</b> " },
    'inf.sinIncidencias': {
      es: 'Captura correcta: referencia de blanco válida, suficiente piel visible y las seis zonas con muestra suficiente.',
      en: 'Clean capture: valid white reference, sufficient skin coverage and all six zones ' +
          'with enough sample.', ko: "이상 없는 촬영: 유효한 화이트 레퍼런스, 충분한 피부 커버리지, 6개 존 모두 표본 충분." },
    'inf.sesion':    { es: 'Sesión', en: 'Session', ko: "세션" },
    'inf.equipo':    { es: 'Equipo', en: 'Device', ko: "기기" },
    'inf.fecha':     { es: 'Fecha', en: 'Date', ko: "일시" },
    'inf.cobertura': { es: 'Cobertura de piel', en: 'Skin coverage', ko: "피부 커버리지" },
    'inf.coberturaV':{ es: '{v} % del encuadre', en: '{v} % of the frame',
      ko: "화면의 {v} %"
    },
    'inf.escala':    { es: 'Escala espacial', en: 'Spatial scale', ko: "공간 척도" },
    'inf.escalaV':   { es: '{v} mm/px · 512 px útiles', en: '{v} mm/px · 512 px working width',
      ko: "{v} mm/px · 유효 폭 512 px"
    },
    'inf.bb':        { es: 'Balance de blancos', en: 'White balance', ko: "화이트 밸런스" },
    'inf.bbSi':      { es: 'esclerótica · {n} px', en: 'sclera · {n} px',
      ko: "공막 기준 · {n} px"
    },
    'inf.bbNo':      { es: 'no aplicado', en: 'not applied', ko: "미적용" },
    'inf.expMedia':  { es: 'Exposición media', en: 'Mean exposure', ko: "평균 노출" },
    'inf.expMediaV': { es: '{v} (banda 92–196)', en: '{v} (band 92–196)',
      ko: "{v} (기준 92–196)"
    },
    'inf.deseq':     { es: 'Desequilibrio L/R', en: 'L/R imbalance', ko: "좌우 광량 편차" },
    'inf.nitidez':   { es: 'Nitidez', en: 'Sharpness', ko: "선명도" },
    'inf.directo':   { es: 'captura en directo', en: 'live capture', ko: "실시간 촬영" },
    'inf.sistema':   { es: 'cámara del sistema', en: 'system camera', ko: "시스템 카메라" },
    'inf.prevista':  { es: 'prevista', en: 'preview', ko: "미리보기" },

    'legal': {
      es: '<b>Este informe es un análisis cosmético, no un diagnóstico médico.</b> Espejo no ' +
          'detecta ni descarta patología dermatológica. Si observas una lesión que cambia de ' +
          'tamaño, forma o color, que sangra o que no cura, acude a un dermatólogo sin esperar. ' +
          'Las recomendaciones son de activo y categoría de producto, orientativas y no ' +
          'sustituyen a una consulta profesional; si estás embarazada, en lactancia o en ' +
          'tratamiento dermatológico, consulta antes de introducir retinoides o ácidos.<br><br>' +
          '<b>Datos.</b> La imagen se procesó en la memoria de este dispositivo y no se ' +
          'transmitió a ningún servidor. No se ha almacenado. Al cerrar la sesión se destruye ' +
          'junto con tus respuestas.',
      en: '<b>This report is a cosmetic analysis, not a medical diagnosis.</b> Espejo neither ' +
          'detects nor rules out dermatological disease. If you notice a lesion that changes ' +
          'size, shape or colour, that bleeds, or that does not heal, see a dermatologist ' +
          'without waiting. Recommendations cover actives and product categories, are indicative ' +
          'only and do not replace professional advice; if you are pregnant, breastfeeding or ' +
          'under dermatological treatment, check before introducing retinoids or acids.<br><br>' +
          '<b>Data.</b> The image was processed in this device\'s memory and transmitted to no ' +
          'server. Nothing was stored. It is destroyed along with your answers when the session ' +
          'ends. If you gave your email, it was stored separately and is not linked to these results.', ko: "<b>이 결과지는 미용 목적의 분석이며 의학적 진단이 아닙니다.</b> Espejo는 피부 질환을 발견하지도, 배제하지도 못합니다. 크기·모양·색이 변하거나, 피가 나거나, 낫지 않는 병변이 보이면 미루지 말고 피부과 전문의를 찾으세요. 권장 사항은 활성성분과 제품 카테고리에 대한 참고일 뿐 전문 상담을 대체하지 않습니다. 임신·수유 중이거나 피부과 치료를 받고 있다면 레티노이드나 산 성분을 시작하기 전에 상담하세요.<br><br><b>데이터.</b> 이미지는 이 기기의 메모리에서 처리되었고 어떤 서버로도 전송되지 않았습니다. 저장되지 않았습니다. 세션을 닫으면 응답과 함께 파기됩니다. 이메일을 남기셨다면 별도로 저장되었으며 이 결과와 연결되어 있지 않습니다." },

    'evento.eyebrow': {
      es: 'Lococo × Oki Doki Labs · 26–27 septiembre',
      en: 'Lococo × Oki Doki Labs · 26–27 September', ko: "Lococo × Oki Doki Labs · 9월 26–27일" },
    'evento.nota': {
      es: 'Lo que aplicas por fuera y lo que tomas por dentro trabajan sobre la misma piel. ' +
          'Pide un Berry Glow en tamaño grande y participa en el K-Beauty Scoop.',
      en: 'What you put on your skin and what you drink work on the same skin. Order a large ' +
          'Berry Glow and join the K-Beauty Scoop.', ko: "바르는 것과 마시는 것은 같은 피부에 작용합니다. Berry Glow 라지 사이즈를 주문하고 K-Beauty Scoop에 참여하세요." },
    'evento.imprimir': { es: 'Imprimir informe', en: 'Print report', ko: "결과지 인쇄" },
    'evento.finalizar':{ es: 'Finalizar sesión', en: 'End session', ko: "세션 종료" },

    /* --- Inactividad -------------------------------------------------- */
    'idle.eyebrow': { es: 'Sesión inactiva', en: 'Session idle', ko: "세션 비활성" },
    'idle.h3':      { es: '¿Sigues ahí?', en: 'Still there?', ko: "계신가요?" },
    'idle.p': {
      es: 'La sesión se cerrará en <b class="num" id="idle-seg">20</b> segundos y se borrarán todos los datos.',
      en: 'The session closes in <b class="num" id="idle-seg">20</b> seconds and all data is erased.', ko: "<b class=\"num\" id=\"idle-seg\">20</b>초 후 세션이 종료되고 모든 데이터가 삭제됩니다." },
    'idle.sigo':  { es: 'Seguir aquí', en: 'Stay', ko: "계속하기" },
    'idle.cerrar':{ es: 'Cerrar ahora', en: 'Close now', ko: "지금 종료" }
  };

  /* Interpolación sencilla: t('x', {n: 3}) */
  function tf(clave, vars) {
    var s = t(clave);
    if (!vars) return s;
    return s.replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] !== undefined ? vars[k] : m;
    });
  }

  document.documentElement.setAttribute('lang', actual);

  global.I18N = {
    IDIOMAS: IDIOMAS,
    idioma: function () { return actual; },
    fijar: fijar,
    t: t, tf: tf, tx: tx,
    aplicarEstaticos: aplicarEstaticos,
    alCambiar: function (f) { oyentes.push(f); }
  };
})(window);
