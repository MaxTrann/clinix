import { ApiError } from '../../../../shared/api/errors';

// Chữ của trang "Hồ sơ khám bệnh" của Bệnh nhân (doctor-exam F5; Figma `414:2`, `415:2`, `443:2`; PLAN 4.5, 5.14). Chữ có trong Figma: `title`, `subtitle`, `allPeople`, `self`, `monthName`, `casesSuffix`, `hasRecord`, `noRecord`,
// `panePrompt`, `panePromptHint`, `visit.*`, `content.*`, `missing.*`, `detailLink`. Còn lại là [đề xuất] ĐÃ ĐƯỢC ĐẠI DUYỆT trực tiếp 16/11/2026 (Figma không có khung cho đang tải, rỗng, lỗi, tháng hơn 50 ca, tên truy cập).
// Nhãn khối hồ sơ in HOA bằng CSS ở thẻ (văn bản gốc "Triệu chứng", như Figma `443:2`). Hằng, không logic; hàm nhỏ chỉ ghép số vào câu.
export const PATIENT_TEXT = {
  title: 'Hồ sơ khám bệnh',
  subtitle: 'Lịch sử khám và ghi chú của bác sĩ cho các ca đã hoàn thành.',
  allPeople: 'Tất cả người đi khám',
  // Tên truy cập của ba nhóm nút lọc và của ngăn chi tiết
  peopleGroup: 'Lọc theo người khám',
  yearGroup: 'Năm',
  monthGroup: 'Chọn tháng',
  paneTitle: 'Chi tiết ca khám',
  // Số ca trống của một tháng ở ô lưới (Figma: dấu gạch ngắn)
  noCases: '–',
  casesSuffix: 'ca',
  loading: 'Đang tải hồ sơ khám bệnh...',
  paneLoading: 'Đang tải hồ sơ khám...',
  noneYet: 'Bạn chưa có ca khám nào đã hoàn thành.',
  noneInMonth: 'Tháng này chưa có ca khám nào đã hoàn thành.',
  notFound: 'Không tìm thấy ca khám này.',
  panePrompt: 'Chọn một ca khám để xem hồ sơ',
  panePromptHint: 'Nhấn vào mục bất kỳ ở danh sách bên trái',
  hasRecord: 'Đã có hồ sơ',
  noRecord: 'Chưa có hồ sơ',
  detailLink: 'Xem chi tiết lịch hẹn →',
  visit: {
    completed: 'Hoàn thành',
    doctor: 'Bác sĩ',
    date: 'Ngày khám',
    branch: 'Chi nhánh',
    examinee: 'Người khám',
  },
  content: {
    title: 'Nội dung hồ sơ khám',
    symptoms: 'Triệu chứng',
    diagnosis: 'Chẩn đoán sơ bộ',
    advice: 'Hướng xử lý / Lời khuyên',
    returnDate: 'Ngày tái khám dự kiến',
    // Chữ trống ở cột `text` của DB (XHS-14; PLAN 5.6)
    blank: 'Chưa ghi',
    updatedPrefix: 'Cập nhật lần cuối',
    updatedBy: 'bởi',
  },
  missing: {
    title: 'Chưa có hồ sơ khám',
    hint: 'Ca khám đã hoàn thành nhưng bác sĩ chưa ghi nội dung khám. Hồ sơ sẽ hiển thị tại đây sau khi bác sĩ cập nhật.',
  },
} as const;

export const noneInYear = (year: number): string =>
  `Năm ${year} chưa có ca khám nào đã hoàn thành.`;

// Tháng có hơn 50 ca (API tối đa 50 mỗi trang, chưa có chuyển trang: `TECH_DEBT` 166): báo đang hiện bao nhiêu trên tổng
export const truncatedNote = (shown: number, total: number): string =>
  `Hiển thị ${shown} trên ${total} ca. Hãy chọn người khám để thu hẹp.`;

// Số ca ở đầu thẻ danh sách: "2 ca"
export const casesLabel = (count: number): string =>
  `${count} ${PATIENT_TEXT.casesSuffix}`;

// Tên truy cập của ô tháng: "Tháng 5, 1 ca" và "Tháng 1, không có ca"
export const monthButtonName = (month: number, count: number): string =>
  count > 0
    ? `Tháng ${month}, ${casesLabel(count)}`
    : `Tháng ${month}, không có ${PATIENT_TEXT.casesSuffix}`;

// Mọi lỗi "không thấy" của chi tiết là CÙNG một 404 `KHONG_TIM_THAY` (B5): hộp lỗi riêng, không có `Thử lại` (thử lại không đổi được kết quả)
export function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && error.maLoi === 'KHONG_TIM_THAY';
}
