import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import { toCents } from '../../pricing/money.js';
import { BookabilityReader } from '../slots/bookability.reader.js';
import { evaluateBookability } from '../slots/bookability.rules.js';
import { readVisitProfile } from '../visit-profile.query.js';
import {
  WALLET_BALANCE_PORT,
  type WalletBalancePort,
} from '../ports/wallet.port.js';
import type {
  BookingCheckResult,
  BookingSummary,
} from './booking-checks.dto.js';
import {
  bookingFailureException,
  failureOfVerdict,
  type BookingFailure,
} from './booking-failure.js';
import { BookingSummaryReader } from './booking-summary.reader.js';

/** Kết quả CÓ KIỂU trong giao dịch: không ném bên trong `runReadOnly` (nếp B1, B2); đổi sang `AppException` sau khi giao dịch đóng. */
type CheckOutcome =
  | { ok: true; summary: Omit<BookingSummary, 'soDuVi'> }
  | { ok: false; failure: BookingFailure };

export interface BookingChecksInput {
  /** Id khung giờ đã qua `isBigintId` (DTO) */
  khungGioId: string;
  /** `null` là hồ sơ BẢN THÂN */
  hoSoNguoiThanId: string | null;
}

/**
 * `POST /booking/checks` (task B7; PLAN booking 5.4 bước 2 và 3, 5.9; TRACKING booking 3.18 B7-D, B7-E): kiểm KHÔNG khoá một khung giờ có đặt được cho Bệnh nhân (hoặc người thân của họ) không, và
 * trả tóm tắt Bước 5. CHỈ ĐỌC: không `FOR UPDATE`, không `FOR SHARE`, không ghi gì. Kết quả chỉ để thông tin (giữa `checks` và tạo lịch người khác có thể đặt mất khung giờ); quyết định thật là của B8 dưới khoá.
 *
 * Mọi câu đọc nằm trong MỘT `runReadOnly` (một ảnh chụp). Thứ tự lỗi (đúng PLAN 5.4 bước 2 rồi 3): cấu hình hệ thống → hàng `benh_nhan` → hồ sơ đi khám → khung giờ không có → `evaluateBookability`
 * (no-show là kiểm tra ĐẦU của luật, rồi trạng thái khung giờ, …, trùng giờ). Bệnh nhân chỉ lấy từ access token (`accountId`): body không có `benhNhanId`.
 */
@Injectable()
export class BookingChecksService {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(SystemConfigService)
    private readonly systemConfig: SystemConfigService,
    @Inject(BookabilityReader) private readonly bookability: BookabilityReader,
    @Inject(BookingSummaryReader)
    private readonly summaries: BookingSummaryReader,
    @Inject(WALLET_BALANCE_PORT) private readonly wallet: WalletBalancePort,
  ) {}

  async check(
    accountId: string,
    input: BookingChecksInput,
  ): Promise<BookingCheckResult> {
    // Cấu hình ngoài giao dịch (service dùng chung của admin; chưa cấu hình ⇒ 409 HE_THONG_CHUA_CAU_HINH)
    const config = await this.systemConfig.getOrThrow();
    // MỘT mốc cho cả luồng (H8), cắt mili giây như cột `datetime`
    const now = toSecond(nowVN());

    const outcome = await runReadOnly(
      this.dataSource,
      async (manager): Promise<CheckOutcome> => {
        const noShowLocked = await this.bookability.readNoShowLock(
          manager,
          accountId,
          'none',
        );
        if (noShowLocked === null)
          return { ok: false, failure: { kind: 'NoPatientRow' } };

        const profile = await readVisitProfile(
          manager,
          accountId,
          input.hoSoNguoiThanId,
        );
        if (profile === 'missing')
          return { ok: false, failure: { kind: 'ProfileMissing' } };
        if (profile === 'inactive')
          return { ok: false, failure: { kind: 'ProfileInactive' } };

        const read = await this.bookability.read(
          manager,
          {
            khungGioId: input.khungGioId,
            benhNhanId: accountId,
            hoSoNguoiThanId: input.hoSoNguoiThanId,
            noShowLocked,
            soLichHenToiDa: config.soLichHenToiDaMoiHoSo,
            now,
          },
          'none',
        );
        if (read.kind === 'SlotNotFound')
          return { ok: false, failure: { kind: 'SlotNotFound' } };

        const verdict = evaluateBookability(read.facts);
        if (!verdict.ok)
          return { ok: false, failure: failureOfVerdict(verdict) };

        // Chỉ đọc tóm tắt khi khung giờ đặt được: không lộ thêm gì ngoài thông tin công khai của `search`
        const summary = await this.summaries.read(manager, {
          bacSiId: read.facts.doctor.bacSiId,
          thoiGian: read.facts.slot.ngayGio,
          benhNhanId: accountId,
          hoSoNguoiThanId: input.hoSoNguoiThanId,
        });
        return { ok: true, summary };
      },
    );
    // Ném SAU khi giao dịch đã đóng
    if (!outcome.ok) throw bookingFailureException(outcome.failure);

    // Số dư ví (cổng không nhận `em`, chạy ngoài giao dịch) CHỈ hỏi khi có cọc: so bằng `toCents`, không bằng số thực. Khoá luôn có mặt (chuỗi hoặc null).
    // Cổng ném lỗi thì để lỗi lan ra (500), KHÔNG hạ xuống `null`: `null` đã nghĩa "cọc 0" hoặc "chưa có ví thật", dùng cho lỗi sẽ làm giao diện hiểu nhầm là không cần kiểm số dư (quyết định 11/11/2026, B7-N).
    const soDuVi =
      toCents(outcome.summary.tienCoc) > 0n
        ? await this.wallet.available(accountId)
        : null;

    return {
      tomTat: { ...outcome.summary, soDuVi },
      // Giờ máy chủ lấy SAU cùng, gần lúc gửi nhất, để giao diện bù lệch đồng hồ (như B2); giữ mili giây
      thoiGianMayChu: nowVN().toISOString(),
    };
  }
}
