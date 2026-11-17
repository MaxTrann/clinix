// Sáu bước của luồng đặt lịch và nhãn của thanh bước, lấy NGUYÊN VĂN từ Figma (frame `449:2`, `451:2`, `452:2`, `453:2`).
// Nhãn bước 4 ở Figma là "Người khám" (PLAN và issue gọi "Thông tin"; tiêu đề trang Bước 4 là "Thông tin người khám").
// Bước Thanh toán KHÔNG có nhãn riêng: Figma vẫn cho bước 5 "Xác nhận" đang chọn.
export const WIZARD_STEPS = [
  { number: 1, label: 'Nhóm dịch vụ' },
  { number: 2, label: 'Dịch vụ khám' },
  { number: 3, label: 'Bác sĩ & giờ' },
  { number: 4, label: 'Người khám' },
  { number: 5, label: 'Xác nhận' },
  { number: 6, label: 'Hoàn tất' },
] as const;

export type StepNumber = (typeof WIZARD_STEPS)[number]['number'];
