import { Body, Controller, Inject, Module, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { IsIn, IsString } from 'class-validator';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { Public } from './../src/auth/decorators/public.decorator.js';
import { TaiKhoan } from './../src/auth/entities/tai-khoan.entity.js';
import { AuthModule } from './../src/auth/auth.module.js';
import { toOtpException } from './../src/auth/otp/otp-errors.js';
import { OtpService } from './../src/auth/otp/otp.service.js';
import type { OtpLoai } from './../src/auth/otp/otp.types.js';
import {
  REGISTRATION,
  T0,
  at,
  newUnverifiedAccount,
  wrongCodeFor,
} from './../src/auth/testing/otp-int-helpers.js';
import { readOtpFromMail } from './../src/auth/testing/otp-test-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';
import { MailService } from './../src/mail/mail.service.js';
import { FakeMailService } from './../src/mail/testing/fake-mail.service.js';

// Task A2 — kiểm OtpService qua HTTP thật (AppModule + MySQL thật + configureApp như main.ts), bằng một controller thử trong file test:
// A2 chưa có endpoint (A5 trở đi). Mục đích: mỗi lỗi OTP đi qua bộ lọc lỗi P5 thành đúng mã/trạng thái/chiTiet, và KHÔNG có OTP trong
// thân phản hồi hay log (DK-40, SE-04). Mã nội bộ OTP-Ennn là [đề xuất].
class IssueDto {
  @IsString()
  taiKhoanId!: string;

  @IsIn(['DangKy', 'QuenMatKhau'])
  loai!: OtpLoai;
}

class VerifyDto {
  @IsString()
  maXacThucId!: string;

  @IsString()
  otp!: string;
}

class ReissueDto {
  @IsString()
  maXacThucId!: string;
}

@Public()
@Controller('otp-probe')
class OtpProbeController {
  constructor(
    @Inject(OtpService) private readonly otp: OtpService,
    @Inject(DataSource) private readonly db: DataSource,
  ) {}

  @Post('issue')
  async issue(@Body() dto: IssueDto) {
    const account = await this.db
      .getRepository(TaiKhoan)
      .findOneByOrFail({ taiKhoanId: dto.taiKhoanId });
    const input =
      dto.loai === 'DangKy'
        ? ({
            taiKhoanId: dto.taiKhoanId,
            loai: 'DangKy',
            registration: REGISTRATION,
          } as const)
        : ({ taiKhoanId: dto.taiKhoanId, loai: 'QuenMatKhau' } as const);
    const result = await this.otp.issueAndDeliver(input, {
      email: account.email,
      fullName: account.hoTen,
    });
    if (!result.ok) throw toOtpException(result.failure);
    return result.issued;
  }

  // Cố tình trả THẲNG IssuedOtp ra HTTP: nếu một controller làm vậy thì mã vẫn không được lộ
  @Post('issue-raw')
  async issueRaw(@Body() dto: IssueDto) {
    const result = await this.otp.issue({
      taiKhoanId: dto.taiKhoanId,
      loai: 'QuenMatKhau',
    });
    if (!result.ok) throw toOtpException(result.failure);
    return result.issued;
  }

  @Post('reissue')
  async reissue(@Body() dto: ReissueDto) {
    const result = await this.otp.reissue({ maXacThucId: dto.maXacThucId });
    if (!result.ok) throw toOtpException(result.failure);
    await this.otp.deliver(result.issued, { email: 'khong-dung@example.com' });
    return { maXacThucId: result.issued.maXacThucId };
  }

  @Post('verify')
  async verify(@Body() dto: VerifyDto) {
    const result = await this.otp.verify({
      maXacThucId: dto.maXacThucId,
      loai: 'DangKy',
      otp: dto.otp,
    });
    if (!result.ok) throw toOtpException(result.failure);
    return { ok: true };
  }
}

@Module({ imports: [AppModule, AuthModule], controllers: [OtpProbeController] })
class ProbeModule {}

const mail = new FakeMailService();
let app: NestExpressApplication;
let db: DataSource;
let output: string[];

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] })
    .overrideProvider(MailService)
    .useValue(mail)
    .compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app); // đúng cấu hình như main.ts: bộ lọc lỗi + ValidationPipe + logger che bí mật
  await app.init();
  db = app.get(DataSource);
});

beforeEach(async () => {
  await resetTables(db);
  mail.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  output = [];
  const capture = (chunk: unknown): boolean => {
    output.push(String(chunk));
    return true;
  };
  vi.spyOn(process.stderr, 'write').mockImplementation(capture);
  vi.spyOn(process.stdout, 'write').mockImplementation(capture);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await app.close();
});

const server = () => app.getHttpServer();
const post = (path: string, body: object) =>
  request(server()).post(`/otp-probe/${path}`).send(body);
const goTo = (seconds: number) => vi.setSystemTime(at(seconds));
const standalone = (code: string) => new RegExp(`(?<![0-9])${code}(?![0-9])`);

async function issueOnHttp(
  taiKhoanId: string,
): Promise<{ id: string; code: string }> {
  const res = await post('issue', { taiKhoanId, loai: 'DangKy' });
  expect(res.status).toBe(201);
  const last = mail.attempts[mail.attempts.length - 1];
  if (!last) throw new Error('chưa có thư');
  return {
    id: (res.body as { maXacThucId: string }).maXacThucId,
    code: readOtpFromMail(last),
  };
}

describe('OtpService trong AppModule thật (OTP-E001)', () => {
  it('AuthModule cung cấp và xuất OtpService; cấp mã qua HTTP trả mã hàng và hạn, không trả OTP', async () => {
    expect(app.get(OtpService, { strict: false })).toBeInstanceOf(OtpService);
    const account = await newUnverifiedAccount(db);

    const res = await post('issue', {
      taiKhoanId: account.taiKhoanId,
      loai: 'DangKy',
    });

    expect(res.status).toBe(201);
    expect(Object.keys(res.body as object).sort()).toEqual([
      'hetHanLuc',
      'maXacThucId',
    ]);
    expect((res.body as { hetHanLuc: string }).hetHanLuc).toBe(
      at(600).toISOString(),
    );
    const sent = mail.sent[0];
    if (!sent) throw new Error('chưa có thư');
    expect(sent.to).toBe(account.email);
    expect(res.text).not.toMatch(standalone(readOtpFromMail(sent)));
  });
});

describe('mỗi lỗi OTP → đúng mã/trạng thái/chiTiet qua bộ lọc lỗi P5 (OTP-E002)', () => {
  it('sai mã → 400 OTP_SAI; đúng mã → 201; mã không tồn tại → 400 OTP_SAI', async () => {
    const account = await newUnverifiedAccount(db);
    const { id, code } = await issueOnHttp(account.taiKhoanId);

    const wrong = await post('verify', {
      maXacThucId: id,
      otp: wrongCodeFor(code),
    });
    const body = expectErrorResponse(wrong, 400, 'OTP_SAI');
    expect(body.thongBao).toBe('Mã OTP không đúng. Vui lòng kiểm tra lại.');
    expect(body).not.toHaveProperty('chiTiet');

    expect(
      (await post('verify', { maXacThucId: '999999', otp: code })).status,
    ).toBe(400);
    expectErrorResponse(
      await post('verify', { maXacThucId: '999999', otp: code }),
      400,
      'OTP_SAI',
    );

    const ok = await post('verify', { maXacThucId: id, otp: code });
    expect(ok.status).toBe(201);
    expect(ok.body).toEqual({ ok: true });
  });

  it('sai đủ 5 lần → lần thứ 5 là 400 OTP_HET_LUOT, sau đó mã đúng cũng 400 OTP_HET_LUOT', async () => {
    const account = await newUnverifiedAccount(db);
    const { id, code } = await issueOnHttp(account.taiKhoanId);
    for (let i = 1; i < 5; i++) {
      expectErrorResponse(
        await post('verify', { maXacThucId: id, otp: wrongCodeFor(code) }),
        400,
        'OTP_SAI',
      );
    }
    expectErrorResponse(
      await post('verify', { maXacThucId: id, otp: wrongCodeFor(code) }),
      400,
      'OTP_HET_LUOT',
    );
    expectErrorResponse(
      await post('verify', { maXacThucId: id, otp: code }),
      400,
      'OTP_HET_LUOT',
    );
  });

  it('quá hạn → 400 OTP_HET_HAN (kể cả mã sai)', async () => {
    const account = await newUnverifiedAccount(db);
    const { id, code } = await issueOnHttp(account.taiKhoanId);
    goTo(601);
    expectErrorResponse(
      await post('verify', { maXacThucId: id, otp: wrongCodeFor(code) }),
      400,
      'OTP_HET_HAN',
    );
  });

  it('cấp lại quá sớm → 429 GUI_LAI_QUA_SOM kèm chiTiet.soGiayCho cho FE đếm ngược', async () => {
    const account = await newUnverifiedAccount(db);
    await issueOnHttp(account.taiKhoanId);
    goTo(45);
    const res = await post('issue', {
      taiKhoanId: account.taiKhoanId,
      loai: 'DangKy',
    });
    const body = expectErrorResponse(res, 429, 'GUI_LAI_QUA_SOM');
    expect(body.thongBao).toBe('Vui lòng thử lại sau.');
    expect(body.chiTiet).toEqual({ soGiayCho: 15 });
    expect(mail.sent).toHaveLength(1); // không gửi thêm thư
  });

  it('mã cũ sau khi có mã mới đã gửi → 409 OTP_BI_THAY_THE (xác minh và gửi lại)', async () => {
    const account = await newUnverifiedAccount(db);
    const first = await issueOnHttp(account.taiKhoanId);
    goTo(61);
    await issueOnHttp(account.taiKhoanId);
    expectErrorResponse(
      await post('verify', { maXacThucId: first.id, otp: first.code }),
      409,
      'OTP_BI_THAY_THE',
    );
    expectErrorResponse(
      await post('reissue', { maXacThucId: first.id }),
      409,
      'OTP_BI_THAY_THE',
    );
  });

  it('sau khi đặt lại mật khẩu trên tài khoản chưa xác minh (N3) → 409 CAN_DANG_KY_LAI', async () => {
    const account = await newUnverifiedAccount(db);
    const { id, code } = await issueOnHttp(account.taiKhoanId);
    const otp = app.get(OtpService, { strict: false });
    await db.transaction(async (manager) => {
      await otp.revokePending(account.taiKhoanId, 'DangKy', { manager });
      await otp.clearRegistrationData(account.taiKhoanId, { manager });
    });
    expectErrorResponse(
      await post('verify', { maXacThucId: id, otp: code }),
      409,
      'CAN_DANG_KY_LAI',
    );
  });

  it('dữ liệu vào sai kiểu bị ValidationPipe chặn → 400 DU_LIEU_KHONG_HOP_LE và không phản chiếu giá trị', async () => {
    const res = await post('verify', { maXacThucId: 5, otp: 482913 });
    const body = expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE');
    expect(body.loi).toBeDefined();
    expect(res.text).not.toContain('482913');
  });
});

describe('OTP không có trong phản hồi và log (DK-39, DK-40, SE-04; OTP-E003)', () => {
  it('toàn bộ thân phản hồi (thành công lẫn lỗi) và đầu ra log: không chứa mã thật nào', async () => {
    const account = await newUnverifiedAccount(db);
    const first = await issueOnHttp(account.taiKhoanId);
    const texts: string[] = [];
    const keep = (res: request.Response): void => {
      texts.push(res.text);
    };

    keep(
      await post('verify', {
        maXacThucId: first.id,
        otp: wrongCodeFor(first.code),
      }),
    );
    keep(
      await post('issue', { taiKhoanId: account.taiKhoanId, loai: 'DangKy' }),
    ); // quá sớm
    goTo(61);
    const second = await issueOnHttp(account.taiKhoanId);
    keep(await post('verify', { maXacThucId: first.id, otp: first.code })); // bị thay thế
    keep(await post('verify', { maXacThucId: second.id, otp: second.code })); // đúng
    goTo(61 + 601);
    keep(await post('verify', { maXacThucId: second.id, otp: second.code })); // hết hạn

    const logs = output
      .join('')
      .replace(
        /^\[Nest\] \d+\s+- .*?(?:LOG|WARN|ERROR|DEBUG|VERBOSE|FATAL)\s+/gm,
        '',
      );
    for (const code of [first.code, second.code]) {
      expect(texts.join('\n'), `mã ${code} trong phản hồi`).not.toMatch(
        standalone(code),
      );
      expect(logs, `mã ${code} trong log`).not.toMatch(standalone(code));
    }
    expect(logs).toContain(`Mã OTP ${first.id}`); // thông tin chẩn đoán vẫn còn
  });

  it('controller lỡ trả thẳng IssuedOtp ra HTTP: thân phản hồi chỉ có các trường công khai, không có mã', async () => {
    const account = await newUnverifiedAccount(db);
    const res = await post('issue-raw', {
      taiKhoanId: account.taiKhoanId,
      loai: 'QuenMatKhau',
    });

    expect(res.status).toBe(201);
    expect(Object.keys(res.body as object).sort()).toEqual([
      'hetHanLuc',
      'loai',
      'maXacThucId',
      'taiKhoanId',
    ]);
    expect(res.text).not.toMatch(/"(otp|code|ma|maOtp)"/i);
    expect(mail.attempts).toHaveLength(0); // issue chỉ là pha 1, chưa gửi thư nào
  });
});
