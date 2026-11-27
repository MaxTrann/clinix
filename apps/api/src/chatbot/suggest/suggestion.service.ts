import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import { nowVN, todayVN } from '../../common/time/time.js';
import {
  formatCalendarDate,
  parseCalendarDate,
} from '../../scheduling/calendar-date.js';
import {
  AvailableSlotsReader,
  type AvailableSlot,
} from '../../scheduling/slots/available-slots.reader.js';
import {
  PublicDoctorQueryDto,
  type PublicDoctorItem,
} from '../../search/doctors/public-doctor.dto.js';
import { PublicDoctorService } from '../../search/doctors/public-doctor.service.js';
import { SLOT_WINDOW_DAYS } from '../../search/search.constants.js';
import { DoctorDegreeRepository } from './doctor-degree.repository.js';
import {
  parseWeight,
  rankDoctors,
  type RankCandidate,
} from './ranking.rules.js';
import {
  parseSuggestionQuery,
  type SuggestionQuery,
} from './suggestion-query.parser.js';
import {
  CANDIDATE_LIMIT,
  MAX_DOCTORS,
  MAX_SLOTS_PER_DOCTOR,
} from './suggestion.constants.js';
import type {
  SuggestedDoctor,
  SuggestedSlot,
  SuggestionQueryDto,
  SuggestionResponse,
} from './suggestion.dto.js';
import { SuggestionRepository } from './suggestion.repository.js';

// API gợi ý bác sĩ và khung giờ trống theo chuyên khoa (chatbot B4; PLAN chatbot 5.11, 5.12; 2.4.7 b9, b10, A5). THUẦN DỮ LIỆU và TẤT ĐỊNH: không AI,
// không mạng, không ghi DB, không khoá, không log. Chatbot không giữ chỗ và không đặt lịch: ô giờ chỉ là mã `khungGioId` để web dựng liên kết đặt lịch.

/** Ô trống của một ngày, theo từng bác sĩ (chỉ bác sĩ còn ít nhất một ô). */
type FreeSlots = Map<string, AvailableSlot[]>;

interface ReadResult {
  ngay: string;
  free: FreeSlots;
  degrees: Awaited<ReturnType<DoctorDegreeRepository['readDegrees']>>;
  systemTenths: number | null;
}

/** Ứng viên đã đủ dữ kiện chấm, còn giữ bản ghi công khai để dựng thân trả về. */
interface Candidate extends RankCandidate {
  readonly item: PublicDoctorItem;
}

/** Hôm nay và 6 ngày kế (cửa sổ 7 ngày), cộng ngày bằng số ngày kể từ 1970 nên không phụ thuộc múi giờ máy. */
function windowDays(today: string): string[] {
  const start = parseCalendarDate(today) as number;
  return Array.from({ length: SLOT_WINDOW_DAYS }, (_, offset) =>
    formatCalendarDate(start + offset),
  );
}

// Id BIGINT so theo số (không qua `Number`), để thứ tự ô cùng giờ ổn định.
function compareIds(a: string, b: string): number {
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Các ô SỚM NHẤT (tối đa 6), giờ tăng dần; chỉ chọn từng trường nên không trường nào của bộ đọc tự lọt ra ngoài. */
function earliestSlots(slots: readonly AvailableSlot[]): SuggestedSlot[] {
  return [...slots]
    .sort(
      (a, b) =>
        a.batDau.localeCompare(b.batDau) ||
        compareIds(a.khungGioId, b.khungGioId),
    )
    .slice(0, MAX_SLOTS_PER_DOCTOR)
    .map((slot) => ({
      khungGioId: slot.khungGioId,
      batDau: slot.batDau,
      ca: slot.ca,
    }));
}

/** Thân trả về của một bác sĩ: CHỌN TỪNG TRƯỜNG (danh sách trắng), không `...spread`. */
function toSuggestedDoctor(
  item: PublicDoctorItem,
  slots: readonly AvailableSlot[],
): SuggestedDoctor {
  return {
    bacSiId: item.bacSiId,
    hoTen: item.hoTen,
    chucDanh: item.chucDanh,
    chiNhanh: {
      chiNhanhId: item.chiNhanh.chiNhanhId,
      ten: item.chiNhanh.ten,
      diaChi: item.chiNhanh.diaChi,
    },
    giaKham: item.gia.giaKham,
    danhGia: {
      diemTrungBinh: item.danhGia.diemTrungBinh,
      soDanhGia: item.danhGia.soDanhGia,
    },
    khungGio: earliestSlots(slots),
  };
}

@Injectable()
export class SuggestionService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(PublicDoctorService)
    private readonly doctors: Pick<PublicDoctorService, 'list'>,
    @Inject(AvailableSlotsReader)
    private readonly slots: Pick<AvailableSlotsReader, 'listMany'>,
    @Inject(SystemConfigService)
    private readonly config: Pick<SystemConfigService, 'getOrThrow'>,
    @Inject(SuggestionRepository)
    private readonly repository: Pick<
      SuggestionRepository,
      'findActiveSpecialty' | 'readSystemAverageTenths'
    >,
    @Inject(DoctorDegreeRepository)
    private readonly degrees: Pick<DoctorDegreeRepository, 'readDegrees'>,
  ) {}

  /**
   * Các bước theo PLAN 5.11 (0 là kiểm tham số): sai ⇒ 400 trước khi chạm DB; (1) chuyên khoa đang hoạt động, không thì 404; (2) cấu hình hệ thống,
   * chưa có thì 409; (3) ứng viên; (4, 5) ngày và ô trống; (6) xếp hạng; (7) cắt 5 bác sĩ, mỗi người 6 ô; (8) rỗng thì nêu lý do.
   * `now` là MỘT mốc cho cả yêu cầu (cửa sổ ngày, quá giờ, hết hạn giữ chỗ); controller không truyền nên lấy `nowVN()` (test ghim `now`).
   */
  async suggest(
    rawQuery: SuggestionQueryDto,
    now: Date = nowVN(),
  ): Promise<SuggestionResponse> {
    const today = todayVN(now);
    const query = parseSuggestionQuery(rawQuery, today);

    const specialty = await this.repository.findActiveSpecialty(
      query.chuyenKhoaId,
    );
    if (!specialty) throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);

    const config = await this.config.getOrThrow();
    const weights = {
      w1: parseWeight(config.trongSoW1),
      w2: parseWeight(config.trongSoW2),
    };
    const chuyenKhoa = {
      chuyenKhoaId: specialty.chuyenKhoaId,
      ten: specialty.ten,
    };

    const candidates = await this.doctors.list(
      Object.assign(new PublicDoctorQueryDto(), {
        chuyenKhoaId: query.chuyenKhoaId,
        ...(query.chiNhanhId === null ? {} : { chiNhanhId: query.chiNhanhId }),
        page: 1,
        pageSize: CANDIDATE_LIMIT,
      }),
    );
    if (candidates.items.length === 0) {
      return {
        chuyenKhoa,
        ngay: query.ngay,
        bacSi: [],
        lyDoRong: 'KhongCoBacSi',
      };
    }

    // Khung giờ, học vị và điểm hệ thống cùng MỘT giao dịch chỉ đọc (cùng ảnh chụp dữ liệu)
    const read = await runReadOnly(this.db, (manager) =>
      this.readSlots(manager, candidates.items, query, today, now),
    );
    if (read === null) {
      return {
        chuyenKhoa,
        ngay: query.ngay,
        bacSi: [],
        lyDoRong: 'KhongCoKhungGio',
      };
    }

    const ranked = rankDoctors(
      candidates.items
        .filter((item) => read.free.has(item.bacSiId))
        .map((item): Candidate => ({
          bacSiId: item.bacSiId,
          hoTen: item.hoTen,
          soNamKinhNghiem: item.soNamKinhNghiem,
          hocVi: read.degrees.get(item.bacSiId) ?? null,
          soDanhGia: item.danhGia.soDanhGia,
          diemTrungBinh: item.danhGia.diemTrungBinh,
          item,
        })),
      weights,
      read.systemTenths,
    ).slice(0, MAX_DOCTORS);

    return {
      chuyenKhoa,
      ngay: read.ngay,
      bacSi: ranked.map(({ item }) =>
        toSuggestedDoctor(item, read.free.get(item.bacSiId) ?? []),
      ),
    };
  }

  /**
   * Bước 4 và 5: chọn ngày rồi giữ bác sĩ còn ô `ConTrong` (đúng `ca` nếu có). Có `ngay` thì chỉ ngày đó; không thì lần lượt hôm nay đến hôm nay + 6,
   * MỖI NGÀY MỘT lần `listMany` với cùng `now` và `manager`, và DỪNG ở ngày đầu tiên có ô (tối đa 7 lần). Không ngày nào có ô ⇒ `null`.
   * Ô đã đặt, đang giữ (còn hạn), hết hạn, nghỉ phép, chi nhánh nghỉ do bộ đọc loại sẵn (2.4.60), nên ở đây chỉ cần giữ `ConTrong`.
   */
  private async readSlots(
    manager: EntityManager,
    candidates: readonly PublicDoctorItem[],
    query: SuggestionQuery,
    today: string,
    now: Date,
  ): Promise<ReadResult | null> {
    const ids = candidates.map((item) => item.bacSiId);
    const days = query.ngay === null ? windowDays(today) : [query.ngay];
    for (const ngay of days) {
      const result = await this.slots.listMany(
        { bacSiIds: ids, ngay, now },
        manager,
      );
      const free: FreeSlots = new Map();
      for (const day of result) {
        const open = day.khungGio.filter(
          (slot) =>
            slot.trangThai === 'ConTrong' &&
            (query.ca === null || slot.ca === query.ca),
        );
        if (open.length > 0) free.set(day.bacSiId, open);
      }
      if (free.size > 0) {
        return {
          ngay,
          free,
          degrees: await this.degrees.readDegrees(manager, [...free.keys()]),
          systemTenths: await this.repository.readSystemAverageTenths(manager),
        };
      }
    }
    return null;
  }
}
