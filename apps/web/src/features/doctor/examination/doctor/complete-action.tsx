import { CalendarCheck } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { COMPLETE_TEXT } from '../exam-messages';
import { useComplete } from '../use-complete';
import { CompleteConfirm } from './complete-confirm';

export interface ExamHeaderActionsProps {
  maLichHen: string;
  // Trạng thái lịch hẹn hiện tại. Kiểu `string` (không import kiểu của booking: Q20 phương án C); nút chỉ hiện khi đúng `DaTiepDon`
  trangThai: string;
  // Gọi khi máy chủ đã đổi hay dữ liệu đang hiện chắc chắn lệch: trang chi tiết tải lại (nút và chip khớp lại)
  onChanged: () => void;
}

// Điều kiện DUY NHẤT của `complete` (Q5): lịch đang `DaTiepDon` (và đúng bác sĩ, do máy chủ kiểm)
const COMPLETABLE_STATE = 'DaTiepDon';

const ACTION_BUTTON =
  'inline-flex items-center gap-2 rounded-[13.375px] bg-brand-strong px-4 py-2 text-sm font-semibold whitespace-nowrap text-white transition-colors hover:bg-cyan-800';

// Phần của module `doctor` cắm vào hàng tiêu đề trang "Chi tiết ca khám" (booking F11/F12 truyền vào `headerAside` của `DetailPageFrame`; Q20 phương án C: booking import
// CHỈ qua `features/doctor/index.ts`, dữ liệu và hàm tải lại đi qua props). Figma `459:2` (nút `Hoàn thành ca khám`), `461:2` (hàng xác nhận tại chỗ).
// Dòng kết quả ("Đã hoàn thành ca khám.", "Ca khám này đã được hoàn thành.", lỗi) ở lại sau khi trang tải lại và nút biến mất: component không bị gỡ khi `trangThai` đổi.
export function ExamHeaderActions({
  maLichHen,
  trangThai,
  onChanged,
}: ExamHeaderActionsProps) {
  const { step, outcome, ask, cancel, confirm, reloadDetail } = useComplete({
    maLichHen,
    onChanged,
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const noteRef = useRef<HTMLElement>(null);
  const restoreFocus = useRef(false);

  // `Hủy` hay Esc: trả tiêu điểm về nút `Hoàn thành ca khám` (nút mới được dựng lại nên chờ sau lần vẽ kế tiếp)
  function handleCancel() {
    restoreFocus.current = true;
    cancel();
  }
  useEffect(() => {
    if (step === 'idle' && restoreFocus.current) {
      restoreFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [step]);
  // Có kết quả mới: nút vừa bấm có thể đã biến mất (thành công) nên tiêu điểm chuyển sang dòng kết quả, người dùng bàn phím không rơi về `body`
  useEffect(() => {
    if (outcome !== null) noteRef.current?.focus();
  }, [outcome]);

  const completable = trangThai === COMPLETABLE_STATE;
  if (!completable && outcome === null) return null;
  // Đã hoàn thành (200) hay máy chủ báo đã hoàn thành (409): không hiện lại nút trong lúc chi tiết đang tải lại (nút sẽ tự biến mất khi `trangThai` đổi)
  const finished = outcome?.kind === 'done' || outcome?.kind === 'already';

  return (
    <div className="flex flex-col items-end gap-1.5">
      {completable &&
        !finished &&
        (step === 'idle' ? (
          <button
            ref={triggerRef}
            type="button"
            onClick={ask}
            className={ACTION_BUTTON}
          >
            <CalendarCheck aria-hidden="true" className="size-4" />
            {COMPLETE_TEXT.action}
          </button>
        ) : (
          <CompleteConfirm
            busy={step === 'submitting'}
            onConfirm={() => void confirm()}
            onCancel={handleCancel}
          />
        ))}
      {outcome?.kind === 'failed' && (
        <div
          ref={(element) => {
            noteRef.current = element;
          }}
          tabIndex={-1}
          role="alert"
          className="max-w-md rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-left text-sm text-danger-strong"
        >
          <p>{outcome.failure.message}</p>
          {outcome.failure.kind === 'uncertain' && (
            <button
              type="button"
              onClick={reloadDetail}
              className="mt-1 block font-medium underline"
            >
              {COMPLETE_TEXT.reload}
            </button>
          )}
        </div>
      )}
      {(outcome?.kind === 'done' || outcome?.kind === 'already') && (
        <p
          ref={(element) => {
            noteRef.current = element;
          }}
          tabIndex={-1}
          role="status"
          className="text-sm text-success"
        >
          {outcome.kind === 'done' ? COMPLETE_TEXT.done : COMPLETE_TEXT.already}
        </p>
      )}
    </div>
  );
}
