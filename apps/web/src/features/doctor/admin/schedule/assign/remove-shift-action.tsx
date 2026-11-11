import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { todayVn } from '../../../../../shared/schedule/week';
import { removeShift } from '../../../api/shift-assignment-api';
import { describeRemoveError } from './assign-errors';

export interface RemoveShiftActionProps {
  lichLamViecId: string;
  // Ngày của ca (`YYYY-MM-DD`): ca đã qua không có nút (server cũng chặn, `CA_DA_QUA`)
  ngay: string;
  // DELETE trả 204: nơi gọi đóng ngăn kéo, báo thành công và làm mới lưới
  onRemoved: () => void;
  // 404: ca đã không còn (gỡ ở nơi khác): nơi gọi đóng ngăn kéo và làm mới lưới
  onGone: () => void;
}

// Nút "Gỡ ca" ở chân ngăn kéo "Chi tiết ca" của Admin (PLAN 5.3, Q8; WA-06). Hai bước ngay trong ngăn kéo ("Gỡ ca" ⇒ câu hỏi + Hủy/Gỡ ca) thay cho hộp xác
// nhận thứ hai: hai hộp modal chồng nhau cùng nghe phím Esc và sẽ đóng cả hai. Gỡ ca xoá luôn các khung giờ còn trống của ca; ca đã có khung giờ được đặt
// hoặc từng có lịch hẹn thì server từ chối `CA_DANG_CO_LICH_HEN` và câu giải thích hiện ngay tại đây.
export function RemoveShiftAction({
  lichLamViecId,
  ngay,
  onRemoved,
  onGone,
}: RemoveShiftActionProps) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  if (ngay < todayVn()) return null;

  async function confirm() {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      await removeShift(lichLamViecId);
      onRemoved();
    } catch (caught) {
      const failure = describeRemoveError(caught);
      if (failure.gone) onGone();
      else setError(failure.message);
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  if (!confirming)
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mb-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-danger-line bg-white text-sm font-medium text-danger-strong transition-colors hover:bg-danger-soft"
      >
        <Trash2 aria-hidden="true" className="size-4" />
        Gỡ ca
      </button>
    );

  return (
    <div
      role="group"
      aria-label="Xác nhận gỡ ca"
      className="mb-3 rounded-lg border border-danger-line bg-danger-soft px-3 py-3 text-sm text-danger-strong"
    >
      <p>
        Gỡ ca này? Các khung giờ còn trống của ca sẽ bị xoá. Thao tác không thể
        hoàn tác.
      </p>
      {error !== null && (
        <p role="alert" className="mt-2 font-medium">
          {error}
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          className="min-h-10 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
        >
          Hủy
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void confirm()}
          className="min-h-10 rounded-lg bg-danger-strong text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
        >
          {pending ? 'Đang gỡ…' : 'Gỡ ca'}
        </button>
      </div>
    </div>
  );
}
