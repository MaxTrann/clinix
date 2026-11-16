// Chữ, quy tắc "thẻ hiện gì" và hàm định dạng của thẻ `Hồ sơ khám bệnh` của Bác sĩ (doctor-exam F2; Figma `459:2`, `462:2`, `464:2`; Q6, Q16). Hàm thuần: không đọc đồng hồ, không đụng DOM.
// Chữ nhãn và "Cập nhật lúc" đúng Figma `462:2`; bốn câu theo trạng thái là chữ của booking F11 (đúng Figma), chép sang đây vì Q20 phương án C cấm `features/doctor` import `features/booking` (TECH_DEBT 109).
export const RECORD_TEXT = {
  title: 'Hồ sơ khám bệnh',
  labels: {
    symptoms: 'Triệu chứng',
    diagnosis: 'Chẩn đoán sơ bộ',
    advice: 'Hướng xử lý / Lời khuyên',
    returnDate: 'Ngày tái khám dự kiến',
  },
  updatedPrefix: 'Cập nhật lúc',
  pending:
    'Hồ sơ khám sẽ được bác sĩ cập nhật sau khi người bệnh được tiếp đón.',
  notStarted: 'Chưa ghi hồ sơ khám.',
  // Dòng phụ của trạng thái rỗng (doctor-exam F3; Figma `459:2` `460:271`, `464:2`)
  notStartedHint: 'Có thể ghi hồ sơ trước hoặc sau khi hoàn thành ca.',
  completedWithout: 'Ca khám đã hoàn thành nhưng chưa có hồ sơ khám.',
  completedWithoutHint:
    'Bổ sung hồ sơ để lưu triệu chứng, chẩn đoán và lời khuyên.',
  none: 'Không có hồ sơ khám.',
  // Chữ hai nút mở hộp (doctor-exam F3; Figma `460:273`, `463:250`)
  actions: { write: 'Ghi hồ sơ khám', edit: 'Chỉnh sửa ghi chú' },
} as const;

// Thẻ hiện MỘT trong ba dạng:
//   content  bốn khối nội dung và "Cập nhật lúc": CHỈ khi lịch `DaTiepDon` hoặc `HoanThanh` VÀ có hồ sơ (Q6);
//   empty    trạng thái rỗng có biểu tượng (Figma `459:2`, `464:2`): lịch `DaTiepDon` hoặc `HoanThanh` mà chưa có hồ sơ, kèm dòng phụ `hint`;
//   note     hộp chữ (nghiêng khi không có hồ sơ nào): chờ thanh toán, đã xác nhận, đã hủy, vắng mặt, mã lạ. Q16: nội dung KHÔNG được hiện ở các trạng thái này dù API có gửi (hồ sơ cũ của lịch bị hủy
//            hay bị override về trạng thái khác là hồ sơ mồ côi, phải ẩn).
export type RecordView =
  | { kind: 'content' }
  | { kind: 'empty'; text: string; hint: string }
  | { kind: 'note'; text: string; italic: boolean };

export function recordView(trangThai: string, hasRecord: boolean): RecordView {
  switch (trangThai) {
    case 'DaTiepDon':
      return hasRecord
        ? { kind: 'content' }
        : {
            kind: 'empty',
            text: RECORD_TEXT.notStarted,
            hint: RECORD_TEXT.notStartedHint,
          };
    case 'HoanThanh':
      return hasRecord
        ? { kind: 'content' }
        : {
            kind: 'empty',
            text: RECORD_TEXT.completedWithout,
            hint: RECORD_TEXT.completedWithoutHint,
          };
    case 'ChoThanhToan':
    case 'DaXacNhan':
      return { kind: 'note', text: RECORD_TEXT.pending, italic: false };
    default:
      return { kind: 'note', text: RECORD_TEXT.none, italic: true };
  }
}

const pad = (value: number) => String(value).padStart(2, '0');
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

// Việt Nam không có giờ mùa hè: cố định +07:00, nên không phụ thuộc múi giờ của máy (cộng 7 giờ rồi đọc theo UTC). `iso` là `capNhatLanCuoi` đã được bộ đọc kiểm ISO 8601; chuỗi không phải ngày ⇒ `null`
// (thẻ bỏ dòng này thay vì in "NaN").
export function formatUpdatedAt(iso: string): string | null {
  // `Date.parse` còn nhận dạng không phải ISO (ví dụ `10/06/2026 17:30` hiểu là tháng 10): chỉ nhận ISO 8601 (có `T` và giờ phút)
  if (!ISO_DATE_TIME.test(iso)) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const vn = new Date(ms + 7 * 60 * 60 * 1000);
  return `${pad(vn.getUTCHours())}:${pad(vn.getUTCMinutes())} ngày ${pad(vn.getUTCDate())}/${pad(vn.getUTCMonth() + 1)}/${vn.getUTCFullYear()}`;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

// `YYYY-MM-DD` ⇒ `dd/MM/yyyy` bằng cắt chuỗi, KHÔNG qua `Date` (ngày tái khám không có múi giờ); sai dạng ⇒ `null` (thẻ bỏ khối)
export function formatReturnDate(isoDate: string): string | null {
  const match = DATE_ONLY.exec(isoDate);
  return match === null ? null : `${match[3]}/${match[2]}/${match[1]}`;
}
