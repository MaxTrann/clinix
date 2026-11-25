import type { DataSource } from 'typeorm';
import type { BacSi } from '../../admin/entities/bac-si.entity.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { ReceptionScopeRepository } from '../../rbac/reception-scope.repository.js';
import { ReceptionScopeService } from '../../rbac/reception-scope.service.js';
import { RescheduleRequestListService } from '../reschedule/reschedule-request-list.service.js';
import { RescheduleRequestRepository } from '../reschedule/reschedule-request.repository.js';
import { AppointmentListFixtures } from './appointment-list-fixtures.js';
import type { BookingFixtures } from './booking-fixtures.js';
import { OperationsListFixtures } from './operations-list-fixtures.js';
import { realRescheduleReader } from './reschedule-detail-world.js';
import { insertRequestAt } from './reschedule-request-world.js';

// Hạ tầng test dùng chung của DANH SÁCH và CHI TIẾT yêu cầu đổi lịch cho nhân sự (reschedule B8; PLAN reschedule 7.4): int-spec và e2e cùng dựng MỘT "thế giới" nên MỘT chỗ ở đây, để jscpd (vốn quét cả
// `*.int-spec.ts`) không thấy cùng một khối ở nhiều file. BỌC `OperationsListFixtures.world()` (hai chi nhánh, bảy trạng thái lịch) và thêm cấu hình, ba Quản trị viên, khung giờ mong muốn và 11 yêu cầu.
// Nằm trong `testing/` nên AR-01 và AR-06 bỏ qua. Mọi tên, SĐT, email, giá là DỮ LIỆU GIẢ; `SENTINELS` là chuỗi cố ý để e2e chứng minh KHÔNG rò ra JSON.
// Đồng hồ ứng dụng giả của `useIntegrationHooks` và e2e = 02/11/2026 08:00 giờ Việt Nam; mọi lịch ở 10 đến 15/11/2026 (sau đồng hồ), khung giờ mong muốn ở 20/11/2026.

/** Giá trị riêng của lịch và Bệnh nhân mà phản hồi của nhân sự cho yêu cầu KHÔNG được chứa (SĐT, email, lý do khám, giá). */
export const SENTINELS = {
  /** `lich_hen.ly_do_kham` của lịch a1 */
  visitReason: 'Đau đầu ba ngày',
  /** `gia_snapshot` của mọi lịch trong thế giới (mặc định của fixture) */
  price: '100000.00',
  patientPhone: '0911111111',
} as const;

/** `thoi_diem_tao` của các yêu cầu (chuỗi giờ Việt Nam; chuỗi, không `Date`: không qua múi giờ của driver, H1). */
export const T = {
  pOld: '2026-10-31 08:00:00',
  p1: '2026-11-01 09:00:00',
  tie: '2026-11-01 10:00:00',
  p4: '2026-11-01 11:00:00',
  hTie: '2026-10-30 09:00:00',
  hTuChoi2: '2026-10-29 09:00:00',
  hDaDuyet2: '2026-10-28 09:00:00',
  bPending: '2026-10-31 07:00:00',
  bHandled: '2026-10-31 07:30:00',
} as const;

export interface RequestListWorldOptions {
  /** Mặc định `true`: dòng `cau_hinh_he_thong` (`so_lan_tu_doi_lich_toi_da` 2, `check_in_sau_phut` 15). `false` để thử "thiếu cấu hình". */
  config?: boolean;
  /**
   * Đặt `AUTO_INCREMENT` của BẢNG YÊU CẦU vượt 2^53 TRƯỚC khi dựng (XDL-40): mọi `yeuCauId` lớn hơn 2^53 (chèn bằng SQL thô nên `insertId` là chuỗi đúng). KHÔNG đặt cho `lich_hen` và `chi_nhanh`:
   * id do `repository.save` của TypeORM trả về mất chính xác khi lớn hơn 2^53 nên FK của yêu cầu vỡ ở bước dựng (đo ở L-INT lần 1); `chiNhanh.id` lớn được kiểm ở spec đơn vị của mapper.
   */
  bigIds?: boolean;
}

const BIG_ID = '9007199254740990';

/**
 * Thế giới danh sách yêu cầu: chi nhánh A (hai bác sĩ `doctorA1`, `doctorA2`, Lễ tân `receptionA`, chín yêu cầu) và chi nhánh B (một bác sĩ, Lễ tân `receptionB`, hai yêu cầu); Quản trị viên Toàn hệ thống
 * (`adminAll`) và một Quản trị viên mỗi chi nhánh (`adminA`, `adminB`). Yêu cầu A (id tăng theo thứ tự dưới đây):
 *  - ChoDuyet: `pOld` (lịch a5 đã đổi hộ, tồn), `p1` (a1), `p2` (a7, hồ sơ người thân đã ngừng) và `p3` (a1) CÙNG `thoi_diem_tao` (ca hoà: xếp theo id), `p4` (a4 đã huỷ, tồn);
 *  - đã xử lý: `hDaDuyet` (a1) và `hTuChoi` (a1) CÙNG `thoi_diem_tao` (ca hoà ở hai nhánh khác trạng thái), `hTuChoi2` (a7), `hDaDuyet2` (a2): hai trạng thái ĐAN XEN theo thời gian.
 * Chi nhánh B: `bPending` (b1) và `bHandled` (b1). Người xử lý của mọi yêu cầu đã xử lý là Lễ tân cùng chi nhánh.
 */
export async function requestListWorld(
  db: DataSource,
  fx: BookingFixtures,
  options: RequestListWorldOptions = {},
) {
  if (options.bigIds === true)
    await db.query(
      `ALTER TABLE yeu_cau_doi_lich_ngoai_chinh_sach AUTO_INCREMENT = ${BIG_ID}`,
    );
  const lf = new AppointmentListFixtures(fx, db);
  const ofx = new OperationsListFixtures(fx, lf, db);
  const w = await ofx.world();
  if (options.config !== false)
    await fx.systemConfig({ soLanTuDoiLichToiDa: 2, checkInSauPhut: 15 });
  const adminAll = await fx.admin.admin();
  const adminA = await fx.admin.admin(w.branchA);
  const adminB = await fx.admin.admin(w.branchB);

  // Khung giờ mong muốn: ca sáng 20/11/2026 của từng bác sĩ (ConTrong); mỗi yêu cầu dùng một khung giờ của ĐÚNG bác sĩ của lịch
  const slotsOf = async (doctor: BacSi) =>
    (
      await fx.doctor.shiftWithSlots(doctor, {
        ngay: '2026-11-20',
        ca: 'CaSang',
      })
    ).slotIds;
  const slotsA1 = await slotsOf(w.doctorA1.profile);
  const slotsA2 = await slotsOf(w.doctorA2.profile);
  const slotsB = await slotsOf(w.doctorB.profile);
  const a = w.apps;
  const handler = w.receptionA.account.taiKhoanId;
  const handlerB = w.receptionB.account.taiKhoanId;
  const pending = (
    lichHenId: string,
    khungGioMongMuonId: string,
    thoiDiemTao: string,
  ) => insertRequestAt(db, { lichHenId, khungGioMongMuonId, thoiDiemTao });
  const handled = (
    lichHenId: string,
    khungGioMongMuonId: string,
    thoiDiemTao: string,
    trangThai: 'DaDuyet' | 'TuChoi',
    nguoiXuLyId: string,
  ) =>
    insertRequestAt(db, {
      lichHenId,
      khungGioMongMuonId,
      thoiDiemTao,
      trangThai,
      nguoiXuLyId,
    });
  // Thứ tự gọi là thứ tự id tăng (ca hoà `thoi_diem_tao` phụ thuộc vào đó)
  const ids = {
    pOld: await pending(a.a5.lichHenId, slotsA1[0]!, T.pOld),
    p1: await pending(a.a1.lichHenId, slotsA1[1]!, T.p1),
    p2: await pending(a.a7.lichHenId, slotsA2[0]!, T.tie),
    p3: await pending(a.a1.lichHenId, slotsA1[2]!, T.tie),
    p4: await pending(a.a4.lichHenId, slotsA2[1]!, T.p4),
    hDaDuyet: await handled(
      a.a1.lichHenId,
      slotsA1[3]!,
      T.hTie,
      'DaDuyet',
      handler,
    ),
    hTuChoi: await handled(
      a.a1.lichHenId,
      slotsA1[4]!,
      T.hTie,
      'TuChoi',
      handler,
    ),
    hTuChoi2: await handled(
      a.a7.lichHenId,
      slotsA2[2]!,
      T.hTuChoi2,
      'TuChoi',
      handler,
    ),
    hDaDuyet2: await handled(
      a.a2.lichHenId,
      slotsA1[5]!,
      T.hDaDuyet2,
      'DaDuyet',
      handler,
    ),
    bPending: await pending(a.b1.lichHenId, slotsB[0]!, T.bPending),
    bHandled: await handled(
      a.b1.lichHenId,
      slotsB[1]!,
      T.bHandled,
      'DaDuyet',
      handlerB,
    ),
  };
  return {
    ...w,
    adminAll,
    adminA,
    adminB,
    slotsA1,
    slotsA2,
    slotsB,
    ids,
    /** Id của mọi yêu cầu chi nhánh A, theo thứ tự tạo */
    idsA: [
      ids.pOld,
      ids.p1,
      ids.p2,
      ids.p3,
      ids.p4,
      ids.hDaDuyet,
      ids.hTuChoi,
      ids.hTuChoi2,
      ids.hDaDuyet2,
    ],
  };
}

export type RequestListWorld = Awaited<ReturnType<typeof requestListWorld>>;

/** `RescheduleRequestListService` THẬT trên DB test (repository, đọc cấu hình và dữ kiện lịch thật; hai cổng nghỉ phép và thay đổi chi nhánh của reader là `Fake`, đường đọc không khung giờ đích không chạm tới). */
export function realRequestListService(
  db: DataSource,
): RescheduleRequestListService {
  return new RescheduleRequestListService(
    db,
    new ReceptionScopeService(new ReceptionScopeRepository(db)),
    new BranchAccessPolicy(),
    new RescheduleRequestRepository(),
    realRescheduleReader(db),
  );
}
