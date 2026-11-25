import { ValidationPipe } from '@nestjs/common';
import { AUDIT_RESCHEDULE_LIMITS } from '../../audit/audit-validation.js';
import { AppException } from '../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import { CANCEL_REASON_MAX_LENGTH } from '../appointments.constants.js';
import { ReschedulePreviewQueryDto } from './patient-reschedule.dto.js';
import { ReceptionRescheduleDto } from './reception-reschedule.dto.js';

// Task reschedule B7 — DLO-07 (thân thiếu hay sai `lyDo`, khoá lạ), DLO-11 (biên `lyDo`: 1, 255, 256, Unicode, chữ giống bí mật), DLO-12 (trần DTO ≤ trần Audit), DLO-20 (chi nhánh chỉ từ máy chủ: khoá lạ ở thân và query
// là 400) qua ĐÚNG cấu hình ValidationPipe của `configureApp`. Không DB. Mã DLO-11, DLO-12, DLO-20 là `[đề xuất]` (TRACKING reschedule 1.11). Chuỗi "giống bí mật" ở đây chỉ là chữ NGẮN để chứng minh `redactText` che
// được; không có khoá hay token thật (gitleaks).
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  validationError: { target: false, value: false },
  exceptionFactory: validationExceptionFactory,
});

const parseBody = (body: unknown) =>
  pipe.transform(body, {
    type: 'body',
    metatype: ReceptionRescheduleDto,
  }) as Promise<ReceptionRescheduleDto>;
const parseQuery = (query: unknown) =>
  pipe.transform(query, {
    type: 'query',
    metatype: ReschedulePreviewQueryDto,
  }) as Promise<ReschedulePreviewQueryDto>;

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
const REASON = 'Bệnh nhân gọi điện xin dời sang buổi chiều vì trùng lịch làm';
const REASON_REQUIRED = [{ truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' }];
const body = (lyDo: unknown) => ({ khungGioId: SLOT, lyDo });

describe('DLO-07 ReceptionRescheduleDto: lyDo bắt buộc', () => {
  it('thân hợp lệ: giữ NGUYÊN id lớn hơn 2^53; lyDo được cắt khoảng trắng hai đầu', async () => {
    const parsed = await parseBody(body(`  ${REASON}  `));
    expect(parsed.khungGioId).toBe(SLOT);
    expect(parsed.lyDo).toBe(REASON);
  });

  it.each([
    ['thiếu hẳn khoá', undefined],
    ['null', null],
    ['số JSON', 12],
    ['mảng', [REASON]],
    ['đối tượng', { text: REASON }],
    ['chuỗi rỗng', ''],
    ['chỉ dấu cách', '   '],
    ['chỉ tab và xuống dòng', '\t\n\r'],
    ['chỉ khoảng trắng không ngắt U+00A0', ' '],
  ])('lyDo %s ⇒ 400 LY_DO_BAT_BUOC (không 500)', async (_name, value) => {
    const payload =
      value === undefined ? { khungGioId: SLOT } : body(value as unknown);
    expect(await errorsOf(() => parseBody(payload))).toEqual(REASON_REQUIRED);
  });

  it.each([
    ['lyDoYeuCau (của Bệnh nhân)', { lyDoYeuCau: REASON }],
    ['chiNhanhId', { chiNhanhId: '1' }],
    ['benhNhanId', { benhNhanId: '1' }],
    ['accountId', { accountId: '1' }],
    ['trangThai', { trangThai: 'DaDoiLich' }],
  ])(
    'khoá lạ %s ⇒ 400 TRUONG_KHONG_DUOC_PHEP (chi nhánh chỉ từ máy chủ)',
    async (_name, extra) => {
      const errors = await errorsOf(() =>
        parseBody({ ...body(REASON), ...extra }),
      );
      expect(errors).toEqual([
        { truong: Object.keys(extra)[0], ma: 'TRUONG_KHONG_DUOC_PHEP' },
      ]);
    },
  );

  it.each([
    ['thiếu', undefined],
    ['số JSON', 12],
    ['số 0', '0'],
    ['số 0 đứng đầu', '012'],
    ['chuỗi rỗng', ''],
    ['null', null],
  ])('khungGioId %s ⇒ 400 (id BIGINT dạng chuỗi)', async (_name, value) => {
    const payload =
      value === undefined
        ? { lyDo: REASON }
        : { khungGioId: value, lyDo: REASON };
    const errors = await errorsOf(() => parseBody(payload));
    expect(errors.map((e) => e.truong)).toEqual(['khungGioId']);
  });

  it('DLO-20 query của preview cũng chặn khoá lạ chiNhanhId, benhNhanId, accountId (chi nhánh chỉ từ máy chủ)', async () => {
    for (const key of ['chiNhanhId', 'benhNhanId', 'accountId']) {
      const errors = await errorsOf(() => parseQuery({ [key]: '1' }));
      expect(errors).toEqual([{ truong: key, ma: 'TRUONG_KHONG_DUOC_PHEP' }]);
    }
    expect((await parseQuery({ khungGioId: SLOT })).khungGioId).toBe(SLOT);
    expect((await parseQuery({})).khungGioId).toBeUndefined();
  });
});

describe('DLO-11 lyDo: biên độ dài, Unicode, chữ giống bí mật', () => {
  it('1 ký tự và đúng 255 ký tự: vừa; 256: bị từ chối; sau khi cắt khoảng trắng mới tính độ dài', async () => {
    expect((await parseBody(body('x'))).lyDo).toBe('x');
    expect((await parseBody(body('a'.repeat(255)))).lyDo).toHaveLength(255);
    expect(await errorsOf(() => parseBody(body('a'.repeat(256))))).toEqual(
      REASON_REQUIRED,
    );
    expect((await parseBody(body(` ${'a'.repeat(255)} `))).lyDo).toHaveLength(
      255,
    );
    expect(
      await errorsOf(() => parseBody(body(`${'a'.repeat(255)} b`))),
    ).toEqual(REASON_REQUIRED);
  });

  it('độ dài tính bằng ĐƠN VỊ UTF-16 như luật Audit: 127 emoji (254 đơn vị) vừa, 128 emoji (256 đơn vị) bị từ chối; tiếng Việt có dấu dựng sẵn đếm một đơn vị', async () => {
    expect((await parseBody(body('😀'.repeat(127)))).lyDo).toHaveLength(254);
    expect(await errorsOf(() => parseBody(body('😀'.repeat(128))))).toEqual(
      REASON_REQUIRED,
    );
    expect((await parseBody(body('ệ'.repeat(255)))).lyDo).toHaveLength(255);
  });

  it.each([
    'password=abc12345',
    'token: abc123',
    'Bearer abc.def.ghi',
    'a'.repeat(64).replace(/a/g, 'f'),
    'otp=123456',
  ])(
    'chữ giống bí mật %# ⇒ 400 LY_DO_BAT_BUOC (nếu lọt, AuditService ném AUDIT_SENSITIVE_DATA và đổi lịch bị hoàn tác ra 500)',
    async (text) => {
      expect(await errorsOf(() => parseBody(body(text)))).toEqual(
        REASON_REQUIRED,
      );
    },
  );

  it('chữ thường dùng (có dấu hai chấm, dấu bằng, số điện thoại) KHÔNG bị chặn nhầm; ký tự HTML và dấu nháy lưu NGUYÊN (thoát khi dựng thư, không ở DTO)', async () => {
    for (const text of [
      'Bệnh nhân báo: đổi sang chiều, gọi lại 0901234567',
      'Giờ cũ = 08:00; giờ mới = 14:00',
      `<script>alert('x')</script> & "trích dẫn"`,
    ])
      expect((await parseBody(body(text))).lyDo).toBe(text);
  });
});

describe('DLO-12 trần DTO ≤ trần Audit', () => {
  it('CANCEL_REASON_MAX_LENGTH (trần của RequiredReason) không vượt AUDIT_RESCHEDULE_LIMITS.textMax; cận dưới của DTO không thấp hơn cận dưới Audit', () => {
    expect(CANCEL_REASON_MAX_LENGTH).toBeLessThanOrEqual(
      AUDIT_RESCHEDULE_LIMITS.textMax,
    );
    expect(AUDIT_RESCHEDULE_LIMITS.textMin).toBeGreaterThanOrEqual(1);
  });

  it('chuỗi dài đúng trần Audit lọt DTO, dài hơn một đơn vị bị từ chối: DTO không nhận gì mà Audit sẽ ném', async () => {
    const max = AUDIT_RESCHEDULE_LIMITS.textMax;
    expect((await parseBody(body('b'.repeat(max)))).lyDo).toHaveLength(max);
    expect(await errorsOf(() => parseBody(body('b'.repeat(max + 1))))).toEqual(
      REASON_REQUIRED,
    );
  });
});
