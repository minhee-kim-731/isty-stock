-- 제품에 판매가를 붙인다. 창고에 쌓인 재고가 얼마짜리인지(원가 말고 매출 기준)
-- 보기 위해서다. ALTER 는 두 번 실행하면 실패하므로 한 번만 돌린다.
-- 적용: npx wrangler d1 execute isty --remote --file=migrations/002_sell_price.sql
ALTER TABLE products ADD COLUMN sell_price REAL NOT NULL DEFAULT 0;
