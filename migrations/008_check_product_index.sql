-- 제품별 "가장 최근 점검" 조회(readState)가 매번 도는 조회라 인덱스를 붙여둔다.
CREATE INDEX IF NOT EXISTS idx_checks_product ON stock_checks(product_id);
