import type { DataSource } from 'typeorm';
import type {
  HanhDongNhayCam,
  LoaiDoiTuongNhatKy,
  TrangThaiLichHen,
} from '../../admin/entities/enums.js';
import { toErrorResponse } from '../../common/errors/all-exceptions.filter.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { BookingFixtures } from './booking-fixtures.js';
import type { OperationsListFixtures } from './operations-list-fixtures.js';

// Hạ tầng test dùng chung của danh sách và chi tiết lịch hẹn cho QUẢN TRỊ VIÊN (task B4): int-spec và e2e cùng dùng để jscpd không thấy dựng dữ liệu hai lần (PLAN booking 5.15, H18;
// TRACKING 3.33). BỌC `OperationsListFixtures` (hai chi nhánh, bảy trạng thái) và thêm: hai Quản trị viên, dòng nhật ký `OverrideLichHen` ghi bằng SQL THÔ (cố ý KHÔNG dùng `AuditService` hay
// mã của B14 nên B4 không phụ thuộc mã B14 khi chạy test; chỉ phụ thuộc HÌNH DẠNG dòng nhật ký, ghi ở `appointment-history.reader.ts`) và hàm đặt mốc `thoi_diem_tao`, `thoi_diem_huy`.
// Mọi giờ là CHUỖI giờ VN `YYYY-MM-DD HH:mm:ss` (không `Date`: không qua múi giờ của driver, H1); đọc lại ra `Date` rồi `toISOString()`, nên 08:00 giờ VN là 01:00Z. Dữ liệu giả.

// Khoá ĐÚNG của hình dạng đầu ra (PLAN booking 7.39 ADL-02), đã sắp theo bảng chữ cái để so với `Object.keys(...).sort()`; int-spec và e2e cùng dùng
export const ADMIN_ROOT_KEYS = ['items', 'page', 'pageSize', 'total'];
export const ADMIN_ITEM_KEYS = [
  'bacSi',
  'chiNhanh',
  'chuyenKhoa',
  'dichVu',
  'giaSnapshot',
  'maLichHen',
  'nguoiDat',
  'nguoiKham',
  'thoiGian',
  'tienCoc',
  'trangThai',
];
/** Mười sáu khoá của chi tiết Lễ tân cộng `lichSuTrangThai`. */
export const ADMIN_DETAIL_KEYS = [
  ...ADMIN_ITEM_KEYS,
  'chuyenDuoc',
  'conPhaiThu',
  'hanThanhToan',
  'lichSuTrangThai',
  'lyDoHuy',
  'lyDoKham',
].sort();

/** Một dòng `nhat_ky_hanh_dong` THÔ: mọi cột khai tường minh để ca âm dựng được dòng sai (hành động khác, đối tượng khác, thất bại, `changes` hỏng). */
export interface AuditRowInput {
  actorId: string;
  chiNhanhId: string | null;
  hanhDong: HanhDongNhayCam;
  loaiDoiTuong: LoaiDoiTuongNhatKy;
  maDoiTuong: string;
  /** Giờ VN `YYYY-MM-DD HH:mm:ss` */
  at: string;
  ketQua: 'ThanhCong' | 'ThatBai';
  /** Giá trị cột JSON; `null` là SQL NULL; mọi giá trị khác được `JSON.stringify` */
  changes: unknown;
}

/** `chi_tiet_thay_doi` của override đúng hình dạng B14: `{ truoc: { trang_thai }, sau: { trang_thai }, ly_do }`. */
export const overrideChanges = (
  from: TrangThaiLichHen,
  to: TrangThaiLichHen,
  lyDo: string,
) => ({
  truoc: { trang_thai: from },
  sau: { trang_thai: to },
  ly_do: lyDo,
});

/** Chèn một dòng nhật ký thô; trả `nhat_ky_hanh_dong_id` (chuỗi). */
export async function insertAuditRow(
  db: DataSource,
  row: AuditRowInput,
): Promise<string> {
  const result = await db.query<{ insertId: number | string }>(
    `INSERT INTO nhat_ky_hanh_dong
       (tai_khoan_id, chi_nhanh_id, hanh_dong, loai_doi_tuong, ma_doi_tuong, thoi_diem, ket_qua, chi_tiet_thay_doi)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.actorId,
      row.chiNhanhId,
      row.hanhDong,
      row.loaiDoiTuong,
      row.maDoiTuong,
      row.at,
      row.ketQua,
      row.changes === null ? null : JSON.stringify(row.changes),
    ],
  );
  return String(result.insertId);
}

export interface OverrideInput {
  lichHenId: string;
  chiNhanhId: string;
  actorId: string;
  at: string;
  from: TrangThaiLichHen;
  to: TrangThaiLichHen;
  lyDo?: string;
}

export class AdminListFixtures {
  constructor(
    private readonly fx: BookingFixtures,
    private readonly ofx: OperationsListFixtures,
    private readonly db: DataSource,
  ) {}

  /** `OperationsListFixtures.world()` cộng Quản trị viên Toàn hệ thống và một Quản trị viên cho MỖI chi nhánh. */
  async world() {
    const w = await this.ofx.world();
    return {
      ...w,
      systemAdmin: await this.fx.admin.admin(),
      adminA: await this.fx.admin.admin(w.branchA),
      adminB: await this.fx.admin.admin(w.branchB),
    };
  }

  /** Một dòng override ĐÚNG hình dạng của B14 (ghi bằng SQL thô); `overrides` ghi đè từng cột để dựng dòng sai. */
  override(
    input: OverrideInput,
    overrides: Partial<AuditRowInput> = {},
  ): Promise<string> {
    return insertAuditRow(this.db, {
      actorId: input.actorId,
      chiNhanhId: input.chiNhanhId,
      hanhDong: 'OverrideLichHen',
      loaiDoiTuong: 'lich_hen',
      maDoiTuong: input.lichHenId,
      at: input.at,
      ketQua: 'ThanhCong',
      changes: overrideChanges(
        input.from,
        input.to,
        input.lyDo ?? 'Bệnh nhân gọi điện xin đổi',
      ),
      ...overrides,
    });
  }

  /** Đặt mốc của lịch (chuỗi giờ VN): `tao` là `thoi_diem_tao`, `huy` và `lyDoHuy` là `thoi_diem_huy` và `ly_do_huy`; mốc không nêu thì giữ nguyên. */
  async setMilestones(
    lichHenId: string,
    milestones: { tao?: string; huy?: string | null; lyDoHuy?: string | null },
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (milestones.tao !== undefined) {
      sets.push('thoi_diem_tao = ?');
      params.push(milestones.tao);
    }
    if (milestones.huy !== undefined) {
      sets.push('thoi_diem_huy = ?');
      params.push(milestones.huy);
    }
    if (milestones.lyDoHuy !== undefined) {
      sets.push('ly_do_huy = ?');
      params.push(milestones.lyDoHuy);
    }
    if (sets.length === 0) return;
    await this.db.query(
      `UPDATE lich_hen SET ${sets.join(', ')} WHERE lich_hen_id = ?`,
      [...params, lichHenId],
    );
  }
}

/** Đợi một lời hứa phải bị từ chối bằng `AppException` (ca âm); không ném thì làm hỏng test, lỗi khác thì ném lại. */
export async function appErrorOf(
  promise: Promise<unknown>,
): Promise<AppException> {
  const outcome = await promise.then(
    () => null,
    (error: unknown) => error,
  );
  if (outcome instanceof AppException) return outcome;
  throw outcome ?? new Error('Lẽ ra phải ném AppException');
}

/** Thân JSON của lỗi, dạng chuỗi, để so "giống từng ký tự" giữa hai ca 404. */
export const errorBodyText = (error: AppException): string =>
  JSON.stringify(toErrorResponse(error).body);
