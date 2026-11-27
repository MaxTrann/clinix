import type {
  SpecialtyOption,
  SuggestedDoctor,
  SuggestedSlot,
  Suggestion,
} from '../api/chatbot-types';

// CHỈ DÙNG TRONG TEST. Mẫu thân 200 của `GET /chatbot/suggestions` đúng hợp đồng chatbot B4 (`suggestion.dto.ts`). Dữ liệu là chữ mẫu,
// không phải dữ liệu thật. Giờ mẫu: `02:30Z` là 09:30 giờ Việt Nam.
export const slot = (
  khungGioId: string,
  batDau: string,
  overrides: Partial<SuggestedSlot> = {},
): SuggestedSlot => ({ khungGioId, batDau, ca: 'CaSang', ...overrides });

export function doctor(
  overrides: Partial<SuggestedDoctor> = {},
): SuggestedDoctor {
  return {
    bacSiId: '11',
    hoTen: 'Nguyễn Minh Anh',
    chucDanh: 'TS_BS',
    chiNhanh: {
      chiNhanhId: '2',
      ten: 'CLINIX Quận 1',
      diaChi: '12 Đường Mẫu, Quận 1',
    },
    giaKham: '350000.00',
    danhGia: { diemTrungBinh: '4.5', soDanhGia: 12 },
    khungGio: [
      slot('101', '2026-11-28T02:30:00.000Z'),
      slot('102', '2026-11-28T03:00:00.000Z'),
    ],
    ...overrides,
  };
}

export const secondDoctor = (): SuggestedDoctor =>
  doctor({
    bacSiId: '12',
    hoTen: 'Trần Quốc Huy',
    chucDanh: 'BS_CKII',
    chiNhanh: {
      chiNhanhId: '3',
      ten: 'CLINIX Thủ Đức',
      diaChi: '5 Đường Thử, Thủ Đức',
    },
    giaKham: '420000.00',
    danhGia: { diemTrungBinh: null, soDanhGia: 0 },
    khungGio: [slot('201', '2026-11-28T07:00:00.000Z', { ca: 'CaChieu' })],
  });

export function suggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    chuyenKhoa: { chuyenKhoaId: '3', ten: 'Nội tổng quát' },
    ngay: '2026-11-28',
    bacSi: [doctor(), secondDoctor()],
    ...overrides,
  };
}

// Không có bác sĩ nào còn giờ trống (2.4.7 A5): `lyDoRong` chỉ có khi `bacSi` rỗng
export const emptySuggestion = (
  lyDoRong: 'KhongCoKhungGio' | 'KhongCoBacSi' = 'KhongCoKhungGio',
  overrides: Partial<Suggestion> = {},
): Suggestion => suggestion({ bacSi: [], ngay: null, lyDoRong, ...overrides });

export const specialty = (
  chuyenKhoaId: string,
  ten: string,
): SpecialtyOption => ({ chuyenKhoaId, ten });

export const SPECIALTIES: SpecialtyOption[] = [
  specialty('1', 'Tim mạch'),
  specialty('3', 'Nội tổng quát'),
  specialty('5', 'Da liễu'),
];
