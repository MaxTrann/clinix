import { describe, expect, it } from 'vitest';
import {
  EMPTY_REQUEST_FILTERS,
  hasActiveRequestFilters,
  readRequestFilters,
  tabStatuses,
  writeRequestFilters,
  type RequestFilters,
} from './request-query-state';

// reschedule F4, WXD-37…WXD-44 (`[đề xuất]`; PLAN reschedule 7.11, WXD-10 "URL giữ tab"): bộ lọc của trang yêu cầu đổi lịch nằm trên URL (tab, trang, mã lịch `q`, bác sĩ). URL là dữ liệu NGƯỜI DÙNG SỬA
// ĐƯỢC: mọi giá trị đọc ra đều được kiểm lại, sai dạng thì bỏ như không có (nếp `reception-query-state.ts`). Hàm thuần.
const read = (search: string) =>
  readRequestFilters(new URLSearchParams(search));
const write = (filters: RequestFilters) =>
  writeRequestFilters(filters).toString();

describe('bộ lọc yêu cầu đổi lịch trên URL', () => {
  it('WXD-37 URL trống ⇒ mặc định: tab Chờ duyệt, trang 1, không lọc', () => {
    expect(read('')).toEqual({
      tab: 'cho-duyet',
      page: 1,
      bacSiId: '',
      q: '',
    });
    expect(EMPTY_REQUEST_FILTERS).toEqual(read(''));
  });

  it('WXD-38 tab: `da-xu-ly` đọc được; `cho-duyet`, chữ hoa, giá trị lạ, rỗng ⇒ về mặc định', () => {
    expect(read('tab=da-xu-ly').tab).toBe('da-xu-ly');
    expect(read('tab=cho-duyet').tab).toBe('cho-duyet');
    for (const bad of [
      'DA-XU-LY',
      'da xu ly',
      'DaDuyet',
      'xyz',
      '',
      '__proto__',
    ]) {
      expect(read(`tab=${encodeURIComponent(bad)}`).tab).toBe('cho-duyet');
    }
  });

  it('WXD-39 trang: số nguyên dương nhiều nhất 5 chữ số; còn lại về 1 (URL tự gõ không được đẩy lên API)', () => {
    expect(read('page=3').page).toBe(3);
    expect(read('page=99999').page).toBe(99999);
    for (const bad of [
      '0',
      '-1',
      '1.5',
      '007',
      'abc',
      '',
      '99999999999',
      '1e3',
      ' 2',
    ]) {
      expect(read(`page=${encodeURIComponent(bad)}`).page).toBe(1);
    }
  });

  it('WXD-40 bác sĩ: id BIGINT dạng chuỗi, giữ NGUYÊN (lớn hơn 2^53 không đi qua Number); sai dạng ⇒ bỏ', () => {
    expect(read('bacSiId=12').bacSiId).toBe('12');
    expect(read('bacSiId=9007199254740993').bacSiId).toBe('9007199254740993');
    for (const bad of ['0', '012', 'abc', '1e3', '-4', '1.5', '', ' 7']) {
      expect(read(`bacSiId=${encodeURIComponent(bad)}`).bacSiId).toBe('');
    }
  });

  it('WXD-41 mã lịch `q`: chữ thường được chuẩn hoá thành chữ hoa; sai dạng ⇒ bỏ (KHÔNG gọi API với chữ sai)', () => {
    expect(read('q=CLX-20261120-7K3M9').q).toBe('CLX-20261120-7K3M9');
    expect(read('q=clx-20261120-7k3m9').q).toBe('CLX-20261120-7K3M9');
    expect(read(`q=${encodeURIComponent('  CLX-20261120-7K3M9 ')}`).q).toBe(
      'CLX-20261120-7K3M9',
    );
    for (const bad of ['abc', 'CLX-20261120-7K3M', 'CLX-20261120-7K3MI', '']) {
      expect(read(`q=${encodeURIComponent(bad)}`).q).toBe('');
    }
  });

  it('WXD-42 ghi: chỉ khoá KHÁC mặc định, thứ tự cố định (tab, bacSiId, q, page); mặc định ⇒ URL trống', () => {
    expect(write(EMPTY_REQUEST_FILTERS)).toBe('');
    expect(
      write({
        tab: 'da-xu-ly',
        page: 4,
        bacSiId: '12',
        q: 'CLX-20261120-7K3M9',
      }),
    ).toBe('tab=da-xu-ly&bacSiId=12&q=CLX-20261120-7K3M9&page=4');
    expect(write({ ...EMPTY_REQUEST_FILTERS, page: 1 })).toBe('');
    expect(write({ ...EMPTY_REQUEST_FILTERS, page: 2 })).toBe('page=2');
    expect(write({ ...EMPTY_REQUEST_FILTERS, tab: 'cho-duyet' })).toBe('');
  });

  it('WXD-42 ghi chuẩn hoá `q` chữ thường thành chữ hoa và bỏ `q` sai dạng', () => {
    expect(write({ ...EMPTY_REQUEST_FILTERS, q: 'clx-20261120-7k3m9' })).toBe(
      'q=CLX-20261120-7K3M9',
    );
    expect(write({ ...EMPTY_REQUEST_FILTERS, q: 'không phải mã' })).toBe('');
  });

  it('WXD-43 đọc rồi ghi: URL lộn xộn (khoá lạ, giá trị sai, khoá lặp) ra đúng một dạng chuẩn; hai bộ lọc bằng nhau ra cùng một chuỗi', () => {
    expect(write(read('page=02&tab=zzz&x=1&bacSiId=0&q=abc'))).toBe('');
    expect(write(read('foo=bar&tab=da-xu-ly&page=2'))).toBe(
      'tab=da-xu-ly&page=2',
    );
    expect(write(read('page=2&tab=da-xu-ly'))).toBe(
      write(read('tab=da-xu-ly&page=2')),
    );
    const filters: RequestFilters = {
      tab: 'da-xu-ly',
      page: 7,
      bacSiId: '9007199254740993',
      q: 'CLX-20261120-7K3M9',
    };
    expect(read(write(filters))).toEqual(filters);
  });

  it('WXD-44 `tabStatuses`: Chờ duyệt ⇒ `ChoDuyet`; Đã xử lý ⇒ `DaDuyet,TuChoi`', () => {
    expect(tabStatuses('cho-duyet')).toBe('ChoDuyet');
    expect(tabStatuses('da-xu-ly')).toBe('DaDuyet,TuChoi');
  });

  it('WXD-44 "đang lọc" chỉ tính bác sĩ và mã lịch; tab và trang không phải bộ lọc', () => {
    expect(hasActiveRequestFilters(EMPTY_REQUEST_FILTERS)).toBe(false);
    expect(
      hasActiveRequestFilters({
        ...EMPTY_REQUEST_FILTERS,
        tab: 'da-xu-ly',
        page: 3,
      }),
    ).toBe(false);
    expect(
      hasActiveRequestFilters({ ...EMPTY_REQUEST_FILTERS, bacSiId: '5' }),
    ).toBe(true);
    expect(
      hasActiveRequestFilters({
        ...EMPTY_REQUEST_FILTERS,
        q: 'CLX-20261120-7K3M9',
      }),
    ).toBe(true);
  });
});
