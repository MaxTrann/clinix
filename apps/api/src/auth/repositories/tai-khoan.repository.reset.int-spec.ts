import type { DataSource } from 'typeorm';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import { insertTaiKhoan } from '../entities/testing/auth-fixtures.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import { deferred } from '../testing/verification-int-helpers.js';
import { TaiKhoanRepository } from './tai-khoan.repository.js';

// Task A11 — hai câu của quên mật khẩu ở tầng SQL, gọi TRỰC TIẾP (không qua luật `passwordResetRefusalFor`): đúng các cột cần (kể cả họ tên và băm mật khẩu để biết
// đã có mật khẩu hay chưa, không kéo dư cột đăng nhập/SĐT), so email không phân biệt hoa/thường, và `findForPasswordResetForUpdate` THẬT SỰ khoá hàng (S4, Q6).
// Mã RP-Rnn là [đề xuất].
let db: DataSource;
const repo = new TaiKhoanRepository();

useIntegrationHooks((testDb) => {
  db = testDb;
});

const read = (email: string) => repo.findForPasswordReset(db.manager, email);

describe('findForPasswordReset / findForPasswordResetForUpdate', () => {
  it('RP-R01 trả đúng các cột cần cho quên mật khẩu và KHÔNG kéo cột nào khác (SĐT, bộ đếm đăng nhập, khoá tạm)', async () => {
    const account = await insertTaiKhoan(db, { daXacMinhEmail: true });

    const found = await read(account.email);

    expect(found).toMatchObject({
      taiKhoanId: account.taiKhoanId,
      email: account.email,
      hoTen: account.hoTen,
      loaiTaiKhoan: 'BenhNhan',
      daXacMinhEmail: true,
      trangThai: 'DangHoatDong',
      matKhauBam: account.matKhauBam,
    });
    expect(found?.thoiDiemTao).toBeInstanceOf(Date);
    expect(found?.soDienThoai).toBeUndefined();
    expect(found?.soLanDangNhapSai).toBeUndefined();
    expect(found?.khoaDangNhapDen).toBeUndefined();
  });

  it('RP-R02 email so không phân biệt hoa/thường; email lạ trả null', async () => {
    const account = await insertTaiKhoan(db, {
      email: 'Nguoi.Hoa@example.com',
    });

    expect((await read('nguoi.hoa@EXAMPLE.com'))?.taiKhoanId).toBe(
      account.taiKhoanId,
    );
    expect(await read('khong.co@example.com')).toBeNull();
  });

  it('RP-R03 nhân sự chưa từng có mật khẩu: matKhauBam là null (không phải undefined), để luật phân biệt "chưa có mật khẩu"', async () => {
    const pending = await insertTaiKhoan(db, {
      loaiTaiKhoan: 'LeTan',
      trangThai: 'ChoKichHoat',
      matKhauBam: null,
    });

    const found = await read(pending.email);

    expect(found?.matKhauBam).toBeNull();
    expect(found?.trangThai).toBe('ChoKichHoat');
  });

  it('RP-R04 ForUpdate đọc cùng dữ liệu theo khoá chính; mã không tồn tại trả null', async () => {
    const account = await insertTaiKhoan(db);

    const locked = await db.transaction((em) =>
      repo.findForPasswordResetForUpdate(em, account.taiKhoanId),
    );
    const missing = await db.transaction((em) =>
      repo.findForPasswordResetForUpdate(em, '999999999'),
    );

    expect(locked).toEqual(await read(account.email));
    expect(missing).toBeNull();
  });

  it('RP-R05 ForUpdate THẬT SỰ khoá hàng: giao dịch khác ghi cùng hàng bị 1205 (hết thời gian chờ khoá, đặt 1 giây) cho tới khi bên giữ khoá kết thúc; sau đó ghi được', async () => {
    const account = await insertTaiKhoan(db);
    const acquired = deferred();
    const release = deferred();
    const holder = db.transaction('READ COMMITTED', async (em) => {
      await repo.findForPasswordResetForUpdate(em, account.taiKhoanId);
      acquired.resolve();
      await release.promise;
    });
    await acquired.promise;

    const blocked = db.transaction(async (em) => {
      const [{ v }] = (await em.query(
        'SELECT @@SESSION.innodb_lock_wait_timeout AS v',
      )) as [{ v: string }];
      await em.query('SET SESSION innodb_lock_wait_timeout = 1');
      try {
        await em.update(
          TaiKhoan,
          { taiKhoanId: account.taiKhoanId },
          { soLanDangNhapSai: 1 },
        );
      } finally {
        await em.query(`SET SESSION innodb_lock_wait_timeout = ${v}`);
      }
    });
    await expect(blocked).rejects.toMatchObject({
      driverError: { errno: 1205 },
    });

    release.resolve();
    await holder;
    await db
      .getRepository(TaiKhoan)
      .update({ taiKhoanId: account.taiKhoanId }, { soLanDangNhapSai: 1 });
    expect(
      (
        await db
          .getRepository(TaiKhoan)
          .findOneByOrFail({ taiKhoanId: account.taiKhoanId })
      ).soLanDangNhapSai,
    ).toBe(1);
  });
});
