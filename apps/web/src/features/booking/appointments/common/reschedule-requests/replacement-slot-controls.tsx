import { useRef } from 'react';
import { DIALOG_FIELD_BORDER } from '../action-dialog';
import { HANDLE_TEXT } from './request-handle-text';
import type { DoctorLookup } from './use-replacement-slot';

// Phần "khung giờ thay thế" trong hộp Duyệt (reschedule F4 Pha B2): nút "Chọn khung giờ khác", nút "Dùng lại khung giờ mong muốn" khi đã chọn, và câu lỗi CẠNH NÚT khi không lấy được id bác sĩ (hộp giữ nguyên, vẫn
// duyệt được khung giờ đang hiện hay đóng hộp để từ chối). Đang hỏi thì nút dùng `aria-disabled` (không `disabled`) để tiêu điểm không rơi về `body`; đang gửi thì cả hai nút vô hiệu.
const BUTTON = `min-h-10 rounded-xl ${DIALOG_FIELD_BORDER} bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:opacity-50`;

export function ReplacementSlotControls(props: {
  lookup: DoctorLookup;
  hasChoice: boolean;
  // Đang gửi yêu cầu duyệt
  locked: boolean;
  onPick: () => void;
  onUseDesired: () => void;
}) {
  const { lookup, hasChoice, locked, onPick, onUseDesired } = props;
  const pickRef = useRef<HTMLButtonElement>(null);
  const loading = lookup.kind === 'loading';

  return (
    <div className="pt-2">
      <div className="flex flex-wrap gap-2">
        <button
          ref={pickRef}
          type="button"
          disabled={locked}
          aria-disabled={loading || undefined}
          onClick={() => onPick()}
          className={BUTTON}
        >
          {loading ? HANDLE_TEXT.pickLoading : HANDLE_TEXT.pickAnother}
        </button>
        {hasChoice && (
          <button
            type="button"
            disabled={locked}
            onClick={() => {
              onUseDesired();
              // Nút này biến mất sau khi bấm: đưa tiêu điểm sang nút còn lại
              pickRef.current?.focus();
            }}
            className={BUTTON}
          >
            {HANDLE_TEXT.useDesired}
          </button>
        )}
      </div>
      {lookup.kind === 'failed' && (
        <p role="alert" className="pt-1.5 text-sm text-danger-strong">
          {lookup.message}
        </p>
      )}
    </div>
  );
}
