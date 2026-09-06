import { db, now, transact, moveStock, logActivity, bumpVersion } from "./db.mjs";

/** 실리콘투 1차 발주 PI00786492 (2026-08-13) — [바코드, 브랜드, 제품명, 단가EUR, 수량] */
const PI00786492 = [
  ["8809562190738", "ARENCIA", "Fresh Green Rice Mochi Cleanser 120g", 6.25, 6],
  ["8809562192763", "ARENCIA", "Retinal Booster Shot 30ml", 6.44, 6],
  ["8800307373393", "ANUA", "PDRN Hyaluronic Acid Hydrating Capsule Mist 100ml", 10.5, 6],
  ["8809640735820", "ANUA", "Niacinamide 10% + TXA 4% Serum 30ml", 9.73, 3],
  ["8809640738616", "ANUA", "PDRN Hyaluronic Acid Capsule 100 Serum 30ml", 12.76, 3],
  ["8809937361657", "BIODANCE", "Bio-Collagen Real Deep Mask 1Box (34g*4ea)", 7.5, 3],
  ["8809937361664", "BIODANCE", "Hydro Cera-nol Real Deep Mask 1Box (34g*4ea)", 7.5, 3],
  ["8809891185276", "BIODANCE", "Sea Kelp Gel Toner Pad (60ea)", 8.22, 1],
  ["8809891184545", "BIODANCE", "Collagen Gel Toner Pads 60Pads", 8.22, 6],
  ["8809891184552", "BIODANCE", "Cera-nol Gel Toner Pads 60Pads", 8.22, 3],
  ["8809700320812", "celimax", "THE -A Retinol Shot Tightening Booster 15ml", 7.1, 3],
  ["8809598455566", "COSRX", "Advanced Snail 92 All in one Cream Tube 100g", 6.33, 3],
  ["8809598455795", "COSRX", "The Retinol 0.3 Cream 20ml", 9.33, 3],
  ["8809598455658", "COSRX", "The 6 Peptide Skin Booster Serum 150ml", 7.67, 3],
  ["8806109108133", "Centellian24", "Madeca Mela Capture Ampoule Max 30ml V2", 9.67, 6],
  ["8809447255071", "Dr.Althea", "Pure Grinding Cleansing Balm 50ml", 6.46, 6],
  ["8809447256221", "Dr.Althea", "345 Relief Cream 50ml", 10.08, 6],
  ["8809525936274", "IM From", "Rice Toner 150ml", 7.73, 3],
  ["8809782555508", "Beauty of Joseon", "Relief Sun : Rice + Probiotics 50ml", 7.13, 5],
  ["8800256118984", "Medicube", "Collagen Night Wrapping Mask 75ml", 10.13, 3],
  ["8800289474873", "Medicube", "PDRN Pink Collagen Gel Mask 4ea", 7.9, 3],
  ["8800289474989", "Medicube", "PDRN Pink Peptide Serum 30ml", 8.49, 3],
  ["8800366242333", "Medicube", "PDRN Pink Collagen Capsule Cream 55g", 11.93, 3],
  ["8809730952212", "ma:nyo", "Pure & Deep Cleansing Foam 100ml", 4.77, 3],
  ["8809082392292", "ma:nyo", "Pure Cleansing Oil 200ml", 10.53, 3],
  ["8809563100385", "PURITO SEOUL", "Hydro Wave Deep Sea Cream 50ml", 9.74, 3],
  ["8809563100316", "PURITO SEOUL", "Wonder Releaf Centella Serum Unscented 60ml", 8.52, 3],
  ["8809563100804", "PURITO SEOUL", "(Mini) Wonder Releaf Centella Serum Unscented 15ml", 2.47, 10],
  ["8809563103430", "PURITO SEOUL", "Mighty Bamboo Panthenol Cream 100ml", 8.07, 3],
  ["8809563103089", "PURITO SEOUL", "(Mini) Wonder Releaf Centella Daily Sun Lotion 15ml", 2.47, 10],
  ["8809738608364", "Round Lab", "1025 Dokdo Cleanser 150ml", 5.24, 3],
  ["8809738600245", "Round Lab", "1025 Dokdo Cream 80ml", 10.76, 4],
  ["8809657114748", "Round Lab", "1025 Dokdo Toner 500ml", 10.11, 4],
  ["8800344076448", "Sungboon Editor", "(Sachet) Green Tomato NMN Minimizing Ampoule 2ml", 0.11, 80],
  ["8800344074222", "Sungboon Editor", "(Sachet) Silk Peptide EGF Intensive Ampoule 2ml", 0.11, 80],
  ["8809559624031", "VT COSMETICS", "VT Spot Patch 48ea", 2.36, 10],
  ["8809695678363", "VT COSMETICS", "VT Reedle Shot 100", 11.51, 3],
  ["8809695678431", "VT COSMETICS", "VT Reedle Shot 300", 15.46, 3],
  ["8803463012816", "VT COSMETICS", "PDRN Capsule Cream 100 50ml", 9.95, 2],
];

const insertProduct = db.prepare(
  `INSERT INTO products (id, brand, name, cost, stock, min_stock, created_at)
   VALUES (?, ?, ?, ?, 0, 2, ?)`
);
const insertInbound = db.prepare(
  "INSERT INTO inbounds (ref, supplier, date, note, created_at) VALUES (?, ?, ?, ?, ?)"
);
const insertInboundItem = db.prepare(
  "INSERT INTO inbound_items (inbound_id, product_id, qty) VALUES (?, ?, ?)"
);

/** 빈 데이터베이스일 때만 1차 발주분을 채워 넣는다. */
export function seedIfEmpty() {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM products").get();
  if (n > 0) return false;

  transact(() => {
    const ts = now();
    for (const [id, brand, name, cost] of PI00786492) {
      insertProduct.run(id, brand, name, cost, ts);
    }
    const { lastInsertRowid: inboundId } = insertInbound.run(
      "PI00786492",
      "실리콘투 (SKO Sp. z o.o.)",
      "2026-08-13",
      "1차 주문 · C&F · 총 314개 / EUR 1,244.20 (배송비 72.15 포함)",
      ts
    );
    for (const [id, , , , qty] of PI00786492) {
      insertInboundItem.run(inboundId, id, qty);
      moveStock({ productId: id, delta: qty, reason: "inbound", ref: "PI00786492", actor: "brand" });
    }
    const units = PI00786492.reduce((a, r) => a + r[4], 0);
    logActivity("brand", `입고 PI00786492 · ${PI00786492.length}개 품목 ${units}개 등록`);
    bumpVersion();
  });
  return true;
}
