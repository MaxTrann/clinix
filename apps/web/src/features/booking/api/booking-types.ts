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

// `tomTat` của `POST /booking/checks` (B7, 12 khoá): F4 chỉ giữ các khoá nó vẽ ở khối "Lịch hẹn đang chọn" (không có khoá giá nào ở đây). F5 (Bước 5) cần đủ
// 12 khoá nên XẾP LỚP lên kiểu này (`BookingConfirmation` bên dưới) thay vì sửa nó: Bước 4 không bao giờ giữ giá hay cọc.
export interface BookingSummary {
  dichVu: string;
  bacSi: { hoTen: string; chucDanh: string };
  // ISO 8601 UTC: hiển thị qua `formatVietnam*`, không bao giờ theo múi giờ của máy
  thoiGian: string;
}

// Một mốc của chính sách hoàn cọc (`tomTat.chinhSachHoan`; B7, PLAN 5.4): huỷ trước giờ hẹn ít nhất `soGioTruocToiThieu` giờ thì hoàn `tyLeHoan` phần trăm.
// Cả hai là số nguyên (`tyLeHoan` từ 0 đến 100); mảng mốc sắp GIẢM DẦN theo số giờ.
export interface RefundTier {
  soGioTruocToiThieu: number;
  tyLeHoan: number;
}

// Đủ 12 khoá của `tomTat` cho Bước 5 "Xác nhận" (booking F5; Figma `451:2`; PLAN 5.9). Mọi số tiền là CHUỖI decimal của API, đi nguyên vẹn tới `formatVnd` (không `Number`,
// không cộng trừ ở client). `giaApDung` đã GỒM phụ phí (`giaApDung = giaDichVu + phuPhi`); `phuPhi` chỉ để hiển thị (Q46).
export interface BookingConfirmation extends BookingSummary {
  chuyenKhoa: string;
  chiNhanh: { ten: string; diaChi: string };
  // Người khám do máy chủ trả (tên, bản thân hay người thân), KHÔNG lấy từ bản nháp và KHÔNG có SĐT
  nguoiKham: { hoTen: string; laBanThan: boolean };
  giaDichVu: string;
  phuPhi: string;
  giaApDung: string;
  tienCoc: string;
  // `null` khi cọc 0; `[]` khi cọc > 0 mà chưa có mốc (không hoàn); mảng mốc giảm dần khi có
  chinhSachHoan: RefundTier[] | null;
  // Khoá LUÔN có mặt: chuỗi hoặc `null` (cọc 0, hay cổng ví còn là bản `Noop`). `null` KHÔNG có nghĩa "không đủ tiền".
  soDuVi: string | null;
}

// Thân của `POST /booking/appointments` (B8; PLAN 5.9): đúng ba khoá. Chủ sở hữu lấy từ access token, KHÔNG có `benhNhanId` hay khoá nào khác (400 `TRUONG_KHONG_DUOC_PHEP`).
// `hoSoNguoiThanId` là id chuỗi hay `null` (bản thân); `lyDoKham` ĐÃ chuẩn hoá ở Bước 4 hay `null`, không bao giờ `''`.
export interface CreateAppointmentBody {
  khungGioId: string;
  hoSoNguoiThanId: string | null;
  lyDoKham: string | null;
}

// 201 của `POST /booking/appointments` (B8): đúng 7 khoá. `canThanhToan` là tín hiệu DUY NHẤT để chọn đích sau khi tạo (cọc > 0 ⇒ `ChoThanhToan` ⇒ Thanh toán;
// cọc 0đ ⇒ `DaXacNhan` ngay ⇒ Hoàn tất); `hanThanhToan` là ISO UTC hoặc `null` (cọc 0đ).
export interface CreatedAppointment {
  maLichHen: string;
  trangThai: 'ChoThanhToan' | 'DaXacNhan';
  hanThanhToan: string | null;
  giaApDung: string;
  tienCoc: string;
  canThanhToan: boolean;
  thoiGianMayChu: string;
}
