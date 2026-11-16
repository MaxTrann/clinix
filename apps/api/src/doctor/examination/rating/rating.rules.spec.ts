import {
  canRate,
  validateRatingInput,
  type RatingValidation,
} from './rating.rules.js';

// doctor-exam B6 — quy tắc đánh giá, HÀM THUẦN, không DB (PLAN 5.2, 5.7; Q7; DGB-02, DGB-03, DGB-12). Giá trị mong đợi viết tay, không lấy lại từ hằng của mã đang kiểm.
// Ghi nhớ khi đọc `3.5`: MySQL làm tròn thành 4 và qua CHECK của DB, nên CHỈ hàm này chặn được (kế hoạch 20, điều đọc 5).
const ok = (value: { soSao: number; nhanXet: string | null }) => ({
  ok: true,
  value,
});
const fail = (...errors: { truong: string; ma: string }[]) => ({
  ok: false,
  errors,
});
const run = (body: { soSao?: unknown; nhanXet?: string | null }) =>
  validateRatingInput(body);

describe('DGB-02 số sao', () => {
  it('1 và 5 (hai biên) và 3 nhận nguyên; 5.0 của JSON cũng là số nguyên 5', () => {
    for (const soSao of [1, 3, 5, 5.0])
      expect(run({ soSao })).toEqual(ok({ soSao, nhanXet: null }));
  });

  it('vắng hoặc null ⇒ đúng MỘT lỗi SO_SAO_BAT_BUOC (chưa chọn)', () => {
    expect(run({})).toEqual(fail({ truong: 'soSao', ma: 'SO_SAO_BAT_BUOC' }));
    expect(run({ soSao: null })).toEqual(
      fail({ truong: 'soSao', ma: 'SO_SAO_BAT_BUOC' }),
    );
    expect(run({ soSao: undefined, nhanXet: 'Tốt' })).toEqual(
      fail({ truong: 'soSao', ma: 'SO_SAO_BAT_BUOC' }),
    );
  });

  it.each([
    ['0 (dưới biên)', 0],
    ['6 (trên biên)', 6],
    ['−1', -1],
    ['−0', -0],
    ['3.5 (MySQL làm tròn thành 4 nên DB không bắt)', 3.5],
    ['0.9', 0.9],
    ['5.4', 5.4],
    ['Infinity', Infinity],
    ['NaN', NaN],
    ['chuỗi "3"', '3'],
    ['chuỗi rỗng', ''],
    ['boolean true', true],
    ['mảng [4]', [4]],
    ['đối tượng', { a: 1 }],
  ])('%s ⇒ SO_SAO_KHONG_HOP_LE', (_name, soSao) => {
    expect(run({ soSao })).toEqual(
      fail({ truong: 'soSao', ma: 'SO_SAO_KHONG_HOP_LE' }),
    );
  });
});

describe('DGB-03 nhận xét: tuỳ chọn, rỗng ⇒ null, tối đa 1.000 đơn vị UTF-16', () => {
  it('vắng, null, chuỗi rỗng ⇒ null', () => {
    for (const nhanXet of [undefined, null, ''])
      expect(run({ soSao: 4, nhanXet })).toEqual(
        ok({ soSao: 4, nhanXet: null }),
      );
  });

  it('chỉ khoảng trắng, xuống dòng, tab ⇒ null (lưu NULL, không lưu chuỗi rỗng)', () => {
    for (const nhanXet of ['   ', '\n\n', ' \t \r\n ', '  '])
      expect(run({ soSao: 4, nhanXet })).toEqual(
        ok({ soSao: 4, nhanXet: null }),
      );
  });

  it('1.000 đơn vị nhận, 1.001 ⇒ QUA_DAI (một ký tự ở biên)', () => {
    expect(run({ soSao: 5, nhanXet: 'a'.repeat(1000) })).toEqual(
      ok({ soSao: 5, nhanXet: 'a'.repeat(1000) }),
    );
    expect(run({ soSao: 5, nhanXet: 'a'.repeat(1001) })).toEqual(
      fail({ truong: 'nhanXet', ma: 'QUA_DAI' }),
    );
  });

  it('đếm bằng đơn vị UTF-16, KHÔNG bằng điểm mã: 500 emoji (1.000 đơn vị) nhận, 501 emoji (1.002 đơn vị, chỉ 501 điểm mã) ⇒ QUA_DAI', () => {
    expect(run({ soSao: 5, nhanXet: '😀'.repeat(500) }).ok).toBe(true);
    expect(run({ soSao: 5, nhanXet: '😀'.repeat(501) })).toEqual(
      fail({ truong: 'nhanXet', ma: 'QUA_DAI' }),
    );
    // chữ có dấu dựng sẵn là MỘT đơn vị: 1.000 chữ `ế` nhận
    expect(run({ soSao: 5, nhanXet: 'ế'.repeat(1000) }).ok).toBe(true);
  });

  it('đếm SAU chuẩn hoá: 1.000 chữ kèm khoảng trắng hai đầu và ký tự điều khiển xen vào vẫn nhận; 1.001 chữ thật kèm điều khiển ⇒ QUA_DAI', () => {
    expect(
      run({ soSao: 5, nhanXet: `  ${'a'.repeat(998)}\u0001\u0007aa\n ` }),
    ).toEqual(ok({ soSao: 5, nhanXet: `${'a'.repeat(998)}aa` }));
    expect(run({ soSao: 5, nhanXet: `${'a'.repeat(1000)}\u0001a` })).toEqual(
      fail({ truong: 'nhanXet', ma: 'QUA_DAI' }),
    );
  });

  it('CRLF đếm là MỘT đơn vị sau chuẩn hoá: 998 chữ + CRLF + `b` = 1.000 ⇒ nhận; thêm một chữ ⇒ 1.001 ⇒ QUA_DAI (nếu đếm CRLF là hai thì ca đầu đã vượt)', () => {
    expect(run({ soSao: 5, nhanXet: `${'a'.repeat(998)}\r\nb` }).ok).toBe(true);
    expect(run({ soSao: 5, nhanXet: `${'a'.repeat(999)}\r\nb` })).toEqual(
      fail({ truong: 'nhanXet', ma: 'QUA_DAI' }),
    );
  });
});

describe('DGB-12 chuẩn hoá nhận xét (PLAN 5.2)', () => {
  const comment = (nhanXet: string) => {
    const result: RatingValidation = run({ soSao: 5, nhanXet });
    if (!result.ok) throw new Error('lẽ ra hợp lệ');
    return result.value.nhanXet;
  };

  it('bỏ ký tự điều khiển (C0, DEL, C1, NUL); GIỮ xuống dòng, tab và emoji', () => {
    expect(comment('a\u0001b\u0007c\u0000d\u007fe\u0085f')).toBe('abcdef');
    expect(comment('dòng 1\ndòng 2\tcột 😀')).toBe('dòng 1\ndòng 2\tcột 😀');
  });

  it('CRLF và CR ⇒ LF; trim hai đầu', () => {
    expect(comment('  một\r\nhai\rba  ')).toBe('một\nhai\nba');
  });

  it('surrogate lẻ ⇒ U+FFFD (khớp cách MySQL text đổi); cặp surrogate hợp lệ (emoji) giữ nguyên', () => {
    expect(comment('a\ud800b')).toBe('a�b');
    expect(comment('a😀b')).toBe('a😀b');
  });

  it('chữ có dấu NFC và NFD giữ NGUYÊN (không chuẩn hoá Unicode); nội dung không bị escape', () => {
    expect(comment('Tốt'.normalize('NFD'))).toBe('Tốt'.normalize('NFD'));
    expect(comment('<b>"x" & \'y\'</b>')).toBe('<b>"x" & \'y\'</b>');
  });

  it('nội dung dạng bí mật KHÔNG bị chặn (B6 không ghi nhật ký; khác B2): "token=abc" lưu như văn bản thường', () => {
    expect(comment('token=abc Bearer xyz')).toBe('token=abc Bearer xyz');
  });
});

describe('gom lỗi và không lộ giá trị', () => {
  it('số sao sai VÀ nhận xét quá dài ⇒ hai lỗi, theo thứ tự soSao rồi nhanXet', () => {
    expect(run({ soSao: 9, nhanXet: 'a'.repeat(1001) })).toEqual(
      fail(
        { truong: 'soSao', ma: 'SO_SAO_KHONG_HOP_LE' },
        { truong: 'nhanXet', ma: 'QUA_DAI' },
      ),
    );
  });

  it('lỗi chỉ có tên trường và mã: chuỗi dấu hiệu đặt trong giá trị không xuất hiện', () => {
    const mark = 'DGBRULELEAK';
    const bad = run({ soSao: mark, nhanXet: mark.repeat(200) });
    expect(bad.ok).toBe(false);
    expect(JSON.stringify(bad)).not.toContain(mark);
  });
});

describe('Q7 chỉ lịch HoanThanh được đánh giá', () => {
  it('HoanThanh ⇒ được; sáu trạng thái còn lại và giá trị lạ ⇒ không', () => {
    expect(canRate('HoanThanh')).toBe(true);
    for (const state of [
      'ChoThanhToan',
      'DaXacNhan',
      'DaTiepDon',
      'DaHuy',
      'VangMat',
      'DaDoiLich',
      '',
      'hoanthanh',
    ])
      expect(canRate(state), state).toBe(false);
  });
});
