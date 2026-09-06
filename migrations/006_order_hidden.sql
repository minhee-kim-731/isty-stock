-- 주문을 지우지 않고 화면에서만 감춘다.
-- 기록은 서버에 그대로 남고, 목록·통계·재고 계산에서만 빠진다.
ALTER TABLE orders ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
