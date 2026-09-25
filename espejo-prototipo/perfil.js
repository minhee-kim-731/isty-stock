/* ==========================================================================
   ESPEJO · Perfil por cuestionario + motor de recomendación
   --------------------------------------------------------------------------
   Cuatro ejes según el marco de Baumann (2005), el sistema de tipificación
   cutánea más usado en dermatología cosmética. Cubre lo que la cámara NO
   puede medir: hidratación (requiere corneometría capacitiva), reactividad
   sensorial e historia clínica.

   Las recomendaciones son de ACTIVO y CATEGORÍA. No se nombra ninguna marca.

   Todo el texto visible va como {es, en} y lo resuelve I18N.tx en el momento
   de pintar, de modo que cambiar de idioma no obliga a rehacer el cálculo.
   ========================================================================== */
(function (global) {
  'use strict';

  /* Cada pregunta puntúa un eje. valor: −2 .. +2
     D/O  seca ↔ grasa            S/R  sensible ↔ resistente
     P/N  pigmentada ↔ no pigm.   W/T  con arrugas ↔ tersa                  */

  var PREGUNTAS = [
    { eje: 'DO',
      texto: { es: 'Al lavarte la cara con agua y sin aplicar nada después, ¿cómo la notas a los 20 minutos?',
               en: 'After washing your face with water and applying nothing, how does it feel 20 minutes later?', ko: "물로만 세안하고 아무것도 바르지 않았을 때, 20분 뒤 피부가 어떤가요?" },
      ayuda: { es: 'Responde pensando en un día normal, no después de un tratamiento.',
               en: 'Answer for an ordinary day, not after a treatment.', ko: "시술 직후가 아니라 평범한 날을 기준으로 답해주세요." },
      ops: [
        { t: { es: 'Tirante y áspera, incluso con descamación', en: 'Tight and rough, even flaking', ko: "당기고 거칠며 각질까지 일어남" }, v: -2 },
        { t: { es: 'Algo tirante pero cómoda', en: 'Slightly tight but comfortable', ko: "약간 당기지만 편안함" }, v: -1 },
        { t: { es: 'Normal, sin sensación particular', en: 'Normal, nothing in particular', ko: "보통, 특별한 느낌 없음" }, v: 0 },
        { t: { es: 'Con brillo en frente y nariz', en: 'Shiny on forehead and nose', ko: "이마와 코에 유분기" }, v: 1 },
        { t: { es: 'Con brillo en toda la cara', en: 'Shiny all over', ko: "얼굴 전체에 유분기" }, v: 2 }
      ] },
    { eje: 'DO',
      texto: { es: 'A media tarde, ¿cómo está tu piel respecto a la mañana?',
               en: 'By mid-afternoon, how is your skin compared with the morning?', ko: "오후 중반, 아침과 비교해 피부가 어떤가요?" },
      ayuda: { es: 'Si usas maquillaje, piensa en cómo se comporta sobre la piel.',
               en: 'If you wear make-up, think about how it behaves on your skin.', ko: "메이크업을 하신다면 그것이 피부 위에서 어떻게 변하는지 생각해보세요." },
      ops: [
        { t: { es: 'Más apagada y seca, el maquillaje se cuartea', en: 'Duller and drier, make-up cracks', ko: "더 푸석하고 건조해지며 메이크업이 갈라짐" }, v: -2 },
        { t: { es: 'Igual que por la mañana', en: 'Same as in the morning', ko: "아침과 같음" }, v: 0 },
        { t: { es: 'Brilla la zona T y el maquillaje se desplaza', en: 'T-zone shines and make-up slides', ko: "T존이 번들거리고 메이크업이 밀림" }, v: 1 },
        { t: { es: 'Brilla toda la cara, necesito papel matificante', en: 'Whole face shines, I need blotting paper', ko: "얼굴 전체가 번들거려 기름종이가 필요함" }, v: 2 }
      ] },
    { eje: 'DO',
      texto: { es: '¿Con qué frecuencia notas los poros visiblemente dilatados?',
               en: 'How often do you notice visibly enlarged pores?', ko: "모공이 눈에 띄게 넓어 보이는 일이 얼마나 잦은가요?" },
      ayuda: { es: 'Sobre todo en alas de la nariz y mejillas internas.',
               en: 'Especially around the nostrils and inner cheeks.', ko: "특히 콧방울과 볼 안쪽을 기준으로요." },
      ops: [
        { t: { es: 'Nunca los aprecio', en: 'I never notice them', ko: "전혀 보이지 않음" }, v: -1 },
        { t: { es: 'Sólo si me miro muy de cerca', en: 'Only up close in the mirror', ko: "아주 가까이 봐야 보임" }, v: 0 },
        { t: { es: 'Se ven claramente en nariz y mejillas', en: 'Clearly visible on nose and cheeks', ko: "코와 볼에서 뚜렷하게 보임" }, v: 1 },
        { t: { es: 'Son lo primero que veo al mirarme', en: 'They are the first thing I see', ko: "거울을 보면 가장 먼저 눈에 띔" }, v: 2 }
      ] },

    { eje: 'SR',
      texto: { es: '¿Tu piel reacciona con escozor, picor o rojez al probar un producto nuevo?',
               en: 'Does your skin sting, itch or redden when you try a new product?', ko: "새 제품을 쓸 때 따갑거나 가렵거나 붉어지나요?" },
      ayuda: { es: 'Incluye cremas, sérums, limpiadores o protectores solares.',
               en: 'Including creams, serums, cleansers or sunscreens.', ko: "크림·세럼·클렌저·자외선차단제를 모두 포함합니다." },
      ops: [
        { t: { es: 'Casi siempre, tengo que introducirlos muy despacio', en: 'Almost always — I have to introduce them very slowly', ko: "거의 항상 — 아주 천천히 도입해야 함" }, v: -2 },
        { t: { es: 'A veces, con productos concretos', en: 'Sometimes, with particular products', ko: "가끔, 특정 제품에서" }, v: -1 },
        { t: { es: 'Rara vez', en: 'Rarely', ko: "드물게" }, v: 1 },
        { t: { es: 'Nunca, tolero prácticamente todo', en: 'Never — I tolerate almost anything', ko: "전혀 — 거의 모든 제품을 견딤" }, v: 2 }
      ] },
    { eje: 'SR',
      texto: { es: '¿Se te enrojece la cara con el calor, el frío, el ejercicio o el alcohol?',
               en: 'Does your face redden with heat, cold, exercise or alcohol?', ko: "더위·추위·운동·음주에 얼굴이 붉어지나요?" },
      ayuda: { es: 'Piensa en rojez que aparece y tarda en irse.',
               en: 'Think of redness that appears and takes a while to fade.', ko: "생겼다가 한참 가시지 않는 붉은기를 생각해보세요." },
      ops: [
        { t: { es: 'Con mucha facilidad y tarda mucho en bajar', en: 'Very easily, and it takes a long time to settle', ko: "아주 쉽게 붉어지고 오래 갑니다" }, v: -2 },
        { t: { es: 'Con frecuencia, pero se pasa pronto', en: 'Often, but it passes quickly', ko: "자주 붉어지지만 금방 가라앉음" }, v: -1 },
        { t: { es: 'Ocasionalmente', en: 'Occasionally', ko: "가끔" }, v: 0 },
        { t: { es: 'Prácticamente nunca', en: 'Practically never', ko: "거의 없음" }, v: 2 }
      ] },
    { eje: 'SR',
      texto: { es: '¿Te han diagnosticado alguna vez dermatitis, rosácea, eccema o alergia de contacto?',
               en: 'Have you ever been diagnosed with dermatitis, rosacea, eczema or contact allergy?', ko: "피부염·주사·습진·접촉성 알레르기를 진단받은 적이 있나요?" },
      ayuda: { es: 'Diagnóstico dado por un profesional sanitario.',
               en: 'A diagnosis given by a healthcare professional.', ko: "의료 전문가에게 받은 진단을 말합니다." },
      ops: [
        { t: { es: 'Sí, y tengo brotes con regularidad', en: 'Yes, and I get flare-ups regularly', ko: "네, 그리고 주기적으로 재발합니다" }, v: -2 },
        { t: { es: 'Sí, pero hace tiempo que no', en: 'Yes, but not for a long time', ko: "네, 하지만 오래전 일입니다" }, v: -1 },
        { t: { es: 'No', en: 'No', ko: "아니요" }, v: 1 }
      ] },

    { eje: 'PN',
      texto: { es: 'Cuando te sale un granito, ¿qué queda después?',
               en: 'When you get a spot, what does it leave behind?', ko: "여드름이 났을 때 이후에 무엇이 남나요?" },
      ayuda: { es: 'La marca posinflamatoria es el mejor indicador de tendencia pigmentaria.',
               en: 'The post-inflammatory mark is the best indicator of pigmentary tendency.', ko: "염증 후 자국은 색소침착 경향을 가장 잘 보여주는 지표입니다." },
      ops: [
        { t: { es: 'Una mancha oscura que dura meses', en: 'A dark mark that lasts months', ko: "몇 달씩 가는 짙은 자국" }, v: -2 },
        { t: { es: 'Una marca que tarda algunas semanas', en: 'A mark that takes a few weeks', ko: "몇 주 정도 가는 자국" }, v: -1 },
        { t: { es: 'Una rojez que se va en pocos días', en: 'Redness that fades within days', ko: "며칠 안에 사라지는 붉은기" }, v: 1 },
        { t: { es: 'No queda nada', en: 'Nothing at all', ko: "아무것도 남지 않음" }, v: 2 }
      ] },
    { eje: 'PN',
      texto: { es: '¿Tienes manchas, pecas o zonas más oscuras en la cara?',
               en: 'Do you have dark patches, freckles or darker areas on your face?', ko: "얼굴에 기미·주근깨·어두운 부위가 있나요?" },
      ayuda: { es: 'Incluye melasma, léntigos solares y pecas.',
               en: 'Including melasma, solar lentigines and freckles.', ko: "기미, 일광 흑자, 주근깨를 포함합니다." },
      ops: [
        { t: { es: 'Sí, extensas y bien visibles', en: 'Yes, extensive and clearly visible', ko: "네, 넓고 뚜렷합니다" }, v: -2 },
        { t: { es: 'Algunas, localizadas', en: 'A few, in specific spots', ko: "일부 부위에 있습니다" }, v: -1 },
        { t: { es: 'Muy pocas', en: 'Very few', ko: "아주 적습니다" }, v: 1 },
        { t: { es: 'Ninguna', en: 'None', ko: "없음" }, v: 2 }
      ] },
    { eje: 'PN',
      texto: { es: '¿Cómo respondes al sol en la primera exposición del verano?',
               en: 'How does your skin respond to the first sun exposure of the summer?', ko: "여름 첫 햇빛 노출에 피부가 어떻게 반응하나요?" },
      ayuda: { es: 'Sin protección solar, en una exposición de unos 30 minutos.',
               en: 'Without sunscreen, over about 30 minutes of exposure.', ko: "자외선차단제 없이 30분 정도 노출된 경우입니다." },
      ops: [
        { t: { es: 'Me bronceo con facilidad y no me quemo', en: 'I tan easily and never burn', ko: "쉽게 태닝되고 화상은 입지 않음" }, v: -1 },
        { t: { es: 'Primero me quemo un poco y luego me bronceo', en: 'I burn a little first, then tan', ko: "처음엔 살짝 붉어졌다가 태닝됨" }, v: 0 },
        { t: { es: 'Me quemo siempre y me bronceo poco', en: 'I always burn and tan little', ko: "항상 화상을 입고 태닝은 잘 안 됨" }, v: 1 },
        { t: { es: 'Me quemo siempre y nunca me bronceo', en: 'I always burn and never tan', ko: "항상 화상을 입고 전혀 태닝되지 않음" }, v: 2 }
      ] },

    { eje: 'WT',
      texto: { es: '¿Ves líneas en tu cara cuando la tienes completamente relajada?',
               en: 'Do you see lines on your face when it is completely relaxed?', ko: "표정을 완전히 풀었을 때 얼굴에 선이 보이나요?" },
      ayuda: { es: 'Sin gesticular: frente lisa, ojos abiertos con normalidad.',
               en: 'No expression: smooth forehead, eyes normally open.', ko: "표정 없이 — 이마를 펴고 눈을 평소대로 뜬 상태에서요." },
      ops: [
        { t: { es: 'Sí, varias y marcadas', en: 'Yes, several and pronounced', ko: "네, 여러 개가 뚜렷합니다" }, v: -2 },
        { t: { es: 'Alguna línea fina', en: 'A fine line or two', ko: "가는 선이 한두 개" }, v: -1 },
        { t: { es: 'Sólo al gesticular', en: 'Only when I make expressions', ko: "표정을 지을 때만" }, v: 1 },
        { t: { es: 'Ninguna', en: 'None' }, v: 2 }
      ] },
    { eje: 'WT',
      texto: { es: '¿Cuántos años acumulas de exposición solar regular sin protección diaria?',
               en: 'How many years of regular sun exposure without daily protection have you accumulated?', ko: "매일 자외선차단 없이 정기적으로 햇빛에 노출된 기간은 몇 년인가요?" },
      ayuda: { es: 'El fotoenvejecimiento explica la mayor parte del envejecimiento visible.',
               en: 'Photoageing accounts for most visible ageing.', ko: "눈에 보이는 노화의 대부분은 광노화로 설명됩니다." },
      ops: [
        { t: { es: 'Más de 15 años', en: 'More than 15 years', ko: "15년 이상" }, v: -2 },
        { t: { es: 'Entre 5 y 15 años', en: 'Between 5 and 15 years', ko: "5~15년" }, v: -1 },
        { t: { es: 'Menos de 5 años', en: 'Fewer than 5 years', ko: "5년 미만" }, v: 1 },
        { t: { es: 'Uso protección a diario desde siempre', en: 'I have always used daily protection', ko: "늘 매일 자외선차단제를 써왔습니다" }, v: 2 }
      ] },
    { eje: 'WT',
      texto: { es: '¿Fumas o has fumado de forma habitual?',
               en: 'Do you smoke, or have you smoked regularly?', ko: "흡연 중이거나 습관적으로 흡연한 적이 있나요?" },
      ayuda: { es: 'El tabaco acelera la degradación del colágeno dérmico.',
               en: 'Tobacco accelerates the breakdown of dermal collagen.', ko: "담배는 진피 콜라겐 분해를 가속합니다." },
      ops: [
        { t: { es: 'Sí, actualmente', en: 'Yes, currently', ko: "네, 현재 흡연 중" }, v: -2 },
        { t: { es: 'Lo dejé', en: 'I quit', ko: "끊었습니다" }, v: -1 },
        { t: { es: 'Nunca', en: 'Never', ko: "전혀" }, v: 1 }
      ] },

    /* Hidratación — no medible ópticamente, se declara como autoinforme. */
    { eje: 'HID',
      texto: { es: '¿Notas la piel tirante al gesticular o sonreír?',
               en: 'Does your skin feel tight when you smile or make expressions?', ko: "웃거나 표정을 지을 때 피부가 당기나요?" },
      ayuda: { es: 'Este eje no se puede medir con cámara: requiere corneometría.',
               en: 'This axis cannot be measured by camera: it requires corneometry.', ko: "이 축은 카메라로 측정할 수 없습니다 — 코니오메트리가 필요합니다." },
      ops: [
        { t: { es: 'Constantemente', en: 'Constantly', ko: "늘 그렇습니다" }, v: -2 },
        { t: { es: 'En invierno o con aire acondicionado', en: 'In winter or with air conditioning', ko: "겨울이나 에어컨 환경에서" }, v: -1 },
        { t: { es: 'Rara vez', en: 'Rarely' }, v: 1 },
        { t: { es: 'Nunca', en: 'Never' }, v: 2 }
      ] }
  ];

  var EJES = {
    DO: { neg: { es: 'Seca', en: 'Dry', ko: "건성" }, pos: { es: 'Grasa', en: 'Oily', ko: "지성" },
          letraNeg: 'D', letraPos: 'O',
          desc: { es: 'Equilibrio entre producción sebácea y retención de agua.',
                  en: 'Balance between sebum production and water retention.', ko: "피지 분비와 수분 보유 사이의 균형." } },
    SR: { neg: { es: 'Sensible', en: 'Sensitive', ko: "민감" }, pos: { es: 'Resistente', en: 'Resistant', ko: "저항" },
          letraNeg: 'S', letraPos: 'R',
          desc: { es: 'Umbral de reactividad de la barrera cutánea.',
                  en: 'Reactivity threshold of the skin barrier.', ko: "피부 장벽의 반응 역치." } },
    PN: { neg: { es: 'Pigmentada', en: 'Pigmented', ko: "색소침착" }, pos: { es: 'No pigmentada', en: 'Non-pigmented', ko: "비색소" },
          letraNeg: 'P', letraPos: 'N',
          desc: { es: 'Tendencia a depositar melanina tras inflamación o sol.',
                  en: 'Tendency to deposit melanin after inflammation or sun.', ko: "염증이나 자외선 이후 멜라닌이 침착되는 경향." } },
    WT: { neg: { es: 'Con arrugas', en: 'Wrinkled', ko: "주름" }, pos: { es: 'Tersa', en: 'Tight', ko: "탄탄" },
          letraNeg: 'W', letraPos: 'T',
          desc: { es: 'Carga acumulada de fotoenvejecimiento y pérdida de colágeno.',
                  en: 'Accumulated photoageing load and collagen loss.', ko: "누적된 광노화 부담과 콜라겐 손실." } }
  };

  function calcular(respuestas, optico) {
    var sumas = { DO: 0, SR: 0, PN: 0, WT: 0, HID: 0 };
    var cuentas = { DO: 0, SR: 0, PN: 0, WT: 0, HID: 0 };
    PREGUNTAS.forEach(function (p, i) {
      var r = respuestas[i];
      if (r === undefined || r === null) return;
      sumas[p.eje] += p.ops[r].v;
      cuentas[p.eje]++;
    });

    var ejes = {};
    ['DO', 'SR', 'PN', 'WT'].forEach(function (k) {
      var max = 2 * Math.max(1, cuentas[k]);
      var norm = sumas[k] / max;
      ejes[k] = {
        bruto: sumas[k], norm: norm,
        letra: norm >= 0 ? EJES[k].letraPos : EJES[k].letraNeg,
        etiqueta: norm >= 0 ? EJES[k].pos : EJES[k].neg,
        intensidad: Math.abs(norm),
        limitrofe: Math.abs(norm) < 0.18
      };
    });

    var hidNorm = sumas.HID / (2 * Math.max(1, cuentas.HID));
    var hidratacion = {
      norm: hidNorm,
      etiqueta: hidNorm < -0.5 ? { es: 'Deshidratación marcada', en: 'Marked dehydration', ko: "뚜렷한 수분 부족" }
              : hidNorm < 0    ? { es: 'Deshidratación leve', en: 'Mild dehydration', ko: "경미한 수분 부족" }
              : hidNorm < 0.6  ? { es: 'Confort normal', en: 'Normal comfort', ko: "정상" }
                               : { es: 'Sin signos de deshidratación', en: 'No signs of dehydration', ko: "수분 부족 징후 없음" }
    };

    /* Contraste óptica ↔ cuestionario */
    var discrepancias = [];
    if (optico) {
      var opticoGraso = optico.global.brilloT > 0.13;
      var pc = (optico.global.brilloT * 100).toFixed(0);
      if (opticoGraso && ejes.DO.norm < -0.2) {
        discrepancias.push({ eje: 'D/O', texto: {
          es: 'La medición detecta brillo en zona T (' + pc + ' % de área) pero tus respuestas ' +
              'describen sequedad. El patrón más probable es deshidratación con seborrea: la piel ' +
              'produce sebo pero pierde agua. Se trata reponiendo agua, no eliminando grasa.',
          en: 'The measurement finds shine in the T-zone (' + pc + ' % of area) but your answers ' +
              'describe dryness. The likeliest pattern is dehydration with seborrhoea: the skin ' +
              'makes oil but loses water. You treat it by putting water back, not by stripping oil.',
          ko: '측정에서는 T존 유분이 ' + pc + ' % 면적에서 잡혔는데 응답은 건조함을 가리킵니다. 가장 가능성 높은 패턴은 피지 분비를 동반한 수분 부족입니다 — 기름은 나오는데 물이 빠지는 상태죠. 기름을 걷어내는 게 아니라 물을 채워 해결합니다.'
        } });
      }
      if (!opticoGraso && ejes.DO.norm > 0.2) {
        discrepancias.push({ eje: 'D/O', texto: {
          es: 'Describes brillo pero la medición no lo encuentra en este momento. Puede deberse ' +
              'a la hora del día, a limpieza reciente o a maquillaje matificante.',
          en: 'You describe shine but the measurement does not find it right now. That can come ' +
              'down to the time of day, a recent cleanse, or mattifying make-up.',
          ko: '유분기를 말씀하셨지만 지금 측정에서는 잡히지 않습니다. 시간대, 최근 세안, 또는 매트 메이크업 때문일 수 있습니다.'
        } });
      }
      if (optico.global.eritema > 17 && ejes.SR.norm > 0.3) {
        var ei = optico.global.eritema.toFixed(1);
        discrepancias.push({ eje: 'S/R', texto: {
          es: 'El índice de eritema está por encima de la banda habitual (' + ei + ' UI) aunque ' +
              'no refieras reactividad. Conviene vigilar la barrera aunque hoy no dé síntomas.',
          en: 'The erythema index sits above the usual band (' + ei + ' units) even though you ' +
              'report no reactivity. Worth keeping an eye on the barrier even with no symptoms today.',
          ko: '예민함을 보고하지 않으셨는데도 홍반지수가 일반 구간을 넘습니다 (' + ei + ' UI). 오늘 증상이 없더라도 장벽을 지켜보는 게 좋습니다.'
        } });
      }
    }

    var codigo = ejes.DO.letra + ejes.SR.letra + ejes.PN.letra + ejes.WT.letra;
    return { ejes: ejes, codigo: codigo, hidratacion: hidratacion,
             discrepancias: discrepancias, definiciones: EJES };
  }

  /* ------------------------------------------------------- RECOMENDACIONES */

  /* Coreano de los activos, indexado por nombre + concentración: hay dos
     niacinamidas y sólo se distinguen por el porcentaje. */
  var KO_ACTIVOS = {
      "Niacinamida|4–5 %": {
          "n": "나이아신아마이드",
          "p": "피지 분비를 조절하고 장벽을 강화하며 염증 후 자국을 옅게 합니다. 이 그룹에서 가장 범용적이고 내약성이 좋은 성분입니다."
      },
      "Niacinamida|10 %": {
          "n": "나이아신아마이드",
          "p": "10 %부터는 피지 조절 효과가 뚜렷해지지만, 예민한 피부에서는 따가움 위험이 커집니다."
      },
      "Ácido salicílico (BHA)|0,5–2 %": {
          "n": "살리실산 (BHA)",
          "p": "지용성이라 모공 안으로 들어가 피지와 각질 덩어리를 녹입니다. 모공이 넓을 때 첫 번째로 고르는 각질제거 성분입니다."
      },
      "PHA · gluconolactona|4–10 %": {
          "n": "PHA · 글루코노락톤",
          "p": "분자가 커서 표면에서만 작용하며 AHA보다 훨씬 덜 자극적입니다. 결 문제와 예민함이 함께 있을 때의 선택지입니다."
      },
      "AHA · ácido láctico|5–8 %": {
          "n": "AHA · 락틱애씨드",
          "p": "글리콜산과 달리 각질 제거와 보습을 함께 합니다. 건조하게 만들지 않으면서 결을 개선합니다."
      },
      "Ácido azelaico|10 %": {
          "n": "아젤라산",
          "p": "항염·모공 막힘 방지·미백을 동시에 합니다. 붉은기·여드름·색소를 한꺼번에 다루는 유일한 성분입니다."
      },
      "Centella asiática · madecasósido|extracto estandarizado": {
          "n": "병풀 · 마데카소사이드",
          "p": "염증 반응을 줄이고 장벽 회복을 돕습니다. 진정 케어의 기본입니다."
      },
      "Pantenol (provitamina B5)|2–5 %": {
          "n": "판테놀 (프로비타민 B5)",
          "p": "보습과 회복을 동시에 하며, 막을 만들지 않으면서 경표피 수분 손실을 줄입니다."
      },
      "Ceramidas + colesterol + ác. grasos|ratio 3:1:1": {
          "n": "세라마이드 + 콜레스테롤 + 지방산",
          "p": "각질세포 사이의 지질 시멘트를 채웁니다. 함량보다 비율이 중요합니다."
      },
      "Ácido hialurónico multipeso|0,1–2 %": {
          "n": "멀티 분자량 히알루론산",
          "p": "각질층의 여러 깊이에서 수분을 붙잡습니다. 위에 크림으로 덮지 않으면 오히려 건조해집니다."
      },
      "Escualano|100 %": {
          "n": "스쿠알란",
          "p": "피부 자체 지질과 동일한 비유발성 에몰리언트. 여드름 경향 피부에도 안전합니다."
      },
      "Glicerina|5–10 %": {
          "n": "글리세린",
          "p": "가장 많이 연구됐고 가장 저렴한 보습 성분입니다. 습도가 낮은 환경에서도 작동합니다."
      },
      "Vitamina C · ácido L-ascórbico|10–15 %": {
          "n": "비타민 C · L-아스코르브산",
          "p": "항산화제이자 티로시나아제 억제제. 산화 손상에 대한 자외선차단 효과를 배가합니다."
      },
      "Vitamina C · derivados estables|5–10 %": {
          "n": "비타민 C · 안정화 유도체",
          "p": "아스코빌글루코사이드나 테트라이소팔미테이트 — 순수 아스코르브산보다 약하지만 자극적인 낮은 pH가 없습니다."
      },
      "Alfa-arbutina|1–2 %": {
          "n": "알파-알부틴",
          "p": "작용이 느리지만 안전성이 높은 미백 성분. 8~12주 주기로 사용합니다."
      },
      "Ácido tranexámico|2–5 %": {
          "n": "트라넥삼산",
          "p": "기존 미백 성분이 닿지 못하는 기미의 혈관 경로에 작용합니다."
      },
      "Retinaldehído|0,05–0,1 %": {
          "n": "레티날",
          "p": "레티노산까지 변환 단계가 하나뿐 — 레티놀보다 빠르고 트레티노인보다 순합니다."
      },
      "Retinol|0,2–0,5 %": {
          "n": "레티놀",
          "p": "콜라겐을 자극하고 턴오버를 촉진합니다. 주 2회 밤부터 시작해 늘려가세요."
      },
      "Péptidos de señalización|—": {
          "n": "시그널 펩타이드",
          "p": "레티노이드를 견디지 못할 때의 대안. 효과는 완만하지만 누적되고 자극이 없습니다."
      },
      "PCA de zinc|1 %": {
          "n": "징크 PCA",
          "p": "가벼운 항균 작용이 있는 피지 조절 성분. 나이아신아마이드와 잘 맞습니다."
      },
      "Avena coloidal|1–3 %": {
          "n": "콜로이드 오트밀",
          "p": "가려움을 줄이고 보호막을 형성합니다. FDA가 피부 보호제로 인정한 성분입니다."
      },
      "Alantoína|0,5–2 %": {
          "n": "알란토인",
          "p": "순한 각질 연화와 진정 작용. 예민 피부용 제형에 거의 빠지지 않습니다."
      },
      "Filtro solar SPF 50+ fluido|PA++++": {
          "n": "SPF 50+ 플루이드 자외선차단제",
          "p": "유동적이거나 젤 제형으로 답답하지 않습니다. 노출 시 2시간마다 덧발라주세요."
      },
      "Filtro solar SPF 50+ nutritivo|PA++++": {
          "n": "SPF 50+ 영양 자외선차단제",
          "p": "건성 피부에서 이 단계가 불편하지 않도록 에몰리언트 베이스를 씁니다."
      },
      "Filtro solar mineral SPF 50+|óxido de zinc": {
          "n": "SPF 50+ 미네랄 자외선차단제",
          "p": "순수 물리적 차단제 — 자극과 광반응 가능성이 가장 낮은 선택지입니다."
      }
  };

  function A(nEs, nEn, c, pEs, pEn) {
    var k = KO_ACTIVOS[nEs + '|' + c] || {};
    return {
      n: { es: nEs, en: nEn, ko: k.n || nEn },
      c: { es: c, en: c, ko: c },
      p: { es: pEs, en: pEn, ko: k.p || pEn }
    };
  }

  var ACTIVOS = {
    niacinamida: A('Niacinamida', 'Niacinamide', '4–5 %',
      'Regula la secreción sebácea, refuerza la barrera y aclara la marca posinflamatoria. Es el activo más versátil y mejor tolerado del grupo.',
      'Regulates sebum, reinforces the barrier and fades post-inflammatory marks. The most versatile and best-tolerated active of the set.'),
    niacinamidaAlta: A('Niacinamida', 'Niacinamide', '10 %',
      'A partir del 10 % el efecto seborregulador es más marcado, a cambio de más riesgo de escozor en piel reactiva.',
      'From 10 % up the sebum-regulating effect is stronger, at the cost of more stinging risk on reactive skin.'),
    bha: A('Ácido salicílico (BHA)', 'Salicylic acid (BHA)', '0,5–2 %',
      'Liposoluble, penetra en el poro y disuelve el tapón de sebo y queratina. Es el exfoliante de elección cuando hay poro dilatado.',
      'Oil-soluble, it gets into the pore and dissolves the plug of sebum and keratin. The exfoliant of choice when pores are enlarged.'),
    pha: A('PHA · gluconolactona', 'PHA · gluconolactone', '4–10 %',
      'Molécula grande, exfolia en superficie con mucha menos irritación que un AHA. La opción cuando hay textura pero también reactividad.',
      'A large molecule that exfoliates at the surface with far less irritation than an AHA. The pick when there is texture but also reactivity.'),
    aha: A('AHA · ácido láctico', 'AHA · lactic acid', '5–8 %',
      'Exfolia y además es humectante, a diferencia del glicólico. Mejora textura sin deshidratar.',
      'Exfoliates and is also humectant, unlike glycolic. Improves texture without dehydrating.'),
    azelaico: A('Ácido azelaico', 'Azelaic acid', '10 %',
      'Antiinflamatorio, anticomedogénico y despigmentante a la vez. El único activo que trabaja en rojez, granito y mancha simultáneamente.',
      'Anti-inflammatory, anti-comedogenic and depigmenting at once. The only active that works on redness, spots and marks simultaneously.'),
    centella: A('Centella asiática · madecasósido', 'Centella asiatica · madecassoside', 'extracto estandarizado',
      'Reduce la respuesta inflamatoria y acelera la reparación de la barrera. Base del cuidado calmante.',
      'Dampens the inflammatory response and speeds barrier repair. The backbone of soothing care.'),
    pantenol: A('Pantenol (provitamina B5)', 'Panthenol (provitamin B5)', '2–5 %',
      'Humectante y reparador; reduce la pérdida transepidérmica de agua sin ocluir.',
      'Humectant and reparative; cuts transepidermal water loss without occluding.'),
    ceramidas: A('Ceramidas + colesterol + ác. grasos', 'Ceramides + cholesterol + fatty acids', 'ratio 3:1:1',
      'Reponen el cemento lipídico intercorneocitario. La proporción importa más que la cantidad.',
      'They restore the lipid cement between corneocytes. The ratio matters more than the amount.'),
    hialuronico: A('Ácido hialurónico multipeso', 'Multi-weight hyaluronic acid', '0,1–2 %',
      'Capta agua en distintos niveles del estrato córneo. Necesita sellarse con una crema encima o deshidrata.',
      'Binds water at different depths of the stratum corneum. It must be sealed with a cream on top or it dehydrates.'),
    escualano: A('Escualano', 'Squalane', '100 %',
      'Emoliente no comedogénico idéntico a un lípido propio de la piel. Seguro en piel con tendencia acneica.',
      'A non-comedogenic emollient identical to one of the skin\'s own lipids. Safe on acne-prone skin.'),
    glicerina: A('Glicerina', 'Glycerin', '5–10 %',
      'El humectante mejor documentado y más barato que existe. Funciona incluso con humedad ambiental baja.',
      'The best-documented and cheapest humectant there is. Works even when ambient humidity is low.'),
    vitaminaC: A('Vitamina C · ácido L-ascórbico', 'Vitamin C · L-ascorbic acid', '10–15 %',
      'Antioxidante e inhibidor de la tirosinasa. Multiplica la protección del filtro solar frente al daño oxidativo.',
      'Antioxidant and tyrosinase inhibitor. It multiplies sunscreen\'s protection against oxidative damage.'),
    vitaminaCsuave: A('Vitamina C · derivados estables', 'Vitamin C · stable derivatives', '5–10 %',
      'Ascorbil glucósido o tetraisopalmitato: menos potentes que el ácido puro pero sin el pH ácido que irrita.',
      'Ascorbyl glucoside or tetraisopalmitate: less potent than pure acid but without the low pH that irritates.'),
    arbutina: A('Alfa-arbutina', 'Alpha-arbutin', '1–2 %',
      'Despigmentante de acción lenta y perfil de seguridad alto. Se usa en tandas de 8–12 semanas.',
      'A slow-acting depigmenting agent with a high safety profile. Used in 8–12 week courses.'),
    tranexamico: A('Ácido tranexámico', 'Tranexamic acid', '2–5 %',
      'Actúa sobre la vía vascular del melasma, la que no cubren los despigmentantes clásicos.',
      'Works on the vascular pathway of melasma, the one classic depigmenting agents do not reach.'),
    retinal: A('Retinaldehído', 'Retinaldehyde', '0,05–0,1 %',
      'Un solo paso de conversión hasta ácido retinoico: más rápido que el retinol y más tolerable que la tretinoína.',
      'One conversion step from retinoic acid: faster than retinol and more tolerable than tretinoin.'),
    retinol: A('Retinol', 'Retinol', '0,2–0,5 %',
      'Estimula colágeno y acelera la renovación. Introducir dos noches por semana e ir subiendo.',
      'Stimulates collagen and speeds renewal. Start two nights a week and build up.'),
    peptidos: A('Péptidos de señalización', 'Signal peptides', '—',
      'Alternativa al retinoide cuando hay intolerancia. Efecto más modesto pero acumulativo y sin irritación.',
      'The alternative to a retinoid when it is not tolerated. A more modest effect, but cumulative and non-irritating.'),
    zinc: A('PCA de zinc', 'Zinc PCA', '1 %',
      'Seborregulador con acción antibacteriana leve. Buen acompañante de la niacinamida.',
      'Sebum-regulating with mild antibacterial action. A good companion to niacinamide.'),
    avena: A('Avena coloidal', 'Colloidal oatmeal', '1–3 %',
      'Antipruriginoso y filmógeno. Reconocido por la FDA como protector cutáneo.',
      'Anti-itch and film-forming. Recognised by the FDA as a skin protectant.'),
    alantoina: A('Alantoína', 'Allantoin', '0,5–2 %',
      'Queratolítico suave y calmante. Presente en casi toda fórmula pensada para piel reactiva.',
      'A mild keratolytic and soothing agent. Present in almost every formula aimed at reactive skin.'),
    filtroFluido: A('Filtro solar SPF 50+ fluido', 'Fluid SPF 50+ sunscreen', 'PA++++',
      'Textura fluida o en gel, sin oclusión. Reaplicar cada 2 h con exposición.',
      'Fluid or gel texture, non-occlusive. Reapply every 2 h when exposed.'),
    filtroCrema: A('Filtro solar SPF 50+ nutritivo', 'Nourishing SPF 50+ sunscreen', 'PA++++',
      'Base emoliente para que el paso no reste confort en piel seca.',
      'An emollient base so the step does not cost comfort on dry skin.'),
    filtroMineral: A('Filtro solar mineral SPF 50+', 'Mineral SPF 50+ sunscreen', 'óxido de zinc',
      'Filtro físico puro: la opción con menor potencial de irritación y de reacción fótica.',
      'A pure physical filter: the option with the lowest potential for irritation and photoreaction.')
  };

  var EVITAR = {
    sensible: [
      { es: 'Alcohol desnaturalizado en los primeros puestos del INCI', en: 'Denatured alcohol high in the INCI list', ko: "전성분 앞쪽에 있는 변성알코올" },
      { es: 'Fragancia y aceites esenciales (limoneno, linalol, citral)', en: 'Fragrance and essential oils (limonene, linalool, citral)', ko: "향료와 에센셜 오일 (리모넨, 리날룰, 시트랄)" },
      { es: 'Exfoliantes físicos de grano irregular', en: 'Physical scrubs with irregular grains', ko: "입자가 고르지 않은 물리적 스크럽" },
      { es: 'Combinar dos ácidos distintos la misma noche', en: 'Combining two different acids on the same night', ko: "같은 날 밤에 서로 다른 산 두 가지를 함께 쓰는 것" }
    ],
    grasa: [
      { es: 'Limpieza con agua muy caliente o más de dos veces al día', en: 'Very hot water, or cleansing more than twice a day', ko: "매우 뜨거운 물 또는 하루 두 번을 넘는 세안" },
      { es: 'Texturas oclusivas con manteca de karité o aceite de coco', en: 'Occlusive textures with shea butter or coconut oil', ko: "시어버터나 코코넛 오일이 든 밀폐형 제형" },
      { es: 'Alcohol como matificante: rebota en más sebo a las pocas horas', en: 'Alcohol as a mattifier: it rebounds into more oil within hours', ko: "유분 잡겠다고 알코올 쓰기 — 몇 시간 뒤 피지가 더 늘어납니다" }
    ],
    seca: [
      { es: 'Limpiadores con sulfatos agresivos', en: 'Cleansers with harsh sulfates', ko: "자극적인 설페이트 클렌저" },
      { es: 'Tónicos astringentes', en: 'Astringent toners', ko: "수렴 토너" },
      { es: 'Exfoliación más de una vez por semana', en: 'Exfoliating more than once a week', ko: "주 1회를 넘는 각질 제거" }
    ],
    pigmentada: [
      { es: 'Cualquier día sin filtro solar, también en interior junto a ventana', en: 'Any day without sunscreen, indoors by a window included', ko: "자외선차단제를 거르는 날 — 창가 실내도 포함" },
      { es: 'Manipular los granitos: es la causa principal de mancha posinflamatoria', en: 'Picking at spots: the main cause of post-inflammatory marks', ko: "여드름 짜기 — 염증 후 색소침착의 가장 큰 원인입니다" },
      { es: 'Exfoliación agresiva, que empeora el melasma', en: 'Aggressive exfoliation, which makes melasma worse', ko: "기미를 악화시키는 과한 각질 제거" }
    ]
  };

  function recomendar(perfil, optico) {
    var DO = perfil.ejes.DO, SR = perfil.ejes.SR, PN = perfil.ejes.PN, WT = perfil.ejes.WT;
    var graso = DO.norm >= 0, sensible = SR.norm < 0, pigmentada = PN.norm < 0, arrugas = WT.norm < 0;

    var g = optico ? optico.global : null;
    var texturaAlta = g ? g.textura > 1.6 : false;
    var eritemaAlto = g ? g.eritema > 17 : false;
    var lesionesAltas = g ? g.lesiones > 12 : false;

    var activos = [], razones = [];

    if (graso) {
      activos.push(sensible ? ACTIVOS.niacinamida : ACTIVOS.niacinamidaAlta);
      var pcT = g ? (g.brilloT * 100).toFixed(0) : '—';
      razones.push({ es: 'Brillo en zona T del ' + pcT + ' % de área medida.',
                     en: 'Shine across ' + pcT + ' % of the measured T-zone area.',
                     ko: '측정된 T존 면적의 ' + pcT + ' %에서 유분 검출.' });
      activos.push(ACTIVOS.zinc);
      if (!sensible) {
        activos.push(ACTIVOS.bha);
        razones.push({ es: 'Poro dilatado con componente seborreico: el BHA es liposoluble y entra en el poro.',
                       en: 'Enlarged pores with a seborrhoeic component: BHA is oil-soluble and gets inside the pore.',
                       ko: '피지 요인을 동반한 넓은 모공 — BHA는 지용성이라 모공 안까지 들어갑니다.' });
      } else {
        activos.push(ACTIVOS.pha);
        razones.push({ es: 'Se elige PHA en vez de BHA por la reactividad declarada.',
                       en: 'PHA is chosen over BHA because of the reactivity you reported.',
                       ko: '보고하신 예민함 때문에 BHA 대신 PHA를 선택했습니다.' });
      }
      activos.push(ACTIVOS.escualano);
    } else {
      activos.push(ACTIVOS.ceramidas, ACTIVOS.glicerina, ACTIVOS.hialuronico);
      razones.push({ es: 'Patrón alípico: la prioridad es reponer lípidos de barrera antes que cualquier activo correctivo.',
                     en: 'Alipidic pattern: the priority is replacing barrier lipids before any corrective active.',
                     ko: '건성 패턴 — 교정 성분보다 장벽 지질을 먼저 채우는 것이 우선입니다.' });
      if (texturaAlta) {
        activos.push(ACTIVOS.aha);
        razones.push({ es: 'Índice de textura ' + g.textura.toFixed(2) + ' σL*: exfoliación humectante, no astringente.',
                       en: 'Texture index ' + g.textura.toFixed(2) + ' σL*: humectant exfoliation, not astringent.',
                       ko: '결 지수 ' + g.textura.toFixed(2) + ' σL* — 수렴이 아니라 보습형 각질 제거가 필요합니다.' });
      }
    }

    if (sensible || eritemaAlto) {
      activos.push(ACTIVOS.centella, ACTIVOS.pantenol);
      if (eritemaAlto) {
        razones.push({ es: 'Índice de eritema ' + g.eritema.toFixed(1) + ' UI, por encima de la banda de referencia.',
                       en: 'Erythema index ' + g.eritema.toFixed(1) + ' units, above the reference band.',
                       ko: '홍반지수 ' + g.eritema.toFixed(1) + ' UI — 기준 구간을 넘습니다.' });
      }
      if (g && g.deltaCentral > 2.5) {
        razones.push({ es: 'El eritema se concentra en mejillas frente a frente (Δ ' + g.deltaCentral.toFixed(1) + ' UI): patrón centrofacial que conviene que valore un dermatólogo.',
                       en: 'Erythema concentrates on the cheeks versus the forehead (Δ ' + g.deltaCentral.toFixed(1) + ' units): a centrofacial pattern worth a dermatologist\'s opinion.',
                       ko: '홍반이 이마보다 볼에 집중됩니다 (Δ ' + g.deltaCentral.toFixed(1) + ' UI) — 피부과 진료를 권하는 중안부 패턴입니다.' });
      }
      activos.push(ACTIVOS.avena);
    }
    if (lesionesAltas || (g && g.lesiones > 6 && graso)) {
      activos.push(ACTIVOS.azelaico);
      razones.push({ es: g.lesiones + ' focos inflamatorios detectados: el azelaico cubre inflamación, comedón y mancha a la vez.',
                     en: g.lesiones + ' inflammatory foci detected: azelaic covers inflammation, comedones and marks at once.',
                     ko: '염증성 병변 ' + g.lesiones + '개 검출 — 아젤라산은 염증·면포·색소를 한 번에 다룹니다.' });
    }

    if (pigmentada) {
      activos.push(sensible ? ACTIVOS.vitaminaCsuave : ACTIVOS.vitaminaC);
      activos.push(ACTIVOS.arbutina);
      if (g && g.itaSd > 5) {
        activos.push(ACTIVOS.tranexamico);
        razones.push({ es: 'Heterogeneidad de tono de ±' + g.itaSd.toFixed(1) + '° ITA entre zonas.',
                       en: 'Tone heterogeneity of ±' + g.itaSd.toFixed(1) + '° ITA across zones.',
                       ko: '부위 간 톤 편차 ±' + g.itaSd.toFixed(1) + '° ITA.' });
      }
    } else {
      activos.push(ACTIVOS.vitaminaCsuave);
    }

    if (arrugas) {
      activos.push(sensible ? ACTIVOS.retinol : ACTIVOS.retinal);
      razones.push({ es: 'Carga fotoacumulada declarada: el retinoide es el único activo tópico con evidencia sólida en colágeno.',
                     en: 'Reported accumulated photo-load: the retinoid is the only topical active with solid evidence on collagen.',
                     ko: '광노화 누적 보고 — 레티노이드는 콜라겐에 대해 확실한 근거가 있는 유일한 국소 성분입니다.' });
    } else if (sensible) {
      activos.push(ACTIVOS.peptidos);
    }
    if (!arrugas && !sensible) activos.push(ACTIVOS.alantoina);

    activos.push(sensible ? ACTIVOS.filtroMineral : (graso ? ACTIVOS.filtroFluido : ACTIVOS.filtroCrema));

    var vistos = {}, unicos = [];
    activos.forEach(function (a) {
      var k = a.n.es + a.c.es;
      if (!vistos[k]) { vistos[k] = 1; unicos.push(a); }
    });

    var deshidratada = perfil.hidratacion.norm < 0;
    var manana = [
      { paso: { es: 'Limpieza', en: 'Cleanse', ko: "클렌징" },
        cat: graso ? { es: 'Limpiador en gel de pH 5,5', en: 'Gel cleanser at pH 5.5', ko: "pH 5.5 젤 클렌저" }
                   : { es: 'Limpiador cremoso sin sulfatos', en: 'Creamy sulfate-free cleanser', ko: "설페이트 프리 크림 클렌저" },
        nota: graso ? { es: 'Sólo agua templada si la piel está cómoda al despertar.',
                        en: 'Lukewarm water alone if your skin feels comfortable on waking.', ko: "아침에 피부가 편안하면 미온수만으로도 충분합니다." }
                    : { es: 'Un solo lavado; por la mañana muchas veces basta con agua.',
                        en: 'One wash only; in the morning water is often enough.', ko: "한 번만 세안하세요. 아침에는 물만으로 충분한 경우가 많습니다." } },
      { paso: { es: 'Tratamiento', en: 'Treat', ko: "트리트먼트" },
        cat: pigmentada ? { es: 'Sérum antioxidante', en: 'Antioxidant serum', ko: "항산화 세럼" }
                        : { es: 'Sérum ligero hidratante', en: 'Light hydrating serum', ko: "가벼운 수분 세럼" },
        nota: pigmentada ? { es: 'Vitamina C antes del filtro: la fotoprotección se refuerza.',
                             en: 'Vitamin C before sunscreen: photoprotection is reinforced.', ko: "자외선차단제 전에 비타민 C를 — 차단 효과가 강화됩니다." }
                         : { es: 'Aplicar sobre piel aún húmeda.', en: 'Apply while the skin is still damp.', ko: "피부가 아직 촉촉할 때 바르세요." } },
      { paso: { es: 'Hidratación', en: 'Moisturise', ko: "보습" },
        cat: graso ? { es: 'Gel-crema oil-free', en: 'Oil-free gel-cream', ko: "오일프리 젤크림" }
                   : { es: 'Crema con ceramidas', en: 'Ceramide cream', ko: "세라마이드 크림" },
        nota: deshidratada ? { es: 'Este paso no es opcional en tu caso: has declarado tirantez.',
                               en: 'This step is not optional in your case: you reported tightness.', ko: "당신의 경우 이 단계는 선택이 아닙니다 — 당김을 보고하셨습니다." }
                           : { es: 'Cantidad de una avellana.', en: 'A hazelnut-sized amount.', ko: "헤이즐넛 한 알 정도의 양." } },
      { paso: { es: 'Fotoprotección', en: 'Protect', ko: "자외선 차단" },
        cat: { es: 'SPF 50+ de amplio espectro', en: 'Broad-spectrum SPF 50+', ko: "광범위 차단 SPF 50+" },
        nota: { es: 'Dos dedos de producto para cara y cuello. Es la medida con mejor relación coste-beneficio de toda la rutina.',
                en: 'Two fingers\' worth for face and neck. The best value-for-effort step in the whole routine.', ko: "얼굴과 목에 손가락 두 마디 분량. 루틴 전체에서 가성비가 가장 좋은 단계입니다." } }
    ];

    var noche = [
      { paso: { es: 'Desmaquillado', en: 'Remove', ko: "메이크업 클렌징" },
        cat: { es: 'Bálsamo o aceite limpiador', en: 'Cleansing balm or oil', ko: "클렌징 밤 또는 오일" },
        nota: { es: 'Sólo si has llevado maquillaje o filtro solar. Emulsionar bien antes de aclarar.',
                en: 'Only if you wore make-up or sunscreen. Emulsify well before rinsing.', ko: "메이크업이나 자외선차단제를 발랐을 때만. 헹구기 전 충분히 유화하세요." } },
      { paso: { es: 'Limpieza', en: 'Cleanse' },
        cat: graso ? { es: 'Limpiador en gel', en: 'Gel cleanser', ko: "젤 클렌저" }
                   : { es: 'Limpiador cremoso', en: 'Creamy cleanser', ko: "크림 클렌저" },
        nota: { es: 'Segunda limpieza breve, máximo 60 segundos.', en: 'A brief second cleanse, 60 seconds at most.', ko: "짧은 2차 세안, 최대 60초." } },
      { paso: { es: 'Activo', en: 'Active', ko: "활성 성분" },
        cat: arrugas ? { es: 'Retinoide en noches alternas', en: 'Retinoid on alternate nights', ko: "격일 밤 레티노이드" }
             : (graso ? { es: 'Exfoliante químico 2 noches/semana', en: 'Chemical exfoliant 2 nights/week', ko: "주 2회 밤 화학적 각질제거" }
                      : { es: 'Sérum reparador', en: 'Repair serum', ko: "회복 세럼" }),
        nota: arrugas ? { es: 'Empezar 2 noches por semana durante un mes antes de subir la frecuencia.',
                          en: 'Start at 2 nights a week for a month before increasing.', ko: "한 달간 주 2회 밤으로 시작한 뒤 빈도를 올리세요." }
                      : { es: 'Nunca combinar dos exfoliantes la misma noche.',
                          en: 'Never combine two exfoliants on the same night.', ko: "같은 날 밤에 각질제거제를 두 개 겹치지 마세요." } },
      { paso: { es: 'Reparación', en: 'Repair', ko: "회복" },
        cat: sensible ? { es: 'Crema calmante con centella', en: 'Soothing cream with centella', ko: "병풀 진정 크림" }
                      : { es: 'Crema nutritiva', en: 'Nourishing cream', ko: "영양 크림" },
        nota: { es: 'Aplicar siempre después del activo, nunca antes.',
                en: 'Always apply after the active, never before.', ko: "항상 활성 성분 뒤에 바르세요. 절대 먼저 바르지 마세요." } }
    ];

    var evitar = [];
    if (sensible) evitar = evitar.concat(EVITAR.sensible);
    evitar = evitar.concat(graso ? EVITAR.grasa : EVITAR.seca);
    if (pigmentada) evitar = evitar.concat(EVITAR.pigmentada);
    var ev = {}, evitarU = [];
    evitar.forEach(function (e) { if (!ev[e.es]) { ev[e.es] = 1; evitarU.push(e); } });

    return { activos: unicos, razones: razones, manana: manana, noche: noche, evitar: evitarU };
  }

  global.ESPEJO_PERFIL = {
    PREGUNTAS: PREGUNTAS, EJES: EJES,
    calcular: calcular, recomendar: recomendar
  };
})(window);
