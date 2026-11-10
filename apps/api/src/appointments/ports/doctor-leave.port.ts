import type { EntityManager } from 'typeorm';
import type { CaLamViec } from '../../admin/entities/enums.js';
import type { BlockingLeaveRef } from '../../scheduling/leave/leave-overlap.rules.js';
import { NoopPort } from './noop-warning.js';

// Cổng nghỉ phép (PLAN booking 5.10 D4; TRACKING 3.6 P2-D, câu f). Chữ ký GIỐNG HỆT `LeaveReader.findBlockingLeave` của `doctor` (scheduling/leave/) để B16
// chỉ cần `{ provide: DOCTOR_LEAVE_PORT, useExisting: LeaveReader }` (SchedulingModule đã xuất LeaveReader), không adapter; `doctor-leave.port.int-spec.ts` (BPO-05)
// kiểm kiểu nên Trung đổi chữ ký thì build đỏ ngay.
// Kiểu trả về là `BlockingLeaveRef` THẬT (trạng thái khai 3 giá trị, chạy thật chỉ 2: BLOCKING_LEAVE_STATES), booking chỉ cần "khác null" ⇒ `BAC_SI_NGHI_PHEP`.
// Gọi DƯỚI khoá `bac_si` (đua với duyệt nghỉ, DT-09): người gọi truyền `em` của giao dịch đang giữ khoá.

export interface DoctorLeavePort {
  findBlockingLeave(
    em: EntityManager,
    input: { bacSiId: string; ngay: string; ca: CaLamViec },
  ): Promise<BlockingLeaveRef | null>;
}
export const DOCTOR_LEAVE_PORT = Symbol('DOCTOR_LEAVE_PORT');

export class NoopDoctorLeavePort extends NoopPort implements DoctorLeavePort {
  protected readonly noopMessage =
    'DoctorLeavePort đang dùng bản Noop (chưa nối LeaveReader, task B16): không chặn nghỉ phép.';

  findBlockingLeave(): Promise<BlockingLeaveRef | null> {
    this.warnOnce();
    return Promise.resolve(null);
  }
}
