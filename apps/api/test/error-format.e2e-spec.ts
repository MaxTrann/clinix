import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  InternalServerErrorException,
  Module,
  NotFoundException,
  Post,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import {
  IsAccountEmail,
  IsAccountPassword,
} from './../src/auth/dto/account-field.decorators.js';
import { Public } from './../src/auth/decorators/public.decorator.js';
import { insertTaiKhoan } from './../src/auth/entities/testing/auth-fixtures.js';
import { AppException } from './../src/common/errors/app.exception.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';

// Task P5. Dạng JSON chuẩn của MỌI lỗi qua HTTP thật (AppModule + MySQL thật + configureApp như main.ts).
// Mã test case của plan: không có mã riêng (issue #17: "kiểm theo mô tả"); SE-04 và DM-09 ở test/log-masking.e2e-spec.ts.
class RegisterDto {
  @IsAccountEmail()
  email!: string;

  @IsAccountPassword()
  matKhau!: string;
}

const SECRET_PASSWORD = 'Mat-khau-mau-P5!';

@Public()
@Controller('err-probe')
class ProbeController {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  @Post('dto')
  dto(@Body() body: RegisterDto) {
    return { ok: true, email: body.email };
  }

  @Get('not-found')
  notFound(): never {
    throw new NotFoundException();
  }

  @Get('app-not-found')
  appNotFound(): never {
    throw new AppException(404, 'KHONG_TIM_THAY');
  }

  @Get('app-exception')
  appException(): never {
    throw new AppException(409, 'YEU_CAU_DANG_CHO', {
      thongBao: 'Chi nhánh đang có yêu cầu thay đổi chưa hoàn tất.',
      chiTiet: { soYeuCau: 2 },
    });
  }

  @Get('free-text')
  freeText(): never {
    throw new BadRequestException('Câu tự do của người viết code, đừng lộ ra');
  }

  @Get('boom')
  boom(): never {
    throw new Error(
      `mật khẩu root DB là ${SECRET_PASSWORD} tại D:\\du_lieu\\x.ts`,
    );
  }

  @Get('http-500')
  http500(): never {
    throw new InternalServerErrorException('chi tiết nội bộ không được lộ');
  }

  @Get('http-503')
  http503(): never {
    throw new HttpException('DB đang bảo trì nội bộ', 503);
  }

  // Lỗi MySQL thật (UNIQUE) không được lường trước ⇒ 500 chung
  @Get('db')
  async dbError(): Promise<void> {
    await insertTaiKhoan(this.db, { email: 'trung.email@example.com' });
    await insertTaiKhoan(this.db, { email: 'trung.email@example.com' });
  }
}

@Module({ imports: [AppModule], controllers: [ProbeController] })
class ProbeModule {}

let app: NestExpressApplication;
let stderrLines: string[];

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [ProbeModule],
  }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app); // đúng cấu hình như main.ts: bộ lọc lỗi + ValidationPipe + logger che bí mật
  await app.init();
});

beforeEach(async () => {
  await resetTables(app.get(DataSource));
  stderrLines = [];
  // Lỗi 5xx được ghi log ERROR ra stderr: bắt lại cho đỡ ồn và để kiểm "lỗi 4xx không ghi log"
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    stderrLines.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await app.close();
});

const server = () => app.getHttpServer();

describe('lỗi kiểm dữ liệu → 400 DU_LIEU_KHONG_HOP_LE kèm loi[{truong, ma}]', () => {
  it('mã của DTO dự án (A1) đi nguyên ra từng trường; không phản chiếu mật khẩu người dùng gửi', async () => {
    const res = await request(server())
      .post('/err-probe/dto')
      .send({ email: 'khong-phai-email', matKhau: 'ngan' });

    const body = expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE');
    expect(body.thongBao).toBe('Dữ liệu không hợp lệ.');
    expect(body.loi).toEqual(
      expect.arrayContaining([
        { truong: 'email', ma: 'EMAIL_KHONG_HOP_LE' },
        { truong: 'matKhau', ma: 'MAT_KHAU_KHONG_HOP_LE' },
      ]),
    );
    expect(body.loi).toHaveLength(2);
    expect(res.text).not.toContain('ngan"');
    expect(stderrLines).toEqual([]); // lỗi 4xx không ghi log lỗi
  });

  it('trường lạ bị forbidNonWhitelisted ⇒ TRUONG_KHONG_DUOC_PHEP', async () => {
    const res = await request(server()).post('/err-probe/dto').send({
      email: 'nguoi.dung@example.com',
      matKhau: SECRET_PASSWORD,
      quyen: 'admin',
    });

    const body = expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE');
    expect(body.loi).toEqual([
      { truong: 'quyen', ma: 'TRUONG_KHONG_DUOC_PHEP' },
    ]);
  });

  it('không gửi body ⇒ báo thiếu từng trường bằng mã của chính trường đó', async () => {
    const res = await request(server()).post('/err-probe/dto');

    const body = expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE');
    expect(body.loi).toEqual(
      expect.arrayContaining([
        { truong: 'email', ma: 'EMAIL_KHONG_HOP_LE' },
        { truong: 'matKhau', ma: 'MAT_KHAU_KHONG_HOP_LE' },
      ]),
    );
  });

  it('dữ liệu hợp lệ vẫn qua bình thường', async () => {
    const res = await request(server())
      .post('/err-probe/dto')
      .send({ email: 'Nguoi.Dung@EXAMPLE.com', matKhau: SECRET_PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true, email: 'Nguoi.Dung@example.com' });
  });
});

describe('lỗi giao thức do Express/body-parser — không lặp lại nội dung request', () => {
  it('JSON hỏng ⇒ 400 YEU_CAU_KHONG_HOP_LE, thân không chứa thông điệp V8 hay đoạn body', async () => {
    const res = await request(server())
      .post('/err-probe/dto')
      .set('Content-Type', 'application/json')
      .send(`{"matKhau": "${SECRET_PASSWORD}", oops`);

    expectErrorResponse(res, 400, 'YEU_CAU_KHONG_HOP_LE');
    for (const leak of [SECRET_PASSWORD, 'oops', 'position', 'JSON']) {
      expect(res.text).not.toContain(leak);
    }
    expect(stderrLines).toEqual([]);
  });

  it('body 200 KB (vượt giới hạn 100 KB của body-parser) ⇒ 413 DU_LIEU_QUA_LON, không ghi log ERROR', async () => {
    const res = await request(server())
      .post('/err-probe/dto')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ x: 'a'.repeat(200_000) }));

    expectErrorResponse(res, 413, 'DU_LIEU_QUA_LON');
    expect(res.text).not.toContain('entity');
    expect(stderrLines).toEqual([]); // mặc định Nest ghi ERROR kèm stack cho lỗi này; bộ lọc coi là lỗi của client
  });
});

describe('404 — route lạ, sai method, tài nguyên không có đều CÙNG một thân phản hồi', () => {
  it('route lạ kèm query chứa bí mật ⇒ 404 KHONG_TIM_THAY, không lặp đường dẫn hay query', async () => {
    const res = await request(server()).get('/khong-co?token=BI-MAT-123');

    expectErrorResponse(res, 404, 'KHONG_TIM_THAY');
    expect(res.text).not.toContain('BI-MAT-123');
    expect(res.text).not.toContain('khong-co');
  });

  it('thân của mọi kiểu 404 giống hệt nhau (plan admin PQ-13: không dò được tài nguyên ngoài phạm vi)', async () => {
    const responses = [
      await request(server()).get('/khong-co'),
      await request(server()).get('/khac-nua?a=1'),
      await request(server()).post('/health').send({}), // sai method: Nest trả 404, không phải 405
      await request(server()).get('/err-probe/not-found'),
      await request(server()).get('/err-probe/app-not-found'),
    ];
    for (const res of responses)
      expectErrorResponse(res, 404, 'KHONG_TIM_THAY');
    expect(new Set(responses.map((res) => res.text)).size).toBe(1);
  });
});

describe('AppException và lỗi tự do của người viết code', () => {
  it('AppException(409, mã, { thongBao, chiTiet }) ra đúng nguyên văn', async () => {
    const res = await request(server()).get('/err-probe/app-exception');

    const body = expectErrorResponse(res, 409, 'YEU_CAU_DANG_CHO');
    expect(body).toEqual({
      maLoi: 'YEU_CAU_DANG_CHO',
      thongBao: 'Chi nhánh đang có yêu cầu thay đổi chưa hoàn tất.',
      chiTiet: { soYeuCau: 2 },
    });
  });

  it('BadRequestException(câu tự do) ⇒ 400 YEU_CAU_KHONG_HOP_LE, câu tự do không ra ngoài', async () => {
    const res = await request(server()).get('/err-probe/free-text');

    expectErrorResponse(res, 400, 'YEU_CAU_KHONG_HOP_LE');
    expect(res.text).not.toContain('đừng lộ ra');
  });
});

describe('lỗi 5xx — 500 LOI_HE_THONG không lộ chi tiết, có requestId khớp dòng log', () => {
  it.each(['boom', 'http-500', 'db'])(
    '/err-probe/%s ⇒ 500 chung, không stack, không thông điệp gốc, không SQL',
    async (path) => {
      const res = await request(server()).get(`/err-probe/${path}`);

      const body = expectErrorResponse(res, 500, 'LOI_HE_THONG');
      expect(Object.keys(body).sort()).toEqual([
        'maLoi',
        'requestId',
        'thongBao',
      ]);
      for (const leak of [
        SECRET_PASSWORD,
        'mật khẩu root',
        'D:\\\\du_lieu',
        'chi tiết nội bộ',
        'Duplicate',
        'INSERT',
        'tai_khoan',
        'stack',
        ' at ',
      ]) {
        expect(res.text).not.toContain(leak);
      }
      // Nhưng dòng log ERROR của đúng request này có cùng requestId để người vận hành tra ra nguyên nhân
      expect(stderrLines.join('')).toContain(`[${body.requestId}]`);
      expect(stderrLines.join('')).toContain(`GET /err-probe/${path} → 500`);
    },
  );

  it('lỗi MySQL thật (UNIQUE) được log kèm code/errno nhưng phản hồi không có', async () => {
    const res = await request(server()).get('/err-probe/db');

    expectErrorResponse(res, 500, 'LOI_HE_THONG');
    const log = stderrLines.join('');
    expect(log).toContain('ER_DUP_ENTRY');
    expect(log).toContain('errno=1062');
    expect(res.text).not.toContain('ER_DUP_ENTRY');
  });

  it('HttpException 503 có chủ ý giữ trạng thái 503 nhưng vẫn ẩn chi tiết', async () => {
    const res = await request(server()).get('/err-probe/http-503');

    expectErrorResponse(res, 503, 'LOI_HE_THONG');
    expect(res.text).not.toContain('bảo trì');
  });

  it('mỗi lỗi có requestId riêng', async () => {
    const first = await request(server()).get('/err-probe/boom');
    const second = await request(server()).get('/err-probe/boom');

    expect((first.body as { requestId: string }).requestId).not.toBe(
      (second.body as { requestId: string }).requestId,
    );
  });
});
