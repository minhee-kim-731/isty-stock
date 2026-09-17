-- 포장재(상자) 재고 추적. products/stock_moves 와 같은 패턴을 그대로 따른다.
CREATE TABLE IF NOT EXISTS packing_materials (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  size       TEXT NOT NULL,
  stock      INTEGER NOT NULL DEFAULT 0,
  archived   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS packing_moves (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  packing_id INTEGER NOT NULL REFERENCES packing_materials(id),
  delta      INTEGER NOT NULL,
  reason     TEXT    NOT NULL,
  ref        TEXT    NOT NULL DEFAULT '',
  actor      TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_packing_moves_pm ON packing_moves(packing_id);

-- 포장 완료 시 어느 상자를 썼는지 남긴다.
ALTER TABLE orders ADD COLUMN box_id INTEGER REFERENCES packing_materials(id);

-- 지금 있는 상자는 25×20×15 한 종류, 실제 보유 수량 50개 (2026-09-07 기준).
INSERT OR IGNORE INTO packing_materials (id, size, stock, created_at)
  VALUES (1, '25×20×15', 50, '2026-09-07T00:00:00.000Z');
