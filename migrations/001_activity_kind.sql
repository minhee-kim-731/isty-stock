-- 활동 기록에 종류를 붙인다. 브랜드에게 보낼 알림을 골라내기 위해서.
-- ALTER 는 두 번 실행하면 실패하므로 한 번만 돌린다.
ALTER TABLE activity ADD COLUMN kind TEXT NOT NULL DEFAULT '';
