import type { ChatbotReply, Doan } from '../api/chatbot-types';

// CHỈ DÙNG TRONG TEST. Mẫu phản hồi đúng hình dạng PLAN 5.12 (và hợp đồng `doan` đã duyệt: ngắt đoạn nằm trong `chu` bằng `\n\n`).
// Chữ là chữ mẫu, không phải dữ liệu thật.
export const chu = (text: string): Doan => ({ kieu: 'chu', chu: text });

export const thucThe = (doiTuong: string, id: string, text: string): Doan => ({
  kieu: 'thucThe',
  doiTuong,
  id,
  chu: text,
});

export function reply(overrides: Partial<ChatbotReply> = {}): ChatbotReply {
  return {
    ketQua: 'TraLoi',
    doan: [chu('Câu trả lời mẫu.')],
    chuyenKhoaGoiY: [],
    lienKet: [],
    coTheGuiLai: false,
    tinhVaoLichSu: true,
    ...overrides,
  };
}

export const traLoi = (text: string, overrides: Partial<ChatbotReply> = {}) =>
  reply({ ketQua: 'TraLoi', doan: [chu(text)], ...overrides });

export const goiY = (overrides: Partial<ChatbotReply> = {}) =>
  reply({
    ketQua: 'GoiY',
    doan: [
      chu('Bạn có thể cân nhắc chuyên khoa '),
      thucThe('ChuyenKhoa', '3', 'Nội tổng quát'),
      chu('.'),
    ],
    chuyenKhoaGoiY: [{ chuyenKhoaId: '3', ten: 'Nội tổng quát' }],
    ...overrides,
  });

export const khanCap = (overrides: Partial<ChatbotReply> = {}) =>
  reply({
    ketQua: 'KhanCap',
    doan: [
      chu(
        'Có thể là tình huống khẩn cấp. Hãy gọi 115 hoặc đến cơ sở y tế gần nhất ngay. Trợ lý AI không xử lý cấp cứu.',
      ),
      chu('\n\nChi nhánh gần bạn: '),
      thucThe('ChiNhanh', '2', 'CLINIX Quận 1'),
      chu(', 12 Đường Mẫu, Quận 1.'),
    ],
    lienKet: ['GoiCapCuu', 'NhanTinLeTan'],
    ...overrides,
  });

export const duPhong = (overrides: Partial<ChatbotReply> = {}) =>
  reply({
    ketQua: 'DuPhong',
    doan: [
      chu(
        'Trợ lý AI hiện không phản hồi, vui lòng thử lại sau\n\nTrợ lý AI không chẩn đoán, không kê đơn. Trong lúc này bạn có thể tra cứu bác sĩ và lịch khám hoặc nhắn lễ tân.',
      ),
    ],
    lienKet: ['TraCuuBacSi', 'NhanTinLeTan'],
    coTheGuiLai: true,
    tinhVaoLichSu: false,
    ...overrides,
  });

export const taiKhoan = () =>
  reply({
    ketQua: 'TaiKhoan',
    doan: [
      chu(
        'Trợ lý không xem được dữ liệu tài khoản. Bạn xem tại Lịch hẹn của tôi hoặc Ví của tôi.',
      ),
    ],
    lienKet: ['LichHenCuaToi', 'ViCuaToi'],
  });

export const ngoaiPhamVi = () =>
  reply({
    ketQua: 'NgoaiPhamVi',
    doan: [chu('Trợ lý AI không chẩn đoán và không kê đơn.')],
    lienKet: ['TraCuuBacSi'],
  });

export const khongKhopDuLieu = () =>
  reply({
    ketQua: 'KhongKhopDuLieu',
    doan: [chu('Chưa đủ dữ liệu để trả lời chính xác phần này.')],
    lienKet: ['TraCuuBacSi', 'NhanTinLeTan'],
  });

export const khongCoChuyenKhoa = () =>
  reply({
    ketQua: 'KhongCoChuyenKhoa',
    doan: [chu('Chưa xác định được chuyên khoa phù hợp.')],
    lienKet: ['TraCuuBacSi'],
  });
