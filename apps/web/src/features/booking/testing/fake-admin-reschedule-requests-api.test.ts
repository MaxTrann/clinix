import { describe, expect, it } from 'vitest';
import {
  parseRequestDetail,
  parseRequestPage,
} from '../appointments/common/reschedule-requests/request-readers';
import { createFakeAdminRescheduleRequestsApi } from './fake-admin-reschedule-requests-api';
import { fakeRecord } from './fake-reschedule-requests-api';
import { makeRequestDetail } from './reschedule-requests-fixtures';

// reschedule F5, WXD-110 (`[đề xuất]`; như WXD-52…58 của F4): khoá API giả của Quản trị viên KHỚP phạm vi THẬT của B8 và B9 (`reschedule-request-list.dto.ts`, `.service.ts`, khối B8, B9 ở TRACKING mục 7), để
// test của trang không "xanh giả" vì API giả dễ dãi hơn máy chủ. Hợp đồng chung (10 và 19 khoá, mã lỗi ghi) đã khoá ở test API giả của F4; ca này chỉ khoá phần phạm vi chi nhánh.
const BASE = 'http://localhost/api';
const LIST = '/admin/reschedule-requests';

function makeApi() {
  const api = createFakeAdminRescheduleRequestsApi(
    async () => new Response('Không có trong API giả', { status: 404 }),
  );
  const at = (yeuCauId: string, chiNhanhId: string) =>
    fakeRecord(
      makeRequestDetail({
        yeuCauId,
        chiNhanh: { id: chiNhanhId, ten: `Chi nhánh ${chiNhanhId}` },
      }),
    );
  api.records = [at('1', '3'), at('2', '4'), at('3', '3')];
  return api;
}

async function call(
  api: ReturnType<typeof makeApi>,
  path: string,
  body?: unknown,
) {
  const response = await api.fetch(
    `${BASE}${path}`,
    body === undefined
      ? undefined
      : { method: 'POST', body: JSON.stringify(body) },
  );
  return {
    status: response.status,
    body: JSON.parse(await response.text()) as Record<string, unknown>,
  };
}

const ids = (body: Record<string, unknown>) =>
  parseRequestPage(body).items.map((row) => row.yeuCauId);

const BRANCH_3 = {
  phamVi: 'ChiNhanh',
  chiNhanh: { id: '3', ten: 'Chi nhánh 3' },
} as const;

describe('API giả của yêu cầu đổi lịch phía Quản trị viên (WXD-110)', () => {
  it('WXD-110 Toàn hệ thống: không `chiNhanhId` thấy mọi chi nhánh; có thì lọc; chi nhánh lạ ⇒ rỗng; sai dạng ⇒ 400 `IS_BIGINT_ID`', async () => {
    const api = makeApi();
    expect(ids((await call(api, LIST)).body)).toEqual(['1', '2', '3']);
    expect(ids((await call(api, `${LIST}?chiNhanhId=4`)).body)).toEqual(['2']);
    expect(ids((await call(api, `${LIST}?chiNhanhId=99`)).body)).toEqual([]);
    const bad = await call(api, `${LIST}?chiNhanhId=abc`);
    expect(bad.status).toBe(400);
    expect(bad.body.loi).toEqual([
      { truong: 'chiNhanhId', ma: 'IS_BIGINT_ID' },
    ]);
  });

  it('WXD-110 Chi nhánh: BỎ QUA `chiNhanhId` (vẫn kiểm dạng) và chỉ thấy chi nhánh được gán', async () => {
    const api = makeApi();
    api.scope = BRANCH_3;
    expect(ids((await call(api, LIST)).body)).toEqual(['1', '3']);
    expect(ids((await call(api, `${LIST}?chiNhanhId=4`)).body)).toEqual([
      '1',
      '3',
    ]);
    expect((await call(api, `${LIST}?chiNhanhId=0`)).status).toBe(400);
  });

  it('WXD-110 chi tiết: ngoài phạm vi, không có và id sai dạng ra CÙNG một thân 404; trong phạm vi ra 19 khoá', async () => {
    const api = makeApi();
    api.scope = BRANCH_3;
    const own = await call(api, `${LIST}/1`);
    expect(Object.keys(parseRequestDetail(own.body))).toHaveLength(19);
    const outside = await call(api, `${LIST}/2`);
    const missing = await call(api, `${LIST}/999`);
    const malformed = await call(api, `${LIST}/abc`);
    expect(outside.status).toBe(404);
    expect(outside.body).toEqual({
      maLoi: 'KHONG_TIM_THAY',
      thongBao: 'Không tìm thấy dữ liệu.',
    });
    expect(missing).toEqual(outside);
    expect(malformed).toEqual(outside);
    // Toàn hệ thống thấy được yêu cầu của chi nhánh khác
    api.scope = { phamVi: 'ToanHeThong' };
    expect((await call(api, `${LIST}/2`)).status).toBe(200);
  });

  it('WXD-110 ghi: ngoài phạm vi ⇒ 404 `YEU_CAU_DOI_LICH_KHONG_TON_TAI`; `chiNhanhId` ở thân ⇒ 400 `TRUONG_KHONG_DUOC_PHEP`; trong phạm vi ghi được và danh sách thấy kết quả', async () => {
    const api = makeApi();
    api.scope = BRANCH_3;
    const outside = await call(api, `${LIST}/2/approve`, { ghiChu: 'a' });
    expect(outside.status).toBe(404);
    expect(outside.body.maLoi).toBe('YEU_CAU_DOI_LICH_KHONG_TON_TAI');
    const extra = await call(api, `${LIST}/1/reject`, {
      ghiChu: 'a',
      chiNhanhId: '3',
    });
    expect(extra.status).toBe(400);
    expect(extra.body.loi).toEqual([
      { truong: 'chiNhanhId', ma: 'TRUONG_KHONG_DUOC_PHEP' },
    ]);
    expect((await call(api, `${LIST}/1/reject`, { ghiChu: 'a' })).status).toBe(
      200,
    );
    expect(ids((await call(api, LIST)).body)).toEqual(['3']);
    expect(
      ids((await call(api, `${LIST}?trangThai=DaDuyet,TuChoi`)).body),
    ).toEqual(['1']);
  });
});
