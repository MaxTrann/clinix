import { afterEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthHooks } from '../../../../../shared/api/auth-hooks';
import {
  ApiError,
  UnexpectedResponseError,
} from '../../../../../shared/api/errors';
import {
  getPatientAppointment,
  parsePatientAppointmentDetail,
} from './patient-appointment-detail-api';

// booking F2: bộ kiểm hình dạng và lời gọi `GET /patient/appointments/:maLichHen` (hợp đồng B2, TRACKING 3.15, 3.27 F2-D). Mã LCT là [đề xuất] (PLAN booking mục
// 7.33 sau khi duyệt); mỗi ca ghi mã. Dữ liệu giả: đủ mười chín khoá (reschedule F1: thêm `choPhepDoiLich`, `yeuCauDoiLich` theo PLAN reschedule 5.8, mã WDH-13 [đề xuất]).
const DETAIL = {
  maLichHen: 'CP20261020001',
  trangThai: 'DaXacNhan',
  thoiGian: '2026-10-20T01:00:00.000Z',
  bacSi: 'Nguyễn Minh Anh',
  chuyenKhoa: 'Tim mạch',
  chiNhanh: 'CLINIX Quận 1',
  dichVu: 'Khám tim mạch',
  nguoiKham: { hoTen: 'Nguyễn Văn A', laBanThan: true },
  giaSnapshot: '300000.00',
  tienCoc: '100000.00',
  hanThanhToan: null,
  choPhepHuy: true,
  lyDoKham: 'Đau ngực nhẹ',
  thanhToan: null,
  hoanTien: null,
  thoiGianMayChu: '2026-10-18T02:00:00.123Z',
  moc: {
    xacNhan: '2026-10-16T03:00:00.000Z',
    tiepDon: null,
    hoanThanh: null,
  },
  choPhepDoiLich: true,
  yeuCauDoiLich: null,
};
const REQUEST = {
  trangThai: 'TuChoi',
  thoiGianMongMuon: '2026-10-22T02:00:00.000Z',
  ghiChuXuLy: 'Khung giờ này đã có lịch ưu tiên.',
  thoiDiemTao: '2026-10-18T01:00:00.000Z',
};
const PAYMENT = {
  daThu: '100000.00',
  conPhaiThu: '200000.00',
  giaoDich: [
    {
      phuongThuc: 'Vi',
      soTien: '100000.00',
      thoiDiem: '2026-10-18T01:00:00.000Z',
    },
  ],
};
const REFUND = {
  soTien: '50000.00',
  trangThai: 'ThanhCong',
  thoiDiem: '2026-10-19T01:00:00.000Z',
};

const unusable = (raw: unknown) =>
  expect(() => parsePatientAppointmentDetail(raw)).toThrow(
    UnexpectedResponseError,
  );
const without = <T extends object>(value: T, key: keyof T) => {
  const copy = { ...value };
  delete copy[key];
  return copy;
};

describe('parsePatientAppointmentDetail', () => {
  it('LCT-05 đủ mười chín khoá ⇒ giữ nguyên mười hai khoá của danh sách, lyDoKham, thanhToan, hoanTien, thoiGianMayChu, moc (booking B19), choPhepDoiLich, yeuCauDoiLich (reschedule B5)', () => {
    expect(parsePatientAppointmentDetail(DETAIL)).toEqual(DETAIL);
  });

  it('WDH-13 `choPhepDoiLich` và `yeuCauDoiLich`: yêu cầu null hoặc đủ bốn khoá; `ghiChuXuLy` null (chưa xử lý) được giữ null', () => {
    expect(
      parsePatientAppointmentDetail({ ...DETAIL, choPhepDoiLich: false })
        .choPhepDoiLich,
    ).toBe(false);
    const withRequest = parsePatientAppointmentDetail({
      ...DETAIL,
      yeuCauDoiLich: REQUEST,
    });
    expect(withRequest.yeuCauDoiLich).toEqual(REQUEST);
    const pending = parsePatientAppointmentDetail({
      ...DETAIL,
      yeuCauDoiLich: { ...REQUEST, trangThai: 'ChoDuyet', ghiChuXuLy: null },
    });
    expect(pending.yeuCauDoiLich).toEqual({
      ...REQUEST,
      trangThai: 'ChoDuyet',
      ghiChuXuLy: null,
    });
    for (const trangThai of ['ChoDuyet', 'DaDuyet', 'TuChoi']) {
      expect(
        parsePatientAppointmentDetail({
          ...DETAIL,
          yeuCauDoiLich: { ...REQUEST, trangThai },
        }).yeuCauDoiLich?.trangThai,
      ).toBe(trangThai);
    }
  });

  it('WDH-13 thiếu `choPhepDoiLich` hay `yeuCauDoiLich` (kể cả khi có thể null) ⇒ phản hồi 17 khoá cũ KHÔNG dùng được', () => {
    unusable(without(DETAIL, 'choPhepDoiLich'));
    unusable(without(DETAIL, 'yeuCauDoiLich'));
    unusable(without(without(DETAIL, 'choPhepDoiLich'), 'yeuCauDoiLich'));
  });

  it('WDH-13 sai kiểu hay sai hình dạng của hai khoá mới ⇒ không dùng được', () => {
    unusable({ ...DETAIL, choPhepDoiLich: 'true' });
    unusable({ ...DETAIL, choPhepDoiLich: 1 });
    unusable({ ...DETAIL, choPhepDoiLich: null });
    unusable({ ...DETAIL, yeuCauDoiLich: 'ChoDuyet' });
    unusable({ ...DETAIL, yeuCauDoiLich: [] });
    // trạng thái lạ: không đoán nhãn cho một trạng thái yêu cầu chưa biết
    unusable({
      ...DETAIL,
      yeuCauDoiLich: { ...REQUEST, trangThai: 'DangXuLy' },
    });
    unusable({
      ...DETAIL,
      yeuCauDoiLich: { ...REQUEST, trangThai: 'choduyet' },
    });
    unusable({
      ...DETAIL,
      yeuCauDoiLich: { ...REQUEST, thoiGianMongMuon: 'mai' },
    });
    unusable({ ...DETAIL, yeuCauDoiLich: { ...REQUEST, thoiDiemTao: 5 } });
    unusable({ ...DETAIL, yeuCauDoiLich: { ...REQUEST, ghiChuXuLy: 5 } });
    for (const key of [
      'trangThai',
      'thoiGianMongMuon',
      'ghiChuXuLy',
      'thoiDiemTao',
    ] as const) {
      unusable({ ...DETAIL, yeuCauDoiLich: without(REQUEST, key) });
    }
  });

  it('WDH-13 khoá thừa của yêu cầu (id, người xử lý) không lọt ra kết quả', () => {
    const parsed = parsePatientAppointmentDetail({
      ...DETAIL,
      yeuCauDoiLich: {
        ...REQUEST,
        yeuCauId: '5',
        nguoiXuLyId: '9',
        lyDoYeuCau: 'LO_RA',
      },
    });
    expect(JSON.stringify(parsed.yeuCauDoiLich)).not.toMatch(
      /yeuCauId|nguoiXuLyId|LO_RA/,
    );
  });

  it('LCT-05 khoá thừa của API (id nội bộ, mã cổng thanh toán, giao dịch) không lọt ra kết quả', () => {
    const parsed = parsePatientAppointmentDetail({
      ...DETAIL,
      lichHenId: '9007199254740993',
      benhNhanId: '7',
      thanhToan: { ...PAYMENT, maCong: 'SECRET' },
      hoanTien: { ...REFUND, viId: '5' },
    });
    expect(parsed.thanhToan).toEqual({
      daThu: '100000.00',
      conPhaiThu: '200000.00',
    });
    expect(parsed.hoanTien).toEqual({
      soTien: '50000.00',
      trangThai: 'ThanhCong',
    });
    expect(JSON.stringify(parsed)).not.toMatch(
      /lichHenId|benhNhanId|SECRET|viId|giaoDich/,
    );
  });

  it('LCT-03 thanhToan và hoanTien có hình dạng đúng ⇒ đọc được; hoanTien ThatBai cũng đọc được', () => {
    const parsed = parsePatientAppointmentDetail({
      ...DETAIL,
      thanhToan: PAYMENT,
      hoanTien: { ...REFUND, trangThai: 'ThatBai' },
    });
    expect(parsed.thanhToan?.daThu).toBe('100000.00');
    expect(parsed.hoanTien?.trangThai).toBe('ThatBai');
  });

  it('LCT-05 lyDoKham là null ⇒ giữ null (không biến thành chuỗi rỗng hay "null")', () => {
    expect(
      parsePatientAppointmentDetail({ ...DETAIL, lyDoKham: null }).lyDoKham,
    ).toBeNull();
  });

  it('LCT-05 thiếu khoá bắt buộc (kể cả khoá có thể null) ⇒ phản hồi không dùng được', () => {
    for (const key of [
      'maLichHen',
      'lyDoKham',
      'thanhToan',
      'hoanTien',
      'thoiGianMayChu',
      'moc',
      'choPhepHuy',
      'giaSnapshot',
    ] as const) {
      unusable(without(DETAIL, key));
    }
  });

  it('MOW-03 moc: đúng ba khoá, mỗi khoá ISO hoặc null; thiếu khoá con, sai dạng ngày, sai kiểu hay không phải đối tượng ⇒ không dùng được; khoá thừa không lọt ra', () => {
    const ALL = {
      xacNhan: '2026-10-16T03:00:00.000Z',
      tiepDon: '2026-10-18T01:20:00.000Z',
      hoanThanh: '2026-10-18T02:00:00.000Z',
    };
    const NONE = { xacNhan: null, tiepDon: null, hoanThanh: null };
    expect(parsePatientAppointmentDetail({ ...DETAIL, moc: ALL }).moc).toEqual(
      ALL,
    );
    expect(parsePatientAppointmentDetail({ ...DETAIL, moc: NONE }).moc).toEqual(
      NONE,
    );
    expect(
      JSON.stringify(
        parsePatientAppointmentDetail({
          ...DETAIL,
          moc: { ...ALL, mocKhac: 'LO_RA' },
        }),
      ),
    ).not.toContain('LO_RA');
    for (const moc of [
      null,
      [],
      'moc',
      { xacNhan: ALL.xacNhan, tiepDon: null },
      { ...ALL, tiepDon: 'hôm qua' },
      { ...ALL, hoanThanh: '' },
      { ...ALL, xacNhan: 5 },
      { ...ALL, tiepDon: undefined },
    ])
      expect(() => parsePatientAppointmentDetail({ ...DETAIL, moc })).toThrow(
        UnexpectedResponseError,
      );
  });

  it('LCT-05 sai kiểu hay sai hình dạng ⇒ phản hồi không dùng được', () => {
    unusable(null);
    unusable([]);
    unusable('chi tiết');
    unusable({ ...DETAIL, lyDoKham: 5 });
    unusable({ ...DETAIL, thoiGianMayChu: 'hôm qua' });
    unusable({ ...DETAIL, giaSnapshot: '300000,00' });
    // thanhToan sai hình: không phải đối tượng, thiếu khoá hiển thị, tiền sai dạng
    unusable({ ...DETAIL, thanhToan: 'đã thu' });
    unusable({ ...DETAIL, thanhToan: { conPhaiThu: '1.00' } });
    unusable({ ...DETAIL, thanhToan: { daThu: '1e5', conPhaiThu: '1.00' } });
    // hoanTien: trạng thái lạ hay tiền sai dạng
    unusable({ ...DETAIL, hoanTien: { ...REFUND, trangThai: 'DangXuLy' } });
    unusable({ ...DETAIL, hoanTien: { ...REFUND, soTien: '-5.00' } });
  });

  it('LCT-03 tiền giữ nguyên dạng chuỗi, kể cả số lớn hơn 2^53 (không qua Number)', () => {
    const parsed = parsePatientAppointmentDetail({
      ...DETAIL,
      giaSnapshot: '9007199254740993.00',
      thanhToan: { daThu: '9007199254740993.00', conPhaiThu: '0.00' },
    });
    expect(parsed.giaSnapshot).toBe('9007199254740993.00');
    expect(parsed.thanhToan?.daThu).toBe('9007199254740993.00');
  });
});

describe('getPatientAppointment', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setApiAuthHooks(null);
  });

  function stubFetch(response: Response) {
    setApiAuthHooks({
      getAccessToken: () => 'token-gia',
      recoverFromUnauthorized: async () => false,
    });
    // Bản sao mỗi lần gọi: thân `Response` chỉ đọc được một lần
    const fetchMock = vi.fn(async () => response.clone());
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('LCT-05 GET đúng đường dẫn đã mã hoá, gắn token, không thân', async () => {
    const fetchMock = stubFetch(Response.json(DETAIL));
    const detail = await getPatientAppointment('CP 2026/10?x');

    expect(detail.maLichHen).toBe('CP20261020001');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('/api/patient/appointments/CP%202026%2F10%3Fx');
    expect(init.method).toBe('GET');
    expect(new Headers(init.headers).get('Authorization')).toBe(
      'Bearer token-gia',
    );
    expect(init.body).toBeUndefined();
  });

  it('LCT-06 404 KHONG_TIM_THAY ⇒ ApiError với maLoi; thân không phải JSON ⇒ UnexpectedResponseError', async () => {
    stubFetch(
      Response.json(
        { maLoi: 'KHONG_TIM_THAY', thongBao: 'x' },
        { status: 404 },
      ),
    );
    await expect(getPatientAppointment('A')).rejects.toMatchObject({
      maLoi: 'KHONG_TIM_THAY',
    });
    await expect(getPatientAppointment('A')).rejects.toBeInstanceOf(ApiError);

    stubFetch(new Response('<html>502</html>', { status: 502 }));
    await expect(getPatientAppointment('A')).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
  });
});
