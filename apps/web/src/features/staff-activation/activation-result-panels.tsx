import { ArrowRight, CircleAlert } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { LOGIN_PATH, PRIMARY_LINK, SuccessPanel } from '../auth';
import {
  INVALID_LINK_MESSAGE,
  INVALID_LINK_TITLE,
  RELOAD_HINT,
} from './activation-errors';

// Hai màn kết quả của trang kích hoạt. Khi hiện ra, focus nhảy vào khung để trình đọc màn hình đọc kết quả (form vừa biến mất nên
// focus cũ không còn). Không đặt lớp outline riêng: viền focus do kiểu chung của hệ thống lo (focus-hygiene FG-05).
function useFocusOnMount() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}

// "Liên kết không hợp lệ" (A5): CÙNG một màn, cùng chữ cho mọi lý do (sai, hết hạn, đã dùng, bị thay, chưa gửi được, tài khoản không còn
// chờ kích hoạt, và cả khi tải lại trang làm mất fragment). Không có thứ gì phụ thuộc vào lý do.
export function InvalidLinkPanel() {
  const ref = useFocusOnMount();
  return (
    <div ref={ref} tabIndex={-1} className="py-4 text-center">
      <span className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-danger-soft">
        <CircleAlert className="size-8 text-danger" aria-hidden="true" />
      </span>
      <h2 className="mb-2 font-medium text-gray-700">{INVALID_LINK_TITLE}</h2>
      <p className="mb-2 text-sm text-gray-500">{INVALID_LINK_MESSAGE}</p>
      <p className="mb-6 text-sm text-gray-500">{RELOAD_HINT}</p>
      <Link to={LOGIN_PATH} className={PRIMARY_LINK}>
        Đến trang đăng nhập
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

// "Kích hoạt thành công" (b12): chuyển sang màn Đăng nhập bằng một nút. KHÔNG tự đăng nhập (PLAN 5.5, B16).
export function ActivatedPanel() {
  const ref = useFocusOnMount();
  return (
    <div ref={ref} tabIndex={-1}>
      <SuccessPanel heading="Kích hoạt thành công!">
        <p className="mb-6 text-sm text-gray-500">
          Bạn có thể đăng nhập với mật khẩu vừa đặt.
        </p>
        <Link to={LOGIN_PATH} className={PRIMARY_LINK}>
          Đăng nhập
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </SuccessPanel>
    </div>
  );
}
