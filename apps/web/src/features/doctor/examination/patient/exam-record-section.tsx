import { ClipboardList, Stethoscope } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { RemoteState } from '../../../../shared/hooks/use-remote';
import { LoadingState } from '../../../../shared/ui/loading-state';
import type { ExamDetail } from '../api/patient-exam-types';
import { ExamCard } from './exam-card';
import { FailureBox } from './failure-box';
import {
  EXAM_CASE_PARAM,
  PATIENT_EXAM_RECORDS_PATH,
} from './patient-exam-paths';
import { PATIENT_TEXT } from './patient-exam-text';
import { RecordFields } from './record-fields';

// Chữ của thẻ "Hồ sơ khám bệnh" ở chi tiết lịch hẹn (doctor-exam F6; Figma `422:284`, `424:284`). Câu "chưa có hồ sơ" và nhãn liên kết có trong Figma (đọc đủ bằng `get_design_context`: `get_metadata` cắt ở 50 ký tự); tiêu đề thẻ cùng chữ với thẻ tĩnh cũ của booking.
const RECORD_CARD_TEXT = {
  title: 'Hồ sơ khám bệnh',
  missing:
    'Chưa có hồ sơ khám. Ca khám đã hoàn thành nhưng bác sĩ chưa ghi nội dung. Hồ sơ sẽ hiển thị sau khi bác sĩ cập nhật.',
  link: 'Xem trong sổ khám bệnh →',
} as const;

// Trạng thái RỖNG (Figma `422:284`, `425:307`; Q6 (3)): MỘT dòng gồm biểu tượng bảng ghi chú và câu giải thích, KHÔNG bốn khối, KHÔNG nội dung giả và KHÔNG liên kết (Figma chỉ có liên kết ở thẻ có nội dung). Câu `gray-500` thay `#6a7282` trùng thang chuẩn (4,84:1).
function RecordMissingLine() {
  return (
    <div className="flex items-start gap-2.5 p-5">
      <ClipboardList
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-gray-300"
      />
      <p className="text-sm text-gray-500">{RECORD_CARD_TEXT.missing}</p>
    </div>
  );
}

// Thẻ "Hồ sơ khám bệnh" ở cột trái của chi tiết lịch hẹn (doctor-exam F6; Figma `422:2`, `424:2`, `425:2`; WXH-09, WXH-18; Q6, Q21). Dùng lại ĐÚNG `RecordFields` của F5 (bốn khối, "Chưa ghi", "Cập nhật lần cuối … · bởi …", chữ thuần): không bản chép thứ hai.
// Đang tải và lỗi (hộp `Thử lại` chạy lại MỘT lời gọi cho cả hai thẻ) chỉ hỏng thẻ này, trang chi tiết booking vẫn nguyên. Liên kết "Xem trong sổ khám bệnh →" CHỈ khi có nội dung hồ sơ, tới trang F5 kèm `?ca=<mã lịch hẹn mã hoá>`
// (mã lịch hẹn không phải dữ liệu sức khoẻ; nội dung khám KHÔNG lên URL: BDK-02).
export function ExamRecordSection({
  state,
  onRetry,
}: {
  state: RemoteState<ExamDetail | null>;
  onRetry: () => void;
}) {
  let body: ReactNode = null;
  if (state.status === 'loading') {
    body = (
      <div className="px-5 py-4">
        <LoadingState message={PATIENT_TEXT.paneLoading} />
      </div>
    );
  } else if (state.status === 'error') {
    body = (
      <div className="px-5 py-2">
        <FailureBox error={state.error} onRetry={onRetry} />
      </div>
    );
  } else if (state.data !== null) {
    const detail = state.data;
    body =
      detail.hoSoKham === null ? (
        <RecordMissingLine />
      ) : (
        <div className="px-5 py-4">
          <RecordFields note={detail.hoSoKham} doctor={detail.bacSi} />
          <div className="flex pt-3">
            <Link
              to={`${PATIENT_EXAM_RECORDS_PATH}?${EXAM_CASE_PARAM}=${encodeURIComponent(detail.maLichHen)}`}
              className="text-xs leading-[15px] font-medium text-brand-strong underline"
            >
              {RECORD_CARD_TEXT.link}
            </Link>
          </div>
        </div>
      );
  }
  return (
    <ExamCard icon={Stethoscope} title={RECORD_CARD_TEXT.title}>
      {body}
    </ExamCard>
  );
}
