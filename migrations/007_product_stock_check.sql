-- 개수 점검을 제품 단위로도 남길 수 있게 제품 참조를 추가한다. NULL 이면 기존처럼 전체(발주 단위) 점검.
ALTER TABLE stock_checks ADD COLUMN product_id TEXT REFERENCES products(id);
