import { UserCheck } from 'lucide-react';
import { isPositiveAmount } from '../../common/appointment-format';
import type { ReceptionAppointmentDetail } from '../api/reception-appointment-types';
import { DETAIL_TEXT } from './detail-messages';

// Nút hành động của Lễ tân trong ngăn chi tiết (booking F8; Figma `488:2`, `495:2`, `497:2`) và ĐIỂM CẮM CHO F9.
//
//  - Hiện nút nào CHỈ KHI đích có trong `chuyenDuoc[]` của chi tiết (backend tính bằng `allowedTargets('LeTan', …)`, đã gồm cửa sổ tiếp đón và còn phải thu). Web KHÔNG có ma
//    trận thứ hai: không có chỗ nào ở đây so trạng thái với đích. Mã khác ba đích dưới (ví dụ `HoanThanh`) bị bỏ qua.
//  - F8 chưa gọi route ghi nào (B12 chưa merge): `handlers` rỗng nên mọi nút VÔ HIỆU kèm chữ ẩn "(chưa được triển khai)". Nút nào có handler thì bật.
//  - F9 chỉ cần truyền `handlers` từ `reception-drawer.tsx` (hộp `Hủy lịch hẹn` `490:2`, hộp `Đánh dấu vắng mặt` `489:2`, và lời gọi `Tiếp đón bệnh nhân` kèm lỗi
//    `CON_PHAN_CHUA_THANH_TOAN`, `NGOAI_KHUNG_GIO_TIEP_DON`: LTN-04), rồi gọi `reload` và `onReloadList` sau thao tác thành công. Không phải sửa file này.
export type ReceptionTarget = 'DaTiepDon' | 'VangMat' | 'DaHuy';
export type ReceptionActionHandlers = Partial<
  Record<ReceptionTarget, () => void>
>;

// Thứ tự hiện của Figma: dòng đầu là tiếp đón, dòng sau là `Vắng mặt` và `Hủy lịch`
const TARGET_ORDER: readonly ReceptionTarget[] = [
  'DaTiepDon',
  'VangMat',
  'DaHuy',
];

// Màu theo token (ADR 0004), không chép màu Figma lệch tương phản: `Tiếp đón` nền `brand-strong` (chữ trắng 5,28:1, Figma `#0092b8` 3,62:1); `Vắng mặt` chữ `warning`
// (Figma `#e17100` 3,20:1); `Hủy lịch` chữ `danger-strong` 6,42:1 (Figma `#fb2c36` 3,81:1).
const ACTIONS: Record<ReceptionTarget, { label: string; className: string }> = {
  DaTiepDon: {
    label: 'Tiếp đón bệnh nhân',
    className: 'bg-brand-strong text-white hover:bg-cyan-800',
  },
  VangMat: {
    label: 'Vắng mặt',
    className:
      'border border-warning bg-white text-warning hover:bg-warning-soft',
  },
  DaHuy: {
    label: 'Hủy lịch',
    className:
      'border border-danger bg-white text-danger-strong hover:bg-danger-soft',
  },
};

const BUTTON =
  'inline-flex min-h-[2.4rem] w-full items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-white';

function ActionButton(props: {
  target: ReceptionTarget;
  onClick?: () => void;
}) {
  const { label, className } = ACTIONS[props.target];
  const enabled = props.onClick !== undefined;
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={props.onClick}
      className={`${BUTTON} ${className}`}
    >
      {label}
      {!enabled && (
        <span className="sr-only"> {DETAIL_TEXT.notImplementedHidden}</span>
      )}
    </button>
  );
}

// `Thu tiền & tiếp đón` (chữ Figma `488:2`) thuộc `payment`, chưa có: nút LUÔN vô hiệu kèm chữ HIỆN "Chưa được triển khai" (LTN-05). Hiện khi lịch `DaXacNhan` mà còn phải
// thu: kiểm trên CHUỖI decimal (`isPositiveAmount`, không `Number`). Đây là điều kiện hiển thị của MỘT nút chưa có hành động, không phải ma trận chuyển trạng thái.
function CollectButton() {
  return (
    <div>
      <button
        type="button"
        disabled
        className={`${BUTTON} border border-warning-line bg-warning-soft text-warning`}
      >
        <UserCheck aria-hidden="true" className="size-4" />
        Thu tiền &amp; tiếp đón
      </button>
      <p className="mt-1 text-center text-xs text-gray-600">
        {DETAIL_TEXT.notImplemented}
      </p>
    </div>
  );
}

export function ReceptionActions(props: {
  detail: ReceptionAppointmentDetail;
  handlers?: ReceptionActionHandlers;
}) {
  const { detail } = props;
  const handlers = props.handlers ?? {};
  const targets = TARGET_ORDER.filter((target) =>
    detail.chuyenDuoc.includes(target),
  );
  const showCollect =
    detail.trangThai === 'DaXacNhan' &&
    detail.conPhaiThu !== null &&
    isPositiveAmount(detail.conPhaiThu);
  const checkIn = targets.includes('DaTiepDon');
  const others = targets.filter((target) => target !== 'DaTiepDon');

  if (!showCollect && targets.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={DETAIL_TEXT.actionsGroup}
      className="mt-4 space-y-2"
    >
      {showCollect && <CollectButton />}
      {checkIn && (
        <ActionButton target="DaTiepDon" onClick={handlers.DaTiepDon} />
      )}
      {others.length > 0 && (
        <div className={`grid gap-2 ${others.length > 1 ? 'grid-cols-2' : ''}`}>
          {others.map((target) => (
            <ActionButton
              key={target}
              target={target}
              onClick={handlers[target]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
