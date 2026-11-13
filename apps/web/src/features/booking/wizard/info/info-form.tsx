import { ArrowRight, ChevronLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  useRemote,
  type RemoteState,
} from '../../../../shared/hooks/use-remote';
import {
  BOOKING_PATH,
  bookingConfirmPath,
} from '../../../../shared/routes/booking-paths';
import { useAuth } from '../../../auth';
import {
  BOOKING_ERROR_CODES,
  knownBookingError,
} from '../../api/booking-errors';
import { getRelatives, postCheck } from '../../api/booking-service';
import type { VisitRelative } from '../../api/booking-types';
import { useKeepPrevious } from '../../appointments/common/use-keep-previous';
import { ApiError } from '../../../../shared/api/errors';
import { BookingNotice } from '../booking-notice';
import { useBookingDraft } from '../booking-draft-context';
import { SelectedSlotCard } from './selected-slot-card';
import { VisitProfileCard } from './visit-profile-card';
import { VisitReasonField } from './visit-reason-field';
import { checkVisitReason } from './visit-reason-rules';

const DROPPED_MESSAGE =
  'Hồ sơ người thân đã chọn không còn khả dụng. Hệ thống đã chuyển về hồ sơ của bạn.';

// Bước 4 "Người khám" (booking F4; Figma `449:2`, `450:2`). Giữ ba thứ: hồ sơ đi khám đang chọn, lý do khám đang gõ (state của component, KHÔNG storage, URL hay log) và
// kết quả `checks` của hồ sơ đang chọn. `InfoStep` đặt `key={khungGioId}` nên đổi khung giờ thì form đặt lại.
//
// `data-testid="booking-step-4-body"` và `data-reference` giữ lại từ thân tạm của F3: test của F3 (`wizard-routes.test.tsx`) và của auth (`return-flow.test.tsx`, BRT-07)
// tìm Bước 4 bằng chúng.
//
// `Quay lại` và liên kết "Chọn lại bác sĩ & giờ" (Figma) đích đúng là Bước 3 nhưng URL chỉ có `khungGioId` nên không dựng được (F3 (k), nhóm quyết): Đại duyệt 13/11/2026
// cả hai TẠM về Bước 1 và chữ liên kết là "Chọn lại dịch vụ" (đúng đích; TECH_DEBT). `navigate(-1)` bị loại: từ Bước 5 bấm "Sửa" thì Back quay lại Bước 5. Rời wizard thì bản
// nháp mất cùng khung (provider bị gỡ). SĐT bản thân KHÔNG hiện (Đại duyệt 13/11/2026; lệch Figma `449:2`): thẻ chỉ có "Bản thân".
export function InfoForm({ khungGioId }: { khungGioId: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { draft, setDraft, clearDraft } = useBookingDraft();

  // Bản nháp chỉ được dùng khi đúng khung giờ này; của khung giờ khác thì xoá (lý do khám của khung giờ khác không được nằm lại trong bộ nhớ)
  const saved =
    draft !== null && draft.khungGioId === khungGioId ? draft : null;
  const staleDraft = draft !== null && saved === null;
  useEffect(() => {
    if (staleDraft) clearDraft();
  }, [staleDraft, clearDraft]);

  const [selectedId, setSelectedId] = useState<string | null>(
    saved?.hoSoNguoiThanId ?? null,
  );
  const [reasonText, setReasonText] = useState(saved?.lyDoKham ?? '');
  const [dropped, setDropped] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement | null>(null);
  // Chặn bấm đúp `Tiếp tục`: hai `navigate` đẩy hai mục lịch sử và Back rơi lại Bước 5
  const leaving = useRef(false);

  const relatives = useRemote(getRelatives, []);
  // "Làm mới danh sách" (và tải lại sau 409) giữ danh sách CŨ trong lúc chờ: hộp không nháy về "Đang tải" và thẻ hồ sơ đang chọn không mất tên. Lựa chọn không còn
  // trong danh sách thì xử lý ở dưới, trên kết quả MỚI (`relatives.state`), không trên bản cũ.
  const relativesView = useKeepPrevious(relatives.state);
  const shownRelatives: RemoteState<VisitRelative[]> =
    relativesView.kind === 'ready'
      ? { status: 'ready', data: relativesView.data }
      : relatives.state;
  // Hồ sơ đã chọn không còn trong danh sách hiệu lực (bị ngừng giữa lúc đang chọn) ⇒ về bản thân kèm thông báo
  if (
    selectedId !== null &&
    relatives.state.status === 'ready' &&
    !relatives.state.data.some((r) => r.hoSoNguoiThanId === selectedId)
  ) {
    setSelectedId(null);
    setDropped(true);
  }

  // `checks` CHỈ ĐỌC, theo hồ sơ ĐANG CHỌN: một lần khi vào và một lần mỗi khi đổi hồ sơ; `useRemote` huỷ lời gọi cũ nên phản hồi muộn của hồ sơ trước không đè
  // hồ sơ sau. Hồ sơ vừa bị ngừng (409) ⇒ tải lại danh sách để hồ sơ rơi khỏi hộp chọn.
  const reloadRelatives = relatives.retry;
  const check = useRemote(
    (signal) =>
      postCheck(khungGioId, selectedId, signal).catch((error: unknown) => {
        if (
          !signal.aborted &&
          error instanceof ApiError &&
          error.maLoi === BOOKING_ERROR_CODES.RELATIVE_DEACTIVATED
        ) {
          reloadRelatives();
        }
        throw error;
      }),
    [khungGioId, selectedId],
  );

  const checkFailure =
    check.state.status === 'error'
      ? knownBookingError(check.state.error)
      : undefined;
  const reason = checkVisitReason(reasonText);

  function select(hoSoNguoiThanId: string | null) {
    setSelectedId(hoSoNguoiThanId);
    setDropped(false);
  }

  function handleContinue() {
    if (!reason.ok) {
      reasonRef.current?.focus();
      return;
    }
    if (check.state.status !== 'ready' || leaving.current) return;
    leaving.current = true;
    setDraft({
      khungGioId,
      hoSoNguoiThanId: selectedId,
      lyDoKham: reason.value,
    });
    navigate(bookingConfirmPath(khungGioId));
  }

  return (
    <div data-testid="booking-step-4-body" data-reference={khungGioId}>
      <Link
        to={BOOKING_PATH}
        className="-ml-2 inline-flex min-h-11 items-center gap-1 px-2 font-medium text-gray-800"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        Chọn lại dịch vụ
      </Link>
      <h1 className="text-2xl font-bold text-gray-900">Thông tin người khám</h1>
      <p className="mt-1 text-gray-700">
        Chọn hồ sơ người đi khám và cho bác sĩ biết lý do khám (nếu có)
      </p>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <VisitProfileCard
            selfName={user?.hoTen ?? 'Bản thân'}
            selectedId={selectedId}
            relatives={shownRelatives}
            refreshing={relatives.state.status === 'loading'}
            onRetryRelatives={relatives.retry}
            onSelect={select}
          >
            {dropped && (
              <p role="status" className="mt-3 text-sm text-warning">
                {DROPPED_MESSAGE}
              </p>
            )}
            {checkFailure?.scope === 'profile' && (
              <BookingNotice message={checkFailure.message} />
            )}
          </VisitProfileCard>
          <VisitReasonField
            value={reasonText}
            onChange={setReasonText}
            error={reason.ok ? null : reason.error}
            textareaRef={reasonRef}
          />
        </div>
        <SelectedSlotCard state={check.state} onRetry={check.retry} />
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Link
          to={BOOKING_PATH}
          className="inline-flex min-h-11 items-center rounded-xl border border-gray-500 bg-white px-5 font-semibold text-gray-800"
        >
          Quay lại
        </Link>
        <button
          type="button"
          onClick={handleContinue}
          disabled={check.state.status !== 'ready'}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-strong px-5 font-semibold text-white disabled:bg-gray-300 disabled:text-gray-700"
        >
          Tiếp tục
          <ArrowRight aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  );
}
