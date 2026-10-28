import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  MethodNotAllowedException,
  NotFoundException,
  UnauthorizedException,
  type ArgumentsHost,
  type LoggerService,
} from '@nestjs/common';
import { AUTH_ERROR_CODES } from '../../auth/auth.constants.js';
import { AppException } from './app.exception.js';
import {
  AllExceptionsFilter,
  toErrorResponse,
} from './all-exceptions.filter.js';

// Task P5. Ánh xạ MỌI lỗi sang dạng JSON chuẩn; 5xx không lộ chi tiết và được log kèm requestId. Cách A3/A4 ném lỗi giữ nguyên.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('toErrorResponse — HttpException của A3/A4 giữ nguyên hành vi', () => {
  it.each([
    [
      new UnauthorizedException(AUTH_ERROR_CODES.NOT_LOGGED_IN),
      401,
      'CHUA_DANG_NHAP',
    ],
    [
      new UnauthorizedException(AUTH_ERROR_CODES.INVALID_TOKEN),
      401,
      'TOKEN_KHONG_HOP_LE',
    ],
    [
      new UnauthorizedException(AUTH_ERROR_CODES.SESSION_INACTIVE),
      401,
      'PHIEN_HET_HIEU_LUC',
    ],
    [new ForbiddenException(AUTH_ERROR_CODES.FORBIDDEN), 403, 'KHONG_DU_QUYEN'],
    [new ForbiddenException('ORIGIN_KHONG_HOP_LE'), 403, 'ORIGIN_KHONG_HOP_LE'],
  ])(
    '%#: thông điệp là mã ⇒ maLoi = mã đó, trạng thái giữ nguyên',
    (exception, status, code) => {
      const result = toErrorResponse(exception);

      expect(result.status).toBe(status);
      expect(result.body.maLoi).toBe(code);
      expect(Object.keys(result.body).sort()).toEqual(['maLoi', 'thongBao']);
    },
  );
});

describe('toErrorResponse — thông điệp tự do KHÔNG được chuyển ra', () => {
  it('route lạ: Nest ghi cả query string vào thông điệp ⇒ trả KHONG_TIM_THAY chung, không có query', () => {
    const result = toErrorResponse(
      new NotFoundException('Cannot GET /khong-co?token=BI-MAT-123'),
    );

    expect(result.status).toBe(404);
    expect(result.body.maLoi).toBe('KHONG_TIM_THAY');
    expect(JSON.stringify(result.body)).not.toContain('BI-MAT-123');
    expect(JSON.stringify(result.body)).not.toContain('khong-co');
  });

  it('mọi 404 cùng một thân phản hồi (route lạ = tài nguyên không có = ngoài phạm vi, plan admin PQ-13)', () => {
    const bodies = [
      toErrorResponse(new NotFoundException('Cannot GET /a')),
      toErrorResponse(new NotFoundException('Cannot POST /b?x=1')),
      toErrorResponse(new NotFoundException()),
      toErrorResponse(new AppException(404, 'KHONG_TIM_THAY')),
    ].map((item) => JSON.stringify(item.body));
    expect(new Set(bodies).size).toBe(1);
  });

  it('JSON hỏng: thông điệp của V8 có thể trích đoạn body ⇒ bị bỏ, mã YEU_CAU_KHONG_HOP_LE', () => {
    const result = toErrorResponse(
      new BadRequestException(
        `Unexpected token 'o', "{"matKhau": "Mat-khau-1!", oops" is not valid JSON`,
      ),
    );

    expect(result.status).toBe(400);
    expect(result.body.maLoi).toBe('YEU_CAU_KHONG_HOP_LE');
    expect(JSON.stringify(result.body)).not.toContain('Mat-khau-1!');
  });

  it('mảng thông điệp mặc định của ValidationPipe cũng bị bỏ', () => {
    const result = toErrorResponse(
      new BadRequestException(['email must be an email', 'x must be a string']),
    );
    expect(result.body.maLoi).toBe('YEU_CAU_KHONG_HOP_LE');
    expect(JSON.stringify(result.body)).not.toContain('must be');
  });

  it.each([
    [new UnauthorizedException(), 401, 'CHUA_DANG_NHAP'],
    [new ForbiddenException(), 403, 'KHONG_DU_QUYEN'],
    [new MethodNotAllowedException(), 405, 'PHUONG_THUC_KHONG_DUOC_PHEP'],
    [new HttpException('ấm trà', 418), 418, 'YEU_CAU_KHONG_HOP_LE'],
  ])(
    '%#: không có mã trong thông điệp ⇒ mã mặc định theo trạng thái',
    (exception, status, code) => {
      const result = toErrorResponse(exception);
      expect(result.status).toBe(status);
      expect(result.body.maLoi).toBe(code);
    },
  );
});

describe('toErrorResponse — AppException và lỗi của Express/body-parser', () => {
  it('AppException đi nguyên: trạng thái, mã, thongBao, loi, chiTiet', () => {
    const result = toErrorResponse(
      new AppException(409, 'YEU_CAU_DANG_CHO', {
        thongBao: 'Đang có yêu cầu chưa xong.',
        chiTiet: { soYeuCau: 2 },
      }),
    );
    expect(result).toEqual({
      status: 409,
      body: {
        maLoi: 'YEU_CAU_DANG_CHO',
        thongBao: 'Đang có yêu cầu chưa xong.',
        chiTiet: { soYeuCau: 2 },
      },
    });
  });

  // Task A5 (đã duyệt): AppException 503 đi nguyên (khác HttpException 503 thường, bị ẩn thành LOI_HE_THONG ở test bên dưới)
  it('AppException 503 (GUI_MAIL_LOI) đi nguyên: giữ trạng thái, mã, thongBao, chiTiet', () => {
    const result = toErrorResponse(
      new AppException(503, 'GUI_MAIL_LOI', {
        thongBao: 'Không gửi được email. Vui lòng thử lại sau ít phút.',
        chiTiet: { maXacThucId: '7', coTheGuiLaiLuc: 'mốc' },
        cause: new Error('Máy chủ SMTP từ chối đăng nhập'),
      }),
    );
    expect(result).toEqual({
      status: 503,
      body: {
        maLoi: 'GUI_MAIL_LOI',
        thongBao: 'Không gửi được email. Vui lòng thử lại sau ít phút.',
        chiTiet: { maXacThucId: '7', coTheGuiLaiLuc: 'mốc' },
      },
    });
    expect(JSON.stringify(result.body)).not.toContain('SMTP');
  });

  // Plan admin 5.9, dạng lỗi của CN-03; Trung (admin) xác nhận 27/10/2026: mã ở ngoài, chiTiet là MẢNG đặt trực tiếp,
  // `loi` chỉ dành cho lỗi kiểm dữ liệu theo trường.
  it('LICH_HOAT_DONG_KHONG_HOP_LE: chiTiet là mảng [{thu, maLoi}] được giữ nguyên, không có khoá loi', () => {
    const chiTiet = [{ thu: 2, maLoi: 'GIO_BAT_DAU_SAU_KET_THUC' }];

    const result = toErrorResponse(
      new AppException(400, 'LICH_HOAT_DONG_KHONG_HOP_LE', { chiTiet }),
    );

    expect(result.status).toBe(400);
    expect(result.body).toEqual({
      maLoi: 'LICH_HOAT_DONG_KHONG_HOP_LE',
      thongBao: expect.any(String),
      chiTiet: [{ thu: 2, maLoi: 'GIO_BAT_DAU_SAU_KET_THUC' }],
    });
    expect(Array.isArray(result.body.chiTiet)).toBe(true);
    expect(result.body).not.toHaveProperty('loi');
    // Ra tới client là JSON: mảng phải còn nguyên sau khi tuần tự hoá
    expect(JSON.parse(JSON.stringify(result.body))).toEqual(result.body);
  });

  it('body-parser PayloadTooLargeError (không phải HttpException) ⇒ 413 DU_LIEU_QUA_LON, không lặp thông điệp gốc', () => {
    const error = Object.assign(new Error('request entity too large'), {
      status: 413,
      statusCode: 413,
      type: 'entity.too.large',
      expose: true,
    });

    const result = toErrorResponse(error);

    expect(result.status).toBe(413);
    expect(result.body.maLoi).toBe('DU_LIEU_QUA_LON');
    expect(JSON.stringify(result.body)).not.toContain('entity');
  });

  it('lỗi có statusCode 4xx khác ⇒ YEU_CAU_KHONG_HOP_LE', () => {
    const result = toErrorResponse(
      Object.assign(new Error('x'), { statusCode: 400 }),
    );
    expect(result.status).toBe(400);
    expect(result.body.maLoi).toBe('YEU_CAU_KHONG_HOP_LE');
  });
});

describe('toErrorResponse — mọi thứ còn lại là 500 LOI_HE_THONG, không lộ chi tiết', () => {
  it.each([
    [
      'Error thường',
      new Error('mật khẩu DB là Bi-mat-1! tại D:\\du_lieu\\x.ts'),
    ],
    [
      'Error có code MySQL',
      Object.assign(new Error("Duplicate entry 'a@b.vn'"), {
        code: 'ER_DUP_ENTRY',
      }),
    ],
    [
      'InternalServerErrorException',
      new InternalServerErrorException('chi tiết nội bộ'),
    ],
    ['chuỗi bị ném', 'một chuỗi bí mật'],
    ['null', null],
    ['undefined', undefined],
    ['số', 42],
    ['đối tượng thường', { matKhau: 'Bi-mat-1!' }],
    [
      'lỗi có status 200 (không phải lỗi HTTP)',
      { status: 200, message: 'bí mật' },
    ],
    ['lỗi có status 600', { status: 600, message: 'bí mật' }],
    ['lỗi có status không nguyên', { status: 404.5, message: 'bí mật' }],
  ])('%s', (_ten, thrown) => {
    const result = toErrorResponse(thrown);

    expect(result.status).toBe(500);
    expect(result.body.maLoi).toBe('LOI_HE_THONG');
    expect(Object.keys(result.body).sort()).toEqual(['maLoi', 'thongBao']);
    const text = JSON.stringify(result.body);
    for (const leak of [
      'Bi-mat-1!',
      'D:\\du_lieu',
      'Duplicate',
      'chi tiết nội bộ',
      'bí mật',
      'stack',
    ]) {
      expect(text).not.toContain(leak);
    }
  });

  it('HttpException 5xx có chủ ý (503) giữ trạng thái nhưng vẫn ẩn chi tiết', () => {
    const result = toErrorResponse(
      new HttpException('DB đang bảo trì nội bộ', 503),
    );
    expect(result.status).toBe(503);
    expect(result.body.maLoi).toBe('LOI_HE_THONG');
    expect(JSON.stringify(result.body)).not.toContain('bảo trì');
  });
});

// ---------- bộ lọc (ghi phản hồi + log) ----------

function fakeLogger() {
  return { log: vi.fn(), error: vi.fn(), warn: vi.fn() };
}

function fakeResponse() {
  const response = { headersSent: false, status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  return response;
}

function fakeHost(request: object, response: object): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
}

function run(
  exception: unknown,
  request: object = { method: 'GET', path: '/x', url: '/x' },
  logger = fakeLogger(),
) {
  const response = fakeResponse();
  new AllExceptionsFilter(logger as unknown as LoggerService).catch(
    exception,
    fakeHost(request, response),
  );
  return { response, logger };
}

describe('AllExceptionsFilter', () => {
  it('lỗi 4xx: trả đúng trạng thái và thân chuẩn, KHÔNG ghi log, không có requestId', () => {
    const { response, logger } = run(
      new UnauthorizedException(AUTH_ERROR_CODES.INVALID_TOKEN),
    );

    expect(response.status).toHaveBeenCalledExactlyOnceWith(401);
    const body = response.json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body['maLoi']).toBe('TOKEN_KHONG_HOP_LE');
    expect(body['requestId']).toBeUndefined();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('lỗi 5xx: thân có requestId; log ERROR có cùng requestId, method, đường dẫn BỎ query, trạng thái và stack', () => {
    const error = new Error('hỏng nặng');
    const { response, logger } = run(error, {
      method: 'POST',
      path: '/guard-probe/x',
      url: '/guard-probe/x?token=BI-MAT-QUERY',
    });

    expect(response.status).toHaveBeenCalledExactlyOnceWith(500);
    const body = response.json.mock.calls[0]?.[0] as Record<string, string>;
    expect(body['requestId']).toMatch(UUID);
    expect(Object.keys(body).sort()).toEqual([
      'maLoi',
      'requestId',
      'thongBao',
    ]);

    expect(logger.error).toHaveBeenCalledOnce();
    const [header, detail] = logger.error.mock.calls[0] as [string, string];
    expect(header).toBe(`[${body['requestId']}] POST /guard-probe/x → 500`);
    expect(header).not.toContain('BI-MAT-QUERY');
    expect(detail).toContain('hỏng nặng');
    expect(detail).toContain('all-exceptions.filter.spec.ts'); // stack thật để chẩn đoán
  });

  it('AppException 503 (task A5): bộ lọc KHÔNG đổi, vẫn thêm requestId, giữ mã và chiTiet, log ERROR cùng requestId', () => {
    const { response, logger } = run(
      new AppException(503, 'GUI_MAIL_LOI', {
        chiTiet: { maXacThucId: '7' },
        cause: new Error('Máy chủ SMTP từ chối đăng nhập'),
      }),
      { method: 'POST', path: '/auth/register', url: '/auth/register' },
    );

    expect(response.status).toHaveBeenCalledExactlyOnceWith(503);
    const body = response.json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body['maLoi']).toBe('GUI_MAIL_LOI');
    expect(body['chiTiet']).toEqual({ maXacThucId: '7' });
    expect(body['requestId']).toMatch(UUID);
    expect(JSON.stringify(body)).not.toContain('SMTP');

    expect(logger.error).toHaveBeenCalledOnce();
    const [header, detail] = logger.error.mock.calls[0] as [string, string];
    expect(header).toBe(
      `[${String(body['requestId'])}] POST /auth/register → 503`,
    );
    expect(detail).toContain('GUI_MAIL_LOI');
  });

  it('ghi kèm mã tài khoản (đã đăng nhập) vào dòng log để tìm lại người gặp lỗi', () => {
    const { logger } = run(new Error('x'), {
      method: 'GET',
      path: '/a',
      url: '/a',
      user: { accountId: '7', sessionId: '42', role: 'BacSi' },
    });
    const [header] = logger.error.mock.calls[0] as [string];
    expect(header).toContain('account=7');
    expect(header).not.toContain('sessionId');
  });

  it('log lỗi MySQL kèm code/errno/sqlState (chẩn đoán) nhưng không đưa chúng vào phản hồi', () => {
    const error = Object.assign(new Error("Duplicate entry 'x' for key 'k'"), {
      code: 'ER_DUP_ENTRY',
      errno: 1062,
      sqlState: '23000',
    });
    const { response, logger } = run(error);

    const [, detail] = logger.error.mock.calls[0] as [string, string];
    expect(detail).toContain('code=ER_DUP_ENTRY errno=1062 sqlState=23000');
    expect(JSON.stringify(response.json.mock.calls[0]?.[0])).not.toContain(
      'ER_DUP_ENTRY',
    );
  });

  it.each([
    ['chuỗi', 'một chuỗi bị ném'],
    ['đối tượng', { loai: 'la' }],
    ['undefined', undefined],
  ])(
    'giá trị không phải Error (%s) vẫn được log và trả 500',
    (_ten, thrown) => {
      const { response, logger } = run(thrown);
      expect(response.status).toHaveBeenCalledExactlyOnceWith(500);
      expect(logger.error).toHaveBeenCalledOnce();
    },
  );

  it('ghi log hỏng không làm mất phản hồi cho client', () => {
    const logger = fakeLogger();
    logger.error.mockImplementation(() => {
      throw new Error('ổ đĩa đầy');
    });

    const { response } = run(new Error('x'), undefined, logger);

    expect(response.status).toHaveBeenCalledExactlyOnceWith(500);
    expect(response.json).toHaveBeenCalledOnce();
  });

  it('phản hồi đã gửi một phần (headersSent) thì không ghi đè, nhưng lỗi 5xx vẫn được log', () => {
    const response = fakeResponse();
    response.headersSent = true;
    const logger = fakeLogger();

    new AllExceptionsFilter(logger as unknown as LoggerService).catch(
      new Error('x'),
      fakeHost({ method: 'GET', path: '/x', url: '/x' }, response),
    );

    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
