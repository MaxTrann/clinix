import { useCallback, useRef, useState } from 'react';
import { describeActionFailure, isNotFoundError } from './account-errors';

// Chạy MỘT hành động ghi lên tài khoản (khoá, mở khoá, mở khoá no-show; admin F9, dùng lại ở F8). Quy tắc chung:
// - Chỉ một lần gửi tại một thời điểm: `useRef` chặn lần bấm thứ hai TRƯỚC khi React kịp vẽ lại nút đã tắt (hai sự kiện trong cùng một khung hình).
// - Không tự thử lại và không đổi trạng thái cục bộ. Sau MỌI kết cục (thành công, 409, 404, mạng, hết hạn, 500) gọi `onSettled`, để nơi gọi tải lại
//   chi tiết và danh sách từ API: trạng thái hiển thị luôn là trạng thái thật, kể cả khi chưa rõ thao tác đã chạy hay chưa.
// - Không `console.*`: họ tên, email của người dùng không được đi ra log.

export type ActionNotice = { kind: 'success' | 'error'; text: string };

interface UseAccountActionOptions {
  /** `notFound` = tài khoản không còn (404): nơi gọi đóng chi tiết thay vì tải lại. */
  onSettled: (outcome: { notFound: boolean }) => void;
}

export function useAccountAction({ onSettled }: UseAccountActionOptions) {
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const inFlight = useRef(false);

  const run = useCallback(
    async (action: () => Promise<void>, successText: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setPending(true);
      setNotice(null);
      let notFound = false;
      try {
        await action();
        setNotice({ kind: 'success', text: successText });
      } catch (error) {
        notFound = isNotFoundError(error);
        setNotice({ kind: 'error', text: describeActionFailure(error) });
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
