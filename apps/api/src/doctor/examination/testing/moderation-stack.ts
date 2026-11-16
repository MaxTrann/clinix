import type { DataSource } from 'typeorm';
import type { AdminFixtures } from '../../../admin/testing/admin-fixtures.js';
import type { BookingFixtures } from '../../../appointments/testing/booking-fixtures.js';
import type { StatusWorld } from '../../../appointments/testing/status-world.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import {
  formatCalendarDate,
  parseCalendarDate,
} from '../../../scheduling/calendar-date.js';
import {
  AdminRatingsQueryDto,
  type AdminRatingsQuery,
} from '../moderation/admin-ratings.dto.js';
import { AdminRatingsRepository } from '../moderation/admin-ratings.repository.js';
import { AdminRatingsService } from '../moderation/admin-ratings.service.js';
import { ExamFixtures } from './exam-fixtures.js';
import { setVisitTime } from './patient-exam-stack.js';

// Bộ dựng và đọc dùng chung của int-spec và e2e B7 (doctor-exam; `moderation/admin-ratings.int-spec`, `test/doctor-exam-admin-ratings.e2e-spec`): để jscpd (quét cả `*.int-spec.ts` và `*.e2e-spec.ts`) không thấy cùng một đoạn dựng ở nhiều file.
// Nằm trong `testing/` nên PD-19, HD-08, AR-01 bỏ qua. KHÔNG tính lại công thức của mã đang kiểm: mọi giá trị mong đợi (tên, số đếm, thứ tự) do test viết tay; ở đây chỉ có đường vào (service, truy vấn) và hàm dựng dữ liệu.
// Dữ liệu giả. Mỗi lịch một đánh giá (`UNIQUE lich_hen_id`) và mỗi bác sĩ mỗi ngày MỘT ca sáng (`UNIQUE (bac_si_id, ngay, ca)`): bộ dựng đi tiếp ngày khi hết khung giờ.

type DoctorRef = Awaited<ReturnType<AdminFixtures['doctor']>>;

/** `AdminRatingsService` THẬT trên MySQL thật (`runReadOnly` thật, `BranchAccessPolicy` thật). */
export function adminRatingsService(db: DataSource): AdminRatingsService {
  return new AdminRatingsService(
    db,
    new AdminRatingsRepository(),
    new BranchAccessPolicy(),
  );
}

/**
 * Query của service: giá trị mặc định (`page` 1, `pageSize` 20) và `offset` lấy từ getter THẬT của `AdminRatingsQueryDto`, không tính lại công thức ở test: một `offset` sai trong DTO
 * (`page * pageSize`) làm đỏ cả int-spec, không chỉ dto.spec và e2e (bài học B4).
 */
export function ratingsQuery(
  overrides: Partial<Omit<AdminRatingsQuery, 'offset'>> = {},
): AdminRatingsQuery {
  const query = Object.assign(new AdminRatingsQueryDto(), overrides);
  return {
    trangThai: query.trangThai,
    soSao: query.soSao,
    bacSiId: query.bacSiId,
    chiNhanhId: query.chiNhanhId,
    q: query.q,
    page: query.page,
    pageSize: query.pageSize,
    offset: query.offset,
  };
}

export const SYSTEM_SCOPE: AdminScope = { kind: 'ToanHeThong' };
export const branchScope = (chiNhanhId: string): AdminScope => ({
  kind: 'ChiNhanh',
  chiNhanhId,
});

/** Khoá KHÔNG được có ở MỌI phản hồi của hai route (KDD-20, QHK-08): hồ sơ khám, liên hệ, id nội bộ, tiền. Hằng viết tay, độc lập với mapper. */
export const FORBIDDEN_ADMIN_RATING_KEYS = [
  'trieuChung',
  'chanDoanSoBo',
  'huongXuLy',
  'ghiChuKham',
  'hoSoKham',
  'ngayTaiKhamDuKien',
  'capNhatLanCuoi',
  'soDienThoai',
  'email',
  'lyDoKham',
  'benhNhanId',
  'nguoiDatId',
  'lichHenId',
  'hoSoNguoiThanId',
  'matKhauBam',
  'giaSnapshot',
  'tienCocSnapshot',
  'trangThai',
] as const;

/** Một đánh giá dựng sẵn: các id để test so với phản hồi. */
export interface SeededRating {
  danhGiaId: string;
  lichHenId: string;
  maLichHen: string;
}

export interface RatingSpec {
  /** Mặc định bác sĩ của chi nhánh A */
  doctor?: DoctorRef;
  /** Tài khoản ĐẶT lịch (người đánh giá); mặc định Bệnh nhân thứ nhất */
  buyer?: string;
  /** `thoi_diem_tao` 'YYYY-MM-DD HH:mm:ss' giờ VN, ghi bằng CHUỖI */
  at?: string;
  soSao?: number;
  nhanXet?: string | null;
  /** Có ⇒ đánh giá đã ẩn (`bi_an` = 1) với lý do này; vắng ⇒ đang hiển thị */
  hiddenReason?: string;
  /** Giờ khám 'YYYY-MM-DD HH:mm:ss' giờ VN (đặt lại sau khi dựng lịch) */
  visitAt?: string;
}

/**
 * Thế giới kiểm duyệt: BA chi nhánh A (của `StatusWorld`), B (`otherBranch`), C; bác sĩ mỗi chi nhánh; ba Bệnh nhân (người đặt) với tên KHÁC NHAU; Admin Toàn hệ thống, Admin Chi nhánh A và B.
 * Tên đặt riêng (bộ dựng mặc định cho mọi tài khoản cùng tên): lộn hai bí danh tên (bác sĩ với người đặt, chi nhánh) thì test đỏ.
 */
export async function moderationWorld(
  db: DataSource,
  fx: BookingFixtures,
  w: StatusWorld,
) {
  const exam = new ExamFixtures(db);
  const branchC = await fx.admin.branch();
  const branches = { a: w.branch, b: w.otherBranch, c: branchC };
  const doctors = {
    a: w.doctor,
    b: await fx.admin.doctor(branches.b),
    c: await fx.admin.doctor(branches.c),
  };
  const buyers = {
    one: w.patientId,
    two: w.secondPatientId,
    three: (await fx.admin.patient()).account.taiKhoanId,
  };
  const names = {
    branchA: 'Chi nhánh Một',
    branchB: 'Chi nhánh Hai',
    branchC: 'Chi nhánh Ba',
    doctorA: 'Bác sĩ Ây',
    doctorB: 'Bác sĩ Bê',
    doctorC: 'Bác sĩ Xê',
    buyerOne: 'Nguyễn Văn An',
    buyerTwo: 'Trần Thị Bình',
    buyerThree: 'Lê Hoàng Cường',
  };
  const nameBranch = (id: string, value: string) =>
    db.query('UPDATE chi_nhanh SET ten = ? WHERE chi_nhanh_id = ?', [
      value,
      id,
    ]);
  const nameAccount = (id: string, value: string) =>
    db.query('UPDATE tai_khoan SET ho_ten = ? WHERE tai_khoan_id = ?', [
      value,
      id,
    ]);
  await nameBranch(branches.a.chiNhanhId, names.branchA);
  await nameBranch(branches.b.chiNhanhId, names.branchB);
  await nameBranch(branches.c.chiNhanhId, names.branchC);
  await nameAccount(doctors.a.account.taiKhoanId, names.doctorA);
  await nameAccount(doctors.b.account.taiKhoanId, names.doctorB);
  await nameAccount(doctors.c.account.taiKhoanId, names.doctorC);
  await nameAccount(buyers.one, names.buyerOne);
  await nameAccount(buyers.two, names.buyerTwo);
  await nameAccount(buyers.three, names.buyerThree);
  const admins = {
    system: w.systemAdmin,
    a: w.branchAdmin,
    b: await fx.admin.admin(branches.b),
  };

  // Khung giờ còn trống của từng bác sĩ; hết thì mở ca sáng của ngày kế (từ 11/11/2026: không đụng ngày 10/11 của thế giới test)
  const free = new Map<string, string[]>();
  const nextDay = new Map<string, number>();
  async function nextSlot(doctor: DoctorRef): Promise<string> {
    const id = doctor.account.taiKhoanId;
    let slots = free.get(id) ?? [];
    if (slots.length === 0) {
      const day = nextDay.get(id) ?? parseCalendarDate('2026-11-11') ?? 0;
      const opened = await fx.doctor.shiftWithSlots(doctor.profile, {
        ngay: formatCalendarDate(day),
        ca: 'CaSang',
      });
      nextDay.set(id, day + 1);
      slots = [...opened.slotIds];
    }
    const slot = slots.shift();
    if (slot === undefined) throw new Error('thiếu khung giờ');
    free.set(id, slots);
    return slot;
  }

  /** Một lịch `HoanThanh` của `buyer` với `doctor` kèm MỘT đánh giá; chi nhánh của lịch là chi nhánh HIỆN TẠI của bác sĩ lúc dựng. */
  async function seed(spec: RatingSpec = {}): Promise<SeededRating> {
    const doctor = spec.doctor ?? doctors.a;
    const lich = await fx.appointmentIn('HoanThanh', {
      doctor: doctor.profile,
      khungGioId: await nextSlot(doctor),
      patientId: spec.buyer ?? buyers.one,
      hoSoNguoiThanId: null,
    });
    if (spec.visitAt !== undefined)
      await setVisitTime(db, lich.lichHenId, spec.visitAt);
    const danhGiaId = await exam.rating(lich.lichHenId, {
      soSao: spec.soSao ?? 5,
      nhanXet: spec.nhanXet ?? null,
      biAn: spec.hiddenReason !== undefined,
      lyDoAn: spec.hiddenReason ?? null,
      ...(spec.at === undefined ? {} : { thoiDiemTao: spec.at }),
    });
    return {
      danhGiaId,
      lichHenId: lich.lichHenId,
      maLichHen: lich.maLichHen,
    };
  }

  return {
    w,
    exam,
    branches,
    doctors,
    buyers,
    admins,
    names,
    seed,
    /** Bác sĩ chuyển sang chi nhánh khác SAU khi đã có lịch: lịch cũ giữ chi nhánh lúc đặt (L10); lịch dựng SAU đó mang chi nhánh mới (hồ sơ trong bộ nhớ cũng đổi). */
    moveDoctor: async (doctor: DoctorRef, chiNhanhId: string) => {
      await db.query(
        'UPDATE bac_si SET chi_nhanh_id = ? WHERE tai_khoan_id = ?',
        [chiNhanhId, doctor.account.taiKhoanId],
      );
      doctor.profile.chiNhanhId = chiNhanhId;
    },
    /** Đổi họ tên một tài khoản (người đặt) để dựng ca `LIKE` */
    renameAccount: nameAccount,
  };
}

export type ModerationWorld = Awaited<ReturnType<typeof moderationWorld>>;

/** Số dòng của sáu bảng mà ĐỌC danh sách KHÔNG được đụng (KDD-17): đánh giá, lịch, hồ sơ, thông báo, thư, nhật ký. */
export async function untouchedByModerationRead(db: DataSource) {
  const tables = [
    'danh_gia_bac_si',
    'lich_hen',
    'ho_so_kham',
    'thong_bao',
    'email_thong_bao',
    'nhat_ky_hanh_dong',
  ] as const;
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const rows = await db.query<{ n: string }[]>(
      `SELECT COUNT(*) AS n FROM ${table}`,
    );
    counts[table] = Number(rows[0]?.n);
  }
  return counts;
}

/** Id của các dòng của một trang, theo thứ tự trả về. */
export const idsOf = (page: { items: { danhGiaId: string }[] }): string[] =>
  page.items.map((item) => item.danhGiaId);

/** Id đánh giá của các lần dựng, theo thứ tự truyền vào. */
export const ids = (...ratings: SeededRating[]): string[] =>
  ratings.map((rating) => rating.danhGiaId);

/** 09:00 giờ VN của ngày `n` tháng 11/2026, dạng chuỗi ghi thẳng vào `thoi_diem_tao`. */
export const day = (n: number): string =>
  `2026-11-${String(n).padStart(2, '0')} 09:00:00`;

/**
 * Mười đánh giá ở ba chi nhánh với SỐ ĐẾM KHÁC HẲN NHAU (A: 2 hiển thị và 1 đã ẩn, B: 3 và 3, C: 1 và 0) để một số liệu rò từ chi nhánh khác lộ ngay;
 * `thoi_diem_tao` tăng dần theo tên (a1 cũ nhất, c1 mới nhất) nên thứ tự "mới nhất trước" là c1, b6, b5, b4, b3, b2, b1, a3, a2, a1.
 * Người đặt: một = "Nguyễn Văn An" (a1, a3, b1, b6), hai = "Trần Thị Bình" (a2, b2, b5), ba = "Lê Hoàng Cường" (b3, b4, c1).
 */
export async function seedThreeBranches(m: ModerationWorld) {
  const { a, b, c } = m.doctors;
  const { one, two, three } = m.buyers;
  const spec = (
    doctor: DoctorRef,
    buyer: string,
    at: number,
    soSao: number,
    nhanXet: string | null,
    hiddenReason?: string,
  ) => m.seed({ doctor, buyer, at: day(at), soSao, nhanXet, hiddenReason });
  return {
    a1: await spec(a, one, 1, 5, 'Rất tận tình'),
    a2: await spec(a, two, 2, 4, 'Khám kỹ lưỡng'),
    a3: await spec(a, one, 3, 1, 'Quảng cáo spam', 'Nội dung quảng cáo'),
    b1: await spec(b, one, 4, 3, null),
    b2: await spec(b, two, 5, 2, 'Chờ lâu'),
    b3: await spec(b, three, 6, 1, 'Thái độ kém', 'Lăng mạ bác sĩ'),
    b4: await spec(b, three, 7, 5, 'Tốt'),
    b5: await spec(b, two, 8, 1, 'Spam liên kết', 'Quảng cáo liên kết'),
    b6: await spec(b, one, 9, 4, 'Ổn', 'Nội dung không phù hợp'),
    c1: await spec(c, three, 10, 5, 'Rất hài lòng'),
  };
}
export type ThreeBranches = Awaited<ReturnType<typeof seedThreeBranches>>;
