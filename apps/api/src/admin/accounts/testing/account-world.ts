import type { DataSource } from 'typeorm';
import type { TaiKhoan } from '../../../auth/entities/tai-khoan.entity.js';
import {
  insertMaXacThuc,
  insertPhienDangNhap,
  insertTaiKhoan,
} from '../../../auth/entities/testing/auth-fixtures.js';
import type { BacSi } from '../../entities/bac-si.entity.js';
import type { ChiNhanh } from '../../entities/chi-nhanh.entity.js';
import type { TrangThaiLichHen } from '../../entities/enums.js';
import { HoSoNguoiThan } from '../../entities/ho-so-nguoi-than.entity.js';
import type { LichLamViec } from '../../entities/lich-lam-viec.entity.js';
import { AdminFixtures } from '../../testing/admin-fixtures.js';

// Chuỗi mồi đặt vào các cột bí mật của DB: nếu một phản hồi của API chứa bất kỳ chuỗi nào dưới đây thì API đã lộ dữ liệu cấm.
export const PASSWORD_HASH_MARK = 'MOIMATKHAUBAM';
export const LINK_DIGEST = `${'c0ffee'.repeat(10)}c0ff`; // 64 ký tự hex
export const REFRESH_MARK = 'MOIPHIENDANGNHAP';
export const SENTINELS = [PASSWORD_HASH_MARK, LINK_DIGEST, REFRESH_MARK];

type Pair = { account: TaiKhoan };
const SLOT_START = Date.parse('2026-11-02T01:00:00.000Z');

/** Mọi tài khoản, hồ sơ và lịch hẹn của một "thế giới" thử: hai chi nhánh, đủ bốn loại tài khoản. */
export interface AccountWorld {
  branchA: ChiNhanh;
  branchB: ChiNhanh;
  sysAdmin: Pair;
  adminA: Pair;
  adminB: Pair;
  doctorA: Pair & { profile: BacSi };
  /** Bác sĩ chi nhánh A đang `ChoKichHoat`, có liên kết kích hoạt còn hạn. */
  pendingDoctorA: Pair & { profile: BacSi };
  doctorB: Pair & { profile: BacSi };
  receptionistA: Pair;
  receptionistB: Pair;
  /** Bệnh nhân chỉ có lịch ở A. */
  onlyA: Pair;
  /** Bệnh nhân chỉ có lịch ở B. */
  onlyB: Pair;
  /** Bệnh nhân có lịch ở cả A và B. */
  both: Pair;
  /** Bệnh nhân chưa từng đặt lịch. */
  none: Pair;
  /** Bệnh nhân có ba lịch ở A (một dòng, không nhân đôi). */
  manyA: Pair;
  /** Bệnh nhân chỉ đặt lịch cho NGƯỜI THÂN ở A. */
  relativeA: Pair;
  /** Bệnh nhân bị khoá no-show, có lịch ở A. */
  lockedA: Pair;
  /** Bệnh nhân chưa xác minh OTP: có `tai_khoan` nhưng KHÔNG có dòng `benh_nhan`. */
  unverified: TaiKhoan;
  /** Bác sĩ thiếu dòng `bac_si` (dữ liệu hỏng). */
  brokenDoctor: TaiKhoan;
  /** Mọi tài khoản của thế giới, theo thứ tự tạo. */
  all: TaiKhoan[];
}

/** Dựng thế giới thử trên DB đã `resetTables`. Họ tên có tiền tố để dễ tìm và sắp xếp; mọi cột bí mật mang chuỗi mồi. */
export async function buildAccountWorld(db: DataSource): Promise<AccountWorld> {
  const fx = new AdminFixtures(db);
  const all: TaiKhoan[] = [];
  let counter = 0;
  const identity = (hoTen: string, overrides: Partial<TaiKhoan> = {}) => {
    counter += 1;
    return {
      hoTen,
      email: `tk.thu.${String(counter)}@example.com`,
      soDienThoai: `09000${String(counter).padStart(5, '0')}`,
      ngaySinh: '1990-05-17',
      gioiTinh: 'Nam',
      diaChi: `Địa chỉ của ${hoTen}`,
      matKhauBam: `$argon2id$v=19$m=19456,t=2,p=1$${PASSWORD_HASH_MARK}${String(counter)}$digest`,
      ...overrides,
    } satisfies Partial<TaiKhoan>;
  };
  const track = async <T extends Pair>(made: T): Promise<T> => {
    all.push(made.account);
    // Mỗi tài khoản có một phiên đăng nhập mang chuỗi mồi: API tài khoản không được lộ nó.
    await insertPhienDangNhap(db, made.account.taiKhoanId, {
      refreshTokenBam: `${REFRESH_MARK}${made.account.taiKhoanId}`,
    });
    return made;
  };

  const branchA = await fx.branch({ ten: 'Chi nhánh A' });
  const branchB = await fx.branch({ ten: 'Chi nhánh B' });

  const sysAdmin = await track(
    await fx.admin(undefined, identity('Admin Toàn hệ thống')),
  );
  const adminA = await track(
    await fx.admin(branchA, identity('Admin Chi nhánh A')),
  );
  const adminB = await track(
    await fx.admin(branchB, identity('Admin Chi nhánh B')),
  );
  const doctorA = await track(
    await fx.doctor(branchA, {}, identity('Bác sĩ A một')),
  );
  const pendingDoctorA = await track(
    await fx.doctor(
      branchA,
      {},
      identity('Bác sĩ A chờ', { trangThai: 'ChoKichHoat', matKhauBam: null }),
    ),
  );
  const doctorB = await track(
    await fx.doctor(branchB, {}, identity('Bác sĩ B một')),
  );
  const receptionistA = await track(
    await fx.receptionist(branchA, identity('Lễ tân A')),
  );
  const receptionistB = await track(
    await fx.receptionist(branchB, identity('Lễ tân B')),
  );

  const patient = async (label: string, overrides: Partial<TaiKhoan> = {}) =>
    track(await fx.patient(identity(label, overrides)));
  const onlyA = await patient('Bệnh nhân chỉ A');
  const onlyB = await patient('Bệnh nhân chỉ B');
  const both = await patient('Bệnh nhân cả hai');
  const none = await patient('Bệnh nhân chưa đặt lịch');
  const manyA = await patient('Bệnh nhân ba lịch A');
  const relativeA = await patient('Bệnh nhân đặt cho người thân');
  const lockedA = await patient('Bệnh nhân bị khoá no-show');
  await db.query(
    'UPDATE benh_nhan SET khoa_dat_lich_do_no_show = 1, so_lan_no_show = 3 WHERE tai_khoan_id = ?',
    [lockedA.account.taiKhoanId],
  );

  const unverified = await insertTaiKhoan(
    db,
    identity('Bệnh nhân chưa xác minh', {
      loaiTaiKhoan: 'BenhNhan',
      daXacMinhEmail: false,
    }),
  );
  all.push(unverified);
  const brokenDoctor = await insertTaiKhoan(
    db,
    identity('Bác sĩ thiếu hồ sơ', { loaiTaiKhoan: 'BacSi' }),
  );
  all.push(brokenDoctor);

  // Liên kết kích hoạt còn hạn của bác sĩ chờ kích hoạt: băm là chuỗi mồi, KHÔNG được lộ.
  await insertMaXacThuc(db, pendingDoctorA.account.taiKhoanId, {
    loai: 'KichHoatNhanSu',
    hoTenDangKy: null,
    soDienThoaiDangKy: null,
    matKhauBamDangKy: null,
    maBam: LINK_DIGEST,
    hetHanLuc: new Date(Date.now() + 24 * 3600 * 1000),
    daGuiLuc: new Date(),
  });

  // Lịch hẹn: mỗi lịch cần một khung giờ riêng (UNIQUE khung_gio_dang_giu cho lịch còn hiệu lực).
  const shifts = new Map<string, LichLamViec>();
  let slotIndex = 0;
  const book = async (
    doctor: BacSi,
    patientId: string,
    status: TrangThaiLichHen = 'DaXacNhan',
    hoSoNguoiThanId?: string,
  ) => {
    let shift = shifts.get(doctor.taiKhoanId);
    if (!shift) {
      shift = await fx.shift(doctor);
      shifts.set(doctor.taiKhoanId, shift);
    }
    slotIndex += 1;
    const slot = await fx.slot(shift, {
      ngayGio: new Date(SLOT_START + slotIndex * 30 * 60 * 1000),
    });
    return fx.appointment(doctor, slot, patientId, {
      trangThai: status,
      ...(hoSoNguoiThanId ? { hoSoNguoiThanId } : {}),
    });
  };

  await book(doctorA.profile, onlyA.account.taiKhoanId);
  await book(doctorB.profile, onlyB.account.taiKhoanId);
  await book(doctorA.profile, both.account.taiKhoanId);
  await book(doctorB.profile, both.account.taiKhoanId);
  for (const status of ['DaXacNhan', 'DaHuy', 'HoanThanh'] as const)
    await book(doctorA.profile, manyA.account.taiKhoanId, status);
  await book(doctorA.profile, lockedA.account.taiKhoanId);

  const relatives = db.getRepository(HoSoNguoiThan);
  const relative = await relatives.save(
    relatives.create({
      benhNhanId: relativeA.account.taiKhoanId,
      hoTen: 'Người thân',
      ngaySinh: '1960-01-01',
      gioiTinh: 'Nu',
      moiQuanHe: 'Me',
    }),
  );
  await book(
    doctorA.profile,
    relativeA.account.taiKhoanId,
    'DaXacNhan',
    relative.hoSoNguoiThanId,
  );

  return {
    branchA,
    branchB,
    sysAdmin,
    adminA,
    adminB,
    doctorA,
    pendingDoctorA,
    doctorB,
    receptionistA,
    receptionistB,
    onlyA,
    onlyB,
    both,
    none,
    manyA,
    relativeA,
    lockedA,
    unverified,
    brokenDoctor,
    all,
  };
}

/**
 * Thêm một lịch hẹn nữa cho Bệnh nhân ở chi nhánh của bác sĩ (dùng cho test phạm vi đổi theo thời gian).
 * Mỗi (bác sĩ, ngày) chỉ gọi MỘT lần: `ngay` khác nhau để ca làm việc không trùng.
 */
export async function bookAppointment(
  db: DataSource,
  doctor: BacSi,
  patientId: string,
  status: TrangThaiLichHen = 'DaXacNhan',
  ngay = '2026-11-09',
) {
  const fx = new AdminFixtures(db);
  const shift = await fx.shift(doctor, { ngay });
  const slot = await fx.slot(shift);
  return fx.appointment(doctor, slot, patientId, { trangThai: status });
}
