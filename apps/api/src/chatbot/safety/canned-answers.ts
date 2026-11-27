// chatbot B1 — CÂU DỰNG SẴN của hệ thống (PLAN chatbot 5.16, Q4, Q6, Q13; 2.4.7 A1, A2, A3, A4; 2.4.76 A1). Hằng, KHÔNG do AI viết:
// khi mô hình trả `khanCap` hay `ngoaiPhamVi`, hay mọi lớp AI hỏng, hay đối chiếu thất bại, máy chủ dùng đúng các câu này và bỏ chữ của mô hình.
// Không có lời khuyên y khoa nào ngoài "gọi 115 hoặc đến cơ sở y tế gần nhất" (Q6). Câu của nhóm tự hại cũng là câu khẩn cấp này (một câu theo Q6).
// Chữ `[đề xuất]` trừ các câu trích nguyên văn 2.4.7 (3b: "Trợ lý AI hiện không phản hồi…"); Đại duyệt nguyên văn ngày 27/11/2026 bằng hộp câu hỏi (xem TRACKING).
//
// Chỗ chatbot B3 phải nối (không làm ở đây vì cần DB hay trang khác):
//  - `KhanCap`: ghép thêm ĐỊA CHỈ CHI NHÁNH (đọc từ DB) vào cuối `doan`; `NhanTinLeTan` chỉ là liên kết khi trang Tin nhắn có (`[CHỜ chat]`), chưa có thì
//    web hiện đường dây nóng; đoạn ghi chú lễ tân bên dưới đã nói rõ lễ tân không trực cấp cứu.
//  - `doan` ở đây là mảng CHỮ; B3 đổi thành `{ kieu: 'chu', chu }` theo 5.7. Hai cờ `coTheGuiLai`, `tinhVaoLichSu` là mặc định theo loại, B3 đổi được.

export type CannedKind =
  | 'KhanCap'
  | 'NgoaiPhamVi'
  | 'TaiKhoan'
  | 'KhongKhopDuLieu'
  | 'DuPhong'
  | 'KhongCoChuyenKhoa';

/** Mã đích của liên kết (5.12): web tự dựng đường dẫn, máy chủ không trả URL. */
export type LinkCode =
  'TraCuuBacSi' | 'NhanTinLeTan' | 'LichHenCuaToi' | 'ViCuaToi' | 'GoiCapCuu';

export interface CannedAnswer {
  /** Giá trị `ketQua` của API (5.12, 5.16). */
  readonly ketQua: CannedKind;
  /** Các đoạn chữ, theo thứ tự hiển thị. */
  readonly doan: readonly string[];
  readonly lienKet: readonly LinkCode[];
  /** Hiện nút "Gửi lại" (Q13: chỉ khi AI hỏng). */
  readonly coTheGuiLai: boolean;
  /** Lượt này có được gửi kèm vào lịch sử lần sau không (Q13: lượt lỗi thì không). */
  readonly tinhVaoLichSu: boolean;
}

function answer(
  ketQua: CannedKind,
  doan: readonly string[],
  lienKet: readonly LinkCode[],
  flags: { coTheGuiLai: boolean; tinhVaoLichSu: boolean } = {
    coTheGuiLai: false,
    tinhVaoLichSu: true,
  },
): CannedAnswer {
  // Đóng băng để không nơi nào vô tình sửa hằng dùng chung
  return Object.freeze({
    ketQua,
    doan: Object.freeze([...doan]),
    lienKet: Object.freeze([...lienKet]),
    ...flags,
  });
}

export const CANNED_ANSWERS: Readonly<Record<CannedKind, CannedAnswer>> =
  Object.freeze({
    KhanCap: answer(
      'KhanCap',
      [
        'Có thể là tình huống khẩn cấp. Hãy gọi 115 hoặc đến cơ sở y tế gần nhất ngay. Trợ lý AI không xử lý cấp cứu.',
        'Lễ tân không trực cấp cứu. Đừng chờ tin nhắn trả lời; hãy gọi 115 hoặc đến cơ sở y tế gần nhất.',
      ],
      ['GoiCapCuu', 'NhanTinLeTan'],
    ),
    NgoaiPhamVi: answer(
      'NgoaiPhamVi',
      [
        'Trợ lý AI không chẩn đoán và không kê đơn. Bạn nên gặp bác sĩ để được thăm khám; nếu mô tả triệu chứng, tôi có thể gợi ý chuyên khoa.',
      ],
      ['TraCuuBacSi'],
    ),
    TaiKhoan: answer(
      'TaiKhoan',
      [
        'Trợ lý không xem được dữ liệu tài khoản. Bạn xem tại Lịch hẹn của tôi hoặc Ví của tôi.',
      ],
      ['LichHenCuaToi', 'ViCuaToi'],
    ),
    KhongKhopDuLieu: answer(
      'KhongKhopDuLieu',
      [
        'Chưa đủ dữ liệu để trả lời chính xác phần này. Bạn có thể tra cứu bác sĩ và lịch khám hoặc nhắn lễ tân.',
      ],
      ['TraCuuBacSi', 'NhanTinLeTan'],
    ),
    // Hai đoạn: câu 3b của 2.4.7 (nguyên văn, không dấu chấm cuối), rồi câu dựng sẵn của 2.4.76 A1 (không chẩn đoán, không kê đơn, nêu giới hạn)
    DuPhong: answer(
      'DuPhong',
      [
        'Trợ lý AI hiện không phản hồi, vui lòng thử lại sau',
        'Trợ lý AI không chẩn đoán, không kê đơn. Trong lúc này bạn có thể tra cứu bác sĩ và lịch khám hoặc nhắn lễ tân.',
      ],
      ['TraCuuBacSi', 'NhanTinLeTan'],
      { coTheGuiLai: true, tinhVaoLichSu: false },
    ),
    KhongCoChuyenKhoa: answer(
      'KhongCoChuyenKhoa',
      [
        'Chưa xác định được chuyên khoa phù hợp. Hãy mô tả rõ hơn hoặc tự chọn chuyên khoa ở Tra cứu bác sĩ và lịch khám.',
      ],
      ['TraCuuBacSi'],
    ),
  });

export function getCannedAnswer(kind: CannedKind): CannedAnswer {
  return CANNED_ANSWERS[kind];
}
