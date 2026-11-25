import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import {
  COMMON_ERROR_CODES,
  INVALID_DATA_MESSAGE,
} from '../../common/errors/error-codes.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import { RESCHEDULE_NOTIFICATION_EVENTS } from '../appointments.constants.js';
import { withBookingTransaction } from '../locking/booking-transaction.js';
import {
  APPOINTMENT_NOTIFIER,
  type AppointmentNotifier,
} from '../ports/appointment-notifier.port.js';
import { evaluateReschedulability } from './reschedulability.rules.js';
import {
  isValidRequestReason,
  normalizeRequestReason,
  REQUEST_REASON_FIELD_ERROR,
} from './reschedule-reason.js';
import { lockRequestCreation } from './reschedule-locks.js';
import { RescheduleRequestRepository } from './reschedule-request.repository.js';
import type {
  CreateRescheduleRequestInput,
  CreateRescheduleRequestOutcome,
} from './reschedule-request.types.js';
import {
  RescheduleReader,
  type RescheduleLocated,
} from './reschedule.reader.js';
import type { RescheduleActor } from './reschedule.types.js';

const REQUEST_LABEL = 'reschedule-request';

/**
 * TẠO yêu cầu đổi lịch ngoài chính sách (reschedule B5; PLAN reschedule 5.4, 5.5 bước 4, 5.7 "Tạo"; UC 2.4.9 A2). Là nhánh `TuDoi` đã HẾT LẦN TỰ ĐỔI: B4 trả `OverQuota` (không ghi gì), B6 ghép sang đây.
 * Giao dịch RIÊNG của B5 (phiên kiểm duyệt: nhánh này không ghi khung giờ nào và `so_lan_tu_doi_lich` của lịch cũ bất biến, nên không cần chung thân với B4).
 *
 * Luồng: (0) chuẩn hoá và kiểm lý do, sai ⇒ 400 trước khi đọc gì; (1) cấu hình ngoài giao dịch (thiếu ⇒ 409 `HE_THONG_CHUA_CAU_HINH`) và MỘT lần đọc thường để biết khoá nào cần xin; (2) từ chối SỚM, không
 * khoá, nếu khung giờ mong muốn không tồn tại, của bác sĩ khác hay là khung giờ cũ (nếu không `BookabilityReader.read('locked')` sẽ xin `bac_si` của bác sĩ kia SAU `lich_hen`, ngược chiều 5.4); (3) giao dịch:
 * `lockRequestCreation` (B1: `benh_nhan` → `ho_so_nguoi_than` → `bac_si` → CHỈ khung giờ mong muốn → `lich_hen`), kiểm LẠI dưới khoá bằng `RescheduleReader.read(…, 'locked')` và `evaluateReschedulability`
 * (CHÍNH bộ luật B2: phạm vi, trạng thái, hạn giờ, chín bước đặt lịch, hết lần chưa, đã có `ChoDuyet` chưa dưới khoá `lich_hen` nên hai yêu cầu cùng lúc chỉ một thắng), rồi `INSERT` và `notify`.
 *
 * Kết quả CÓ KIỂU, không ném `AppException` trong thân giao dịch (nếp B8). Mọi từ chối xảy ra TRƯỚC lần ghi đầu tiên (giao dịch commit rỗng). `INSERT` hay `notify` ném ⇒ hoàn tác trọn rồi lỗi đi ra nguyên.
 * Khung giờ mong muốn KHÔNG đổi trạng thái (Q7 (f)): người khác đặt được ngay, lúc duyệt có thể gặp 409. Không có tác dụng phụ sau commit.
 */
@Injectable()
export class RescheduleRequestService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(RescheduleReader) private readonly reader: RescheduleReader,
    @Inject(RescheduleRequestRepository)
    private readonly requests: RescheduleRequestRepository,
    @Inject(APPOINTMENT_NOTIFIER)
    private readonly notifier: AppointmentNotifier,
  ) {}

  async create(
    input: CreateRescheduleRequestInput,
  ): Promise<CreateRescheduleRequestOutcome> {
    // 0. Lớp bảo vệ thứ hai (DTO của B6 là lớp đầu): ném TRƯỚC khi đọc gì, ngoài mọi giao dịch
    const lyDoYeuCau = normalizeRequestReason(input.lyDoYeuCau);
    if (!isValidRequestReason(lyDoYeuCau))
      throw new AppException(400, COMMON_ERROR_CODES.INVALID_DATA, {
        thongBao: INVALID_DATA_MESSAGE,
        loi: [{ ...REQUEST_REASON_FIELD_ERROR }],
      });

    // 1. Cấu hình (thiếu ⇒ 409) và MỘT mốc `now` cho cả lượt và mọi lần chạy lại của thân
    const config = await this.reader.config();
    const now = toSecond(nowVN());
    const actor: RescheduleActor = { via: 'TuDoi', accountId: input.accountId };
    const located = await this.reader.locate(this.db.manager, {
      actor,
      maLichHen: input.maLichHen,
      khungGioMoiId: input.khungGioMongMuonId,
    });
    if (located === null)
      return { kind: 'Rejected', failure: { kind: 'NotFound' } };

    const read = {
      actor,
      maLichHen: input.maLichHen,
      khungGioMoiId: input.khungGioMongMuonId,
      now,
      config,
      requestReasonGiven: true,
    };

    // 2. Từ chối sớm, không khoá: đọc thường rồi để bộ luật chọn lỗi ĐẦU TIÊN theo thứ tự 5.6
    if (!canLockTarget(located, input.khungGioMongMuonId)) {
      const early = await this.reader.read(this.db.manager, read, 'none');
      const verdict = evaluateReschedulability(early.facts);
      if (verdict.ok)
        throw new Error(
          'khung giờ mong muốn không khoá được nhưng bộ luật cho qua',
        );
      return { kind: 'Rejected', failure: verdict.failure };
    }

    return withBookingTransaction(
      this.db,
      async (em): Promise<CreateRescheduleRequestOutcome> => {
        // 3. Khoá theo 5.4 (cột "Tạo yêu cầu"); `INSERT` chỉ chạy SAU khi mọi hàng cha đã khoá
        const locks = await lockRequestCreation(em, {
          benhNhanId: located.benhNhanId,
          hoSoNguoiThanId: located.hoSoNguoiThanId,
          bacSiId: located.bacSiId,
          lichHenId: located.lichHenId,
          khungGioMongMuonId: input.khungGioMongMuonId,
        });
        if (locks.kind === 'Missing')
          return {
            kind: 'Rejected',
            failure: {
              kind: locks.table === 'khung_gio' ? 'SlotNotFound' : 'NotFound',
            },
          };

        const locked = await this.reader.read(em, read, 'locked');
        const verdict = evaluateReschedulability(locked.facts);
        if (!verdict.ok) return { kind: 'Rejected', failure: verdict.failure };
        const source = required(locked.facts.source, 'lịch cũ');
        if (verdict.branch === 'Reschedule')
          return {
            kind: 'NotOverQuota',
            soLanDaDoi: source.soLanTuDoiLich,
            toiDa: config.soLanTuDoiLichToiDa,
          };

        const target = required(locked.facts.bookability, 'khung giờ đích');
        const yeuCauId = await this.requests.insert(em, {
          lichHenId: located.lichHenId,
          khungGioMongMuonId: input.khungGioMongMuonId,
          lyDoYeuCau,
          thoiDiemTao: now,
        });
        // Người nhận là tài khoản ĐẶT (chủ lịch); `lichHenId` là lịch CŨ (chỉ để đọc mã và giờ hiện tại)
        await this.notifier.notify(em, {
          loaiSuKien: RESCHEDULE_NOTIFICATION_EVENTS.REQUEST_PENDING,
          lichHenId: located.lichHenId,
          taiKhoanId: input.accountId,
          yeuCau: { yeuCauId, thoiGianMongMuon: target.slot.ngayGio },
        });
        return {
          kind: 'RequestCreated',
          yeuCauId,
          thoiGianMongMuon: target.slot.ngayGio,
        };
      },
      { label: REQUEST_LABEL },
    );
  }
}

// Khoá được khi khung giờ mong muốn tồn tại, cùng bác sĩ và khác khung giờ cũ (PLAN 5.4 quy tắc 1); không thì từ chối sớm.
function canLockTarget(
  located: RescheduleLocated,
  khungGioMongMuonId: string,
): boolean {
  return (
    located.bacSiCuaKhungGioMoiId === located.bacSiId &&
    located.khungGioCuId !== khungGioMongMuonId
  );
}

// Đến đây bộ luật đã cho qua nên lịch cũ và khung giờ đích phải có; thiếu là lỗi lập trình, không phải từ chối.
function required<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`bộ luật cho qua nhưng không có ${what}`);
  return value;
}
