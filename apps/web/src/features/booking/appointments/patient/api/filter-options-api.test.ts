import { afterEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthHooks } from '../../../../../shared/api/auth-hooks';
import { UnexpectedResponseError } from '../../../../../shared/api/errors';
import { getRelativeOptions } from './filter-options-api';

// booking F1: danh sách người thân cho ô lọc Người khám (chuyên khoa và bác sĩ chuyển sang `common/filter-options-api.test.ts` ở F8, nguyên văn). Mã LHL là [đề xuất] (PLAN booking mục 7.31 sau khi duyệt).
// Đại duyệt 12/11/2026 (câu (c)): chuyên khoa và bác sĩ lấy một trang `pageSize=100` từ hai route công khai; còn mục chưa lấy được thì
// báo "rút gọn" (`truncated`) thay vì cắt âm thầm.
function stubFetch(body: unknown) {
  const spy = vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}
const urlOf = (spy: ReturnType<typeof stubFetch>) =>
  new URL(String(spy.mock.calls[0][0]), 'http://localhost');
const headersOf = (spy: ReturnType<typeof stubFetch>) =>
  new Headers(spy.mock.calls[0][1]?.headers);

afterEach(() => {
  vi.unstubAllGlobals();
  setApiAuthHooks(null);
});

describe('getRelativeOptions', () => {
  const RELATIVES = {
    items: [
      {
        hoSoNguoiThanId: '9007199254740993',
        hoTen: 'Bùi Minh Khoa',
        moiQuanHe: 'Con',
        gioiTinh: 'Nam',
        ngaySinh: '2018-03-04',
        soDienThoai: null,
        trangThaiHieuLuc: false,
      },
      {
        hoSoNguoiThanId: '12',
        hoTen: 'Lê Minh D',
        moiQuanHe: 'Con',
        gioiTinh: 'Nam',
        ngaySinh: '2019-01-02',
        soDienThoai: '0911222333',
        trangThaiHieuLuc: true,
      },
    ],
  };

  it('LHL-16 GET /api/patient/relatives không query, GẮN token; chỉ giữ ba khoá cần; hồ sơ đang dùng đứng trước', async () => {
    setApiAuthHooks({
      getAccessToken: () => 'token-gia',
      recoverFromUnauthorized: async () => false,
    });
    const spy = stubFetch(RELATIVES);
    const options = await getRelativeOptions();

    expect(urlOf(spy).pathname).toBe('/api/patient/relatives');
    expect(urlOf(spy).search).toBe('');
    expect(headersOf(spy).get('Authorization')).toBe('Bearer token-gia');
    expect(options).toEqual([
      { hoSoNguoiThanId: '12', hoTen: 'Lê Minh D', trangThaiHieuLuc: true },
      {
        hoSoNguoiThanId: '9007199254740993',
        hoTen: 'Bùi Minh Khoa',
        trangThaiHieuLuc: false,
      },
    ]);
  });

  it('LHL-16 id lớn hơn 2^53 giữ nguyên chữ số; hồ sơ ngừng sử dụng vẫn là một lựa chọn (lịch sử còn lịch của họ)', async () => {
    stubFetch(RELATIVES);
    const options = await getRelativeOptions();
    expect(options.map((option) => option.hoSoNguoiThanId)).toContain(
      '9007199254740993',
    );
    expect(options.some((option) => !option.trangThaiHieuLuc)).toBe(true);
  });

  it('LHL-16 chưa có người thân nào ⇒ danh sách rỗng (ô vẫn có `Tất cả` và `Bản thân`)', async () => {
    stubFetch({ items: [] });
    expect(await getRelativeOptions()).toEqual([]);
  });

  it('LHL-15 thân sai hình dạng (thiếu `items`, id sai dạng, cờ không phải boolean) ⇒ không dùng được', async () => {
    const bad: unknown[] = [
      {},
      null,
      { items: 'x' },
      { items: [{ hoSoNguoiThanId: 3, hoTen: 'A', trangThaiHieuLuc: true }] },
      { items: [{ hoSoNguoiThanId: '0', hoTen: 'A', trangThaiHieuLuc: true }] },
      { items: [{ hoSoNguoiThanId: '3', hoTen: 5, trangThaiHieuLuc: true }] },
      { items: [{ hoSoNguoiThanId: '3', hoTen: 'A', trangThaiHieuLuc: 'co' }] },
    ];
    for (const body of bad) {
      stubFetch(body);
      await expect(getRelativeOptions()).rejects.toBeInstanceOf(
        UnexpectedResponseError,
      );
    }
  });
});
