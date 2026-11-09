import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { nowVN } from '../../common/time/time.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import {
  BranchHoursReader,
  hoursKey,
} from '../../scheduling/branch-hours/branch-hours.reader.js';
import {
  isoWeekdayOfEpochDay,
  parseCalendarDate,
} from '../../scheduling/calendar-date.js';
import { SHIFT_ERROR_CODES } from './shift-assignment.constants.js';
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
  ) {}

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
    return { rows, report };
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
