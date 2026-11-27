import type { DataSource, EntityManager } from 'typeorm';
import {
  RefundPolicyReader,
  toRefundPolicyView,
  type RefundTierView,
} from '../../appointments/create/refund-policy.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import { publicServiceCondition } from '../../search/common/public-service.sql.js';
import type { ScheduleRow } from '../../search/common/weekly-schedule.view.js';
import type {
  BaseSnapshot,
  BaseSource,
  ClinicInfo,
  NamedRow,
  SpecialtyRow,
} from './context.types.js';

// Đọc DỮ LIỆU CÔNG KHAI bằng truy vấn trực tiếp (chatbot B2; PLAN chatbot 5.6, T7). Chỉ phần mà `search` chưa có dịch vụ nhận `manager`:
// chuyên khoa đang hoạt động, dịch vụ đang cung cấp, chi nhánh, thông tin phòng khám, và đọc lại đúng các thực thể được nhắc khi dựng đoạn.
// Bác sĩ KHÔNG đọc ở đây (đi qua `PublicDoctorService`, xem `doctor-source.ts`).
// MỌI truy vấn nằm trong `runReadOnly` (MySQL từ chối câu ghi): không ghi DB, không khoá, không giao dịch ghi. Id BIGINT luôn đổi sang CHUỖI.

type IdRow = { id: string | number };
type NamedDbRow = IdRow & { ten: string };

const toNamed = (row: NamedDbRow): NamedRow => ({
  id: String(row.id),
  ten: row.ten,
});

// Chuỗi rỗng hay toàn khoảng trắng coi như chưa khai báo
const nullIfBlank = (value: string | null | undefined): string | null =>
  value === null || value === undefined || value.trim() === '' ? null : value;

export interface EntityNeeds {
  readonly specialtyIds: readonly string[];
  readonly branchIds: readonly string[];
  readonly serviceIds: readonly string[];
  /** Con của `serviceIds` cần mốc hoàn (chỉ đọc `moc_hoan_tien` khi cọc > 0). */
  readonly refundServiceIds: readonly string[];
  readonly clinic: boolean;
}

export interface ResolvedBranch {
  readonly ten: string;
  readonly diaChi: string;
  readonly schedule: ScheduleRow[];
}

export interface ResolvedService {
  readonly ten: string;
  readonly giaMacDinh: string;
  readonly mucDatCoc: string;
  readonly thoiLuong: number;
  /** Chỉ có nghĩa với dịch vụ trong `refundServiceIds`: `null` là không đặt cọc, `[]` là có cọc chưa có mốc. */
  readonly refund: RefundTierView[] | null;
}

export interface ResolvedEntities {
  readonly specialties: Map<string, string>;
  readonly branches: Map<string, ResolvedBranch>;
  readonly services: Map<string, ResolvedService>;
  readonly clinic: ClinicInfo | null;
}

export class PublicContextRepository implements BaseSource {
  private readonly refunds = new RefundPolicyReader();

  constructor(private readonly db: DataSource) {}

  /** Phần nền, cùng MỘT ảnh chụp dữ liệu (NGC-01, NGC-02). */
  loadBase(): Promise<BaseSnapshot> {
    return runReadOnly(this.db, async (manager) => {
      const specialties = await manager.query<
        (NamedDbRow & { moTa: string | null })[]
      >(
        `SELECT chuyen_khoa_id AS id, ten AS ten, mo_ta AS moTa
         FROM chuyen_khoa WHERE trang_thai_hoat_dong = 'DangHoatDong'
         ORDER BY ten ASC, chuyen_khoa_id ASC`,
      );
      const branches = await manager.query<NamedDbRow[]>(
        `SELECT chi_nhanh_id AS id, ten AS ten FROM chi_nhanh
         ORDER BY ten ASC, chi_nhanh_id ASC`,
      );
      const services = await manager.query<NamedDbRow[]>(
        `SELECT d.dich_vu_kham_id AS id, d.ten AS ten
         FROM dich_vu_kham d WHERE ${publicServiceCondition(false)}
         ORDER BY d.ten ASC, d.dich_vu_kham_id ASC`,
      );
      return {
        clinic: await this.readClinic(manager),
        branches: branches.map(toNamed),
        specialties: specialties.map((row): SpecialtyRow => ({
          ...toNamed(row),
          moTa: row.moTa ?? null,
        })),
        services: services.map(toNamed),
      };
    });
  }

  /** Chuyên khoa đang hoạt động trong `ids` (id → tên); id đã ngừng hay không có thì vắng mặt (ANX-02). */
  findActiveSpecialties(
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, string>> {
    if (ids.length === 0) return Promise.resolve(new Map());
    return runReadOnly(this.db, async (manager) => {
      const rows = await this.activeSpecialties(manager, ids);
      return new Map(rows.map((row) => [String(row.id), row.ten]));
    });
  }

  /** Đọc LẠI các thực thể được nhắc trong câu trả lời, cùng MỘT ảnh chụp (DCR-11): thực thể không còn hiệu lực thì vắng mặt trong kết quả. */
  readEntities(needs: EntityNeeds): Promise<ResolvedEntities> {
    return runReadOnly(this.db, async (manager) => {
      const specialties = new Map(
        (await this.activeSpecialties(manager, needs.specialtyIds)).map(
          (row) => [String(row.id), row.ten] as const,
        ),
      );
      return {
        specialties,
        branches: await this.readBranches(manager, needs.branchIds),
        services: await this.readServices(manager, needs),
        clinic: needs.clinic ? await this.readClinic(manager) : null,
      };
    });
  }

  private async activeSpecialties(
    manager: EntityManager,
    ids: readonly string[],
  ): Promise<NamedDbRow[]> {
    if (ids.length === 0) return [];
    return manager.query<NamedDbRow[]>(
      `SELECT chuyen_khoa_id AS id, ten AS ten FROM chuyen_khoa
       WHERE chuyen_khoa_id IN (?) AND trang_thai_hoat_dong = 'DangHoatDong'`,
      [ids],
    );
  }

  private async readClinic(manager: EntityManager): Promise<ClinicInfo> {
    const rows = await manager.query<
      {
        ten: string | null;
        hotline: string | null;
        email: string | null;
      }[]
    >(
      `SELECT ten_thuong_hieu AS ten, duong_day_nong AS hotline, email AS email
       FROM thong_tin_phong_kham WHERE id = 1`,
    );
    const row = rows[0];
    return {
      ten: nullIfBlank(row?.ten),
      hotline: nullIfBlank(row?.hotline),
      email: nullIfBlank(row?.email),
    };
  }

  private async readBranches(
    manager: EntityManager,
    ids: readonly string[],
  ): Promise<Map<string, ResolvedBranch>> {
    const result = new Map<string, ResolvedBranch>();
    if (ids.length === 0) return result;
    const branches = await manager.query<(NamedDbRow & { diaChi: string })[]>(
      `SELECT chi_nhanh_id AS id, ten AS ten, dia_chi AS diaChi
       FROM chi_nhanh WHERE chi_nhanh_id IN (?)`,
      [ids],
    );
    // Chỉ lịch ĐANG ÁP DỤNG của chi nhánh (như `PublicBranchRepository.findDetail`)
    const schedule = await manager.query<
      (ScheduleRow & { chiNhanhId: string | number })[]
    >(
      `SELECT chi_nhanh_id AS chiNhanhId, thu_trong_tuan AS thuTrongTuan, hoat_dong AS hoatDong,
              gio_bat_dau_sang AS gioBatDauSang, gio_ket_thuc_sang AS gioKetThucSang,
              gio_bat_dau_chieu AS gioBatDauChieu, gio_ket_thuc_chieu AS gioKetThucChieu
       FROM chi_nhanh_lich_hoat_dong WHERE chi_nhanh_id IN (?)`,
      [ids],
    );
    for (const row of branches) {
      const id = String(row.id);
      result.set(id, {
        ten: row.ten,
        diaChi: row.diaChi,
        schedule: schedule
          .filter((day) => String(day.chiNhanhId) === id)
          // mysql2 trả TINYINT(1) là 0/1: đổi sang boolean cho bộ dựng giờ
          .map((day) => ({ ...day, hoatDong: Boolean(day.hoatDong) })),
      });
    }
    return result;
  }

  private async readServices(
    manager: EntityManager,
    needs: EntityNeeds,
  ): Promise<Map<string, ResolvedService>> {
    const result = new Map<string, ResolvedService>();
    if (needs.serviceIds.length === 0) return result;
    // Chỉ dịch vụ còn ít nhất một chi nhánh cung cấp (cùng điều kiện công khai với search)
    const rows = await manager.query<
      (NamedDbRow & {
        giaMacDinh: string;
        mucDatCoc: string;
        thoiLuong: number | string;
      })[]
    >(
      `SELECT d.dich_vu_kham_id AS id, d.ten AS ten, d.gia_mac_dinh AS giaMacDinh,
              d.muc_dat_coc AS mucDatCoc, d.thoi_luong AS thoiLuong
       FROM dich_vu_kham d
       WHERE d.dich_vu_kham_id IN (?) AND ${publicServiceCondition(false)}`,
      [needs.serviceIds],
    );
    for (const row of rows) {
      const id = String(row.id);
      const snapshot = needs.refundServiceIds.includes(id)
        ? await this.refunds.read(manager, id, String(row.mucDatCoc))
        : null;
      result.set(id, {
        ten: row.ten,
        giaMacDinh: String(row.giaMacDinh),
        mucDatCoc: String(row.mucDatCoc),
        thoiLuong: Number(row.thoiLuong),
        refund: toRefundPolicyView(snapshot),
      });
    }
    return result;
  }
}
