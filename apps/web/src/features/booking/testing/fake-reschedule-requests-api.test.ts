import { describe, expect, it } from 'vitest';
import {
  parseRequestDetail,
  parseRequestPage,
} from '../appointments/common/reschedule-requests/request-readers';
import {
  createFakeRescheduleRequestsApi,
  fakeRecord,
} from './fake-reschedule-requests-api';
import {
  makeHandledDetail,
  makeRequestDetail,
  makeRequestRows,
} from './reschedule-requests-fixtures';

// reschedule F4, WXD-52…WXD-58 (`[đề xuất]`; như WDH-45 của F1, F2): khoá API giả của yêu cầu đổi lịch KHỚP hợp đồng THẬT của B8 (query DTO chặt, 404 cùng thân, thứ tự do máy chủ, trang vượt cuối), để test
// của trang không "xanh giả" vì API giả dễ dãi hơn máy chủ. Khi B8 đổi hợp đồng thì ca này đỏ trước.
const BASE = 'http://localhost/api';

const apiWith = (...details: ReturnType<typeof makeRequestDetail>[]) => {
  const api = createFakeRescheduleRequestsApi(
    async () => new Response('Không có trong API giả', { status: 404 }),
  );
  api.records = details.map((detail) => fakeRecord(detail));
  return api;
};

async function get(api: ReturnType<typeof apiWith>, path: string) {
  const response = await api.fetch(`${BASE}${path}`);
  const text = await response.text();
  return {
    status: response.status,
    text,
    body: JSON.parse(text) as Record<string, unknown>,
  };
}

const LIST = '/reception/reschedule-requests';
const ids = (body: Record<string, unknown>) =>
  (body.items as { yeuCauId: string }[]).map((row) => row.yeuCauId);

describe('API giả của yêu cầu đổi lịch (khớp B8)', () => {
  it('WXD-52 danh sách mặc định: chỉ `ChoDuyet`, mỗi dòng ĐÚNG 10 khoá, `{ items, total, page, pageSize }`, sắp CŨ NHẤT TRƯỚC', async () => {
    const api = apiWith(
      makeRequestDetail({
        yeuCauId: '1',
        thoiDiemTao: '2026-11-03T00:00:00.000Z',
      }),
      makeRequestDetail({
        yeuCauId: '2',
        thoiDiemTao: '2026-11-01T00:00:00.000Z',
      }),
      makeHandledDetail('DaDuyet', { yeuCauId: '3' }),
    );
    const { status, body } = await get(api, LIST);
    expect(status).toBe(200);
    expect(Object.keys(body).sort()).toEqual([
      'items',
      'page',
      'pageSize',
      'total',
    ]);
    expect(body).toMatchObject({ total: 2, page: 1, pageSize: 20 });
    expect(ids(body)).toEqual(['2', '1']);
    for (const row of body.items as object[])
      expect(Object.keys(row)).toHaveLength(10);
  });

  it('WXD-53 tab Đã xử lý và mọi tập trạng thái khác `{ChoDuyet}` sắp MỚI NHẤT TRƯỚC; hoà thì theo id cùng chiều', async () => {
    const api = apiWith(
      makeHandledDetail('DaDuyet', {
        yeuCauId: '1',
        thoiDiemTao: '2026-11-01T00:00:00.000Z',
      }),
      makeHandledDetail('TuChoi', {
        yeuCauId: '2',
        thoiDiemTao: '2026-11-03T00:00:00.000Z',
      }),
      makeHandledDetail('TuChoi', {
        yeuCauId: '9',
        thoiDiemTao: '2026-11-03T00:00:00.000Z',
      }),
      makeRequestDetail({
        yeuCauId: '4',
        thoiDiemTao: '2026-11-02T00:00:00.000Z',
      }),
    );
    expect(
      ids((await get(api, `${LIST}?trangThai=DaDuyet,TuChoi`)).body),
    ).toEqual(['9', '2', '1']);
    expect(
      ids((await get(api, `${LIST}?trangThai=DaDuyet&trangThai=TuChoi`)).body),
    ).toEqual(['9', '2', '1']);
    expect(
      ids((await get(api, `${LIST}?trangThai=ChoDuyet,DaDuyet`)).body),
    ).toEqual(['4', '1']);
  });

  it('WXD-54 query DTO chặt: khoá lạ (kể cả `chiNhanhId`) ⇒ 400 `TRUONG_KHONG_DUOC_PHEP`; giá trị sai ⇒ 400 `DU_LIEU_KHONG_HOP_LE` kèm `loi[]`', async () => {
    const api = apiWith(makeRequestDetail());
    const forbidden = await get(api, `${LIST}?chiNhanhId=3`);
    expect(forbidden.status).toBe(400);
    expect(forbidden.body).toMatchObject({
      maLoi: 'DU_LIEU_KHONG_HOP_LE',
      loi: [{ truong: 'chiNhanhId', ma: 'TRUONG_KHONG_DUOC_PHEP' }],
    });
    for (const bad of [
      'trangThai=DaXoa',
      'trangThai=ChoDuyet, DaDuyet',
      'trangThai=',
      'bacSiId=0',
      'bacSiId=abc',
      'page=0',
      'page=1.5',
      'page=1&page=2',
      'pageSize=0',
      'pageSize=101',
      'q=abc',
      'q=',
      'q=CLX-20261120-7K3MI',
    ]) {
      const response = await get(api, `${LIST}?${bad}`);
      expect(response.status, bad).toBe(400);
      expect(response.body.maLoi, bad).toBe('DU_LIEU_KHONG_HOP_LE');
    }
    const code = await get(api, `${LIST}?q=abc`);
    expect(code.body).toMatchObject({
      loi: [{ truong: 'q', ma: 'MA_LICH_HEN_KHONG_HOP_LE' }],
    });
    expect(code.text).not.toContain('abc"');
  });

  it('WXD-55 trang vượt cuối ⇒ 200 `items: []` mà `total` vẫn đúng; không khớp ⇒ 200 rỗng (không 404)', async () => {
    const api = apiWith(
      ...makeRequestRows(45).map((row) => makeRequestDetail(row)),
    );
    const first = await get(api, `${LIST}?page=3`);
    expect(first.body).toMatchObject({ total: 45, page: 3, pageSize: 20 });
    expect(first.body.items).toHaveLength(5);
    const beyond = await get(api, `${LIST}?page=9`);
    expect(beyond.status).toBe(200);
    expect(beyond.body).toMatchObject({ items: [], total: 45, page: 9 });
    const none = await get(api, `${LIST}?bacSiId=777`);
    expect(none.body).toMatchObject({ items: [], total: 0 });
  });

  it('WXD-56 `q` chữ thường được chuẩn hoá thành chữ hoa rồi so khớp mã ĐẦY ĐỦ; `bacSiId` lọc theo bác sĩ', async () => {
    const api = createFakeRescheduleRequestsApi(
      async () => new Response('', { status: 404 }),
    );
    api.records = [
      fakeRecord(
        makeRequestDetail({ yeuCauId: '1', maLichHen: 'CLX-20261120-7K3M9' }),
        '5',
      ),
      fakeRecord(
        makeRequestDetail({ yeuCauId: '2', maLichHen: 'CLX-20261121-AAAAA' }),
        '9',
      ),
    ];
    expect(ids((await get(api, `${LIST}?q=clx-20261120-7k3m9`)).body)).toEqual([
      '1',
    ]);
    expect(ids((await get(api, `${LIST}?bacSiId=9`)).body)).toEqual(['2']);
    expect(
      ids((await get(api, `${LIST}?bacSiId=9&q=CLX-20261120-7K3M9`)).body),
    ).toEqual([]);
  });

  it('WXD-57 chi tiết ĐÚNG 19 khoá; 404 CÙNG thân từng ký tự cho "không có", "chi nhánh khác" và "id sai dạng"', async () => {
    const api = apiWith(makeRequestDetail({ yeuCauId: '9007199254740993' }));
    api.otherBranch = [fakeRecord(makeRequestDetail({ yeuCauId: '55' }))];
    const found = await get(api, `${LIST}/9007199254740993`);
    expect(found.status).toBe(200);
    expect(Object.keys(found.body)).toHaveLength(19);
    expect(found.body.yeuCauId).toBe('9007199254740993');

    const missing = await get(api, `${LIST}/777`);
    const other = await get(api, `${LIST}/55`);
    const malformed = await get(api, `${LIST}/abc`);
    const zero = await get(api, `${LIST}/0`);
    for (const response of [missing, other, malformed, zero]) {
      expect(response.status).toBe(404);
      expect(response.text).toBe(missing.text);
    }
    expect(missing.body).toEqual({
      maLoi: 'KHONG_TIM_THAY',
      thongBao: 'Không tìm thấy dữ liệu.',
    });
  });

  it('WXD-58 mọi thân 200 của API giả qua được bộ đọc NGHIÊM thật; Lễ tân gắn token, danh sách bác sĩ công khai thì không', async () => {
    const api = apiWith(
      makeRequestDetail({ yeuCauId: '1' }),
      makeHandledDetail('TuChoi', { yeuCauId: '2' }),
    );
    const list = await get(api, `${LIST}?trangThai=ChoDuyet,DaDuyet,TuChoi`);
    expect(parseRequestPage(list.body).items).toHaveLength(2);
    expect(
      parseRequestDetail((await get(api, `${LIST}/1`)).body).yeuCauId,
    ).toBe('1');
    expect(
      parseRequestDetail((await get(api, `${LIST}/2`)).body).trangThai,
    ).toBe('TuChoi');

    await api.fetch(`${BASE}/reception/reschedule-requests`, {
      headers: { Authorization: 'x' },
    });
    await api.fetch(`${BASE}/public/doctors?pageSize=100`);
    const tokens = api.requests.map((request) => [
      request.path,
      request.hasToken,
    ]);
    expect(tokens.at(-2)).toEqual([LIST, true]);
    expect(tokens.at(-1)).toEqual(['/public/doctors', false]);
    expect(api.writes()).toEqual([]);
  });
});
