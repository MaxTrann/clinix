import { AppException } from '../../common/errors/app.exception.js';
import { parseSuggestionQuery } from './suggestion-query.parser.js';
import type { SuggestionQueryDto } from './suggestion.dto.js';

// chatbot B4 — GOI-05 (kiểm `ngay` và `ca`), GOI-10 (thiếu `chuyenKhoaId`, id sai, `ca` lạ) ở mức hàm thuần, và ca bổ sung B4-05…B4-08.
// `today` ghim 2026-11-18 (thứ Tư): cửa sổ hợp lệ là 2026-11-18 đến 2026-11-24.
const TODAY = '2026-11-18';

const query = (over: Partial<SuggestionQueryDto> = {}): SuggestionQueryDto =>
  Object.assign({ chuyenKhoaId: '5' }, over);

function failureOf(run: () => unknown) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    const exception = error as AppException;
    return {
      status: exception.getStatus(),
      maLoi: exception.maLoi,
      body: exception.getResponse() as {
        thongBao: string;
        loi?: { truong: string; ma: string }[];
      },
    };
  }
  throw new Error('đáng lẽ phải ném AppException');
}

const rejected = (over: Partial<SuggestionQueryDto>, today = TODAY) =>
  failureOf(() => parseSuggestionQuery(query(over), today));

describe('GOI-10 chuyenKhoaId bắt buộc và đúng dạng id BIGINT', () => {
  it('chỉ có chuyenKhoaId ⇒ các trường còn lại là null', () => {
    expect(parseSuggestionQuery(query(), TODAY)).toEqual({
      chuyenKhoaId: '5',
      chiNhanhId: null,
      ngay: null,
      ca: null,
    });
  });

  it('thiếu chuyenKhoaId ⇒ 400 BO_LOC_KHONG_HOP_LE, loi ghi đúng trường', () => {
    const out = failureOf(() =>
      parseSuggestionQuery({} as SuggestionQueryDto, TODAY),
    );
    expect(out.status).toBe(400);
    expect(out.maLoi).toBe('BO_LOC_KHONG_HOP_LE');
    expect(out.body.loi).toEqual([
      { truong: 'chuyenKhoaId', ma: 'ID_LOC_KHONG_HOP_LE' },
    ]);
  });

  it.each([
    '',
    '0',
    '-1',
    '01',
    '1.5',
    '1e3',
    'abc',
    ' 5',
    '9223372036854775808', // vượt BIGINT một đơn vị
    '99999999999999999999',
  ])('chuyenKhoaId %j sai dạng ⇒ 400 BO_LOC_KHONG_HOP_LE', (chuyenKhoaId) => {
    const out = rejected({ chuyenKhoaId });
    expect(out.maLoi).toBe('BO_LOC_KHONG_HOP_LE');
    expect(out.body.loi).toEqual([
      { truong: 'chuyenKhoaId', ma: 'ID_LOC_KHONG_HOP_LE' },
    ]);
  });

  it('id lớn nhất của BIGINT hợp lệ và giữ nguyên là CHUỖI', () => {
    const out = parseSuggestionQuery(
      query({
        chuyenKhoaId: '9223372036854775807',
        chiNhanhId: '9223372036854775807',
      }),
      TODAY,
    );
    expect(out.chuyenKhoaId).toBe('9223372036854775807');
    expect(out.chiNhanhId).toBe('9223372036854775807');
  });

  it('chiNhanhId sai dạng ⇒ 400, loi ghi trường chiNhanhId', () => {
    const out = rejected({ chiNhanhId: 'x' });
    expect(out.body.loi).toEqual([
      { truong: 'chiNhanhId', ma: 'ID_LOC_KHONG_HOP_LE' },
    ]);
  });

  it('GOI-10 ca lạ ⇒ 400, loi ghi trường ca với mã CA_KHONG_HOP_LE; kể cả chữ thường, chuỗi rỗng, tên ca cũ', () => {
    for (const ca of ['CaKhuya', 'casang', 'Sang', 'CaSang ', '', 'CaNgay']) {
      const out = rejected({ ca });
      expect(out.maLoi).toBe('BO_LOC_KHONG_HOP_LE');
      expect(out.body.loi).toEqual([{ truong: 'ca', ma: 'CA_KHONG_HOP_LE' }]);
    }
  });

  it('ba ca hợp lệ: CaSang, CaChieu, CaToi', () => {
    for (const ca of ['CaSang', 'CaChieu', 'CaToi'] as const) {
      expect(parseSuggestionQuery(query({ ca }), TODAY).ca).toBe(ca);
    }
  });
});

describe('GOI-05 ngày trong cửa sổ hôm nay đến hôm nay + 6 (giờ Việt Nam)', () => {
  it('biên: hôm nay và hôm nay + 6 hợp lệ', () => {
    expect(
      parseSuggestionQuery(query({ ngay: '2026-11-18' }), TODAY).ngay,
    ).toBe('2026-11-18');
    expect(
      parseSuggestionQuery(query({ ngay: '2026-11-24' }), TODAY).ngay,
    ).toBe('2026-11-24');
  });

  it('hôm qua ⇒ NGAY_NGOAI_KHOANG; hôm nay + 7 ⇒ NGAY_NGOAI_KHOANG', () => {
    for (const ngay of ['2026-11-17', '2026-11-25']) {
      const out = rejected({ ngay });
      expect(out.status).toBe(400);
      expect(out.maLoi).toBe('BO_LOC_KHONG_HOP_LE');
      expect(out.body.loi).toEqual([
        { truong: 'ngay', ma: 'NGAY_NGOAI_KHOANG' },
      ]);
    }
  });

  it('qua tháng và qua năm: hôm nay 2026-12-29 thì đến 2027-01-04 hợp lệ, 2027-01-05 ngoài khoảng', () => {
    expect(
      parseSuggestionQuery(query({ ngay: '2027-01-04' }), '2026-12-29').ngay,
    ).toBe('2027-01-04');
    expect(rejected({ ngay: '2027-01-05' }, '2026-12-29').body.loi).toEqual([
      { truong: 'ngay', ma: 'NGAY_NGOAI_KHOANG' },
    ]);
  });

  it.each([
    '2026-02-30',
    '2026-13-01',
    '19/11/2026',
    '2026-11-19T07:00:00',
    '2026-1-19',
    '',
    'hôm nay',
  ])(
    'ngay %j sai dạng hay không phải ngày có thật ⇒ NGAY_KHONG_HOP_LE',
    (ngay) => {
      const out = rejected({ ngay });
      expect(out.maLoi).toBe('BO_LOC_KHONG_HOP_LE');
      expect(out.body.loi).toEqual([
        { truong: 'ngay', ma: 'NGAY_KHONG_HOP_LE' },
      ]);
    },
  );

  it('B4-05 ngày 29/02: năm nhuận 2028 là ngày thật, năm 2027 thì không', () => {
    expect(
      parseSuggestionQuery(query({ ngay: '2028-02-29' }), '2028-02-27').ngay,
    ).toBe('2028-02-29');
    expect(rejected({ ngay: '2027-02-29' }, '2027-02-27').body.loi).toEqual([
      { truong: 'ngay', ma: 'NGAY_KHONG_HOP_LE' },
    ]);
  });
});

describe('B4-06 báo hết mọi lỗi một lượt', () => {
  it('chuyenKhoaId, chiNhanhId, ngay, ca cùng sai ⇒ bốn phần tử loi, đúng thứ tự trường', () => {
    const out = rejected({
      chuyenKhoaId: 'x',
      chiNhanhId: '0',
      ngay: '2026-11-17',
      ca: 'Khuya',
    });
    expect(out.status).toBe(400);
    expect(out.body.loi).toEqual([
      { truong: 'chuyenKhoaId', ma: 'ID_LOC_KHONG_HOP_LE' },
      { truong: 'chiNhanhId', ma: 'ID_LOC_KHONG_HOP_LE' },
      { truong: 'ngay', ma: 'NGAY_NGOAI_KHOANG' },
      { truong: 'ca', ma: 'CA_KHONG_HOP_LE' },
    ]);
  });

  it('B4-07 chuyenKhoaId sai và chiNhanhId đúng ⇒ chỉ báo chuyenKhoaId', () => {
    expect(rejected({ chuyenKhoaId: '0', chiNhanhId: '3' }).body.loi).toEqual([
      { truong: 'chuyenKhoaId', ma: 'ID_LOC_KHONG_HOP_LE' },
    ]);
  });

  it('B4-08 thông báo lỗi không chép lại giá trị người dùng gửi', () => {
    const out = rejected({ chuyenKhoaId: 'GIA-TRI-LA-12345' });
    expect(JSON.stringify(out.body)).not.toContain('GIA-TRI-LA-12345');
  });
});

describe('B4-09 đầy đủ hợp lệ', () => {
  it('cả bốn trường đúng ⇒ trả đúng giá trị đã kiểm', () => {
    expect(
      parseSuggestionQuery(
        query({ chiNhanhId: '2', ngay: '2026-11-20', ca: 'CaChieu' }),
        TODAY,
      ),
    ).toEqual({
      chuyenKhoaId: '5',
      chiNhanhId: '2',
      ngay: '2026-11-20',
      ca: 'CaChieu',
    });
  });
});
