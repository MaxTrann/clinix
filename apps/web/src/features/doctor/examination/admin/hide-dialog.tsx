import { useId, useRef, useState, type RefObject } from 'react';
import { EyeOff } from 'lucide-react';
import { ModalFrame } from '../../components/modal-frame';
import type { AdminReviewItem } from '../api/admin-review-types';
import { formatCount } from '../exam-messages';
import { reasonMessage } from './hide-failure';
import { HideSummary, HideWarning } from './hide-summary';
import { HIDE_REASON_MAX, reasonCount } from './hide-rules';
import { HIDE_TEXT } from './reviews-text';
import { useHide, type HideSettled } from './use-hide';

// Khung lớp theo Figma `571:876` (gốc rem 15 px nên dùng px tường minh): nhãn 13,125 đậm vừa `gray-700`; ô nhập cao tối thiểu 76,6 (`rows` 3 cùng dòng 18,75), bo 13,375, đệm 15 × 9,375, chữ 13,125 dòng 18,75, viền `gray-300` như ô của F3 và F6,
// gợi ý `gray-500` (ADR 0004: `rgba(15,23,42,.5)` của Figma chỉ ≈ 3,5:1); bộ đếm 11,25 cách ô 6,5. Hai nút cao 33,75 (Figma `571:883`, `571:885`) bo 13,375, cách nhau 7,5; nút đỏ dùng `danger-strong` (6,42:1) thay `#e7000b` (chữ trắng chỉ 4,36:1).
const CONTROL =
  'block min-h-[76.6px] w-full resize-y rounded-[13.375px] border bg-white px-[15px] py-[9.375px] text-[13.125px] leading-[18.75px] text-gray-900 placeholder:text-gray-500 aria-[invalid=true]:border-danger';
const BUTTON =
  'h-[33.75px] rounded-[13.375px] px-[15px] text-[13.125px] leading-[18.75px] font-medium whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60';

interface DialogProps {
  // Đánh giá cần ẩn: hàng của bảng hay chi tiết vừa tải (hình dạng `AdminReviewItem`); chỉ dùng để tóm tắt và lấy `danhGiaId`
  item: AdminReviewItem;
  // Nút đã mở (`Xem` hay `Ẩn` ở danh sách): nhận lại tiêu điểm khi đóng
  returnFocusRef: RefObject<HTMLElement | null>;
  // Đóng hộp (`Hủy`, ×, `Esc`): KHÔNG gửi gì
  onClose: () => void;
  // 200: đã ẩn
  onHidden: () => void;
  // 409 hay 404: đóng hộp, tải lại danh sách và báo
  onSettled: (kind: HideSettled) => void;
  // "Chưa rõ": đóng hộp và tải lại danh sách (lý do bị bỏ, không lưu ở đâu)
  onReload: () => void;
}

// Hộp "Ẩn đánh giá" (doctor-exam F8; Figma `571:2`; PLAN 5.8, 5.13, 5.14; Q8; WKD-05 đến WKD-08, WKD-24). Hộp modal dựng trên `ModalFrame` của doctor (tiêu điểm, `Esc`, `inert`, khoá khi đang gửi). Ẩn là MỘT CHIỀU, nên câu cảnh báo của Figma luôn hiện.
// Luồng (Đại duyệt 17/11/2026): `Xác nhận ẩn` LUÔN bấm được trừ khi đang gửi hay lỗi cuối (401, 403); bấm khi lý do thiếu, dưới 10 hay trên 255 (sau chuẩn hoá, đếm UTF-16) ⇒ lỗi theo ô và KHÔNG `POST`; hợp lệ ⇒ ĐÚNG MỘT `POST`. Lỗi theo ô ở đúng ô, lý do LUÔN giữ.
// Lý do chỉ ở state của hộp này: không kho trình duyệt, URL, `location.state`, tiêu đề tài liệu hay log (WKD-26; lý do có thể nhạy cảm nên cũng KHÔNG giữ bản nháp cho lần mở sau, khác F3).
export function HideDialog({
  item,
  returnFocusRef,
  onClose,
  onHidden,
  onSettled,
  onReload,
}: DialogProps) {
  const [reason, setReason] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const inputId = `${id}-reason`;
  const errorId = `${id}-error`;
  const countId = `${id}-count`;
  const { saving, failure, hide, clearReasonError } = useHide({
    danhGiaId: item.danhGiaId,
    onHidden,
    onSettled,
  });

  const code = failure?.kind === 'field' ? failure.code : null;
  // 401, 403: gửi lại không đổi được kết quả, chỉ còn `Hủy`
  const locked = failure?.kind === 'final';
  const count = reasonCount(reason);

  return (
    <ModalFrame
      title={HIDE_TEXT.title}
      initialFocusRef={inputRef}
      returnFocusRef={returnFocusRef}
      onClose={onClose}
      busy={saving}
      showCloseIcon
      widthClass="max-w-[420px]"
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (locked) return;
          void hide(reason);
        }}
        className="flex min-h-0 flex-col"
      >
        <div className="flex min-h-0 flex-col gap-[15px] overflow-y-auto px-[22.5px] py-[18.75px]">
          <HideSummary item={item} />
          <HideWarning />
          <div className="flex flex-col">
            <label
              htmlFor={inputId}
              className="pb-[5.625px] text-[13.125px] leading-[18.75px] font-medium text-gray-700"
            >
              {HIDE_TEXT.reasonLabel}{' '}
              <span aria-hidden="true" className="text-danger">
                *
              </span>
            </label>
            <textarea
              id={inputId}
              ref={inputRef}
              required
              rows={3}
              aria-invalid={code === null ? undefined : true}
              aria-describedby={[code === null ? null : errorId, countId]
                .filter((part) => part !== null)
                .join(' ')}
              placeholder={HIDE_TEXT.placeholder}
              value={reason}
              readOnly={saving}
              onChange={(event) => {
                setReason(event.target.value);
                clearReasonError();
              }}
              className={`${CONTROL} ${code === null ? 'border-gray-300' : ''}`}
            />
            <div className="mt-[6.5px] flex items-start justify-between gap-3">
              {code !== null ? (
                <p
                  id={errorId}
                  role="alert"
                  className="text-[11.25px] leading-[15px] text-danger-strong"
                >
                  {reasonMessage(code)}
                </p>
              ) : null}
              <span
                id={countId}
                className={`ml-auto text-[11.25px] leading-[15px] ${count > HIDE_REASON_MAX ? 'text-danger' : 'text-gray-500'}`}
              >
                {`${formatCount(count)}/${formatCount(HIDE_REASON_MAX)}`}
              </span>
            </div>
          </div>
          {failure?.message != null && (
            <div
              role="alert"
              className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-left text-[13.125px] leading-[18.75px] text-danger-strong"
            >
              <p>{failure.message}</p>
              {failure.kind === 'uncertain' && (
                <button
                  type="button"
                  onClick={onReload}
                  className="mt-1 block font-medium underline"
                >
                  {HIDE_TEXT.reload}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-[7.5px] border-t border-gray-100 px-[22.5px] py-[15px]">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className={`${BUTTON} bg-gray-100 text-gray-700 hover:bg-gray-200`}
          >
            {HIDE_TEXT.cancel}
          </button>
          <button
            type="submit"
            disabled={saving || locked}
            className={`${BUTTON} inline-flex items-center gap-[5.625px] bg-danger-strong text-white hover:bg-red-800`}
          >
            <EyeOff aria-hidden="true" className="size-[15px]" />
            {saving ? HIDE_TEXT.hiding : HIDE_TEXT.confirm}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
