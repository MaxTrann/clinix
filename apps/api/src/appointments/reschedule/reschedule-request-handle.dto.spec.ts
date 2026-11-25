import { ValidationPipe } from '@nestjs/common';
import {
  AUDIT_RESCHEDULE_LIMITS,
  validateAuditEntry,
} from '../../audit/audit-validation.js';
import {
  requestApprovedEntry,
  requestRejectedEntry,
} from '../../audit/testing/reschedule-audit-entries.js';
import { AppException } from '../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import { CANCEL_REASON_MAX_LENGTH } from '../appointments.constants.js';
import {
  ApproveRescheduleRequestDto,
  RejectRescheduleRequestDto,
} from './reschedule-request-handle.dto.js';

// reschedule B9 — XDL-09 (ghi chú thiếu, sai kiểu, rỗng, toàn khoảng trắng, ký tự điều khiển, biên 1 và 255), XDL-41 (`khungGioId` và khoá lạ), XDL-42 (Unicode, chữ giống bí mật, cắt khoảng trắng), NDL-04 (phần dùng
// luật: mọi ghi chú mà DTO nhận đều qua `validateAuditEntry` thật) và NDL-27 (trần DTO ≤ trần Audit), qua ĐÚNG cấu hình ValidationPipe của `configureApp`. Không DB. Chuỗi "giống bí mật" chỉ là chữ NGẮN để chứng minh
// `redactText` che được; không có khoá hay token thật (gitleaks).
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  validationError: { target: false, value: false },
  exceptionFactory: validationExceptionFactory,
});

const parseApprove = (body: unknown) =>
  pipe.transform(body, {
    type: 'body',
    metatype: ApproveRescheduleRequestDto,
  }) as Promise<ApproveRescheduleRequestDto>;
const parseReject = (body: unknown) =>
  pipe.transform(body, {
    type: 'body',
    metatype: RejectRescheduleRequestDto,
  }) as Promise<RejectRescheduleRequestDto>;

async function errorsOf(parse: () => Promise<unknown>) {
  try {
    await parse();
  } catch (error) {
    if (!(error instanceof AppException)) throw error;
    expect(error.getStatus()).toBe(400);
    const response = error.getResponse() as {
      maLoi: string;
      loi: { truong: string; ma: string }[];
    };
    expect(response.maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
    return response.loi;
  }
  throw new Error('đầu vào lẽ ra phải bị từ chối');
}

const SLOT = '9007199254740993';
const NOTE = 'Đã xếp sang khung giờ chiều cùng bác sĩ';
const NOTE_REQUIRED = [{ truong: 'ghiChu', ma: 'LY_DO_BAT_BUOC' }];

// Hai thân dùng CHUNG một bộ kiểm `ghiChu`: mọi ca của ghi chú chạy cho cả hai
const BOTH = [
  ['duyệt', parseApprove],
  ['từ chối', parseReject],
] as const;

describe.each(BOTH)('XDL-09 ghiChu (%s) bắt buộc', (_name, parse) => {
  it('thân hợp lệ: ghi chú được cắt khoảng trắng hai đầu và giữ nguyên chữ ở giữa (kể cả xuống dòng)', async () => {
    expect((await parse({ ghiChu: `  ${NOTE}  ` })).ghiChu).toBe(NOTE);
    expect(
      (await parse({ ghiChu: 'Dòng một\nDòng hai\r\nDòng ba' })).ghiChu,
    ).toBe('Dòng một\nDòng hai\r\nDòng ba');
  });

  it.each([
    ['thiếu hẳn khoá', undefined],
    ['null', null],
    ['số JSON', 12],
    ['mảng', [NOTE]],
    ['đối tượng', { text: NOTE }],
    ['chuỗi rỗng', ''],
    ['chỉ dấu cách', '   '],
    ['chỉ tab và xuống dòng', '\t\n\r'],
    // `String.trim()` cắt cả U+00A0 (khoảng trắng không ngắt); tạo bằng mã ký tự để khỏi lệ thuộc cách soạn thảo
    ['chỉ khoảng trắng không ngắt U+00A0', String.fromCharCode(0xa0).repeat(2)],
  ])('ghiChu %s ⇒ 400 LY_DO_BAT_BUOC (không 500)', async (_case, value) => {
    const payload = value === undefined ? {} : { ghiChu: value as unknown };
    expect(await errorsOf(() => parse(payload))).toEqual(NOTE_REQUIRED);
  });

  it.each([
    ['ký tự NUL', 'Đã xếp\u0000lịch'],
    ['tab ở giữa', 'Đã xếp\tlịch'],
    ['ký tự thoát U+001B', 'Đã xếp\u001Blịch'],
    ['DEL U+007F', 'Đã xếp\u007Flịch'],
    ['ký tự điều khiển C1 U+0085', 'Đã xếp\u0085lịch'],
    ['chỉ NUL (không bị cắt vì không phải khoảng trắng)', '\u0000'],
  ])(
    'ghiChu có %s ⇒ 400 LY_DO_BAT_BUOC (bộ kiểm cục bộ; @RequiredReason không chặn)',
    async (_case, value) => {
      expect(await errorsOf(() => parse({ ghiChu: value }))).toEqual(
        NOTE_REQUIRED,
      );
    },
  );

  it('biên độ dài: 1 và đúng 255 đơn vị UTF-16 vừa; 256 bị từ chối; độ dài tính SAU khi cắt khoảng trắng', async () => {
    expect((await parse({ ghiChu: 'x' })).ghiChu).toBe('x');
    expect((await parse({ ghiChu: 'a'.repeat(255) })).ghiChu).toHaveLength(255);
    expect(await errorsOf(() => parse({ ghiChu: 'a'.repeat(256) }))).toEqual(
      NOTE_REQUIRED,
    );
    expect(
      (await parse({ ghiChu: ` ${'a'.repeat(255)} ` })).ghiChu,
    ).toHaveLength(255);
    expect(
      await errorsOf(() => parse({ ghiChu: `${'a'.repeat(255)} b` })),
    ).toEqual(NOTE_REQUIRED);
  });
});

describe('XDL-41 DTO duyệt: khungGioId và khoá lạ', () => {
  it('khungGioId VẮNG hợp lệ (duyệt vào khung giờ mong muốn); có thì giữ NGUYÊN id lớn hơn 2^53', async () => {
    const without = await parseApprove({ ghiChu: NOTE });
    expect(without.khungGioId).toBeUndefined();
    expect('khungGioId' in without && without.khungGioId !== undefined).toBe(
      false,
    );
    expect(
      (await parseApprove({ ghiChu: NOTE, khungGioId: SLOT })).khungGioId,
    ).toBe(SLOT);
    expect(
      (await parseApprove({ ghiChu: NOTE, khungGioId: '9223372036854775807' }))
        .khungGioId,
    ).toBe('9223372036854775807');
  });

  it.each([
    ['số JSON', 12],
    ['số JSON lớn hơn 2^53', 2 ** 53 + 2],
    ['số 0', '0'],
    ['số 0 đứng đầu', '012'],
    ['chuỗi rỗng', ''],
    ['có khoảng trắng', ' 12'],
    ['số âm', '-5'],
    ['số thập phân', '1.5'],
    ['vượt BIGINT', '9223372036854775808'],
    ['null (KHÁC vắng: không được coi là vắng)', null],
    ['mảng', ['12']],
  ])('khungGioId %s ⇒ 400 IS_BIGINT_ID', async (_case, value) => {
    expect(
      await errorsOf(() =>
        parseApprove({ ghiChu: NOTE, khungGioId: value as unknown }),
      ),
    ).toEqual([{ truong: 'khungGioId', ma: 'IS_BIGINT_ID' }]);
  });

  it.each([
    'chiNhanhId',
    'yeuCauId',
    'trangThai',
    'lyDoYeuCau',
    'benhNhanId',
    'accountId',
    'nguoiXuLyId',
  ])(
    'khoá lạ %s ở thân duyệt và từ chối ⇒ 400 TRUONG_KHONG_DUOC_PHEP (chi nhánh và yêu cầu chỉ từ máy chủ và đường dẫn)',
    async (key) => {
      const expected = [{ truong: key, ma: 'TRUONG_KHONG_DUOC_PHEP' }];
      expect(
        await errorsOf(() => parseApprove({ ghiChu: NOTE, [key]: '1' })),
      ).toEqual(expected);
      expect(
        await errorsOf(() => parseReject({ ghiChu: NOTE, [key]: '1' })),
      ).toEqual(expected);
    },
  );

  it('thân TỪ CHỐI không có khungGioId: gửi nó là khoá lạ (không có khung giờ nào để chọn)', async () => {
    expect(
      await errorsOf(() => parseReject({ ghiChu: NOTE, khungGioId: SLOT })),
    ).toEqual([{ truong: 'khungGioId', ma: 'TRUONG_KHONG_DUOC_PHEP' }]);
  });
});

describe.each(BOTH)(
  'XDL-42 ghiChu Unicode và chữ giống bí mật (%s)',
  (_name, parse) => {
    it('độ dài tính bằng ĐƠN VỊ UTF-16 như luật Audit: 127 emoji (254 đơn vị) vừa, 128 emoji (256 đơn vị) bị từ chối; cặp thay thế ở biên 255', async () => {
      expect((await parse({ ghiChu: '😀'.repeat(127) })).ghiChu).toHaveLength(
        254,
      );
      expect(await errorsOf(() => parse({ ghiChu: '😀'.repeat(128) }))).toEqual(
        NOTE_REQUIRED,
      );
      // 253 chữ + một cặp thay thế = 255 đơn vị (vừa); 254 chữ + cặp = 256 (quá)
      expect(
        (await parse({ ghiChu: `${'a'.repeat(253)}😀` })).ghiChu,
      ).toHaveLength(255);
      expect(
        await errorsOf(() => parse({ ghiChu: `${'a'.repeat(254)}😀` })),
      ).toEqual(NOTE_REQUIRED);
      expect((await parse({ ghiChu: 'ệ'.repeat(255) })).ghiChu).toHaveLength(
        255,
      );
    });

    it.each([
      'password=abc12345',
      'token: abc123',
      'Bearer abc.def.ghi',
      'f'.repeat(64),
      'otp=123456',
    ])(
      'chữ giống bí mật %# ⇒ 400 LY_DO_BAT_BUOC (nếu lọt, AuditService ném AUDIT_SENSITIVE_DATA và việc xử lý bị hoàn tác ra 500)',
      async (text) => {
        expect(await errorsOf(() => parse({ ghiChu: text }))).toEqual(
          NOTE_REQUIRED,
        );
      },
    );

    it('chữ thường dùng (hai chấm, dấu bằng, số điện thoại) KHÔNG bị chặn nhầm; HTML và dấu nháy lưu NGUYÊN (thư thoát HTML ở B3)', async () => {
      for (const text of [
        'Bệnh nhân báo: đổi sang chiều, gọi lại 0901234567',
        'Giờ cũ = 08:00; giờ mới = 14:00',
        `<script>alert('x')</script> & "trích dẫn"`,
        'Gia đình 👨‍👩‍👧 báo bận',
      ])
        expect((await parse({ ghiChu: text })).ghiChu).toBe(text);
    });
  },
);

describe('NDL-04 phần dùng luật: DTO không bao giờ nới hơn luật Audit thật', () => {
  // Mọi ghi chú mà DTO nhận phải qua `validateAuditEntry` (cả duyệt và từ chối); mọi ghi chú mà Audit từ chối thì DTO phải từ chối trước
  const accepted = [
    'x',
    'a'.repeat(255),
    '😀'.repeat(127),
    `${'a'.repeat(253)}😀`,
    'Dòng một\nDòng hai',
    `<b>"x" & 'y'</b>`,
    'Bệnh nhân báo: đổi sang chiều',
    ' trước và sau ',
  ];
  it.each(accepted)(
    'ghi chú %# lọt DTO ⇒ Audit nhận (duyệt và từ chối), không AUDIT_ENTRY_INVALID hay AUDIT_SENSITIVE_DATA',
    async (note) => {
      const parsed = (await parseApprove({ ghiChu: note })).ghiChu;
      const approved = requestApprovedEntry();
      const rejected = requestRejectedEntry();
      expect(() =>
        validateAuditEntry({
          ...approved,
          changes: { ...approved.changes, ghi_chu: parsed },
        }),
      ).not.toThrow();
      expect(() =>
        validateAuditEntry({
          ...rejected,
          changes: { ...rejected.changes, ghi_chu: parsed },
        }),
      ).not.toThrow();
    },
  );

  it.each([
    ['256 đơn vị', 'a'.repeat(256)],
    ['128 emoji', '😀'.repeat(128)],
    ['chỉ U+00A0', String.fromCharCode(0xa0).repeat(2)],
    ['giống bí mật', 'password=abc12345'],
  ])(
    'ghi chú %s: Audit ném, DTO CŨNG từ chối trước (không có khe hở giữa hai luật)',
    async (_case, note) => {
      const approved = requestApprovedEntry();
      expect(() =>
        validateAuditEntry({
          ...approved,
          changes: { ...approved.changes, ghi_chu: note },
        }),
      ).toThrow();
      expect(await errorsOf(() => parseApprove({ ghiChu: note }))).toEqual(
        NOTE_REQUIRED,
      );
    },
  );
});

describe('NDL-27 trần DTO ≤ trần Audit', () => {
  it('CANCEL_REASON_MAX_LENGTH (trần của @RequiredReason) không vượt AUDIT_RESCHEDULE_LIMITS.textMax; cận dưới không thấp hơn cận dưới Audit', () => {
    expect(CANCEL_REASON_MAX_LENGTH).toBeLessThanOrEqual(
      AUDIT_RESCHEDULE_LIMITS.textMax,
    );
    expect(AUDIT_RESCHEDULE_LIMITS.textMin).toBeGreaterThanOrEqual(1);
  });
});
