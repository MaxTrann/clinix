import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { CauHinhHeThong } from '../src/admin/entities/cau-hinh-he-thong.entity.js';
import { NhatKyHanhDong } from '../src/admin/entities/nhat-ky-hanh-dong.entity.js';
import { AdminFixtures } from '../src/admin/testing/admin-fixtures.js';
import { AuditError } from '../src/audit/audit-error.js';
import { AuditService } from '../src/audit/audit.service.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { CONFIG_DEMO } from '../src/database/seeds/catalog-data.js';
import { resetTables } from '../src/database/testing/test-database.js';

describe('B5 CH — HTTP AppModule/auth/rbac/audit/MySQL thật', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let sessions: SessionService;
  let systemToken: string;
  let branchToken: string;
  let doctorToken: string;
  let receptionistToken: string;
  let patientToken: string;
  const base = '/admin/system-config';
  const requiredSeven = {
    soLichHenToiDaMoiHoSo: 3,
    soLanTuDoiLichToiDa: 2,
    checkInTruocPhut: 30,
    checkInSauPhut: 15,
    soNgayBaoTruocDoiGioLam: 3,
    trongSoW1: 0.6,
    trongSoW2: 0.4,
  };
  const configKeys = [
    'chuaCauHinh',
    'thoiGianGiuCho',
    'thoiDiemNhacLich',
    'soLichHenToiDaMoiHoSo',
    'soLanTuDoiLichToiDa',
    'checkInTruocPhut',
    'checkInSauPhut',
    'thoiHanPhanHoiLoiMoi',
    'soMucChoToiDa',
    'nguongNoShow',
    'soNgayBaoTruocDoiGioLam',
    'trongSoW1',
    'trongSoW2',
  ];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    sessions = app.get(SessionService);
  });

  beforeEach(async () => {
    await resetTables(db);
    const fixtures = new AdminFixtures(db);
    const branch = await fixtures.branch();
    const tokenOf = async (taiKhoanId: string) =>
      (await sessions.create(taiKhoanId)).accessToken;
    systemToken = await tokenOf((await fixtures.admin()).account.taiKhoanId);
    branchToken = await tokenOf(
      (await fixtures.admin(branch)).account.taiKhoanId,
    );
    doctorToken = await tokenOf(
      (await fixtures.doctor(branch)).account.taiKhoanId,
    );
    receptionistToken = await tokenOf(
      (await fixtures.receptionist(branch)).account.taiKhoanId,
    );
    patientToken = await tokenOf((await fixtures.patient()).account.taiKhoanId);
  });

  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => app?.close());

  const get = (token?: string) => {
    const call = request(app.getHttpServer()).get(base);
    return token ? call.auth(token, { type: 'bearer' }) : call;
  };
  const put = (input: object, token?: string) => {
    const call = request(app.getHttpServer()).put(base).send(input);
    return token ? call.auth(token, { type: 'bearer' }) : call;
  };
  const seed = () => db.getRepository(CauHinhHeThong).insert(CONFIG_DEMO);
  const logCount = () => db.getRepository(NhatKyHanhDong).count();

  it('CH-09: chỉ Toàn hệ thống được GET và PUT; Admin Chi nhánh và vai trò khác nhận 403, chưa đăng nhập 401', async () => {
    await seed();
    expectErrorResponse(await get(), 401, 'CHUA_DANG_NHAP');
    expectErrorResponse(
      await put({ lyDo: 'x', thoiGianGiuCho: 20 }),
      401,
      'CHUA_DANG_NHAP',
    );
    for (const token of [
      branchToken,
      doctorToken,
      receptionistToken,
      patientToken,
    ]) {
      expectErrorResponse(await get(token), 403, 'KHONG_DU_QUYEN');
      expectErrorResponse(
        await put({ lyDo: 'Thử', thoiGianGiuCho: 20 }, token),
        403,
        'KHONG_DU_QUYEN',
      );
    }
    // Các lần bị từ chối không đổi gì
    expect(
      (await db.getRepository(CauHinhHeThong).findOneByOrFail({ id: 1 }))
        .thoiGianGiuCho,
    ).toBe(15);
    expect(await logCount()).toBe(0);
    expect((await get(systemToken)).status).toBe(200);
  });

  it('CH-10: GET chưa cấu hình ⇒ 200, chuaCauHinh = true và mười hai giá trị null', async () => {
    const res = await get(systemToken).expect(200);
    expect(Object.keys(res.body as object).sort()).toEqual(
      [...configKeys].sort(),
    );
    expect(res.body).toMatchObject({ chuaCauHinh: true });
    expect(
      Object.entries(res.body as object).filter(
        ([key, value]) => key !== 'chuaCauHinh' && value !== null,
      ),
    ).toEqual([]);
  });

  it('CH-11/CH-01: PUT tạo lần đầu (200) rồi GET khớp, không có id; PUT đổi một tham số (200) ghi đúng một dòng nhật ký nữa', async () => {
    const created = await put(
      { lyDo: 'Cấu hình lần đầu', ...requiredSeven },
      systemToken,
    ).expect(200);
    expect(created.body).toEqual({
      chuaCauHinh: false,
      thoiGianGiuCho: 15,
      thoiDiemNhacLich: [72, 24, 2],
      soLichHenToiDaMoiHoSo: 3,
      soLanTuDoiLichToiDa: 2,
      checkInTruocPhut: 30,
      checkInSauPhut: 15,
      thoiHanPhanHoiLoiMoi: 60,
      soMucChoToiDa: 2,
      nguongNoShow: 3,
      soNgayBaoTruocDoiGioLam: 3,
      trongSoW1: 0.6,
      trongSoW2: 0.4,
    });
    expect((await get(systemToken).expect(200)).body).toEqual(created.body);
    expect(await logCount()).toBe(1);

    const changed = await put(
      { lyDo: ' Tăng giờ giữ chỗ ', thoiGianGiuCho: 20 },
      systemToken,
    ).expect(200);
    expect(changed.body).toMatchObject({
      chuaCauHinh: false,
      thoiGianGiuCho: 20,
    });
    expect((await get(systemToken).expect(200)).body).toEqual(changed.body);
    const [, second] = await db
      .getRepository(NhatKyHanhDong)
      .find({ order: { nhatKyHanhDongId: 'ASC' } });
    expect(second!.chiTietThayDoi).toEqual({
      truoc: { thoi_gian_giu_cho: 15 },
      sau: { thoi_gian_giu_cho: 20 },
      ly_do: 'Tăng giờ giữ chỗ',
    });
  });

  it('CH-03: không đổi gì ⇒ 400 KHONG_CO_THAY_DOI, không nhật ký', async () => {
    await seed();
    const res = await put({ lyDo: 'Thử', thoiGianGiuCho: 15 }, systemToken);
    const body = expectErrorResponse(res, 400, 'KHONG_CO_THAY_DOI');
    expect(body.thongBao).toBe('Không có thay đổi nào để lưu.');
    expect(await logCount()).toBe(0);
  });

  it('CH-04/05/06/21 và CHB5-01: sai dữ liệu ⇒ 400 DU_LIEU_KHONG_HOP_LE kèm loi[{truong, ma}] đúng ô; cấu hình giữ nguyên', async () => {
    await seed();
    const cases: [string, object, { truong: string; ma: string }[]][] = [
      [
        'thiếu lý do',
        { thoiGianGiuCho: 20 },
        [{ truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' }],
      ],
      [
        'lý do trắng',
        { lyDo: '   ', thoiGianGiuCho: 20 },
        [{ truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' }],
      ],
      [
        'lý do 501 ký tự',
        { lyDo: 'đ'.repeat(501), thoiGianGiuCho: 20 },
        [{ truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' }],
      ],
      [
        'giữ chỗ 0',
        { lyDo: 'x', thoiGianGiuCho: 0 },
        [{ truong: 'thoiGianGiuCho', ma: 'CAU_HINH_GIA_TRI_KHONG_HOP_LE' }],
      ],
      [
        'số ngày báo trước 0 (DB cho, service không)',
        { lyDo: 'x', soNgayBaoTruocDoiGioLam: 0 },
        [
          {
            truong: 'soNgayBaoTruocDoiGioLam',
            ma: 'CAU_HINH_GIA_TRI_KHONG_HOP_LE',
          },
        ],
      ],
      [
        'số ngày báo trước 61',
        { lyDo: 'x', soNgayBaoTruocDoiGioLam: 61 },
        [
          {
            truong: 'soNgayBaoTruocDoiGioLam',
            ma: 'CAU_HINH_GIA_TRI_KHONG_HOP_LE',
          },
        ],
      ],
      [
        'chuỗi số',
        { lyDo: 'x', nguongNoShow: '3' },
        [{ truong: 'nguongNoShow', ma: 'CAU_HINH_GIA_TRI_KHONG_HOP_LE' }],
      ],
      [
        'nhắc lịch trùng',
        { lyDo: 'x', thoiDiemNhacLich: [24, 24] },
        [{ truong: 'thoiDiemNhacLich', ma: 'CAU_HINH_GIA_TRI_KHONG_HOP_LE' }],
      ],
      [
        'trọng số ba chữ số',
        { lyDo: 'x', trongSoW1: 0.605 },
        [{ truong: 'trongSoW1', ma: 'CAU_HINH_GIA_TRI_KHONG_HOP_LE' }],
      ],
      [
        'trường lạ id',
        { lyDo: 'x', id: 2 },
        [{ truong: 'id', ma: 'TRUONG_KHONG_DUOC_PHEP' }],
      ],
    ];
    for (const [label, input, loi] of cases) {
      const body = expectErrorResponse(
        await put(input, systemToken),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
      expect(body.loi, label).toEqual(loi);
    }
    expect(
      await db.getRepository(CauHinhHeThong).findOneByOrFail({ id: 1 }),
    ).toEqual(CONFIG_DEMO);
    expect(await logCount()).toBe(0);
  });

  it('CH-08 và CHB5-04: gửi một nửa cặp trọng số làm tổng lệch ⇒ 400 TONG_TRONG_SO_KHAC_1 ở cả hai ô; đổi cả hai về tổng 1,00 thì lưu', async () => {
    await seed();
    const body = expectErrorResponse(
      await put({ lyDo: 'x', trongSoW1: 0.7 }, systemToken),
      400,
      'DU_LIEU_KHONG_HOP_LE',
    );
    expect(body.loi).toEqual([
      { truong: 'trongSoW1', ma: 'TONG_TRONG_SO_KHAC_1' },
      { truong: 'trongSoW2', ma: 'TONG_TRONG_SO_KHAC_1' },
    ]);
    await put(
      { lyDo: 'x', trongSoW1: 0.7, trongSoW2: 0.3 },
      systemToken,
    ).expect(200);
    expect((await get(systemToken)).body).toMatchObject({
      trongSoW1: 0.7,
      trongSoW2: 0.3,
    });
  });

  it('CH-12: tạo lần đầu thiếu cột bắt buộc ⇒ 400 liệt kê cột thiếu (không lộ lỗi MySQL), chưa có dòng nào', async () => {
    const body = expectErrorResponse(
      await put(
        {
          lyDo: 'Lần đầu',
          soLichHenToiDaMoiHoSo: 3,
          trongSoW1: 0.6,
          trongSoW2: 0.4,
        },
        systemToken,
      ),
      400,
      'DU_LIEU_KHONG_HOP_LE',
    );
    expect(body.loi?.map((item) => item.truong)).toEqual([
      'soLanTuDoiLichToiDa',
      'checkInTruocPhut',
      'checkInSauPhut',
      'soNgayBaoTruocDoiGioLam',
    ]);
    expect(
      body.loi?.every((item) => item.ma === 'CAU_HINH_THIEU_GIA_TRI'),
    ).toBe(true);
    expect(await db.getRepository(CauHinhHeThong).count()).toBe(0);
    expect(JSON.stringify(body)).not.toMatch(
      /1364|ER_NO_DEFAULT|doesn't have a default/i,
    );
  });

  it('CHB5-12: dòng cũ có giá trị ngoài miền service: GET trả nguyên; sửa tham số khác được; gửi lại đúng giá trị ngoài miền ⇒ 400', async () => {
    await db
      .getRepository(CauHinhHeThong)
      .insert({ ...CONFIG_DEMO, thoiGianGiuCho: 120 });
    expect((await get(systemToken).expect(200)).body).toMatchObject({
      thoiGianGiuCho: 120,
    });
    await put({ lyDo: 'Đổi ngưỡng', nguongNoShow: 5 }, systemToken).expect(200);
    expect((await get(systemToken)).body).toMatchObject({
      thoiGianGiuCho: 120,
      nguongNoShow: 5,
    });
    const body = expectErrorResponse(
      await put({ lyDo: 'Gửi lại', thoiGianGiuCho: 120 }, systemToken),
      400,
      'DU_LIEU_KHONG_HOP_LE',
    );
    expect(body.loi).toEqual([
      { truong: 'thoiGianGiuCho', ma: 'CAU_HINH_GIA_TRI_KHONG_HOP_LE' },
    ]);
  });

  it('CH-14: lỗi ghi nhật ký ⇒ 500 LOI_HE_THONG (có requestId, không lộ SQL), cấu hình giữ nguyên; gửi lại thành công', async () => {
    await seed();
    vi.spyOn(AuditService.prototype, 'record').mockRejectedValueOnce(
      new AuditError('AUDIT_WRITE_FAILED'),
    );
    const res = await put({ lyDo: 'Thử', thoiGianGiuCho: 20 }, systemToken);
    const body = expectErrorResponse(res, 500, 'LOI_HE_THONG');
    expect(JSON.stringify(body)).not.toMatch(
      /INSERT|nhat_ky_hanh_dong|AUDIT_WRITE_FAILED/,
    );
    expect(
      (await db.getRepository(CauHinhHeThong).findOneByOrFail({ id: 1 }))
        .thoiGianGiuCho,
    ).toBe(15);
    expect(await logCount()).toBe(0);
    await put({ lyDo: 'Thử lại', thoiGianGiuCho: 20 }, systemToken).expect(200);
    expect(await logCount()).toBe(1);
  });
});
