import { useEffect, useId, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { useModalDialog } from '../../../shared/hooks/use-modal-dialog';
import { PATIENT_APPOINTMENTS_PATH } from '../../../shared/routes/booking-paths';
import { FormAlert } from '../profile/profile-field';
import { useMounted } from '../profile/use-mounted';
import {
  appointmentStatusLabel,
  formatVietnamDateTime,
} from './appointment-labels';
import { BLOCKED_MESSAGE, describeDeactivateError } from './relative-errors';
import { deactivateRelative } from './relatives-service';
import type { BlockingAppointment, Relative } from './relatives-types';

export interface DeactivateRelativeDialogProps {
  relative: Relative;
  // Nút "Ngừng sử dụng" đã mở hộp thoại: nhận lại focus khi đóng (nếu nút còn trong trang)
  returnFocusRef: RefObject<HTMLElement | null>;
  // Đóng mà không đổi gì (Hủy, Esc, bấm nền, "Đóng" sau 409)
  onClose: () => void;
  // POST trả 200: hồ sơ đã ngừng; nơi gọi đóng hộp thoại và cập nhật danh sách
  onDeactivated: () => void;
  // POST trả 404: hồ sơ không còn là của mình; nơi gọi đóng hộp thoại, báo `notice` và tải lại danh sách
  onReload: (notice: string) => void;
}

const BUTTON_BASE =
  'min-h-[2.6667rem] rounded-lg border px-[1.2rem] text-sm leading-normal transition-colors disabled:opacity-50';
const SECONDARY_BUTTON = `${BUTTON_BASE} border-gray-200 bg-white font-medium text-gray-600 hover:bg-gray-50`;
// Nền danger-strong (red-700) chữ trắng; hover red-800 (thang chuẩn, ADR 0004). Tương phản đo ở Chrome (TRACKING F7-M)
const DANGER_BUTTON = `${BUTTON_BASE} border-transparent bg-danger-strong font-semibold text-white hover:bg-red-800 disabled:hover:bg-danger-strong`;

// Hộp xác nhận "Ngừng sử dụng" hồ sơ người thân (patient F7; NT-23; Q10, Q11; TRACKING F7-D, F7-E). Chỉ được dựng khi hộp thoại MỞ
// (nơi gọi đặt `confirming`), nên `open` của `useModalDialog` luôn true và mọi effect dưới đây chạy đúng một lần cho mỗi lần mở.
// Hai pha trong CÙNG một hộp thoại: xác nhận ⇒ (409) lý do + danh sách lịch hẹn đang chặn. Esc, bấm nền và "Hủy" chỉ ĐÓNG, không bao giờ xác nhận.
// Họ tên hồ sơ, tên bác sĩ, mã lịch hẹn chỉ nằm trong DOM của hộp thoại: không console, kho trình duyệt, URL.
export function DeactivateRelativeDialog({
  relative,
  returnFocusRef,
  onClose,
  onDeactivated,
  onReload,
}: DeactivateRelativeDialogProps) {
  // `null` ⇒ pha xác nhận; mảng ⇒ pha bị chặn (409)
  const [blocked, setBlocked] = useState<BlockingAppointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // State chưa kịp render giữa hai lần bấm liên tiếp, nên chống gửi đúp bằng ref (như RelativeForm); cũng là cờ "đang gửi" cho Esc và nền
  const submitting = useRef(false);
  const mounted = useMounted();
  const titleId = useId();
  const descriptionId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  // Nền `inert`: các phần tử anh em khác của hộp thoại ở `body` (React gốc, chưa có portal nào khác). Chỉ gỡ ĐÚNG những phần tử đã đặt:
  // phần tử đã `inert` từ trước vẫn `inert` sau khi đóng. Cleanup chạy cả khi hộp thoại bị gỡ giữa chừng (thẻ biến mất vì tải lại) và
  // trong StrictMode (gắn, gỡ, gắn lại). PHẢI khai báo TRƯỚC `useModalDialog`: cleanup chạy theo thứ tự khai báo, nên `inert` được gỡ trước khi
  // hook gọi `focus()` trên nút mở (phần tử `inert` không nhận focus).
  useEffect(() => {
    const overlay = overlayRef.current;
    const touched: Element[] = [];
    for (const element of Array.from(document.body.children)) {
      if (element !== overlay && !element.hasAttribute('inert')) {
        element.setAttribute('inert', '');
        touched.push(element);
      }
    }
    return () => {
      for (const element of touched) element.removeAttribute('inert');
    };
  }, []);

  function close() {
    // Đang gửi thì không đóng: yêu cầu không huỷ được, đóng giữa chừng thì người dùng không biết kết quả
    if (!submitting.current) onClose();
  }

  useModalDialog({
    open: true,
    dialogRef,
    initialFocusRef: cancelRef,
    returnFocusRef,
    onClose: close,
  });

  // Chuyển sang pha bị chặn: nút vừa bấm biến mất, đưa focus vào tiêu đề để trình đọc màn hẹp đọc kết quả mới
  useEffect(() => {
    if (blocked !== null) titleRef.current?.focus();
  }, [blocked]);

  // Lỗi mạng, quá giờ, phản hồi lạ, 500: focus vào hộp cảnh báo (bấm "Ngừng sử dụng" lại được, an toàn vì idempotent)
  useEffect(() => {
    if (error !== null) alertRef.current?.focus();
  }, [error]);

  async function handleConfirm() {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      const outcome = await deactivateRelative(relative.hoSoNguoiThanId);
      if (!mounted.current) return;
      if (outcome.kind === 'done') onDeactivated();
      else setBlocked(outcome.appointments);
    } catch (caught) {
      if (!mounted.current) return;
      const failure = describeDeactivateError(caught);
      if (failure.kind === 'missing') onReload(failure.notice);
      else if (failure.kind === 'message') setError(failure.message);
    } finally {
      submitting.current = false;
      if (mounted.current) setPending(false);
    }
  }

  return createPortal(
    // Nền mờ như ngăn kéo F11 (`bg-black/50`); bấm vào nền (không phải vào khung) chỉ đóng
    <div
      ref={overlayRef}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={pending}
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl"
      >
        {/* Vùng cuộn riêng; hàng nút nằm NGOÀI để danh sách dài không đẩy nút ra khỏi màn hình thấp */}
        <div className="min-h-0 overflow-y-auto px-6 pt-5 pb-4">
          <h2
            ref={titleRef}
            id={titleId}
            tabIndex={-1}
            className="text-lg leading-normal font-bold break-words text-gray-900"
          >
            {blocked === null
              ? `Ngừng sử dụng hồ sơ ${relative.hoTen}?`
              : `Chưa thể ngừng sử dụng hồ sơ ${relative.hoTen}`}
          </h2>
          {blocked === null ? (
            <>
              <p
                id={descriptionId}
                className="mt-2 text-sm leading-normal text-gray-600"
              >
                Sau khi ngừng sử dụng, hồ sơ này không còn dùng để đặt lịch hẹn
                mới. Các lịch hẹn đã kết thúc vẫn được giữ nguyên. Không thể sử
                dụng lại hồ sơ đã ngừng: nếu cần, hãy tạo hồ sơ người thân mới.
                Thay đổi bạn đang sửa trong khung chỉnh sửa (nếu có) sẽ không
                được lưu.
              </p>
              {error !== null && (
                <div className="mt-4">
                  <FormAlert alertRef={alertRef}>{error}</FormAlert>
                </div>
              )}
            </>
          ) : (
            <>
              <p
                id={descriptionId}
                className="mt-2 text-sm leading-normal text-gray-600"
              >
                {BLOCKED_MESSAGE}
              </p>
              {/* booking F2: nối tới "Lịch hẹn của tôi" (TRACKING patient mục 5, Q11). Đường dẫn dùng chung ở `shared/routes`, nên `patient` không import `booking`. */}
              <Link
                to={PATIENT_APPOINTMENTS_PATH}
                className="mt-2 inline-block text-sm font-medium text-brand-strong underline"
              >
                Mở Lịch hẹn của tôi
              </Link>
              <ol
                aria-label="Lịch hẹn đang chặn"
                className="mt-4 flex flex-col gap-3"
              >
                {blocked.map((appointment, index) => (
                  <li
                    key={`${appointment.maLichHen}-${index}`}
                    className="rounded-lg border border-gray-200 px-3 py-2.5"
                  >
                    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm leading-normal">
                      <dt className="text-gray-500">Mã lịch hẹn</dt>
                      <dd className="font-semibold break-words text-gray-900">
                        {appointment.maLichHen}
                      </dd>
                      <dt className="text-gray-500">Thời gian</dt>
                      <dd className="text-gray-900">
                        {formatVietnamDateTime(appointment.thoiGian)}
                      </dd>
                      <dt className="text-gray-500">Trạng thái</dt>
                      <dd className="text-gray-900">
                        {appointmentStatusLabel(appointment.trangThai)}
                      </dd>
                      <dt className="text-gray-500">Bác sĩ</dt>
                      <dd className="break-words text-gray-900">
                        {appointment.bacSi}
                      </dd>
                      <dt className="text-gray-500">Chi nhánh</dt>
                      <dd className="break-words text-gray-900">
                        {appointment.chiNhanh}
                      </dd>
                    </dl>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2.5 border-t border-gray-100 px-6 py-4">
          {blocked === null ? (
            <>
              <button
                ref={cancelRef}
                type="button"
                disabled={pending}
                onClick={close}
                className={SECONDARY_BUTTON}
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => void handleConfirm()}
                className={DANGER_BUTTON}
              >
                {pending ? 'Đang ngừng…' : 'Ngừng sử dụng'}
              </button>
            </>
          ) : (
            <button type="button" onClick={close} className={SECONDARY_BUTTON}>
              Đóng
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
