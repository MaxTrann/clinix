// Đường dẫn của tên thực thể trong câu trả lời. Chatbot không import `features/search` (PLAN 1.2) nên giữ ba mẫu riêng;
// `router/chatbot-widget-route.test.tsx` khoá chúng vào bảng route thật. KHÔNG tự bịa route: `DichVu` không có trang theo id
// (đường dẫn dịch vụ cần thêm mã nhóm mà phản hồi không có) nên hiện chữ thường (Đại duyệt 27/11/2026, Đ6).
const ID_PATTERN = /^[1-9]\d{0,18}$/;

export const DOCTOR_LOOKUP_PATH = '/bac-si';

function basePath(doiTuong: string): string | null {
  switch (doiTuong) {
    case 'BacSi':
      return '/bac-si';
    case 'ChuyenKhoa':
      return '/chuyen-khoa';
    case 'ChiNhanh':
      return '/chi-nhanh';
    default:
      return null;
  }
}

// null = không dựng liên kết (loại không có trang, loại lạ, hay id không phải số nguyên dương dạng chuỗi)
export function entityPath(doiTuong: string, id: string): string | null {
  const base = basePath(doiTuong);
  if (base === null || !ID_PATTERN.test(id)) return null;
  return `${base}/${id}`;
}

// Số điện thoại trong `href="tel:…"`: bỏ khoảng trắng, chấm, gạch, ngoặc; chỉ nhận chữ số (có thể có `+` đầu).
// null = không phải số điện thoại: hiện chữ, không tạo liên kết gọi.
export function telHref(phone: string): string | null {
  const digits = phone.replace(/[\s.\-()]/g, '');
  return /^\+?\d{4,15}$/.test(digits) ? `tel:${digits}` : null;
}
