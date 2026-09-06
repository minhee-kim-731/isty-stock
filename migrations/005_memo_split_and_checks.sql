-- 메모를 두 갈래로 나눈다.
--   products.memo       : 실장님이 쓰는 메모 — 브랜드·창고 모두에게 보인다 (기존 컬럼 그대로 사용)
--   products.memo_brand : 민희님만 쓰고 민희님만 보는 메모
ALTER TABLE products ADD COLUMN memo_brand TEXT NOT NULL DEFAULT '';

-- 재고 개수 점검 기록. 양쪽에 똑같이 보인다.
CREATE TABLE IF NOT EXISTS stock_checks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  inbound_id INTEGER REFERENCES inbounds(id),  -- 몇 차 발주분을 점검했는지
  batch      TEXT NOT NULL DEFAULT '',         -- 표시용 라벨 (예: "1차 발주 · PI00786492")
  checker    TEXT NOT NULL,                    -- 'Lococo' | 'ISTY'
  memo       TEXT NOT NULL DEFAULT '',
  actor      TEXT NOT NULL DEFAULT '',         -- 실제 로그인 역할 (brand | warehouse)
  created_at TEXT NOT NULL
);
