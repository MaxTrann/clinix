import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { AuditRepository } from '../../../audit/audit.repository.js';
import { AuditService } from '../../../audit/audit.service.js';
import { TaiKhoan } from '../../../auth/entities/tai-khoan.entity.js';
import {
  insertMaXacThuc,
  insertTaiKhoan,
} from '../../../auth/entities/testing/auth-fixtures.js';
import { useIntegrationHooks } from '../../../auth/testing/int-hooks.js';
import {
  ControlledMailService,
  T0,
  at,
} from '../../../auth/testing/otp-int-helpers.js';
import { AppException } from '../../../common/errors/app.exception.js';
import type { MailSendErrorKind } from '../../../mail/mail-send.error.js';
import type { FakeMailService } from '../../../mail/testing/fake-mail.service.js';
import { BacSi } from '../../entities/bac-si.entity.js';
import { LeTan } from '../../entities/le-tan.entity.js';
import { NhatKyHanhDong } from '../../entities/nhat-ky-hanh-dong.entity.js';
import { QuanTriVien } from '../../entities/quan-tri-vien.entity.js';
import { CHUC_DANH_BAC_SI, HOC_VI_BAC_SI } from '../../entities/enums.js';
import { ChuyenKhoa } from '../../entities/chuyen-khoa.entity.js';
import { deriveActivationLinkState } from '../../staff-activation/activation-link-rules.js';
import { hashActivationToken } from '../../staff-activation/activation-link-token.js';
import type { ActivationLinkService } from '../../staff-activation/activation-link.service.js';
import { parseActivationMail } from '../../staff-activation/testing/activation-link-fixtures.js';
import { isCompatibleTitleDegree } from '../staff-account-rules.js';
import { StaffAccountRepository } from '../staff-account.repository.js';
import type { StaffAccountInput } from '../staff-account.types.js';
import {
  SYSTEM_SCOPE,
  accountByEmail,
  accountOf,
  accountSnapshot,
  auditRowsOf,
  branchAdminInput,
  buildService,
  createAs,
  createStaffAccountWorld,
  createWorld,
  doctorInput,
  dumpTraceTables,
  linksOf,
  newEmail,
  receptionistInput,
  rowCounts,
  systemAdminInput,
  type StaffAccountWorld,
} from '../testing/staff-account-world.js';

// Task B15 (admin) — tạo tài khoản nhân sự trên MySQL 8.4 THẬT: giao dịch {tài khoản + hồ sơ + liên kết + audit}, UNIQUE email, CHECK, khoá S, Q32, thư ngoài
// giao dịch, log sạch (PLAN admin 7.4: NS-01…NS-25). Chạy đua ở staff-account.concurrency.int-spec.ts. Mã NSB15-nn là [đề xuất].
// Đồng hồ giả chỉ giả `Date` (useIntegrationHooks): mọi mốc thời gian ghi tường minh từ ứng dụng, không dùng NOW() của DB.
const HOUR_MS = 3_600_000;

let db: DataSource;
let logs: string[];

useIntegrationHooks((testDb, logLines) => {
  db = testDb;
  logs = logLines;
});

const worldOf = (): Promise<StaffAccountWorld<FakeMailService>> =>
  createWorld(db);

const errorOf = async (promise: Promise<unknown>): Promise<AppException> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppException) return error;
    throw error;
  }
  throw new Error('mong đợi AppException nhưng thao tác thành công');
};

const mysqlError = (errno: number, code: string): Error =>
  Object.assign(new Error(`lỗi MySQL giả ${code}`), { errno, code });

/** Bệnh nhân chưa xác minh, đang hoạt động, tạo cách đây `ageMs` (mặc định đúng 24 giờ = vừa hết hạn). */
const openPatient = (email: string, ageMs = 24 * HOUR_MS): Promise<TaiKhoan> =>
  insertTaiKhoan(db, {
    email,
    loaiTaiKhoan: 'BenhNhan',
    daXacMinhEmail: false,
    trangThai: 'DangHoatDong',
    thoiDiemTao: new Date(T0.getTime() - ageMs),
  });

describe('tạo thành công từng vai trò (NS-01, NS-02, NS-03, NS-04)', () => {
  it('NSB15-30 (NS-01) Bác sĩ: tai_khoan ChoKichHoat không mật khẩu + bac_si đủ cột + ĐÚNG 1 hàng liên kết đã gửi (hạn +24 giờ, băm khớp token trong thư); thư tới đúng 1 lần', async () => {
    const w = await worldOf();
    const input = doctorInput(w);
    if (input.vaiTro !== 'BacSi') throw new Error('sai vai trò');

    const result = await createAs(w, SYSTEM_SCOPE, input);
    expect(result).toEqual({
      taiKhoanId: expect.any(String),
      loaiTaiKhoan: 'BacSi',
      trangThai: 'ChoKichHoat',
      guiEmail: { ketQua: 'DaGui' },
    });

    const account = await accountOf(db, result.taiKhoanId);
    expect(account).toMatchObject({
      hoTen: input.hoTen,
      email: input.email,
      soDienThoai: input.soDienThoai,
      loaiTaiKhoan: 'BacSi',
      trangThai: 'ChoKichHoat',
      matKhauBam: null,
      daXacMinhEmail: false,
      soLanDangNhapSai: 0,
      khoaDangNhapDen: null,
    });
    expect(account.thoiDiemTao).toEqual(T0);

    expect(
      await db.getRepository(BacSi).findOneByOrFail({
        taiKhoanId: result.taiKhoanId,
      }),
    ).toMatchObject({
      chiNhanhId: w.branch.chiNhanhId,
      chuyenKhoaId: w.specialty.chuyenKhoaId,
      dichVuKhamId: w.catalogService.dichVuKhamId,
      chucDanh: 'BS_CKI',
      hocVi: 'BS',
      soNamKinhNghiem: 10,
      moTaChuyenMon: null,
    });

    const links = await linksOf(db, result.taiKhoanId);
    expect(links).toHaveLength(1);
    expect(w.mail.attempts).toHaveLength(1);
    expect(w.mail.attempts[0]?.to).toBe(input.email);
    const sent = parseActivationMail(w.mail.sent[0]);
    expect(sent.id).toBe(links[0]?.maXacThucId);
    expect(links[0]).toMatchObject({
      loai: 'KichHoatNhanSu',
      thuHoiLuc: null,
      daDungLuc: null,
      maBam: hashActivationToken(sent.token),
    });
    expect(links[0]?.daGuiLuc).toEqual(T0);
    expect(links[0]?.hetHanLuc).toEqual(new Date(T0.getTime() + 24 * HOUR_MS));
    expect(
      deriveActivationLinkState(links[0] as NonNullable<(typeof links)[0]>, T0),
    ).toBe('HOP_LE');
  });

  it('NSB15-31 (NS-02, NS-03, NS-04) Lễ tân (có chi nhánh), Quản trị viên Toàn hệ thống (chi_nhanh_id NULL), Quản trị viên Chi nhánh (có chi nhánh); cả ba ChoKichHoat không mật khẩu', async () => {
    const w = await worldOf();

    const receptionist = await createAs(w, SYSTEM_SCOPE, receptionistInput(w));
    expect(
      await db.getRepository(LeTan).findOneByOrFail({
        taiKhoanId: receptionist.taiKhoanId,
      }),
    ).toMatchObject({ chiNhanhId: w.branch.chiNhanhId });

    const system = await createAs(w, SYSTEM_SCOPE, systemAdminInput());
    expect(
      await db.getRepository(QuanTriVien).findOneByOrFail({
        taiKhoanId: system.taiKhoanId,
      }),
    ).toMatchObject({ phamViQuanTri: 'ToanHeThong', chiNhanhId: null });

    const branch = await createAs(w, SYSTEM_SCOPE, branchAdminInput(w));
    expect(
      await db.getRepository(QuanTriVien).findOneByOrFail({
        taiKhoanId: branch.taiKhoanId,
      }),
    ).toMatchObject({
      phamViQuanTri: 'ChiNhanh',
      chiNhanhId: w.branch.chiNhanhId,
    });

    for (const [created, loai] of [
      [receptionist, 'LeTan'],
      [system, 'QuanTriVien'],
      [branch, 'QuanTriVien'],
    ] as const) {
      expect(await accountOf(db, created.taiKhoanId)).toMatchObject({
        loaiTaiKhoan: loai,
        trangThai: 'ChoKichHoat',
        matKhauBam: null,
        daXacMinhEmail: false,
      });
      expect(await linksOf(db, created.taiKhoanId)).toHaveLength(1);
    }
    expect(w.mail.sent).toHaveLength(3);
  });

  it('NSB15-31 (NS-04) Quản trị viên Chi nhánh với chi nhánh không tồn tại ⇒ từ chối bằng lỗi dữ liệu; CHECK chk_qtv_pham_vi của DB không bị chạm; không hàng nào', async () => {
    const w = await worldOf();
    const before = await rowCounts(db);
    const error = await errorOf(
      createAs(w, SYSTEM_SCOPE, {
        ...branchAdminInput(w),
        chiNhanhId: '987654',
      } as StaffAccountInput),
    );
    expect(error.getResponse()).toMatchObject({
      maLoi: 'DU_LIEU_KHONG_HOP_LE',
      loi: [{ truong: 'chiNhanhId', ma: 'CHI_NHANH_KHONG_HOP_LE' }],
    });
    expect(await rowCounts(db)).toEqual(before);
  });
});

describe('phạm vi và vai trò (NS-05, NS-06, NS-07, NS-08)', () => {
  it('NSB15-32 (NS-05, NS-08) Chi nhánh tạo Bác sĩ, Lễ tân ở chi nhánh MÌNH; Toàn hệ thống tạo ở chi nhánh khác', async () => {
    const w = await worldOf();
    await createAs(w, w.branchScope, doctorInput(w));
    await createAs(w, w.branchScope, receptionistInput(w));
    await createAs(
      w,
      SYSTEM_SCOPE,
      receptionistInput(w, { chiNhanhId: w.otherBranch.chiNhanhId }),
    );
    expect(w.mail.sent).toHaveLength(3);
  });

  it('NSB15-32 (NS-06) Chi nhánh tạo ở chi nhánh KHÁC và chi nhánh KHÔNG TỒN TẠI cho CÙNG một thân; số hàng mọi bảng không đổi', async () => {
    const w = await worldOf();
    const before = await rowCounts(db);
    const other = await errorOf(
      createAs(
        w,
        w.branchScope,
        receptionistInput(w, { chiNhanhId: w.otherBranch.chiNhanhId }),
      ),
    );
    const missing = await errorOf(
      createAs(w, SYSTEM_SCOPE, receptionistInput(w, { chiNhanhId: '987654' })),
    );
    expect(other.getStatus()).toBe(400);
    expect(other.getResponse()).toEqual(missing.getResponse());
    expect(await rowCounts(db)).toEqual(before);
    expect(w.mail.attempts).toHaveLength(0);
  });

  it('NSB15-32 (NS-07) Chi nhánh chọn vai trò Quản trị viên (cả hai phạm vi) ⇒ 403 KHONG_DU_QUYEN; không hàng nào, không thư', async () => {
    const w = await worldOf();
    const before = await rowCounts(db);
    for (const input of [systemAdminInput(), branchAdminInput(w)]) {
      const error = await errorOf(createAs(w, w.branchScope, input));
      expect(error.getStatus()).toBe(403);
      expect(error.maLoi).toBe('KHONG_DU_QUYEN');
    }
    expect(await rowCounts(db)).toEqual(before);
    expect(w.mail.attempts).toHaveLength(0);
  });
});

describe('email trùng (NS-09)', () => {
  it('NSB15-33 (NS-09) trùng với Bệnh nhân (hai trạng thái), Bác sĩ, Lễ tân, Quản trị viên và nhân sự ChoKichHoat; khác HOA/thường hay có khoảng trắng cuối ⇒ EMAIL_DA_DUNG, không hàng; email khác ⇒ thành công', async () => {
    const w = await worldOf();
    const owners: [string, Promise<TaiKhoan>][] = [
      [
        'bn-dang-hoat-dong',
        insertTaiKhoan(db, { email: 'bn.1@example.com', daXacMinhEmail: true }),
      ],
      [
        'bn-ngung',
        insertTaiKhoan(db, {
          email: 'bn.2@example.com',
          daXacMinhEmail: true,
          trangThai: 'NgungHoatDong',
        }),
      ],
      [
        'bac-si',
        w.fx
          .doctor(w.branch, {}, { email: 'bs.1@example.com' })
          .then((d) => d.account),
      ],
      [
        'le-tan',
        w.fx
          .receptionist(w.branch, { email: 'lt.1@example.com' })
          .then((d) => d.account),
      ],
      [
        'qtv',
        w.fx
          .admin(undefined, { email: 'qtv.1@example.com' })
          .then((d) => d.account),
      ],
      [
        'cho-kich-hoat',
        insertTaiKhoan(db, {
          email: 'ckh.1@example.com',
          loaiTaiKhoan: 'LeTan',
          trangThai: 'ChoKichHoat',
          matKhauBam: null,
        }),
      ],
    ];
    const accounts = await Promise.all(owners.map(([, account]) => account));
    const before = await rowCounts(db);
    for (const account of accounts) {
      for (const variant of [
        account.email,
        account.email.toUpperCase(),
        `${account.email} `,
      ]) {
        const error = await errorOf(
          createAs(w, SYSTEM_SCOPE, receptionistInput(w, { email: variant })),
        );
        expect(error.getStatus()).toBe(409);
        expect(error.maLoi).toBe('EMAIL_DA_DUNG');
      }
    }
    expect(await rowCounts(db)).toEqual(before);
    expect(w.mail.attempts).toHaveLength(0);

    const ok = await createAs(w, SYSTEM_SCOPE, receptionistInput(w));
    expect(ok.guiEmail).toEqual({ ketQua: 'DaGui' });
  });
});

describe('Q32: email của Bệnh nhân chưa xác minh quá 24 giờ (NS-10)', () => {
  it('NSB15-34 (NS-10) biên 24 giờ: còn 1 giây ⇒ EMAIL_DA_DUNG và Bệnh nhân giữ NGUYÊN từng cột; đúng 24:00:00 và +1 giây ⇒ xoá tài khoản cũ cùng mã xác thực rồi tạo nhân sự', async () => {
    const w = await worldOf();

    const young = await openPatient('q32.a@example.com', 24 * HOUR_MS - 1000);
    const snapshot = await accountSnapshot(db, young.taiKhoanId);
    const error = await errorOf(
      createAs(w, SYSTEM_SCOPE, receptionistInput(w, { email: young.email })),
    );
    expect(error.maLoi).toBe('EMAIL_DA_DUNG');
    expect(await accountSnapshot(db, young.taiKhoanId)).toBe(snapshot);

    for (const [index, ageMs] of [
      24 * HOUR_MS,
      24 * HOUR_MS + 1000,
    ].entries()) {
      const email = `q32.b${String(index)}@example.com`;
      const old = await openPatient(email, ageMs);
      // Hàng OTP đăng ký của người đó: phải bị xoá cùng tài khoản
      await insertMaXacThuc(db, old.taiKhoanId, {
        hetHanLuc: new Date(T0.getTime() + HOUR_MS),
      });
      expect(await linksOf(db, old.taiKhoanId)).toHaveLength(1);
      const created = await createAs(
        w,
        SYSTEM_SCOPE,
        receptionistInput(w, { email }),
      );
      expect(created.guiEmail).toEqual({ ketQua: 'DaGui' });
      expect(created.taiKhoanId).not.toBe(old.taiKhoanId);
      expect(
        await db
          .getRepository(TaiKhoan)
          .findOneBy({ taiKhoanId: old.taiKhoanId }),
      ).toBeNull();
      expect(await linksOf(db, old.taiKhoanId)).toEqual([]);
      expect(await accountOf(db, created.taiKhoanId)).toMatchObject({
        email,
        loaiTaiKhoan: 'LeTan',
        trangThai: 'ChoKichHoat',
      });
    }
  });

  it('NSB15-34 (NS-10) đối chứng quá 24 giờ nhưng KHÔNG xoá: Bệnh nhân NgungHoatDong, Bệnh nhân đã xác minh, nhân sự ⇒ EMAIL_DA_DUNG và giữ NGUYÊN từng cột', async () => {
    const w = await worldOf();
    const old = 100 * HOUR_MS;
    const keepers = await Promise.all([
      insertTaiKhoan(db, {
        email: 'keep.1@example.com',
        loaiTaiKhoan: 'BenhNhan',
        daXacMinhEmail: false,
        trangThai: 'NgungHoatDong',
        thoiDiemTao: new Date(T0.getTime() - old),
      }),
      insertTaiKhoan(db, {
        email: 'keep.2@example.com',
        loaiTaiKhoan: 'BenhNhan',
        daXacMinhEmail: true,
        thoiDiemTao: new Date(T0.getTime() - old),
      }),
      insertTaiKhoan(db, {
        email: 'keep.3@example.com',
        loaiTaiKhoan: 'BacSi',
        daXacMinhEmail: false,
        thoiDiemTao: new Date(T0.getTime() - old),
      }),
      insertTaiKhoan(db, {
        email: 'keep.4@example.com',
        loaiTaiKhoan: 'LeTan',
        trangThai: 'ChoKichHoat',
        matKhauBam: null,
        daXacMinhEmail: false,
        thoiDiemTao: new Date(T0.getTime() - old),
      }),
    ]);
    for (const keeper of keepers) {
      const snapshot = await accountSnapshot(db, keeper.taiKhoanId);
      const error = await errorOf(
        createAs(
          w,
          SYSTEM_SCOPE,
          receptionistInput(w, { email: keeper.email }),
        ),
      );
      expect(error.maLoi).toBe('EMAIL_DA_DUNG');
      expect(await accountSnapshot(db, keeper.taiKhoanId)).toBe(snapshot);
    }
  });

  it('NSB15-35 purge bị khoá ngoại chặn (còn nhật ký tham chiếu Bệnh nhân hết hạn) ⇒ EMAIL_DA_DUNG, KHÔNG xoá, KHÔNG tạo; log của cleaner có mã tài khoản, không email', async () => {
    const w = await worldOf();
    const email = 'fk.block@example.com';
    const old = await openPatient(email);
    await db.getRepository(NhatKyHanhDong).insert({
      taiKhoanId: old.taiKhoanId,
      chiNhanhId: null,
      hanhDong: 'DoiQuyen',
      loaiDoiTuong: 'tai_khoan',
      maDoiTuong: '1',
      ketQua: 'ThanhCong',
      thoiDiem: T0,
      chiTietThayDoi: null,
    });
    const before = await rowCounts(db);
    const snapshot = await accountSnapshot(db, old.taiKhoanId);

    const error = await errorOf(
      createAs(w, SYSTEM_SCOPE, receptionistInput(w, { email })),
    );
    expect(error.getStatus()).toBe(409);
    expect(error.maLoi).toBe('EMAIL_DA_DUNG');
    expect(await rowCounts(db)).toEqual(before);
    expect(await accountSnapshot(db, old.taiKhoanId)).toBe(snapshot);
    expect(w.mail.attempts).toHaveLength(0);

    const text = logs.join('\n');
    expect(text).toContain(old.taiKhoanId);
    expect(text).not.toContain(email);
  });
});

describe('tham chiếu: chuyên khoa và dịch vụ (NS-13, NS-16, NS-12)', () => {
  it('NSB15-36 (NS-13) dịch vụ không có ở chi nhánh chọn, và dịch vụ không tồn tại ⇒ DICH_VU_KHONG_O_CHI_NHANH; không hàng nào', async () => {
    const w = await worldOf();
    const { service: unlinked } = await w.fx.catalog();
    const before = await rowCounts(db);
    for (const dichVuKhamId of [unlinked.dichVuKhamId, '987654']) {
      const error = await errorOf(
        createAs(w, SYSTEM_SCOPE, doctorInput(w, { dichVuKhamId })),
      );
      expect(error.getStatus()).toBe(400);
      expect(error.maLoi).toBe('DICH_VU_KHONG_O_CHI_NHANH');
    }
    // Dịch vụ có ở chi nhánh KHÁC nhưng không ở chi nhánh chọn cũng bị từ chối
    const error = await errorOf(
      createAs(
        w,
        SYSTEM_SCOPE,
        doctorInput(w, { chiNhanhId: w.otherBranch.chiNhanhId }),
      ),
    );
    expect(error.maLoi).toBe('DICH_VU_KHONG_O_CHI_NHANH');
    expect(await rowCounts(db)).toEqual(before);
    expect(w.mail.attempts).toHaveLength(0);
  });

  it('NSB15-37 (NS-14) hàm thuần trùng CHECK chk_bac_si_chuc_danh_hoc_vi của DB trên cả 35 cặp; 7 cặp tạo được qua dịch vụ, 28 cặp ⇒ CHUC_DANH_HOC_VI_KHONG_TUONG_THICH và không hàng nào', async () => {
    const w = await worldOf();
    const holder = await insertTaiKhoan(db, { loaiTaiKhoan: 'BacSi' });

    // (1) DB: chèn thô từng cặp trong giao dịch hoàn tác; CHECK vi phạm là mã 3819
    const acceptedByDb: string[] = [];
    const runner = db.createQueryRunner();
    try {
      for (const chucDanh of CHUC_DANH_BAC_SI) {
        for (const hocVi of HOC_VI_BAC_SI) {
          await runner.startTransaction();
          try {
            await runner.manager.insert(BacSi, {
              taiKhoanId: holder.taiKhoanId,
              chiNhanhId: w.branch.chiNhanhId,
              chuyenKhoaId: w.specialty.chuyenKhoaId,
              dichVuKhamId: w.catalogService.dichVuKhamId,
              chucDanh,
              hocVi,
              soNamKinhNghiem: 0,
            });
            acceptedByDb.push(`${chucDanh}/${hocVi}`);
          } catch (error) {
            expect((error as { errno?: number }).errno).toBe(3819);
          } finally {
            await runner.rollbackTransaction();
          }
        }
      }
    } finally {
      await runner.release();
    }
    const acceptedByRule = CHUC_DANH_BAC_SI.flatMap((chucDanh) =>
      HOC_VI_BAC_SI.filter((hocVi) =>
        isCompatibleTitleDegree(chucDanh, hocVi),
      ).map((hocVi) => `${chucDanh}/${hocVi}`),
    );
    expect(acceptedByDb.sort()).toEqual(acceptedByRule.sort());
    expect(acceptedByDb).toHaveLength(7);

    // (2) dịch vụ: 7 cặp tạo được, 28 cặp bị từ chối và không để lại gì
    let created = 0;
    for (const chucDanh of CHUC_DANH_BAC_SI) {
      for (const hocVi of HOC_VI_BAC_SI) {
        const before = await rowCounts(db);
        const attempt = createAs(
          w,
          SYSTEM_SCOPE,
          doctorInput(w, { chucDanh, hocVi }),
        );
        if (isCompatibleTitleDegree(chucDanh, hocVi)) {
          await expect(attempt).resolves.toMatchObject({
            loaiTaiKhoan: 'BacSi',
          });
          created += 1;
        } else {
          const error = await errorOf(attempt);
          expect(error.maLoi).toBe('CHUC_DANH_HOC_VI_KHONG_TUONG_THICH');
          expect(await rowCounts(db)).toEqual(before);
        }
      }
    }
    expect(created).toBe(7);
  });

  it('NSB15-38 (NS-12) kinh nghiệm 0 và 60 ghi được và đọc lại đúng', async () => {
    const w = await worldOf();
    for (const soNamKinhNghiem of [0, 60]) {
      const created = await createAs(
        w,
        SYSTEM_SCOPE,
        doctorInput(w, { soNamKinhNghiem }),
      );
      expect(
        await db.getRepository(BacSi).findOneByOrFail({
          taiKhoanId: created.taiKhoanId,
        }),
      ).toMatchObject({ soNamKinhNghiem });
    }
  });

  it('NSB15-39 (NS-16, Q19) chuyên khoa NgungHoatDong và chuyên khoa không tồn tại ⇒ CHUYEN_KHOA_KHONG_HOP_LE, không hàng; bật lại thì tạo được', async () => {
    const w = await worldOf();
    const repo = db.getRepository(ChuyenKhoa);
    await repo.update(w.specialty.chuyenKhoaId, {
      trangThaiHoatDong: 'NgungHoatDong',
    });
    const before = await rowCounts(db);
    for (const chuyenKhoaId of [w.specialty.chuyenKhoaId, '987654']) {
      const error = await errorOf(
        createAs(w, SYSTEM_SCOPE, doctorInput(w, { chuyenKhoaId })),
      );
      expect(error.getResponse()).toMatchObject({
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
        loi: [{ truong: 'chuyenKhoaId', ma: 'CHUYEN_KHOA_KHONG_HOP_LE' }],
      });
    }
    expect(await rowCounts(db)).toEqual(before);

    await repo.update(w.specialty.chuyenKhoaId, {
      trangThaiHoatDong: 'DangHoatDong',
    });
    await expect(
      createAs(w, SYSTEM_SCOPE, doctorInput(w)),
    ).resolves.toMatchObject({ loaiTaiKhoan: 'BacSi' });
  });
});

// Kho bơm lỗi: lớp con của kho thật, chỉ một hàm ném, mọi hàm khác thật (nên có thật các hàng đã chèn trước điểm lỗi để chứng minh hoàn tác)
class FailingRepository extends StaffAccountRepository {
  constructor(
    private readonly failAt:
      'insertAccount' | 'insertDoctor' | 'insertReceptionist' | 'insertAdmin',
  ) {
    super();
  }

  override insertAccount(
    ...args: Parameters<StaffAccountRepository['insertAccount']>
  ): ReturnType<StaffAccountRepository['insertAccount']> {
    if (this.failAt === 'insertAccount')
      return Promise.reject(new Error('lỗi bơm'));
    return super.insertAccount(...args);
  }

  override insertDoctor(
    ...args: Parameters<StaffAccountRepository['insertDoctor']>
  ): ReturnType<StaffAccountRepository['insertDoctor']> {
    if (this.failAt === 'insertDoctor')
      return Promise.reject(new Error('lỗi bơm'));
    return super.insertDoctor(...args);
  }

  override insertReceptionist(
    ...args: Parameters<StaffAccountRepository['insertReceptionist']>
  ): ReturnType<StaffAccountRepository['insertReceptionist']> {
    if (this.failAt === 'insertReceptionist')
      return Promise.reject(new Error('lỗi bơm'));
    return super.insertReceptionist(...args);
  }

  override insertAdmin(
    ...args: Parameters<StaffAccountRepository['insertAdmin']>
  ): ReturnType<StaffAccountRepository['insertAdmin']> {
    if (this.failAt === 'insertAdmin')
      return Promise.reject(new Error('lỗi bơm'));
    return super.insertAdmin(...args);
  }
}

const failingAudit = (): AuditService =>
  new AuditService({
    insert: () => Promise.reject(new Error('lỗi bơm ghi audit')),
  } as unknown as AuditRepository);

describe('một giao dịch, lỗi giữa chừng thì không tạo gì (NS-17)', () => {
  it('NSB15-40 (NS-17) bơm lỗi lần lượt ở INSERT tài khoản, INSERT hồ sơ (cả ba vai trò), issue liên kết và ghi audit ⇒ 0 hàng mới ở tai_khoan, hồ sơ, ma_xac_thuc, nhat_ky_hanh_dong; thư KHÔNG gửi', async () => {
    const w = await worldOf();
    const before = await rowCounts(db);

    const scenarios: [
      string,
      StaffAccountInput,
      Parameters<typeof buildService>[1],
    ][] = [
      [
        'insertAccount',
        receptionistInput(w),
        { repo: new FailingRepository('insertAccount') },
      ],
      [
        'insertDoctor',
        doctorInput(w),
        { repo: new FailingRepository('insertDoctor') },
      ],
      [
        'insertReceptionist',
        receptionistInput(w),
        { repo: new FailingRepository('insertReceptionist') },
      ],
      [
        'insertAdmin (Toàn hệ thống)',
        systemAdminInput(),
        { repo: new FailingRepository('insertAdmin') },
      ],
      [
        'insertAdmin (Chi nhánh)',
        branchAdminInput(w),
        { repo: new FailingRepository('insertAdmin') },
      ],
      [
        'issue',
        doctorInput(w),
        {
          links: {
            transaction: w.links.service.transaction.bind(w.links.service),
            issue: () => Promise.reject(new Error('lỗi bơm cấp liên kết')),
            deliver: w.links.service.deliver.bind(w.links.service),
          } as unknown as ActivationLinkService,
        },
      ],
      ['audit', doctorInput(w), { audit: failingAudit() }],
    ];
    for (const [label, input, parts] of scenarios) {
      const service = buildService(w, parts);
      await expect(
        service.create(SYSTEM_SCOPE, w.actor.taiKhoanId, input),
        label,
      ).rejects.toThrow(/lỗi bơm|AUDIT_WRITE_FAILED/);
      expect(await rowCounts(db), label).toEqual(before);
    }
    expect(w.mail.attempts).toHaveLength(0);
  });

  it('NSB15-47 (NS-22, nhánh 1213) deadlock giả lập SAU khi đã chèn cả tài khoản, hồ sơ, liên kết và audit: lần bị hoàn tác không để lại gì; lần làm lại thành công ⇒ ĐÚNG 1 thư, 1 dòng audit, 1 liên kết, 1 tài khoản mới', async () => {
    const w = await worldOf();
    const before = await rowCounts(db);
    let first = true;
    const realAudit = w.audit;
    const flaky = {
      record: async (...args: Parameters<AuditService['record']>) => {
        await realAudit.record(...args);
        if (first) {
          first = false;
          throw mysqlError(1213, 'ER_LOCK_DEADLOCK');
        }
      },
    } as unknown as AuditService;
    const service = buildService(w, { audit: flaky });

    const result = await service.create(
      SYSTEM_SCOPE,
      w.actor.taiKhoanId,
      doctorInput(w),
    );
    expect(result.guiEmail).toEqual({ ketQua: 'DaGui' });
    const after = await rowCounts(db);
    expect(after).toEqual({
      taiKhoan: before.taiKhoan + 1,
      bacSi: before.bacSi + 1,
      leTan: before.leTan,
      quanTriVien: before.quanTriVien,
      maXacThuc: before.maXacThuc + 1,
      nhatKy: before.nhatKy + 1,
    });
    expect(w.mail.attempts).toHaveLength(1);
    expect(await auditRowsOf(db, result.taiKhoanId)).toHaveLength(1);
    expect(await linksOf(db, result.taiKhoanId)).toHaveLength(1);
  });
});

const MAIL_KINDS: MailSendErrorKind[] = [
  'NOT_CONFIGURED',
  'INVALID_MESSAGE',
  'TLS',
  'AUTH',
  'REJECTED',
  'TIMEOUT',
  'CONNECTION',
  'UNKNOWN',
];

describe('gửi email lỗi (NS-19, NS-20, NS-45)', () => {
  it('NSB15-41 (NS-19) thư giả lỗi (cả 8 loại MailSendError): trả ThatBai; tài khoản và hồ sơ còn ChoKichHoat; liên kết mới bị thu hồi, chưa gửi, không hiệu lực; audit VẪN có đúng 1 dòng', async () => {
    const w = await worldOf();
    for (const kind of MAIL_KINDS) {
      w.mail.failNextWith(kind);
      const result = await createAs(w, SYSTEM_SCOPE, doctorInput(w));
      expect(result).toEqual({
        taiKhoanId: expect.any(String),
        loaiTaiKhoan: 'BacSi',
        trangThai: 'ChoKichHoat',
        guiEmail: { ketQua: 'ThatBai', maLoi: 'GUI_MAIL_LOI' },
      });
      expect(await accountOf(db, result.taiKhoanId)).toMatchObject({
        trangThai: 'ChoKichHoat',
        matKhauBam: null,
        daXacMinhEmail: false,
      });
      await db.getRepository(BacSi).findOneByOrFail({
        taiKhoanId: result.taiKhoanId,
      });
      const [link, ...rest] = await linksOf(db, result.taiKhoanId);
      expect(rest).toEqual([]);
      expect(link?.thuHoiLuc).not.toBeNull();
      expect(link?.daGuiLuc).toBeNull();
      expect(link?.kichHoatDangHieuLuc).toBeNull();
      expect(await auditRowsOf(db, result.taiKhoanId)).toHaveLength(1);
    }
    expect(w.mail.sent).toHaveLength(0);
    expect(w.mail.attempts).toHaveLength(MAIL_KINDS.length);
  });

  it('NSB15-42 (NS-20, NS-45) sau gửi lỗi: gửi lại NGAY ⇒ GUI_LAI_QUA_SOM (lần đầu và lần lỗi tính vào giới hạn); sau 60 giây cấp được, gửi ok ⇒ đúng MỘT liên kết hợp lệ', async () => {
    const w = await worldOf();
    w.mail.failNextWith('TIMEOUT');
    const input = doctorInput(w);
    const created = await createAs(w, SYSTEM_SCOPE, input);
    expect(created.guiEmail.ketQua).toBe('ThatBai');
    const issueAgain = () =>
      w.links.service.issue({ taiKhoanId: created.taiKhoanId, kind: 'GuiLai' });

    for (const seconds of [0, 59]) {
      vi.setSystemTime(at(seconds));
      expect(await issueAgain()).toMatchObject({
        ok: false,
        failure: { code: 'GUI_LAI_QUA_SOM' },
      });
    }
    vi.setSystemTime(at(60));
    const second = await issueAgain();
    if (!second.ok) throw new Error('đúng 60 giây phải được cấp');
    const delivered = await w.links.service.deliver(second.issued, {
      email: input.email,
      fullName: input.hoTen,
    });
    expect(delivered.ok).toBe(true);

    const rows = await linksOf(db, created.taiKhoanId);
    expect(rows).toHaveLength(2);
    const states = rows.map((row) => deriveActivationLinkState(row, at(60)));
    expect(states).toEqual(['BI_THU_HOI', 'HOP_LE']);
  });
});

describe('log, audit, giao dịch và khoá (NS-21, NS-24)', () => {
  it('NSB15-43 (NS-21) quét log và mọi bảng dấu vết qua cả luồng thành công, trùng email, gửi lỗi và purge: không token, không URL kích hoạt, không băm, không email ở log; token chỉ nằm trong thân thư giả', async () => {
    const w = await worldOf();
    const emailOk = newEmail('ok');
    const emailFail = newEmail('fail');
    await createAs(w, SYSTEM_SCOPE, doctorInput(w, { email: emailOk }));
    await errorOf(
      createAs(w, SYSTEM_SCOPE, receptionistInput(w, { email: emailOk })),
    );
    w.mail.failNextWith('CONNECTION');
    await createAs(w, SYSTEM_SCOPE, receptionistInput(w, { email: emailFail }));
    const expired = await openPatient('purge.me@example.com');
    await createAs(
      w,
      SYSTEM_SCOPE,
      receptionistInput(w, { email: 'purge.me@example.com' }),
    );
    expect(await accountByEmail(db, 'purge.me@example.com')).not.toBeNull();
    expect(
      await db
        .getRepository(TaiKhoan)
        .findOneBy({ taiKhoanId: expired.taiKhoanId }),
    ).toBeNull();

    const tokens = w.mail.attempts.map(
      (message) => parseActivationMail(message).token,
    );
    // Thư đi ở 3 lần: tạo thành công, tạo mà thư lỗi, tạo sau khi xoá Bệnh nhân hết hạn (lần trùng email bị từ chối TRƯỚC khi gửi nên không có thư)
    expect(tokens).toHaveLength(3);
    const text = logs.join('\n');
    const traces = await dumpTraceTables(db);
    for (const token of tokens) {
      expect(text).not.toContain(token);
      expect(traces).not.toContain(token);
      expect(text).not.toContain(hashActivationToken(token));
    }
    for (const forbidden of ['kich-hoat#', 'token=', emailOk, emailFail]) {
      expect(text).not.toContain(forbidden);
    }
    // Có chẩn đoán: lần gửi lỗi và lần xoá Bệnh nhân hết hạn đều có dòng log
    expect(text).toContain('CONNECTION');
    expect(text).toContain(expired.taiKhoanId);
  });

  it('NSB15-44 (NS-24) đúng 1 dòng TaoTaiKhoanNhanSu cho mỗi vai trò: người thực hiện, đối tượng, chi nhánh, chi_tiet_thay_doi đúng khoá, không họ tên, email, SĐT, mật khẩu, token, băm; thất bại ⇒ 0 dòng', async () => {
    const w = await worldOf();
    const cases: [StaffAccountInput, string | null, Record<string, unknown>][] =
      [
        [
          doctorInput(w),
          w.branch.chiNhanhId,
          { loai_tai_khoan: 'BacSi', chi_nhanh_id: w.branch.chiNhanhId },
        ],
        [
          receptionistInput(w),
          w.branch.chiNhanhId,
          { loai_tai_khoan: 'LeTan', chi_nhanh_id: w.branch.chiNhanhId },
        ],
        [
          systemAdminInput(),
          null,
          {
            loai_tai_khoan: 'QuanTriVien',
            chi_nhanh_id: null,
            pham_vi: 'ToanHeThong',
          },
        ],
        [
          branchAdminInput(w),
          w.branch.chiNhanhId,
          {
            loai_tai_khoan: 'QuanTriVien',
            chi_nhanh_id: w.branch.chiNhanhId,
            pham_vi: 'ChiNhanh',
          },
        ],
      ];
    for (const [input, branchId, changes] of cases) {
      const created = await createAs(w, SYSTEM_SCOPE, input);
      const rows = await auditRowsOf(db, created.taiKhoanId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        taiKhoanId: w.actor.taiKhoanId,
        chiNhanhId: branchId,
        hanhDong: 'TaoTaiKhoanNhanSu',
        loaiDoiTuong: 'tai_khoan',
        maDoiTuong: created.taiKhoanId,
        ketQua: 'ThanhCong',
        chiTietThayDoi: changes,
      });
      expect(rows[0]?.thoiDiem).toEqual(T0);
      const text = JSON.stringify(rows);
      for (const secret of [
        input.hoTen,
        input.email,
        input.soDienThoai,
        'mat_khau',
        'token',
        'ma_bam',
      ]) {
        expect(text).not.toContain(secret);
      }
    }

    const before = await rowCounts(db);
    await errorOf(
      createAs(w, SYSTEM_SCOPE, receptionistInput(w, { email: w.actor.email })),
    );
    await errorOf(createAs(w, w.branchScope, systemAdminInput()));
    expect((await rowCounts(db)).nhatKy).toBe(before.nhatKy);
  });

  it('NSB15-45 (NS-01) thư gửi NGOÀI giao dịch: lúc send bị giữ không còn giao dịch InnoDB nào trên DB này, hàng tài khoản khoá NOWAIT được ngay, liên kết đã commit ở trạng thái "mới tạo" rồi thành HOP_LE khi thư đi', async () => {
    const mail = new ControlledMailService();
    const w = await createStaffAccountWorld(db, mail);
    mail.holding = true;
    const pending = createAs(w, SYSTEM_SCOPE, doctorInput(w));
    let taiKhoanId = '';
    try {
      await mail.waitForPending(1);

      const open: { n: string }[] = await db.query(
        'SELECT COUNT(*) AS n FROM information_schema.INNODB_TRX t JOIN performance_schema.processlist p ON p.ID = t.trx_mysql_thread_id WHERE p.DB = ?',
        [String(db.options.database)],
      );
      expect(Number(open[0]?.n)).toBe(0);

      const email = parseActivationMail(mail.attempts[0]);
      const link = (await db.query(
        'SELECT tai_khoan_id AS id FROM ma_xac_thuc WHERE ma_xac_thuc_id = ?',
        [email.id],
      )) as { id: string }[];
      taiKhoanId = String(link[0]?.id);
      const runner = db.createQueryRunner();
      try {
        await runner.startTransaction();
        await expect(
          runner.query(
            'SELECT tai_khoan_id FROM tai_khoan WHERE tai_khoan_id = ? FOR UPDATE NOWAIT',
            [taiKhoanId],
          ),
        ).resolves.toHaveLength(1);
        await runner.rollbackTransaction();
      } finally {
        await runner.release();
      }
      const [row] = await linksOf(db, taiKhoanId);
      expect(row?.daGuiLuc).toBeNull();
      expect(row?.thuHoiLuc).toBeNull();
    } finally {
      // LUÔN thả thư đang bị giữ: ca đỏ mà để lời gọi tạo treo sẽ giữ giao dịch và làm treo cả các ca sau
      mail.holding = false;
      mail.release();
    }
    await expect(pending).resolves.toMatchObject({
      guiEmail: { ketQua: 'DaGui' },
    });
    const [sent] = await linksOf(db, taiKhoanId);
    expect(sent?.daGuiLuc).not.toBeNull();
  });
});
