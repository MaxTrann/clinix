import { AuditError } from '../../../audit/audit-error.js';
import { validateAuditEntry } from '../../../audit/audit-validation.js';
import { hideRatingEntry } from '../../../audit/testing/exam-audit-entries.js';
import { redactText } from '../../../common/logging/sanitize.js';
import {
  HIDE_REASON_MAX_LENGTH,
  HIDE_REASON_MIN_LENGTH,
} from '../examination.constants.js';
import { validateHideReason } from './rating-hide.rules.js';

// doctor-exam B8 — validateHideReason, HÀM THUẦN, không DB (PLAN 5.8, 5.14; Q8; KDD-05, KDD-06, KDD-25 `[đề xuất]`; BDK-04). Mọi lỗi chỉ có tên trường và mã, KHÔNG có giá trị người dùng gửi.
const REQUIRED = { truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' };
const TOO_SHORT = { truong: 'lyDo', ma: 'LY_DO_QUA_NGAN' };
const TOO_LONG = { truong: 'lyDo', ma: 'LY_DO_QUA_DAI' };
const REJECTED = { truong: 'lyDo', ma: 'NOI_DUNG_KHONG_HOP_LE' };
const VALID = 'Nội dung quảng cáo, không liên quan đến buổi khám';

/** Lý do đúng `n` đơn vị UTF-16 (chữ `x`: KHÔNG dùng chữ số hex, vì 64 ký tự hex liền nhau là dạng bí mật mà `redactText` che) */
const reasonOf = (n: number) => 'x'.repeat(n);

function errorsOf(raw: unknown) {
  const result = validateHideReason(raw);
  if (result.ok)
    throw new Error(`lẽ ra phải bị từ chối: ${JSON.stringify(raw)}`);
  return result.errors;
}
const valueOf = (raw: unknown): string => {
  const result = validateHideReason(raw);
  if (!result.ok)
    throw new Error(`lẽ ra hợp lệ: ${JSON.stringify(result.errors)}`);
  return result.value;
};

describe('KDD-05 lý do thiếu hoặc trống ⇒ LY_DO_BAT_BUOC', () => {
  it.each([
    ['vắng (undefined)', undefined],
    ['null', null],
    ['chuỗi rỗng', ''],
    ['chỉ khoảng trắng', '   \t  '],
    ['chỉ xuống dòng', '\r\n \n'],
    [
      'chỉ ký tự điều khiển (bị chuẩn hoá thành rỗng)',
      '\u0000\u0001\u0007\u007f',
    ],
    ['không phải chuỗi (DTO đã chặn; rules vẫn không ném)', 12345],
    ['mảng', ['một lý do đủ dài']],
    ['đối tượng', { lyDo: 'một lý do đủ dài' }],
  ])('%s ⇒ đúng một lỗi, không mang giá trị', (_name, raw) => {
    expect(errorsOf(raw)).toEqual([REQUIRED]);
  });
});

describe('KDD-06 biên độ dài: đếm SAU chuẩn hoá, theo đơn vị UTF-16', () => {
  it('đúng hằng của schema và của audit: tối thiểu 10, tối đa 255', () => {
    expect(HIDE_REASON_MIN_LENGTH).toBe(10);
    expect(HIDE_REASON_MAX_LENGTH).toBe(255);
  });

  it.each([
    [9, [TOO_SHORT]],
    [10, null],
    [11, null],
    [254, null],
    [255, null],
    [256, [TOO_LONG]],
    [2000, [TOO_LONG]],
  ])('%i đơn vị ⇒ %j', (n, expected) => {
    const result = validateHideReason(reasonOf(n));
    if (expected === null) {
      expect(result).toEqual({ ok: true, value: reasonOf(n) });
    } else {
      expect(result).toEqual({ ok: false, errors: expected });
    }
  });

  it('khoảng trắng đầu và cuối KHÔNG được tính: 9 chữ + 5 khoảng trắng ⇒ NGAN; 10 chữ + khoảng trắng ⇒ hợp lệ và đã trim; 255 chữ + khoảng trắng ⇒ hợp lệ', () => {
    expect(errorsOf(`  ${reasonOf(9)}   `)).toEqual([TOO_SHORT]);
    expect(valueOf(`  ${reasonOf(10)}   `)).toBe(reasonOf(10));
    expect(valueOf(` ${reasonOf(255)} \n`)).toBe(reasonOf(255));
    expect(errorsOf(` ${reasonOf(256)} `)).toEqual([TOO_LONG]);
  });

  it('emoji là CẶP THAY THẾ (2 đơn vị): 127 emoji + 1 chữ = 255 được; 128 emoji = 256 ⇒ DAI; 5 emoji = 10 được; 4 emoji + 1 chữ = 9 ⇒ NGAN', () => {
    expect(valueOf(`${'😀'.repeat(127)}a`)).toHaveLength(255);
    expect(errorsOf('😀'.repeat(128))).toEqual([TOO_LONG]);
    expect(valueOf('😀'.repeat(5))).toHaveLength(10);
    expect(errorsOf(`${'😀'.repeat(4)}a`)).toEqual([TOO_SHORT]);
  });

  it('ký tự điều khiển bị bỏ TRƯỚC khi đếm: 256 đơn vị trong đó có một ký tự điều khiển ⇒ còn 255 nên được; 10 đơn vị trong đó có một ký tự điều khiển ⇒ còn 9 ⇒ NGAN', () => {
    expect(valueOf(`${reasonOf(255)}\u0001`)).toBe(reasonOf(255));
    expect(errorsOf(`${reasonOf(9)}\u0001`)).toEqual([TOO_SHORT]);
  });

  it('thứ tự mã: rỗng ⇒ BAT_BUOC (không phải NGAN); ngắn ⇒ NGAN; dài ⇒ DAI; mỗi trường tối đa MỘT lỗi', () => {
    expect(errorsOf('')).toEqual([REQUIRED]);
    expect(errorsOf('a')).toEqual([TOO_SHORT]);
    expect(errorsOf(reasonOf(300))).toEqual([TOO_LONG]);
  });
});

describe('KDD-04, KDD-05 chuẩn hoá lý do (cùng `normalizeText` với hồ sơ khám và nhận xét)', () => {
  it('trim hai đầu; CRLF và CR ⇒ LF; giữ xuống dòng và TAB ở giữa; giữ emoji và chữ có dấu', () => {
    expect(valueOf(`  ${VALID}  `)).toBe(VALID);
    expect(valueOf('Dòng một\r\nDòng hai\rDòng ba\tcột')).toBe(
      'Dòng một\nDòng hai\nDòng ba\tcột',
    );
    expect(valueOf('Quảng cáo 😀 không liên quan')).toBe(
      'Quảng cáo 😀 không liên quan',
    );
  });

  it('ký tự điều khiển (trừ LF, TAB) bị bỏ; surrogate lẻ ⇒ U+FFFD (MySQL utf8mb4 từ chối surrogate lẻ)', () => {
    expect(valueOf('Quảng\u0000 cáo\u0007 spam\u007f')).toBe('Quảng cáo spam');
    expect(valueOf('Quảng cáo \ud83d lẻ')).toBe('Quảng cáo � lẻ');
    expect(valueOf('Quảng cáo \ude00 lẻ')).toBe('Quảng cáo � lẻ');
  });

  it('không đổi nội dung người dùng ngoài các việc trên (không gộp khoảng trắng giữa, không đổi hoa thường)', () => {
    expect(valueOf('Nội  dung   QUẢNG cáo')).toBe('Nội  dung   QUẢNG cáo');
  });
});

// Mẫu nội dung: mỗi chuỗi nằm ĐÚNG MỘT bên (đều ≥ 10 đơn vị để không dính NGAN). "Bị che" là các chuỗi mà `redactText` đổi (nếp HSK-23 của B2); "giữ nguyên" là câu bình thường của Admin.
const MASKED = [
  'Cookie: bánh quy dị ứng',
  'otp: 3 lần/ngày xin ẩn',
  'Bệnh nhân khai: token=abc123',
  'Kết quả có hash = 5 nhé',
  'password: không nhớ gì',
  'secret = không có gì',
  'Authorization: Bearer abc.def',
  'Bearer abc123xyz',
  'a'.repeat(64),
  'eyJabcdefgh.ijklmnopq.rstuv',
];
const PLAIN = [
  VALID,
  'Lăng mạ bác sĩ trong phần nhận xét',
  'Chứa liên kết quảng cáo bên ngoài',
  'Pass: không có gì để nói thêm',
  'a'.repeat(63),
  'Nhận xét không đúng sự thật về buổi khám',
];

describe('KDD-25 lý do dạng bí mật ⇒ NOI_DUNG_KHONG_HOP_LE (chặn TRƯỚC giao dịch: nếu không, AuditService ném AUDIT_SENSITIVE_DATA và người dùng nhận 500)', () => {
  it('mọi mẫu bị che ⇒ đúng một lỗi NOI_DUNG_KHONG_HOP_LE của lyDo; lỗi KHÔNG mang giá trị', () => {
    for (const sample of MASKED) {
      const errors = errorsOf(sample);
      expect(errors, sample).toEqual([REJECTED]);
      expect(JSON.stringify(errors)).not.toContain(sample.slice(0, 12));
    }
  });

  it('ca âm: lý do thường (kể cả "Pass: …") KHÔNG bị chặn', () => {
    for (const sample of PLAIN) expect(valueOf(sample), sample).toBe(sample);
  });

  it('kiểm SAU chuẩn hoá (CRLF, khoảng trắng, ký tự điều khiển chen vẫn bị bắt); DAI được báo trước NOI_DUNG; NGAN được báo trước NOI_DUNG', () => {
    expect(errorsOf('  \r\notp: 1 lần/ngày\u0001')).toEqual([REJECTED]);
    expect(errorsOf(`otp: ${'1'.repeat(300)}`)).toEqual([TOO_LONG]);
    expect(errorsOf('otp: 1')).toEqual([TOO_SHORT]);
  });

  it('KHỚP ĐÚNG audit/: rules chặn một chuỗi ⇔ `redactText` đổi nó ⇔ `validateAuditEntry` ném AUDIT_SENSITIVE_DATA (audit đổi quy tắc thì ca này đỏ)', () => {
    const auditThrows = (sample: string): string | null => {
      try {
        validateAuditEntry(
          hideRatingEntry({
            changes: {
              truoc: { bi_an: false },
              sau: { bi_an: true },
              ly_do: sample,
              bac_si_id: '5',
            },
          }),
        );
        return null;
      } catch (error) {
        return error instanceof AuditError ? error.code : 'KHAC';
      }
    };
    for (const sample of [...MASKED, ...PLAIN]) {
      const rulesReject = !validateHideReason(sample).ok;
      expect(rulesReject, sample).toBe(redactText(sample) !== sample);
      expect(auditThrows(sample), sample).toBe(
        rulesReject ? 'AUDIT_SENSITIVE_DATA' : null,
      );
    }
  });

  it('mọi lý do HỢP LỆ của rules đều qua validateAuditEntry (biên 10 và 255, emoji, xuống dòng): audit không bao giờ từ chối thứ rules đã nhận', () => {
    for (const sample of [
      reasonOf(10),
      reasonOf(255),
      `${'😀'.repeat(127)}a`,
      'Dòng một\nDòng hai đủ dài',
      VALID,
    ]) {
      const value = valueOf(sample);
      expect(() =>
        validateAuditEntry(
          hideRatingEntry({
            changes: {
              truoc: { bi_an: false },
              sau: { bi_an: true },
              ly_do: value,
              bac_si_id: '5',
            },
          }),
        ),
      ).not.toThrow();
    }
  });
});
