import { AuditError } from '../../../audit/audit-error.js';
import {
  AUDIT_EXAM_LIMITS,
  validateAuditEntry,
} from '../../../audit/audit-validation.js';
import { editRecordEntry } from '../../../audit/testing/exam-audit-entries.js';
import { redactText } from '../../../common/logging/sanitize.js';
import {
  EXAM_FIELD_ERROR_CODES,
  EXAM_TEXT_MAX_LENGTH,
  FOLLOW_UP_MAX_DAYS,
} from '../examination.constants.js';
import { validateRecordInput } from './exam-record.input.js';
import {
  checkFollowUpDate,
  isCalendarDate,
  normalizeText,
} from './exam-record.rules.js';

// doctor-exam B2 — hàm THUẦN của hồ sơ khám (không DB, không đồng hồ): chuẩn hoá, kiểm dữ liệu vào, ngày tái khám (PLAN 5.2; Q2; HSK-05…HSK-08, HSK-16, HSK-23). So sánh và nhật ký: exam-record.diff.spec.ts.
// Phần MySQL thật (khứ hồi UTF-8, lưu, nhật ký): exam-record.int-spec.ts.
const OK = {
  trieuChung: 'Ho khan, sốt nhẹ hai ngày',
  chanDoanSoBo: 'Viêm họng cấp',
  huongXuLy: 'Uống đủ nước, nghỉ ngơi',
};
const TEXT_FIELDS = ['trieuChung', 'chanDoanSoBo', 'huongXuLy'] as const;

function errorsOf(body: Parameters<typeof validateRecordInput>[0]) {
  const result = validateRecordInput(body);
  if (result.ok) throw new Error('lẽ ra phải bị từ chối');
  return result.errors;
}

describe('HSK-16 chuẩn hoá một trường chữ (normalizeText)', () => {
  it('CRLF và CR đơn ⇒ LF; LF và TAB được giữ; xuống dòng giữa chữ giữ nguyên', () => {
    expect(normalizeText('a\r\nb\rc\nd\te')).toBe('a\nb\nc\nd\te');
  });

  it('bỏ ký tự điều khiển trừ LF và TAB (C0, DEL, C1, NUL), không bỏ chữ có dấu', () => {
    expect(normalizeText('a\u0000b\u0001c\u0007d\u007Fe\u0085f\u009Fg')).toBe(
      'abcdefg',
    );
    expect(normalizeText('Nguyễn Văn Á')).toBe('Nguyễn Văn Á');
  });

  it('trim hai đầu (kể cả xuống dòng và khoảng trắng Unicode), không đụng khoảng trắng giữa chữ', () => {
    expect(normalizeText('  \n\t a  b \r\n ')).toBe('a  b');
  });

  it('surrogate LẺ (cao hoặc thấp) ⇒ U+FFFD; cặp hợp lệ (emoji) giữ nguyên; thay có chủ ý, khớp MySQL (X1 M10)', () => {
    expect(normalizeText('a\uD800b')).toBe('a�b');
    expect(normalizeText('a\uDC00b')).toBe('a�b');
    expect(normalizeText('😀\uD83D')).toBe('😀�');
    expect(normalizeText('\uDE00😀')).toBe('�😀');
    expect(normalizeText('a😀b')).toBe('a😀b');
    expect(normalizeText('\uD800\uD800')).toBe('��');
  });

  it('chuẩn hoá xong không còn ký tự khiến JSON hay MySQL từ chối: không surrogate lẻ nào còn lại', () => {
    const dirty = 'x\uD800y\uDC00z\u0001\r\n😀';
    // `\p{Cs}` với cờ `u` chỉ khớp surrogate lẻ (`isWellFormed` là ES2024, ngoài `lib` của dự án)
    expect(/\p{Cs}/u.test(normalizeText(dirty))).toBe(false);
  });

  it('chuỗi chỉ gồm ký tự điều khiển hoặc khoảng trắng ⇒ rỗng', () => {
    expect(normalizeText('\u0001\u0002 \n\t ')).toBe('');
  });
});

describe('HSK-05 thiếu và rỗng ⇒ BAT_BUOC, đủ từng trường', () => {
  it('hợp lệ ⇒ giá trị đã chuẩn hoá (trim, LF), ngày vắng ⇒ null', () => {
    const result = validateRecordInput({
      trieuChung: '  Ho khan\r\nsốt ',
      chanDoanSoBo: 'Viêm họng',
      huongXuLy: 'Nghỉ ngơi\t',
    });
    expect(result).toEqual({
      ok: true,
      value: {
        trieuChung: 'Ho khan\nsốt',
        chanDoanSoBo: 'Viêm họng',
        huongXuLy: 'Nghỉ ngơi',
        ngayTaiKhamDuKien: null,
      },
    });
  });

  it.each(TEXT_FIELDS)(
    'thiếu riêng %s (vắng, null, rỗng, chỉ khoảng trắng, chỉ xuống dòng, chỉ ký tự điều khiển, số, mảng) ⇒ đúng MỘT lỗi BAT_BUOC của trường đó',
    (field) => {
      for (const bad of [
        undefined,
        null,
        '',
        '   ',
        '\r\n\n',
        '\u0001\u0002',
        7,
        ['a'],
        {},
      ])
        expect(errorsOf({ ...OK, [field]: bad })).toEqual([
          { truong: field, ma: EXAM_FIELD_ERROR_CODES.REQUIRED },
        ]);
    },
  );

  it('thiếu cả ba ⇒ ba lỗi theo thứ tự trieuChung, chanDoanSoBo, huongXuLy; lỗi chỉ có tên trường và mã (không giá trị)', () => {
    const errors = errorsOf({ ngayTaiKhamDuKien: '2026-12-01' });
    expect(errors).toEqual([
      { truong: 'trieuChung', ma: 'BAT_BUOC' },
      { truong: 'chanDoanSoBo', ma: 'BAT_BUOC' },
      { truong: 'huongXuLy', ma: 'BAT_BUOC' },
    ]);
    for (const error of errors)
      expect(Object.keys(error).sort()).toEqual(['ma', 'truong']);
  });
});

describe('HSK-08 độ dài: 1 đến 2.000 đơn vị UTF-16, đếm SAU chuẩn hoá; trần ≤ trần của audit', () => {
  it('trần của B2 không vượt trần của audit (nếu hai số lệch thì `record` ném AUDIT_ENTRY_INVALID ngay trong giao dịch)', () => {
    expect(EXAM_TEXT_MAX_LENGTH).toBe(2000);
    expect(EXAM_TEXT_MAX_LENGTH).toBeLessThanOrEqual(
      AUDIT_EXAM_LIMITS.examTextMax,
    );
  });

  it.each(TEXT_FIELDS)('%s: 2.000 đúng biên được, 2.001 ⇒ QUA_DAI', (field) => {
    expect(validateRecordInput({ ...OK, [field]: 'a'.repeat(2000) }).ok).toBe(
      true,
    );
    expect(errorsOf({ ...OK, [field]: 'a'.repeat(2001) })).toEqual([
      { truong: field, ma: EXAM_FIELD_ERROR_CODES.TOO_LONG },
    ]);
  });

  it('chữ có dấu dựng sẵn đếm 1, emoji đếm 2: 1.000 emoji = 2.000 đơn vị được, 1.001 emoji ⇒ QUA_DAI; 1.500 emoji (dưới 2.000 ĐIỂM MÃ nhưng 3.000 đơn vị) ⇒ QUA_DAI', () => {
    expect(validateRecordInput({ ...OK, huongXuLy: 'ế'.repeat(2000) }).ok).toBe(
      true,
    );
    expect(
      validateRecordInput({ ...OK, huongXuLy: '😀'.repeat(1000) }).ok,
    ).toBe(true);
    for (const count of [1001, 1500])
      expect(errorsOf({ ...OK, huongXuLy: '😀'.repeat(count) })).toEqual([
        { truong: 'huongXuLy', ma: 'QUA_DAI' },
      ]);
  });

  it('đếm SAU chuẩn hoá và trim: khoảng trắng hai đầu không tính; CRLF tính là MỘT ký tự (LF): 666 dòng "a⏎" (1.332 ký tự sau chuẩn hoá) được, 1.001 dòng (2.001) ⇒ QUA_DAI', () => {
    expect(
      validateRecordInput({ ...OK, trieuChung: ` ${'a'.repeat(2000)} \n` }).ok,
    ).toBe(true);
    expect(
      validateRecordInput({ ...OK, trieuChung: 'a\r\n'.repeat(666) }).ok,
    ).toBe(true);
    expect(errorsOf({ ...OK, trieuChung: 'a\r\n'.repeat(1001) })).toEqual([
      { truong: 'trieuChung', ma: 'QUA_DAI' },
    ]);
  });
});

describe('HSK-06 ngày tái khám tuỳ chọn; HSK-07 phải là ngày có thật', () => {
  it('vắng, null, rỗng, chỉ khoảng trắng ⇒ null (xoá ngày cũ khi sửa)', () => {
    for (const ngay of [undefined, null, '', '  '])
      expect(
        validateRecordInput({ ...OK, ngayTaiKhamDuKien: ngay }),
      ).toMatchObject({
        ok: true,
        value: { ngayTaiKhamDuKien: null },
      });
  });

  it('ngày đúng được giữ (đã trim)', () => {
    expect(
      validateRecordInput({ ...OK, ngayTaiKhamDuKien: ' 2026-12-15 ' }),
    ).toMatchObject({
      ok: true,
      value: { ngayTaiKhamDuKien: '2026-12-15' },
    });
  });

  it('isCalendarDate: ngày có thật (năm nhuận 29/2) được; ngày không có thật hay sai dạng bị loại', () => {
    for (const ok of ['2026-11-10', '2028-02-29', '2026-12-31', '2026-01-01'])
      expect(isCalendarDate(ok)).toBe(true);
    for (const bad of [
      '2026-02-30',
      '2026-02-29',
      '2026-13-01',
      '2026-00-10',
      '2026-11-00',
      '2026-11-31',
      '2026-1-1',
      '26-01-01',
      '2026/11/10',
      '2026-11-10T00:00:00Z',
      '',
      'hôm nay',
    ])
      expect(isCalendarDate(bad)).toBe(false);
  });

  it('sai dạng, không có thật, không phải chuỗi ⇒ đúng MỘT lỗi NGAY_KHONG_HOP_LE của ngayTaiKhamDuKien', () => {
    for (const bad of [
      '2026-02-30',
      '10/11/2026',
      'mai',
      20261110,
      ['2026-11-10'],
      {},
      true,
    ])
      expect(errorsOf({ ...OK, ngayTaiKhamDuKien: bad })).toEqual([
        {
          truong: 'ngayTaiKhamDuKien',
          ma: EXAM_FIELD_ERROR_CODES.INVALID_DATE,
        },
      ]);
  });

  it('gom lỗi nhiều trường cùng lúc: thiếu trường chữ VÀ ngày sai ⇒ cả hai báo', () => {
    expect(
      errorsOf({ ...OK, huongXuLy: '', ngayTaiKhamDuKien: 'sai' }),
    ).toEqual([
      { truong: 'huongXuLy', ma: 'BAT_BUOC' },
      { truong: 'ngayTaiKhamDuKien', ma: 'NGAY_KHONG_HOP_LE' },
    ]);
  });

  it('checkFollowUpDate: null luôn được; trong [ngày khám, +365]: đúng hai biên được, một ngày ngoài biên bị loại', () => {
    expect(FOLLOW_UP_MAX_DAYS).toBe(365);
    expect(checkFollowUpDate(null, '2026-11-10')).toBe(true);
    expect(checkFollowUpDate('2026-11-10', '2026-11-10')).toBe(true);
    expect(checkFollowUpDate('2026-11-09', '2026-11-10')).toBe(false);
    expect(checkFollowUpDate('2027-11-10', '2026-11-10')).toBe(true);
    expect(checkFollowUpDate('2027-11-11', '2026-11-10')).toBe(false);
    // năm nhuận: 29/02/2028 + 365 ngày = 28/02/2029
    expect(checkFollowUpDate('2029-02-28', '2028-02-29')).toBe(true);
    expect(checkFollowUpDate('2029-03-01', '2028-02-29')).toBe(false);
  });
});

// Mẫu nội dung: mỗi chuỗi nằm ĐÚNG MỘT bên. "Bị che" là các chuỗi mà `redactText` đổi (đã chạy thật ở 15/11/2026); "giữ nguyên" là câu y khoa thường.
const MASKED = [
  'Cookie: bánh quy dị ứng',
  'otp: 3 lần/ngày',
  'Bệnh nhân khai: token=abc123',
  'Kết quả có hash = 5',
  'password: không nhớ',
  'secret = không',
  'Authorization: Bearer abc.def',
  'Bearer abc123xyz',
  'a'.repeat(64),
  'eyJabcdefgh.ijklmnopq.rstuv',
];
const PLAIN = [
  'Ho khan, sốt nhẹ hai ngày',
  'Uống thuốc 3 lần/ngày, tái khám sau 7 ngày',
  'Huyết áp 120/80, mạch 78. Pass: không có',
  'Nghi viêm họng; hẹn 2026-12-10',
  'a'.repeat(63),
  'Dị ứng penicillin',
];

describe('HSK-23 nội dung dạng bí mật ⇒ NOI_DUNG_KHONG_HOP_LE (chặn TRƯỚC giao dịch, mọi trường chữ)', () => {
  it.each(TEXT_FIELDS)(
    '%s: mọi mẫu bị che ⇒ đúng một lỗi NOI_DUNG_KHONG_HOP_LE của trường đó; lỗi không mang giá trị',
    (field) => {
      for (const sample of MASKED) {
        const errors = errorsOf({ ...OK, [field]: sample });
        expect(errors, sample).toEqual([
          { truong: field, ma: EXAM_FIELD_ERROR_CODES.CONTENT_REJECTED },
        ]);
        expect(JSON.stringify(errors)).not.toContain(sample.slice(0, 12));
      }
    },
  );

  it('ca âm: câu y khoa thường và "Pass: không có" KHÔNG bị chặn', () => {
    for (const sample of PLAIN)
      expect(validateRecordInput({ ...OK, huongXuLy: sample }).ok, sample).toBe(
        true,
      );
  });

  it('kiểm SAU chuẩn hoá (dấu hiệu bị che dù có CRLF, khoảng trắng hay ký tự điều khiển chen), và QUA_DAI được báo trước NOI_DUNG', () => {
    expect(errorsOf({ ...OK, trieuChung: '  \r\notp: 1\u0001' })).toEqual([
      { truong: 'trieuChung', ma: 'NOI_DUNG_KHONG_HOP_LE' },
    ]);
    expect(errorsOf({ ...OK, trieuChung: `otp: ${'1'.repeat(2100)}` })).toEqual(
      [{ truong: 'trieuChung', ma: 'QUA_DAI' }],
    );
  });

  it('KHỚP ĐÚNG audit/: rules chặn một chuỗi ⇔ `redactText` đổi nó ⇔ `validateAuditEntry` ném AUDIT_SENSITIVE_DATA (audit đổi quy tắc thì ca này đỏ)', () => {
    const auditThrows = (sample: string): string | null => {
      try {
        validateAuditEntry(
          editRecordEntry({
            changes: {
              truoc: { trieu_chung: 'x' },
              sau: { trieu_chung: sample },
            },
          }),
        );
        return null;
      } catch (error) {
        return error instanceof AuditError ? error.code : 'KHAC';
      }
    };
    for (const sample of [...MASKED, ...PLAIN]) {
      const rulesRejects = !validateRecordInput({ ...OK, trieuChung: sample })
        .ok;
      expect(rulesRejects, sample).toBe(redactText(sample) !== sample);
      expect(auditThrows(sample), sample).toBe(
        rulesRejects ? 'AUDIT_SENSITIVE_DATA' : null,
      );
    }
  });
});
