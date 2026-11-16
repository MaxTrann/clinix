import { describe, expect, it } from 'vitest';
import {
  EXAM_TEXT_MAX,
  FOLLOW_UP_MAX_DAYS,
  followUpRange,
  normalizeText,
  reconcile,
  sameContent,
  textLength,
  toBody,
  validateRecord,
  valuesOf,
  visitDate,
  type ExamRecordNote,
  type RecordValues,
} from './exam-record-form';

// doctor-exam F3, hàm THUẦN của hộp ghi hồ sơ: WHS-14 [đề xuất] (chuẩn hoá và đếm khớp máy chủ), WHS-07 (độ dài và khoảng ngày), WHS-16 [đề xuất] phần `reconcile`, WHS-04 phần dựng thân.
// Vector của WHS-14 CHÉP NGUYÊN GIÁ TRỊ từ `apps/api/src/doctor/examination/exam-record/exam-record.rules.spec.ts` (HSK-05, HSK-08, HSK-16): `features/` không import mã api nên hai bản TS giữ khớp
// nhau bằng cùng bộ ví dụ; đổi quy tắc ở bên nào thì phải đổi vector ở cả hai (người sửa chép lại và ghi vào TRACKING).
const OK: RecordValues = {
  trieuChung: 'Ho khan, sốt nhẹ hai ngày',
  chanDoanSoBo: 'Viêm họng cấp',
  huongXuLy: 'Uống đủ nước, nghỉ ngơi',
  ngayTaiKhamDuKien: '',
};
const TEXT_FIELDS = ['trieuChung', 'chanDoanSoBo', 'huongXuLy'] as const;
const NOTE: ExamRecordNote = {
  trieuChung: 'Ho khan, sốt nhẹ hai ngày',
  chanDoanSoBo: 'Viêm họng cấp',
  huongXuLy: 'Uống đủ nước, nghỉ ngơi',
  ngayTaiKhamDuKien: '2026-07-10',
  capNhatLanCuoi: '2026-06-10T10:30:00.000Z',
};

describe('doctor-exam F3 — WHS-14 chuẩn hoá một trường chữ (khớp normalizeText của api)', () => {
  it('WHS-14 CRLF và CR đơn ⇒ LF; LF và TAB được giữ; xuống dòng giữa chữ giữ nguyên', () => {
    expect(normalizeText('a\r\nb\rc\nd\te')).toBe('a\nb\nc\nd\te');
  });

  it('WHS-14 bỏ ký tự điều khiển trừ LF và TAB (C0, DEL, C1, NUL), không bỏ chữ có dấu', () => {
    expect(normalizeText('a\u0000b\u0001c\u0007d\u007Fe\u0085f\u009Fg')).toBe(
      'abcdefg',
    );
    expect(normalizeText('Nguyễn Văn Á')).toBe('Nguyễn Văn Á');
  });

  it('WHS-14 trim hai đầu (kể cả xuống dòng và khoảng trắng Unicode), không đụng khoảng trắng giữa chữ', () => {
    expect(normalizeText('  \n\t a  b \r\n ')).toBe('a  b');
  });

  it('WHS-14 surrogate LẺ (cao hoặc thấp) ⇒ U+FFFD; cặp hợp lệ (emoji) giữ nguyên', () => {
    expect(normalizeText('a\uD800b')).toBe('a�b');
    expect(normalizeText('a\uDC00b')).toBe('a�b');
    expect(normalizeText('😀\uD83D')).toBe('😀�');
    expect(normalizeText('\uDE00😀')).toBe('�😀');
    expect(normalizeText('a😀b')).toBe('a😀b');
    expect(normalizeText('\uD800\uD800')).toBe('��');
  });

  it('WHS-14 chuẩn hoá xong không còn surrogate lẻ nào', () => {
    const dirty = 'x\uD800y\uDC00z\u0001\r\n😀';
    expect(/\p{Cs}/u.test(normalizeText(dirty))).toBe(false);
  });

  it('WHS-14 chuỗi chỉ gồm ký tự điều khiển hoặc khoảng trắng ⇒ rỗng', () => {
    expect(normalizeText('\u0001\u0002 \n\t ')).toBe('');
  });
});

describe('doctor-exam F3 — WHS-07 độ dài 1 đến 2.000 đơn vị UTF-16, đếm SAU chuẩn hoá', () => {
  it('WHS-07 hằng: trần 2.000 và 365 ngày (MỘT nơi định nghĩa)', () => {
    expect(EXAM_TEXT_MAX).toBe(2000);
    expect(FOLLOW_UP_MAX_DAYS).toBe(365);
  });

  it.each(TEXT_FIELDS)(
    'WHS-07 %s: 2.000 đúng biên được, 2.001 ⇒ QUA_DAI',
    (field) => {
      expect(
        validateRecord({ ...OK, [field]: 'a'.repeat(2000) }, null),
      ).toEqual({});
      expect(
        validateRecord({ ...OK, [field]: 'a'.repeat(2001) }, null),
      ).toEqual({
        [field]: 'QUA_DAI',
      });
    },
  );

  it('WHS-07 chữ có dấu dựng sẵn đếm 1, emoji đếm 2: 1.000 emoji được, 1.001 và 1.500 emoji ⇒ QUA_DAI', () => {
    expect(
      validateRecord({ ...OK, huongXuLy: 'ế'.repeat(2000) }, null),
    ).toEqual({});
    expect(
      validateRecord({ ...OK, huongXuLy: '😀'.repeat(1000) }, null),
    ).toEqual({});
    for (const count of [1001, 1500])
      expect(
        validateRecord({ ...OK, huongXuLy: '😀'.repeat(count) }, null),
      ).toEqual({ huongXuLy: 'QUA_DAI' });
  });

  it('WHS-07 đếm SAU chuẩn hoá và trim: khoảng trắng hai đầu không tính; CRLF tính là MỘT ký tự', () => {
    expect(
      validateRecord({ ...OK, trieuChung: ` ${'a'.repeat(2000)} \n` }, null),
    ).toEqual({});
    expect(
      validateRecord({ ...OK, trieuChung: 'a\r\n'.repeat(666) }, null),
    ).toEqual({});
    expect(
      validateRecord({ ...OK, trieuChung: 'a\r\n'.repeat(1001) }, null),
    ).toEqual({ trieuChung: 'QUA_DAI' });
  });

  it('WHS-07 textLength là độ dài sau chuẩn hoá (bộ đếm của hộp dùng đúng số này)', () => {
    expect(textLength('  a\r\nb  ')).toBe(3);
    expect(textLength('😀')).toBe(2);
    expect(textLength('\u0001')).toBe(0);
  });

  it.each(TEXT_FIELDS)(
    'WHS-02 %s: rỗng, chỉ khoảng trắng, chỉ xuống dòng, chỉ ký tự điều khiển ⇒ BAT_BUOC của đúng trường đó',
    (field) => {
      for (const bad of ['', '   ', '\r\n\n', '\u0001\u0002'])
        expect(validateRecord({ ...OK, [field]: bad }, null)).toEqual({
          [field]: 'BAT_BUOC',
        });
    },
  );

  it('WHS-02 thiếu cả ba ⇒ ba lỗi; hợp lệ ⇒ không lỗi', () => {
    expect(
      validateRecord(
        {
          trieuChung: '',
          chanDoanSoBo: ' ',
          huongXuLy: '\n',
          ngayTaiKhamDuKien: '',
        },
        null,
      ),
    ).toEqual({
      trieuChung: 'BAT_BUOC',
      chanDoanSoBo: 'BAT_BUOC',
      huongXuLy: 'BAT_BUOC',
    });
    expect(validateRecord(OK, null)).toEqual({});
  });
});

describe('doctor-exam F3 — WHS-07 ngày tái khám: từ ngày khám đến +365 ngày', () => {
  it('WHS-07 visitDate: giờ Việt Nam cố định +07:00 (16:59Z còn trong ngày, 17:00Z sang ngày kế, qua năm)', () => {
    expect(visitDate('2026-06-09T17:30:00.000Z')).toBe('2026-06-10');
    expect(visitDate('2026-06-10T16:59:59.000Z')).toBe('2026-06-10');
    expect(visitDate('2026-06-10T17:00:00.000Z')).toBe('2026-06-11');
    expect(visitDate('2026-12-31T17:00:00.000Z')).toBe('2027-01-01');
  });

  it('WHS-07 visitDate: không phải ISO 8601 ⇒ null (không in "NaN", không đoán)', () => {
    for (const bad of ['', 'xyz', '10/06/2026 17:30', '2026-06-10'])
      expect(visitDate(bad)).toBeNull();
  });

  it('WHS-07 followUpRange: [ngày khám, +365 ngày]; qua năm nhuận 2028 vẫn đúng 365 ngày', () => {
    expect(followUpRange('2026-06-10')).toEqual({
      min: '2026-06-10',
      max: '2027-06-10',
    });
    expect(followUpRange('2027-03-01')).toEqual({
      min: '2027-03-01',
      max: '2028-02-29',
    });
    expect(followUpRange('2028-02-29')).toEqual({
      min: '2028-02-29',
      max: '2029-02-28',
    });
    expect(followUpRange(null)).toBeNull();
  });

  it('WHS-07 hai biên của khoảng được; trước ngày khám và +366 ngày ⇒ NGAY_NGOAI_KHOANG (mã riêng của máy: câu "phải từ ngày khám đến 365 ngày sau")', () => {
    const check = (ngay: string) =>
      validateRecord({ ...OK, ngayTaiKhamDuKien: ngay }, '2026-06-10');
    expect(check('2026-06-10')).toEqual({});
    expect(check('2027-06-10')).toEqual({});
    expect(check('2026-06-09')).toEqual({
      ngayTaiKhamDuKien: 'NGAY_NGOAI_KHOANG',
    });
    expect(check('2027-06-11')).toEqual({
      ngayTaiKhamDuKien: 'NGAY_NGOAI_KHOANG',
    });
  });

  it('WHS-07 ngày không có thật hoặc sai dạng ⇒ NGAY_KHONG_HOP_LE (kể cả khi không biết ngày khám)', () => {
    for (const bad of [
      '2026-02-30',
      '2026-02-29',
      '2026-13-01',
      '2026-11-31',
      '2026-1-1',
      '2026/11/10',
      '2026-11-10T00:00:00Z',
      'hôm nay',
    ]) {
      expect(validateRecord({ ...OK, ngayTaiKhamDuKien: bad }, null)).toEqual({
        ngayTaiKhamDuKien: 'NGAY_KHONG_HOP_LE',
      });
      expect(
        validateRecord({ ...OK, ngayTaiKhamDuKien: bad }, '2026-06-10'),
      ).toEqual({ ngayTaiKhamDuKien: 'NGAY_KHONG_HOP_LE' });
    }
  });

  it('WHS-07 ngày để trống hoặc chỉ khoảng trắng là hợp lệ (tuỳ chọn); không biết ngày khám thì chỉ kiểm ngày có thật', () => {
    expect(
      validateRecord({ ...OK, ngayTaiKhamDuKien: '' }, '2026-06-10'),
    ).toEqual({});
    expect(
      validateRecord({ ...OK, ngayTaiKhamDuKien: '  ' }, '2026-06-10'),
    ).toEqual({});
    expect(
      validateRecord({ ...OK, ngayTaiKhamDuKien: '2030-01-01' }, null),
    ).toEqual({});
  });
});

describe('doctor-exam F3 — WHS-04 thân PUT và so sánh nội dung', () => {
  it('WHS-04 toBody: đúng năm khoá; chữ đã chuẩn hoá; ngày rỗng ⇒ null; token đi NGUYÊN VĂN', () => {
    const body = toBody(
      {
        trieuChung: '  Ho\r\nkhan ',
        chanDoanSoBo: 'Viêm họng\u0001',
        huongXuLy: '\tNghỉ ngơi',
        ngayTaiKhamDuKien: ' ',
      },
      '2026-06-10T10:30:00.000Z',
    );
    expect(body).toEqual({
      trieuChung: 'Ho\nkhan',
      chanDoanSoBo: 'Viêm họng',
      huongXuLy: 'Nghỉ ngơi',
      ngayTaiKhamDuKien: null,
      capNhatLanCuoi: '2026-06-10T10:30:00.000Z',
    });
    expect(Object.keys(body).sort()).toEqual([
      'capNhatLanCuoi',
      'chanDoanSoBo',
      'huongXuLy',
      'ngayTaiKhamDuKien',
      'trieuChung',
    ]);
  });

  it('WHS-04 toBody: chưa có hồ sơ ⇒ token null; có ngày ⇒ giữ ngày đã cắt khoảng trắng', () => {
    expect(
      toBody({ ...OK, ngayTaiKhamDuKien: ' 2026-07-10 ' }, null),
    ).toMatchObject({ ngayTaiKhamDuKien: '2026-07-10', capNhatLanCuoi: null });
  });

  it('WHS-04 valuesOf: ghi chú máy chủ ⇒ giá trị form (ngày null ⇒ chuỗi rỗng); chữ giữ nguyên', () => {
    expect(valuesOf(NOTE)).toEqual({
      trieuChung: NOTE.trieuChung,
      chanDoanSoBo: NOTE.chanDoanSoBo,
      huongXuLy: NOTE.huongXuLy,
      ngayTaiKhamDuKien: '2026-07-10',
    });
    expect(
      valuesOf({ ...NOTE, ngayTaiKhamDuKien: null }).ngayTaiKhamDuKien,
    ).toBe('');
  });

  it('WHS-16 sameContent: so `===` từng trường sau chuẩn hoá (khác hoa/thường hay dấu là KHÁC, như máy chủ); ngày rỗng và rỗng là như nhau', () => {
    expect(
      sameContent(OK, { ...OK, trieuChung: ' Ho khan, sốt nhẹ hai ngày\r\n' }),
    ).toBe(true);
    expect(sameContent(OK, { ...OK, chanDoanSoBo: 'viêm họng cấp' })).toBe(
      false,
    );
    expect(sameContent(OK, { ...OK, chanDoanSoBo: 'Viem họng cấp' })).toBe(
      false,
    );
    expect(sameContent(OK, { ...OK, ngayTaiKhamDuKien: '2026-07-10' })).toBe(
      false,
    );
    expect(sameContent(OK, { ...OK, ngayTaiKhamDuKien: '  ' })).toBe(true);
  });
});

describe('doctor-exam F3 — WHS-09, WHS-16 reconcile: so bản mới tải về với nội dung đang gõ', () => {
  const TOKEN = '2026-06-10T10:00:00.000Z';
  const typed = valuesOf(NOTE);

  it('WHS-09 bản mới TRÙNG nội dung đang gõ (lần gửi trước đã lưu) ⇒ saved, dù token đã đổi', () => {
    expect(reconcile(typed, TOKEN, NOTE)).toBe('saved');
    expect(
      reconcile(
        { ...typed, trieuChung: ` ${typed.trieuChung}\r\n` },
        TOKEN,
        NOTE,
      ),
    ).toBe('saved');
  });

  it('WHS-05 bản mới KHÁC nội dung và token đã đổi (nơi khác vừa sửa) ⇒ changed', () => {
    expect(
      reconcile({ ...typed, huongXuLy: 'Nội dung khác của tôi' }, TOKEN, NOTE),
    ).toBe('changed');
  });

  it('WHS-09 token giữ nguyên mà nội dung khác (lần gửi trước CHƯA lưu) ⇒ unsaved', () => {
    expect(
      reconcile(
        { ...typed, huongXuLy: 'Nội dung khác của tôi' },
        NOTE.capNhatLanCuoi,
        NOTE,
      ),
    ).toBe('unsaved');
  });

  it('WHS-09 chưa có hồ sơ nào (null) ⇒ unsaved, kể cả token null', () => {
    expect(reconcile(typed, null, null)).toBe('unsaved');
  });
});
