import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { BOOKING_ERROR_CODES } from '../../../api/booking-errors';

// Thông báo MỘT LẦN giữa các trang của đổi lịch (reschedule F2; WDH-41, WDH-43). Đi qua `location.state` của router (không URL, không storage): trang đích đọc ở lần gắn đầu, giữ ở state của
// trang, rồi `navigate(cùng URL, { replace: true, state: null })` nên TẢI LẠI không hiện lại. Giá trị đọc theo danh sách trắng: khoá lạ hay giá trị lạ ⇒ bỏ qua, không bao giờ in ra màn hình.
//   DaDoi        đổi xong, đang ở chi tiết lịch MỚI
//   DaGuiYeuCau  gửi yêu cầu xong, đang ở chi tiết lịch CŨ (banner thường trực nằm cạnh)
//   mã khung giờ khung giờ vừa chọn không còn chọn được, đang ở trang chọn khung giờ (lưới đã tải lại)
const SLOT_NOTICE_CODES = [
  BOOKING_ERROR_CODES.SLOT_TAKEN,
  BOOKING_ERROR_CODES.SLOT_HELD,
  BOOKING_ERROR_CODES.SLOT_PAST,
  BOOKING_ERROR_CODES.SLOT_NOT_FOUND,
] as const;

export type SlotNotice = (typeof SLOT_NOTICE_CODES)[number];
// Trang chọn khung giờ chỉ nhận loại thông báo này
export const SLOT_NOTICES: readonly SlotNotice[] = SLOT_NOTICE_CODES;
export type RescheduleNotice = 'DaDoi' | 'DaGuiYeuCau' | SlotNotice;

const ALLOWED: readonly string[] = [
  'DaDoi',
  'DaGuiYeuCau',
  ...SLOT_NOTICE_CODES,
];
const STATE_KEY = 'rescheduleNotice';

export function noticeState(notice: RescheduleNotice) {
  return { [STATE_KEY]: notice };
}

// Mã khung giờ ⇒ thông báo của trang chọn; mã khác ⇒ null
export function slotNoticeFor(maLoi: string): SlotNotice | null {
  return SLOT_NOTICE_CODES.find((code) => code === maLoi) ?? null;
}

// Đọc nghiêm một `location.state` bất kỳ: chỉ nhận đối tượng có ĐÚNG khoá của mình là một chuỗi trong danh sách trắng
export function readNotice(state: unknown): RescheduleNotice | null {
  if (typeof state !== 'object' || state === null) return null;
  const value = (state as Record<string, unknown>)[STATE_KEY];
  if (typeof value !== 'string' || !ALLOWED.includes(value)) return null;
  return value as RescheduleNotice;
}

/**
 * Thông báo cho trang này (một trong `accept`), đọc MỘT lần ở lần gắn đầu. Có `state` của đổi lịch (dù trang không nhận loại đó) thì xoá nó khỏi lịch sử bằng `replace`, nên tải lại hay quay về
 * bằng nút Back không hiện lại.
 */
export function useOneShotNotice(
  accept: readonly RescheduleNotice[],
): RescheduleNotice | null {
  const location = useLocation();
  const navigate = useNavigate();
  const [notice] = useState(() => {
    const read = readNotice(location.state);
    return read !== null && accept.includes(read) ? read : null;
  });
  const pending = readNotice(location.state) !== null;
  const { pathname, search } = location;

  useEffect(() => {
    if (!pending) return;
    void navigate({ pathname, search }, { replace: true, state: null });
  }, [pending, pathname, search, navigate]);

  return notice;
}
