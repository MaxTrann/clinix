import { useCallback, useRef, useState } from 'react';
import { isNotFoundError } from '../account-common/account-errors';
import type { StaffNotice } from './staff-types';

// Chạy MỘT hành động ghi lên tài khoản nhân sự (khoá, mở khoá, gửi lại; admin F8). Cùng quy tắc với `useAccountAction` của F9, thêm hai điều F8 cần:
// kết quả có thể là CẢNH BÁO (gửi lại mà thư lỗi: việc đã chạy nhưng không như mong đợi) và chữ lỗi chọn theo từng hành động.
// - Chỉ một lần gửi tại một thời điểm: `useRef` chặn lần bấm thứ hai TRƯỚC khi React kịp vẽ lại nút đã tắt (hai sự kiện trong cùng một khung hình).
// - Không tự thử lại và không đổi trạng thái cục bộ. Sau MỌI kết cục (thành công, 409, 404, mạng, hết hạn, 500) gọi `onSettled`, để nơi gọi tải lại
//   chi tiết và danh sách từ API: trạng thái hiển thị luôn là trạng thái thật, kể cả khi chưa rõ thao tác đã chạy hay chưa.
// - Không `console.*`: họ tên, email của người dùng không được đi ra log.

interface UseStaffActionOptions {
  /** `notFound` = tài khoản không còn (404): nơi gọi đóng chi tiết thay vì tải lại. */
  onSettled: (outcome: { notFound: boolean }) => void;
}

export function useStaffAction({ onSettled }: UseStaffActionOptions) {
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<StaffNotice | null>(null);
  const inFlight = useRef(false);

  const run = useCallback(
    async (
      action: () => Promise<StaffNotice>,
      describeError: (error: unknown) => string,
    ) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setPending(true);
      setNotice(null);
      let notFound = false;
      try {
        setNotice(await action());
      } catch (error) {
        notFound = isNotFoundError(error);
        setNotice({ kind: 'error', text: describeError(error) });
      } finally {
        inFlight.current = false;
        setPending(false);
        onSettled({ notFound });
      }
    },
    [onSettled],
  );

  const clearNotice = useCallback(() => setNotice(null), []);

  return { pending, notice, run, clearNotice };
}
