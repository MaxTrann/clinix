import type { UnauthorizedException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import { insertTaiKhoan } from '../entities/testing/auth-fixtures.js';
import { TaiKhoanRepository } from '../repositories/tai-khoan.repository.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import { MeService } from './me.service.js';

// Task A15 — đọc hồ sơ trên MySQL 8.4 THẬT: cột đọc ra, và các nhánh "guard đã qua nhưng hàng đổi giữa chừng" (HTTP không chạm tới được vì guard chặn trước). Mã ME-nn là [đề xuất].
const accounts = new TaiKhoanRepository();
const SESSION_LOST = 'PHIEN_HET_HIEU_LUC';

let db: DataSource;
let service: MeService;

useIntegrationHooks((testDb) => {
  db = testDb;
  service = new MeService(testDb, accounts);
});

async function expectSessionLost(accountId: string) {
  const error = await service.getProfile(accountId).then(
    () => null,
    (reason: unknown) => reason as UnauthorizedException,
  );
  expect(error?.message).toBe(SESSION_LOST);
  expect(error?.getStatus()).toBe(401);
}

describe('MeService trên MySQL thật', () => {
  it('ME-01 (DN-23) findProfile chỉ mang đúng 5 cột; hàng không có băm, email, số điện thoại', async () => {
    const account = await insertTaiKhoan(db, { hoTen: 'Lê Văn C' });

    const row = await accounts.findProfile(db.manager, account.taiKhoanId);

    // TypeORM để undefined ở cột không chọn; JSON bỏ các khoá đó nên chỉ còn cột thật sự đọc ra
    expect(JSON.parse(JSON.stringify(row))).toStrictEqual({
      taiKhoanId: account.taiKhoanId,
      hoTen: 'Lê Văn C',
      daXacMinhEmail: false,
      loaiTaiKhoan: 'BenhNhan',
      trangThai: 'DangHoatDong',
    });
  });

  it('ME-02 findProfile lấy đúng hàng của mã được hỏi khi bảng có nhiều hàng; mã không tồn tại ⇒ null', async () => {
    await insertTaiKhoan(db, { hoTen: 'Người Đầu' });
    const wanted = await insertTaiKhoan(db, { hoTen: 'Người Cần' });
    await insertTaiKhoan(db, { hoTen: 'Người Cuối' });

    const row = await accounts.findProfile(db.manager, wanted.taiKhoanId);

    expect(row?.hoTen).toBe('Người Cần');
    await expect(
      accounts.findProfile(db.manager, '999999'),
    ).resolves.toBeNull();
  });

  it('ME-03 hàng bị xoá sau khi guard đã qua ⇒ 401 PHIEN_HET_HIEU_LUC, không 500', async () => {
    const account = await insertTaiKhoan(db);
    await db.getRepository(TaiKhoan).delete(account.taiKhoanId);

    await expectSessionLost(account.taiKhoanId);
  });

  it('ME-04 tài khoản bị ngưng sau khi guard đã qua ⇒ 401 PHIEN_HET_HIEU_LUC', async () => {
    const account = await insertTaiKhoan(db, { trangThai: 'NgungHoatDong' });

    await expectSessionLost(account.taiKhoanId);
  });

  it('ME-05 tài khoản ChoKichHoat (mật khẩu NULL) ⇒ 401 PHIEN_HET_HIEU_LUC', async () => {
    const account = await insertTaiKhoan(db, {
      trangThai: 'ChoKichHoat',
      matKhauBam: null,
      loaiTaiKhoan: 'LeTan', // CHECK cấm Bệnh nhân ở ChoKichHoat
    });

    await expectSessionLost(account.taiKhoanId);
  });
});
