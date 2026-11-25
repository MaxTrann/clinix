import type {
  RequestDetail,
  RequestRow,
} from '../appointments/common/reschedule-requests/request-types';

// Dữ liệu mẫu của yêu cầu đổi lịch cho test web (reschedule F4). Dữ liệu giả, không phải của ai. Hình dạng đúng hợp đồng THẬT của B8 (TRACKING mục 7 khối B8): dòng 10 khoá, chi tiết 19 khoá.

export function makeRequestRow(
  overrides: Partial<RequestRow> = {},
): RequestRow {
  return {
    yeuCauId: '101',
    trangThai: 'ChoDuyet',
    thoiDiemTao: '2026-11-05T02:30:15.000Z',
    maLichHen: 'CLX-20261120-7K3M9',
    nguoiKham: { hoTen: 'Nguyễn Văn A', laNguoiThan: false },
    bacSi: { hoTen: 'Lê Thảo Vy' },
    chiNhanh: { id: '3', ten: 'CLINIX Quận 1' },
    thoiGianCu: '2026-11-20T02:00:00.000Z',
    thoiGianMongMuon: '2026-11-27T03:30:00.000Z',
    soLanDaTuDoi: 2,
    ...overrides,
  };
}

export function makeRequestDetail(
  overrides: Partial<RequestDetail> = {},
): RequestDetail {
  return {
    ...makeRequestRow(),
    soLanToiDa: 2,
    lyDoYeuCau: 'Tôi có việc đột xuất vào hôm đó.',
    trangThaiLichGoc: 'DaXacNhan',
    coTheDuyet: true,
    lyDoKhongDuyet: null,
    khungGioMongMuon: { khungGioId: '555', trangThai: 'ConTrong' },
    ghiChuXuLy: null,
    thoiDiemXuLy: null,
    nguoiXuLy: null,
    ...overrides,
  };
}

// Chi tiết của yêu cầu ĐÃ xử lý: ba khoá xử lý có giá trị
export function makeHandledDetail(
  trangThai: 'DaDuyet' | 'TuChoi',
  overrides: Partial<RequestDetail> = {},
): RequestDetail {
  // `trangThai` đứng SAU `overrides`: tham số tường minh thắng (`overrides` có thể là một dòng `RequestRow` mang `trangThai: 'ChoDuyet'`)
  return makeRequestDetail({
    coTheDuyet: false,
    lyDoKhongDuyet: 'YEU_CAU_DA_XU_LY',
    ghiChuXuLy: 'Đã liên hệ bệnh nhân.\nXác nhận lịch mới.',
    thoiDiemXuLy: '2026-11-06T03:00:00.000Z',
    nguoiXuLy: { hoTen: 'Trần Thị Lễ Tân' },
    ...overrides,
    trangThai,
  });
}

// Mã lịch hẹn thật của B8: `CLX-yyyyMMdd-` cộng năm ký tự Crockford (bỏ I, L, O, U)
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function makeAppointmentCode(index: number): string {
  const suffix = Array.from({ length: 5 }, (_, position) =>
    CROCKFORD.charAt(Math.floor(index / 32 ** (4 - position)) % 32),
  ).join('');
  return `CLX-20261120-${suffix}`;
}

// `count` dòng có id và mã khác nhau; `thoiDiemTao` lùi dần theo giờ để có thứ tự rõ ràng (dòng đầu mới nhất)
export function makeRequestRows(
  count: number,
  overrides: Partial<RequestRow> = {},
): RequestRow[] {
  return Array.from({ length: count }, (_, index) =>
    makeRequestRow({
      yeuCauId: String(100 + index + 1),
      maLichHen: makeAppointmentCode(index + 1),
      thoiDiemTao: new Date(
        Date.UTC(2026, 10, 5, 2, 30, 15) - index * 3_600_000,
      ).toISOString(),
      ...overrides,
    }),
  );
}
