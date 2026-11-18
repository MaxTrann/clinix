import request from 'supertest';
import { vi } from 'vitest';
import { BacSi } from '../src/admin/entities/bac-si.entity.js';
import { LeTan } from '../src/admin/entities/le-tan.entity.js';
import { NhatKyHanhDong } from '../src/admin/entities/nhat-ky-hanh-dong.entity.js';
import { QuanTriVien } from '../src/admin/entities/quan-tri-vien.entity.js';
import { parseActivationMail } from '../src/admin/staff-activation/testing/activation-link-fixtures.js';
import { AdminFixtures } from '../src/admin/testing/admin-fixtures.js';
import { TaiKhoan } from '../src/auth/entities/tai-khoan.entity.js';
import { insertTaiKhoan } from '../src/auth/entities/testing/auth-fixtures.js';
import { T0 } from '../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from '../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { resetTables } from '../src/database/testing/test-database.js';

// Task B15 — POST /admin/staff-accounts qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (bộ lọc lỗi P5, ValidationPipe, logger che bí mật),
// MailService giả (không gửi thư thật). Mã test case: NS-01…NS-25 (trừ NS-26 là giao diện). Mã E2E-NSnn là [đề xuất]. Ca liên thông "tạo → kích hoạt (B16) → đăng
// nhập" ở admin-staff-accounts-activation.e2e-spec.ts vì cần mã B16.
const PATH = '/admin/staff-accounts';
const HOUR_MS = 3_600_000;

let h: RefreshHarness;
let output: string[];
let fx: AdminFixtures;
let branchId: string;
let otherBranchId: string;
let specialtyId: string;
let serviceId: string;
let tokens: {
  system: string;
  branch: string;
  doctor: string;
  receptionist: string;
  patient: string;
};

beforeAll(async () => {
  h = await openRefreshHarness();
});

beforeEach(async () => {
  await resetTables(h.db);
  h.mail.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  output = [];
  const capture = (chunk: unknown): boolean => {
    output.push(String(chunk));
    return true;
  };
  vi.spyOn(process.stderr, 'write').mockImplementation(capture);
  vi.spyOn(process.stdout, 'write').mockImplementation(capture);

  fx = new AdminFixtures(h.db);
  const branch = await fx.branch();
  const other = await fx.branch();
  branchId = branch.chiNhanhId;
  otherBranchId = other.chiNhanhId;
  const { specialty, service } = await fx.catalog();
  specialtyId = specialty.chuyenKhoaId;
  serviceId = service.dichVuKhamId;
  await h.db.query(
    'INSERT INTO chi_nhanh_dich_vu_kham (chi_nhanh_id, dich_vu_kham_id) VALUES (?, ?)',
    [branchId, serviceId],
  );
  const tokenOf = async (accountId: string): Promise<string> =>
    (await h.sessions.create(accountId)).accessToken;
  tokens = {
    system: await tokenOf((await fx.admin()).account.taiKhoanId),
    branch: await tokenOf((await fx.admin(branch)).account.taiKhoanId),
    doctor: await tokenOf((await fx.doctor(branch)).account.taiKhoanId),
    receptionist: await tokenOf(
      (await fx.receptionist(branch)).account.taiKhoanId,
    ),
    patient: await tokenOf((await fx.patient()).account.taiKhoanId),
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await h.close();
});

let sequence = 0;
const person = () => {
  sequence += 1;
  return {
    hoTen: 'Võ Thị Mai',
    email: `e2e.nhan.su.${String(sequence)}@example.com`,
    soDienThoai: '0933445566',
  };
};
const doctorBody = (over: object = {}) => ({
  ...person(),
  vaiTro: 'BacSi',
  chiNhanhId: branchId,
  chuyenKhoaId: specialtyId,
  dichVuKhamId: serviceId,
  chucDanh: 'BS_CKII',
  hocVi: 'BS',
  soNamKinhNghiem: 12,
  ...over,
});
const receptionistBody = (over: object = {}) => ({
  ...person(),
  vaiTro: 'LeTan',
  chiNhanhId: branchId,
  ...over,
});
const systemAdminBody = (over: object = {}) => ({
  ...person(),
  vaiTro: 'QuanTriVien',
  phamVi: 'ToanHeThong',
  ...over,
});
const branchAdminBody = (over: object = {}) => ({
  ...person(),
  vaiTro: 'QuanTriVien',
  phamVi: 'ChiNhanh',
  chiNhanhId: branchId,
  ...over,
});

const post = (token: string | null, body: unknown) => {
  const req = request(h.app.getHttpServer()).post(PATH);
  if (token !== null) req.set('Authorization', `Bearer ${token}`);
  return req.send(body as object);
};
const accountOf = (email: string) =>
  h.db.getRepository(TaiKhoan).findOneBy({ email });
const totalAccounts = async (): Promise<number> =>
  h.db.getRepository(TaiKhoan).count();

const RESPONSE_KEYS = ['guiEmail', 'loaiTaiKhoan', 'taiKhoanId', 'trangThai'];

describe('tạo thành công (NS-01, NS-02, NS-03, NS-04)', () => {
  it('E2E-NS01 (NS-01, NS-02, NS-03, NS-04) Toàn hệ thống tạo cả bốn dạng ⇒ 201, thân CHỈ có bốn khoá; ĐĂNG KÝ đúng hồ sơ và ChoKichHoat; thân không có token, URL, mật khẩu, băm', async () => {
    const bodies = [
      doctorBody(),
      receptionistBody(),
      systemAdminBody(),
      branchAdminBody(),
    ];
    for (const body of bodies) {
      const res = await post(tokens.system, body);
      expect(res.status).toBe(201);
      const created = res.body as Record<string, unknown>;
      expect(Object.keys(created).sort()).toEqual(RESPONSE_KEYS);
      expect(created).toEqual({
        taiKhoanId: expect.any(String),
        loaiTaiKhoan: body.vaiTro,
        trangThai: 'ChoKichHoat',
        guiEmail: { ketQua: 'DaGui' },
      });
      const sent = parseActivationMail(h.mail.sent.at(-1));
      const text = JSON.stringify(res.body);
      for (const secret of [
        sent.token,
        sent.url,
        'kich-hoat',
        'matKhau',
        'ma_bam',
        'argon2',
      ]) {
        expect(text).not.toContain(secret);
      }
      expect(await accountOf(body.email)).toMatchObject({
        taiKhoanId: created.taiKhoanId,
        trangThai: 'ChoKichHoat',
        matKhauBam: null,
        daXacMinhEmail: false,
      });
    }
    expect(
      await h.db
        .getRepository(BacSi)
        .count({ where: { chuyenKhoaId: specialtyId } }),
      // Chỉ Bác sĩ vừa tạo dùng chuyên khoa này (Bác sĩ của fixture có chuyên khoa riêng)
    ).toBe(1);
    expect(
      await h.db
        .getRepository(LeTan)
        .count({ where: { chiNhanhId: branchId } }),
    ).toBe(2);
    expect(
      await h.db
        .getRepository(QuanTriVien)
        .count({ where: { phamViQuanTri: 'ToanHeThong' } }),
    ).toBe(2);
    expect(h.mail.sent).toHaveLength(4);
  });
});

describe('phạm vi và vai trò (NS-05, NS-06, NS-07, NS-08)', () => {
  it('E2E-NS02 (NS-05, NS-08) Chi nhánh tạo Bác sĩ và Lễ tân ở chi nhánh MÌNH ⇒ 201; Toàn hệ thống tạo ở chi nhánh khác ⇒ 201', async () => {
    expect((await post(tokens.branch, doctorBody())).status).toBe(201);
    expect((await post(tokens.branch, receptionistBody())).status).toBe(201);
    expect(
      (
        await post(
          tokens.system,
          receptionistBody({ chiNhanhId: otherBranchId }),
        )
      ).status,
    ).toBe(201);
  });

  it('E2E-NS02 (NS-06, Q40) Chi nhánh tạo ở chi nhánh KHÁC và ở chi nhánh KHÔNG TỒN TẠI ⇒ 400 DU_LIEU_KHONG_HOP_LE trên chiNhanhId, CÙNG một thân; không tài khoản nào', async () => {
    const before = await totalAccounts();
    const other = await post(
      tokens.branch,
      doctorBody({ chiNhanhId: otherBranchId }),
    );
    const missing = await post(
      tokens.branch,
      doctorBody({ chiNhanhId: '987654' }),
    );
    const bodyOfOther = expectErrorResponse(other, 400, 'DU_LIEU_KHONG_HOP_LE');
    const bodyOfMissing = expectErrorResponse(
      missing,
      400,
      'DU_LIEU_KHONG_HOP_LE',
    );
    expect(bodyOfOther).toEqual(bodyOfMissing);
    expect(bodyOfOther.loi).toEqual([
      { truong: 'chiNhanhId', ma: 'CHI_NHANH_KHONG_HOP_LE' },
    ]);
    expect(await totalAccounts()).toBe(before);
    expect(h.mail.attempts).toHaveLength(0);
  });

  it('E2E-NS02 (NS-07) Chi nhánh chọn vai trò Quản trị viên (cả hai phạm vi) ⇒ 403 KHONG_DU_QUYEN; không tài khoản nào, không thư', async () => {
    const before = await totalAccounts();
    for (const body of [systemAdminBody(), branchAdminBody()]) {
      expectErrorResponse(
        await post(tokens.branch, body),
        403,
        'KHONG_DU_QUYEN',
      );
    }
    expect(await totalAccounts()).toBe(before);
    expect(h.mail.attempts).toHaveLength(0);
  });
});

describe('xác thực và vai trò gọi API (NS A2, PQ-11)', () => {
  it('E2E-NS03 không đăng nhập ⇒ 401; Bác sĩ, Lễ tân, Bệnh nhân ⇒ 403; Quản trị viên mất dòng quan_tri_vien ⇒ 403 (đóng mặc định); không tài khoản nào được tạo', async () => {
    const before = await totalAccounts();
    expectErrorResponse(await post(null, doctorBody()), 401, 'CHUA_DANG_NHAP');
    for (const token of [tokens.doctor, tokens.receptionist, tokens.patient]) {
      expectErrorResponse(
        await post(token, doctorBody()),
        403,
        'KHONG_DU_QUYEN',
      );
    }
    const orphan = await insertTaiKhoan(h.db, {
      loaiTaiKhoan: 'QuanTriVien',
      daXacMinhEmail: true,
    });
    const orphanToken = (await h.sessions.create(orphan.taiKhoanId))
      .accessToken;
    expectErrorResponse(
      await post(orphanToken, doctorBody()),
      403,
      'KHONG_DU_QUYEN',
    );
    expect(await totalAccounts()).toBe(before + 1);
  });
});

describe('dữ liệu vào và email trùng (NS-09, NS-11, NS-12, NS-15, NS-18, NS-23)', () => {
  it('E2E-NS04 (NS-11, NS-12, NS-15, NS-18, NS-23) thân sai ⇒ 400 DU_LIEU_KHONG_HOP_LE kèm loi[{truong, ma}] đúng; không tài khoản nào được tạo', async () => {
    const before = await totalAccounts();
    const cases: [string, unknown, string][] = [
      [
        'vaiTro rác',
        { ...receptionistBody(), vaiTro: 'BenhNhan' },
        'vaiTro:VAI_TRO_KHONG_HOP_LE',
      ],
      [
        'thiếu chuyên khoa',
        { ...doctorBody(), chuyenKhoaId: undefined },
        'chuyenKhoaId:CHUYEN_KHOA_KHONG_HOP_LE',
      ],
      [
        'kinh nghiệm 61',
        doctorBody({ soNamKinhNghiem: 61 }),
        'soNamKinhNghiem:SO_NAM_KINH_NGHIEM_KHONG_HOP_LE',
      ],
      [
        'kinh nghiệm -1',
        doctorBody({ soNamKinhNghiem: -1 }),
        'soNamKinhNghiem:SO_NAM_KINH_NGHIEM_KHONG_HOP_LE',
      ],
      [
        'kinh nghiệm 1,5',
        doctorBody({ soNamKinhNghiem: 1.5 }),
        'soNamKinhNghiem:SO_NAM_KINH_NGHIEM_KHONG_HOP_LE',
      ],
      [
        'email sai',
        receptionistBody({ email: 'khong-phai-email' }),
        'email:EMAIL_KHONG_HOP_LE',
      ],
      [
        'SĐT sai',
        receptionistBody({ soDienThoai: '12345' }),
        'soDienThoai:SDT_KHONG_HOP_LE',
      ],
      [
        'họ tên rỗng',
        receptionistBody({ hoTen: '   ' }),
        'hoTen:HO_TEN_KHONG_HOP_LE',
      ],
      [
        'gửi matKhau',
        receptionistBody({ matKhau: 'Khong-duoc-nhan-1!' }),
        'matKhau:TRUONG_KHONG_DUOC_PHEP',
      ],
      [
        'gửi trangThai',
        receptionistBody({ trangThai: 'DangHoatDong' }),
        'trangThai:TRUONG_KHONG_DUOC_PHEP',
      ],
      [
        'gửi daXacMinhEmail',
        receptionistBody({ daXacMinhEmail: true }),
        'daXacMinhEmail:TRUONG_KHONG_DUOC_PHEP',
      ],
      [
        'Lễ tân gửi chuyên khoa',
        receptionistBody({ chuyenKhoaId: specialtyId }),
        'chuyenKhoaId:TRUONG_KHONG_DUOC_PHEP',
      ],
      [
        'Toàn hệ thống gửi chi nhánh',
        systemAdminBody({ chiNhanhId: branchId }),
        'chiNhanhId:TRUONG_KHONG_DUOC_PHEP',
      ],
    ];
    for (const [label, body, expected] of cases) {
      const res = await post(tokens.system, body);
      const error = expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE');
      expect(
        (error.loi ?? []).map((item) => `${item.truong}:${item.ma}`),
        label,
      ).toContain(expected);
    }
    // Giá trị mật khẩu đã gửi không bao giờ được chép lại trong lỗi
    const echoed = await post(
      tokens.system,
      receptionistBody({ matKhau: 'Khong-duoc-nhan-1!' }),
    );
    expect(JSON.stringify(echoed.body)).not.toContain('Khong-duoc-nhan-1!');
    expect(await totalAccounts()).toBe(before);
  });

  it('E2E-NS04 (NS-11) thân KHÔNG phải đối tượng (mảng, rỗng, chuỗi, số, null, JSON hỏng) ⇒ 400, không bao giờ 500; không tài khoản nào', async () => {
    const before = await totalAccounts();
    for (const raw of [
      '[]',
      '{}',
      '"nhan vien"',
      '123',
      'null',
      '{"vaiTro":',
    ]) {
      const res = await request(h.app.getHttpServer())
        .post(PATH)
        .set('Authorization', `Bearer ${tokens.system}`)
        .set('Content-Type', 'application/json')
        .send(raw);
      expect(res.status, raw).toBe(400);
      expect(['DU_LIEU_KHONG_HOP_LE', 'YEU_CAU_KHONG_HOP_LE'], raw).toContain(
        (res.body as { maLoi: string }).maLoi,
      );
    }
    expect(await totalAccounts()).toBe(before);
  });

  it('E2E-NS04 (NS-14, NS-13, NS-16) lỗi nghiệp vụ ⇒ đúng mã và HTTP: chức danh–học vị, dịch vụ không ở chi nhánh, chuyên khoa ngừng hoạt động', async () => {
    expectErrorResponse(
      await post(tokens.system, doctorBody({ chucDanh: 'TS_BS', hocVi: 'BS' })),
      400,
      'CHUC_DANH_HOC_VI_KHONG_TUONG_THICH',
    );
    expectErrorResponse(
      await post(tokens.system, doctorBody({ chiNhanhId: otherBranchId })),
      400,
      'DICH_VU_KHONG_O_CHI_NHANH',
    );
    await h.db.query(
      "UPDATE chuyen_khoa SET trang_thai_hoat_dong = 'NgungHoatDong' WHERE chuyen_khoa_id = ?",
      [specialtyId],
    );
    const stopped = expectErrorResponse(
      await post(tokens.system, doctorBody()),
      400,
      'DU_LIEU_KHONG_HOP_LE',
    );
    expect(stopped.loi).toEqual([
      { truong: 'chuyenKhoaId', ma: 'CHUYEN_KHOA_KHONG_HOP_LE' },
    ]);
    expect(h.mail.attempts).toHaveLength(0);
  });

  it('E2E-NS04 (NS-09) email đã có (khác hoa thường, có khoảng trắng hai đầu) ⇒ 409 EMAIL_DA_DUNG, chữ của PLAN 5.9; email khác ⇒ 201', async () => {
    const first = receptionistBody();
    expect((await post(tokens.system, first)).status).toBe(201);
    for (const email of [
      first.email,
      first.email.toUpperCase(),
      `  ${first.email}  `,
    ]) {
      const res = await post(tokens.system, receptionistBody({ email }));
      const error = expectErrorResponse(res, 409, 'EMAIL_DA_DUNG');
      expect(error.thongBao).toBe('Email này đã được sử dụng.');
    }
    expect((await post(tokens.system, receptionistBody())).status).toBe(201);
    expect(h.mail.sent).toHaveLength(2);
  });

  it('E2E-NS09 (NS-10, Q32) email của Bệnh nhân chưa xác minh quá 24 giờ ⇒ 201 và tài khoản cũ bị xoá; Bệnh nhân còn hạn hoặc đã xác minh ⇒ 409, giữ nguyên', async () => {
    const stale = await insertTaiKhoan(h.db, {
      email: 'stale@example.com',
      loaiTaiKhoan: 'BenhNhan',
      daXacMinhEmail: false,
      thoiDiemTao: new Date(T0.getTime() - 25 * HOUR_MS),
    });
    const fresh = await insertTaiKhoan(h.db, {
      email: 'fresh@example.com',
      loaiTaiKhoan: 'BenhNhan',
      daXacMinhEmail: false,
      thoiDiemTao: new Date(T0.getTime() - 23 * HOUR_MS),
    });
    const verified = await insertTaiKhoan(h.db, {
      email: 'verified@example.com',
      loaiTaiKhoan: 'BenhNhan',
      daXacMinhEmail: true,
      thoiDiemTao: new Date(T0.getTime() - 99 * HOUR_MS),
    });
    const created = await post(
      tokens.system,
      receptionistBody({ email: 'stale@example.com' }),
    );
    expect(created.status).toBe(201);
    expect(
      await h.db
        .getRepository(TaiKhoan)
        .findOneBy({ taiKhoanId: stale.taiKhoanId }),
    ).toBeNull();
    for (const keeper of [fresh, verified]) {
      expectErrorResponse(
        await post(tokens.system, receptionistBody({ email: keeper.email })),
        409,
        'EMAIL_DA_DUNG',
      );
      expect(
        await h.db
          .getRepository(TaiKhoan)
          .findOneBy({ taiKhoanId: keeper.taiKhoanId }),
      ).not.toBeNull();
    }
  });
});

describe('gửi email lỗi, đăng nhập và log (NS-19, NS-21, NS-24, NS-25)', () => {
  it('E2E-NS05 (NS-19) thư lỗi ⇒ vẫn 201 với guiEmail ThatBai + GUI_MAIL_LOI; thân không có token; tài khoản và hồ sơ còn ChoKichHoat; liên kết bị thu hồi', async () => {
    h.mail.failNextWith('AUTH');
    const body = doctorBody();
    const res = await post(tokens.system, body);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      taiKhoanId: expect.any(String),
      loaiTaiKhoan: 'BacSi',
      trangThai: 'ChoKichHoat',
      guiEmail: { ketQua: 'ThatBai', maLoi: 'GUI_MAIL_LOI' },
    });
    const attempted = parseActivationMail(h.mail.attempts[0]);
    expect(JSON.stringify(res.body)).not.toContain(attempted.token);
    expect(h.mail.sent).toHaveLength(0);
    expect(await accountOf(body.email)).toMatchObject({
      trangThai: 'ChoKichHoat',
    });
    const links: { thu_hoi_luc: Date | null; da_gui_luc: Date | null }[] =
      await h.db.query(
        'SELECT thu_hoi_luc, da_gui_luc FROM ma_xac_thuc WHERE tai_khoan_id = ?',
        [(res.body as { taiKhoanId: string }).taiKhoanId],
      );
    expect(links).toHaveLength(1);
    expect(links[0]?.thu_hoi_luc).not.toBeNull();
    expect(links[0]?.da_gui_luc).toBeNull();
  });

  it('E2E-NS06 (NS-25) tài khoản vừa tạo đăng nhập bằng mật khẩu bất kỳ ⇒ 403 TAI_KHOAN_CHUA_KICH_HOAT, không phiên nào được tạo', async () => {
    const body = receptionistBody();
    expect((await post(tokens.system, body)).status).toBe(201);
    const account = await accountOf(body.email);
    const sessionsBefore: { n: string }[] = await h.db.query(
      'SELECT COUNT(*) AS n FROM phien_dang_nhap WHERE tai_khoan_id = ?',
      [account?.taiKhoanId],
    );
    for (const matKhau of ['Mat-khau-bat-ky-1!', '', 'abc']) {
      const res = await request(h.app.getHttpServer())
        .post('/auth/login')
        .send({ email: body.email, matKhau });
      expect([400, 403]).toContain(res.status);
      if (res.status === 403) {
        expect((res.body as { maLoi: string }).maLoi).toBe(
          'TAI_KHOAN_CHUA_KICH_HOAT',
        );
      }
    }
    const sessionsAfter: { n: string }[] = await h.db.query(
      'SELECT COUNT(*) AS n FROM phien_dang_nhap WHERE tai_khoan_id = ?',
      [account?.taiKhoanId],
    );
    expect(sessionsAfter[0]?.n).toBe(sessionsBefore[0]?.n);
  });

  it('E2E-NS07 (NS-24) mỗi lần tạo thành công ghi đúng 1 dòng audit TaoTaiKhoanNhanSu với người thực hiện lấy từ PHIÊN; lần bị từ chối không ghi dòng nào', async () => {
    const body = branchAdminBody();
    const res = await post(tokens.system, body);
    expect(res.status).toBe(201);
    const rows = await h.db.getRepository(NhatKyHanhDong).find();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      hanhDong: 'TaoTaiKhoanNhanSu',
      loaiDoiTuong: 'tai_khoan',
      maDoiTuong: (res.body as { taiKhoanId: string }).taiKhoanId,
      chiNhanhId: branchId,
      ketQua: 'ThanhCong',
      chiTietThayDoi: {
        loai_tai_khoan: 'QuanTriVien',
        chi_nhanh_id: branchId,
        pham_vi: 'ChiNhanh',
      },
    });
    // Người thực hiện KHÔNG lấy từ thân yêu cầu: gửi thêm trường actorId bị từ chối, và audit trỏ về đúng Quản trị viên của phiên
    const actors: { tai_khoan_id: string }[] = await h.db.query(
      "SELECT t.tai_khoan_id FROM tai_khoan t JOIN quan_tri_vien q ON q.tai_khoan_id = t.tai_khoan_id WHERE q.pham_vi_quan_tri = 'ToanHeThong'",
    );
    expect(rows[0]?.taiKhoanId).toBe(actors[0]?.tai_khoan_id);
    expectErrorResponse(
      await post(tokens.system, { ...receptionistBody(), actorId: '1' }),
      400,
      'DU_LIEU_KHONG_HOP_LE',
    );
    expect(await h.db.getRepository(NhatKyHanhDong).count()).toBe(1);
  });

  it('E2E-NS08 (NS-21) log của cả chuỗi (thành công, trùng email, thư lỗi, từ chối) không có token, URL kích hoạt, băm hay mật khẩu đã gửi', async () => {
    const ok = doctorBody();
    await post(tokens.system, ok);
    await post(tokens.system, { ...ok });
    h.mail.failNextWith('CONNECTION');
    await post(tokens.system, receptionistBody());
    await post(
      tokens.system,
      receptionistBody({ matKhau: 'Khong-duoc-nhan-1!' }),
    );
    const secrets = h.mail.attempts.map((message) =>
      parseActivationMail(message),
    );
    expect(secrets).toHaveLength(2);
    const text = output.join('\n');
    for (const secret of secrets) {
      expect(text).not.toContain(secret.token);
      expect(text).not.toContain(secret.url);
    }
    for (const forbidden of [
      'kich-hoat#',
      'token=',
      'Khong-duoc-nhan-1!',
      '$argon2id$',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });
});
