-- 제품에 붙여두는 메모. 조정 사유(1회성 기록)와 달리 계속 붙어 있는 쪽지다.
-- ALTER 는 두 번 실행하면 실패하므로 한 번만 돌린다.
ALTER TABLE products ADD COLUMN memo TEXT NOT NULL DEFAULT '';
