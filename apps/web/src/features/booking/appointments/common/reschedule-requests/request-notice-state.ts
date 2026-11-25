import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

// Thông báo MỘT LẦN từ trang chi tiết về danh sách sau khi duyệt hay từ chối xong (reschedule F4 Pha B1; nếp `reschedule-notice-state.ts` của F2, viết riêng vì file đó có danh sách trắng cố định và F3 đang chuyển nó
// lên `common/`). Đi qua `location.state` của router (không URL, không storage): trang danh sách đọc ở lần gắn đầu, giữ ở state của trang, rồi `navigate(cùng URL, { replace: true, state: null })` nên TẢI LẠI không hiện
// lại. Giá trị đọc theo danh sách trắng: khoá lạ hay giá trị lạ ⇒ bỏ qua, KHÔNG BAO GIỜ in chữ của máy chủ hay của `state` ra màn hình (chữ hiển thị cố định ở `request-handle-text.ts`).
export type RequestNotice = 'DaDuyet' | 'TuChoi';

const ALLOWED: readonly string[] = ['DaDuyet', 'TuChoi'];
const STATE_KEY = 'rescheduleRequestNotice';

export function noticeState(notice: RequestNotice) {
  return { [STATE_KEY]: notice };
}

// Đọc nghiêm một `location.state` bất kỳ: chỉ nhận đối tượng có ĐÚNG khoá của mình là một chuỗi trong danh sách trắng
export function readRequestNotice(state: unknown): RequestNotice | null {
  if (typeof state !== 'object' || state === null) return null;
  const value = (state as Record<string, unknown>)[STATE_KEY];
  if (typeof value !== 'string' || !ALLOWED.includes(value)) return null;
  return value as RequestNotice;
}

// Thông báo cho trang này, đọc MỘT lần ở lần gắn đầu. Có `state` của F4 (dù giá trị lạ) thì xoá nó khỏi lịch sử bằng `replace`, nên tải lại hay quay về bằng nút Back không hiện lại.
export function useRequestNotice(): RequestNotice | null {
  const location = useLocation();
  const navigate = useNavigate();
  const [notice] = useState(() => readRequestNotice(location.state));
  const pending = readRequestNotice(location.state) !== null;
  const { pathname, search } = location;

  useEffect(() => {
    if (!pending) return;
    void navigate({ pathname, search }, { replace: true, state: null });
  }, [pending, pathname, search, navigate]);

  return notice;
}
