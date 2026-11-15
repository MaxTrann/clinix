import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { withBookingTransaction } from '../../../appointments/locking/booking-transaction.js';
import { AuditService } from '../../../audit/audit.service.js';
import { AppException } from '../../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../../common/errors/error-codes.js';
import { nowVN, toSecond } from '../../../common/time/time.js';
import { isDuplicateKeyError } from '../../../database/mysql-errors.js';
import { readOwnedAppointment } from '../completion/exam-completion.repository.js';
import {
  canWriteRecord,
  diffForAudit,
  isAuditedEdit,
  nextRecordTime,
  sameContent,
  tokenMatches,
} from './exam-record.diff.js';
import type { ExamRecordDto, ExamRecordView } from './exam-record.dto.js';
import {
  examRecordResult,
  fieldErrorsException,
  type ExamRecordOutcome,
} from './exam-record.failure.js';
import { validateRecordInput } from './exam-record.input.js';
import {
  insertRecord,
  lockAppointment,
  lockRecord,
  readRecord,
  updateRecord,
} from './exam-record.repository.js';
import {
  checkFollowUpDate,
  type ValidExamRecord,
} from './exam-record.rules.js';

// Ghi và sửa hồ sơ khám của BÁC SĨ (doctor-exam B2; PLAN 5.3, 5.5; Q2, Q3, Q4, Q15, Q16; HSK b1–b6, A1, A2). Không nhắc `AppointmentTransitionService` (PD-19): chỉ ĐỌC và khoá `lich_hen`, không đổi trạng thái.
//
// Luồng (đúng thứ tự khoá của PLAN 5.3, không bao giờ xin tầng 1 đến 5):
//  1. `validateRecordInput` (chuẩn hoá, `BAT_BUOC`, `QUA_DAI`, `NOI_DUNG_KHONG_HOP_LE`, dạng ngày): lỗi ⇒ 400, CHƯA chạm DB.
//  2. Đọc THƯỜNG lịch theo mã VÀ `bac_si_id` = token, NGOÀI giao dịch (`readOwnedAppointment` của B1). Không có ⇒ 404 cùng thân với mã sai dạng và lịch của bác sĩ khác, KHÔNG mở giao dịch.
//  3. `withBookingTransaction` (READ COMMITTED, thử lại ≤ 2 cho 1213 và 1205): `lich_hen` `FOR UPDATE` theo khoá chính ⇒ KIỂM LẠI bác sĩ, trạng thái, ngày tái khám DƯỚI khoá ⇒ `ho_so_kham` `FOR UPDATE` ⇒ token ⇒
//     `INSERT`/`UPDATE`/không ghi ⇒ nhật ký `SuaGhiChuKham` (chỉ khi `isAuditedEdit`) cùng giao dịch ⇒ đọc lại. Thân trả KẾT QUẢ CÓ KIỂU, không ném `AppException` (ném thì lần ghi bị hoàn tác theo, A8) và chạy lại được:
//     chỉ đọc biến của lần gọi (`now`, `content`, `token` cố định), không giữ trạng thái giữa các lần.
//  4. SAU giao dịch đổi kết quả sang lỗi API ở MỘT chỗ (`examRecordResult`). Lỗi nhật ký (`AuditError`) hay lỗi khác ⇒ hoàn tác cả giao dịch (HSK-18), người dùng nhận 500 chung.
// KHÔNG thông báo (Q17), KHÔNG đụng `khung_gio`, KHÔNG `UPDATE lich_hen`. `bacSiId` CHỈ từ access token. Mốc `now` MỘT lần ngoài giao dịch (HD-08: không `NOW()`).

/** Nhãn của giao dịch cho cảnh báo thử lại (chỉ tên luồng, không dữ liệu). */
export const EXAM_RECORD_LABEL = 'exam-record';

interface SaveInput {
  bacSiId: string;
  lichHenId: string;
  content: ValidExamRecord;
  /** Token đã thấy (chuỗi ISO), `null` = chưa thấy hồ sơ nào */
  token: string | null;
  now: Date;
}

@Injectable()
export class ExamRecordService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** `maLichHen` đã chuẩn hoá chữ hoa (`ParseAppointmentCodePipe`); `bacSiId` là `user.accountId`. Ném `AppException` 400, 404, 409 hoặc 503. */
  async save(
    bacSiId: string,
    maLichHen: string,
    body: ExamRecordDto,
  ): Promise<ExamRecordView> {
    const checked = validateRecordInput(body);
    if (!checked.ok) throw fieldErrorsException(checked.errors);
    const owned = await readOwnedAppointment(this.db, maLichHen, bacSiId);
    if (owned === null)
      throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    const input: SaveInput = {
      bacSiId,
      lichHenId: owned.lichHenId,
      content: checked.value,
      token: body.capNhatLanCuoi ?? null,
      now: toSecond(nowVN()),
    };
    const outcome = await withBookingTransaction(
      this.db,
      (em) => this.write(em, input),
      { label: EXAM_RECORD_LABEL },
    );
    return examRecordResult(outcome);
  }

  private async write(
    em: EntityManager,
    input: SaveInput,
  ): Promise<ExamRecordOutcome> {
    const { content } = input;
    const lich = await lockAppointment(em, input.lichHenId);
    if (lich?.bacSiId !== input.bacSiId) return { kind: 'NotFound' };
    if (!canWriteRecord(lich.trangThai))
      return { kind: 'WrongState', trangThai: lich.trangThai };
    if (!checkFollowUpDate(content.ngayTaiKhamDuKien, lich.ngayKham))
      return { kind: 'InvalidDate' };

    const stored = await lockRecord(em, input.lichHenId);
    if (!tokenMatches(input.token, stored?.capNhatLanCuoi ?? null))
      return { kind: 'Conflict' };
    if (stored !== null && sameContent(stored, content))
      return { kind: 'Saved', record: stored };

    const stamp = nextRecordTime(input.now, stored?.capNhatLanCuoi ?? null);
    let hoSoKhamId: string;
    if (stored === null) {
      try {
        hoSoKhamId = await insertRecord(em, input.lichHenId, content, stamp);
      } catch (error) {
        // Lưới an toàn: khoá `lich_hen` đã tuần tự hoá hai lần ghi đầu nên 1062 không xảy ra; nếu xảy ra thì là sửa chồng
        if (isDuplicateKeyError(error)) return { kind: 'Conflict' };
        throw error;
      }
    } else {
      await updateRecord(em, stored.hoSoKhamId, content, stamp);
      hoSoKhamId = stored.hoSoKhamId;
    }
    if (isAuditedEdit(lich.trangThai, stored !== null))
      await this.audit.record(em, {
        actorId: input.bacSiId,
        branchId: lich.chiNhanhId,
        action: 'SuaGhiChuKham',
        targetType: 'ho_so_kham',
        targetId: hoSoKhamId,
        result: 'ThanhCong',
        changes: diffForAudit(stored, content),
      });

    const saved = await readRecord(em, input.lichHenId);
    if (saved === null) throw new Error('Hồ sơ vừa ghi không đọc lại được');
    return { kind: 'Saved', record: saved };
  }
}
