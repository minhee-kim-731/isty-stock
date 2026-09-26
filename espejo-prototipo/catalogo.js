/* ==========================================================================
   ESPEJO · Catálogo Lococo y selección de rutina
   --------------------------------------------------------------------------
   Los productos salen del surtido real de Lococo. La sección de activos que
   va justo antes explica QUÉ necesita esta piel; aquí se traduce a lo que hay
   en el mostrador, y cada elección arrastra el número que la justifica.

   La selección es DETERMINISTA: el mismo rostro da siempre la misma rutina.
   Una recomendación que cambia entre dos lecturas de la misma piel no es una
   recomendación, es un sorteo.
   ========================================================================== */
(function (global) {
  'use strict';

  var METAS = {
    'Pore Control':      { es: 'Poro',           en: 'Pores',       ko: '모공' },
    'Clear & Acne-Free': { es: 'Imperfecciones', en: 'Blemishes',   ko: '트러블' },
    'Calm & Redness':    { es: 'Calmante',       en: 'Soothing',    ko: '진정' },
    'Hydration Boost':   { es: 'Hidratación',    en: 'Hydration',   ko: '수분' },
    'Brightening & Glow':{ es: 'Luminosidad',    en: 'Brightening', ko: '미백·광채' },
    'Youth & Firmness':  { es: 'Firmeza',        en: 'Firmness',    ko: '탄력' }
  };

  var RANURAS = [
    { id: 'limpiador',  nom: { es: 'Limpieza',         en: 'Cleanse',    ko: '클렌징' } },
    { id: 'tonico',     nom: { es: 'Tónico / esencia', en: 'Tone',       ko: '토너·에센스' } },
    { id: 'serum',      nom: { es: 'Sérum',            en: 'Serum',      ko: '세럼' } },
    { id: 'hidratante', nom: { es: 'Hidratación',      en: 'Moisturise', ko: '수분크림' } },
    { id: 'proteccion', nom: { es: 'Fotoprotección',   en: 'Protect',    ko: '자외선차단' } }
  ];

    /* h = handle de la ficha en lococo.beauty (tienda Shopify). Sólo lo llevan
     los productos que se venden online (32 de los 97 del pedido del puesto, más 18 que sólo están en la tienda, cruzado con products.json
     el 2026-09-26 comprobando marca y nombre a mano). Sin h, el informe no
     enlaza: una búsqueda que no encuentra nada es peor que no enlazar.
     */
var PRODUCTOS = [
  { b:"AXIS-Y", n:"Dark Spot Correcting Glow Cream 50ml", s:"hidratante", p:"23.90", m:["Brightening & Glow"] },
  { b:"Anua", n:"Heartleaf 70% Daily Lotion 200ml", s:"hidratante", p:"25.90", m:["Calm & Redness"] },
  { b:"Anua", n:"PDRN Hyaluronic Acid Moisturizing Cream 60ml", s:"hidratante", p:"22.90", m:["Hydration Boost"], i:"Ácido Hialurónico, PDRN" },
  { b:"Beauty of Joseon", n:"Red Bean Water Gel 100ml", s:"hidratante", p:"19.90", m:["Pore Control"] },
  { b:"COSRX", n:"The Retinol 0.3 cream 20mL", s:"hidratante", p:"27.90", m:["Youth & Firmness", "Pore Control"], i:"Retinoides & Bakuchiol", h:"cosrx-the-retinol-0-3-cream-20-ml" },
  { b:"Dr. Althea", n:"345 Relief Cream 50ml", s:"hidratante", p:"22.90", m:["Calm & Redness"], h:"dr-althea-345-relief-cream-50ml" },
  { b:"Dr. Althea", n:"PDRN Reju 5000 Cream 20ml", s:"hidratante", p:"24.90", m:["Youth & Firmness"], i:"PDRN" },
  { b:"Dr. Reju-All", n:"Advanced PDRN Rejuvenating Cream 20ml", s:"hidratante", p:"28.90", m:["Youth & Firmness"], i:"PDRN" },
  { b:"HaruHaru Wonder", n:"Black Rice 10 Hyaluronic Cream 50ml", s:"hidratante", p:"16.90", m:["Hydration Boost"], i:"Ácido Hialurónico" },
  { b:"HaruHaru Wonder", n:"Black Rice 5 Ceramide Barrier Moisturizing Cream 50ml", s:"hidratante", p:"19.90", m:["Hydration Boost"] },
  { b:"HaruHaru Wonder", n:"Centella Phyto & 5 Peptide Concentrate Cream 30ml", s:"hidratante", p:"19.90", m:["Calm & Redness"], i:"Centella Asiática (Cica), Péptidos" },
  { b:"I'm from", n:"Rice Cream 50ml", s:"hidratante", p:"25.90", m:["Brightening & Glow"] },
  { b:"Medicube", n:"Collagen Jelly Cream 110ml", s:"hidratante", p:"27.90", m:["Youth & Firmness"] },
  { b:"Medicube", n:"Deep Vita C Capsule Cream 55g", s:"hidratante", p:"29.90", m:["Brightening & Glow"], i:"Vitamina C" },
  { b:"Medicube", n:"PDRN Pink Collagen Capsule Cream 55g", s:"hidratante", p:"30.90", m:["Youth & Firmness"], i:"PDRN", h:"medicube-pdrn-pink-collagen-capsule-cream-55g" },
  { b:"Purito SEOUL", n:"Hydro Wave Deep Sea Cream 50ml", s:"hidratante", p:"18.90", m:["Hydration Boost"], h:"purito-seoul-hydro-wave-deep-sea-cream-50ml" },
  { b:"Purito SEOUL", n:"Mighty Bamboo Panthenol Cream 100ml", s:"hidratante", p:"20.90", m:["Calm & Redness"], h:"purito-seoul-mighty-bamboo-panthenol-cream-100ml" },
  { b:"Purito SEOUL", n:"Oat-in Calming Gel Cream 100ml", s:"hidratante", p:"18.90", m:["Calm & Redness"], h:"purito-seoul-renewal-oat-in-calming-gel-cream-100ml" },
  { b:"Purito SEOUL", n:"Wonder Releaf Centella Cream Unscented 50ml", s:"hidratante", p:"18.90", m:["Calm & Redness"], i:"Centella Asiática (Cica)" },
  { b:"Round Lab", n:"1025 Dokdo Cream 80ml", s:"hidratante", p:"23.90", m:["Hydration Boost"], h:"round-lab-1025-dokdo-cream-80ml" },
  { b:"VT Cosmetics", n:"Reedle Shot Lifting Cream 50ml", s:"hidratante", p:"32.90", m:["Youth & Firmness"] },
  { b:"AXIS-Y", n:"Mugwort Pore Clarifying Wash Off Pack 100ml", s:"limpiador", p:"23.90", m:["Pore Control"] },
  { b:"Anua", n:"Heartleaf Pore Control Cleansing Oil 200ml", s:"limpiador", p:"21.90", m:["Pore Control"] },
  { b:"Arencia", n:"Fresh Green Rice Mochi Cleanser 120g", s:"limpiador", p:"13.90", m:["Pore Control"], h:"arencia-fresh-green-rice-mochi-cleanser-120g" },
  { b:"Beauty of Joseon", n:"Apricot Blossom Peeling Gel 100ml", s:"limpiador", p:"14.90", m:["Brightening & Glow"] },
  { b:"Beauty of Joseon", n:"Ginseng Cleansing Oil 210ml", s:"limpiador", p:"20.90", m:["Youth & Firmness"] },
  { b:"Beauty of Joseon", n:"Green Plum Refreshing Cleanser 200ml", s:"limpiador", p:"15.90", m:["Brightening & Glow"] },
  { b:"Beauty of Joseon", n:"Ground Rice and Honey Glow Mask 150ml", s:"limpiador", p:"19.90", m:["Brightening & Glow"] },
  { b:"Beauty of Joseon", n:"Radiance Cleansing Balm 100ml", s:"limpiador", p:"20.90", m:["Brightening & Glow"] },
  { b:"Dr. Althea", n:"Pore Refresh Grinding Cleansing Balm 50ml", s:"limpiador", p:"20.90", m:["Pore Control"] },
  { b:"Dr. Althea", n:"Pure Grinding Cleansing Balm 50ml", s:"limpiador", p:"20.90", m:["Clear & Acne-Free"], h:"dr-althea-pure-grinding-cleansing-balm-50ml" },
  { b:"HaruHaru Wonder", n:"Black Rice Deep Cleansing Oil 150ml", s:"limpiador", p:"19.90", m:["Clear & Acne-Free"] },
  { b:"HaruHaru Wonder", n:"Black RiceTriple AHA Gentle Cleansing Gel 100ml", s:"limpiador", p:"16.90", m:["Pore Control"] },
  { b:"Ma:nyo", n:"Pure Cleansing Oil 200ml", s:"limpiador", p:"25.90", m:["Clear & Acne-Free"], h:"ma-nyo-pure-cleansing-oil-200ml" },
  { b:"Ma:nyo", n:"Pure Soybean Cleansing Milk", s:"limpiador", p:"20.90", m:["Calm & Redness"] },
  { b:"Purito SEOUL", n:"Mighty Bamboo Panthenol Cleanser 150ml", s:"limpiador", p:"14.90", m:["Calm & Redness"], h:"purito-seoul-mighty-bamboo-panthenol-cleanser-150ml-1" },
  { b:"Round Lab", n:"1025 Dokdo Cleanser 150ml", s:"limpiador", p:"16.90", m:["Hydration Boost"], h:"round-lab-1025-dokdo-cleanser-150ml" },
  { b:"AXIS-Y", n:"Vegan Collagen Eye Serum 10ml", s:"ojos", p:"22.90", m:["Youth & Firmness"] },
  { b:"COSRX", n:"The Peptide Collagen Hydrogel Eye Patch (60 patches)", s:"ojos", p:"19.90", m:["Youth & Firmness"], i:"Péptidos", h:"cosrx-the-peptide-collagen-hydrogel-eye-patch-60pcs" },
  { b:"HaruHaru Wonder", n:"Black Rice Bakuchiol Eye Cream 20ml", s:"ojos", p:"16.90", m:["Youth & Firmness", "Pore Control"], i:"Retinoides & Bakuchiol" },
  { b:"Purito SEOUL", n:"Wonder Releaf Centella Eye Cream 30ml", s:"ojos", p:"12.90", m:["Calm & Redness"], i:"Centella Asiática (Cica)" },
  { b:"VT Cosmetics", n:"Reedle Shot Lifting Eye Cream 15ml", s:"ojos", p:"26.90", m:["Youth & Firmness"] },
  { b:"Beauty of Joseon", n:"Relief Sun Rice + Probiotics 50ml", s:"proteccion", p:"15.90", m:["Hydration Boost"], h:"beauty-of-joseon-relief-sun-rice-probiotics-50ml" },
  { b:"HaruHaru Wonder", n:"Black Rice Moisture Airyfit Daily Sunscreen 50ml", s:"proteccion", p:"17.90", m:["Hydration Boost"] },
  { b:"HaruHaru Wonder", n:"Black Rice Pure Mineral Relief Daily Sunscreen 50ml", s:"proteccion", p:"17.90", m:["Calm & Redness"] },
  { b:"Isntree", n:"hyaluronic Acid Airy Sun Stick 22g", s:"proteccion", p:"23.90", m:["Hydration Boost"], i:"Ácido Hialurónico" },
  { b:"Isntree", n:"hyaluronic Acid Watery Sun Gel 50ml", s:"proteccion", p:"18.90", m:["Hydration Boost"], i:"Ácido Hialurónico" },
  { b:"TOCOBO", n:"Bio Watery Sun Cream 50ml", s:"proteccion", p:"14.90", m:["Hydration Boost"] },
  { b:"AXIS-Y", n:"Dark Spot Correcting Glow Serum 50ml", s:"serum", p:"18.90", m:["Brightening & Glow"] },
  { b:"Anua", n:"PDRN Hyaluronic Capsule 100 Serum 30ml", s:"serum", p:"22.90", m:["Hydration Boost"], i:"Ácido Hialurónico, PDRN", h:"anua-pdrn-hyaluronic-capsule-100-serum-30ml" },
  { b:"Arencia", n:"Retinal Booster Shot 30ml", s:"serum", p:"13.90", m:["Youth & Firmness"], i:"Retinoides & Bakuchiol", h:"arencia-retinal-booster-shot-30ml" },
  { b:"Beauty of Joseon", n:"Light On Serum Centella + Vita C 30ml", s:"serum", p:"18.00", m:["Brightening & Glow"], i:"Vitamina C, Centella Asiática (Cica)" },
  { b:"COSRX", n:"The Vitamin C 13 Serum 20mL", s:"serum", p:"20.90", m:["Brightening & Glow"], i:"Vitamina C" },
  { b:"Celimax", n:"Pore+Dark Spot Brightening Serum 30ml", s:"serum", p:"26.90", m:["Pore Control"] },
  { b:"Celimax", n:"The Vita-A Retinal Shot Tightening Booster 15ml", s:"serum", p:"26.90", m:["Youth & Firmness", "Pore Control"], i:"Retinoides & Bakuchiol", h:"celimax-the-vitaa-retinal-shot-tightening-booster-15ml" },
  { b:"Centellian24", n:"Madeca Mela Capture Ampoule Max 30ml", s:"serum", p:"19.90", m:["Brightening & Glow"], i:"Centella Asiática (Cica)", h:"centellian24-madeca-mela-capture-ampoule-max-30ml" },
  { b:"Dr. Althea", n:"Gentle Vitamin C Serum 30ml", s:"serum", p:"20.90", m:["Brightening & Glow"], i:"Vitamina C" },
  { b:"Dr. Althea", n:"Vitamin C Boosting Serum 30ml", s:"serum", p:"21.90", m:["Brightening & Glow"], i:"Vitamina C" },
  { b:"HaruHaru Wonder", n:"Rose PDRN Firming Serum 30ml", s:"serum", p:"16.90", m:["Youth & Firmness"], i:"PDRN" },
  { b:"HaruHaru Wonder", n:"Rose PDRN Soothing Serum 30ml", s:"serum", p:"16.90", m:["Calm & Redness"], i:"PDRN" },
  { b:"I'm from", n:"Rice Serum 30ml", s:"serum", p:"24.90", m:["Brightening & Glow"] },
  { b:"Isntree", n:"Ultra-low Molecular Hyaluronic Acid Serum 50ml", s:"serum", p:"21.90", m:["Hydration Boost"], i:"Ácido Hialurónico" },
  { b:"JUMISO", n:"Niacinamide 20 Serum 40ml", s:"serum", p:"20.90", m:["Youth & Firmness", "Pore Control"], i:"Niacinamida" },
  { b:"Medicube", n:"PDRN Pink Peptide Serum 30ml", s:"serum", p:"26.90", m:["Youth & Firmness"], i:"Péptidos, PDRN", h:"medicube-pdrn-pink-peptide-serum-30ml" },
  { b:"Numbuzin", n:"No.3 Skin Softening Serum 50ml", s:"serum", p:"24.90", m:["Hydration Boost"] },
  { b:"Purito SEOUL", n:"Azelaic Acid 10 Kojic Tea Tree Serum 30ml", s:"serum", p:"20.90", m:["Clear & Acne-Free"], h:"purito-seoul-azelaic-acid-10-kojic-tea-tree-serum-30ml-1" },
  { b:"Purito SEOUL", n:"Wonder Releaf Centella Serum Unscented 60ml", s:"serum", p:"20.90", m:["Calm & Redness"], i:"Centella Asiática (Cica)", h:"purito-seoul-wonder-releaf-centella-serum-unscented-60ml" },
  { b:"VT Cosmetics", n:"VT Reedle shot 100 50ml", s:"serum", p:"31.90", m:["Pore Control"], h:"vt-cosmetics-vt-reedle-shot-100-50ml" },
  { b:"VT Cosmetics", n:"VT Reedle shot 300 50ml", s:"serum", p:"41.90", m:["Pore Control"], h:"vt-cosmetics-vt-reedle-shot-300-50ml" },
  { b:"AXIS-Y", n:"Dark Spot Correcting Glow Toner 125ml", s:"tonico", p:"23.90", m:["Brightening & Glow"] },
  { b:"Anua", n:"Pdrn Hyaluronic Acid Hydrating Capsule Mist 100ml", s:"tonico", p:"22.90", m:["Hydration Boost"], i:"PDRN", h:"anua-pdrn-hyaluronic-acid-hydrating-capsule-mist-100ml" },
  { b:"Beauty of Joseon", n:"Ginseng Essence Water 150ml", s:"tonico", p:"20.90", m:["Youth & Firmness"] },
  { b:"Beauty of Joseon", n:"Green plum refreshing toner : AHA + BHA 150ml", s:"tonico", p:"18.90", m:["Pore Control"] },
  { b:"Beauty of Joseon", n:"Red Bean Refreshing Pore Mask 140ml", s:"tonico", p:"21.90", m:["Pore Control"] },
  { b:"Biodance", n:"Bio-Collagen Real Deep Mask 34g (1ud)", s:"tonico", p:"2.90", m:["Youth & Firmness"], h:"biodance-bio-collagen-real-deep-mask-34g-1ud" },
  { b:"Biodance", n:"Cera-Nol Gel Toner Pads (60 pads)", s:"tonico", p:"24.90", m:["Calm & Redness"], h:"biodance-cera-nol-gel-toner-pads-60-pads" },
  { b:"Biodance", n:"Collagen Gel Toner Pads (60 pads)", s:"tonico", p:"24.90", m:["Youth & Firmness"], h:"biodance-collagen-gel-toner-pads-60-pads" },
  { b:"Biodance", n:"Hydro Cera-nol Real Deep Mask 34g (1ud)", s:"tonico", p:"2.90", m:["Hydration Boost"], h:"biodance-hydro-cera-nol-real-deep-mask-34g-1ud" },
  { b:"Biodance", n:"Sea Kelp Gel Toner Pads (60 pads)", s:"tonico", p:"24.90", m:["Pore Control"] },
  { b:"COSRX", n:"Advanced Snail 96 Mucin Power Essence 100ml", s:"tonico", p:"17.90", m:["Hydration Boost"] },
  { b:"Celimax", n:"Dual Barrier Creamy Toner 150ml", s:"tonico", p:"23.90", m:["Calm & Redness"] },
  { b:"Celimax", n:"Heartleaf BHA Peeling Pad (60 pads)", s:"tonico", p:"20.90", m:["Pore Control"] },
  { b:"Dr. Althea", n:"345 Relief Cream Mist 100ml", s:"tonico", p:"21.90", m:["Calm & Redness"] },
  { b:"HaruHaru Wonder", n:"Black Rice Hyaluronic Toner 300ml", s:"tonico", p:"16.90", m:["Hydration Boost"], i:"Ácido Hialurónico" },
  { b:"HaruHaru Wonder", n:"Black Rice Probiotics Barrier 2% NAD+ Serum Mist 80ml", s:"tonico", p:"17.90", m:["Calm & Redness"] },
  { b:"HaruHaru Wonder", n:"Black Rice Probiotics Barrier Essence 120ml", s:"tonico", p:"22.90", m:["Calm & Redness"] },
  { b:"I'm from", n:"Mugwort Essence 150ml", s:"tonico", p:"40.90", m:["Calm & Redness"] },
  { b:"I'm from", n:"Rice toner 150ml", s:"tonico", p:"25.90", m:["Brightening & Glow"], h:"im-from-rice-toner-150ml" },
  { b:"Isntree", n:"Green Tea Fresh Toner 200ml", s:"tonico", p:"17.90", m:["Calm & Redness"] },
  { b:"Medicube", n:"Collagen Night Wrapping Mask 75ml", s:"tonico", p:"27.90", m:["Youth & Firmness"], h:"medicube-collagen-night-wrapping-mask-75ml" },
  { b:"Medicube", n:"Deep vita c pad (70pcs)", s:"tonico", p:"27.90", m:["Brightening & Glow"], i:"Vitamina C" },
  { b:"Medicube", n:"Kojic Acid Turmeric Brightening Gel Mask (1 sheet)", s:"tonico", p:"3.90", m:["Brightening & Glow"] },
  { b:"Medicube", n:"PDRN Pink Collagen Gel Mask (1 sheet)", s:"tonico", p:"2.90", m:["Youth & Firmness"], i:"PDRN", h:"medicube-pdrn-pink-collagen-gel-mask-1-sheet" },
  { b:"Medicube", n:"PDRN pink caffeine night wrapping mask 75ml", s:"tonico", p:"30.90", m:["Youth & Firmness"], i:"PDRN" },
  { b:"Round Lab", n:"1025 DOKDO TONER_500ml", s:"tonico", p:"19.90", m:["Hydration Boost"], h:"round-lab-1025-dokdo-toner_500ml" },
  { b:"TOCOBO", n:"Vita Glazed Lip Mask 20ml", s:"tonico", p:"15.90", m:["Hydration Boost"] },
  { b:"VT Cosmetics", n:"VT Spot Patch 48ea", s:"tonico", p:"8.90", m:["Clear & Acne-Free"] },
  /* Sólo en la tienda online (no en el pedido del puesto). Clasificados a mano
     el 2026-09-26: la tienda no tiene tipo ni etiquetas en estos productos. */
  { b:"Round Lab", n:"Birch Juice Sun Cream 50ml", s:"proteccion", p:"15.90", m:["Hydration Boost"], h:"round-lab-birch-juice-sun-cream-50ml" },
  { b:"Purito SEOUL", n:"Wonder Releaf Centella Daily Sun Lotion 60ml", s:"proteccion", p:"13.90", m:["Calm & Redness"], i:"Centella Asiática (Cica)", h:"purito-seoul-wonder-releaf-centella-daily-sun-lotion-60ml" },
  { b:"Round Lab", n:"Birch Juice Cleanser 150ml", s:"limpiador", p:"11.90", m:["Hydration Boost"], h:"round-lab-birch-juice-cleanser-150ml-1" },
  { b:"Ma:nyo", n:"Pure&Deep Cleansing Foam 100ml", s:"limpiador", p:"11.90", m:["Pore Control"], h:"ma-nyo-pure-deep-cleansing-foam-100ml" },
  { b:"Aromatica", n:"Tea Tree Purifying Tonic", s:"tonico", p:"11.90", m:["Clear & Acne-Free", "Pore Control"], h:"aromatica-tea-tree-purifying-tonic" },
  { b:"COSRX", n:"The 6 Peptide Skin Booster Serum 150ml", s:"tonico", p:"17.90", m:["Youth & Firmness", "Hydration Boost"], i:"Péptidos", h:"cosrx-the-6-peptide-skin-booster-serum-150ml" },
  { b:"Ongredients", n:"Skin Barrier Calming Lotion 150ml", s:"hidratante", p:"15.90", m:["Calm & Redness", "Hydration Boost"], h:"ongredients-skin-barrier-calming-lotion-150ml" },
  { b:"VT Cosmetics", n:"Pdrn Capsule Cream 100 50ml", s:"hidratante", p:"19.90", m:["Youth & Firmness", "Hydration Boost"], i:"PDRN", h:"vt-cosmetics-pdrn-capsule-cream-100-50ml" },
  { b:"COSRX", n:"Advanced Snail 92 All In One Cream Tube 100ml", s:"hidratante", p:"18.90", m:["Hydration Boost", "Calm & Redness"], h:"cosrx-advanced-snail-92-all-in-one-cream-tube-100ml" },
  { b:"Anua", n:"Niacinamide 10 + TXA 4% Serum 30ml", s:"serum", p:"17.90", m:["Brightening & Glow", "Clear & Acne-Free"], i:"Niacinamida", h:"anua-niacinamide-10-txa-4-serum-30ml" },
  { b:"Purito SEOUL", n:"TXA 6 Niacinamide 10 Retinal Serum 30ml", s:"serum", p:"15.90", m:["Brightening & Glow", "Youth & Firmness"], i:"Niacinamida, Retinoides & Bakuchiol", h:"purito-seoul-txa-6-niacinamide-10-retinal-serum-30ml-1" },
  { b:"Purito SEOUL", n:"Multi PDRN Collagen EGF Serum 30ml", s:"serum", p:"15.90", m:["Youth & Firmness", "Hydration Boost"], i:"PDRN, Péptidos", h:"purito-seoul-multi-pdrn-collagen-egf-serum-30ml" },
  { b:"Purito SEOUL", n:"Retinol Retinal 2000 NAD+ Serum 30ml", s:"serum", p:"16.90", m:["Youth & Firmness", "Pore Control"], i:"Retinoides & Bakuchiol", h:"purito-seoul-retinol-retinal-2000-nad-serum-30ml" },
  { b:"Celimax", n:"VITA-A Retinol Shot Tightening Serum 30ml", s:"serum", p:"18.90", m:["Youth & Firmness", "Pore Control"], i:"Retinoides & Bakuchiol", h:"celimax-vita-a-retinol-shot-tightening-serum-30ml" },
  { b:"VT Cosmetics", n:"Collagen Reedle Shot 100 50ml", s:"serum", p:"28.90", m:["Youth & Firmness", "Pore Control"], h:"vt-cosmetics-collagen-reedle-shot-100" },
  { b:"VT Cosmetics", n:"PDRN Reedle Glow Ampoule 100ml", s:"serum", p:"18.90", m:["Brightening & Glow", "Hydration Boost"], i:"PDRN", h:"vt-cosmetics-pdrn-reedle-glow-ampoule-100ml" },
  { b:"Sungboon Editor", n:"Green Tomato NMN Pore Minimizing Ampoule 40ml", s:"serum", p:"11.90", m:["Pore Control"], h:"sungboon-editor-green-tomato-nmn-pore-minimizing-ampoule-40ml" },
  { b:"Sungboon Editor", n:"Silk Peptide EGF Intensive Ampoule 40ml", s:"serum", p:"18.90", m:["Youth & Firmness"], i:"Péptidos", h:"sungboon-editor-silk-peptide-egf-intensive-ampoule-40ml" },
  ];

  /* --------------------------------------------------------- PRIORIDADES
     Cada meta recibe un peso a partir de la medición y del cuestionario. No
     se inventa nada: si una meta pesa, hay una cifra detrás que lo explica,
     y esa misma cifra es la que se muestra como motivo. */
  function prioridades(perfil, optico) {
    var g = optico ? optico.global : null;
    var SR = perfil.ejes.SR, PN = perfil.ejes.PN, WT = perfil.ejes.WT;
    var graso = perfil.ejes.DO.norm >= 0;
    var P = [];

    function meta(clave, peso, motivo) {
      if (peso > 0) P.push({ clave: clave, peso: peso, motivo: motivo });
    }

    if (g) {
      var brilloPc = (g.brilloT * 100).toFixed(0);
      meta('Pore Control',
        (graso ? 2 : 0) + (g.textura > 1.6 ? 2 : g.textura > 1.0 ? 1 : 0) + (g.brilloT > 0.13 ? 1 : 0),
        { es: 'brillo del ' + brilloPc + ' % en zona T y textura ' + g.textura.toFixed(2) + ' σL*',
          en: brilloPc + ' % shine in the T-zone and texture ' + g.textura.toFixed(2) + ' σL*',
          ko: 'T존 유분 ' + brilloPc + ' %, 결 지수 ' + g.textura.toFixed(2) + ' σL*' });

      meta('Clear & Acne-Free',
        (g.lesiones > 12 ? 3 : g.lesiones > 6 ? 2 : g.lesiones > 2 ? 1 : 0) + (graso ? 1 : 0),
        { es: g.lesiones + ' focos inflamatorios detectados',
          en: g.lesiones + ' inflammatory foci detected',
          ko: '염증성 병변 ' + g.lesiones + '개 검출' });

      meta('Calm & Redness',
        (g.eritema > 20 ? 3 : g.eritema > 17 ? 2 : 0) + (SR.norm < 0 ? 2 : 0) +
        (g.deltaCentral > 2.5 ? 1 : 0),
        { es: 'índice de eritema ' + g.eritema.toFixed(1) + ' UI',
          en: 'erythema index ' + g.eritema.toFixed(1) + ' units',
          ko: '홍반지수 ' + g.eritema.toFixed(1) + ' UI' });

      meta('Brightening & Glow',
        (PN.norm < 0 ? 2 : 0) + (g.itaSd > 5 ? 2 : g.itaSd > 3 ? 1 : 0),
        { es: 'heterogeneidad de tono de ±' + g.itaSd.toFixed(1) + '° ITA entre zonas',
          en: 'tone heterogeneity of ±' + g.itaSd.toFixed(1) + '° ITA across zones',
          ko: '존 간 톤 편차 ±' + g.itaSd.toFixed(1) + '° ITA' });
    }

    meta('Hydration Boost',
      (graso ? 0 : 3) + (perfil.hidratacion.norm < 0 ? 2 : 0),
      graso
        ? { es: 'tirantez declarada en el cuestionario',
            en: 'tightness reported in the questionnaire',
            ko: '문진에서 보고된 당김' }
        : { es: 'patrón alipídico: reponer lípidos antes que corregir',
            en: 'alipidic pattern: replace lipids before correcting anything',
            ko: '건성 패턴 — 교정보다 지질 보충이 우선' });

    meta('Youth & Firmness',
      (WT.norm < 0 ? 3 : 0) + (WT.norm < -0.4 ? 1 : 0),
      { es: 'carga fotoacumulada declarada',
        en: 'reported accumulated photo-load',
        ko: '문진 기준 광노화 누적' });

    P.sort(function (a, b) { return b.peso - a.peso || a.clave.localeCompare(b.clave); });
    return P;
  }

  /* Un producto puntúa por cuánto cubre las metas prioritarias. El empate se
     rompe por precio y luego por nombre: nunca al azar. */
  /* Sólo se recomienda lo que se vende en lococo.beauty (con handle `h`),
     para que cada paso enlace a su ficha (Lococo, 2026-09-26). Si una ranura
     se quedara sin productos de la tienda, se vuelve al catálogo completo. */
  var SOLO_TIENDA = true;

  function elegir(ranura, prio, usados, servidas) {
    var candidatos = PRODUCTOS.filter(function (p) {
      return p.s === ranura && usados.indexOf(p.b + p.n) < 0;
    });
    if (SOLO_TIENDA) {
      var enTienda = candidatos.filter(function (p) { return !!p.h; });
      if (enTienda.length) candidatos = enTienda;
    }
    if (!candidatos.length) return null;

    var puntuados = candidatos.map(function (p) {
      var punt = 0, razon = null;
      prio.forEach(function (q, idx) {
        if (p.m.indexOf(q.clave) < 0) return;
        /* Una meta ya cubierta por un paso anterior vale menos en el
           siguiente. Sin esto, una prioridad dominante se come los cinco
           pasos y la rutina sale repitiendo la misma etiqueta cinco veces:
           correcta sobre el papel e inútil en el mostrador. Un profesional
           ataca lo urgente en el tratamiento y reparte el resto. */
        var yaCubierta = servidas[q.clave] ? 0.4 : 1;
        var aporte = q.peso * (idx === 0 ? 3 : idx === 1 ? 2 : 1) * yaCubierta;
        punt += aporte;
        if (!razon || aporte > razon.aporte) razon = { q: q, aporte: aporte };
      });
      return { p: p, punt: punt, razon: razon, precio: parseFloat(p.p) || 999 };
    });
    puntuados.sort(function (a, b) {
      return b.punt - a.punt || a.precio - b.precio || a.p.n.localeCompare(b.p.n);
    });
    return puntuados[0];
  }

  function rutina(perfil, optico) {
    var prio = prioridades(perfil, optico);
    var usados = [], salida = [], servidas = {};

    /* El sérum va primero: es el paso con más margen terapéutico, así que se
       lleva la prioridad número uno antes de que la reparta nadie. */
    var orden = ['serum', 'tonico', 'hidratante', 'limpiador', 'proteccion'];
    orden.forEach(function (id) {
      var R = RANURAS.filter(function (x) { return x.id === id; })[0];
      var e = elegir(id, prio, usados, servidas);
      if (!e) return;
      usados.push(e.p.b + e.p.n);
      if (e.razon) servidas[e.razon.q.clave] = true;
      salida.push({
        id: id,
        ranura: R.nom,
        producto: e.p,
        metas: e.p.m.map(function (m) { return METAS[m] || { es: m, en: m, ko: m }; }),
        cubre: e.razon ? (METAS[e.razon.q.clave] || null) : null
      });
    });

    /* Se devuelve en el orden en que se aplica, no en el que se eligió. */
    salida.sort(function (a, b) {
      return RANURAS.map(function (r) { return r.id; }).indexOf(a.id) -
             RANURAS.map(function (r) { return r.id; }).indexOf(b.id);
    });
    return { pasos: salida, prioridades: prio.slice(0, 3), metas: METAS };
  }

  global.ESPEJO_CATALOGO = {
    PRODUCTOS: PRODUCTOS, METAS: METAS, RANURAS: RANURAS,
    rutina: rutina, prioridades: prioridades
  };
})(window);
