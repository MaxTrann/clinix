import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { CauHinhHeThong } from '../../admin/entities/cau-hinh-he-thong.entity.js';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import { toSecond } from '../../common/time/time.js';
import { MAX_CHAIN_DEPTH } from '../../payment/ports/payment-chain.js';
import {
  BookabilityReader,
  type BookabilityMode,
} from '../slots/bookability.reader.js';
import { parseVnDateTime, type LockedSlot } from '../slots/slot-lock.js';
import { readVisitProfile } from '../visit-profile.query.js';
import { isInScope } from './reschedulability.rules.js';
import type {
  ReschedulabilityFacts,
  RescheduleActor,
  RescheduleConfig,
  RescheduleSource,
} from './reschedule.types.js';

// `RescheduleReader`: lấy dữ kiện cho `evaluateReschedulability` (reschedule B2; PLAN reschedule 5.4 quy tắc 1, 5.5 bước 0 đến 3). CHỈ ĐỌC, nhận `em` của người gọi, KHÔNG mở giao dịch.
//  - `config()`: ba giá trị của `cau_hinh_he_thong`; thiếu ⇒ 409 `HE_THONG_CHUA_CAU_HINH`, KHÔNG có số ngầm (quy tắc 35).
//  - `locate()`: ĐỌC THƯỜNG MỘT lần theo `ma_lich_hen` để biết khoá nào cần xin (id của lịch cũ, chủ, bác sĩ, khung giờ cũ; cả năm bất biến sau khi chèn) và bác sĩ của khung giờ đích.
//  - `read(…, 'none')`: preview, không khoá gì. `read(…, 'locked')`: người gọi ĐÃ giữ chuỗi khoá tầng 2, 3, 4, 5 (hai `khung_gio` theo id tăng dần), 6 (`reschedule-locks.ts`, B1);
//    reader KHÔNG tự xin khoá nào trong chuỗi đó, nó đọc LẠI lịch cũ (kiểm lại trạng thái, sở hữu, phạm vi dưới khoá) rồi gọi `BookabilityReader.read(…, 'locked')` cho khung giờ
//    ĐÍCH: hai câu khoá của `BookabilityReader` (`bac_si FOR SHARE`, `khung_gio FOR UPDATE`) khi đó là xin lại hàng đã giữ. `findBlocking` của cổng thay đổi chi nhánh vì thế được gọi
//    ĐÚNG MỘT lần, với `ca` của khung giờ đích (TECH_DEBT 260, phần kiểm; KDL-17).

const CONFIG_MISSING_CODE = 'HE_THONG_CHUA_CAU_HINH';

const configMissing = (): AppException =>
  new AppException(409, CONFIG_MISSING_CODE, {
    thongBao: 'Hệ thống chưa được cấu hình.',
  });

// Ba giá trị đổi lịch dùng, hoặc `null` khi có giá trị không phải số nguyên `>= 0` (dữ liệu hỏng coi như chưa cấu hình, không số ngầm).
function configOf(
  row: Pick<
    CauHinhHeThong,
    'soLanTuDoiLichToiDa' | 'checkInSauPhut' | 'soLichHenToiDaMoiHoSo'
  >,
): RescheduleConfig | null {
  const config: RescheduleConfig = {
    soLanTuDoiLichToiDa: row.soLanTuDoiLichToiDa,
    checkInSauPhut: row.checkInSauPhut,
    soLichHenToiDaMoiHoSo: row.soLichHenToiDaMoiHoSo,
  };
  for (const value of Object.values(config))
    if (!Number.isInteger(value) || value < 0) return null;
  return config;
}
// DATE_FORMAT: chuỗi giờ VN nguyên văn (không để driver đổi), như `BookabilityReader` (H13)
const DATE_TIME_FORMAT = "'%Y-%m-%d %H:%i:%s'";

interface SourceRow {
  lichHenId: string;
  maLichHen: string;
  benhNhanId: string;
  hoSoNguoiThanId: string | null;
  bacSiId: string;
  chiNhanhId: string;
  dichVuKhamId: string;
  khungGioId: string;
  trangThai: TrangThaiLichHen;
  thoiGian: string;
  soLanTuDoiLich: number | string;
}

// Lịch cũ theo `ma_lich_hen` (UNIQUE). ĐỌC THƯỜNG ở cả hai chế độ: ở `locked` người gọi đã giữ `lich_hen_id` của nó (tầng 6) nên giá trị đọc ở đây không đổi nữa.
const READ_SOURCE_SQL = `SELECT CAST(lich_hen_id AS CHAR) AS lichHenId, ma_lich_hen AS maLichHen, CAST(benh_nhan_id AS CHAR) AS benhNhanId,
  CAST(ho_so_nguoi_than_id AS CHAR) AS hoSoNguoiThanId, CAST(bac_si_id AS CHAR) AS bacSiId, CAST(chi_nhanh_id AS CHAR) AS chiNhanhId,
  CAST(dich_vu_kham_id AS CHAR) AS dichVuKhamId, CAST(khung_gio_id AS CHAR) AS khungGioId, trang_thai AS trangThai,
  DATE_FORMAT(thoi_gian, ${DATE_TIME_FORMAT}) AS thoiGian, so_lan_tu_doi_lich AS soLanTuDoiLich
FROM lich_hen WHERE ma_lich_hen = ?`;

// Bác sĩ của khung giờ đích (đọc thường khung_gio ⋈ lich_lam_viec; ca không đổi sau khi tạo): để từ chối "khác bác sĩ" TRƯỚC mọi khoá (PLAN 5.4 quy tắc 1).
const READ_TARGET_DOCTOR_SQL = `SELECT CAST(llv.bac_si_id AS CHAR) AS bacSiId
FROM khung_gio kg JOIN lich_lam_viec llv ON llv.lich_lam_viec_id = kg.lich_lam_viec_id
WHERE kg.khung_gio_id = ?`;

// Độ dài chuỗi `lich_hen_truoc_id` chứa lịch cũ, KỂ CẢ lịch cũ (đi ngược về lịch gốc theo khoá chính). Bị chặn ở `MAX_CHAIN_DEPTH` hàng nên dữ liệu hỏng (vòng) cũng chỉ ra đúng con số
// ấy chứ không treo; luật từ chối từ `MAX_CHAIN_DEPTH - 1` nên không bao giờ cần số lớn hơn. Đây là bản ĐỌC song song với `PaymentChain.rootOf` (cùng cách đi, khác kết quả: đếm
// thay vì tìm gốc); `PaymentChain` không có hàm độ dài và scope này không đổi `payment/`.
const READ_CHAIN_LENGTH_SQL = `WITH RECURSIVE chain (lich_hen_id, lich_hen_truoc_id, depth) AS (
  SELECT lich_hen_id, lich_hen_truoc_id, 1 FROM lich_hen WHERE lich_hen_id = ?
  UNION ALL
  SELECT lh.lich_hen_id, lh.lich_hen_truoc_id, chain.depth + 1
    FROM lich_hen lh JOIN chain ON lh.lich_hen_id = chain.lich_hen_truoc_id
   WHERE chain.depth < ?
)
SELECT COUNT(*) AS soLich FROM chain`;

// Lịch cũ đang có yêu cầu đổi lịch chờ duyệt (chỉ `ChoDuyet`: yêu cầu `TuChoi` hay `DaDuyet` không chặn gửi lại). Chỉ mục khoá ngoại của `lich_hen_id`.
const READ_PENDING_REQUEST_SQL = `SELECT 1 AS co FROM yeu_cau_doi_lich_ngoai_chinh_sach
WHERE lich_hen_id = ? AND trang_thai = 'ChoDuyet' LIMIT 1`;

/** Kết quả `locate`: đủ để người gọi biết khoá nào cần xin và từ chối sớm (trước mọi khoá) khi khung giờ đích trùng khung giờ cũ hay của bác sĩ khác. */
export interface RescheduleLocated {
  lichHenId: string;
  benhNhanId: string;
  hoSoNguoiThanId: string | null;
  bacSiId: string;
  khungGioCuId: string;
  /** `null` = không có khung giờ đích */
  bacSiCuaKhungGioMoiId: string | null;
}

export interface RescheduleReadInput {
  actor: RescheduleActor;
  maLichHen: string;
  khungGioMoiId: string;
  /** `toSecond(nowVN())`: MỘT mốc cho cả luồng */
  now: Date;
  config: RescheduleConfig;
  /** Bệnh nhân đã nhập lý do yêu cầu; preview truyền `true` để biết nhánh `Request` */
  requestReasonGiven: boolean;
}

export interface AvailabilityReadInput {
  actor: RescheduleActor;
  maLichHen: string;
  /** `toSecond(nowVN())` */
  now: Date;
  config: Pick<RescheduleConfig, 'soLanTuDoiLichToiDa' | 'checkInSauPhut'>;
}

/** Dữ kiện không có khung giờ đích: đủ cho `evaluateRescheduleAvailability` (không `bookability`, không `requestReasonGiven`). */
export type AvailabilityFacts = Omit<
  ReschedulabilityFacts,
  'bookability' | 'requestReasonGiven'
>;

export interface RescheduleRead {
  facts: ReschedulabilityFacts;
  /** Có ở chế độ `locked` khi khung giờ đích đọc được: bằng chứng cho `SlotHoldService` */
  locked: LockedSlot | null;
}

@Injectable()
export class RescheduleReader {
  constructor(
    @Inject(BookabilityReader) private readonly bookability: BookabilityReader,
    @Inject(SystemConfigService)
    private readonly systemConfig: SystemConfigService,
  ) {}

  /** Cấu hình của đổi lịch. Không có dòng cấu hình, hay có giá trị không phải số nguyên `>= 0`, là 409 `HE_THONG_CHUA_CAU_HINH`: KHÔNG dùng số ngầm. */
  async config(): Promise<RescheduleConfig> {
    const config = configOf(await this.systemConfig.getOrThrow());
    if (config === null) throw configMissing();
    return config;
  }

  /**
   * Như `config()` nhưng KHÔNG ném: `null` khi thiếu dòng cấu hình hay giá trị lạ (reschedule B5). Dành cho chi tiết lịch, vốn đọc được dù chưa cấu hình (`choPhepDoiLich` là `false`);
   * route GHI và preview dùng `config()` để trả 409.
   */
  async tryConfig(): Promise<RescheduleConfig | null> {
    const row = await this.systemConfig.get();
    return row === null ? null : configOf(row);
  }

  /**
   * Đọc thường MỘT lần (bước 0 của PLAN 5.5, không khoá). `null` khi không có lịch hay lịch ngoài phạm vi của `actor` (cùng một kết quả: 404 cùng thân, không khoá gì).
   * Chưa quyết gì về trạng thái hay hạn giờ: đó là việc của luật, dưới khoá.
   */
  async locate(
    em: EntityManager,
    input: { actor: RescheduleActor; maLichHen: string; khungGioMoiId: string },
  ): Promise<RescheduleLocated | null> {
    const source = await this.readSource(em, input.actor, input.maLichHen);
    if (source === null) return null;
    const target = (
      await em.query<{ bacSiId: string }[]>(READ_TARGET_DOCTOR_SQL, [
        input.khungGioMoiId,
      ])
    )[0];
    return {
      lichHenId: source.lichHenId,
      benhNhanId: source.benhNhanId,
      hoSoNguoiThanId: source.hoSoNguoiThanId,
      bacSiId: source.bacSiId,
      khungGioCuId: source.khungGioId,
      bacSiCuaKhungGioMoiId: target?.bacSiId ?? null,
    };
  }

  /** Dữ kiện đầy đủ cho `evaluateReschedulability`; xem đầu file về điều kiện đầu vào của chế độ `locked`. */
  async read(
    em: EntityManager,
    input: RescheduleReadInput,
    mode: BookabilityMode,
  ): Promise<RescheduleRead> {
    const now = toSecond(input.now);
    const base = {
      actor: input.actor,
      now,
      config: {
        soLanTuDoiLichToiDa: input.config.soLanTuDoiLichToiDa,
        checkInSauPhut: input.config.checkInSauPhut,
      },
      requestReasonGiven: input.requestReasonGiven,
    };
    const source = await this.readSource(em, input.actor, input.maLichHen);
    // Hồ sơ người thân không thuộc chủ lịch (dữ liệu lệch) coi như không có lịch: không lộ gì, cùng 404
    const profile =
      source === null
        ? 'missing'
        : await readVisitProfile(em, source.benhNhanId, source.hoSoNguoiThanId);
    if (source === null || profile === 'missing')
      return {
        facts: {
          ...base,
          source: null,
          profileActive: true,
          chainLength: 0,
          bookability: null,
          pendingRequest: false,
        },
        locked: null,
      };

    const chainLength = await this.readChainLength(em, source.lichHenId);
    // `noShowLocked: false` và `thayThe`: khoá no-show không chặn đổi lịch (Q7 (b)); lịch cũ không tính vào số lịch và chồng giờ (Q7 (e)). Khung giờ là khung giờ ĐÍCH.
    const read = await this.bookability.read(
      em,
      {
        khungGioId: input.khungGioMoiId,
        benhNhanId: source.benhNhanId,
        hoSoNguoiThanId: source.hoSoNguoiThanId,
        noShowLocked: false,
        soLichHenToiDa: input.config.soLichHenToiDaMoiHoSo,
        now,
        thayThe: { maLichHen: source.maLichHen },
      },
      mode,
    );
    const pendingRequest = await this.readPendingRequest(em, source.lichHenId);
    return {
      facts: {
        ...base,
        source,
        profileActive: profile === 'active',
        chainLength,
        bookability: read.kind === 'Read' ? read.facts : null,
        pendingRequest,
      },
      locked: read.kind === 'Read' ? read.locked : null,
    };
  }

  /**
   * Dữ kiện cho `evaluateRescheduleAvailability` (reschedule B5): lịch này có đổi được KHÔNG KÈM khung giờ đích không. CHỈ ĐỌC THƯỜNG, không khoá, không đọc khung giờ nào (nên không gọi
   * `BookabilityReader`, cổng nghỉ phép hay cổng thay đổi chi nhánh). Dùng cho chi tiết lịch và preview không có `khungGioId`; người gọi truyền `em` của MỘT lần `runReadOnly` để cùng ảnh chụp.
   * Không có lịch, ngoài phạm vi hay hồ sơ người thân không thuộc chủ lịch (dữ liệu lệch) ⇒ `source` `null` (cùng một kết quả như `read`).
   */
  async readAvailability(
    em: EntityManager,
    input: AvailabilityReadInput,
  ): Promise<AvailabilityFacts> {
    const base = {
      actor: input.actor,
      now: toSecond(input.now),
      config: input.config,
    };
    const source = await this.readSource(em, input.actor, input.maLichHen);
    const profile =
      source === null
        ? 'missing'
        : await readVisitProfile(em, source.benhNhanId, source.hoSoNguoiThanId);
    if (source === null || profile === 'missing')
      return {
        ...base,
        source: null,
        profileActive: true,
        chainLength: 0,
        pendingRequest: false,
      };
    return {
      ...base,
      source,
      profileActive: profile === 'active',
      chainLength: await this.readChainLength(em, source.lichHenId),
      pendingRequest: await this.readPendingRequest(em, source.lichHenId),
    };
  }

  // Lịch cũ trong phạm vi của `actor`, hoặc `null`
  private async readSource(
    em: EntityManager,
    actor: RescheduleActor,
    maLichHen: string,
  ): Promise<RescheduleSource | null> {
    const row = (await em.query<SourceRow[]>(READ_SOURCE_SQL, [maLichHen]))[0];
    if (row === undefined || !isInScope(actor, row)) return null;
    return {
      lichHenId: row.lichHenId,
      maLichHen: row.maLichHen,
      benhNhanId: row.benhNhanId,
      hoSoNguoiThanId: row.hoSoNguoiThanId,
      bacSiId: row.bacSiId,
      chiNhanhId: row.chiNhanhId,
      dichVuKhamId: row.dichVuKhamId,
      khungGioId: row.khungGioId,
      trangThai: row.trangThai,
      thoiGian: parseVnDateTime(row.thoiGian),
      soLanTuDoiLich: Number(row.soLanTuDoiLich),
    };
  }

  private async readChainLength(
    em: EntityManager,
    lichHenId: string,
  ): Promise<number> {
    const rows = await em.query<{ soLich: number | string }[]>(
      READ_CHAIN_LENGTH_SQL,
      [lichHenId, MAX_CHAIN_DEPTH],
    );
    return Number(rows[0]?.soLich ?? 0);
  }

  private async readPendingRequest(
    em: EntityManager,
    lichHenId: string,
  ): Promise<boolean> {
    const rows = await em.query<{ co: number }[]>(READ_PENDING_REQUEST_SQL, [
      lichHenId,
    ]);
    return rows.length > 0;
  }
}
