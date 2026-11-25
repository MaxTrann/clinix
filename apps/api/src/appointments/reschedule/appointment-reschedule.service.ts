import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { nowVN, toSecond } from '../../common/time/time.js';
import {
  APPOINTMENT_CODE_RANDOM,
  generateAppointmentCode,
  type CodeSuffixSource,
} from '../appointment-code.js';
import {
  BOOKING_ERROR_CODES,
  RESCHEDULE_NOTIFICATION_EVENTS,
} from '../appointments.constants.js';
import { MAX_CODE_ATTEMPTS } from '../create/create-appointment.service.js';
import { insertLichHen } from '../create/lich-hen-insert.query.js';
import { withBookingTransaction } from '../locking/booking-transaction.js';
import {
  APPOINTMENT_NOTIFIER,
  type AppointmentEvent,
  type AppointmentNotifier,
} from '../ports/appointment-notifier.port.js';
import { WAITLIST_PORT, type WaitlistPort } from '../ports/waitlist.port.js';
import { claimSlot, freeLapsedHold } from '../slots/claim-slot.js';
import { SlotHoldService } from '../slots/slot-hold.service.js';
import type { LockedSlot } from '../slots/slot-lock.js';
import {
  AppointmentTransitionService,
  errorNameOf,
} from '../state/appointment-transition.service.js';
import {
  evaluateReschedulability,
  isPastRescheduleDeadline,
} from './reschedulability.rules.js';
import {
  lockRescheduleChain,
  type LockMissingTable,
  type RescheduleChainLocks,
} from './reschedule-locks.js';
import {
  readCopiedColumns,
  readQuotaFacts,
  readSlotTime,
} from './reschedule-write.query.js';
import {
  RescheduleReader,
  type RescheduleLocated,
  type RescheduleReadInput,
} from './reschedule.reader.js';
import type {
  RescheduleConfig,
  RescheduleInput,
  RescheduleOutcome,
  RescheduleRejection,
  RescheduleSource,
  RescheduleVia,
  RescheduleWritten,
} from './reschedule.types.js';

const RESCHEDULE_LABEL = 'reschedule-appointment';

/** Kết quả của THÂN giao dịch (CÓ KIỂU, không ném `AppException`: nếp `CreateWork`). */
type RescheduleWork =
  | { kind: 'Rescheduled'; written: RescheduleWritten }
  | Extract<RescheduleOutcome, { kind: 'OverQuota' | 'Rejected' }>;

type HeldLocks = Extract<RescheduleChainLocks, { kind: 'Locked' }>;

const rejected = (failure: RescheduleRejection): RescheduleWork => ({
  kind: 'Rejected',
  failure,
});

/**
 * Lỗi NỘI BỘ (không phải `AppException`) ném từ thân khi đã có lần ghi và phải HOÀN TÁC TRỌN: ném ra khỏi `db.transaction` thì rollback toàn bộ. Mang kiểu từ chối để dịch vụ đổi thành `Rejected` SAU
 * khi giao dịch đóng. `withBookingTransaction` không thử lại nó (chỉ thử lại 1213 và 1205). Nếp `CreateRollback` của `create`.
 */
class RescheduleRollback extends Error {
  constructor(readonly failure: RescheduleRejection) {
    super('Đổi lịch hẹn bị hoàn tác');
    this.name = 'RescheduleRollback';
  }
}

interface RescheduleContext {
  input: RescheduleInput;
  located: RescheduleLocated;
  config: RescheduleConfig;
  /** MỘT mốc cho cả luồng, đã `toSecond(nowVN())` (H8); mọi lần chạy lại của thân dùng cùng mốc này */
  now: Date;
}

/** Lỗi ở `table` khi khoá: bảng nào thì lỗi đó (dữ liệu bị xoá trong lúc chờ khoá, hoặc id sai). */
function missingFailure(table: LockMissingTable): RescheduleRejection {
  switch (table) {
    case 'yeu_cau_doi_lich_ngoai_chinh_sach':
      return { kind: 'RequestNotFound' };
    case 'khung_gio':
      // Khung giờ CŨ không xoá được khi lịch còn trỏ vào nó (khoá ngoại), nên thiếu là khung giờ ĐÍCH
      return { kind: 'SlotNotFound' };
    default:
      return { kind: 'NotFound' };
  }
}

/**
 * `DuplicateChain` (1062 trên `lich_hen_truoc_id`): lịch cũ ĐÃ có lịch mới mà vẫn đọc ra `DaXacNhan`: không thể xảy ra dưới khoá (lịch con chỉ sinh cùng giao dịch với `DaDoiLich`), là lưới an toàn.
 * Bệnh nhân không được thấy `DaDoiLich` (Q31) nên `TuDoi` ⇒ 404 cùng thân; Lễ tân và duyệt ⇒ `LICH_HEN_KHONG_CHO_DOI` kèm trạng thái thật.
 */
function chainConflict(via: RescheduleVia): RescheduleRejection {
  if (via === 'TuDoi') return { kind: 'NotFound' };
  return {
    kind: 'Rule',
    code: BOOKING_ERROR_CODES.NOT_RESCHEDULABLE,
    chiTiet: { trangThai: 'DaDoiLich' },
  };
}

/**
 * Lõi ĐỔI LỊCH: MỘT thân giao dịch cho ba đường (Bệnh nhân tự đổi, Lễ tân đổi hộ, duyệt yêu cầu ngoài chính sách) (task reschedule B4; PLAN reschedule 5.5; TRACKING reschedule 1.7). Đổi lịch KHÔNG sửa lịch cũ
 * mà TẠO lịch mới nối chuỗi `lich_hen_truoc_id` trong CÙNG giao dịch (quy tắc DB 2, 3, 4), rồi lịch cũ thành `DaDoiLich`; không có lúc nào Bệnh nhân mất lịch: lỗi bất kỳ ⇒ lịch cũ vẫn `DaXacNhan`, khung giờ cũ vẫn `DaDat`.
 *
 * Ghép các phần đã có, KHÔNG viết lại: `RescheduleReader` và `evaluateReschedulability` (B2: điều kiện đổi được, gồm `findBlocking` cho khung giờ ĐÍCH dưới khoá, đóng TECH_DEBT 260), `lockRescheduleChain` (B1: thứ tự khoá
 * 5.4), `freeLapsedHold` và `claimSlot` (B1, dùng chung với `create`), `insertLichHen`, `AppointmentTransitionService.markReplaced`, `SlotHoldService.release`, `AppointmentNotifier` (B3). Dịch vụ này không có SQL ghi
 * (AR-06): `INSERT lich_hen` ở `create/`, `UPDATE` trạng thái ở `state/`, `UPDATE khung_gio` ở `slots/`.
 *
 * Thứ tự (đối chiếu PLAN 5.5):
 *  0. NGOÀI giao dịch: cấu hình (thiếu ⇒ 409 `HE_THONG_CHUA_CAU_HINH`), đọc thường lịch cũ. Khung giờ đích không có, trùng khung giờ cũ hay của bác sĩ khác ⇒ từ chối bằng CHÍNH bộ luật (đọc không khoá) nên thứ tự lỗi
 *     đúng 5.6 và không xin khoá nào. `TuDoi` đã hết lần tự đổi ⇒ `OverQuota` NGAY, trước mọi khoá và mọi giao dịch (`so_lan_tu_doi_lich` của lịch cũ bất biến, một lần đọc thường là đủ).
 *  1. `withBookingTransaction`: khoá theo 5.4. 2 và 3. đọc LẠI dưới khoá và `evaluateReschedulability`; lỗi đầu tiên ⇒ `Rejected` (commit rỗng). 5. hết hạn lười, `INSERT` lịch mới (sao chép ba bản chụp). 6. giữ rồi đặt
 *     khung giờ mới, thả khung giờ cũ. 7. `markReplaced`. 8. `afterWrite` của B7 và B9 (Audit, `UPDATE` yêu cầu). 9. thông báo. 10. SAU commit: `WaitlistPort.onSlotReleased(khung giờ cũ)` đúng một lần.
 * Lỗi từ bước 5 đến 9 ⇒ NÉM để hoàn tác trọn rồi đổi sang kết quả có kiểu SAU khi giao dịch đóng. Thân có thể CHẠY LẠI từ đầu (1213, 1205: đổi × huỷ cùng lịch luôn chọn bên đổi làm nạn nhân, X1 M8); lượt chạy lại
 * kiểm lại trạng thái dưới khoá nên trả `LICH_HEN_KHONG_CHO_DOI` có kiểu, không 500. Không giữ trạng thái giữa các lần, không tác dụng phụ ngoài DB trong thân.
 */
@Injectable()
export class AppointmentRescheduleService {
  private readonly logger = new Logger(AppointmentRescheduleService.name);

  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(RescheduleReader) private readonly reader: RescheduleReader,
    @Inject(SlotHoldService) private readonly slotHolds: SlotHoldService,
    @Inject(AppointmentTransitionService)
    private readonly transition: AppointmentTransitionService,
    @Inject(APPOINTMENT_NOTIFIER)
    private readonly notifier: AppointmentNotifier,
    @Inject(WAITLIST_PORT) private readonly waitlist: WaitlistPort,
    @Inject(APPOINTMENT_CODE_RANDOM) private readonly random: CodeSuffixSource,
  ) {}

  async reschedule(input: RescheduleInput): Promise<RescheduleOutcome> {
    // Bước 0: ngoài giao dịch. Cấu hình thiếu ⇒ 409 (AppException, chưa có giao dịch nào để hoàn tác)
    const config = await this.reader.config();
    const now = toSecond(nowVN());
    const located = await this.reader.locate(this.db.manager, {
      actor: input.actor,
      maLichHen: input.maLichHen,
      khungGioMoiId: input.khungGioMoiId,
    });
    if (located === null)
      return { kind: 'Rejected', failure: { kind: 'NotFound' } };

    // `bacSiCuaKhungGioMoiId` là `null` khi khung giờ không tồn tại: ba trường hợp này không khoá được hai khung giờ khác nhau của cùng một bác sĩ
    if (
      located.bacSiCuaKhungGioMoiId !== located.bacSiId ||
      located.khungGioCuId === input.khungGioMoiId
    )
      return this.rejectWithoutLocks(input, config, now);

    if (input.actor.via === 'TuDoi') {
      const over = await this.overQuota(located.lichHenId, config, now);
      if (over !== null) return over;
    }

    const context: RescheduleContext = { input, located, config, now };
    let work: RescheduleWork;
    try {
      work = await withBookingTransaction(
        this.db,
        (em) => this.rescheduleWithin(em, context),
        { label: RESCHEDULE_LABEL },
      );
    } catch (error) {
      // Lỗi đã lường trước SAU lần ghi: giao dịch đã hoàn tác trọn, giờ mới đổi sang kết quả có kiểu
      if (error instanceof RescheduleRollback)
        return { kind: 'Rejected', failure: error.failure };
      throw error;
    }
    if (work.kind !== 'Rescheduled') return work;

    // Bước 10: SAU commit, đúng một lần
    await this.inviteWaitlist(work.written, now);
    return {
      kind: 'Rescheduled',
      maLichHenCu: work.written.maLichHenCu,
      maLichHenMoi: work.written.maLichHenMoi,
      thoiGianMoi: work.written.thoiGianMoi,
    };
  }

  // Từ chối khi khung giờ đích không thể khoá cùng khung giờ cũ: để CHÍNH bộ luật quyết (đọc không khoá) nên thứ tự lỗi vẫn đúng PLAN 5.6 (ví dụ lịch đã huỷ thì `LICH_HEN_KHONG_CHO_DOI`
  // đứng trước `KHUNG_GIO_TRUNG_LICH_CU`). Không ghi, không khoá.
  private async rejectWithoutLocks(
    input: RescheduleInput,
    config: RescheduleConfig,
    now: Date,
  ): Promise<RescheduleOutcome> {
    const read = await this.reader.read(
      this.db.manager,
      this.readInput(input, config, now),
      'none',
    );
    const verdict = evaluateReschedulability(read.facts);
    // Khung giờ đích không có, trùng cũ hay khác bác sĩ thì luật LUÔN từ chối; `ok` nghĩa là hai nơi đọc lệch nhau, không đoán
    if (verdict.ok)
      throw new Error(
        'khung giờ đích không khoá được nhưng bộ luật vẫn cho đổi',
      );
    return { kind: 'Rejected', failure: verdict.failure };
  }

  // `TuDoi` hết lần tự đổi: chọn nhánh ngay ở lần đọc thường (PLAN 5.5 bước 0), KHÔNG xin khoá nào. Chỉ khi lịch còn đổi được (đúng trạng thái, chưa quá hạn): trạng thái và hạn giờ đứng TRƯỚC hạn mức
  // ở PLAN 5.6 nên với lịch đã huỷ hay quá giờ, đường thường từ chối đúng mã thay vì nói "hết lần".
  private async overQuota(
    lichHenId: string,
    config: RescheduleConfig,
    now: Date,
  ): Promise<RescheduleOutcome | null> {
    const facts = await readQuotaFacts(this.db.manager, lichHenId);
    if (facts === null) return null;
    if (facts.soLanTuDoiLich < config.soLanTuDoiLichToiDa) return null;
    if (
      facts.trangThai !== 'DaXacNhan' ||
      isPastRescheduleDeadline({
        via: 'TuDoi',
        thoiGian: facts.thoiGian,
        checkInSauPhut: config.checkInSauPhut,
        now,
      })
    )
      return null;
    return {
      kind: 'OverQuota',
      soLanDaDoi: facts.soLanTuDoiLich,
      toiDa: config.soLanTuDoiLichToiDa,
    };
  }

  // `requestReasonGiven: true`: hết lần tự đổi do `overQuota` quyết ở bước 0, nên luật không được từ chối `VUOT_SO_LAN_TU_DOI` ở đây
  private readInput(
    input: RescheduleInput,
    config: RescheduleConfig,
    now: Date,
  ): RescheduleReadInput {
    return {
      actor: input.actor,
      maLichHen: input.maLichHen,
      khungGioMoiId: input.khungGioMoiId,
      now,
      config,
      requestReasonGiven: true,
    };
  }

  // Thân của giao dịch (nhận `em`; có thể chạy lại từ đầu). Từ chối thì trả KẾT QUẢ CÓ KIỂU khi CHƯA ghi gì; lỗi sau lần ghi đầu tiên thì NÉM để hoàn tác trọn.
  private async rescheduleWithin(
    em: EntityManager,
    context: RescheduleContext,
  ): Promise<RescheduleWork> {
    const { input, located, config, now } = context;

    // Bước 1: khoá theo PLAN 5.4 (benh_nhan, ho_so_nguoi_than, bac_si, hai khung_gio tăng dần, lich_hen, yêu cầu khi duyệt)
    const locks = await lockRescheduleChain(em, {
      benhNhanId: located.benhNhanId,
      hoSoNguoiThanId: located.hoSoNguoiThanId,
      bacSiId: located.bacSiId,
      lichHenId: located.lichHenId,
      khungGioCuId: located.khungGioCuId,
      khungGioMoiId: input.khungGioMoiId,
      ...('yeuCauId' in input ? { yeuCauId: input.yeuCauId } : {}),
    });
    if (locks.kind === 'Missing') return rejected(missingFailure(locks.table));

    // Duyệt: yêu cầu phải là của chính lịch này và còn `ChoDuyet` DƯỚI khoá (hai người duyệt cùng lúc: bên sau thấy `DaDuyet`)
    if ('yeuCauId' in input) {
      if (locks.request?.lichHenId !== located.lichHenId)
        return rejected({ kind: 'RequestNotFound' });
      if (locks.request.trangThai !== 'ChoDuyet')
        return rejected({ kind: 'RequestHandled' });
    }

    // Bước 2 và 3: đọc LẠI lịch cũ dưới khoá (trạng thái, sở hữu, phạm vi, hạn giờ, hồ sơ) rồi một bộ luật; `findBlocking` gọi đúng một lần với khung giờ ĐÍCH
    const read = await this.reader.read(
      em,
      this.readInput(input, config, now),
      'locked',
    );
    const verdict = evaluateReschedulability(read.facts);
    if (!verdict.ok) return rejected(verdict.failure);
    const source = read.facts.source;
    // Luật đã cho qua thì có lịch cũ: thiếu là lỗi lập trình, hoàn tác và 500
    if (source === null) throw new Error('luật cho qua nhưng không có lịch cũ');
    // `overQuota` đã chặn ở bước 0; còn tới đây chỉ khi lịch trở lại đổi được giữa hai lần đọc (Quản trị viên khôi phục `DaXacNhan`): vẫn không ghi gì
    if (verdict.branch === 'Request')
      return {
        kind: 'OverQuota',
        soLanDaDoi: source.soLanTuDoiLich,
        toiDa: config.soLanTuDoiLichToiDa,
      };

    // Bước 5: hết hạn lười (khung giờ mới `DangGiuCho` đã quá hạn được coi là trống; lịch người kia `DaHuy` trong CÙNG giao dịch, TRƯỚC `INSERT`)
    if (
      verdict.lapsedHold !== null &&
      (await freeLapsedHold(this.slotHolds, em, locks.slotMoi, now)) ===
        'StillHeld'
    )
      return rejected({ kind: 'Rule', code: BOOKING_ERROR_CODES.SLOT_HELD });

    const inserted = await this.insertRescheduled(
      em,
      context,
      source,
      locks.slotMoi,
    );
    const written: RescheduleWritten = {
      lichHenCuId: source.lichHenId,
      lichHenMoiId: inserted.lichHenId,
      maLichHenCu: source.maLichHen,
      maLichHenMoi: inserted.maLichHen,
      khungGioCuId: source.khungGioId,
      khungGioMoiId: locks.slotMoi.khungGioId,
      chiNhanhId: source.chiNhanhId,
      thoiGianCu: source.thoiGian,
      thoiGianMoi: locks.slotMoi.ngayGio,
    };

    // Bước 6: giữ rồi đặt khung giờ mới (cọc đã thu từ lịch gốc nên không có hạn thanh toán: `den` chỉ là mốc tạm, `markBooked` đặt NULL ngay), thả khung giờ cũ. Không `Done` là bất biến vỡ: ném.
    await claimSlot(this.slotHolds, em, locks.slotMoi, {
      den: now,
      book: true,
    });
    const released = await this.slotHolds.release(em, locks.slotCu, {
      from: 'DaDat',
      den: null,
    });
    if (released.kind !== 'Done')
      throw new Error('không thả được khung giờ cũ dưới khoá');

    // Bước 7: lịch cũ thành `DaDoiLich`, SAU mọi lần ghi có khoá ngoại
    const replaced = await this.transition.markReplaced(em, {
      lichHenId: source.lichHenId,
    });
    if (replaced.kind !== 'Replaced')
      throw new RescheduleRollback({
        kind: 'Rule',
        code: BOOKING_ERROR_CODES.NOT_RESCHEDULABLE,
      });

    // Bước 8 và 9: Audit và `UPDATE` yêu cầu của B7, B9 (tầng 7), rồi thông báo; lỗi ở đây hoàn tác TRỌN (2.4.70 A1)
    if ('afterWrite' in input) await input.afterWrite(em, written);
    await this.notifier.notify(
      em,
      await this.eventOf(em, input, source, written, locks),
    );
    return { kind: 'Rescheduled', written };
  }

  // `INSERT lich_hen` mới qua `insertLichHen` (NƠI DUY NHẤT chèn lịch): ba bản chụp và `ly_do_kham` SAO CHÉP nguyên từ lịch cũ (không tính lại giá), bác sĩ, chi nhánh, dịch vụ, hồ sơ cùng lịch cũ, `thoi_gian` = giờ
  // khung giờ mới, `DaXacNhan`, `han_thanh_toan` NULL, `thoi_diem_tao` = `now` (Q12; `thoi_diem_xac_nhan` cùng mốc: cọc đã thu ở lịch gốc, Q7 (d)). Bộ đếm cộng 1 CHỈ khi Bệnh nhân tự đổi.
  private async insertRescheduled(
    em: EntityManager,
    context: RescheduleContext,
    source: RescheduleSource,
    slotMoi: LockedSlot,
  ): Promise<{ lichHenId: string; maLichHen: string }> {
    const copied = await readCopiedColumns(em, source.lichHenId);
    if (copied === null) throw new Error('lịch cũ biến mất dưới khoá');
    const via = context.input.actor.via;
    for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt += 1) {
      const maLichHen = generateAppointmentCode(context.now, this.random);
      const outcome = await insertLichHen(em, {
        maLichHen,
        khungGioId: slotMoi.khungGioId,
        benhNhanId: source.benhNhanId,
        hoSoNguoiThanId: source.hoSoNguoiThanId,
        bacSiId: source.bacSiId,
        chiNhanhId: source.chiNhanhId,
        dichVuKhamId: source.dichVuKhamId,
        thoiGian: slotMoi.ngayGio,
        giaSnapshot: copied.giaSnapshot,
        tienCocSnapshot: copied.tienCocSnapshot,
        chinhSachHoanSnapshot: copied.chinhSachHoan,
        trangThai: 'DaXacNhan',
        hanThanhToan: null,
        lyDoKham: copied.lyDoKham,
        thoiDiemTao: context.now,
        lichHenTruocId: source.lichHenId,
        soLanTuDoiLich: source.soLanTuDoiLich + (via === 'TuDoi' ? 1 : 0),
      });
      if (outcome.kind === 'Inserted')
        return { lichHenId: outcome.lichHenId, maLichHen };
      // Lưới an toàn cuối của H1: đã có lịch đang hoạt động giữ khung giờ này. Hoàn tác trọn (kể cả hết hạn lười trước đó).
      if (outcome.kind === 'DuplicateSlot')
        throw new RescheduleRollback({
          kind: 'Rule',
          code: BOOKING_ERROR_CODES.SLOT_BOOKED,
        });
      if (outcome.kind === 'DuplicateChain')
        throw new RescheduleRollback(chainConflict(via));
      // `DuplicateCode`: sinh mã khác rồi chèn lại trong CÙNG giao dịch (sau 1062 giao dịch vẫn dùng được, X1 M2)
    }
    throw new Error(
      `không sinh được mã lịch hẹn không trùng sau ${String(MAX_CODE_ATTEMPTS)} lần chèn`,
    );
  }

  // Hợp đồng `AppointmentEvent` của B3: `taiKhoanId` là tài khoản ĐẶT (chủ lịch cũ), không phải người thao tác. Tự đổi và đổi hộ gửi `LichHenDaDoiLich` gắn lịch MỚI; duyệt CHỈ gửi `YeuCauDoiLichDaDuyet` gắn
  // yêu cầu (`lichHenId` là lịch CŨ), không gửi thêm `LichHenDaDoiLich`. Giờ MONG MUỐN của yêu cầu có thể khác giờ đích thật vì người duyệt được chọn khung giờ thay thế (Q7 (g)).
  private async eventOf(
    em: EntityManager,
    input: RescheduleInput,
    source: RescheduleSource,
    written: RescheduleWritten,
    locks: HeldLocks,
  ): Promise<AppointmentEvent> {
    if ('yeuCauId' in input) {
      if (locks.request === null)
        throw new Error('duyệt nhưng không giữ khoá yêu cầu');
      const mongMuonId = locks.request.khungGioMongMuonId;
      const thoiGianMongMuon =
        mongMuonId === locks.slotMoi.khungGioId
          ? locks.slotMoi.ngayGio
          : await readSlotTime(em, mongMuonId);
      if (thoiGianMongMuon === null)
        throw new Error('khung giờ mong muốn biến mất dưới khoá');
      return {
        loaiSuKien: RESCHEDULE_NOTIFICATION_EVENTS.REQUEST_APPROVED,
        lichHenId: written.lichHenCuId,
        taiKhoanId: source.benhNhanId,
        yeuCau: {
          yeuCauId: input.yeuCauId,
          ghiChu: input.ghiChu,
          maLichHenMoi: written.maLichHenMoi,
          thoiGianMongMuon,
          thoiGianMoi: written.thoiGianMoi,
        },
      };
    }
    return {
      loaiSuKien: RESCHEDULE_NOTIFICATION_EVENTS.RESCHEDULED,
      lichHenId: written.lichHenMoiId,
      taiKhoanId: source.benhNhanId,
      doiLich: {
        maLichHenCu: written.maLichHenCu,
        thoiGianCu: written.thoiGianCu,
        thoiGianMoi: written.thoiGianMoi,
        via: input.actor.via,
        ...('lyDo' in input ? { lyDo: input.lyDo } : {}),
      },
    };
  }

  // Sau commit, đúng một lần. Không mời khi giờ hẹn cũ đã tới hay qua (như `cancel` và `expire`: đổi hộ trong khoảng tiếp đón có giờ cũ ≤ `now`). Cổng ném chỉ ghi log (TECH_DEBT dòng 101: không thử lại):
  // id nội bộ và TÊN lớp lỗi, không `message` (có thể mang dữ liệu người dùng), không mã lịch hẹn, không lý do.
  private async inviteWaitlist(
    written: RescheduleWritten,
    now: Date,
  ): Promise<void> {
    if (written.thoiGianCu.getTime() <= now.getTime()) return;
    try {
      await this.waitlist.onSlotReleased(written.khungGioCuId);
    } catch (error) {
      this.logger.error(
        `Không báo được danh sách chờ về khung giờ ${written.khungGioCuId} vừa trống: ${errorNameOf(error)}`,
      );
    }
  }
}
