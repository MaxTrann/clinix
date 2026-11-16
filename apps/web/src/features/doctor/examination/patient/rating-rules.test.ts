import { describe, expect, it } from 'vitest';
import { checkRating, commentCount } from './rating-rules';

// doctor-exam F6, WDG-10 và WDG-13 [đề xuất]: quy tắc đánh giá phía web, HÀM THUẦN (PLAN 5.2, 5.7; Q7). Đây là bản TS riêng của `rating.rules.ts` ở api (`features/` không import mã `apps/api`): hai bản giữ khớp bằng cùng bộ vector.
// VECTOR CHÉP từ `apps/api/src/doctor/examination/rating/rating.rules.spec.ts` (DGB-02 số sao, DGB-03 nhận xét, DGB-12 chuẩn hoá): giá trị mong đợi viết tay, KHÔNG lấy lại từ hằng của mã đang kiểm (giới hạn viết thẳng 1000).
// Ở web chỉ chặn sớm lỗi hiển nhiên; máy chủ vẫn là nơi quyết định cuối. Nhận xét TUỲ CHỌN (Q7, Đại 16/11/2026): rỗng hay chỉ khoảng trắng ⇒ thân KHÔNG có khoá `nhanXet`.
const ok = (body: { soSao: number; nhanXet?: string }) => ({ ok: true, body });
const bad = (errors: Record<string, string>) => ({ ok: false, errors });

describe('WDG-13 số sao (DGB-02)', () => {
  it('1, 3 và 5 (hai biên và giữa) nhận; thân chỉ có `soSao` khi không có nhận xét', () => {
    for (const soSao of [1, 3, 5]) {
      expect(checkRating(soSao, '')).toStrictEqual(ok({ soSao }));
    }
  });

  it('chưa chọn (null) ⇒ đúng MỘT lỗi SO_SAO_BAT_BUOC, không gọi API', () => {
    expect(checkRating(null, '')).toStrictEqual(
      bad({ soSao: 'SO_SAO_BAT_BUOC' }),
    );
    expect(checkRating(null, 'Tốt')).toStrictEqual(
      bad({ soSao: 'SO_SAO_BAT_BUOC' }),
    );
  });

  it.each([
    ['0 (dưới biên)', 0],
    ['6 (trên biên)', 6],
    ['−1', -1],
    ['3.5 (MySQL làm tròn thành 4 nên chỉ luật này chặn được)', 3.5],
    ['0.9', 0.9],
    ['Infinity', Infinity],
    ['NaN', NaN],
  ])('%s ⇒ SO_SAO_KHONG_HOP_LE', (_name, soSao) => {
    expect(checkRating(soSao, '')).toStrictEqual(
      bad({ soSao: 'SO_SAO_KHONG_HOP_LE' }),
    );
  });
});

describe('WDG-10 nhận xét: tuỳ chọn, tối đa 1.000 đơn vị UTF-16 SAU chuẩn hoá (DGB-03)', () => {
  it('rỗng, chỉ khoảng trắng, xuống dòng, tab ⇒ KHÔNG có khoá `nhanXet` (không gửi chuỗi rỗng)', () => {
    for (const comment of ['', '   ', '\n\n', ' \t \r\n ', '  ']) {
      const result = checkRating(4, comment);
      expect(result).toStrictEqual(ok({ soSao: 4 }));
      expect(Object.keys((result as { body: object }).body)).toEqual(['soSao']);
    }
  });

  it('1.000 đơn vị nhận, 1.001 ⇒ QUA_DAI (một ký tự ở biên)', () => {
    expect(checkRating(5, 'a'.repeat(1000))).toStrictEqual(
      ok({ soSao: 5, nhanXet: 'a'.repeat(1000) }),
    );
    expect(checkRating(5, 'a'.repeat(1001))).toStrictEqual(
      bad({ nhanXet: 'QUA_DAI' }),
    );
  });

  it('đếm bằng đơn vị UTF-16, KHÔNG bằng điểm mã: 500 emoji (1.000 đơn vị) nhận, 501 emoji (1.002 đơn vị, chỉ 501 điểm mã) ⇒ QUA_DAI', () => {
    expect(checkRating(5, '😀'.repeat(500)).ok).toBe(true);
    expect(checkRating(5, '😀'.repeat(501))).toStrictEqual(
      bad({ nhanXet: 'QUA_DAI' }),
    );
    // chữ có dấu dựng sẵn là MỘT đơn vị: 1.000 chữ `ế` nhận
    expect(checkRating(5, 'ế'.repeat(1000)).ok).toBe(true);
  });

  it('đếm SAU chuẩn hoá: 1.000 chữ kèm khoảng trắng hai đầu và điều khiển xen vào vẫn nhận; 1.001 chữ thật kèm điều khiển ⇒ QUA_DAI', () => {
    expect(
      checkRating(5, `  ${'a'.repeat(998)}\u0001\u0007aa\n `),
    ).toStrictEqual(ok({ soSao: 5, nhanXet: `${'a'.repeat(998)}aa` }));
    expect(checkRating(5, `${'a'.repeat(1000)}\u0001a`)).toStrictEqual(
      bad({ nhanXet: 'QUA_DAI' }),
    );
  });

  it('CRLF đếm là MỘT đơn vị: 998 chữ + CRLF + `b` = 1.000 nhận; 999 chữ + CRLF + `b` = 1.001 ⇒ QUA_DAI', () => {
    expect(checkRating(5, `${'a'.repeat(998)}\r\nb`).ok).toBe(true);
    expect(checkRating(5, `${'a'.repeat(999)}\r\nb`)).toStrictEqual(
      bad({ nhanXet: 'QUA_DAI' }),
    );
  });

  it('số sao sai VÀ nhận xét quá dài ⇒ cả hai lỗi, mỗi trường một mã', () => {
    expect(checkRating(null, 'a'.repeat(1001))).toStrictEqual(
      bad({ soSao: 'SO_SAO_BAT_BUOC', nhanXet: 'QUA_DAI' }),
    );
  });

  it('bộ đếm: số đơn vị SAU chuẩn hoá ("a\\r\\nb" là 3, hai đầu cắt, emoji là 2)', () => {
    expect(commentCount('a\r\nb')).toBe(3);
    expect(commentCount('  x  ')).toBe(1);
    expect(commentCount('😀')).toBe(2);
    expect(commentCount('')).toBe(0);
    expect(commentCount('   \n ')).toBe(0);
  });
});

describe('WDG-13 chuẩn hoá nhận xét gửi đi (DGB-12, PLAN 5.2)', () => {
  const sent = (comment: string): string | undefined => {
    const result = checkRating(5, comment);
    if (!result.ok) throw new Error('lẽ ra hợp lệ');
    return result.body.nhanXet;
  };

  it('bỏ ký tự điều khiển (C0, DEL, C1, NUL); GIỮ xuống dòng, tab và emoji', () => {
    expect(sent('a\u0001b\u0007c\u0000d\u007fe\u0085f')).toBe('abcdef');
    expect(sent('dòng 1\ndòng 2\tcột 😀')).toBe('dòng 1\ndòng 2\tcột 😀');
  });

  it('CRLF và CR ⇒ LF; trim hai đầu', () => {
    expect(sent('  một\r\nhai\rba  ')).toBe('một\nhai\nba');
  });

  it('surrogate lẻ ⇒ U+FFFD; cặp surrogate hợp lệ (emoji) giữ nguyên', () => {
    expect(sent('a\ud800b')).toBe('a�b');
    expect(sent('a😀b')).toBe('a😀b');
  });

  it('chữ có dấu NFC và NFD giữ NGUYÊN (không chuẩn hoá Unicode); nội dung KHÔNG bị escape', () => {
    expect(sent('Tốt'.normalize('NFD'))).toBe('Tốt'.normalize('NFD'));
    expect(sent('<b>"x" & \'y\'</b>')).toBe('<b>"x" & \'y\'</b>');
  });

  it('nội dung dạng bí mật KHÔNG bị chặn (B6 không ghi nhật ký; khác hộp ghi hồ sơ B2): "token=abc" đi như văn bản thường', () => {
    expect(sent('token=abc Bearer xyz')).toBe('token=abc Bearer xyz');
  });
});
