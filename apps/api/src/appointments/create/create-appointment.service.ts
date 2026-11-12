import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import { toCents } from '../../pricing/money.js';
import {
  APPOINTMENT_CODE_RANDOM,
  generateAppointmentCode,
  type CodeSuffixSource,
} from '../appointment-code.js';
import {
  BOOKING_ERROR_CODES,
  BOOKING_NOTIFICATION_EVENTS,
} from '../appointments.constants.js';
import { withBookingTransaction } from '../locking/booking-transaction.js';
import {
  APPOINTMENT_NOTIFIER,
  type AppointmentNotifier,
} from '../ports/appointment-notifier.port.js';
import { PAYMENT_PORT, type PaymentPort } from '../ports/payment.port.js';
import { BookabilityReader } from '../slots/bookability.reader.js';
import { evaluateBookability } from '../slots/bookability.rules.js';
import { holdDeadline, SlotHoldService } from '../slots/slot-hold.service.js';
import { lockVisitProfile } from '../visit-profile.query.js';
import {
  bookingFailureException,
  failureOfVerdict,
  type BookingFailure,
} from './booking-failure.js';
import { BookingSummaryReader } from './booking-summary.reader.js';
import type { CreatedAppointment } from './create-appointment.dto.js';
import { insertLichHen } from './lich-hen-insert.query.js';

/** Số lần chèn `lich_hen` tối đa khi `ma_lich_hen` trùng (PLAN 5.11, DL-22 `[đề xuất]`: "5 lần" là TỔNG số lần chèn). 32^5 ≈ 33,5 triệu mã mỗi ngày nên thực tế không chạm trần. */
export const MAX_CODE_ATTEMPTS = 5;

const CREATE_LABEL = 'create-appointment';

export interface CreateAppointmentInput {
  /** Id khung giờ đã qua `isBigintId` (DTO) */
  khungGioId: string;
  /** `null` là hồ sơ BẢN THÂN */
  hoSoNguoiThanId: string | null;
  /** Đã chuẩn hoá ở DTO (Q9); `null` khi không nhập */
  lyDoKham: string | null;
}

/** Kết quả của THÂN giao dịch (CÓ KIỂU, không ném `AppException`: nếp A8). */
type CreateWork =
  | {
      kind: 'Created';
      maLichHen: string;
      trangThai: 'ChoThanhToan' | 'DaXacNhan';
      hanThanhToan: Date | null;
      giaApDung: string;
      tienCoc: string;
    }
  /** Từ chối TRƯỚC lần ghi đầu tiên: giao dịch commit rỗng, không ghi gì (DL-03, DL-04, DL-06…DL-19) */
  | { kind: 'Rejected'; failure: BookingFailure };

/**
 * Lỗi NỘI BỘ (không phải `AppException`) ném từ thân khi đã có lần ghi và phải HOÀN TÁC TRỌN (DL-27, DL-28): ném ra khỏi `db.transaction` thì rollback toàn bộ. Mang `BookingFailure` để
 * dịch vụ đổi sang lỗi API SAU khi giao dịch đóng. `withBookingTransaction` không thử lại nó (chỉ thử lại 1213 và 1205).
 */
class CreateRollback extends Error {
  constructor(readonly failure: BookingFailure) {
    super('Tạo lịch hẹn bị hoàn tác');
    this.name = 'CreateRollback';
  }
}

interface CreateContext {
  accountId: string;
  input: CreateAppointmentInput;
  soLichHenToiDa: number;
  thoiGianGiuCho: number;
  /** MỘT mốc cho cả luồng, đã `toSecond(nowVN())` (H8); mọi lần chạy lại của thân dùng cùng mốc này */
  now: Date;
}

/**
 * `POST /booking/appointments` (task B8; PLAN booking 5.4 "Tạo", 5.11; TRACKING booking 3.21): ĐƯỜNG GHI ĐẦU TIÊN chèn `lich_hen`. Ghép các phần đã có: bộ luật `evaluateBookability` và
 * `BookabilityReader` chế độ `locked` (B6a), `SlotHoldService` (B6b), `booking-failure.ts` và `RefundPolicyReader` qua `BookingSummaryReader.readPricing` (B7), `lockVisitProfile` (patient).
 *
 * Một giao dịch `withBookingTransaction` (READ COMMITTED, thử lại 1213/1205, chờ khoá 3 giây). Thứ tự khoá (5.3): `benh_nhan FOR UPDATE` (tầng 2) → `ho_so_nguoi_than FOR UPDATE` (tầng 3) →
 * `bac_si FOR SHARE` (tầng 4) → `khung_gio FOR UPDATE` (tầng 5); KHÔNG xin tầng 6 (lịch vừa chèn). Không câu đọc thường nào của giao dịch chạy trước hai khoá đầu (KT-04).
 *
 * RANH GIỚI với `AppointmentTransitionService` (câu (a), phương án A đã duyệt 11/11/2026): cọc 0đ `INSERT` THẲNG `DaXacNhan` (`han_thanh_toan` NULL) rồi giữ chỗ bằng `hold` + `markBooked`; KHÔNG có `UPDATE lich_hen` ở
 * đây (AR-06: chỉ ở `state/`) và KHÔNG dựng `confirmPaid` (là của B11). INSERT không phải chuyển trạng thái: ma trận không có tác nhân "tạo".
 *
 * Thân có thể CHẠY LẠI từ đầu (1213, 1205): không giữ trạng thái giữa các lần, mã lịch sinh TRONG thân (mỗi lần chạy một mã mới), `now` cố định ngoài thân, cổng nhận `em` của lần chạy hiện tại nên lần đã hoàn tác
 * không để lại gì. KHÔNG có tác dụng phụ ngoài DB (không cổng nào gọi sau commit ở B8).
 */
@Injectable()
export class CreateAppointmentService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(SystemConfigService)
    private readonly systemConfig: SystemConfigService,
    @Inject(BookabilityReader) private readonly bookability: BookabilityReader,
    @Inject(SlotHoldService) private readonly slotHolds: SlotHoldService,
    @Inject(BookingSummaryReader)
    private readonly pricing: BookingSummaryReader,
    @Inject(PAYMENT_PORT) private readonly payment: PaymentPort,
    @Inject(APPOINTMENT_NOTIFIER)
    private readonly notifier: AppointmentNotifier,
    @Inject(APPOINTMENT_CODE_RANDOM) private readonly random: CodeSuffixSource,
  ) {}

  async create(
    accountId: string,
    input: CreateAppointmentInput,
  ): Promise<CreatedAppointment> {
    // Cấu hình ngoài giao dịch (service dùng chung của admin; chưa cấu hình ⇒ 409 HE_THONG_CHUA_CAU_HINH)
    const config = await this.systemConfig.getOrThrow();
    const now = toSecond(nowVN());
    const context: CreateContext = {
      accountId,
      input,
      soLichHenToiDa: config.soLichHenToiDaMoiHoSo,
      thoiGianGiuCho: config.thoiGianGiuCho,
      now,
    };

    let work: CreateWork;
    try {
      work = await withBookingTransaction(
        this.db,
        (em) => this.createWithin(em, context),
        { label: CREATE_LABEL },
      );
    } catch (error) {
      // Lỗi đã lường trước SAU lần ghi: giao dịch đã hoàn tác trọn, giờ mới đổi sang lỗi API
      if (error instanceof CreateRollback)
        throw bookingFailureException(error.failure);
      throw error;
    }
    // Ném SAU khi giao dịch đã đóng
    if (work.kind === 'Rejected') throw bookingFailureException(work.failure);

    return {
      maLichHen: work.maLichHen,
      trangThai: work.trangThai,
      hanThanhToan: work.hanThanhToan?.toISOString() ?? null,
      giaApDung: work.giaApDung,
      tienCoc: work.tienCoc,
      canThanhToan: work.trangThai === 'ChoThanhToan',
      // Giờ máy chủ lấy SAU commit, gần lúc gửi nhất, để giao diện bù lệch đồng hồ (như `checks`); giữ mili giây
      thoiGianMayChu: nowVN().toISOString(),
    };
  }

  // Thân của giao dịch (nhận `em`; có thể chạy lại từ đầu). Từ chối thì trả KẾT QUẢ CÓ KIỂU khi CHƯA ghi gì; lỗi sau lần ghi đầu tiên thì NÉM để hoàn tác trọn.
  private async createWithin(
    em: EntityManager,
    context: CreateContext,
  ): Promise<CreateWork> {
    const { accountId, input, now } = context;

    // Tầng 2: `benh_nhan FOR UPDATE`, kiểm lại cờ no-show DƯỚI khoá (DL-14, Q26); không có hàng ⇒ 403
    const noShowLocked = await this.bookability.readNoShowLock(
      em,
      accountId,
      'locked',
    );
    if (noShowLocked === null)
      return { kind: 'Rejected', failure: { kind: 'NoPatientRow' } };

    // Tầng 3: `ho_so_nguoi_than FOR UPDATE` và kiểm hiệu lực DƯỚI khoá (H14, KT-01…KT-05)
    const profile = await lockVisitProfile(
      em,
      accountId,
      input.hoSoNguoiThanId,
    );
    if (profile === 'missing')
      return { kind: 'Rejected', failure: { kind: 'ProfileMissing' } };
    if (profile === 'inactive')
      return { kind: 'Rejected', failure: { kind: 'ProfileInactive' } };

    // Tầng 4 rồi 5 (`bac_si FOR SHARE`, `khung_gio FOR UPDATE`), rồi các câu đọc thường dưới khoá
    const read = await this.bookability.read(
      em,
      {
        khungGioId: input.khungGioId,
        benhNhanId: accountId,
        hoSoNguoiThanId: input.hoSoNguoiThanId,
        noShowLocked,
        soLichHenToiDa: context.soLichHenToiDa,
        now,
      },
      'locked',
    );
    if (read.kind === 'SlotNotFound')
      return { kind: 'Rejected', failure: { kind: 'SlotNotFound' } };
    const slot = read.locked;
    // Chế độ `locked` luôn trả bằng chứng đã khoá: thiếu là lỗi lập trình, hoàn tác và 500
    if (slot === null) throw new Error('chế độ locked phải trả LockedSlot');

    // MỘT bộ luật cho cả `checks` và tạo (14 mã); lỗi đầu tiên theo đúng thứ tự 5.4 bước 3
    const verdict = evaluateBookability(read.facts);
    if (!verdict.ok)
      return { kind: 'Rejected', failure: failureOfVerdict(verdict) };

    // Hết hạn lười (5.5): khung giờ `DangGiuCho` đã quá hạn được coi là trống, nhưng lịch cũ phải `DaHuy` và khung giờ `ConTrong` TRONG CÙNG giao dịch, TRƯỚC `INSERT`.
    // Chỉ `Expired` và `NoHolder` mở đường; `NotLapsed` và `HolderChanged` không ghi gì nên từ chối ngay.
    if (verdict.lapsedHold !== null) {
      const expired = await this.slotHolds.expireLapsedHold(em, slot, { now });
      if (expired.kind !== 'Expired' && expired.kind !== 'NoHolder')
        return {
          kind: 'Rejected',
          failure: { kind: 'Rule', code: BOOKING_ERROR_CODES.SLOT_HELD },
        };
    }

    // Giá, cọc và snapshot hoàn đọc trong cùng giao dịch (cọc 0 không đọc `moc_hoan_tien`)
    const price = await this.pricing.readPricing(em, {
      bacSiId: read.facts.doctor.bacSiId,
    });
    const zeroDeposit = toCents(price.tienCoc) === 0n;
    const trangThai = zeroDeposit ? 'DaXacNhan' : 'ChoThanhToan';
    // `han_thanh_toan` và `giu_cho_den` CÙNG một giá trị (INV-02) từ MỘT hàm; cọc 0đ không có hạn (DL-01)
    const han = holdDeadline(now, context.thoiGianGiuCho);
    const hanThanhToan = zeroDeposit ? null : han;

    // `INSERT lich_hen`: bác sĩ, chi nhánh, dịch vụ, giờ suy từ khung giờ và bác sĩ DƯỚI khoá, KHÔNG từ client (DL-25)
    let maLichHen: string | null = null;
    let lichHenId: string | null = null;
    for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt += 1) {
      const candidate = generateAppointmentCode(now, this.random);
      const outcome = await insertLichHen(em, {
        maLichHen: candidate,
        khungGioId: slot.khungGioId,
        benhNhanId: accountId,
        hoSoNguoiThanId: input.hoSoNguoiThanId,
        bacSiId: read.facts.doctor.bacSiId,
        chiNhanhId: read.facts.doctor.chiNhanhId,
        dichVuKhamId: read.facts.doctor.dichVuKhamId,
        thoiGian: slot.ngayGio,
        giaSnapshot: price.giaApDung,
        tienCocSnapshot: price.tienCoc,
        chinhSachHoanSnapshot: price.chinhSachHoan,
        trangThai,
        hanThanhToan,
        lyDoKham: input.lyDoKham,
        thoiDiemTao: now,
      });
      if (outcome.kind === 'DuplicateSlot')
        // Lưới an toàn cuối của H1 (DL-28): đã có lịch đang hoạt động giữ khung giờ này. Hoàn tác trọn (kể cả hết hạn lười trước đó).
        throw new CreateRollback({
          kind: 'Rule',
          code: BOOKING_ERROR_CODES.SLOT_BOOKED,
        });
      if (outcome.kind === 'Inserted') {
        maLichHen = candidate;
        lichHenId = outcome.lichHenId;
        break;
      }
      // `DuplicateCode`: sinh mã khác rồi chèn lại trong CÙNG giao dịch (sau 1062 giao dịch vẫn dùng được, X1 M2)
    }
    if (maLichHen === null || lichHenId === null)
      throw new Error(
        `không sinh được mã lịch hẹn không trùng sau ${String(MAX_CODE_ATTEMPTS)} lần chèn`,
      );

    // Giữ chỗ bằng `SlotHoldService` (nơi DUY NHẤT ghi `khung_gio`). Không `Done` dưới khoá là bất biến vỡ: ném để hoàn tác cả `INSERT`, không commit lịch mồ côi.
    if ((await this.slotHolds.hold(em, slot, { den: han })).kind !== 'Done')
      throw new Error('hold không ghi được dưới khoá sau khi INSERT lich_hen');
    if (zeroDeposit) {
      // Cọc 0đ: khung giờ `DangGiuCho` → `DaDat`, `giu_cho_den` NULL (INV-03); lịch đã ở `DaXacNhan` từ `INSERT`
      if ((await this.slotHolds.markBooked(em, slot)).kind !== 'Done')
        throw new Error('markBooked không ghi được dưới khoá');
      // Hai cổng nhận `em`: chạy TRONG giao dịch (lỗi ở đây hoàn tác cả lịch và khung giờ, DL-27). Bản `Noop` hiện tại không ghi gì; bản thật là B17 (payment) và B15 (thông báo).
      await this.payment.recordZeroPayment(em, {
        lichHenId,
        benhNhanId: accountId,
      });
      await this.notifier.notify(em, {
        loaiSuKien: BOOKING_NOTIFICATION_EVENTS.CONFIRMED,
        lichHenId,
        taiKhoanId: accountId,
      });
    }

    return {
      kind: 'Created',
      maLichHen,
      trangThai,
      hanThanhToan,
      giaApDung: price.giaApDung,
      tienCoc: price.tienCoc,
    };
  }
}
