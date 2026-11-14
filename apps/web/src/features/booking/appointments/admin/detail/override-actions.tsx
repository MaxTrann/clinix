import { useId } from 'react';
import type { OperationsAppointmentDetail } from '../../common/operations-appointment';
import type { OverrideTarget } from '../api/admin-appointment-types';
import { DETAIL_TEXT, OVERRIDE_TEXT } from './detail-messages';

// Nhóm nút override trong thẻ `Thao tác` của trang chi tiết (booking F10; QT-03). Hiện nút nào CHỈ KHI đích có trong `chuyenDuoc[]` của chi tiết (backend tính bằng
// `allowedTargets('QuanTriVien', …)`, B4-D). Web KHÔNG có ma trận thứ hai: không có chỗ nào ở đây so trạng thái với đích. Mã ngoài bốn đích (`HoanThanh`, `ChoThanhToan`, `DaDoiLich`…) bị bỏ
// qua; mảng rỗng ⇒ không có thẻ. Thứ tự cố định: `Đã tiếp đón` trước `Đã xác nhận` (bệnh nhân đã đến thì chọn tiếp đón: TECH_DEBT 120). Handler nhận chính phần tử nút đã bấm để hộp trả
// tiêu điểm về đúng nút (Safari không focus nút khi bấm nên không dựa vào `document.activeElement`).
const TARGET_ORDER: readonly OverrideTarget[] = [
  'DaTiepDon',
  'DaXacNhan',
  'VangMat',
  'DaHuy',
];

// Màu theo token (ADR 0004), không chép màu Figma lệch tương phản: `Đã tiếp đón` nền `brand-strong` chữ trắng 5,28:1; `Vắng mặt` chữ `warning`; `Hủy lịch` chữ `danger-strong` 6,42:1.
const BUTTON_STYLES: Record<OverrideTarget, string> = {
  DaTiepDon: 'bg-brand-strong text-white hover:bg-cyan-800',
  DaXacNhan: 'border border-gray-500 bg-white text-gray-700 hover:bg-gray-50',
  VangMat: 'border border-warning bg-white text-warning hover:bg-warning-soft',
  DaHuy:
    'border border-danger bg-white text-danger-strong hover:bg-danger-soft',
};

const BUTTON =
  'inline-flex min-h-[2.4rem] w-full items-center justify-center rounded-xl px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60';

export function OverrideActions(props: {
  detail: OperationsAppointmentDetail;
  // Vô hiệu cả nhóm khi đang gửi hay chi tiết đang tải lại (chi tiết giữ bản cũ lúc tải lại, nên nút cũ vẫn hiện)
  busy: boolean;
  onOpen: (target: OverrideTarget, trigger: HTMLButtonElement) => void;
}) {
  const headingId = useId();
  const targets = TARGET_ORDER.filter((target) =>
    props.detail.chuyenDuoc.includes(target),
  );
  if (targets.length === 0) return null;
  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-2xl border border-gray-200 bg-white"
    >
      <h2
        id={headingId}
        className="border-b border-gray-100 px-5 py-3.5 text-sm font-semibold text-gray-900"
      >
        {DETAIL_TEXT.sections.actions}
      </h2>
      <div className="px-5 py-4">
        <p className="pb-2 text-xs text-gray-600">{OVERRIDE_TEXT.hint}</p>
        <div role="group" aria-labelledby={headingId} className="space-y-2">
          {targets.map((target) => (
            <button
              key={target}
              type="button"
              aria-haspopup="dialog"
              disabled={props.busy}
              onClick={(event) => props.onOpen(target, event.currentTarget)}
              className={`${BUTTON} ${BUTTON_STYLES[target]}`}
            >
              {OVERRIDE_TEXT.buttons[target]}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
