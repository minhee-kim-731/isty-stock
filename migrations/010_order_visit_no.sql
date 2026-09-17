-- 이 고객의 Lococo 이용 횟수. 주문 등록할 때 직접 입력한다 (별도 고객 DB가 없어서 자동 계산은 안 함).
-- 출고 인쇄물에 "Compra Nº N con Lococo" 로 표시된다.
ALTER TABLE orders ADD COLUMN visit_no INTEGER;
