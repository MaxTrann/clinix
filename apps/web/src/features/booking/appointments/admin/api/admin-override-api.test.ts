import { afterEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthHooks } from '../../../../../shared/api/auth-hooks';
import { UnexpectedResponseError } from '../../../../../shared/api/errors';
import { jsonResponse } from '../../../testing/fake-appointment-list-api';
import {
  overrideAppointmentStatus,
  parseOverrideResult,
} from './admin-override-api';

// booking F10: bộ đọc 200 và lời gọi `POST /admin/appointments/:maLichHen/override-status`. Mã AQE và AQO là [đề xuất] (PLAN booking mục 7.41). Hợp đồng đọc từ mã backend B14 (TRACKING 3.31):
// 200 `{ maLichHen, trangThai }`, `DaHuy` thêm `hoanCoc` là `{ tyLe, soTien }` hay `null`.
afterEach(() => {
  vi.unstubAllGlobals();
  setApiAuthHooks(null);
});

describe('parseOverrideResult', () => {
  it('AQE-09 ba đích không hoàn: đúng hai khoá, khoá thừa (hoanCoc, khoaDatLich) không được chép theo', () => {
    for (const target of ['DaTiepDon', 'DaXacNhan', 'VangMat'] as const) {
      const parsed = parseOverrideResult(
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

  it('AQE-09 `DaHuy` kèm `hoanCoc`: `soTien` giữ NGUYÊN CHUỖI (lớn hơn 2^53 đủ chữ số), `tyLe` là số; `null` hợp lệ', () => {
    expect(
      parseOverrideResult(
        {
          maLichHen: 'CP20261018001',
          trangThai: 'DaHuy',
          hoanCoc: { tyLe: 100, soTien: '9007199254740993.00', thua: 1 },
        },
        'DaHuy',
      ),
    ).toEqual({
      maLichHen: 'CP20261018001',
      trangThai: 'DaHuy',
      hoanCoc: { tyLe: 100, soTien: '9007199254740993.00' },
    });
    expect(
      parseOverrideResult(
        { maLichHen: 'CP20261018001', trangThai: 'DaHuy', hoanCoc: null },
        'DaHuy',
      ),
    ).toEqual({
      maLichHen: 'CP20261018001',
      trangThai: 'DaHuy',
      hoanCoc: null,
    });
  });

  it('AQE-09 không dùng được: `trangThai` khác đích đã gửi, thiếu khoá, `DaHuy` thiếu `hoanCoc`, `tyLe` ngoài 0 đến 100, tiền sai dạng, không phải đối tượng', () => {
    const bad: [unknown, 'DaHuy' | 'VangMat'][] = [
      [{ maLichHen: 'CP1', trangThai: 'DaHuy' }, 'VangMat'],
      [{ maLichHen: 'CP1', trangThai: 'VangMat' }, 'DaHuy'],
      [{ trangThai: 'VangMat' }, 'VangMat'],
      [{ maLichHen: '', trangThai: 'VangMat' }, 'VangMat'],
      [{ maLichHen: 'CP1', trangThai: 'DaHuy' }, 'DaHuy'],
      [
        {
          maLichHen: 'CP1',
          trangThai: 'DaHuy',
          hoanCoc: { tyLe: 101, soTien: '1.00' },
        },
        'DaHuy',
      ],
      [
        {
          maLichHen: 'CP1',
          trangThai: 'DaHuy',
          hoanCoc: { tyLe: 50, soTien: '1,00' },
        },
        'DaHuy',
      ],
      [{ maLichHen: 'CP1', trangThai: 'DaHuy', hoanCoc: 'không' }, 'DaHuy'],
      ['<html>', 'VangMat'],
      [null, 'VangMat'],
    ];
    for (const [raw, target] of bad) {
      expect(
        () => parseOverrideResult(raw, target),
        JSON.stringify(raw),
      ).toThrow(UnexpectedResponseError);
    }
  });
});

describe('overrideAppointmentStatus', () => {
  it('AQO-06 POST đúng đường dẫn (mã được mã hoá), GẮN token, thân đúng HAI khoá `trangThai`, `lyDo` dù nơi gọi lỡ truyền thừa', async () => {
    setApiAuthHooks({
      getAccessToken: () => 'token-gia',
      recoverFromUnauthorized: async () => false,
    });
    const spy = vi.fn<typeof fetch>(async () =>
      jsonResponse({ maLichHen: 'CP/1', trangThai: 'VangMat' }),
    );
    vi.stubGlobal('fetch', spy);
    const body = {
      trangThai: 'VangMat',
      lyDo: 'Không đến',
      thua: 'x',
    } as never;
    const result = await overrideAppointmentStatus('CP/1', body);
    expect(result).toEqual({ maLichHen: 'CP/1', trangThai: 'VangMat' });
    const [input, init] = spy.mock.calls[0];
    expect(new URL(String(input), 'http://localhost').pathname).toBe(
      '/api/admin/appointments/CP%2F1/override-status',
    );
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).has('Authorization')).toBe(true);
    expect(JSON.parse(String(init?.body))).toEqual({
      trangThai: 'VangMat',
      lyDo: 'Không đến',
    });
  });

  it('AQE-09 200 có `trangThai` khác đích đã gửi ⇒ ném (không được hiện "đã đổi" khi máy chủ nói điều khác)', async () => {
    setApiAuthHooks({
      getAccessToken: () => 'token-gia',
      recoverFromUnauthorized: async () => false,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ maLichHen: 'CP1', trangThai: 'DaHuy' })),
    );
    await expect(
      overrideAppointmentStatus('CP1', { trangThai: 'VangMat', lyDo: 'x' }),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
  });
});
