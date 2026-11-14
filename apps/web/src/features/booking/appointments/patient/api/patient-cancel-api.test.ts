import { afterEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthHooks } from '../../../../../shared/api/auth-hooks';
import { UnexpectedResponseError } from '../../../../../shared/api/errors';
import {
  cancelPatientAppointment,
  getCancelPreview,
  parseCancelPreview,
  parseCancelResult,
} from './patient-cancel-api';

// booking F2: bộ kiểm hình dạng và lời gọi hai route huỷ của Bệnh nhân (hợp đồng B10, TRACKING 3.23 B10-G, 3.27 F2-D). Mã HHL là [đề xuất] (PLAN booking mục 7.33
// sau khi duyệt); mỗi ca ghi mã. Dữ liệu giả.
const unusablePreview = (raw: unknown) =>
  expect(() => parseCancelPreview(raw)).toThrow(UnexpectedResponseError);
const unusableResult = (raw: unknown) =>
  expect(() => parseCancelResult(raw)).toThrow(UnexpectedResponseError);

describe('parseCancelPreview', () => {
  it('HHL-02 choPhepHuy = true với hoanCoc đủ ba khoá ⇒ giữ nguyên tyLe, soTien (chuỗi), mocApDung', () => {
    expect(
      parseCancelPreview({
        choPhepHuy: true,
        hoanCoc: { tyLe: 50, soTien: '50000.00', mocApDung: 2 },
      }),
    ).toEqual({
      choPhepHuy: true,
      hoanCoc: { tyLe: 50, soTien: '50000.00', mocApDung: 2 },
    });
  });

  it('HHL-02 hoanCoc null ("không hoàn": chưa thu đồng nào) và mocApDung null (không mốc, đã quá giờ) đều đọc được; tyLe 0 và 100 là biên hợp lệ', () => {
    expect(parseCancelPreview({ choPhepHuy: true, hoanCoc: null })).toEqual({
      choPhepHuy: true,
      hoanCoc: null,
    });
    const zero = parseCancelPreview({
      choPhepHuy: true,
      hoanCoc: { tyLe: 0, soTien: '0.00', mocApDung: null },
    });
    expect(zero).toEqual({
      choPhepHuy: true,
      hoanCoc: { tyLe: 0, soTien: '0.00', mocApDung: null },
    });
    expect(
      parseCancelPreview({
        choPhepHuy: true,
        hoanCoc: { tyLe: 100, soTien: '100000.00', mocApDung: 24 },
      }),
    ).toMatchObject({ choPhepHuy: true });
  });

  it('HHL-07 choPhepHuy = false ⇒ giữ lyDoKhongHuy (vắng ⇒ null) và bỏ qua hoanCoc dù API lỡ trả', () => {
    expect(
      parseCancelPreview({
        choPhepHuy: false,
        lyDoKhongHuy: 'LICH_HEN_KHONG_CHO_HUY',
        hoanCoc: null,
      }),
    ).toEqual({ choPhepHuy: false, lyDoKhongHuy: 'LICH_HEN_KHONG_CHO_HUY' });
    expect(parseCancelPreview({ choPhepHuy: false })).toEqual({
      choPhepHuy: false,
      lyDoKhongHuy: null,
    });
    expect(
      parseCancelPreview({
        choPhepHuy: false,
        hoanCoc: { tyLe: 100, soTien: '1.00', mocApDung: 1 },
      }),
    ).not.toHaveProperty('hoanCoc');
  });

  it('HHL-09 sai hình dạng ⇒ phản hồi không dùng được: thiếu choPhepHuy hay hoanCoc, tyLe ngoài 0 đến 100 hay không nguyên, tiền sai dạng, mocApDung âm', () => {
    unusablePreview(null);
    unusablePreview({});
    unusablePreview({ choPhepHuy: 'true', hoanCoc: null });
    unusablePreview({ choPhepHuy: true });
    unusablePreview({
      choPhepHuy: true,
      hoanCoc: { tyLe: 101, soTien: '1.00', mocApDung: 1 },
    });
    unusablePreview({
      choPhepHuy: true,
      hoanCoc: { tyLe: -1, soTien: '1.00', mocApDung: 1 },
    });
    unusablePreview({
      choPhepHuy: true,
      hoanCoc: { tyLe: 50.5, soTien: '1.00', mocApDung: 1 },
    });
    unusablePreview({
      choPhepHuy: true,
      hoanCoc: { tyLe: 50, soTien: '1,00', mocApDung: 1 },
    });
    unusablePreview({
      choPhepHuy: true,
      hoanCoc: { tyLe: 50, soTien: '1.00', mocApDung: -2 },
    });
    unusablePreview({
      choPhepHuy: true,
      hoanCoc: { tyLe: 50, soTien: '1.00' },
    });
  });
});

describe('parseCancelResult', () => {
  it('HHL-04 kết quả đúng ba khoá ⇒ giữ maLichHen và số hoàn THỰC TẾ; hoanCoc null đọc được', () => {
    expect(
      parseCancelResult({
        maLichHen: 'CP1',
        trangThai: 'DaHuy',
        hoanCoc: { tyLe: 50, soTien: '50000.00' },
      }),
    ).toEqual({ maLichHen: 'CP1', hoanCoc: { tyLe: 50, soTien: '50000.00' } });
    expect(
      parseCancelResult({
        maLichHen: 'CP1',
        trangThai: 'DaHuy',
        hoanCoc: null,
      }),
    ).toEqual({ maLichHen: 'CP1', hoanCoc: null });
  });

  it('HHL-10 trangThai khác DaHuy hay sai hình dạng ⇒ không dùng được (không bao giờ hiện "Đã hủy" khi máy chủ nói điều khác)', () => {
    unusableResult(null);
    unusableResult({ maLichHen: 'CP1', trangThai: 'DaXacNhan', hoanCoc: null });
    unusableResult({ maLichHen: 'CP1', hoanCoc: null });
    unusableResult({ maLichHen: '', trangThai: 'DaHuy', hoanCoc: null });
    unusableResult({ maLichHen: 'CP1', trangThai: 'DaHuy' });
    unusableResult({
      maLichHen: 'CP1',
      trangThai: 'DaHuy',
      hoanCoc: { tyLe: 150, soTien: '1.00' },
    });
    unusableResult({
      maLichHen: 'CP1',
      trangThai: 'DaHuy',
      hoanCoc: { tyLe: 5, soTien: 'abc' },
    });
  });
});

describe('getCancelPreview, cancelPatientAppointment', () => {
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
  const lastCall = (fetchMock: ReturnType<typeof stubFetch>) =>
    fetchMock.mock.calls[0] as unknown as [string, RequestInit];

  it('HHL-01 xem trước: GET đúng đường dẫn, gắn token, không thân', async () => {
    const fetchMock = stubFetch(
      Response.json({ choPhepHuy: true, hoanCoc: null }),
    );
    await getCancelPreview('CP2026/1');

    const [url, init] = lastCall(fetchMock);
    expect(url).toBe('/api/patient/appointments/CP2026%2F1/cancel-preview');
    expect(init.method).toBe('GET');
    expect(new Headers(init.headers).get('Authorization')).toBe(
      'Bearer token-gia',
    );
    expect(init.body).toBeUndefined();
  });

  it('HHL-12 huỷ: POST đúng đường dẫn, gắn token, thân là {} (không có lyDo: Bệnh nhân không nhập lý do, Q27)', async () => {
    const fetchMock = stubFetch(
      Response.json({ maLichHen: 'CP1', trangThai: 'DaHuy', hoanCoc: null }),
    );
    const result = await cancelPatientAppointment('CP1');

    expect(result).toEqual({ maLichHen: 'CP1', hoanCoc: null });
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe('/api/patient/appointments/CP1/cancel');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Authorization')).toBe(
      'Bearer token-gia',
    );
    expect(init.body).toBe('{}');
    expect(String(init.body)).not.toContain('lyDo');
  });

  it('HHL-10 200 nhưng thân sai hợp đồng ⇒ UnexpectedResponseError (giao diện coi là "chưa rõ", không hiện Đã hủy)', async () => {
    stubFetch(
      Response.json({
        maLichHen: 'CP1',
        trangThai: 'DaXacNhan',
        hoanCoc: null,
      }),
    );
    await expect(cancelPatientAppointment('CP1')).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
  });
});
