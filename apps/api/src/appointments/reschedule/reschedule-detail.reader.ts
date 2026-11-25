import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  evaluateRescheduleAvailability,
  type RescheduleAvailability,
} from './reschedulability.rules.js';
import { RescheduleRequestRepository } from './reschedule-request.repository.js';
import type { PatientRescheduleRequest } from './reschedule-request.types.js';
import { RescheduleReader } from './reschedule.reader.js';
import type { RescheduleActor, RescheduleConfig } from './reschedule.types.js';

// Hai khoá đổi lịch của CHI TIẾT lịch hẹn (reschedule B5; PLAN reschedule 5.8; hợp đồng web F1 mục 6 và 8). CHỈ ĐỌC, không khoá, không log (mã lịch, lý do, ghi chú là dữ liệu cá nhân). Người gọi truyền
// `em` của MỘT lần `runReadOnly` nên hàng lịch và hai khoá này cùng ảnh chụp. `choPhepDoiLich` do CHÍNH `evaluateRescheduleAvailability` quyết (cùng hàm với `choPhepDoi` của preview không có `khungGioId`
// ở B6, và cùng các bước 1 đến 5, 11, 13, 14 với `evaluateReschedulability`): không có bản luật thứ hai ở đây, ở web hay ở reader khác.
//  - Bệnh nhân: vai `TuDoi` (còn lần thì đổi ngay, hết lần thì gửi yêu cầu nếu chưa có yêu cầu chờ).
//  - Lễ tân: vai `DoiHo` trong chi nhánh của họ (đổi hộ không giới hạn số lần, hạn là `thoi_gian + check_in_sau_phut`, được phép khi lịch đang có yêu cầu chờ: KDL-19).
// Thiếu `cau_hinh_he_thong` thì `choPhepDoiLich` là `false` và KHÔNG ném 409: chi tiết vẫn đọc được (409 là của route ghi và preview; nếp CT-10 của Lễ tân).

// Giá trị điền chỗ khi chưa có cấu hình: dữ kiện đọc ra không dùng chúng để quyết gì (chỉ chép vào `facts`), còn `choPhep` bị ép `false`.
const UNCONFIGURED: Pick<
  RescheduleConfig,
  'soLanTuDoiLichToiDa' | 'checkInSauPhut'
> = { soLanTuDoiLichToiDa: 0, checkInSauPhut: 0 };

export interface PatientRescheduleView {
  choPhepDoiLich: boolean;
  /** Yêu cầu MỚI NHẤT của lịch (danh sách trắng), hoặc `null` khi chưa có */
  yeuCauDoiLich: PatientRescheduleRequest | null;
}

export interface ReceptionRescheduleView {
  choPhepDoiLich: boolean;
  /** Có yêu cầu `ChoDuyet` của lịch này (kể cả lịch đã tồn: gốc đã huỷ hay đã tiếp đón, R6) */
  coYeuCauChoDuyet: boolean;
}

@Injectable()
export class RescheduleDetailReader {
  constructor(
    @Inject(RescheduleReader) private readonly reader: RescheduleReader,
    @Inject(RescheduleRequestRepository)
    private readonly requests: RescheduleRequestRepository,
  ) {}

  async forPatient(
    em: EntityManager,
    input: {
      accountId: string;
      maLichHen: string;
      lichHenId: string;
      now: Date;
    },
  ): Promise<PatientRescheduleView> {
    const availability = await this.availability(
      em,
      { via: 'TuDoi', accountId: input.accountId },
      input.maLichHen,
      input.now,
    );
    const latest = await this.requests.findLatest(em, input.lichHenId);
    return {
      choPhepDoiLich: availability.choPhep,
      yeuCauDoiLich:
        latest === null
          ? null
          : {
              trangThai: latest.trangThai,
              thoiGianMongMuon: latest.thoiGianMongMuon.toISOString(),
              ghiChuXuLy: latest.ghiChuXuLy,
              thoiDiemTao: latest.thoiDiemTao.toISOString(),
            },
    };
  }

  async forReception(
    em: EntityManager,
    input: { chiNhanhId: string; maLichHen: string; now: Date },
  ): Promise<ReceptionRescheduleView> {
    const availability = await this.availability(
      em,
      { via: 'DoiHo', chiNhanhId: input.chiNhanhId },
      input.maLichHen,
      input.now,
    );
    return {
      choPhepDoiLich: availability.choPhep,
      coYeuCauChoDuyet: availability.coYeuCauChoDuyet,
    };
  }

  private async availability(
    em: EntityManager,
    actor: RescheduleActor,
    maLichHen: string,
    now: Date,
  ): Promise<RescheduleAvailability> {
    const config = await this.reader.tryConfig();
    const facts = await this.reader.readAvailability(em, {
      actor,
      maLichHen,
      now,
      config: config ?? UNCONFIGURED,
    });
    const availability = evaluateRescheduleAvailability(facts);
    return config === null ? { ...availability, choPhep: false } : availability;
  }
}
