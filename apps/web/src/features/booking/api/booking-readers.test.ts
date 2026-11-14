import { describe, expect, it } from 'vitest';
import { UnexpectedResponseError } from '../../../shared/api/errors';
import {
  RELATIVES,
  makeCheckResult,
  makeRelative,
} from '../testing/fake-booking-api';
import { parseCheckSummary, parseRelatives } from './booking-readers';

// booking F4. BRD-01…BRD-03 là [đề xuất] (PLAN booking mục 7.38). Bộ đọc chỉ giữ đúng các khoá cần; sai hình ⇒ `UnexpectedResponseError`.
const body = (...items: unknown[]) => ({ items });

describe('booking F4 — bộ đọc `GET /patient/relatives`', () => {
  it('BRD-01 chỉ giữ ba khoá cần; giới tính, ngày sinh, SĐT không lọt ra; id lớn hơn 2^53 giữ nguyên chuỗi', () => {
    const result = parseRelatives(
      body(
        makeRelative({ hoSoNguoiThanId: '9007199254740993' }),
        makeRelative({ hoSoNguoiThanId: '9223372036854775807' }),
      ),
    );
    expect(result).toEqual([
      {
        hoSoNguoiThanId: '9007199254740993',
        hoTen: 'Nguyễn Thị Bích',
        moiQuanHe: 'Me',
      },
      {
        hoSoNguoiThanId: '9223372036854775807',
        hoTen: 'Nguyễn Thị Bích',
        moiQuanHe: 'Me',
      },
    ]);
    for (const relative of result) {
      expect(Object.keys(relative).sort()).toEqual([
        'hoSoNguoiThanId',
        'hoTen',
        'moiQuanHe',
      ]);
    }
    const text = JSON.stringify(result);
    for (const leaked of ['Nu', '1960', '0907654321', 'gioiTinh', 'ngaySinh']) {
      expect(text).not.toContain(leaked);
    }
    expect(parseRelatives(body())).toEqual([]);
  });

  it('BRD-01 sai hình dạng ⇒ UnexpectedResponseError (kể cả hàng ngừng sử dụng): không phải đối tượng, thiếu `items`, `items` không phải mảng, id sai dạng, tên rỗng', () => {
    const wrong: unknown[] = [
      null,
      'html',
      [],
      {},
      { items: null },
      { items: {} },
      body(null),
      body('x'),
      body(makeRelative({ hoSoNguoiThanId: 101 })),
      body(makeRelative({ hoSoNguoiThanId: '007' })),
      body(makeRelative({ hoSoNguoiThanId: '' })),
      body(makeRelative({ hoSoNguoiThanId: '-5' })),
      body(makeRelative({ hoTen: '' })),
      body(makeRelative({ hoTen: 5 })),
      body(makeRelative({ moiQuanHe: null })),
      // Hàng ngừng sử dụng cũng phải đúng hình dạng: một dòng hỏng không được bị bỏ qua âm thầm
      body(
        makeRelative(),
        makeRelative({ trangThaiHieuLuc: false, hoSoNguoiThanId: 'abc' }),
      ),
    ];
    for (const raw of wrong) {
      expect(() => parseRelatives(raw)).toThrow(UnexpectedResponseError);
    }
  });

  it('BRD-02 chỉ giữ `trangThaiHieuLuc === true`, giữ thứ tự của API; "true", 1, null, vắng ⇒ lỗi (không coi là hiệu lực)', () => {
    const result = parseRelatives(RELATIVES);
    expect(result.map((relative) => relative.hoSoNguoiThanId)).toEqual([
      '101',
      '102',
    ]);
    expect(result.some((relative) => relative.hoTen === 'Nguyễn Văn Cũ')).toBe(
      false,
    );
    expect(
      parseRelatives(body(makeRelative({ trangThaiHieuLuc: false }))),
    ).toEqual([]);
    for (const flag of ['true', 'false', 1, 0, null, undefined]) {
      expect(() =>
        parseRelatives(body(makeRelative({ trangThaiHieuLuc: flag }))),
      ).toThrow(UnexpectedResponseError);
    }
  });
});

describe('booking F4 — bộ đọc `tomTat` của `POST /booking/checks`', () => {
  it('BRD-03 chỉ giữ dịch vụ, bác sĩ, thời gian; giá, cọc, chi nhánh, người khám không lọt ra', () => {
    const result = parseCheckSummary(makeCheckResult());
    expect(result).toEqual({
      dichVu: 'Tim mạch',
      bacSi: { hoTen: 'Nguyễn Minh Anh', chucDanh: 'ThS_BS' },
      thoiGian: '2026-10-20T02:00:00.000Z',
    });
    const text = JSON.stringify(result);
    for (const leaked of [
      '300000',
      '100000',
      'Quận 3',
      'giaApDung',
      'tienCoc',
      'laBanThan',
    ]) {
      expect(text).not.toContain(leaked);
    }
    // Chức danh lạ (API thêm chức danh mới) vẫn đi qua để nhãn hiện nguyên mã
    expect(
      parseCheckSummary(
        makeCheckResult({ bacSi: { hoTen: 'Lê Văn B', chucDanh: 'GS_X' } }),
      ).bacSi.chucDanh,
    ).toBe('GS_X');
  });

  it('BRD-03 sai hình dạng ⇒ UnexpectedResponseError: thiếu `tomTat`, `bacSi` null, tên rỗng, `thoiGian` không phải ISO', () => {
    const wrong: unknown[] = [
      null,
      {},
      { tomTat: null },
      { tomTat: [] },
      makeCheckResult({ bacSi: null }),
      makeCheckResult({ bacSi: { hoTen: '', chucDanh: 'BS' } }),
      makeCheckResult({ bacSi: { hoTen: 'A', chucDanh: 5 } }),
      makeCheckResult({ dichVu: { ten: '' } }),
      makeCheckResult({ dichVu: 'Tim mạch' }),
      makeCheckResult({ thoiGian: 'hôm nay' }),
      makeCheckResult({ thoiGian: 20261020 }),
      makeCheckResult({ thoiGian: undefined }),
    ];
    for (const raw of wrong) {
      expect(() => parseCheckSummary(raw)).toThrow(UnexpectedResponseError);
    }
  });
});
