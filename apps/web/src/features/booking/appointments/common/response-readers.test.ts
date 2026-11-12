import { describe, expect, it } from 'vitest';
import { UnexpectedResponseError } from '../../../../shared/api/errors';
import {
  readAmount,
  readCode,
  readCount,
  readFlag,
  readId,
  readIsoDateTime,
  readList,
  readRecord,
  readText,
} from './response-readers';

// booking F1, phần "bộ đọc phản hồi" của LHL-15 (PLAN booking mục 7.31 sau khi duyệt): phản hồi 200 sai hình dạng là "không dùng được"
// (UnexpectedResponseError, cùng loại với HTML 502), không được để lọt thành trang trắng. Mỗi bộ đọc có ca đúng và ca âm.
const rejects = (read: () => unknown) =>
  expect(read).toThrow(UnexpectedResponseError);

describe('booking F1 — bộ đọc phản hồi', () => {
  it('LHL-15 readRecord nhận đối tượng, từ chối null, mảng và giá trị nguyên thuỷ', () => {
    const value = { a: 1 };
    expect(readRecord(value)).toBe(value);
    for (const bad of [null, undefined, [], [1], 'x', 1, true]) {
      rejects(() => readRecord(bad));
    }
  });

  it('LHL-15 readList nhận mảng (kể cả rỗng), từ chối đối tượng và null', () => {
    expect(readList([])).toEqual([]);
    expect(readList([1, 2])).toEqual([1, 2]);
    for (const bad of [null, undefined, {}, 'x', 0])
      rejects(() => readList(bad));
  });

  it('LHL-15 readText nhận mọi chuỗi (kể cả rỗng), readCode từ chối chuỗi rỗng', () => {
    expect(readText('')).toBe('');
    expect(readText('Tim mạch')).toBe('Tim mạch');
    expect(readCode('CP20261020001')).toBe('CP20261020001');
    rejects(() => readCode(''));
    for (const bad of [null, undefined, 1, {}, []]) {
      rejects(() => readText(bad));
      rejects(() => readCode(bad));
    }
  });

  it('LHL-15 readFlag chỉ nhận boolean thật (không nhận "true", 1)', () => {
    expect(readFlag(true)).toBe(true);
    expect(readFlag(false)).toBe(false);
    for (const bad of ['true', 1, 0, null, undefined]) {
      rejects(() => readFlag(bad));
    }
  });

  // Biên: số đếm 0 hợp lệ; trang tối thiểu 1; không nhận số thập phân, âm, NaN, vô hạn hay chuỗi số
  it('LHL-15 readCount: 0 hợp lệ ở số đếm; `min` làm cận dưới; từ chối thập phân, âm, NaN, Infinity, chuỗi', () => {
    expect(readCount(0)).toBe(0);
    expect(readCount(11)).toBe(11);
    expect(readCount(1, 1)).toBe(1);
    rejects(() => readCount(0, 1));
    for (const bad of [-1, 1.5, NaN, Infinity, '3', null, undefined]) {
      rejects(() => readCount(bad));
    }
  });

  it('LHL-15 readId giữ nguyên chuỗi id (kể cả lớn hơn 2^53), từ chối số, số 0 đầu, 0 và chữ', () => {
    expect(readId('7')).toBe('7');
    expect(readId('9007199254740993')).toBe('9007199254740993');
    for (const bad of [7, '', '0', '07', '-1', '1.5', 'abc', '1 ', null]) {
      rejects(() => readId(bad));
    }
  });

  it('LHL-15 readIsoDateTime và readAmount từ chối chuỗi sai dạng (không để tới hàm format)', () => {
    expect(readIsoDateTime('2026-10-20T01:00:00.000Z')).toBe(
      '2026-10-20T01:00:00.000Z',
    );
    expect(readAmount('300000.00')).toBe('300000.00');
    for (const bad of ['', '2026-10-20', 'abc', 20261020, null]) {
      rejects(() => readIsoDateTime(bad));
    }
    for (const bad of ['', '-1', '1e3', '3,5', 300000, null]) {
      rejects(() => readAmount(bad));
    }
  });
});
