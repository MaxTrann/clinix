import { describe, expect, it } from 'vitest';
import {
  checkReason,
  HIDE_REASON_MAX,
  HIDE_REASON_MIN,
  reasonCount,
} from './hide-rules';

// doctor-exam F8, WKD-20 [đề xuất]: quy tắc "lý do ẩn" phía web (hàm thuần). Bộ vector CHÉP NGUYÊN GIÁ TRỊ từ `apps/api/src/doctor/examination/moderation/rating-hide.rules.spec.ts` (KDD-05, KDD-06) để hai bản TS không lệch nhau mà không ai biết;
// chỉ các ca có kiểu chuỗi (máy chủ còn nhận `undefined`, `null`, số, mảng: web chỉ có chuỗi từ ô nhập). Chuẩn hoá và đếm dùng chung `normalizeText`, `textLength` của F3.
const REQUIRED = { ok: false, code: 'LY_DO_BAT_BUOC' };
const TOO_SHORT = { ok: false, code: 'LY_DO_QUA_NGAN' };
const TOO_LONG = { ok: false, code: 'LY_DO_QUA_DAI' };
const VALID = 'Nội dung quảng cáo, không liên quan đến buổi khám';

// Lý do đúng `n` đơn vị UTF-16 (chữ `x`: không dùng chữ số hex, vì 64 ký tự hex liền nhau là dạng bí mật mà MÁY CHỦ che)
const reasonOf = (n: number) => 'x'.repeat(n);
const valueOf = (raw: string): string => {
  const result = checkReason(raw);
  if (!result.ok) throw new Error(`lẽ ra hợp lệ: ${result.code}`);
  return result.value;
};

describe('doctor-exam F8 — hằng số (WKD-20)', () => {
  it('WKD-20 đúng hằng của schema và của máy chủ: tối thiểu 10, tối đa 255', () => {
    expect(HIDE_REASON_MIN).toBe(10);
    expect(HIDE_REASON_MAX).toBe(255);
  });
});

describe('doctor-exam F8 — lý do thiếu hoặc trống ⇒ LY_DO_BAT_BUOC (WKD-20; KDD-05)', () => {
  it.each([
    ['chuỗi rỗng', ''],
    ['chỉ khoảng trắng', '   \t  '],
    ['chỉ xuống dòng', '\r\n \n'],
    [
      'chỉ ký tự điều khiển (bị chuẩn hoá thành rỗng)',
      '\u0000\u0001\u0007\u007f',
    ],
  ])('%s ⇒ BAT_BUOC (không phải NGAN)', (_name, raw) => {
    expect(checkReason(raw)).toEqual(REQUIRED);
  });
});

describe('doctor-exam F8 — biên độ dài: đếm SAU chuẩn hoá, theo đơn vị UTF-16 (WKD-20; KDD-06)', () => {
  it.each([
    [9, TOO_SHORT],
    [10, null],
    [11, null],
    [254, null],
    [255, null],
    [256, TOO_LONG],
    [2000, TOO_LONG],
  ])('%i đơn vị ⇒ %j', (n, expected) => {
    const result = checkReason(reasonOf(n));
    if (expected === null) {
      expect(result).toEqual({ ok: true, value: reasonOf(n) });
    } else {
      expect(result).toEqual(expected);
    }
  });

  it('WKD-20 khoảng trắng đầu và cuối KHÔNG được tính: 9 chữ + 5 khoảng trắng ⇒ NGAN; 10 chữ + khoảng trắng ⇒ hợp lệ và đã trim; 255 chữ + khoảng trắng ⇒ hợp lệ; 256 chữ ⇒ DAI', () => {
    expect(checkReason(`  ${reasonOf(9)}   `)).toEqual(TOO_SHORT);
    expect(valueOf(`  ${reasonOf(10)}   `)).toBe(reasonOf(10));
    expect(valueOf(` ${reasonOf(255)} \n`)).toBe(reasonOf(255));
    expect(checkReason(` ${reasonOf(256)} `)).toEqual(TOO_LONG);
  });

  it('WKD-20 emoji là CẶP THAY THẾ (2 đơn vị): 127 emoji + 1 chữ = 255 được; 128 emoji = 256 ⇒ DAI; 5 emoji = 10 được; 4 emoji + 1 chữ = 9 ⇒ NGAN', () => {
    expect(valueOf(`${'😀'.repeat(127)}a`)).toHaveLength(255);
    expect(checkReason('😀'.repeat(128))).toEqual(TOO_LONG);
    expect(valueOf('😀'.repeat(5))).toHaveLength(10);
    expect(checkReason(`${'😀'.repeat(4)}a`)).toEqual(TOO_SHORT);
  });

  it('WKD-20 ký tự điều khiển bị bỏ TRƯỚC khi đếm: 256 đơn vị trong đó có một ký tự điều khiển ⇒ còn 255 nên được; 10 đơn vị trong đó có một ký tự điều khiển ⇒ còn 9 ⇒ NGAN', () => {
    expect(valueOf(`${reasonOf(255)}\u0001`)).toBe(reasonOf(255));
    expect(checkReason(`${reasonOf(9)}\u0001`)).toEqual(TOO_SHORT);
  });

  it('WKD-20 CRLF đếm là MỘT đơn vị (⇒ LF): "abcd\\r\\nefgh" có 9 đơn vị sau chuẩn hoá nên NGAN dù chuỗi thô dài 10', () => {
    expect('abcd\r\nefgh').toHaveLength(10);
    expect(checkReason('abcd\r\nefgh')).toEqual(TOO_SHORT);
    expect(checkReason('abcd\r\nefghi')).toEqual({
      ok: true,
      value: 'abcd\nefghi',
    });
  });

  it('WKD-20 thứ tự mã: rỗng ⇒ BAT_BUOC (không phải NGAN); ngắn ⇒ NGAN; dài ⇒ DAI; mỗi lần đúng MỘT mã', () => {
    expect(checkReason('')).toEqual(REQUIRED);
    expect(checkReason('a')).toEqual(TOO_SHORT);
    expect(checkReason(reasonOf(300))).toEqual(TOO_LONG);
  });
});

describe('doctor-exam F8 — chuẩn hoá lý do (cùng `normalizeText` với hồ sơ khám; WKD-20; KDD-04, KDD-05)', () => {
  it('WKD-20 trim hai đầu; CRLF và CR ⇒ LF; giữ xuống dòng và TAB ở giữa; giữ emoji và chữ có dấu', () => {
    expect(valueOf(`  ${VALID}  `)).toBe(VALID);
    expect(valueOf('Dòng một\r\nDòng hai\rDòng ba\tcột')).toBe(
      'Dòng một\nDòng hai\nDòng ba\tcột',
    );
    expect(valueOf('Quảng cáo 😀 không liên quan')).toBe(
      'Quảng cáo 😀 không liên quan',
    );
  });

  it('WKD-20 ký tự điều khiển (trừ LF, TAB) bị bỏ; surrogate lẻ ⇒ U+FFFD', () => {
    expect(valueOf('Quảng\u0000 cáo\u0007 spam\u007f')).toBe('Quảng cáo spam');
    expect(valueOf('Quảng cáo \ud83d lẻ')).toBe('Quảng cáo � lẻ');
    expect(valueOf('Quảng cáo \ude00 lẻ')).toBe('Quảng cáo � lẻ');
  });

  it('WKD-20 không đổi nội dung người dùng ngoài các việc trên (không gộp khoảng trắng giữa, không đổi hoa thường)', () => {
    expect(valueOf('Nội  dung   QUẢNG cáo')).toBe('Nội  dung   QUẢNG cáo');
  });

  it('WKD-20 dạng bí mật KHÔNG bị chặn ở máy (bộ che của `audit/` không chép sang web): máy chủ trả `NOI_DUNG_KHONG_HOP_LE`, web chỉ hiện lỗi đó theo ô', () => {
    for (const sample of ['Bearer abc123xyz', 'otp: 3 lần/ngày xin ẩn']) {
      expect(valueOf(sample)).toBe(sample);
    }
  });
});

describe('doctor-exam F8 — số của bộ đếm (WKD-20, WKD-24)', () => {
  it('WKD-20 `reasonCount` đếm SAU chuẩn hoá bằng đơn vị UTF-16: đúng số mà máy chủ sẽ đếm', () => {
    expect(reasonCount('')).toBe(0);
    expect(reasonCount('   ')).toBe(0);
    expect(reasonCount('  abc  \r\n')).toBe(3);
    expect(reasonCount('a\r\nb')).toBe(3);
    expect(reasonCount('😀')).toBe(2);
    expect(reasonCount(`${reasonOf(255)}\u0001`)).toBe(255);
  });
});
