import { BOOKING_SLOT_PARAM } from '../../../shared/routes/booking-paths';

// `khungGioId` là id BIGINT dương, dạng CHUỖI, đúng luật `isBigintId` của backend (apps/api/.../lists/list-query.rules.ts): không số 0 đứng đầu,
// tối đa 19 chữ số và không vượt giá trị lớn nhất của BIGINT có dấu. Không ép sang `Number`: id lớn hơn 2^53 sẽ trỏ nhầm khung giờ khác.
const SLOT_ID_PATTERN = /^[1-9]\d{0,18}$/;
const BIGINT_MAX = '9223372036854775807';

export function isSlotId(value: string): boolean {
  return (
    SLOT_ID_PATTERN.test(value) &&
    (value.length < BIGINT_MAX.length || value <= BIGINT_MAX)
  );
}

// Đúng MỘT khoá `khungGioId` và hợp lệ; thiếu, rỗng, sai dạng hoặc lặp khoá ⇒ null (không đoán lấy giá trị nào)
export function readSlotId(params: URLSearchParams): string | null {
  const values = params.getAll(BOOKING_SLOT_PARAM);
  return values.length === 1 && isSlotId(values[0]) ? values[0] : null;
}
