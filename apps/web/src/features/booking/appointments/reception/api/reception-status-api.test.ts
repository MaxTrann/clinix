import { afterEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthHooks } from '../../../../../shared/api/auth-hooks';
import { UnexpectedResponseError } from '../../../../../shared/api/errors';
import {
  changeReceptionStatus,
  parseStatusResult,
} from './reception-status-api';

// booking F9: bộ đọc 200 và lời gọi `POST /reception/appointments/:maLichHen/status`. Mã LTA là [đề xuất] (PLAN booking mục 7.36). Hợp đồng đọc từ mã backend B12 (TRACKING 3.30 F9-D):
// 200 `{ maLichHen, trangThai }`, `DaHuy` thêm `hoanCoc` là `{ tyLe, soTien }` hay `null`.
afterEach(() => {
  vi.unstubAllGlobals();
  setApiAuthHooks(null);
});

describe('parseStatusResult', () => {
  it('LTA-02 `VangMat` và `DaTiepDon`: đúng hai khoá, khoá thừa (hoanCoc, khoaDatLich) không được chép theo', () => {
    for (const target of ['VangMat', 'DaTiepDon'] as const) {
      const parsed = parseStatusResult(
        {
          maLichHen: 'CP20261018001',
          trangThai: target,
          hoanCoc: { tyLe: 100, soTien: '1.00' },
          khoaDatLich: true,
        },
        target,
      );
      expect(parsed).toEqual({ maLichHen: 'CP20261018001', trangThai: target });
      expect(Object.keys(parsed).sort()).toEqual(['maLichHen', 'trangThai']);
    }
  });

  it('LTA-02 `DaHuy` kèm `hoanCoc` là đối tượng: `soTien` giữ NGUYÊN CHUỖI (lớn hơn 2^53 đủ chữ số), `tyLe` là số', () => {
    const parsed = parseStatusResult(
      {
        maLichHen: 'CP20261018001',
        trangThai: 'DaHuy',
        hoanCoc: { tyLe: 50, soTien: '9007199254740993.00', thua: 1 },
      },
      'DaHuy',
    );
    expect(parsed).toEqual({
      maLichHen: 'CP20261018001',
      trangThai: 'DaHuy',
      hoanCoc: { tyLe: 50, soTien: '9007199254740993.00' },
    });
  });

  it('LTA-02 `DaHuy` kèm `hoanCoc` là `null` (chưa thu đồng nào) là hợp lệ', () => {
    expect(
      parseStatusResult(
        { maLichHen: 'CP20261018001', trangThai: 'DaHuy', hoanCoc: null },
        'DaHuy',
      ),
    ).toEqual({
      maLichHen: 'CP20261018001',
      trangThai: 'DaHuy',
      hoanCoc: null,
    });
  });

  it('LTA-02 ca âm: `trangThai` khác đích đã gửi, thiếu khoá, sai kiểu, tỷ lệ ngoài 0..100, tiền sai dạng, không phải đối tượng ⇒ không dùng được', () => {
    const cancelled = {
      maLichHen: 'CP20261018001',
      trangThai: 'DaHuy',
      hoanCoc: { tyLe: 100, soTien: '1000.00' },
    };
    const bad: [unknown, 'DaHuy' | 'VangMat' | 'DaTiepDon'][] = [
      // Đích đã gửi là `VangMat` mà máy chủ nói `DaHuy` (và ngược lại): không được hiện kết quả của việc khác
      [cancelled, 'VangMat'],
      [{ maLichHen: 'CP20261018001', trangThai: 'DaTiepDon' }, 'VangMat'],
      [{ maLichHen: 'CP20261018001', trangThai: 'VangMat' }, 'DaHuy'],
      // Thiếu khoá
      [{ trangThai: 'VangMat' }, 'VangMat'],
      [{ maLichHen: 'CP20261018001' }, 'VangMat'],
      [{ maLichHen: 'CP20261018001', trangThai: 'DaHuy' }, 'DaHuy'],
      // Sai kiểu hay sai dạng
      [{ maLichHen: '', trangThai: 'VangMat' }, 'VangMat'],
      [{ maLichHen: 5, trangThai: 'VangMat' }, 'VangMat'],
      [{ ...cancelled, hoanCoc: { tyLe: 101, soTien: '1.00' } }, 'DaHuy'],
      [{ ...cancelled, hoanCoc: { tyLe: -1, soTien: '1.00' } }, 'DaHuy'],
      [{ ...cancelled, hoanCoc: { tyLe: 1.5, soTien: '1.00' } }, 'DaHuy'],
      [{ ...cancelled, hoanCoc: { tyLe: 100, soTien: 1000 } }, 'DaHuy'],
      [{ ...cancelled, hoanCoc: { tyLe: 100, soTien: '1e3' } }, 'DaHuy'],
      [{ ...cancelled, hoanCoc: { tyLe: 100 } }, 'DaHuy'],
      [{ ...cancelled, hoanCoc: 'không hoàn' }, 'DaHuy'],
      [{ ...cancelled, hoanCoc: [] }, 'DaHuy'],
      // Không phải đối tượng JSON
      [null, 'VangMat'],
      ['CP20261018001', 'VangMat'],
      [[], 'DaHuy'],
    ];
    for (const [raw, target] of bad) {
      expect(() => parseStatusResult(raw, target), JSON.stringify(raw)).toThrow(
        UnexpectedResponseError,
      );
    }
  });
});

describe('changeReceptionStatus', () => {
  function stubFetch(response: () => Response) {
    setApiAuthHooks({
      getAccessToken: () => 'token-gia',
      recoverFromUnauthorized: async () => false,
    });
    const spy = vi.fn<typeof fetch>(async () => response());
    vi.stubGlobal('fetch', spy);
    return spy;
  }
  const ok = (body: unknown) => () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  const sent = (spy: ReturnType<typeof stubFetch>) => {
    const [input, init] = spy.mock.calls[0];
    return {
      path: new URL(String(input), 'http://localhost').pathname,
      method: init?.method,
      token: new Headers(init?.headers).get('Authorization'),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    };
  };

  it('LTA-01 POST /api/reception/appointments/:ma/status, mã được mã hoá, GẮN access token', async () => {
    const spy = stubFetch(ok({ maLichHen: 'A/B?c', trangThai: 'VangMat' }));
    await changeReceptionStatus('A/B?c#d e', { trangThai: 'VangMat' });
    const call = sent(spy);
    expect(call.path).toBe(
      '/api/reception/appointments/A%2FB%3Fc%23d%20e/status',
    );
    expect(call.method).toBe('POST');
    expect(call.token).toBe('Bearer token-gia');
  });

  it('LTA-01 thân TƯỜNG MINH: `DaHuy` mang `lyDo`; `VangMat` và `DaTiepDon` KHÔNG mang `lyDo` dù nơi gọi lỡ truyền thừa (Q27)', async () => {
    const cancel = stubFetch(
      ok({ maLichHen: 'CP1', trangThai: 'DaHuy', hoanCoc: null }),
    );
    await changeReceptionStatus('CP1', {
      trangThai: 'DaHuy',
      lyDo: 'Bệnh nhân báo bận',
    });
    expect(sent(cancel).body).toEqual({
      trangThai: 'DaHuy',
      lyDo: 'Bệnh nhân báo bận',
    });
    vi.unstubAllGlobals();

    for (const target of ['VangMat', 'DaTiepDon'] as const) {
      const spy = stubFetch(ok({ maLichHen: 'CP1', trangThai: target }));
      // Ép kiểu có chủ ý: kiểm rằng thân đi ra KHÔNG phụ thuộc vào việc kiểu có cấm `lyDo` hay không
      await changeReceptionStatus('CP1', {
        trangThai: target,
        lyDo: 'không được gửi',
      } as never);
      const body = sent(spy).body;
      expect(body).toEqual({ trangThai: target });
      expect(Object.keys(body)).toEqual(['trangThai']);
      vi.unstubAllGlobals();
    }
  });

  it('LTA-01 200 sai đích hay sai hình dạng ⇒ UnexpectedResponseError (không hiện "đã làm")', async () => {
    stubFetch(ok({ maLichHen: 'CP1', trangThai: 'DaHuy', hoanCoc: null }));
    await expect(
      changeReceptionStatus('CP1', { trangThai: 'VangMat' }),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
  });
});
