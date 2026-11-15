// Quét JSON phản hồi cho test danh sách trắng (DSV-08, LSH-14): gom MỌI khoá ở mọi độ sâu và mọi giá trị chuỗi, để test kiểm không khoá nào lộ id, email, băm và không giá trị nào là dữ liệu
// ngoài danh sách (SĐT bác sĩ, email). Dùng chung cho các e2e của danh sách lịch hẹn mới (B3 trở đi), để jscpd không thấy hàm quét lặp lại.

/** Mọi khoá của đối tượng ở mọi độ sâu (kể cả trong mảng), theo thứ tự duyệt. */
export function collectKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectKeys);
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, inner]) => [
    key,
    ...collectKeys(inner),
  ]);
}

/** Mọi giá trị chuỗi ở mọi độ sâu. */
export function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (typeof value !== 'object' || value === null) return [];
  return Object.values(value).flatMap(collectStrings);
}

/** Khoá bị cấm trong JSON của danh sách trắng: id (kết thúc bằng `Id`), email, băm, ngày sinh, địa chỉ, giới tính. `soDienThoai` KHÔNG nằm đây: Lễ tân được thấy SĐT của người đặt (Q32), test tự kiểm giá trị. */
export const FORBIDDEN_KEY =
  /id$|email|mat_?khau|bam$|ngay_?sinh|dia_?chi|gioi_?tinh/i;

/**
 * Khoá bị cấm trong JSON của BÁC SĨ (B5, DSB-06): KHÁC `FORBIDDEN_KEY` vì Q33 CHO PHÉP `ngaySinh`, `gioiTinh`, `soDienThoai` (của người khám) và `chiNhanh`. Cấm: id (kết thúc bằng `Id`), email, băm,
 * địa chỉ, giá, cọc, hạn và trạng thái thanh toán, hoàn tiền, người đặt, tên chính bác sĩ (`bacSi`), thời gian máy chủ, và `lyDoHuy` (Figma `692:2` không hiện lý do huỷ; Q27). Viết theo từng cụm
 * (`giaSnapshot`, không phải `gia`) vì `gia` có trong `thoiGian`. `thanh_?toan` KHÔNG khớp khi đứng sau `cho`: `ChoThanhToan` là một trong sáu TÊN TRẠNG THÁI hợp lệ, là khoá của `demTheoTrangThai`
 * (không phải dữ liệu thanh toán); mọi khoá thanh toán khác (`thanhToan`, `hanThanhToan`, `trangThaiThanhToan`…) vẫn bị cấm.
 */
export const DOCTOR_FORBIDDEN_KEY =
  /id$|email|mat_?khau|bam$|dia_?chi|gia_?snapshot|tien_?coc|(?<!cho_?)thanh_?toan|hoan_?tien|ly_?do_?huy|nguoi_?dat|may_?chu|^bac_?si$/i;

/**
 * Khoá của HỒ SƠ KHÁM (dữ liệu sức khoẻ) mà Lễ tân, Quản trị viên và Bệnh nhân KHÔNG được thấy ở bất kỳ API booking nào (doctor-exam B3; PLAN H10, QHK-08): chỉ Bác sĩ phụ trách đọc nội dung (`GET /doctor/appointments/*`),
 * và `DOCTOR_FORBIDDEN_KEY` KHÔNG khớp các khoá này (hai regex bổ sung nhau, không chồng). Bốn khoá của PLAN H10 (`trieuChung`, `chanDoanSoBo`, `huongXuLy`, `ghiChuKham`) cộng ba khoá `[đề xuất]` cùng nhóm dữ liệu sức khoẻ:
 * `ngayTaiKhamDuKien`, `capNhatLanCuoi`, `coHoSoKham` (cờ "có hồ sơ" cũng là thông tin sức khoẻ). Khớp cả camelCase và snake_case, không phân biệt hoa thường.
 */
export const HEALTH_RECORD_KEY =
  /trieu_?chung|chan_?doan|huong_?xu_?ly|ghi_?chu_?kham|tai_?kham|cap_?nhat_?lan_?cuoi|co_?ho_?so_?kham/i;
