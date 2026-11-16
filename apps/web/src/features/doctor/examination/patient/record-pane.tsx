import { ClipboardList } from 'lucide-react';
import type { RefObject } from 'react';
import { Link } from 'react-router';
import type { RemoteState } from '../../../../shared/hooks/use-remote';
import { patientAppointmentDetailPath } from '../../../../shared/routes/booking-paths';
import { LoadingState } from '../../../../shared/ui/loading-state';
import type { ExamDetail } from '../api/patient-exam-types';
import { FailureBox } from './failure-box';
import { PATIENT_TEXT } from './patient-exam-text';
import { RecordContentCard } from './record-content-card';
import { VisitSummaryCard } from './visit-summary-card';

// Ngăn phải khi chưa chọn ca (Figma `414:383`)
function Prompt() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-20 text-center">
      <ClipboardList aria-hidden="true" className="size-10 text-gray-300" />
      <p className="pt-3 text-sm font-medium text-gray-500">
        {PATIENT_TEXT.panePrompt}
      </p>
      <p className="pt-1 text-xs text-gray-500">
        {PATIENT_TEXT.panePromptHint}
      </p>
    </div>
  );
}

// Ngăn chi tiết của ca đang chọn (Figma `414:382`, `443:517`, `415:383`; WXH-04 đến WXH-07): nhắc chọn ca / đang tải / lỗi / thẻ đầu + thẻ nội dung + liên kết. Luôn là MỘT vùng có tên, `tabIndex={-1}` để trang chuyển tiêu điểm vào đây sau khi
// người dùng chọn ca (người dùng bàn phím, trình đọc màn hình và màn hình hẹp nơi ngăn nằm dưới danh sách); `aria-busy` khi đang tải. Liên kết "Xem chi tiết lịch hẹn →" tới `patientAppointmentDetailPath(mã)` (mã được mã hoá; Q20: không import booking).
export function RecordPane({
  caseCode,
  detail,
  onRetry,
  paneRef,
}: {
  caseCode: string | null;
  detail: RemoteState<ExamDetail | null>;
  onRetry: () => void;
  paneRef: RefObject<HTMLElement | null>;
}) {
  const loading = caseCode !== null && detail.status === 'loading';
  let content;
  if (caseCode === null) {
    content = <Prompt />;
  } else if (detail.status === 'loading') {
    content = <LoadingState message={PATIENT_TEXT.paneLoading} />;
  } else if (detail.status === 'error') {
    content = <FailureBox error={detail.error} onRetry={onRetry} />;
  } else if (detail.data === null) {
    content = <Prompt />;
  } else {
    const { data } = detail;
    content = (
      <div>
        <div className="flex flex-col gap-[15px]">
          <VisitSummaryCard detail={data} />
          <RecordContentCard note={data.hoSoKham} doctor={data.bacSi} />
        </div>
        {/* Figma `443:638`: ô liên kết cao 45 (đệm 15 trên và dưới, chữ 15); `flex` để dòng chữ không cộng thêm khoảng đệm của dòng cơ sở */}
        <div className="flex py-4">
          <Link
            to={patientAppointmentDetailPath(data.maLichHen)}
            className="text-xs leading-[15px] font-medium text-brand-strong underline"
          >
            {PATIENT_TEXT.detailLink}
          </Link>
        </div>
      </div>
    );
  }
  return (
    <section
      ref={paneRef}
      tabIndex={-1}
      aria-label={PATIENT_TEXT.paneTitle}
      aria-busy={loading}
      className="min-w-0"
    >
      {content}
    </section>
  );
}
