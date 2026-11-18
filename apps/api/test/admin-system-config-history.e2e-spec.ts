import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { NhatKyHanhDong } from '../src/admin/entities/nhat-ky-hanh-dong.entity.js';
import { AdminFixtures } from '../src/admin/testing/admin-fixtures.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { defaultsForStatus } from '../src/common/errors/error-codes.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { resetTables } from '../src/database/testing/test-database.js';

// Lịch sử thay đổi cấu hình qua HTTP thật (admin B6; TRACKING 9A.4 mục 3): CHB6-20…25 (CH-09, CH-19, CH-11).
const ACTOR_EMAIL = 'quan.tri.lich.su@example.test';
const ACTOR_PHONE = '0987654321';

describe('B6 CH-19 — HTTP AppModule/auth/rbac/MySQL thật', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let sessions: SessionService;
  let systemToken: string;
  let branchToken: string;
  let doctorToken: string;
  let receptionistToken: string;
  let patientToken: string;
  let actorId: string;
  let actorHash: string;
  const base = '/admin/system-config';
  const history = `${base}/history`;
  const requiredSeven = {
    soLichHenToiDaMoiHoSo: 3,
    soLanTuDoiLichToiDa: 2,
    checkInTruocPhut: 30,
    checkInSauPhut: 15,
    soNgayBaoTruocDoiGioLam: 3,
    trongSoW1: 0.6,
    trongSoW2: 0.4,
  };

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
    const system = await fixtures.admin(undefined, {
      hoTen: 'Lê Quản Trị',
      email: ACTOR_EMAIL,
      soDienThoai: ACTOR_PHONE,
    });
    actorId = system.account.taiKhoanId;
    actorHash = system.account.matKhauBam ?? '';
    systemToken = await tokenOf(actorId);
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

  const get = (path: string, token?: string) => {
    const call = request(app.getHttpServer()).get(path);
    return token ? call.auth(token, { type: 'bearer' }) : call;
  };
  const put = (input: object) =>
    request(app.getHttpServer())
      .put(base)
      .send(input)
      .auth(systemToken, { type: 'bearer' });
  const logCount = () => db.getRepository(NhatKyHanhDong).count();
  // Dòng mồi chèn thẳng (bỏ qua AuditService): hành động khác nhưng cùng đối tượng, và loại đối tượng khác
  const insertDecoy = (action: string, target: string, targetId: string) =>
    db.query(
      `INSERT INTO nhat_ky_hanh_dong
         (tai_khoan_id, chi_nhanh_id, hanh_dong, loai_doi_tuong, ma_doi_tuong, thoi_diem, ket_qua, chi_tiet_thay_doi)
       VALUES (?, NULL, ?, ?, ?, NOW(), 'ThanhCong', JSON_OBJECT('x', 1))`,
      [actorId, action, target, targetId],
    );
  // Hai lần lưu thật qua HTTP: tạo lần đầu rồi đổi một tham số
  const twoSaves = async () => {
    await put({ lyDo: 'Khởi tạo cấu hình', ...requiredSeven }).expect(200);
    await put({ lyDo: ' Tăng giờ giữ chỗ ', thoiGianGiuCho: 20 }).expect(200);
  };

  it('CHB6-20 (CH-09, CH-19): chỉ Toàn hệ thống đọc được lịch sử; không token 401; Admin Chi nhánh, Bác sĩ, Lễ tân, Bệnh nhân 403', async () => {
    await twoSaves();
    expectErrorResponse(await get(history), 401, 'CHUA_DANG_NHAP');
    for (const token of [
      branchToken,
      doctorToken,
      receptionistToken,
      patientToken,
    ])
      expectErrorResponse(await get(history, token), 403, 'KHONG_DU_QUYEN');
    // Các lần bị từ chối không đổi gì
    expect(await logCount()).toBe(2);
    expect((await get(history, systemToken)).status).toBe(200);
  });

  it('CHB6-21 (CH-19, CH-11, CH-18): lịch sử qua PUT thật rồi GET history: mới → cũ, hợp đồng khoá chặt, số là số JSON, mặc định page 1 và pageSize 20', async () => {
    await twoSaves();
    const res = await get(history, systemToken).expect(200);
    const body = res.body as {
      items: {
        id: string;
        thoiDiem: string;
        nguoiThucHien: string;
        lyDo: string;
        thayDoi: { khoa: string; truoc: unknown; sau: unknown }[];
      }[];
      total: number;
      page: number;
      pageSize: number;
    };
    expect(Object.keys(body).sort()).toStrictEqual([
      'items',
      'page',
      'pageSize',
      'total',
    ]);
    expect(body).toMatchObject({ total: 2, page: 1, pageSize: 20 });
    expect(body.items).toHaveLength(2);
    for (const item of body.items) {
      expect(Object.keys(item).sort()).toStrictEqual([
        'id',
        'lyDo',
        'nguoiThucHien',
        'thayDoi',
        'thoiDiem',
      ]);
      expect(typeof item.id).toBe('string');
      expect(item.nguoiThucHien).toBe('Lê Quản Trị');
      expect(item.thoiDiem).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
      for (const change of item.thayDoi)
        expect(Object.keys(change).sort()).toStrictEqual([
          'khoa',
          'sau',
          'truoc',
        ]);
    }
    const [newer, older] = body.items;
    // Mới nhất trước (lý do đã cắt khoảng trắng đầu cuối ở B5)
    expect(newer?.lyDo).toBe('Tăng giờ giữ chỗ');
    expect(older?.lyDo).toBe('Khởi tạo cấu hình');
    expect(newer?.thayDoi).toStrictEqual([
      { khoa: 'thoiGianGiuCho', truoc: 15, sau: 20 },
    ]);
    // Tạo lần đầu: đủ 12 mục, truoc null, trọng số là SỐ JSON (0.6), nhắc lịch là mảng số
    expect(older?.thayDoi).toHaveLength(12);
    expect(older?.thayDoi.every((change) => change.truoc === null)).toBe(true);
    const w1 = older?.thayDoi.find((change) => change.khoa === 'trongSoW1');
    expect(w1?.sau).toBe(0.6);
    expect(typeof w1?.sau).toBe('number');
    expect(
      older?.thayDoi.find((change) => change.khoa === 'thoiDiemNhacLich')?.sau,
    ).toStrictEqual([72, 24, 2]);
  });

  it('CHB6-22: KHÔNG lộ email, SĐT, băm mật khẩu hay mã tài khoản của người thực hiện (quét cả chuỗi JSON phản hồi)', async () => {
    await twoSaves();
    // Chứng minh bản quét có hiệu lực: băm của người thực hiện có thật trong DB
    expect(actorHash).not.toBe('');
    const res = await get(history, systemToken).expect(200);
    const text = res.text;
    for (const secret of [ACTOR_EMAIL, 'example.test', ACTOR_PHONE, actorHash])
      expect(text).not.toContain(secret);
    for (const key of [
      'email',
      'matKhauBam',
      'taiKhoanId',
      'soDienThoai',
      'hanhDong',
      'ketQua',
      'chiNhanhId',
      'chiTietThayDoi',
    ])
      expect(text).not.toContain(`"${key}"`);
    expect(text).toContain('Lê Quản Trị'); // họ tên là thứ DUY NHẤT về người thực hiện
  });

  it('CHB6-23 (CH-19, Q42): biên phân trang qua HTTP: sai ⇒ 400 DU_LIEU_KHONG_HOP_LE có loi[]; cỡ 1 và 100 ⇒ 200; vượt cuối rỗng; page cực lớn và khoá query lạ bị chặn', async () => {
    await twoSaves();
    for (const [param, value] of [
      ['pageSize', '0'],
      ['pageSize', '-1'],
      ['pageSize', '101'],
      ['pageSize', 'abc'],
      ['page', '0'],
      ['page', '-1'],
      ['page', '1.5'],
    ] as const) {
      const body = expectErrorResponse(
        await get(`${history}?${param}=${value}`, systemToken),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
      expect(
        body.loi?.some((error) => error.truong === param),
        `${param}=${value}`,
      ).toBe(true);
    }
    const one = await get(`${history}?pageSize=1`, systemToken).expect(200);
    expect(one.body).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect((one.body as { items: unknown[] }).items).toHaveLength(1);
    const hundred = await get(`${history}?pageSize=100`, systemToken).expect(
      200,
    );
    expect((hundred.body as { items: unknown[] }).items).toHaveLength(2);
    const beyond = await get(`${history}?page=99`, systemToken).expect(200);
    expect(beyond.body).toStrictEqual({
      items: [],
      total: 2,
      page: 99,
      pageSize: 20,
    });
    // page cực lớn: offset vượt số nguyên an toàn ⇒ cùng mã lỗi, cùng chữ với bốn danh sách admin có sẵn
    const huge = expectErrorResponse(
      await get(`${history}?page=1000000000000000000`, systemToken),
      400,
      'DU_LIEU_KHONG_HOP_LE',
    );
    expect(huge.loi).toStrictEqual([
      { truong: 'page', ma: 'TRANG_KHONG_HOP_LE' },
    ]);
    expect(huge.thongBao).toBe(defaultsForStatus(400).thongBao);
    // Không có bộ lọc ngầm (Q37 tối thiểu): khoá lạ bị ValidationPipe từ chối
    for (const query of [
      'q=abc',
      'hanhDong=OverrideLichHen',
      'tuNgay=2026-01-01',
    ]) {
      const body = expectErrorResponse(
        await get(`${history}?${query}`, systemToken),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
      expect(body.loi?.[0]?.ma).toBe('TRUONG_KHONG_DUOC_PHEP');
    }
  });

  it('CHB6-24: chưa cấu hình (chưa có dòng nào) ⇒ 200 danh sách rỗng, không phải HE_THONG_CHUA_CAU_HINH', async () => {
    const res = await get(history, systemToken).expect(200);
    expect(res.body).toStrictEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
  });

  it('CHB6-25: nhật ký loại khác không lọt ra, và GET history không đổi số dòng nhật ký', async () => {
    await twoSaves();
    await insertDecoy('DoiQuyen', 'cau_hinh_he_thong', '1');
    await insertDecoy('OverrideLichHen', 'lich_hen', '1');
    await insertDecoy('DoiChiNhanhBacSi', 'tai_khoan', '7');
    const before = await logCount();
    expect(before).toBe(5);
    for (let index = 0; index < 3; index += 1) {
      const res = await get(history, systemToken).expect(200);
      const body = res.body as { items: { lyDo: string }[]; total: number };
      expect(body.total).toBe(2);
      expect(body.items.map((item) => item.lyDo)).toStrictEqual([
        'Tăng giờ giữ chỗ',
        'Khởi tạo cấu hình',
      ]);
    }
    expect(await logCount()).toBe(before);
  });
});
