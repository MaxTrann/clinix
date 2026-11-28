import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { nowVN, todayVN } from '../../common/time/time.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import {
  defaultRange,
  toDateTimeBounds,
  type DateRange,
} from '../filter/date-range.rules.js';
import { buildTrend } from '../filter/trend-buckets.rules.js';
import { countAppointments } from '../queries/appointment-metrics.query.js';
import {
  countFailingRefunds,
  sumDeposits,
  sumRefunds,
} from '../queries/money.query.js';
import { countPending } from '../queries/pending.query.js';
import { countSlotUsage } from '../queries/slot-usage.query.js';
import { countBookingsPerDay } from '../queries/trend.query.js';
import type { AdminDashboard } from './admin-dashboard.dto.js';
import { toRatio } from './ratio.rules.js';

/** Đầu vào đã qua DTO: ngày có thật, đủ cặp, không quá 366 ngày; `chiNhanhId` đúng dạng BIGINT. */
export interface AdminDashboardQuery {
  tuNgay?: string;
  denNgay?: string;
  chiNhanhId?: string;
}

/** Kết quả chọn chi nhánh: `found: false` = chi nhánh ngoài phạm vi hoặc không tồn tại; `chiNhanhId: null` = xem tất cả. */
type BranchChoice =
  { found: true; chiNhanhId: string | null } | { found: false };
const NOT_FOUND: BranchChoice = { found: false };
const branch = (chiNhanhId: string | null): BranchChoice => ({
  found: true,
  chiNhanhId,
});

const BRANCH_EXISTS_SQL =
  'SELECT 1 AS ok FROM chi_nhanh WHERE chi_nhanh_id = ? LIMIT 1';

/**
 * Phạm vi do `AdminScopeGuard` đọc từ DB mỗi request. Kiểm LẠI hình dạng ở đây (nếp `admin-appointments.service.ts`): phạm vi hỏng (kind lạ,
 * `ChiNhanh` thiếu id) mà lọt qua thì `chiNhanhId` thành `null` và lộ số TOÀN HỆ THỐNG. Hỏng ⇒ 403 như guard (DQP-06).
 */
function assertScopeShape(scope: AdminScope): void {
  const shape: { kind?: unknown; chiNhanhId?: unknown } = scope;
  if (shape.kind === 'ToanHeThong') return;
  if (shape.kind === 'ChiNhanh' && typeof shape.chiNhanhId === 'string') return;
  throw new AppException(403, COMMON_ERROR_CODES.FORBIDDEN);
}

/**
 * Tổng quan của Quản trị viên (dashboard B1; PLAN dashboard 5.3 đến 5.7; Q1, Q2, Q4, Q7; T2, T3, T5). CHỈ ĐỌC: mọi câu nằm trong MỘT `runReadOnly`
 * (REPEATABLE READ, `READ ONLY`) nên cùng một ảnh chụp, ví dụ số hoàn thành hôm nay không thể lớn hơn số lịch hôm nay; không khoá, không log.
 */
@Injectable()
export class AdminDashboardService {
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  async overview(
    scope: AdminScope,
    query: AdminDashboardQuery,
  ): Promise<AdminDashboard> {
    assertScopeShape(scope);
    // MỘT giá trị "bây giờ" cho cả lần gọi: mặc định bộ lọc, thẻ hôm nay và `capNhatLuc` cùng một mốc (5.4)
    const now = nowVN();
    const today = todayVN(now);
    const range: DateRange =
      query.tuNgay !== undefined && query.denNgay !== undefined
        ? { tuNgay: query.tuNgay, denNgay: query.denNgay }
        : defaultRange(today);

    const result = await runReadOnly(this.dataSource, async (manager) => {
      const choice = await this.chooseBranch(manager, scope, query.chiNhanhId);
      if (!choice.found) return null;
      const chiNhanhId = choice.chiNhanhId;
      const todayBounds = toDateTimeBounds({ tuNgay: today, denNgay: today });
      const bounds = toDateTimeBounds(range);
      const homNay = await countAppointments(manager, todayBounds, chiNhanhId);
      const trongKhoang = await countAppointments(manager, bounds, chiNhanhId);
      const slots = await countSlotUsage(manager, range, chiNhanhId);
      const tienCoc = await sumDeposits(manager, bounds, chiNhanhId);
      const daHoan = await sumRefunds(manager, bounds, chiNhanhId);
      const dangLoi = await countFailingRefunds(manager, chiNhanhId);
      const perDay = await countBookingsPerDay(manager, bounds, chiNhanhId);
      const pending = await countPending(manager, chiNhanhId);
      return {
        chiNhanhId,
        homNay,
        trongKhoang,
        slots,
        tienCoc,
        daHoan,
        dangLoi,
        perDay,
        pending,
      };
    });
    // Ném SAU khi giao dịch đã đóng, ở MỘT chỗ: chi nhánh ngoài phạm vi và chi nhánh không tồn tại ra cùng một thân 404 (T3, DQP-03)
    if (result === null)
      throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    const xuHuong = buildTrend(range, result.perDay);

    return {
      boLoc: { ...range, chiNhanhId: result.chiNhanhId },
      capNhatLuc: now.toISOString(),
      homNay: {
        ngay: today,
        lichKham: result.homNay.lichKham,
        hoanThanh: result.homNay.hoanThanh,
      },
      trongKhoang: {
        lichKham: result.trongKhoang.lichKham,
        hoanThanh: result.trongKhoang.hoanThanh,
      },
      vangMat: toRatio(result.trongKhoang.vangMat, result.trongKhoang.coKetQua),
      khungGio: toRatio(result.slots.daDat, result.slots.phatRa),
      tienCoc: result.tienCoc,
      hoanTien: { ...result.daHoan, soKhoanDangLoi: result.dangLoi },
      xuHuong,
      choDuyet: {
        nghiPhep: result.pending.nghiPhep,
        doiLich: result.pending.doiLich,
        thayDoiChiNhanh: result.pending.thayDoiChiNhanh,
        // Rút tiền chỉ Quản trị viên Toàn hệ thống duyệt và không gắn chi nhánh: Chi nhánh nhận `null` (ẩn khối), không phải 0 (Q6, DCD-02)
        rutTien: scope.kind === 'ToanHeThong' ? result.pending.rutTien : null,
      },
      // A1 (MH2): khung giờ đã phát ra và số chờ duyệt KHÔNG tính là "có dữ liệu" (chúng có mà không cần lịch hay giao dịch nào trong khoảng)
      coDuLieu:
        result.trongKhoang.lichKham > 0 ||
        xuHuong.diem.some((point) => point.soLuong > 0) ||
        result.tienCoc.soKhoan > 0 ||
        result.daHoan.soKhoan > 0,
    };
  }

  /**
   * Quy tắc `chiNhanhId` (T3, PLAN 5.3). KHÁC các danh sách có sẵn (bỏ qua tham số của Quản trị viên Chi nhánh): ở đây hỏi chi nhánh KHÁC là 404,
   * để không bao giờ trả số của chi nhánh mình khi người gọi hỏi chi nhánh khác.
   *  - Chi nhánh: không gửi hoặc gửi đúng chi nhánh mình ⇒ chi nhánh mình; gửi chi nhánh khác (có thật hay không) ⇒ 404.
   *  - Toàn hệ thống: không gửi ⇒ tất cả; gửi chi nhánh có thật ⇒ chi nhánh đó; không tồn tại ⇒ 404.
   */
  private async chooseBranch(
    manager: EntityManager,
    scope: AdminScope,
    requested: string | undefined,
  ): Promise<BranchChoice> {
    if (scope.kind === 'ChiNhanh') {
      return requested === undefined || requested === scope.chiNhanhId
        ? branch(scope.chiNhanhId)
        : NOT_FOUND;
    }
    if (requested === undefined) return branch(null);
    const rows: unknown[] = await manager.query(BRANCH_EXISTS_SQL, [requested]);
    return rows.length > 0 ? branch(requested) : NOT_FOUND;
  }
}
