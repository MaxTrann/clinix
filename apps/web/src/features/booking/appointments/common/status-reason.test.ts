import { describe, expect, it } from 'vitest';
import { checkStatusReason, REASON_MAX_LENGTH } from './status-reason';

// booking F9 (chuyển lên common/ ở F10): luật của ô `Lý do hủy *` và `Lý do *` của override (Q27, LTN-02). Mã LTA là [đề xuất] (PLAN booking mục 7.36). Backend: `trim()` của JS rồi `length` từ 1 đến 255 theo đơn vị UTF-16.
describe('checkStatusReason', () => {
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
      expect(checkStatusReason(input), JSON.stringify(input)).toEqual({
        ok: false,
        error: 'required',
      });
    }
  });

  it('LTA-05 biên 255 và 256 đơn vị UTF-16: 255 qua, 256 quá dài; cắt khoảng trắng TRƯỚC khi đếm', () => {
    expect(REASON_MAX_LENGTH).toBe(255);
    expect(checkStatusReason('a'.repeat(255))).toEqual({
      ok: true,
      value: 'a'.repeat(255),
    });
    expect(checkStatusReason('a'.repeat(256))).toEqual({
      ok: false,
      error: 'tooLong',
    });
    // 255 ký tự kèm khoảng trắng hai đầu: sau khi cắt vẫn 255 nên qua
    expect(checkStatusReason(`  \n${'a'.repeat(255)}\t `)).toEqual({
      ok: true,
      value: 'a'.repeat(255),
    });
    // Khoảng trắng ở GIỮA không bị cắt và vẫn được đếm
    expect(checkStatusReason(`a${' '.repeat(254)}b`)).toEqual({
      ok: false,
      error: 'tooLong',
    });
  });

  it('LTA-05 đếm theo ĐƠN VỊ UTF-16, không theo điểm mã: một biểu tượng là 2 đơn vị (127 biểu tượng và "a" = 255 qua; 128 biểu tượng = 256 bị chặn)', () => {
    expect(checkStatusReason('😀'.repeat(127) + 'a').ok).toBe(true);
    expect(checkStatusReason('😀'.repeat(128))).toEqual({
      ok: false,
      error: 'tooLong',
    });
  });

  it('LTA-05 KHÔNG chuẩn hoá NFC khi đếm (máy chủ không chuẩn hoá): "é" dạng tổ hợp 2 đơn vị, 128 lần là 256 ⇒ bị chặn', () => {
    const decomposed = 'é';
    expect(decomposed.length).toBe(2);
    expect(checkStatusReason(decomposed.repeat(128))).toEqual({
      ok: false,
      error: 'tooLong',
    });
    expect(checkStatusReason(decomposed.repeat(127)).ok).toBe(true);
  });

  it('LTA-05 giá trị trả về là chuỗi ĐÃ CẮT (đúng thứ sẽ gửi đi), giữ nguyên chữ và dấu cách bên trong', () => {
    expect(checkStatusReason('  Bệnh nhân   báo bận \n')).toEqual({
      ok: true,
      value: 'Bệnh nhân   báo bận',
    });
  });
});
