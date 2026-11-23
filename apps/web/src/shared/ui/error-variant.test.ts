import { ServerCrash, WifiOff } from 'lucide-react';
import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
} from '../api/errors';
import {
  ERROR_VARIANTS,
  errorVariantOf,
  pageMessageFor,
} from './error-variant';

// DUX4-01 đến 07 (doctor UX4, G18, T9): chọn biến thể chữ của màn lỗi 500 theo LOẠI lỗi (`instanceof`), không đọc thông điệp.
// Hai biến thể theo T9: sự cố hệ thống; mất kết nối HOẶC quá thời gian (cùng một tiêu đề, câu khác nhau).

describe('errorVariantOf', () => {
  it('DUX4-01 NetworkError là biến thể mạng', () => {
    expect(errorVariantOf(new NetworkError())).toBe('connection');
  });

  it('DUX4-02 TimeoutError cũng là biến thể mạng (cùng tiêu đề với mất kết nối)', () => {
    expect(errorVariantOf(new TimeoutError())).toBe('connection');
  });

  it('DUX4-03 lỗi phía máy chủ (5xx, LOI_HE_THONG, mã lạ, phản hồi không phải JSON) là sự cố hệ thống', () => {
    const body = { thongBao: 'bí mật', requestId: 'r-1' };
    expect(
      errorVariantOf(new ApiError(500, { maLoi: 'LOI_HE_THONG', ...body })),
    ).toBe('system');
    expect(errorVariantOf(new ApiError(418, { maLoi: 'MA_LA', ...body }))).toBe(
      'system',
    );
    expect(errorVariantOf(new UnexpectedResponseError(502))).toBe('system');
  });

  it('DUX4-04 lỗi không phân loại được (Error thường, chuỗi, số, null, undefined, đối tượng trơn) là sự cố hệ thống', () => {
    for (const value of [
      new Error('x'),
      new TypeError('Failed to fetch dynamically imported module'),
      'chuỗi',
      42,
      null,
      undefined,
      {},
      { message: 'SELECT 1' },
    ]) {
      expect(errorVariantOf(value)).toBe('system');
    }
  });

  it('DUX4-05 RequestAbortedError không phải lỗi mạng (khối lỗi nhỏ tự bỏ qua nó, màn cả trang coi như lỗi hệ thống)', () => {
    expect(errorVariantOf(new RequestAbortedError())).toBe('system');
  });
});

describe('ERROR_VARIANTS', () => {
  it('DUX4-06 hai biến thể có icon và tiêu đề riêng, đúng chữ đã duyệt (T9: sự cố hệ thống; mất kết nối hoặc quá thời gian)', () => {
    const { system, connection } = ERROR_VARIANTS;
    expect(system.icon).toBe(ServerCrash);
    expect(connection.icon).toBe(WifiOff);
    expect(system.title).toBe('Hệ thống đang gặp sự cố');
    expect(connection.title).toBe('Không kết nối được tới hệ thống');
  });
});

describe('pageMessageFor', () => {
  it('DUX4-07 ba câu trên màn cả trang (hệ thống, mất mạng, quá thời gian) khác nhau và không rỗng; không in thông điệp của lỗi', () => {
    const system = pageMessageFor(
      new ApiError(500, {
        maLoi: 'LOI_HE_THONG',
        thongBao: 'SELECT * FROM tai_khoan',
      }),
    );
    const network = pageMessageFor(new NetworkError());
    const timeout = pageMessageFor(new TimeoutError());

    for (const text of [system, network, timeout]) {
      expect(text.trim()).not.toBe('');
      expect(text).not.toMatch(/SELECT|tai_khoan|LOI_HE_THONG/);
    }
    expect(new Set([system, network, timeout]).size).toBe(3);
    // Ghim câu nào ứng với lỗi nào (nếu chỉ so "khác nhau" thì hoán hai câu vẫn qua)
    expect(system).toMatch(/thử lại sau ít phút/);
    expect(network).toMatch(/kết nối mạng/);
    expect(timeout).toMatch(/quá nhiều thời gian/);
    expect(pageMessageFor(new Error('bất kỳ'))).toBe(system);
    expect(pageMessageFor(null)).toBe(system);
  });
});
