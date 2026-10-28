import type { DataSource } from 'typeorm';
import { BenhNhan } from '../entities/benh-nhan.entity.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import {
  dbErrorCode,
  insertBenhNhan,
  insertTaiKhoan,
} from '../entities/testing/auth-fixtures.js';
import { ViNoiBo } from '../entities/vi-noi-bo.entity.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import { at } from '../testing/otp-int-helpers.js';
import { BenhNhanRepository } from './benh-nhan.repository.js';
import { TaiKhoanRepository } from './tai-khoan.repository.js';
import { ViNoiBoRepository } from './vi-noi-bo.repository.js';

// Task A6 — câu lệnh của xác minh OTP đăng ký trên MySQL thật: UPDATE tài khoản có điều kiện bảo vệ, tạo benh_nhan, tạo vi_noi_bo.
// Mã XM-6n là [đề xuất]. Chạy trong giao dịch như dịch vụ dùng chúng (mọi hàm nhận `em`).
const DATA = {
  hoTen: 'Họ Tên Của Lần Đăng Ký',
  soDienThoai: '0987654321',
  matKhauBam: '$argon2id$v=19$m=19456,t=2,p=1$muoi$bam-cua-lan-dang-ky',
};

const accounts = new TaiKhoanRepository();
const patients = new BenhNhanRepository();
const wallets = new ViNoiBoRepository();
let db: DataSource;

useIntegrationHooks((testDb) => {
  db = testDb;
});

const activate = (id: string): Promise<boolean> =>
  db.transaction((em) => accounts.activateRegistration(em, id, DATA));
const accountOf = (id: string): Promise<TaiKhoan> =>
  db.getRepository(TaiKhoan).findOneByOrFail({ taiKhoanId: id });

describe('TaiKhoanRepository.activateRegistration', () => {
  it('XM-60 ghi họ tên/SĐT/băm của lần đăng ký, đặt đã xác minh, đặt lại bộ đếm và khoá; mọi cột khác giữ nguyên (kể cả thoi_diem_tao)', async () => {
    const seeded = await insertTaiKhoan(db, {
      daXacMinhEmail: false,
      soLanDangNhapSai: 4,
      khoaDangNhapDen: at(900),
      thoiDiemTao: at(-100),
    });

    expect(await activate(seeded.taiKhoanId)).toBe(true);

    const after = await accountOf(seeded.taiKhoanId);
    expect(after).toEqual(
      Object.assign(new TaiKhoan(), seeded, DATA, {
        daXacMinhEmail: true,
        soLanDangNhapSai: 0,
        khoaDangNhapDen: null,
      }),
    );
  });

  it.each<[string, Partial<TaiKhoan>]>([
    ['đã xác minh email', { daXacMinhEmail: true }],
    ['bị ngưng hoạt động', { trangThai: 'NgungHoatDong' }],
    ['là bác sĩ', { loaiTaiKhoan: 'BacSi' }],
    ['là lễ tân', { loaiTaiKhoan: 'LeTan' }],
    ['là quản trị viên', { loaiTaiKhoan: 'QuanTriVien' }],
  ])(
    'XM-61 điều kiện bảo vệ nằm trong chính câu UPDATE: tài khoản %s không bị ghi đè (trả false, không đổi cột nào)',
    async (_label, overrides) => {
      const seeded = await insertTaiKhoan(db, {
        daXacMinhEmail: false,
        ...overrides,
      });

      expect(await activate(seeded.taiKhoanId)).toBe(false);

      expect(await accountOf(seeded.taiKhoanId)).toEqual(seeded);
    },
  );

  it('XM-61 tài khoản không tồn tại → false; chỉ đúng một tài khoản bị ghi, tài khoản khác cùng loại không đổi', async () => {
    const target = await insertTaiKhoan(db, { daXacMinhEmail: false });
    const other = await insertTaiKhoan(db, { daXacMinhEmail: false });

    expect(await activate('987654321')).toBe(false);
    expect(await activate(target.taiKhoanId)).toBe(true);

    expect(await accountOf(other.taiKhoanId)).toEqual(other);
  });
});

describe('BenhNhanRepository.insertNew và ViNoiBoRepository.insertEmpty', () => {
  it('XM-62 hồ sơ bệnh nhân: khoá chính là mã tài khoản, chưa bị khoá đặt lịch, 0 lần no-show', async () => {
    const account = await insertTaiKhoan(db, { daXacMinhEmail: false });

    await db.transaction((em) => patients.insertNew(em, account.taiKhoanId));

    expect(await db.getRepository(BenhNhan).find()).toEqual([
      {
        taiKhoanId: account.taiKhoanId,
        khoaDatLichDoNoShow: false,
        soLanNoShow: 0,
      },
    ]);
  });

  it('XM-62 ví nội bộ: số dư 0.00 và đang giữ 0.00, gắn đúng bệnh nhân', async () => {
    const account = await insertTaiKhoan(db, { daXacMinhEmail: false });
    await insertBenhNhan(db, account.taiKhoanId);

    await db.transaction((em) => wallets.insertEmpty(em, account.taiKhoanId));

    expect(await db.getRepository(ViNoiBo).find()).toEqual([
      expect.objectContaining({
        benhNhanId: account.taiKhoanId,
        soDu: '0.00',
        soTienDangGiu: '0.00',
      }),
    ]);
  });

  it('XM-63 tạo lần hai bị MySQL chặn (khoá chính benh_nhan, UNIQUE vi_noi_bo.benh_nhan_id): ER_DUP_ENTRY, dữ liệu cũ không đổi — cơ sở để dịch vụ coi là dữ liệu hỏng', async () => {
    const account = await insertTaiKhoan(db, { daXacMinhEmail: false });
    await db.transaction(async (em) => {
      await patients.insertNew(em, account.taiKhoanId);
      await wallets.insertEmpty(em, account.taiKhoanId);
    });

    expect(
      await dbErrorCode(
        db.transaction((em) => patients.insertNew(em, account.taiKhoanId)),
      ),
    ).toBe('ER_DUP_ENTRY');
    expect(
      await dbErrorCode(
        db.transaction((em) => wallets.insertEmpty(em, account.taiKhoanId)),
      ),
    ).toBe('ER_DUP_ENTRY');
    expect(await db.getRepository(BenhNhan).count()).toBe(1);
    expect(await db.getRepository(ViNoiBo).count()).toBe(1);
  });

  it('XM-63 khoá ngoại: không tạo hồ sơ cho tài khoản không tồn tại, không tạo ví cho người chưa có hồ sơ bệnh nhân', async () => {
    const account = await insertTaiKhoan(db, { daXacMinhEmail: false });

    expect(
      await dbErrorCode(
        db.transaction((em) => patients.insertNew(em, '987654321')),
      ),
    ).toBe('ER_NO_REFERENCED_ROW_2');
    expect(
      await dbErrorCode(
        db.transaction((em) => wallets.insertEmpty(em, account.taiKhoanId)),
      ),
    ).toBe('ER_NO_REFERENCED_ROW_2');
  });
});
