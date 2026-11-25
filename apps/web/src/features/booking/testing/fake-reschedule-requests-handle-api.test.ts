import { describe, expect, it } from 'vitest';
import {
  parseApproveResult,
  parseRejectResult,
} from '../appointments/common/reschedule-requests/request-handle-readers';
import { parseRequestDetail } from '../appointments/common/reschedule-requests/request-readers';
import { fakeRecord } from './fake-reschedule-requests-api';
import { createFakeRescheduleRequestsHandleApi } from './fake-reschedule-requests-handle-api';
import {
  makeHandledDetail,
  makeRequestDetail,
} from './reschedule-requests-fixtures';

// reschedule F4 Pha B1, WXD-85 `[đề xuất]` (như WDH-45 của F1, F2): khoá API giả GHI khớp HỢP ĐỒNG B9 (kế hoạch `1.13` mục 2.2 đến 2.7; B9 chưa merge nên khi B9 merge ca này là nơi đối chiếu đầu tiên): DTO chặt, thứ tự
// lỗi (400, 404, 409 đã xử lý, 409 có kiểu), 404 CÙNG thân, thành công ĐỔI kho, 409 giữ yêu cầu `ChoDuyet`, đúng ba hay hai khoá ở 200.
const BASE = 'http://localhost/api/reception/reschedule-requests';

const make = (...details: ReturnType<typeof makeRequestDetail>[]) => {
  const api = createFakeRescheduleRequestsHandleApi(
    async () => new Response('Không có trong API giả', { status: 404 }),
  );
  api.records = details.map((detail) => fakeRecord(detail));
  return api;
};

async function post(
  api: ReturnType<typeof make>,
  id: string,
  action: 'approve' | 'reject',
  body: unknown,
) {
  const response = await api.fetch(`${BASE}/${id}/${action}`, {
    method: 'POST',
    headers: { Authorization: 'x', 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    text,
    body: JSON.parse(text) as Record<string, unknown>,
  };
}

const NOTE_ERROR = { truong: 'ghiChu', ma: 'LY_DO_BAT_BUOC' };

describe('thành công', () => {
  it('WXD-85 duyệt: 200 ĐÚNG ba khoá qua bộ đọc thật; kho đổi sang `DaDuyet` với ba khoá xử lý; ghi chú đã cắt; lời gọi được ghi lại', async () => {
    const api = make(makeRequestDetail({ yeuCauId: '101' }));
    const { status, body } = await post(api, '101', 'approve', {
      ghiChu: '  Đã xác nhận.  ',
    });
    expect(status).toBe(200);
    expect(Object.keys(body).sort()).toEqual([
      'lichHenMoi',
      'thoiGianMayChu',
      'yeuCau',
    ]);
    expect(parseApproveResult(body).lichHenMoi.maLichHen).toBe(
      'CLX-20261127-NEW01',
    );
    const detail = api.records[0].detail;
    expect(detail).toMatchObject({
      trangThai: 'DaDuyet',
      ghiChuXuLy: 'Đã xác nhận.',
      thoiDiemXuLy: api.serverTime,
    });
    expect(detail.nguoiXuLy).not.toBeNull();
    // chi tiết sau khi xử lý vẫn qua bộ đọc NGHIÊM của phần đọc
    expect(parseRequestDetail(detail).trangThai).toBe('DaDuyet');
    expect(api.approveCalls).toEqual([
      { yeuCauId: '101', body: { ghiChu: '  Đã xác nhận.  ' } },
    ]);
    expect(api.requests.at(-1)).toMatchObject({
      method: 'POST',
      hasToken: true,
    });
    expect(api.requests.at(-1)?.body).toEqual({ ghiChu: '  Đã xác nhận.  ' });
  });

  it('WXD-85 từ chối: 200 ĐÚNG hai khoá qua bộ đọc thật (không có lịch mới); kho đổi sang `TuChoi`', async () => {
    const api = make(makeRequestDetail({ yeuCauId: '101' }));
    const { status, body } = await post(api, '101', 'reject', {
      ghiChu: 'Hết chỗ.',
    });
    expect(status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(['thoiGianMayChu', 'yeuCau']);
    expect(parseRejectResult(body).thoiGianMayChu).toBe(api.serverTime);
    expect(api.records[0].detail).toMatchObject({
      trangThai: 'TuChoi',
      ghiChuXuLy: 'Hết chỗ.',
    });
    expect(api.rejectCalls).toHaveLength(1);
    expect(api.approveCalls).toHaveLength(0);
  });

  it('WXD-85 duyệt kèm khung giờ thay thế (id lớn hơn 2^53) ⇒ 200; từ chối không nhận `khungGioId`', async () => {
    const api = make(
      makeRequestDetail({ yeuCauId: '101' }),
      makeRequestDetail({ yeuCauId: '102' }),
    );
    expect(
      (
        await post(api, '101', 'approve', {
          ghiChu: 'ok',
          khungGioId: '9007199254740993',
        })
      ).status,
    ).toBe(200);
    const rejectWithSlot = await post(api, '102', 'reject', {
      ghiChu: 'ok',
      khungGioId: '5',
    });
    expect(rejectWithSlot.status).toBe(400);
    expect(rejectWithSlot.body.loi).toEqual([
      { truong: 'khungGioId', ma: 'TRUONG_KHONG_DUOC_PHEP' },
    ]);
    expect(api.records[1].detail.trangThai).toBe('ChoDuyet');
  });
});

describe('DTO chặt (400)', () => {
  it.each([
    'chiNhanhId',
    'yeuCauId',
    'trangThai',
    'lyDoYeuCau',
    'benhNhanId',
    'lyDo',
  ])(
    'WXD-85 khoá lạ `%s` ⇒ 400 `TRUONG_KHONG_DUOC_PHEP`, không ghi gì',
    async (key) => {
      const api = make(makeRequestDetail({ yeuCauId: '101' }));
      const { status, body } = await post(api, '101', 'reject', {
        ghiChu: 'ok',
        [key]: '1',
      });
      expect(status).toBe(400);
      expect(body).toMatchObject({
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
        loi: [{ truong: key, ma: 'TRUONG_KHONG_DUOC_PHEP' }],
      });
      expect(api.records[0].detail.trangThai).toBe('ChoDuyet');
      expect(api.rejectCalls).toHaveLength(0);
    },
  );

  it.each([
    ['thiếu', {}],
    ['null', { ghiChu: null }],
    ['số', { ghiChu: 5 }],
    ['rỗng', { ghiChu: '' }],
    ['toàn khoảng trắng', { ghiChu: '   ' }],
    ['toàn U+00A0', { ghiChu: '\u00a0\u00a0' }],
    ['256 đơn vị', { ghiChu: 'a'.repeat(256) }],
    ['128 biểu tượng (256 đơn vị)', { ghiChu: '😀'.repeat(128) }],
    ['ký tự NUL', { ghiChu: 'a\u0000b' }],
    ['Tab ở giữa', { ghiChu: 'a\tb' }],
    ['giống bí mật (password=…)', { ghiChu: `${'pass'}${'word=1'}` }],
    ['giống bí mật (Bearer …)', { ghiChu: 'Bearer abc' }],
  ])(
    'WXD-85 ghi chú %s ⇒ 400 ở trường `ghiChu` (một mã `LY_DO_BAT_BUOC` cho mọi nguyên nhân)',
    async (_name, payload) => {
      const api = make(makeRequestDetail({ yeuCauId: '101' }));
      for (const route of ['approve', 'reject'] as const) {
        const { status, body } = await post(api, '101', route, payload);
        expect(status).toBe(400);
        expect(body.loi).toEqual([NOTE_ERROR]);
      }
      expect(api.records[0].detail.trangThai).toBe('ChoDuyet');
    },
  );

  it('WXD-85 biên đạt: 1 và 255 đơn vị, 127 biểu tượng, xuống dòng; thân 400 KHÔNG lặp lại giá trị đã gửi', async () => {
    const api = make(
      makeRequestDetail({ yeuCauId: '1' }),
      makeRequestDetail({ yeuCauId: '2' }),
      makeRequestDetail({ yeuCauId: '3' }),
      makeRequestDetail({ yeuCauId: '4' }),
    );
    expect((await post(api, '1', 'reject', { ghiChu: 'a' })).status).toBe(200);
    expect(
      (await post(api, '2', 'reject', { ghiChu: 'a'.repeat(255) })).status,
    ).toBe(200);
    expect(
      (await post(api, '3', 'reject', { ghiChu: '😀'.repeat(127) })).status,
    ).toBe(200);
    expect(
      (await post(api, '4', 'reject', { ghiChu: 'dòng 1\ndòng 2' })).status,
    ).toBe(200);
    const bad = await post(api, '1', 'reject', {
      ghiChu: 'KHONG-LAP-LAI-\u0000',
    });
    expect(bad.status).toBe(400);
    expect(bad.text).not.toContain('KHONG-LAP-LAI');
  });

  it.each([null, 5, '', '0', '012', 'abc', '1.5'])(
    'WXD-85 `khungGioId` = %j không phải id BIGINT dạng chuỗi ⇒ 400 `IS_BIGINT_ID` (chỉ VẮNG mới được bỏ qua)',
    async (value) => {
      const api = make(makeRequestDetail({ yeuCauId: '101' }));
      const { status, body } = await post(api, '101', 'approve', {
        ghiChu: 'ok',
        khungGioId: value,
      });
      expect(status).toBe(400);
      expect(body.loi).toEqual([{ truong: 'khungGioId', ma: 'IS_BIGINT_ID' }]);
    },
  );

  it.each(['không phải JSON', '[]', 'null', '"chuỗi"'])(
    'WXD-85 thân %s ⇒ 400',
    async (raw) => {
      const api = make(makeRequestDetail({ yeuCauId: '101' }));
      expect((await post(api, '101', 'approve', raw)).status).toBe(400);
    },
  );
});

describe('thứ tự lỗi', () => {
  it('WXD-85 404 CÙNG thân (`YEU_CAU_DOI_LICH_KHONG_TON_TAI`) cho "không có", "chi nhánh khác" và "id sai dạng"; thân sai (400) đứng TRƯỚC 404', async () => {
    const api = make(makeRequestDetail({ yeuCauId: '101' }));
    api.otherBranch = [fakeRecord(makeRequestDetail({ yeuCauId: '55' }))];
    const results = [];
    for (const id of ['777', '55', 'abc', '0']) {
      results.push(await post(api, id, 'reject', { ghiChu: 'ok' }));
    }
    for (const result of results) {
      expect(result.status).toBe(404);
      expect(result.body.maLoi).toBe('YEU_CAU_DOI_LICH_KHONG_TON_TAI');
      expect(result.text).toBe(results[0].text);
    }
    // Thân THẬT của B9 (TRACKING mục 7, khối "reschedule B9"): từng ký tự
    expect(results[0].body).toEqual({
      maLoi: 'YEU_CAU_DOI_LICH_KHONG_TON_TAI',
      thongBao: 'Không tìm thấy yêu cầu đổi lịch.',
    });
    expect((await post(api, '777', 'reject', {})).status).toBe(400);
    expect(api.rejectCalls).toHaveLength(0);
  });

  it('WXD-85 409 `YEU_CAU_DA_XU_LY` cho duyệt hai lần, duyệt sau từ chối, từ chối sau duyệt; yêu cầu đã xử lý sẵn cũng vậy; không ghi thêm', async () => {
    const api = make(
      makeRequestDetail({ yeuCauId: '1' }),
      makeRequestDetail({ yeuCauId: '2' }),
      makeHandledDetail('TuChoi', { yeuCauId: '3' }),
    );
    expect((await post(api, '1', 'approve', { ghiChu: 'a' })).status).toBe(200);
    expect((await post(api, '1', 'approve', { ghiChu: 'a' })).body.maLoi).toBe(
      'YEU_CAU_DA_XU_LY',
    );
    expect((await post(api, '1', 'reject', { ghiChu: 'a' })).status).toBe(409);
    expect((await post(api, '2', 'reject', { ghiChu: 'a' })).status).toBe(200);
    expect((await post(api, '2', 'approve', { ghiChu: 'a' })).body.maLoi).toBe(
      'YEU_CAU_DA_XU_LY',
    );
    expect((await post(api, '3', 'approve', { ghiChu: 'a' })).status).toBe(409);
    expect(api.records[0].detail.ghiChuXuLy).toBe('a');
    expect(api.records[2].detail.ghiChuXuLy).toBe(
      'Đã liên hệ bệnh nhân.\nXác nhận lịch mới.',
    );
  });

  it.each([
    'LICH_HEN_KHONG_CHO_DOI',
    'LICH_HEN_DA_QUA_GIO',
    'HO_SO_NGUOI_THAN_DA_NGUNG',
    'CHUOI_DOI_LICH_QUA_DAI',
    'HE_THONG_CHUA_CAU_HINH',
  ])(
    'WXD-85 `coTheDuyet = false` (%s): duyệt ⇒ 409 mã đó và yêu cầu VẪN `ChoDuyet`; TỪ CHỐI vẫn được (R6)',
    async (code) => {
      const api = make(
        makeRequestDetail({
          yeuCauId: '1',
          coTheDuyet: false,
          lyDoKhongDuyet: code,
        }),
      );
      const refused = await post(api, '1', 'approve', { ghiChu: 'ok' });
      expect(refused.status).toBe(409);
      expect(refused.body.maLoi).toBe(code);
      expect(api.records[0].detail.trangThai).toBe('ChoDuyet');
      expect(api.records[0].detail.ghiChuXuLy).toBeNull();
      expect((await post(api, '1', 'reject', { ghiChu: 'ok' })).status).toBe(
        200,
      );
    },
  );

  it.each([
    ['DaDat', 'KHUNG_GIO_DA_DAT'],
    ['DangGiuCho', 'KHUNG_GIO_DANG_GIU'],
    ['HetHan', 'KHUNG_GIO_DA_QUA'],
  ] as const)(
    'WXD-85 khung giờ mong muốn `%s` ⇒ duyệt 409 `%s`, yêu cầu VẪN `ChoDuyet`; duyệt bằng khung giờ thay thế được; từ chối được',
    async (state, code) => {
      const api = make(
        makeRequestDetail({
          yeuCauId: '1',
          khungGioMongMuon: { khungGioId: '555', trangThai: state },
        }),
      );
      const refused = await post(api, '1', 'approve', { ghiChu: 'ok' });
      expect(refused.status).toBe(409);
      expect(refused.body.maLoi).toBe(code);
      expect(api.records[0].detail.trangThai).toBe('ChoDuyet');
      api.replacementError = (id) =>
        id === '9' ? 'KHUNG_GIO_KHAC_BAC_SI' : null;
      expect(
        (await post(api, '1', 'approve', { ghiChu: 'ok', khungGioId: '9' }))
          .body.maLoi,
      ).toBe('KHUNG_GIO_KHAC_BAC_SI');
      expect(
        (await post(api, '1', 'approve', { ghiChu: 'ok', khungGioId: '10' }))
          .status,
      ).toBe(200);
    },
  );
});

describe('công cụ của test và kho dùng chung với phần đọc', () => {
  it('WXD-85 `failNextWrite` thay phản hồi của lần ghi kế tiếp (chạy trước mọi kiểm tra, không đổi kho); lần sau chạy bình thường', async () => {
    const api = make(makeRequestDetail({ yeuCauId: '1' }));
    api.failNextWrite(
      'approve',
      () => new Response('<html>502</html>', { status: 502 }),
    );
    const response = await api.fetch(`${BASE}/1/approve`, {
      method: 'POST',
      body: JSON.stringify({ ghiChu: 'ok' }),
    });
    expect(response.status).toBe(502);
    expect(api.records[0].detail.trangThai).toBe('ChoDuyet');
    expect(api.approveCalls).toHaveLength(0);
    expect((await post(api, '1', 'approve', { ghiChu: 'ok' })).status).toBe(
      200,
    );
  });

  it('WXD-85 `onHandle` chạy khi nhận POST hợp lệ, TRƯỚC khi xử lý: đổi kho ở đây dựng được ca đua (người khác vừa xử lý)', async () => {
    const api = make(makeRequestDetail({ yeuCauId: '1' }));
    api.onHandle = (route) => {
      expect(route).toBe('reject');
      api.records[0].detail = makeHandledDetail('DaDuyet', { yeuCauId: '1' });
    };
    expect((await post(api, '1', 'reject', { ghiChu: 'ok' })).body.maLoi).toBe(
      'YEU_CAU_DA_XU_LY',
    );
  });

  it('WXD-85 GET đọc thấy kết quả sau khi ghi (cùng kho): chi tiết đổi trạng thái, danh sách tab Chờ duyệt không còn dòng đó, tab Đã xử lý có', async () => {
    const api = make(makeRequestDetail({ yeuCauId: '1' }));
    await post(api, '1', 'reject', { ghiChu: 'ok' });
    const detail = await (await api.fetch(`${BASE}/1`)).json();
    expect(detail.trangThai).toBe('TuChoi');
    const waiting = await (
      await api.fetch(`${BASE}?trangThai=ChoDuyet`)
    ).json();
    const handled = await (
      await api.fetch(`${BASE}?trangThai=DaDuyet,TuChoi`)
    ).json();
    expect(waiting.total).toBe(0);
    expect(handled.total).toBe(1);
  });
});
