import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AuditService } from '../../audit/audit.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { nowVN } from '../../common/time/time.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import {
  BranchHoursReader,
  hoursKey,
} from '../../scheduling/branch-hours/branch-hours.reader.js';
import type { BranchDayHours } from '../../scheduling/branch-hours/branch-hours.types.js';
import { shiftWindow } from '../../scheduling/branch-hours/shift-window.rules.js';
import {
  isoWeekdayOfEpochDay,
  parseCalendarDate,
} from '../../scheduling/calendar-date.js';
import { SlotGeneratorService } from '../../scheduling/slots/slot-generator.js';
import {
  ASSIGNABLE_SHIFTS,
  SHIFT_ERROR_CODES,
} from './shift-assignment.constants.js';
import type { ShiftRuleDto } from './shift-assignment.dto.js';
import {
  ShiftAssignmentRepository,
  type AssignableDoctor,
} from './shift-assignment.repository.js';
import {
  collectViolations,
  expandRule,
  type DoctorShiftInfo,
  type ShiftRow,
  shiftKey,
  type ViolationReport,
} from './shift-assignment.rules.js';

const ERROR_MESSAGES: Record<string, string> = {
  [SHIFT_ERROR_CODES.TOO_MANY_SHIFTS]: 'Quá nhiều ca trong một lần.',
  [SHIFT_ERROR_CODES.INVALID_DATE_RANGE]: 'Khoảng ngày không hợp lệ.',
  [SHIFT_ERROR_CODES.DOCTOR_NOT_ASSIGNABLE]:
    'Tài khoản bác sĩ đang ngừng hoạt động.',
};

export interface AssignmentPlan {
  rows: ShiftRow[];
  report: ViolationReport;
  doctors: Map<string, DoctorShiftInfo>;
  hoursOf: (chiNhanhId: string, thuTrongTuan: number) => BranchDayHours | null;
}

export interface ShiftAssignmentResult {
  soCa: number;
  soKhungGio: number;
  theoBacSi: { bacSiId: string; soCa: number }[];
}

/** Số lần chạy lại tối đa khi MySQL huỷ giao dịch vì deadlock/chờ khoá quá lâu (Q40): chỉ trước commit nên chạy lại an toàn. */
const MAX_RETRIES = 2;
const RETRYABLE_ERRNO = new Set([1213, 1205]);
const DUPLICATE_ENTRY_ERRNO = 1062;

/** errno của lỗi MySQL do TypeORM bọc (`driverError`); không phải lỗi MySQL ⇒ undefined. */
function mysqlErrno(error: unknown): number | undefined {
  const driverError = (error as { driverError?: { errno?: unknown } } | null)
    ?.driverError;
  return typeof driverError?.errno === 'number' ? driverError.errno : undefined;
}

export interface ShiftPreview {
  soCa: number;
  soKhungGio: number;
  tongSoViPham: number;
  viPham: ViolationReport['viPham'];
}

@Injectable()
export class ShiftAssignmentService {
  constructor(
    @Inject(ShiftAssignmentRepository)
    private readonly repository: ShiftAssignmentRepository,
    @Inject(BranchHoursReader) private readonly hours: BranchHoursReader,
    @Inject(SlotGeneratorService) private readonly slots: SlotGeneratorService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * Phân công thật (PLAN 5.3 bước 1-7): all-or-none trong MỘT giao dịch `READ COMMITTED`.
   * `now` chốt MỘT lần ngoài giao dịch (H18); deadlock/timeout (1213/1205) chạy lại tối đa 2 lần vì giao dịch chưa commit gì.
   */
  async assign(
    scope: AdminScope,
    actorId: string,
    input: ShiftRuleDto,
  ): Promise<ShiftAssignmentResult> {
    const now = nowVN();
    // Quy tắc sai (quá nhiều ca, khoảng ngày...) bị từ chối TRƯỚC khi mở giao dịch và xin khoá.
    const expanded = expandRule(input);
    if (!expanded.ok)
      throw new AppException(400, expanded.maLoi, {
        thongBao: ERROR_MESSAGES[expanded.maLoi],
        chiTiet: expanded.chiTiet,
      });

    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.repository.transaction((em) =>
          this.assignInTransaction(em, scope, actorId, input, now),
        );
      } catch (error) {
        const errno = mysqlErrno(error);
        if (
          errno !== undefined &&
          RETRYABLE_ERRNO.has(errno) &&
          attempt < MAX_RETRIES
        )
          continue;
        throw error;
      }
    }
  }

  private async assignInTransaction(
    em: EntityManager,
    scope: AdminScope,
    actorId: string,
    input: ShiftRuleDto,
    now: Date,
  ): Promise<ShiftAssignmentResult> {
    // Thứ tự khoá cố định: bac_si (id tăng dần, một câu) -> dich_vu_kham FOR SHARE. Sau đó mới đọc để kiểm lại như xem trước.
    const serviceIds = await this.repository.lockDoctors(em, input.bacSiIds);
    await this.repository.lockServicesShared(em, serviceIds);

    const { rows, report, doctors, hoursOf } = await this.buildPlan(
      em,
      scope,
      input,
      now,
    );
    if (report.tongSoViPham > 0) {
      const first = report.viPham[0];
      throw new AppException(409, first.maLoi, {
        thongBao: 'Có ca không phân công được; không ca nào được ghi.',
        chiTiet: {
          tongSoViPham: report.tongSoViPham,
          viPham: report.viPham,
        },
      });
    }

    const chiNhanhOf = (bacSiId: string) =>
      (doctors.get(bacSiId) as DoctorShiftInfo).chiNhanhId;
    try {
      await this.repository.insertShifts(
        em,
        rows.map((row) => ({ ...row, chiNhanhId: chiNhanhOf(row.bacSiId) })),
      );
    } catch (error) {
      // Lưới an toàn của UNIQUE (H2): hai Admin cùng ghi một ca, bên chậm bị 1062 => mã nghiệp vụ, không phải 500.
      if (mysqlErrno(error) === DUPLICATE_ENTRY_ERRNO)
        throw new AppException(409, SHIFT_ERROR_CODES.ALREADY_ASSIGNED, {
          thongBao: 'Bác sĩ đã có ca này trong ngày đó.',
        });
      throw error;
    }

    const shiftIds = await this.repository.findShiftIds(
      em,
      input.bacSiIds,
      input.tuNgay,
      input.denNgay,
    );
    let soKhungGio = 0;
    for (const row of rows) {
      const doctor = doctors.get(row.bacSiId) as DoctorShiftInfo;
      const thuTrongTuan = isoWeekdayOfEpochDay(
        parseCalendarDate(row.ngay) as number,
      );
      const window = shiftWindow(
        row.ca,
        hoursOf(doctor.chiNhanhId, thuTrongTuan),
      );
      const lichLamViecId = shiftIds.get(shiftKey(row));
      // Đã kiểm hợp lệ ở buildPlan và đang giữ khoá, nên hai điều này không thể sai; sai là lỗi lập trình => 500 và hoàn tác.
      if (!window.ok || lichLamViecId === undefined)
        throw new Error(`Ca vừa ghi không đọc lại được: ${shiftKey(row)}`);
      const result = await this.slots.syncShift(em, {
        lichLamViecId,
        ngay: row.ngay,
        khoang: window.khoang,
        thoiLuongPhut: doctor.thoiLuongPhut,
      });
      soKhungGio += result.moi + result.daCo;
    }

    const soCaTheoBacSi = new Map<string, number>();
    for (const row of rows)
      soCaTheoBacSi.set(row.bacSiId, (soCaTheoBacSi.get(row.bacSiId) ?? 0) + 1);
    // rows đã sắp theo bác sĩ (id tăng dần) nên Map giữ đúng thứ tự đó.
    for (const [bacSiId, soCa] of soCaTheoBacSi)
      await this.audit.record(em, {
        actorId,
        branchId: chiNhanhOf(bacSiId),
        action: 'PhanCongLichLamViec',
        targetType: 'tai_khoan',
        targetId: bacSiId,
        result: 'ThanhCong',
        changes: {
          tu_ngay: input.tuNgay,
          den_ngay: input.denNgay,
          thu_trong_tuan: [...input.thuTrongTuan].sort((a, b) => a - b),
          ca: ASSIGNABLE_SHIFTS.filter((ca) => input.cas.includes(ca)),
          so_ca: soCa,
        },
      });

    return {
      soCa: rows.length,
      soKhungGio,
      theoBacSi: [...soCaTheoBacSi].map(([bacSiId, soCa]) => ({
        bacSiId,
        soCa,
      })),
    };
  }

  /** Xem trước (PCLV b4): đọc thường, không khoá, không ghi; có thể cũ hơn lúc bấm "Phân công". */
  async preview(scope: AdminScope, input: ShiftRuleDto): Promise<ShiftPreview> {
    const { rows, report } = await this.buildPlan(
      this.repository.manager,
      scope,
      input,
      nowVN(),
    );
    return {
      soCa: rows.length,
      soKhungGio: report.soKhungGio,
      tongSoViPham: report.tongSoViPham,
      viPham: report.viPham,
    };
  }

  /**
   * Bước 1, 3, 4 của PLAN 5.3: mở quy tắc, đọc bác sĩ/giờ chi nhánh/ca đã có, kiểm MỌI ca. `now` do bên gọi chốt MỘT lần (H18).
   * B3 gọi lại đúng hàm này trong giao dịch sau khi khoá `bac_si`, nên preview và POST dùng chung một bộ luật.
   */
  async buildPlan(
    em: EntityManager,
    scope: AdminScope,
    input: ShiftRuleDto,
    now: Date,
  ): Promise<AssignmentPlan> {
    const expanded = expandRule(input);
    if (!expanded.ok)
      throw new AppException(400, expanded.maLoi, {
        thongBao: ERROR_MESSAGES[expanded.maLoi],
        chiTiet: expanded.chiTiet,
      });
    const { rows } = expanded;

    const doctors = await this.loadDoctors(em, scope, input.bacSiIds);
    const info = new Map<string, DoctorShiftInfo>(
      doctors.map((d) => [
        d.bacSiId,
        { chiNhanhId: d.chiNhanhId, thoiLuongPhut: d.thoiLuongPhut },
      ]),
    );

    const pairs = new Map<
      string,
      { chiNhanhId: string; thuTrongTuan: number }
    >();
    for (const row of rows) {
      const chiNhanhId = (info.get(row.bacSiId) as DoctorShiftInfo).chiNhanhId;
      const thuTrongTuan = isoWeekdayOfEpochDay(
        parseCalendarDate(row.ngay) as number,
      );
      pairs.set(hoursKey({ chiNhanhId, thuTrongTuan }), {
        chiNhanhId,
        thuTrongTuan,
      });
    }
    const hoursByKey = await this.hours.loadMany(em, [...pairs.values()]);
    const existingKeys = await this.repository.findExistingShiftKeys(
      em,
      input.bacSiIds,
      input.tuNgay,
      input.denNgay,
    );

    const report = collectViolations({
      rows,
      doctors: info,
      hoursOf: (chiNhanhId, thuTrongTuan) =>
        hoursByKey.get(hoursKey({ chiNhanhId, thuTrongTuan })) ?? null,
      existingKeys,
      now,
    });
    return {
      rows,
      report,
      doctors: info,
      hoursOf: (chiNhanhId, thuTrongTuan) =>
        hoursByKey.get(hoursKey({ chiNhanhId, thuTrongTuan })) ?? null,
    };
  }

  /** Thiếu bác sĩ hoặc (Admin Chi nhánh) khác chi nhánh ⇒ 404 cùng thân; ngừng hoạt động ⇒ 409 (Q11). Chi nhánh của ca = chi nhánh hiện tại của bác sĩ (D12). */
  private async loadDoctors(
    em: EntityManager,
    scope: AdminScope,
    ids: readonly string[],
  ): Promise<AssignableDoctor[]> {
    const doctors = await this.repository.findDoctors(em, ids);
    const inScope = (d: AssignableDoctor) =>
      scope.kind === 'ToanHeThong' || d.chiNhanhId === scope.chiNhanhId;
    if (doctors.length !== ids.length || !doctors.every(inScope))
      throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    if (doctors.some((d) => d.trangThai === 'NgungHoatDong'))
      throw new AppException(409, SHIFT_ERROR_CODES.DOCTOR_NOT_ASSIGNABLE, {
        thongBao: ERROR_MESSAGES[SHIFT_ERROR_CODES.DOCTOR_NOT_ASSIGNABLE],
      });
    return doctors;
  }
}
