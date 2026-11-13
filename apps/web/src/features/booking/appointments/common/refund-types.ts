// Số hoàn của một lần huỷ lịch hẹn (booking F2 viết trong `patient/`, chuyển lên `common/` ở F9 để hộp huỷ của Lễ tân dùng cùng MỘT kiểu và MỘT bộ đọc).
// `tyLe` nguyên 0 đến 100, `soTien` chuỗi decimal của máy chủ. Client KHÔNG tính ra số này, chỉ hiện.
export interface RefundAmount {
  tyLe: number;
  soTien: string;
}
