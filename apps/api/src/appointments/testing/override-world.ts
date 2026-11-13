import type { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import {
  TRANG_THAI_LICH_HEN,
  type TrangThaiLichHen,
} from '../../admin/entities/enums.js';
import { NhatKyHanhDong } from '../../admin/entities/nhat-ky-hanh-dong.entity.js';
import { AuditRepository } from '../../audit/audit.repository.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { canTransition } from '../state/appointment-state.matrix.js';
import type { AdminOverrideResult } from '../status/admin-override.dto.js';
import { AdminOverrideService } from '../status/admin-override.service.js';
import { createFakePorts } from './fake-ports.js';
import { resetBookingRound } from './payment-doctor-fakes.js';
import { createStatusStack, type StatusWorld } from './status-world.js';

// Hạ tầng test dùng chung của route override (task B14; PLAN booking 7.37 `[đề xuất]` OVR-04, OVR-10…OVR-15, CT-14…CT-21; TRACKING 3.31 B14-H): int-spec, int-spec đồng thời và e2e cùng dựng MỘT bộ dịch vụ và đọc nhật ký
// MỘT cách, để jscpd (vốn quét `testing/*.ts` và `*.int-spec.ts`) không thấy cùng một đoạn ở nhiều file. BỌC `createStatusStack` và `statusWorld` (chính chúng bọc `cancelWorld`, `expiryWorld`, `BookingFixtures.world`:
// một chi nhánh, một bác sĩ, Lễ tân, HAI Quản trị viên (Toàn hệ thống và Chi nhánh), chi nhánh thứ hai, hai Bệnh nhân), không chép. Nằm trong `testing/` nên AR-01 và AR-06 bỏ qua.

/** Lý do mẫu hợp lệ (1 đến 255, không giống bí mật) */
export const OVERRIDE_REASON = 'Bệnh nhân đã có mặt tại quầy';

/** Mười ô được của ma trận Q24 (PLAN 5.2): nguồn rồi đích. Viết TAY từ chữ Q24, không sinh từ `canTransition`: để ca đối chiếu hai chiều (MT-01). */
export const Q24_PAIRS: readonly (readonly [
  TrangThaiLichHen,
  TrangThaiLichHen,
])[] = [
  ['ChoThanhToan', 'DaHuy'],
  ['DaXacNhan', 'DaHuy'],
  ['DaXacNhan', 'DaTiepDon'],
  ['DaXacNhan', 'VangMat'],
  ['DaTiepDon', 'DaHuy'],
  ['DaTiepDon', 'DaXacNhan'],
  ['DaTiepDon', 'VangMat'],
  ['VangMat', 'DaHuy'],
  ['VangMat', 'DaXacNhan'],
  ['VangMat', 'DaTiepDon'],
];

/** 39 ô còn lại của ma trận 7 × 7 (CT-16): mọi cặp (nguồn, đích) mà Quản trị viên KHÔNG được, mọi cặp mà `canTransition` từ chối (ca MT-01 ở `override-matrix.spec.ts` và ca đầu của CT-16 khẳng định đúng 39 ô, không giao với `Q24_PAIRS`). */
export const REFUSED_PAIRS: readonly (readonly [
  TrangThaiLichHen,
  TrangThaiLichHen,
])[] = TRANG_THAI_LICH_HEN.flatMap((from) =>
  TRANG_THAI_LICH_HEN.map((to) => [from, to] as const),
).filter(([from, to]) => !canTransition({ actor: 'QuanTriVien', from, to }).ok);

/**
 * Lỗi API mong đợi của một ô BỊ TỪ CHỐI, viết TỪ CHỮ của PLAN (5.14, CT-16, MT-03; B10-G): đích `HoanThanh` ⇒ `CHI_BAC_SI_HOAN_THANH`; đích `DaHuy` ⇒ `LICH_HEN_KHONG_CHO_HUY` kèm `{ trangThai: nguồn }`;
 * còn lại ⇒ `CHUYEN_TRANG_THAI_KHONG_HOP_LE` kèm `{ tuTrangThai, denTrangThai }`. Nguồn độc lập với mã của dịch vụ nên ca đỏ nếu dịch vụ phân loại sai.
 */
export function expectedRefusal(
  from: TrangThaiLichHen,
  to: TrangThaiLichHen,
): { maLoi: string; chiTiet?: unknown } {
  if (to === 'HoanThanh') return { maLoi: 'CHI_BAC_SI_HOAN_THANH' };
  if (to === 'DaHuy')
    return { maLoi: 'LICH_HEN_KHONG_CHO_HUY', chiTiet: { trangThai: from } };
  return {
    maLoi: 'CHUYEN_TRANG_THAI_KHONG_HOP_LE',
    chiTiet: { tuTrangThai: from, denTrangThai: to },
  };
}

/**
 * Bộ dịch vụ THẬT của B14 trên MySQL thật: `createStatusStack` (dịch vụ chuyển trạng thái và huỷ thật, thông báo GHI THẬT dòng `thong_bao`, các cổng `Fake` còn lại) cộng `AuditService` THẬT (ghi dòng
 * `nhat_ky_hanh_dong` thật, buộc đang trong giao dịch) và `AdminOverrideService`. `audit` thay được bằng bản giả ném lỗi (CT-18). "Một bản API" = một stack; hai stack dùng chung MỘT `ports` thì đếm vào cùng bộ đếm.
 */
export function createOverrideStack(
  db: DataSource,
  ports: ReturnType<typeof createFakePorts> = createFakePorts(),
  audit: AuditService = new AuditService(new AuditRepository()),
) {
  const base = createStatusStack(db, ports);
  const override = new AdminOverrideService(
    db,
    base.configs,
    base.transition,
    base.cancellation,
    new BranchAccessPolicy(),
    audit,
  );
  return { ...base, audit, override };
}
export type OverrideStack = ReturnType<typeof createOverrideStack>;

/** Ai override: Quản trị viên Toàn hệ thống, Chi nhánh của chi nhánh thế giới, hoặc Quản trị viên Chi nhánh của chi nhánh KHÁC (ngoài phạm vi, 404). */
export type OverrideWho = 'Toan' | 'ChiNhanh' | 'Ngoai';

/** Phạm vi và tài khoản của `who`. `Ngoai` dùng tài khoản Quản trị viên Chi nhánh (khoá ngoại của audit cần tài khoản thật) với phạm vi của chi nhánh thứ hai: chỉ ca 404 dùng, không ghi gì. */
export function scopeOf(
  w: StatusWorld,
  who: OverrideWho,
): { scope: AdminScope; accountId: string } {
  switch (who) {
    case 'Toan':
      return {
        scope: { kind: 'ToanHeThong' },
        accountId: w.systemAdmin.account.taiKhoanId,
      };
    case 'ChiNhanh':
      return {
        scope: { kind: 'ChiNhanh', chiNhanhId: w.branch.chiNhanhId },
        accountId: w.branchAdmin.account.taiKhoanId,
      };
    case 'Ngoai':
      return {
        scope: { kind: 'ChiNhanh', chiNhanhId: w.otherBranch.chiNhanhId },
        accountId: w.branchAdmin.account.taiKhoanId,
      };
  }
}

/** `who` override lịch `maLichHen` sang `trangThai`; `lyDo` mặc định là `OVERRIDE_REASON`. */
export function overrideBy(
  w: StatusWorld,
  stack: OverrideStack,
  who: OverrideWho,
  maLichHen: string,
  trangThai: TrangThaiLichHen,
  lyDo: string = OVERRIDE_REASON,
): Promise<AdminOverrideResult> {
  const { scope, accountId } = scopeOf(w, who);
  return stack.override.override(scope, accountId, maLichHen, {
    trangThai,
    lyDo,
  });
}

/** Các dòng nhật ký theo thứ tự ghi (`nhatKyHanhDongId` tăng dần): `taiKhoanId`, `chiNhanhId`, `hanhDong`, `loaiDoiTuong`, `maDoiTuong`, `ketQua`, `chiTietThayDoi` (JSON đã parse). */
export const readAudit = (db: DataSource): Promise<NhatKyHanhDong[]> =>
  db.getRepository(NhatKyHanhDong).find({ order: { nhatKyHanhDongId: 'ASC' } });

/** Dọn giữa các vòng đua: như `resetBookingRound` (thông báo, lịch, khung giờ) và thêm nhật ký hành động (không có khoá ngoại tới lịch nên thứ tự không quan trọng). */
export async function resetOverrideRound(db: DataSource): Promise<void> {
  await resetBookingRound(db);
  await db.query('DELETE FROM nhat_ky_hanh_dong');
}

/** Dòng nhật ký mong đợi của MỘT lần override thành công: chi nhánh của LỊCH (kể cả khi người thực hiện là Toàn hệ thống), `truoc` là nguồn, `sau` là đích. */
export function expectedAudit(
  w: StatusWorld,
  who: OverrideWho,
  lichHenId: string,
  from: TrangThaiLichHen,
  to: TrangThaiLichHen,
  lyDo: string = OVERRIDE_REASON,
) {
  return {
    taiKhoanId: scopeOf(w, who).accountId,
    chiNhanhId: w.branch.chiNhanhId,
    hanhDong: 'OverrideLichHen',
    loaiDoiTuong: 'lich_hen',
    maDoiTuong: lichHenId,
    ketQua: 'ThanhCong',
    chiTietThayDoi: {
      truoc: { trang_thai: from },
      sau: { trang_thai: to },
      ly_do: lyDo,
    },
  };
}

/** Kết quả nghiệp vụ của một lời gọi có thể bị từ chối bằng `AppException` (409, 404…): lỗi khác (deadlock, 1205, lỗi lạ) vẫn ném để vòng đỏ. */
export const settle = <T>(promise: Promise<T>) =>
  promise.then(
    (value) => ({ kind: 'ok' as const, value }),
    (error: unknown) => {
      if (error instanceof AppException)
        return {
          kind: 'refused' as const,
          maLoi: error.maLoi,
          chiTiet: (error.getResponse() as { chiTiet?: unknown }).chiTiet,
        };
      throw error;
    },
  );
