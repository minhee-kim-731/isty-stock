-- 메모를 언제 남겼는지 보이도록 날짜 칸을 더한다. 메모를 지우면 날짜도 비운다.
ALTER TABLE products ADD COLUMN memo_at TEXT;        -- 실장님 메모를 마지막으로 쓴 시각
ALTER TABLE products ADD COLUMN memo_brand_at TEXT;  -- 민희님 전용 메모를 마지막으로 쓴 시각

-- (D1 은 LIKE 패턴 길이를 제한해서, 제품명이 길면 LIKE 대신 앞부분 비교로 찾는다.)
-- 이미 달려 있는 실장님 메모는 활동 기록에서 가장 최근 "제품 메모 · 제품명 — ..." 시각을 찾아 채운다.
UPDATE products SET memo_at = (
  SELECT MAX(a.created_at) FROM activity a
   WHERE a.kind = 'stock_memo'
     AND substr(a.text, 1, length('제품 메모 · ' || products.name || ' — ')) = '제품 메모 · ' || products.name || ' — '
) WHERE memo != '';
UPDATE products SET memo_brand_at = (
  SELECT MAX(a.created_at) FROM activity a
   WHERE substr(a.text, 1, length('내 메모 · ' || products.name || ' — ')) = '내 메모 · ' || products.name || ' — '
) WHERE memo_brand != '';
