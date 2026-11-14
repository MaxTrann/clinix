import type { DataSource } from 'typeorm';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { NoShowJob } from '../noshow/no-show.job.js';
import { NoShowSweepService } from '../noshow/no-show-sweep.service.js';
import { createFakePorts } from './fake-ports.js';
import {
  createOverrideStack,
  OVERRIDE_REASON,
  overrideBy,
  type OverrideStack,
  type OverrideWho,
} from './override-world.js';
import type { StatusWorld } from './status-world.js';

// Hạ tầng test dùng chung của job tự Vắng mặt BỎ QUA lịch đã được Quản trị viên override (task B18; PLAN booking 7.46 `[đề xuất]` NSO-03…NSO-11; TRACKING 3.40 B18-F): int-spec của câu SQL, của job, của ca đồng thời và e2e cùng
// dựng MỘT bộ dịch vụ và chèn nhật ký MỘT cách, để jscpd (vốn quét `testing/*.ts` và `*.int-spec.ts`) không thấy cùng một đoạn ở nhiều file. CHỈ IMPORT `override-world.ts` (B14) và `no-show-world.ts` (B13), không sửa chúng. Nằm
// trong `testing/` nên AR-01, AR-06 và AR-08 bỏ qua (có `INSERT INTO nhat_ky_hanh_dong` bằng SQL thẳng: dòng nhật ký là dữ liệu dựng của test, như `setNoShow` với `benh_nhan`).

/**
 * "Một bản API" của job CỘNG đường override: `createOverrideStack` (dịch vụ chuyển trạng thái, huỷ và `AdminOverrideService` THẬT, `AuditService` thật ghi dòng `nhat_ky_hanh_dong` thật, thông báo ghi thật, cổng `Fake`) cùng
 * `NoShowSweepService` và `NoShowJob` THẬT dựng trên chính `transition` và `configs` đó. Truyền chung `ports` để hai bản API đếm vào cùng bộ đếm.
 */
export function createNoShowOverrideStack(
  db: DataSource,
  ports: ReturnType<typeof createFakePorts> = createFakePorts(),
) {
  const stack = createOverrideStack(db, ports);
  const sweep = new NoShowSweepService(db, stack.transition, stack.configs);
  return { ...stack, sweep, job: new NoShowJob(sweep) };
}

export type NoShowOverrideStack = ReturnType<typeof createNoShowOverrideStack>;

/** Quản trị viên override lịch `maLichHen` lần lượt sang từng đích, MỖI lần một lời gọi `AdminOverrideService` THẬT (một giao dịch riêng, một dòng nhật ký riêng). Một lời gọi bị từ chối thì ném `AppException`. */
export async function overrideChain(
  w: StatusWorld,
  stack: OverrideStack,
  maLichHen: string,
  targets: readonly TrangThaiLichHen[],
  who: OverrideWho = 'Toan',
): Promise<void> {
  for (const trangThai of targets)
    await overrideBy(w, stack, who, maLichHen, trangThai);
}

/** Một dòng `nhat_ky_hanh_dong` dựng bằng SQL: đủ các cột mà ba điều kiện của mảnh "chưa từng override" và các biến thể "gần giống" cần. */
export interface AuditRowInput {
  maDoiTuong: string;
  hanhDong: string;
  loaiDoiTuong: string;
  ketQua: 'ThanhCong' | 'ThatBai';
  /** 'YYYY-MM-DD HH:MM:SS' (chuỗi thẳng, không hàm giờ của DB) */
  thoiDiem: string;
}

/** Dòng "override thành công của lịch `maDoiTuong`" (đúng hợp đồng của B14); `over` đổi từng trường để dựng biến thể gần giống (ThatBai, hành động khác, bảng khác, dòng cũ). */
export const auditRow = (
  maDoiTuong: string,
  over: Partial<AuditRowInput> = {},
): AuditRowInput => ({
  maDoiTuong,
  hanhDong: 'OverrideLichHen',
  loaiDoiTuong: 'lich_hen',
  ketQua: 'ThanhCong',
  thoiDiem: '2026-11-10 12:00:00',
  ...over,
});

/**
 * Chèn các dòng nhật ký bằng MỘT câu `INSERT` nhiều hàng (tài khoản thực hiện là Quản trị viên Toàn hệ thống và chi nhánh của thế giới: khoá ngoại có thật). `chi_tiet_thay_doi` đúng hình dạng của B14.
 * Dùng khi cần RẤT NHIỀU dòng (lô lớn) hay dòng mà B14 không bao giờ ghi (`ThatBai`); ca còn lại override qua `AdminOverrideService` thật.
 */
export async function insertAuditRows(
  db: DataSource,
  w: StatusWorld,
  rows: readonly AuditRowInput[],
): Promise<void> {
  if (rows.length === 0) return;
  const detail = JSON.stringify({
    truoc: { trang_thai: 'VangMat' },
    sau: { trang_thai: 'DaXacNhan' },
    ly_do: OVERRIDE_REASON,
  });
  const params = rows.flatMap((row) => [
    w.systemAdmin.account.taiKhoanId,
    w.branch.chiNhanhId,
    row.hanhDong,
    row.loaiDoiTuong,
    row.maDoiTuong,
    row.thoiDiem,
    row.ketQua,
    detail,
  ]);
  await db.query(
    `INSERT INTO nhat_ky_hanh_dong (tai_khoan_id, chi_nhanh_id, hanh_dong, loai_doi_tuong, ma_doi_tuong, thoi_diem, ket_qua, chi_tiet_thay_doi)
VALUES ${rows.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`,
    params,
  );
}
