-- 「Lococo 가격 산정」 시트 P열(최종 판매가, IVA 포함)을 재고 데스크에 반영한다.
-- 창고 제품(바코드)과 시트 SKU 는 도매가+제품명으로 1:1 매칭했다.
-- 적용: npx wrangler d1 execute isty --remote --file=migrations/003_seed_sell_price.sql
-- 시트가 바뀌면 이 파일을 다시 만들어 실행하면 된다 (UPDATE 라 몇 번 돌려도 같다).

UPDATE products SET sell_price = 17.90 WHERE id = '8809640735820';  -- Xnia ANUA Niacinamide 10% + TXA 4% Serum 30ml
UPDATE products SET sell_price = 23.90 WHERE id = '8809640738616';  -- C004 ANUA PDRN Hyaluronic Acid Capsule 100 Serum
UPDATE products SET sell_price = 20.90 WHERE id = '8800307373393';  -- E001 ANUA PDRN Hyaluronic Acid Hydrating Capsule
UPDATE products SET sell_price = 15.90 WHERE id = '8809562190738';  -- E022 ARENCIA Fresh Green Rice Mochi Cleanser 120g
UPDATE products SET sell_price = 14.90 WHERE id = '8809562192763';  -- E021 ARENCIA Retinal Booster Shot 30ml
UPDATE products SET sell_price = 22.90 WHERE id = '8809891184552';  -- A003 BIODANCE Cera-nol Gel Toner Pads 60Pads
UPDATE products SET sell_price = 22.90 WHERE id = '8809891184545';  -- A002 BIODANCE Collagen Gel Toner Pads 60Pads
UPDATE products SET sell_price = 22.90 WHERE id = '8809891185276';  -- C010 BIODANCE Sea Kelp Gel Toner Pad (60ea)
UPDATE products SET sell_price = 14.90 WHERE id = '8809782555508';  -- E023 Beauty of Joseon Relief Sun : Rice + Probiotics 50ml
UPDATE products SET sell_price = 18.90 WHERE id = '8809598455566';  -- Xcos2 COSRX Advanced Snail 92 All in one Cream Tub
UPDATE products SET sell_price = 17.90 WHERE id = '8809598455658';  -- Xcos1 COSRX The 6 Peptide Skin Booster Serum 150ml
UPDATE products SET sell_price = 24.90 WHERE id = '8809598455795';  -- E006 COSRX The Retinol 0.3 Cream 20ml
UPDATE products SET sell_price = 18.90 WHERE id = '8806109108133';  -- E025 Centellian24 Madeca Mela Capture Ampoule Max 30ml V
UPDATE products SET sell_price = 19.90 WHERE id = '8809447256221';  -- A006 Dr.Althea 345 Relief Cream 50ml
UPDATE products SET sell_price = 15.90 WHERE id = '8809447255071';  -- A010 Dr.Althea Pure Grinding Cleansing Balm 50ml
UPDATE products SET sell_price = 15.90 WHERE id = '8809525936274';  -- B030 IM From Rice Toner 150ml
UPDATE products SET sell_price = 19.90 WHERE id = '8800256118984';  -- A019 Medicube Collagen Night Wrapping Mask 75ml
UPDATE products SET sell_price = 21.90 WHERE id = '8800366242333';  -- A018 Medicube PDRN Pink Collagen Capsule Cream 55g
UPDATE products SET sell_price = 17.90 WHERE id = '8800289474989';  -- A020 Medicube PDRN Pink Peptide Serum 30ml
UPDATE products SET sell_price = 14.90 WHERE id = '8809563100385';  -- B046 PURITO SEOUL Hydro Wave Deep Sea Cream 50ml
UPDATE products SET sell_price = 12.90 WHERE id = '8809563103430';  -- A024 PURITO SEOUL Mighty Bamboo Panthenol Cream 100ml
UPDATE products SET sell_price = 17.90 WHERE id = '8809563100316';  -- B044 PURITO SEOUL Wonder Releaf Centella Serum Unscented
UPDATE products SET sell_price = 11.90 WHERE id = '8809738608364';  -- A028 Round Lab 1025 Dokdo Cleanser 150ml
UPDATE products SET sell_price = 20.90 WHERE id = '8809738600245';  -- C024 Round Lab 1025 Dokdo Cream 80ml
UPDATE products SET sell_price = 21.90 WHERE id = '8809657114748';  -- B054 Round Lab 1025 Dokdo Toner 500ml
UPDATE products SET sell_price = 20.90 WHERE id = '8803463012816';  -- Xvt VT COSMETICS PDRN Capsule Cream 100 50ml
UPDATE products SET sell_price = 21.90 WHERE id = '8809695678363';  -- E019 VT COSMETICS VT Reedle Shot 100
UPDATE products SET sell_price = 24.90 WHERE id = '8809695678431';  -- E020 VT COSMETICS VT Reedle Shot 300
UPDATE products SET sell_price = 18.90 WHERE id = '8809700320812';  -- A004 celimax THE -A Retinol Shot Tightening Booster
UPDATE products SET sell_price = 18.90 WHERE id = '8809730952212';  -- D026 ma:nyo Pure & Deep Cleansing Foam 100ml
UPDATE products SET sell_price = 16.90 WHERE id = '8809082392292';  -- A017 ma:nyo Pure Cleansing Oil 200ml

-- 아래는 일부러 비워 둔다:
--   8809937361657 BIODANCE Bio-Collagen Real Deep Mask 1Box (3 (C006) — 낱장/박스 단위 불일치
--   8809937361664 BIODANCE Hydro Cera-nol Real Deep Mask 1Box  (C007) — 낱장/박스 단위 불일치
--   8800289474873 Medicube PDRN Pink Collagen Gel Mask 4ea (C021) — 낱장/박스 단위 불일치
--   8809563103089 PURITO SEOUL (Mini) Wonder Releaf Centella D (E028) — 시트에 최종 판매가 없음
--   8809563100804 PURITO SEOUL (Mini) Wonder Releaf Centella S (E026) — 시트에 최종 판매가 없음
--   8800344076448 Sungboon Editor (Sachet) Green Tomato NMN Mi (Xsb1) — 시트에 최종 판매가 없음
--   8800344074222 Sungboon Editor (Sachet) Silk Peptide EGF In (Xsb2) — 시트에 최종 판매가 없음
--   8809559624031 VT COSMETICS VT Spot Patch 48ea (E027) — 시트에 최종 판매가 없음
