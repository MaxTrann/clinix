import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants.js';
import { MetadataScanner, ModulesContainer } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AccountController } from '../src/admin/accounts/account.controller.js';
import {
  SENTINELS,
  buildAccountWorld,
  type AccountWorld,
} from '../src/admin/accounts/testing/account-world.js';
import { findSecretLeaks } from '../src/admin/accounts/testing/secret-leak.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { SessionService } from '../src/auth/session/session.service.js';
import type { ErrorBody } from '../src/common/errors/app.exception.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { resetTables } from '../src/database/testing/test-database.js';
import { auditAdminControllers } from '../src/rbac/testing/admin-route-audit.js';

type Item = Record<string, unknown> & { taiKhoanId: string };
type Pair = { account: { taiKhoanId: string } };

const idOf = (value: Pair | { taiKhoanId: string }): string =>
  'account' in value ? value.account.taiKhoanId : value.taiKhoanId;
const sortedIds = (items: Item[]) => items.map((i) => i.taiKhoanId).sort();
const sortedOf = (...values: (Pair | { taiKhoanId: string })[]) =>
  values.map(idOf).sort();

describe('B17 TK/PQ — HTTP AppModule + Auth + C1 + MySQL thật', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let sessions: SessionService;
  let w: AccountWorld;
  const token: Record<
    'system' | 'adminA' | 'adminB' | 'patient' | 'doctor' | 'receptionist',
    string
  > = {
    system: '',
    adminA: '',
    adminB: '',
    patient: '',
    doctor: '',
    receptionist: '',
  };
  const base = '/admin/accounts';

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    sessions = app.get(SessionService);
    await resetTables(db);
    w = await buildAccountWorld(db);
    const issue = async (pair: Pair) =>
      (await sessions.create(pair.account.taiKhoanId)).accessToken;
    token.system = await issue(w.sysAdmin);
    token.adminA = await issue(w.adminA);
    token.adminB = await issue(w.adminB);
    token.patient = await issue(w.onlyA);
    token.doctor = await issue(w.doctorA);
    token.receptionist = await issue(w.receptionistA);
  });
  afterAll(async () => app?.close());

  const list = (who: string | null = token.system, query?: string | object) => {
    const call = request(app.getHttpServer()).get(base);
    if (who !== null) call.auth(who, { type: 'bearer' });
    if (query !== undefined) call.query(query);
    return call;
  };
  const detail = (id: string, who: string | null = token.system) => {
    const call = request(app.getHttpServer()).get(`${base}/${id}`);
    if (who !== null) call.auth(who, { type: 'bearer' });
    return call;
  };
  const bigPage = { pageSize: 100 };

  it('TKB17-30 (TK-23, PQ-01, PQ-02) khách và token hỏng ⇒ 401; Bệnh nhân, Bác sĩ, Lễ tân ⇒ 403, cả danh sách lẫn chi tiết', async () => {
    const id = idOf(w.onlyA);
    expectErrorResponse(await list(null), 401, 'CHUA_DANG_NHAP');
    expectErrorResponse(await detail(id, null), 401, 'CHUA_DANG_NHAP');
    // Token có nhưng hỏng: mã riêng của guard auth (khác "chưa gửi token").
    expectErrorResponse(
      await list('khong.phai.token'),
      401,
      'TOKEN_KHONG_HOP_LE',
    );
    expectErrorResponse(
      await detail(id, 'khong.phai.token'),
      401,
      'TOKEN_KHONG_HOP_LE',
    );
    for (const who of [token.patient, token.doctor, token.receptionist]) {
      const denied = await list(who, bigPage);
      expectErrorResponse(denied, 403, 'KHONG_DU_QUYEN');
      expectErrorResponse(await detail(id, who), 403, 'KHONG_DU_QUYEN');
      // Thân lỗi không mang dữ liệu tài khoản nào.
      expect(Object.keys(denied.body as object).sort()).toEqual([
        'maLoi',
        'thongBao',
      ]);
    }
  });

  it('TKB17-31 (TK-01, PQ-04) Toàn hệ thống: 200, hình dạng khoá chặt từng loại; chi tiết = dòng của danh sách', async () => {
    const page = (await list(token.system, bigPage).expect(200)).body as {
      items: Item[];
      total: number;
      page: number;
      pageSize: number;
    };
    expect(page).toMatchObject({ total: w.all.length, page: 1, pageSize: 100 });
    expect(sortedIds(page.items)).toEqual(sortedOf(...w.all));
    const keyCount: Record<string, number> = {
      BenhNhan: 13,
      BacSi: 11,
      LeTan: 11,
      QuanTriVien: 12,
    };
    for (const item of page.items) {
      expect(Object.keys(item)).toHaveLength(
        keyCount[item.loaiTaiKhoan as string]!,
      );
      expect(typeof item.thoiDiemTao).toBe('string');
    }
    for (const item of page.items) {
      const one = (await detail(item.taiKhoanId).expect(200)).body as Item;
      const { lienKetKichHoat, ...rest } = one;
      expect(rest).toEqual(item);
      expect(lienKetKichHoat === undefined).toBe(
        item.loaiTaiKhoan === 'BenhNhan',
      );
    }
  });

  it('TKB17-32 (TK-02, PQ-05, PQ-08) Chi nhánh A: chỉ trong phạm vi, total khớp, không Quản trị viên', async () => {
    const page = (await list(token.adminA, bigPage).expect(200)).body as {
      items: Item[];
      total: number;
    };
    expect(sortedIds(page.items)).toEqual(
      sortedOf(
        w.doctorA,
        w.pendingDoctorA,
        w.receptionistA,
        w.onlyA,
        w.both,
        w.manyA,
        w.relativeA,
        w.lockedA,
      ),
    );
    expect(page.total).toBe(8);
    expect(page.items.some((i) => i.loaiTaiKhoan === 'QuanTriVien')).toBe(
      false,
    );
    const other = (await list(token.adminB, bigPage).expect(200)).body as {
      items: Item[];
    };
    expect(sortedIds(other.items)).toEqual(
      sortedOf(w.doctorB, w.receptionistB, w.onlyB, w.both),
    );
  });

  it('TKB17-32 (PQ-07) Chi nhánh gửi chiNhanhId của chi nhánh khác ⇒ kết quả BẰNG danh sách của chính mình', async () => {
    const own = (await list(token.adminA, bigPage).expect(200)).body as {
      items: Item[];
      total: number;
    };
    const forged = (
      await list(token.adminA, {
        ...bigPage,
        chiNhanhId: w.branchB.chiNhanhId,
      }).expect(200)
    ).body as { items: Item[]; total: number };
    expect(sortedIds(forged.items)).toEqual(sortedIds(own.items));
    expect(forged.total).toBe(own.total);
  });

  it('TKB17-32 (Q26) Chi nhánh dùng bộ lọc khoaNoShow (true hay false) ⇒ 403 KHONG_DU_QUYEN; Toàn hệ thống được dùng', async () => {
    for (const value of ['true', 'false'])
      expectErrorResponse(
        await list(token.adminA, { khoaNoShow: value }),
        403,
        'KHONG_DU_QUYEN',
      );
    const locked = (
      await list(token.system, { khoaNoShow: 'true' }).expect(200)
    ).body as { items: Item[] };
    expect(sortedIds(locked.items)).toEqual(sortedOf(w.lockedA));
  });

  it('TKB17-33 (TK-03, PQ-06, PQ-13, Q40) ngoài phạm vi và không tồn tại ⇒ CÙNG 404, CÙNG thân, CÙNG kiểu nội dung', async () => {
    const missing = await detail('9223372036854775807', token.adminA);
    const reference = expectErrorResponse(missing, 404, 'KHONG_TIM_THAY');
    const outside = [
      w.doctorB,
      w.receptionistB,
      w.onlyB,
      w.none,
      w.adminB,
      w.adminA, // chính người gọi: Quản trị viên nằm ngoài tầm nhìn của Admin Chi nhánh (Q27)
      w.sysAdmin,
      w.unverified,
      w.brokenDoctor,
    ].map(idOf);
    for (const id of [...outside, '999999']) {
      const response = await detail(id, token.adminA);
      expectErrorResponse(response, 404, 'KHONG_TIM_THAY');
      expect(response.body).toEqual(reference);
      expect(response.headers['content-type']).toBe(
        missing.headers['content-type'],
      );
      expect(response.headers['content-length']).toBe(
        missing.headers['content-length'],
      );
    }
    // Toàn hệ thống vẫn thấy chính các tài khoản đó (trừ id thật sự không có).
    for (const id of outside) await detail(id, token.system).expect(200);
    expectErrorResponse(await detail('999999'), 404, 'KHONG_TIM_THAY');
  });

  it('TKB17-34 (TK-04) chi tiết Bệnh nhân: Chi nhánh đúng 8 khoá và KHÔNG có địa chỉ; Toàn hệ thống 13 khoá', async () => {
    const asBranch = await detail(idOf(w.onlyA), token.adminA).expect(200);
    expect(Object.keys(asBranch.body as object).sort()).toEqual(
      [
        'email',
        'gioiTinh',
        'hoTen',
        'loaiTaiKhoan',
        'ngaySinh',
        'soDienThoai',
        'taiKhoanId',
        'trangThai',
      ].sort(),
    );
    expect(asBranch.text).not.toContain('Địa chỉ của');
    expect(asBranch.body).toMatchObject({
      ngaySinh: '1990-05-17',
      gioiTinh: 'Nam',
    });
    const asSystem = await detail(idOf(w.onlyA)).expect(200);
    expect(Object.keys(asSystem.body as object)).toHaveLength(13);
    expect(asSystem.body).toMatchObject({
      diaChi: 'Địa chỉ của Bệnh nhân chỉ A',
    });
  });

  it('TKB17-35 (TK-05, SE-A2, SE-A10) đầu vào sai ⇒ 400 DU_LIEU_KHONG_HOP_LE kèm loi[] đúng mã; biên hợp lệ ⇒ 200', async () => {
    const invalid: [string, string, string][] = [
      ['page=0', 'page', 'MIN'],
      ['page=-1', 'page', 'MIN'],
      ['page=1.5', 'page', 'IS_INT'],
      ['page=abc', 'page', 'IS_INT'],
      ['pageSize=0', 'pageSize', 'MIN'],
      ['pageSize=101', 'pageSize', 'MAX'],
      ['pageSize=-1', 'pageSize', 'MIN'],
      ['pageSize=abc', 'pageSize', 'IS_INT'],
      ['vaiTro=Admin', 'vaiTro', 'VAI_TRO_KHONG_HOP_LE'],
      ['vaiTro=BacSi&vaiTro=BacSi', 'vaiTro', 'VAI_TRO_KHONG_HOP_LE'],
      // Bộ phân tích query không lồng: `vaiTro[a]` là một tên tham số lạ, bị whitelist từ chối.
      ['vaiTro[a]=b', 'vaiTro[a]', 'TRUONG_KHONG_DUOC_PHEP'],
      ['trangThai=x', 'trangThai', 'TRANG_THAI_KHONG_HOP_LE'],
      ['khoaNoShow=1', 'khoaNoShow', 'KHOA_NO_SHOW_KHONG_HOP_LE'],
      ['chiNhanhId=abc', 'chiNhanhId', 'MA_CHI_NHANH_KHONG_HOP_LE'],
      [`q=${'a'.repeat(201)}`, 'q', 'TU_KHOA_QUA_DAI'],
      ['sort=ho_ten', 'sort', 'TRUONG_KHONG_DUOC_PHEP'],
      ['matKhauBam=x', 'matKhauBam', 'TRUONG_KHONG_DUOC_PHEP'],
    ];
    for (const [queryString, field, code] of invalid) {
      const body = expectErrorResponse(
        await list(token.system, queryString),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
      expect(body.loi, queryString).toContainEqual({ truong: field, ma: code });
    }
    for (const queryString of ['pageSize=1', 'pageSize=100', 'page=1']) {
      await list(token.system, queryString).expect(200);
    }
    const one = (await list(token.system, 'pageSize=1').expect(200)).body as {
      items: Item[];
      total: number;
    };
    expect(one.items).toHaveLength(1);
    expect(one.total).toBe(w.all.length);
    // Trang vượt: 200, rỗng, total giữ nguyên
    const beyond = (await list(token.system, 'page=999&pageSize=5').expect(200))
      .body;
    expect(beyond).toMatchObject({
      items: [],
      total: w.all.length,
      page: 999,
      pageSize: 5,
    });
    // vaiTro lặp tham số: nhiều giá trị
    const staff = (
      await list(token.system, 'vaiTro=BacSi&vaiTro=LeTan&pageSize=100').expect(
        200,
      )
    ).body as { items: Item[] };
    expect(sortedIds(staff.items)).toEqual(
      sortedOf(
        w.doctorA,
        w.pendingDoctorA,
        w.doctorB,
        w.brokenDoctor,
        w.receptionistA,
        w.receptionistB,
      ),
    );
  });

  it('TKB17-35 id sai dạng ⇒ 400 MA_TAI_KHOAN_KHONG_HOP_LE (không phụ thuộc phạm vi)', async () => {
    for (const id of ['abc', '0', '-1', '01', '1e3', '9223372036854775808']) {
      for (const who of [token.system, token.adminA]) {
        const body = expectErrorResponse(
          await detail(id, who),
          400,
          'DU_LIEU_KHONG_HOP_LE',
        );
        expect(body.loi).toContainEqual({
          truong: 'id',
          ma: 'MA_TAI_KHOAN_KHONG_HOP_LE',
        });
      }
    }
  });

  it('TKB17-36 (TK-06, SE-A8) q độc hại qua HTTP: 200, không 500, không lọt hàng ngoài phạm vi', async () => {
    for (const q of [
      '%',
      '_',
      '!',
      "'",
      '--',
      '\\',
      "' OR '1'='1",
      '"; DROP TABLE tai_khoan; --',
      "x' UNION SELECT mat_khau_bam FROM tai_khoan -- ",
    ])
      for (const who of [token.system, token.adminA]) {
        const response = await list(who, { q }).expect(200);
        const body = response.body as { items: Item[]; total: number };
        expect(body.items).toEqual([]);
        expect(body.total).toBe(0);
      }
    const rows: { n: string }[] = await db.query(
      'SELECT COUNT(*) AS n FROM tai_khoan',
    );
    expect(Number(rows[0]!.n)).toBe(w.all.length); // không câu nào làm đổi số tài khoản
  });

  it('TKB17-37 (SE-A12, SE-A13) mọi phản hồi của mọi vai, mọi loại, danh sách và chi tiết: không lộ băm, mã, token, phiên; không đặt cookie', async () => {
    for (const who of [token.system, token.adminA, token.adminB]) {
      const response = await list(who, bigPage).expect(200);
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(findSecretLeaks(response.body, SENTINELS)).toEqual([]);
      expect(response.text).not.toMatch(/argon2|mat_?khau|ma_?bam/i);
      for (const item of (response.body as { items: Item[] }).items) {
        const one = await detail(item.taiKhoanId, who).expect(200);
        expect(one.headers['set-cookie']).toBeUndefined();
        expect(findSecretLeaks(one.body, SENTINELS)).toEqual([]);
      }
    }
    // Phản hồi lỗi cũng sạch
    for (const response of [
      await detail('999999'),
      await detail(idOf(w.doctorB), token.adminA),
      await list(token.patient),
    ])
      expect(findSecretLeaks(response.body, SENTINELS)).toEqual([]);
  });

  it('TKB17-38 (PQ-11) controller chỉ có hai route GET, đều có @Roles và @RequireAdminScope (bộ quét không báo lỗi)', () => {
    const scanner = new MetadataScanner();
    const prototype = AccountController.prototype as unknown as Record<
      string,
      unknown
    >;
    const routes = scanner
      .getAllMethodNames(prototype)
      .filter(
        (name) =>
          Reflect.getMetadata(METHOD_METADATA, prototype[name] as object) !==
          undefined,
      );
    expect(routes.sort()).toEqual(['get', 'list']);
    for (const name of routes)
      expect(
        Reflect.getMetadata(METHOD_METADATA, prototype[name] as object),
      ).toBe(RequestMethod.GET);
    expect(auditAdminControllers([AccountController])).toEqual([]);
  });

  it('TKB17-38 (PQ-11) AccountController CÓ TRONG sổ tuyến của module graph (cùng cách admin-scope.e2e-spec lấy controller) và bộ quét duyệt TOÀN BỘ controller admin không báo lỗi', () => {
    const controllers = [...app.get(ModulesContainer).values()].flatMap(
      (module) =>
        [...module.controllers.values()].flatMap((wrapper) =>
          wrapper.metatype ? [wrapper.metatype] : [],
        ),
    );
    expect(controllers.map((item) => item.name)).toContain('AccountController');
    expect(controllers.map((item) => item.name)).toContain('AdminMeController');
    expect(auditAdminControllers(controllers)).toEqual([]);
  });

  it('TKB17-39 (PQ-14) hai Admin Chi nhánh của hai chi nhánh gọi song song, nhiều vòng: mỗi người chỉ thấy phạm vi mình', async () => {
    const expectedA = sortedOf(
      w.doctorA,
      w.pendingDoctorA,
      w.receptionistA,
      w.onlyA,
      w.both,
      w.manyA,
      w.relativeA,
      w.lockedA,
    );
    const expectedB = sortedOf(w.doctorB, w.receptionistB, w.onlyB, w.both);
    for (let round = 0; round < 5; round += 1) {
      const [a, b, ownA, ownB, crossA, crossB] = await Promise.all([
        list(token.adminA, bigPage),
        list(token.adminB, bigPage),
        detail(idOf(w.onlyA), token.adminA),
        detail(idOf(w.onlyB), token.adminB),
        detail(idOf(w.onlyB), token.adminA),
        detail(idOf(w.onlyA), token.adminB),
      ]);
      expect(sortedIds((a.body as { items: Item[] }).items)).toEqual(expectedA);
      expect(sortedIds((b.body as { items: Item[] }).items)).toEqual(expectedB);
      expect(ownA.status).toBe(200);
      expect(ownB.status).toBe(200);
      expectErrorResponse(crossA, 404, 'KHONG_TIM_THAY');
      expectErrorResponse(crossB, 404, 'KHONG_TIM_THAY');
    }
  });

  it('TKB17-40 (PQ-12) tài khoản bị ngưng hoạt động giữa chừng thì token cũ ⇒ 401 ngay (guard auth, không phải việc của B17)', async () => {
    const extra = await sessions.create(idOf(w.sysAdmin));
    await list(extra.accessToken, bigPage).expect(200);
    await db.query(
      "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
      [idOf(w.sysAdmin)],
    );
    const denied = await list(extra.accessToken, bigPage);
    expect(denied.status).toBe(401);
    expect((denied.body as ErrorBody).maLoi).toBe('PHIEN_HET_HIEU_LUC');
    await db.query(
      "UPDATE tai_khoan SET trang_thai = 'DangHoatDong' WHERE tai_khoan_id = ?",
      [idOf(w.sysAdmin)],
    );
  });
});
