import { useEffect, useRef } from 'react';
import { UNKNOWN_CREATE_MESSAGE } from './staff-create-errors';
import { StaffNoticeBox } from './staff-notice-box';
import type { CreatePhase } from './use-staff-create';

// Ba màn kết quả thay thân hộp "Tạo tài khoản nhân sự" (admin F8 PR2; PLAN NS b8, 5.9). KHÔNG BAO GIỜ hiện liên kết kích hoạt hay token: API không trả,
// và người dùng tự đặt mật khẩu qua email (NS-18). Chữ "Trạng thái: Chờ kích hoạt…" lấy từ bản Make; chữ cảnh báo thư lỗi lấy nguyên văn PLAN 5.9.

export const STATUS_NOTE =
  'Trạng thái: Chờ kích hoạt. Tài khoản chuyển sang Đang hoạt động sau khi người dùng đặt mật khẩu.';
export const MAIL_FAILED_MESSAGE =
  'Tài khoản đã tạo nhưng gửi email kích hoạt thất bại. Hãy gửi lại liên kết.';

const BUTTON =
  'min-h-[35px] rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium text-text-primary';
// Nền nút `brand-strong` (chữ trắng trên `brand` chỉ đạt 3,62:1: styles/index.css)
const PRIMARY =
  'min-h-[35px] rounded-xl bg-brand-strong px-4 py-2 text-sm font-medium text-white';

type ResultPhase = Exclude<CreatePhase, { kind: 'form' }>;

interface StaffCreateResultProps {
  phase: ResultPhase;
  onViewDetail: (taiKhoanId: string) => void;
  onCreateAnother: () => void;
  onCheckList: () => void;
  onClose: () => void;
}

export function StaffCreateResult({
  phase,
  onViewDetail,
  onCreateAnother,
  onCheckList,
  onClose,
}: StaffCreateResultProps) {
  // Nút "Tạo tài khoản" đã gỡ khỏi trang nên focus rơi về BODY; đưa focus vào khối kết quả để người đọc màn hình nghe thông báo
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);

  if (phase.kind === 'unclear')
    return (
      <div ref={ref} tabIndex={-1} className="flex flex-col gap-3">
        <StaffNoticeBox
          notice={{ kind: 'warning', text: UNKNOWN_CREATE_MESSAGE }}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={PRIMARY} onClick={onCheckList}>
            Kiểm tra danh sách
          </button>
          <button type="button" className={BUTTON} onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    );

  const mailFailed = phase.outcome === 'mailFailed';
  return (
    <div ref={ref} tabIndex={-1} className="flex flex-col gap-3">
      <StaffNoticeBox
        notice={
          mailFailed
            ? { kind: 'warning', text: MAIL_FAILED_MESSAGE }
            : {
                kind: 'success',
                text: `Tạo tài khoản thành công. Đã gửi email kích hoạt tới ${phase.email}.`,
              }
        }
      />
      {!mailFailed && (
        <p className="rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm text-text-secondary">
          {STATUS_NOTE}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className={PRIMARY}
          onClick={() => onViewDetail(phase.taiKhoanId)}
        >
          {mailFailed ? 'Xem chi tiết và gửi lại' : 'Xem chi tiết'}
        </button>
        <button type="button" className={BUTTON} onClick={onCreateAnother}>
          Tạo tài khoản khác
        </button>
        <button type="button" className={BUTTON} onClick={onClose}>
          Đóng
        </button>
      </div>
    </div>
  );
}
