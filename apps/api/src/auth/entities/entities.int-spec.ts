import type { DataSource } from 'typeorm';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../database/testing/test-database.js';
import { BenhNhan } from './benh-nhan.entity.js';
import { MaXacThuc } from './ma-xac-thuc.entity.js';
import { PhienDangNhap } from './phien-dang-nhap.entity.js';
import { TaiKhoan } from './tai-khoan.entity.js';
import {
  dbErrorCode,
  insertBenhNhan,
  insertMaXacThuc,
  insertPhienDangNhap,
  insertTaiKhoan,
  insertViNoiBo,
} from './testing/auth-fixtures.js';
import { ViNoiBo } from './vi-noi-bo.entity.js';

// Task P3 — không có mã test case riêng trong plan auth. Kiểm entity khớp bảng thật và các ràng buộc ở tầng DB
// (CHECK, UNIQUE, khóa ngoại, cột sinh, khóa hàng, rollback) trên MySQL thật.
let db: DataSource;

beforeAll(async () => {
  db = await createTestDataSource(readTestDbSettings());
});

beforeEach(async () => {
  await resetTables(db);
});

afterAll(async () => {
  await db?.destroy();
});

const DUP = 'ER_DUP_ENTRY';
const CHECK = 'ER_CHECK_CONSTRAINT_VIOLATED';

describe('entity ↔ bảng', () => {
  it('lưu rồi đọc lại tai_khoan: giá trị mặc định của DB, kiểu bigint là chuỗi, boolean là boolean', async () => {
    const saved = await insertTaiKhoan(db);
    const found = await db
      .getRepository(TaiKhoan)
      .findOneByOrFail({ taiKhoanId: saved.taiKhoanId });

    expect(typeof found.taiKhoanId).toBe('string');
    expect(found.trangThai).toBe('DangHoatDong');
    expect(found.daXacMinhEmail).toBe(false);
    expect(found.soLanDangNhapSai).toBe(0);
    expect(found.khoaDangNhapDen).toBeNull();
    expect(found.thoiDiemTao).toBeInstanceOf(Date);
  });

  it('giữ nguyên tiếng Việt có dấu và ký tự ngoài BMP (utf8mb4)', async () => {
    const hoTen = 'Nguyễn Thị Ánh Tuyết 😀';
    const saved = await insertTaiKhoan(db, {
      hoTen,
      diaChi: 'Số 1 Võ Văn Ngân, Thủ Đức',
    });
    const found = await db
      .getRepository(TaiKhoan)
      .findOneByOrFail({ taiKhoanId: saved.taiKhoanId });
    expect(found.hoTen).toBe(hoTen);
    expect(found.diaChi).toBe('Số 1 Võ Văn Ngân, Thủ Đức');
  });

  it('quan hệ 1–1 tai_khoan → benh_nhan → vi_noi_bo đọc được cả hai chiều; số tiền là chuỗi decimal', async () => {
    const taiKhoan = await insertTaiKhoan(db);
    const benhNhan = await insertBenhNhan(db, taiKhoan.taiKhoanId);
    const vi = await insertViNoiBo(db, benhNhan.taiKhoanId);

    const tuTaiKhoan = await db.getRepository(TaiKhoan).findOneOrFail({
      where: { taiKhoanId: taiKhoan.taiKhoanId },
      relations: { benhNhan: { viNoiBo: true } },
    });
    expect(tuTaiKhoan.benhNhan?.viNoiBo?.viNoiBoId).toBe(vi.viNoiBoId);
    expect(tuTaiKhoan.benhNhan?.viNoiBo?.soDu).toBe('0.00');
    expect(tuTaiKhoan.benhNhan?.viNoiBo?.soTienDangGiu).toBe('0.00');

    const tuVi = await db.getRepository(ViNoiBo).findOneOrFail({
      where: { viNoiBoId: vi.viNoiBoId },
      relations: { benhNhan: { taiKhoan: true } },
    });
    expect(tuVi.benhNhan.taiKhoan.email).toBe(taiKhoan.email);
  });

  it('ma_xac_thuc và phien_dang_nhap trỏ về tai_khoan; cột sinh không bao giờ bị ghi từ ứng dụng', async () => {
    const taiKhoan = await insertTaiKhoan(db);
    const otp = await insertMaXacThuc(db, taiKhoan.taiKhoanId);
    const phien = await insertPhienDangNhap(db, taiKhoan.taiKhoanId);

    const otpDaDoc = await db.getRepository(MaXacThuc).findOneOrFail({
      where: { maXacThucId: otp.maXacThucId },
      relations: { taiKhoan: true },
    });
    expect(otpDaDoc.taiKhoan?.taiKhoanId).toBe(taiKhoan.taiKhoanId);
    expect(otpDaDoc.soLanNhapSai).toBe(0);
    expect(otpDaDoc.kichHoatDangHieuLuc).toBeNull();

    const phienDaDoc = await db.getRepository(PhienDangNhap).findOneOrFail({
      where: { phienDangNhapId: phien.phienDangNhapId },
      relations: { taiKhoan: true },
    });
    expect(phienDaDoc.taiKhoan?.taiKhoanId).toBe(taiKhoan.taiKhoanId);
    expect(phienDaDoc.thuHoiLuc).toBeNull();
  });
});

describe('UNIQUE', () => {
  it('email trùng bị từ chối, kể cả khác hoa/thường hoặc dấu (collation utf8mb4_unicode_ci)', async () => {
    await insertTaiKhoan(db, { email: 'Nguoi.Dung@Example.com' });
    expect(
      await dbErrorCode(
        insertTaiKhoan(db, { email: 'Nguoi.Dung@Example.com' }),
      ),
    ).toBe(DUP);
    expect(
      await dbErrorCode(
        insertTaiKhoan(db, { email: 'nguoi.dung@example.com' }),
      ),
    ).toBe(DUP);
    expect(
      await dbErrorCode(
        insertTaiKhoan(db, {
          email: 'nguoi.dung@example.com'.replace('o', 'ó'),
        }),
      ),
    ).toBe(DUP);
    expect(
      await dbErrorCode(
        insertTaiKhoan(db, { email: 'nguoi.khac@example.com' }),
      ),
    ).toBeNull();
  });

  it('refresh_token_bam trùng bị từ chối', async () => {
    const taiKhoan = await insertTaiKhoan(db);
    await insertPhienDangNhap(db, taiKhoan.taiKhoanId, {
      refreshTokenBam: 'trung',
    });
    expect(
      await dbErrorCode(
        insertPhienDangNhap(db, taiKhoan.taiKhoanId, {
          refreshTokenBam: 'trung',
        }),
      ),
    ).toBe(DUP);
  });

  it('mỗi bệnh nhân đúng một ví (vi_noi_bo.benh_nhan_id UNIQUE)', async () => {
    const taiKhoan = await insertTaiKhoan(db);
    const benhNhan = await insertBenhNhan(db, taiKhoan.taiKhoanId);
    await insertViNoiBo(db, benhNhan.taiKhoanId);
    expect(await dbErrorCode(insertViNoiBo(db, benhNhan.taiKhoanId))).toBe(DUP);
  });

  it('kich_hoat_dang_hieu_luc: tối đa một liên kết kích hoạt hợp lệ mỗi tài khoản; thu hồi rồi mới tạo lại được', async () => {
    const nhanSu = await insertTaiKhoan(db, {
      loaiTaiKhoan: 'LeTan',
      trangThai: 'ChoKichHoat',
      matKhauBam: null,
    });
    const guiLuc = new Date();
    const lienKet = await insertMaXacThuc(db, nhanSu.taiKhoanId, {
      loai: 'KichHoatNhanSu',
      daGuiLuc: guiLuc,
      hoTenDangKy: null,
      soDienThoaiDangKy: null,
      matKhauBamDangKy: null,
    });
    const doc = await db
      .getRepository(MaXacThuc)
      .findOneByOrFail({ maXacThucId: lienKet.maXacThucId });
    expect(doc.kichHoatDangHieuLuc).toBe(nhanSu.taiKhoanId); // cột sinh = tai_khoan_id khi liên kết đang hiệu lực

    const lienKetMoi = {
      loai: 'KichHoatNhanSu' as const,
      daGuiLuc: guiLuc,
      hoTenDangKy: null,
      soDienThoaiDangKy: null,
      matKhauBamDangKy: null,
    };
    expect(
      await dbErrorCode(insertMaXacThuc(db, nhanSu.taiKhoanId, lienKetMoi)),
    ).toBe(DUP);

    // Liên kết chưa gửi thành công (da_gui_luc NULL) chưa tính là hợp lệ nên không vướng UNIQUE
    expect(
      await dbErrorCode(
        insertMaXacThuc(db, nhanSu.taiKhoanId, {
          ...lienKetMoi,
          daGuiLuc: null,
        }),
      ),
    ).toBeNull();

    await db
      .getRepository(MaXacThuc)
      .update({ maXacThucId: lienKet.maXacThucId }, { thuHoiLuc: new Date() });
    expect(
      await dbErrorCode(insertMaXacThuc(db, nhanSu.taiKhoanId, lienKetMoi)),
    ).toBeNull();
  });
});

describe('CHECK', () => {
  it('chk_tai_khoan_mat_khau: DangHoatDong bắt buộc có mật khẩu; ChoKichHoat bắt buộc không có; NgungHoatDong tùy', async () => {
    expect(
      await dbErrorCode(
        insertTaiKhoan(db, { trangThai: 'DangHoatDong', matKhauBam: null }),
      ),
    ).toBe(CHECK);
    expect(
      await dbErrorCode(
        insertTaiKhoan(db, {
          trangThai: 'ChoKichHoat',
          loaiTaiKhoan: 'BacSi',
          matKhauBam: 'x',
        }),
      ),
    ).toBe(CHECK);
    expect(
      await dbErrorCode(
        insertTaiKhoan(db, {
          trangThai: 'ChoKichHoat',
          loaiTaiKhoan: 'BacSi',
          matKhauBam: null,
        }),
      ),
    ).toBeNull();
    expect(
      await dbErrorCode(
        insertTaiKhoan(db, { trangThai: 'NgungHoatDong', matKhauBam: null }),
      ),
    ).toBeNull();
    expect(
      await dbErrorCode(
        insertTaiKhoan(db, { trangThai: 'NgungHoatDong', matKhauBam: 'x' }),
      ),
    ).toBeNull();
  });

  it('chk_tai_khoan_cho_kich_hoat_nhan_su: tài khoản Bệnh nhân không được ở trạng thái ChoKichHoat', async () => {
    expect(
      await dbErrorCode(
        insertTaiKhoan(db, {
          trangThai: 'ChoKichHoat',
          loaiTaiKhoan: 'BenhNhan',
          matKhauBam: null,
        }),
      ),
    ).toBe(CHECK);
  });

  it('chk_ma_xac_thuc_dung_hoac_thu_hoi: một mã không thể vừa đã dùng vừa bị thu hồi', async () => {
    const taiKhoan = await insertTaiKhoan(db);
    const luc = new Date();
    expect(
      await dbErrorCode(
        insertMaXacThuc(db, taiKhoan.taiKhoanId, {
          daDungLuc: luc,
          thuHoiLuc: luc,
        }),
      ),
    ).toBe(CHECK);
    expect(
      await dbErrorCode(
        insertMaXacThuc(db, taiKhoan.taiKhoanId, { daDungLuc: luc }),
      ),
    ).toBeNull();
    expect(
      await dbErrorCode(
        insertMaXacThuc(db, taiKhoan.taiKhoanId, { thuHoiLuc: luc }),
      ),
    ).toBeNull();
  });

  it('chk_ma_xac_thuc_kich_hoat_da_gui: liên kết kích hoạt đã dùng thì phải đã gửi', async () => {
    const nhanSu = await insertTaiKhoan(db, {
      loaiTaiKhoan: 'BacSi',
      trangThai: 'ChoKichHoat',
      matKhauBam: null,
    });
    const base = {
      loai: 'KichHoatNhanSu' as const,
      hoTenDangKy: null,
      soDienThoaiDangKy: null,
      matKhauBamDangKy: null,
    };
    const luc = new Date();
    expect(
      await dbErrorCode(
        insertMaXacThuc(db, nhanSu.taiKhoanId, {
          ...base,
          daDungLuc: luc,
          daGuiLuc: null,
        }),
      ),
    ).toBe(CHECK);
    expect(
      await dbErrorCode(
        insertMaXacThuc(db, nhanSu.taiKhoanId, {
          ...base,
          daDungLuc: luc,
          daGuiLuc: luc,
        }),
      ),
    ).toBeNull();
  });

  it('chk_ma_xac_thuc_du_lieu_dang_ky: ba cột đăng ký cùng NULL hoặc cùng có giá trị và chỉ với loai = DangKy', async () => {
    const taiKhoan = await insertTaiKhoan(db);
    const id = taiKhoan.taiKhoanId;
    const khongCo = {
      hoTenDangKy: null,
      soDienThoaiDangKy: null,
      matKhauBamDangKy: null,
    };

    expect(await dbErrorCode(insertMaXacThuc(db, id, khongCo))).toBeNull(); // DangKy đã dùng xong: dữ liệu bị xóa
    expect(await dbErrorCode(insertMaXacThuc(db, id))).toBeNull(); // đủ ba cột
    expect(
      await dbErrorCode(
        insertMaXacThuc(db, id, { ...khongCo, hoTenDangKy: 'A' }),
      ),
    ).toBe(CHECK); // thiếu 2 cột
    expect(
      await dbErrorCode(insertMaXacThuc(db, id, { matKhauBamDangKy: null })),
    ).toBe(CHECK); // thiếu 1 cột
    expect(
      await dbErrorCode(insertMaXacThuc(db, id, { loai: 'QuenMatKhau' })),
    ).toBe(CHECK); // sai loại
    expect(
      await dbErrorCode(
        insertMaXacThuc(db, id, { loai: 'QuenMatKhau', ...khongCo }),
      ),
    ).toBeNull();
  });

  it('chk_vi_so_du: số dư và số tiền đang giữ không âm, đang giữ không vượt số dư', async () => {
    const taiKhoan = await insertTaiKhoan(db);
    const benhNhan = await insertBenhNhan(db, taiKhoan.taiKhoanId);
    const id = benhNhan.taiKhoanId;
    const vi = await insertViNoiBo(db, id, {
      soDu: '100000.00',
      soTienDangGiu: '100000.00',
    }); // biên: bằng nhau là hợp lệ
    const capNhat = (values: Partial<ViNoiBo>) =>
      db.getRepository(ViNoiBo).update({ viNoiBoId: vi.viNoiBoId }, values);

    expect(await dbErrorCode(capNhat({ soTienDangGiu: '100000.01' }))).toBe(
      CHECK,
    );
    expect(
      await dbErrorCode(capNhat({ soDu: '-0.01', soTienDangGiu: '0.00' })),
    ).toBe(CHECK);
    expect(
      await dbErrorCode(capNhat({ soDu: '5.00', soTienDangGiu: '-1.00' })),
    ).toBe(CHECK);
    expect(
      await dbErrorCode(capNhat({ soDu: '0.00', soTienDangGiu: '0.00' })),
    ).toBeNull();
  });
});

describe('khóa ngoại', () => {
  it('không tạo được dòng con trỏ tới tai_khoan không tồn tại', async () => {
    expect(await dbErrorCode(insertMaXacThuc(db, '999999'))).toBe(
      'ER_NO_REFERENCED_ROW_2',
    );
    expect(await dbErrorCode(insertPhienDangNhap(db, '999999'))).toBe(
      'ER_NO_REFERENCED_ROW_2',
    );
    expect(await dbErrorCode(insertBenhNhan(db, '999999'))).toBe(
      'ER_NO_REFERENCED_ROW_2',
    );
    expect(await dbErrorCode(insertViNoiBo(db, '999999'))).toBe(
      'ER_NO_REFERENCED_ROW_2',
    );
  });

  it('không xóa được dòng cha khi còn dòng con (RESTRICT); xóa từ con lên cha thì được', async () => {
    const taiKhoan = await insertTaiKhoan(db);
    const benhNhan = await insertBenhNhan(db, taiKhoan.taiKhoanId);
    const vi = await insertViNoiBo(db, benhNhan.taiKhoanId);
    const otp = await insertMaXacThuc(db, taiKhoan.taiKhoanId);
    const phien = await insertPhienDangNhap(db, taiKhoan.taiKhoanId);

    expect(
      await dbErrorCode(db.getRepository(TaiKhoan).delete(taiKhoan.taiKhoanId)),
    ).toBe('ER_ROW_IS_REFERENCED_2');
    expect(
      await dbErrorCode(db.getRepository(BenhNhan).delete(benhNhan.taiKhoanId)),
    ).toBe('ER_ROW_IS_REFERENCED_2');

    await db.getRepository(ViNoiBo).delete(vi.viNoiBoId);
    await db.getRepository(MaXacThuc).delete(otp.maXacThucId);
    await db.getRepository(PhienDangNhap).delete(phien.phienDangNhapId);
    await db.getRepository(BenhNhan).delete(benhNhan.taiKhoanId);
    expect(
      await dbErrorCode(db.getRepository(TaiKhoan).delete(taiKhoan.taiKhoanId)),
    ).toBeNull();
  });
});

describe('giao dịch và khóa hàng', () => {
  it('lỗi giữa chừng thì ROLLBACK: không còn tai_khoan/benh_nhan/vi_noi_bo nào', async () => {
    await expect(
      db.transaction(async (manager) => {
        const taiKhoan = await insertTaiKhoan(manager);
        const benhNhan = await insertBenhNhan(manager, taiKhoan.taiKhoanId);
        await insertViNoiBo(manager, benhNhan.taiKhoanId);
        throw new Error('lỗi giả lập sau khi đã ghi 3 bảng');
      }),
    ).rejects.toThrow('lỗi giả lập');

    expect(await db.getRepository(TaiKhoan).count()).toBe(0);
    expect(await db.getRepository(BenhNhan).count()).toBe(0);
    expect(await db.getRepository(ViNoiBo).count()).toBe(0);
  });

  it('FOR UPDATE NOWAIT: giao dịch thứ hai bị từ chối ngay khi hàng đang bị khóa, mở khóa xong thì lấy được', async () => {
    const taiKhoan = await insertTaiKhoan(db);
    const lockRow = (manager: DataSource['manager']) =>
      manager
        .createQueryBuilder(TaiKhoan, 'tk')
        .setLock('pessimistic_write')
        .setOnLocked('nowait')
        .where('tk.taiKhoanId = :id', { id: taiKhoan.taiKhoanId })
        .getOne();

    const first = db.createQueryRunner();
    const second = db.createQueryRunner();
    try {
      await first.connect();
      await second.connect();
      await first.startTransaction();
      await second.startTransaction();
      expect((await lockRow(first.manager))?.taiKhoanId).toBe(
        taiKhoan.taiKhoanId,
      );
      expect(await dbErrorCode(lockRow(second.manager))).toBe('ER_LOCK_NOWAIT');

      await first.commitTransaction();
      expect((await lockRow(second.manager))?.taiKhoanId).toBe(
        taiKhoan.taiKhoanId,
      );
      await second.commitTransaction();
    } finally {
      await first.release();
      await second.release();
    }
  });
});
