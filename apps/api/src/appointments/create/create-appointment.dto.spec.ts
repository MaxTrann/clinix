import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import { CreateAppointmentDto } from './create-appointment.dto.js';
import {
  isValidVisitReason,
  normalizeVisitReason,
  VISIT_REASON_MAX_LENGTH,
} from './visit-reason.rules.js';

// Task B8 — DTO thân `POST /booking/appointments` qua ĐÚNG cấu hình ValidationPipe của configureApp (TAO-03; DL-23 và DL-25 phần đơn vị; PLAN booking Q9; TRACKING 3.21 B8-G). Mã TAO-nn là [đề xuất].
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  validationError: { target: false, value: false },
  exceptionFactory: validationExceptionFactory,
});

const parse = (body: unknown) =>
  pipe.transform(body, {
    type: 'body',
    metatype: CreateAppointmentDto,
  }) as Promise<CreateAppointmentDto>;

async function errorsOf(body: unknown) {
  try {
    await parse(body);
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
  throw new Error('thân lẽ ra phải bị từ chối');
}

const REASON_ERROR = { truong: 'lyDoKham', ma: 'LY_DO_KHAM_KHONG_HOP_LE' };
const BASE = { khungGioId: '10' };

describe('CreateAppointmentDto: thân hợp lệ (TAO-03)', () => {
  it('chỉ khungGioId ⇒ hợp lệ; hoSoNguoiThanId và lyDoKham vắng', async () => {
    const dto = await parse(BASE);

    expect(dto.khungGioId).toBe('10');
    expect(dto.hoSoNguoiThanId).toBeUndefined();
    expect(dto.lyDoKham).toBeUndefined();
  });

  it('đủ ba trường ⇒ hợp lệ; id lớn hơn 2^53 giữ nguyên CHUỖI', async () => {
    const dto = await parse({
      khungGioId: '9007199254740993',
      hoSoNguoiThanId: '9223372036854775807',
      lyDoKham: 'Đau đầu ba ngày',
    });

    expect(dto.khungGioId).toBe('9007199254740993');
    expect(dto.hoSoNguoiThanId).toBe('9223372036854775807');
    expect(dto.lyDoKham).toBe('Đau đầu ba ngày');
  });

  it('hoSoNguoiThanId null ⇒ hợp lệ (hồ sơ bản thân)', async () => {
    expect(
      (await parse({ ...BASE, hoSoNguoiThanId: null })).hoSoNguoiThanId,
    ).toBeNull();
  });
});

describe('CreateAppointmentDto: lyDoKham (DL-23, Q9)', () => {
  it.each([
    ['null', null],
    ['chuỗi rỗng', ''],
    ['chỉ khoảng trắng', '   '],
    ['chỉ tab và xuống dòng', '\t\r\n \n'],
  ])(
    '%s ⇒ null sau chuẩn hoá (không bắt buộc, ghi SQL NULL)',
    async (_name, lyDoKham) => {
      expect((await parse({ ...BASE, lyDoKham })).lyDoKham).toBeNull();
    },
  );

  it('cắt khoảng trắng ASCII hai đầu và giữ nguyên chữ ở giữa', async () => {
    expect(
      (await parse({ ...BASE, lyDoKham: '  \tĐau đầu \n' })).lyDoKham,
    ).toBe('Đau đầu');
  });

  it('chuẩn hoá NFC: "e" + dấu mũ rời (NFD) thành "ê" một điểm mã', async () => {
    const nfd = 'Ho khan, mêt';

    const dto = await parse({ ...BASE, lyDoKham: nfd });

    // "ê" viết bằng mã thoát U+00EA để thấy rõ đó là MỘT điểm mã đã ghép
    expect(dto.lyDoKham).toBe('Ho khan, mêt');
    expect(Array.from(dto.lyDoKham ?? '')).toHaveLength(12);
  });

  it('500 điểm mã ⇒ hợp lệ; 501 ⇒ 400 LY_DO_KHAM_KHONG_HOP_LE', async () => {
    expect(
      (await parse({ ...BASE, lyDoKham: 'a'.repeat(500) })).lyDoKham,
    ).toHaveLength(500);
    expect(
      await errorsOf({ ...BASE, lyDoKham: 'a'.repeat(501) }),
    ).toStrictEqual([REASON_ERROR]);
  });

  it('đếm theo ĐIỂM MÃ, không theo đơn vị UTF-16: 500 emoji (1000 đơn vị) hợp lệ, 501 thì không', async () => {
    expect(
      (await parse({ ...BASE, lyDoKham: '😀'.repeat(500) })).lyDoKham,
    ).toBe('😀'.repeat(500));
    expect(
      await errorsOf({ ...BASE, lyDoKham: '😀'.repeat(501) }),
    ).toStrictEqual([REASON_ERROR]);
  });

  it('cắt khoảng trắng TRƯỚC khi đếm: 500 chữ cộng khoảng trắng hai đầu vẫn hợp lệ', async () => {
    expect(
      (await parse({ ...BASE, lyDoKham: `  ${'a'.repeat(500)}  ` })).lyDoKham,
    ).toHaveLength(500);
  });

  it.each([
    ['NUL', 'a\u0000b'],
    ['tab ở giữa', 'a\tb'],
    ['ESC', 'a\u001Bb'],
    ['DEL', 'a\u007Fb'],
    ['ký tự điều khiển C1', 'a\u0085b'],
  ])(
    'ký tự điều khiển %s ⇒ 400 LY_DO_KHAM_KHONG_HOP_LE',
    async (_name, lyDoKham) => {
      expect(await errorsOf({ ...BASE, lyDoKham })).toStrictEqual([
        REASON_ERROR,
      ]);
    },
  );

  it('xuống dòng được phép (cả \\n và \\r\\n ở giữa)', async () => {
    expect(
      (await parse({ ...BASE, lyDoKham: 'Dòng một\nDòng hai\r\nDòng ba' }))
        .lyDoKham,
    ).toBe('Dòng một\nDòng hai\r\nDòng ba');
  });

  it.each([
    ['số', 12],
    ['mảng', ['a']],
    ['đối tượng', { a: 1 }],
    ['true', true],
  ])(
    'kiểu sai (%s) ⇒ 400 LY_DO_KHAM_KHONG_HOP_LE, không âm thầm đổi thành null',
    async (_name, lyDoKham) => {
      expect(await errorsOf({ ...BASE, lyDoKham })).toStrictEqual([
        REASON_ERROR,
      ]);
    },
  );
});

describe('CreateAppointmentDto: khoá lạ và id sai (DL-25, QB-03)', () => {
  it.each([
    'bacSiId',
    'chiNhanhId',
    'dichVuKhamId',
    'benhNhanId',
    'trangThai',
    'giaSnapshot',
    'maLichHen',
  ])(
    'gửi %s ⇒ 400 TRUONG_KHONG_DUOC_PHEP (chủ sở hữu và mọi giá trị suy ra chỉ từ token và khung giờ)',
    async (key) => {
      const errors = await errorsOf({ ...BASE, [key]: '1' });

      expect(errors).toStrictEqual([
        { truong: key, ma: 'TRUONG_KHONG_DUOC_PHEP' },
      ]);
    },
  );

  it.each([
    ['vắng', {}],
    ['số JSON', { khungGioId: 12 }],
    ['chuỗi rỗng', { khungGioId: '' }],
    ['0', { khungGioId: '0' }],
  ])('khungGioId %s ⇒ 400 IS_BIGINT_ID', async (_name, body) => {
    const errors = await errorsOf(body);

    expect(errors).toStrictEqual([
      { truong: 'khungGioId', ma: 'IS_BIGINT_ID' },
    ]);
  });

  it('hoSoNguoiThanId sai dạng ⇒ 400 IS_BIGINT_ID (id sai dạng ở THÂN là 400, không phải 404)', async () => {
    expect(await errorsOf({ ...BASE, hoSoNguoiThanId: 'abc' })).toStrictEqual([
      { truong: 'hoSoNguoiThanId', ma: 'IS_BIGINT_ID' },
    ]);
  });
});

describe('visit-reason.rules: hàm thuần (DL-23)', () => {
  it('normalizeVisitReason: undefined và null ⇒ null; kiểu khác chuỗi giữ NGUYÊN để bị từ chối', () => {
    expect(normalizeVisitReason(undefined)).toBeNull();
    expect(normalizeVisitReason(null)).toBeNull();
    expect(normalizeVisitReason(5)).toBe(5);
    const list = ['a'];
    expect(normalizeVisitReason(list)).toBe(list);
  });

  it('isValidVisitReason: null hợp lệ; chuỗi chưa chuẩn hoá bị từ chối (mọi đường vào cùng một dạng); biên 1 và 500', () => {
    expect(isValidVisitReason(null)).toBe(true);
    expect(isValidVisitReason(' a')).toBe(false);
    expect(isValidVisitReason('')).toBe(false);
    expect(isValidVisitReason('a')).toBe(true);
    expect(isValidVisitReason('a'.repeat(VISIT_REASON_MAX_LENGTH))).toBe(true);
    expect(isValidVisitReason('a'.repeat(VISIT_REASON_MAX_LENGTH + 1))).toBe(
      false,
    );
    expect(VISIT_REASON_MAX_LENGTH).toBe(500);
  });

  it('ZWJ (U+200D, loại Cf) trong emoji ghép KHÔNG bị coi là ký tự điều khiển', () => {
    expect(isValidVisitReason('👨‍👩‍👧')).toBe(true);
  });

  it('không cắt U+00A0 (khoảng trắng không ngắt): chỉ cắt khoảng trắng ASCII, như họ tên và từ khoá q', () => {
    expect(normalizeVisitReason(' a ')).toBe(' a ');
  });
});
