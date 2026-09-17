-- 포장 완료와는 별개로, 택배 기사가 실제로 픽업해 간 시각을 남긴다.
ALTER TABLE orders ADD COLUMN picked_up_at TEXT;
