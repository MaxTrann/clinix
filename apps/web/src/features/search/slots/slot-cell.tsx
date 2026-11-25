import { Check, Clock, Lock } from 'lucide-react';
import { Link } from 'react-router';
import { bookingInfoPath } from '../../../shared/routes/booking-paths';
import type { PublicSlot, SlotStatus } from '../api/slot-types';
import { timeLabel } from './slot-dates';
import { SLOT_STATUS_LABEL, slotAccessibleName } from './slot-text';
import { CELL_TONE } from './slot-tone';

// Ô khung giờ theo Figma 446:257 (màu theo trạng thái ở `slot-tone.ts`, dùng chung với chú giải).

export function StatusIcon({
  status,
  className,
}: {
  status: SlotStatus;
  className: string;
}) {
  if (status === 'ConTrong')
    return <Check className={className} aria-hidden="true" />;
  if (status === 'DangGiuCho')
    return <Clock className={className} aria-hidden="true" />;
  if (status === 'DaDat')
    return <Lock className={className} aria-hidden="true" />;
  return null;
}

const CELL =
  'flex min-h-[46px] flex-col items-center justify-center rounded-[13.375px] border px-1 py-1.5';

// Chỉ ô `ConTrong` là liên kết sang Bước 4 (T5: chưa giữ chỗ; khách chưa đăng nhập đi qua cổng có sẵn và `khungGioId` được giữ qua đăng nhập).
// Ô khác KHÔNG bấm được (không `href`, không tabindex) và trạng thái hết hạn do MÁY CHỦ tính: máy khách không tự đổi ô theo đồng hồ.
// `onSelect` (reschedule F1, TUỲ CHỌN): có ⇒ ô `ConTrong` là NÚT gọi `onSelect(slot)` thay cho liên kết (chọn khung giờ mới để đổi lịch); vắng ⇒ y như trước.
// Quy tắc "ô nào chọn được" KHÔNG đổi: vẫn chỉ `ConTrong` theo trạng thái của máy chủ.
export function SlotCell({
  slot,
  onSelect,
}: {
  slot: PublicSlot;
  onSelect?: (slot: PublicSlot) => void;
}) {
  const time = timeLabel(slot.batDau);
  const label = slotAccessibleName(time, slot.trangThai);
  const body = (
    <>
      <span
        className={`text-sm font-semibold leading-[18.75px] ${
          slot.trangThai === 'HetHan' ? 'line-through' : ''
        }`}
      >
        {time}
      </span>
      <span className="flex items-center gap-1 text-[10px] font-medium leading-[12.5px]">
        <StatusIcon status={slot.trangThai} className="size-[9.375px]" />
        {SLOT_STATUS_LABEL[slot.trangThai]}
      </span>
    </>
  );
  return (
    <li>
      {slot.trangThai === 'ConTrong' && onSelect !== undefined ? (
        <button
          type="button"
          onClick={() => onSelect(slot)}
          aria-label={label}
          className={`${CELL} ${CELL_TONE.ConTrong} w-full hover:bg-cyan-50`}
        >
          {body}
        </button>
      ) : slot.trangThai === 'ConTrong' ? (
        <Link
          to={bookingInfoPath(slot.khungGioId)}
          aria-label={label}
          className={`${CELL} ${CELL_TONE.ConTrong} hover:bg-cyan-50`}
        >
          {body}
        </Link>
      ) : (
        <span
          role="img"
          aria-label={label}
          className={`${CELL} ${CELL_TONE[slot.trangThai]}`}
        >
          {body}
        </span>
      )}
    </li>
  );
}
