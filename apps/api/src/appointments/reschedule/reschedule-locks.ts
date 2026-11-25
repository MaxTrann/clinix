import type { EntityManager } from 'typeorm';
import type { TrangThaiYeuCauDoiLich } from '../../admin/entities/enums.js';
import {
  lockDoctorShared,
  lockSlot,
  type LockedSlot,
} from '../slots/slot-lock.js';
import {
  lockAppointment,
  type LockedAppointment,
} from '../state/cancel-appointment.query.js';
import { lockVisitProfile } from '../visit-profile.query.js';

// Khoá của ĐỔI LỊCH theo ĐÚNG thứ tự PLAN reschedule 5.4 (mở rộng bảng khoá toàn cục của booking 5.3, không đảo; reschedule B1). Đây là chỗ DUY NHẤT xin chuỗi khoá này và là chỗ DUY NHẤT sắp hai khung giờ.
//
//   Tầng  Hàng khoá                                                  Đổi (tự đổi, đổi hộ, duyệt) | Tạo yêu cầu          | Từ chối
//   2     benh_nhan FOR UPDATE của CHỦ lịch cũ (không phải người thao tác)   có                  | có                    | không
//   3     ho_so_nguoi_than FOR UPDATE (khi lịch của hồ sơ người thân)         có                  | có                    | không
//   4     bac_si FOR SHARE (một hàng: khung giờ mới phải cùng bác sĩ)         có                  | có                    | không
//   5     khung_gio FOR UPDATE: HAI hàng theo id TĂNG DẦN (so BẰNG BigInt)    cũ và mới           | MỘT hàng (mong muốn)  | không
//   6     lich_hen cũ FOR UPDATE theo KHOÁ CHÍNH (quy tắc 7, AR-05)           có                  | có                    | không
//   6c    yeu_cau_doi_lich_ngoai_chinh_sach FOR UPDATE theo khoá chính        duyệt: có           | không (chưa có hàng)  | có
//
// Vì sao thứ tự này (số đo X1, TRACKING mục 6): (1) hai khung giờ luôn theo id tăng dần nên hai lần đổi chéo X↔Y cùng xin X trước Y, không có chu trình (M1: 300 vòng 0 lần 1213; đối chứng cũ-rồi-mới 100/100 vòng 1213).
// (2) `INSERT` có khoá ngoại xin khoá S trên hàng cha (`khung_gio` mong muốn, `lich_hen`), nên khung giờ mong muốn phải được khoá TRƯỚC `lich_hen` rồi người gọi mới `INSERT` yêu cầu (M2: đảo thì 100/100 vòng 1213).
// Mọi `INSERT` có khoá ngoại (lịch mới, yêu cầu, thông báo) và `UPDATE` khung giờ, lịch chỉ chạy SAU hàm ở đây, khi mọi hàng cha đã khoá.
//
// KHOÁ NGẦM không có trong bảng trên (M5): `INSERT lich_hen` mới xin thêm khoá S ở `chi_nhanh` và `dich_vu_kham` (hai bảng cha của khoá ngoại; không có S mới ở `khung_gio`, `benh_nhan`, `bac_si`, `lich_hen` cũ vì đã tự giữ).
// `create` đang chạy y như vậy; ai giữ X ở hai bảng đó (job áp dụng thay đổi chi nhánh của admin) có thể chu trình với đổi lịch (M6): rủi ro đã biết, cùng loại TECH_DEBT 113.
//
// Nhận `em` của NGƯỜI GỌI và KHÔNG mở giao dịch (người gọi dùng `withBookingTransaction`), KHÔNG ném `AppException`: thiếu hàng ở tầng nào thì dừng NGAY, không xin tầng sau, và trả `Missing` để người gọi đổi thành lỗi
// API SAU khi giao dịch đóng. Hồ sơ người thân ĐÃ NGỪNG không phải `Missing` (luật `evaluateReschedulability` bước 5 từ chối `HO_SO_NGUOI_THAN_DA_NGUNG`; reader đọc lại dưới khoá).
// `reschedule.reader.ts` ở chế độ `locked` đòi người gọi đã giữ chuỗi này; hai câu khoá `BookabilityReader` xin lại sau đó (bac_si, khung_gio đích) là hàng ĐÃ GIỮ.

/** Bảng thiếu hàng khi khoá (dữ liệu bị xoá trong lúc chờ khoá, hoặc id sai): người gọi đổi thành 404. */
export type LockMissingTable =
  | 'benh_nhan'
  | 'ho_so_nguoi_than'
  | 'bac_si'
  | 'khung_gio'
  | 'lich_hen'
  | 'yeu_cau_doi_lich_ngoai_chinh_sach';

export interface LockMissing {
  kind: 'Missing';
  table: LockMissingTable;
}

/** Các khoá bất biến của lịch cũ, người gọi đã đọc thường MỘT lần trước khi khoá (`RescheduleReader.locate`). */
export interface RescheduleLockTarget {
  /** Chủ lịch cũ (tầng 2), KHÔNG phải tài khoản người thao tác */
  benhNhanId: string;
  /** `null` là hồ sơ BẢN THÂN (không có tầng 3) */
  hoSoNguoiThanId: string | null;
  bacSiId: string;
  lichHenId: string;
}

/** Yêu cầu đổi lịch đọc DƯỚI khoá tầng 6c. */
export interface LockedRescheduleRequest {
  yeuCauId: string;
  lichHenId: string;
  khungGioMongMuonId: string;
  trangThai: TrangThaiYeuCauDoiLich;
}

export type RescheduleChainLocks =
  | {
      kind: 'Locked';
      slotCu: LockedSlot;
      slotMoi: LockedSlot;
      appointment: LockedAppointment;
      /** Có khi người gọi truyền `yeuCauId` (duyệt) */
      request: LockedRescheduleRequest | null;
    }
  | LockMissing;

export type RequestCreationLocks =
  | { kind: 'Locked'; slot: LockedSlot; appointment: LockedAppointment }
  | LockMissing;

const missing = (table: LockMissingTable): LockMissing => ({
  kind: 'Missing',
  table,
});

// `SELECT tai_khoan_id`: chỉ cần khoá hàng, không đọc cột nào (no-show không chặn đổi lịch, Q7 (b))
const LOCK_PATIENT_SQL = `SELECT tai_khoan_id AS taiKhoanId FROM benh_nhan WHERE tai_khoan_id = ?
FOR UPDATE`;

const LOCK_REQUEST_SQL = `SELECT CAST(yeu_cau_doi_lich_ngoai_chinh_sach_id AS CHAR) AS yeuCauId, CAST(lich_hen_id AS CHAR) AS lichHenId,
  CAST(khung_gio_mong_muon_id AS CHAR) AS khungGioMongMuonId, trang_thai AS trangThai
FROM yeu_cau_doi_lich_ngoai_chinh_sach WHERE yeu_cau_doi_lich_ngoai_chinh_sach_id = ?
FOR UPDATE`;

/**
 * Hai id khung giờ theo thứ tự TĂNG DẦN, so BẰNG BigInt (không so chuỗi: "9" lớn hơn "10" khi so số, nhỏ hơn khi so chuỗi). Id BIGINT là chuỗi (có thể lớn hơn 2^53), nên không ép `Number`.
 * Hai id bằng nhau là lỗi lập trình (dịch vụ phải từ chối `KHUNG_GIO_TRUNG_LICH_CU` trước mọi khoá): `RangeError`.
 */
function ascending(a: string, b: string): [string, string] {
  const x = BigInt(a);
  const y = BigInt(b);
  if (x === y) throw new RangeError('hai khung giờ phải khác nhau');
  return x < y ? [a, b] : [b, a];
}

// Tầng 2, 3, 4. Trả bảng bị thiếu, hoặc `null` khi đủ.
async function lockOwnerAndDoctor(
  em: EntityManager,
  target: RescheduleLockTarget,
): Promise<LockMissingTable | null> {
  const patient = await em.query<unknown[]>(LOCK_PATIENT_SQL, [
    target.benhNhanId,
  ]);
  if (patient.length === 0) return 'benh_nhan';
  const profile = await lockVisitProfile(
    em,
    target.benhNhanId,
    target.hoSoNguoiThanId,
  );
  if (profile === 'missing') return 'ho_so_nguoi_than';
  if ((await lockDoctorShared(em, target.bacSiId)) === null) return 'bac_si';
  return null;
}

/** Tầng 6c: `FOR UPDATE` yêu cầu theo khoá chính. `null` nếu không có hàng. Từ chối chỉ xin tầng này. */
export async function lockRescheduleRequest(
  em: EntityManager,
  yeuCauId: string,
): Promise<LockedRescheduleRequest | null> {
  const rows = await em.query<LockedRescheduleRequest[]>(LOCK_REQUEST_SQL, [
    yeuCauId,
  ]);
  return rows[0] ?? null;
}

/**
 * Chuỗi khoá của NHÁNH ĐỔI (tự đổi, đổi hộ, duyệt): tầng 2, 3, 4, hai `khung_gio` tăng dần (cũ và mới, bất kể đâu là cũ), `lich_hen` cũ, và khi có `yeuCauId` thì yêu cầu (6c).
 * Người gọi kiểm LẠI trạng thái, sở hữu, phạm vi dưới khoá bằng `appointment` và `RescheduleReader.read(…, 'locked')`.
 */
export async function lockRescheduleChain(
  em: EntityManager,
  input: RescheduleLockTarget & {
    khungGioCuId: string;
    khungGioMoiId: string;
    /** Chỉ duyệt: khoá yêu cầu SAU `lich_hen` (6c) */
    yeuCauId?: string;
  },
): Promise<RescheduleChainLocks> {
  const [firstId, secondId] = ascending(
    input.khungGioCuId,
    input.khungGioMoiId,
  );
  const absent = await lockOwnerAndDoctor(em, input);
  if (absent !== null) return missing(absent);

  const first = await lockSlot(em, firstId);
  if (first === null) return missing('khung_gio');
  const second = await lockSlot(em, secondId);
  if (second === null) return missing('khung_gio');

  const appointment = await lockAppointment(em, input.lichHenId);
  if (appointment === null) return missing('lich_hen');

  let request: LockedRescheduleRequest | null = null;
  if (input.yeuCauId !== undefined) {
    request = await lockRescheduleRequest(em, input.yeuCauId);
    if (request === null) return missing('yeu_cau_doi_lich_ngoai_chinh_sach');
  }
  const cuIsFirst = firstId === input.khungGioCuId;
  return {
    kind: 'Locked',
    slotCu: cuIsFirst ? first : second,
    slotMoi: cuIsFirst ? second : first,
    appointment,
    request,
  };
}

/**
 * Chuỗi khoá của NHÁNH TẠO YÊU CẦU (vượt hạn mức, có lý do): tầng 2, 3, 4, MỘT `khung_gio` (khung giờ MONG MUỐN) TRƯỚC `lich_hen`, rồi `lich_hen`. Người gọi chỉ `INSERT yeu_cau…` SAU hàm này
 * (R2, X1 M2): `INSERT` xin S trên hàng cha `khung_gio` và `lich_hen`, nên hai hàng đó phải đã được giữ theo đúng chiều bảng khoá. KHÔNG khoá khung giờ cũ (nhánh yêu cầu không ghi khung giờ nào).
 */
export async function lockRequestCreation(
  em: EntityManager,
  input: RescheduleLockTarget & { khungGioMongMuonId: string },
): Promise<RequestCreationLocks> {
  const absent = await lockOwnerAndDoctor(em, input);
  if (absent !== null) return missing(absent);

  const slot = await lockSlot(em, input.khungGioMongMuonId);
  if (slot === null) return missing('khung_gio');

  const appointment = await lockAppointment(em, input.lichHenId);
  if (appointment === null) return missing('lich_hen');
  return { kind: 'Locked', slot, appointment };
}
