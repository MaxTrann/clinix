import { useEffect, useId, useRef } from 'react';
import { SlotPicker } from '../../../../search';
import { DIALOG_FIELD_BORDER } from '../action-dialog';
import { HANDLE_TEXT } from './request-handle-text';
import type { ReplacementSlot } from './use-replacement-slot';

// Bảng chọn khung giờ thay thế, hiện NGAY trên trang chi tiết khi hộp Duyệt tạm đóng (reschedule F4 Pha B2; kế hoạch 1.16 mục 2.7: hộp rộng 360 px quá hẹp cho lưới, và không chồng hai modal). Lưới là `SlotPicker`
// dùng chung (reschedule F1) của ĐÚNG bác sĩ của lịch: ô nào chọn được do MÁY CHỦ quyết (trạng thái ô), web không tự suy. Chọn một ô hay bấm "Quay lại hộp duyệt" (Đại chốt 26/11/2026) đều mở lại hộp, giữ ghi chú.
export function ReplacementSlotPanel(props: {
  bacSiId: string;
  onSelect: (slot: ReplacementSlot) => void;
  onBack: () => void;
}) {
  const { bacSiId, onSelect, onBack } = props;
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Hộp vừa gỡ: đưa tiêu điểm (và màn hình) tới bảng
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  // Chọn MỘT lần: hai ô bấm trong cùng một lượt xử lý chỉ nhận ô đầu
  const picked = useRef(false);

  return (
    <section
      aria-labelledby={headingId}
      className="mt-4 rounded-2xl border border-gray-200 bg-white p-5"
    >
      <h2
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="text-sm font-semibold text-gray-900"
      >
        {HANDLE_TEXT.panelTitle}
      </h2>
      <p className="pt-1 pb-4 text-sm text-gray-600">
        {HANDLE_TEXT.panelIntro}
      </p>
      <SlotPicker
        bacSiId={bacSiId}
        onSelect={(slot) => {
          if (picked.current) return;
          picked.current = true;
          onSelect(slot);
        }}
      />
      <button
        type="button"
        onClick={onBack}
        className={`mt-4 min-h-10 rounded-xl ${DIALOG_FIELD_BORDER} bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50`}
      >
        {HANDLE_TEXT.backToApprove}
      </button>
    </section>
  );
}
