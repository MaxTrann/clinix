import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { PRIMARY_LINK, SuccessPanel } from '../auth-form-parts';
import { LOGIN_PATH, REGISTER_PATH } from '../roles';
import {
  REREGISTER_DONE_MESSAGE,
  SUSPENDED_DONE_MESSAGE,
} from './forgot-errors';
import type { DoneFlags } from './forgot-state';

const NOTICE_BOX =
  'mb-6 rounded-xl border border-warning-line bg-warning-soft p-3 text-left text-sm text-warning';

// Khung Hoàn tất (frame `652:2`), ba trường hợp theo hai cờ của A12. Hai cờ không thể cùng true; nếu có thì "ngưng" thắng.
// Hai trường hợp có câu cảnh báo KHÔNG hiện "Bạn có thể đăng nhập với mật khẩu mới." vì câu đó mâu thuẫn với cảnh báo.
export function DonePanel({
  email,
  taiKhoanNgung,
  canDangKyLai,
}: { email: string } & DoneFlags) {
  if (taiKhoanNgung) {
    // D11: không có nút "Đăng nhập" vì tài khoản ngưng vẫn không đăng nhập được (QM-19)
    return (
      <SuccessPanel heading="Mật khẩu đã được đặt lại!">
        <p role="status" className={NOTICE_BOX}>
          {SUSPENDED_DONE_MESSAGE}
        </p>
        <Link
          to={LOGIN_PATH}
          state={{ email }}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Quay về đăng nhập
        </Link>
      </SuccessPanel>
    );
  }
  if (canDangKyLai) {
    // N3: tài khoản chưa xác minh phải đăng ký lại bằng email này để nhận mã mới (QM-17)
    return (
      <SuccessPanel heading="Mật khẩu đã được đặt lại!">
        <p role="status" className={NOTICE_BOX}>
          {REREGISTER_DONE_MESSAGE}
        </p>
        <Link to={REGISTER_PATH} state={{ email }} className={PRIMARY_LINK}>
          Đăng ký lại
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </SuccessPanel>
    );
  }
  return (
    <SuccessPanel heading="Mật khẩu đã được đặt lại!">
      <p className="mb-6 text-sm text-gray-500">
        Bạn có thể đăng nhập với mật khẩu mới.
      </p>
      <Link to={LOGIN_PATH} state={{ email }} className={PRIMARY_LINK}>
        Đăng nhập
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </SuccessPanel>
  );
}
