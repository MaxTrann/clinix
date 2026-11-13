import { describe, expect, it } from 'vitest';
import { checkCancelReason, REASON_MAX_LENGTH } from './cancel-reason';

// booking F9: luật của ô `Lý do hủy *` (Q27, LTN-02). Mã LTA là [đề xuất] (PLAN booking mục 7.36). Backend: `trim()` của JS rồi `length` từ 1 đến 255 theo đơn vị UTF-16.
describe('checkCancelReason', () => {
  it('LTA-05 rỗng, chỉ khoảng trắng (kể cả khoảng không ngắt, BOM, xuống dòng, tab, khoảng rộng) ⇒ bắt buộc', () => {
    for (const input of [
      '',
      ' ',
      '   ',
      '\n',
      '\t \n',
      ' ',
      '﻿',
      '　 ',
      '\r\n\r\n',
    ]) {
      expect(checkCancelReason(input), JSON.stringify(input)).toEqual({
        ok: false,
        error: 'required',
      });
    }
  });

  it('LTA-05 biên 255 và 256 đơn vị UTF-16: 255 qua, 256 quá dài; cắt khoảng trắng TRƯỚC khi đếm', () => {
    expect(REASON_MAX_LENGTH).toBe(255);
    expect(checkCancelReason('a'.repeat(255))).toEqual({
      ok: true,
      value: 'a'.repeat(255),
    });
    expect(checkCancelReason('a'.repeat(256))).toEqual({
      ok: false,
      error: 'tooLong',
    });
    // 255 ký tự kèm khoảng trắng hai đầu: sau khi cắt vẫn 255 nên qua
    expect(checkCancelReason(`  \n${'a'.repeat(255)}\t `)).toEqual({
      ok: true,
      value: 'a'.repeat(255),
    });
    // Khoảng trắng ở GIỮA không bị cắt và vẫn được đếm
    expect(checkCancelReason(`a${' '.repeat(254)}b`)).toEqual({
      ok: false,
      error: 'tooLong',
    });
  });

  it('LTA-05 đếm theo ĐƠN VỊ UTF-16, không theo điểm mã: một biểu tượng là 2 đơn vị (127 biểu tượng và "a" = 255 qua; 128 biểu tượng = 256 bị chặn)', () => {
    expect(checkCancelReason('😀'.repeat(127) + 'a').ok).toBe(true);
    expect(checkCancelReason('😀'.repeat(128))).toEqual({
      ok: false,
      error: 'tooLong',
    });
  });

  it('LTA-05 KHÔNG chuẩn hoá NFC khi đếm (máy chủ không chuẩn hoá): "é" dạng tổ hợp 2 đơn vị, 128 lần là 256 ⇒ bị chặn', () => {
    const decomposed = 'é';
    expect(decomposed.length).toBe(2);
    expect(checkCancelReason(decomposed.repeat(128))).toEqual({
      ok: false,
      error: 'tooLong',
    });
    expect(checkCancelReason(decomposed.repeat(127)).ok).toBe(true);
  });

  it('LTA-05 giá trị trả về là chuỗi ĐÃ CẮT (đúng thứ sẽ gửi đi), giữ nguyên chữ và dấu cách bên trong', () => {
    expect(checkCancelReason('  Bệnh nhân   báo bận \n')).toEqual({
      ok: true,
      value: 'Bệnh nhân   báo bận',
    });
  });
});
