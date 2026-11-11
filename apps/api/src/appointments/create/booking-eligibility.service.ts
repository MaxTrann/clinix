import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import { bookingFailureException } from './booking-failure.js';
import { BOOKING_ERROR_CODES } from '../appointments.constants.js';
import { BookabilityReader } from '../slots/bookability.reader.js';
import type { EligibilityResult } from './booking-checks.dto.js';

/**
 * `GET /booking/eligibility` (task B7; PLAN booking A4, Q26; TRACKING booking 3.18 B7-C): cổng vào của luồng đặt lịch, trả "Bệnh nhân này có được đặt lịch không". CHỈ ĐỌC: một câu SELECT không khoá
 * (`readNoShowLock` chế độ `none`) nên không cần giao dịch. Bệnh nhân chỉ lấy từ access token. Khoá áp cả khi đặt cho người thân (Q14) vì cờ nằm ở `benh_nhan` của tài khoản đặt.
 *
 * HTTP 200 kể cả khi bị khoá: đây là KẾT QUẢ của cổng, không phải lỗi (`choPhepDatLich = false` kèm `lyDo`); `checks` và tạo lịch mới trả 403 cho cùng nguyên nhân. Không trả số lần no-show hay ngưỡng.
 */
@Injectable()
export class BookingEligibilityService {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(SystemConfigService)
    private readonly systemConfig: SystemConfigService,
    @Inject(BookabilityReader) private readonly bookability: BookabilityReader,
  ) {}

  async check(accountId: string): Promise<EligibilityResult> {
    // Chưa cấu hình ⇒ 409 HE_THONG_CHUA_CAU_HINH (như `checks`, DL-19)
    const config = await this.systemConfig.getOrThrow();
    const locked = await this.bookability.readNoShowLock(
      this.dataSource.manager,
      accountId,
      'none',
    );
    // Không có hàng `benh_nhan` (không phải Bệnh nhân thật): cùng 403 với `checks`
    if (locked === null)
      throw bookingFailureException({ kind: 'NoPatientRow' });

    const soLichHenToiDaMoiHoSo = config.soLichHenToiDaMoiHoSo;
    return locked
      ? {
          choPhepDatLich: false,
          lyDo: BOOKING_ERROR_CODES.BOOKING_LOCKED_NO_SHOW,
          soLichHenToiDaMoiHoSo,
        }
      : { choPhepDatLich: true, soLichHenToiDaMoiHoSo };
  }
}
