// Kiểu dữ liệu của module booking (phần web). F3 chỉ có kết quả của cổng vào; F4 đến F7 thêm kiểu của người thân, `checks`, lịch hẹn.

// `GET /booking/eligibility` (B7; PLAN booking 5.9): HTTP 200 kể cả khi bị khoá, vì đây là KẾT QUẢ của cổng chứ không phải lỗi.
// `lyDo` chỉ có khi `choPhepDatLich = false`. API không trả số lần vắng mặt hay ngưỡng khoá nên giao diện không giữ số nào.
export interface EligibilityResult {
  choPhepDatLich: boolean;
  lyDo?: string;
  soLichHenToiDaMoiHoSo: number;
}

// Hồ sơ người thân ĐANG HIỆU LỰC của `GET /patient/relatives` (booking F4; PLAN 5.13): bộ đọc chỉ giữ bốn khoá cần để vẽ hộp chọn và bỏ hồ sơ ngừng sử dụng.
// Không giữ `gioiTinh`, `ngaySinh`, `soDienThoai`: dữ liệu cá nhân mà Bước 4 chưa dùng.
export interface VisitRelative {
  // BIGINT dạng chuỗi (có thể vượt 2^53): không bao giờ `Number`
  hoSoNguoiThanId: string;
  hoTen: string;
  // Mã `Cha`, `Me`, `Vo`… hoặc mã lạ: chỉ hiển thị qua `relationshipLabel`
  moiQuanHe: string;
}

// `tomTat` của `POST /booking/checks` (B7, 12 khoá): F4 chỉ giữ các khoá nó vẽ ở khối "Lịch hẹn đang chọn". F5 THÊM khoá của mình (giá, cọc, chính sách hoàn,
// chi nhánh…) vào CHÍNH kiểu và bộ đọc này, không viết bộ đọc thứ hai. Không có khoá giá nào ở đây.
export interface BookingSummary {
  dichVu: string;
  bacSi: { hoTen: string; chucDanh: string };
  // ISO 8601 UTC: hiển thị qua `formatVietnam*`, không bao giờ theo múi giờ của máy
  thoiGian: string;
}
