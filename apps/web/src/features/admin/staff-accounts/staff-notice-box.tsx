import type { StaffNotice } from './staff-types';

// Hộp kết quả của một thao tác ghi (admin F8). Thành công là `role="status"`; cảnh báo và lỗi là `role="alert"` để đọc ngay. Màu theo token của ADR 0004.

const TONES: Record<StaffNotice['kind'], string> = {
  success: 'border-success-line bg-success-soft text-success',
  warning: 'border-warning-line bg-warning-soft text-warning',
  error: 'border-danger-line bg-danger-soft text-danger-strong',
};

export function StaffNoticeBox({ notice }: { notice: StaffNotice }) {
  return (
    <p
      role={notice.kind === 'success' ? 'status' : 'alert'}
      className={`rounded-xl border px-3 py-2 text-sm ${TONES[notice.kind]}`}
    >
      {notice.text}
    </p>
  );
}
