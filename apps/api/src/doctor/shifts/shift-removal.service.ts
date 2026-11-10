import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AuditService } from '../../audit/audit.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { nowVN, todayVN } from '../../common/time/time.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import {
  FOREIGN_KEY_RESTRICT_ERRNO,
  mysqlErrno,
  shouldRetry,
} from '../common/mysql-errors.js';
import { SHIFT_ERROR_CODES } from './shift-assignment.constants.js';
import {
  ShiftRemovalRepository,
  type ShiftToRemove,
} from './shift-removal.repository.js';
import { checkRemovable } from './shift-removal.rules.js';

const MESSAGES: Record<string, string> = {
  [SHIFT_ERROR_CODES.SHIFT_PAST]: 'Không thể gỡ ca đã qua.',
  [SHIFT_ERROR_CODES.HAS_APPOINTMENTS]:
    'Ca đã có khung giờ được đặt hoặc từng có lịch hẹn nên không gỡ được.',
};

/** Gỡ MỘT ca (PLAN doctor 5.3, Q8). "Sửa ca" = gỡ rồi phân công lại, không có PATCH. */
@Injectable()
export class ShiftRemovalService {
  constructor(
    @Inject(ShiftRemovalRepository)
    private readonly repository: ShiftRemovalRepository,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async remove(
    scope: AdminScope,
    actorId: string,
    lichLamViecId: string,
  ): Promise<void> {
    // `today` chốt MỘT lần (H18); ngày của ca không đổi nên kiểm một lần trước khi xin khoá là đủ.
    const today = todayVN(nowVN());
    const shift = await this.repository.findShift(
      this.repository.manager,
      lichLamViecId,
    );
    if (shift === null) throw notFound();
    this.policy.assertCanSee(scope, shift.chiNhanhId); // ngoài phạm vi cùng 404 với "không có"
    if (shift.ngay < today) throw conflict(SHIFT_ERROR_CODES.SHIFT_PAST);

    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.repository.transaction((em) =>
          this.removeInTransaction(em, actorId, shift, today),
        );
      } catch (error) {
        // Deadlock/hết chờ khoá xảy ra trước commit nên chạy lại an toàn (như phân công).
        if (shouldRetry(error, attempt)) continue;
        throw error;
      }
    }
  }

  private async removeInTransaction(
    em: EntityManager,
    actorId: string,
    found: ShiftToRemove,
    today: string,
  ): Promise<void> {
    // Thứ tự khoá: bac_si → khung_gio của ca. Booking khoá bac_si (S) rồi khung_gio nên hai bên không đan chéo.
    const doctorBranch = await this.repository.lockDoctor(em, found.bacSiId);
    // Kiểm lại dưới khoá: ca có thể đã bị Admin khác gỡ trong lúc ta chờ khoá bác sĩ.
    const shift = await this.repository.findShift(em, found.lichLamViecId);
    if (doctorBranch === null || shift === null) throw notFound();

    const slots = await this.repository.lockSlots(em, shift.lichLamViecId);
    const refs = await this.repository.findReferencingAppointments(
      em,
      slots.map((slot) => slot.khungGioId),
    );
    const verdict = checkRemovable({
      ngay: shift.ngay,
      today,
      slots: slots.map((slot) => slot.trangThai),
      soLichHenThamChieu: refs.tong,
    });
    if (!verdict.ok) throw conflict(verdict.maLoi, refs.maLichHen);

    try {
      await this.repository.deleteShiftWithSlots(em, shift.lichLamViecId);
    } catch (error) {
      // Lưới an toàn của khoá ngoại (D7): còn bảng khác (đổi lịch ngoài chính sách, danh sách chờ) trỏ vào khung giờ.
      if (mysqlErrno(error) === FOREIGN_KEY_RESTRICT_ERRNO)
        throw conflict(SHIFT_ERROR_CODES.HAS_APPOINTMENTS, []);
      throw error;
    }

    // Q6: CaToi không bao giờ được phân công; gặp nó là dữ liệu hỏng, hoàn tác và báo lỗi hệ thống thay vì ghi nhật ký sai.
    if (shift.ca === 'CaToi')
      throw new Error('Ca tối không thể tồn tại: ' + shift.lichLamViecId);
    await this.audit.record(em, {
      actorId,
      branchId: doctorBranch, // chi nhánh hiện tại của bác sĩ (PLAN 5.12)
      action: 'GoLichLamViec',
      targetType: 'lich_lam_viec',
      targetId: shift.lichLamViecId,
      result: 'ThanhCong',
      changes: {
        bac_si_id: shift.bacSiId,
        ngay: shift.ngay,
        ca: shift.ca,
        so_khung_gio: slots.length,
      },
    });
  }
}

const notFound = () => new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);

function conflict(maLoi: string, maLichHen: string[] = []): AppException {
  return new AppException(409, maLoi, {
    thongBao: MESSAGES[maLoi],
    ...(maLoi === SHIFT_ERROR_CODES.HAS_APPOINTMENTS && {
      chiTiet: { maLichHen },
    }),
  });
}
