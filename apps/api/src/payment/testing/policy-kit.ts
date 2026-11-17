import type { DataSource } from 'typeorm';
import { ServiceRepository } from '../../admin/services/service.repository.js';
import { ServiceService } from '../../admin/services/service.service.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { PaymentPolicyService } from '../policy/payment-policy.service.js';
import type { UpdatePaymentPolicyDto } from '../policy/policy.dto.js';
import { PaymentPolicyRepository } from '../policy/policy.repository.js';

// Đồ dùng chung của các test tích hợp cấu hình chính sách cọc (payment B10): dựng service THẬT trên DB test và thân PUT. Gom một chỗ vì hai file int-spec (tuần tự và đồng thời) cùng cần
// và jscpd quét `testing/`. Dữ liệu giả.

/** Quản trị viên toàn hệ thống (phạm vi truyền vào service). */
export const SYSTEM_SCOPE = { kind: 'ToanHeThong' } as const;

/** `[số giờ trước tối thiểu, tỷ lệ hoàn %]` */
export type Tier = [soGio: number, tyLe: number];

/** Bảng mẫu của Figma `553:2`: hủy trước 24 giờ hoàn 100%, trước 2 giờ hoàn 50%, sát giờ không hoàn. */
export const MAU: Tier[] = [
  [24, 100],
  [2, 50],
  [0, 0],
];

export const policyService = (db: DataSource) =>
  new PaymentPolicyService(
    new PaymentPolicyRepository(db),
    new BranchAccessPolicy(),
  );

/** Đường admin `PATCH /admin/services/:id` (nơi chiều "hạ giá dưới cọc" bị chặn). */
export const adminServiceOf = (db: DataSource) =>
  new ServiceService(new ServiceRepository(db), new BranchAccessPolicy());

/** Thân PUT: cọc là chuỗi số nguyên đồng, mốc là mảng `{ soGioTruocToiThieu, tyLeHoan }`. */
export const policyBody = (mucDatCoc: string, tiers: Tier[]) =>
  ({
    mucDatCoc,
    moc: tiers.map(([soGioTruocToiThieu, tyLeHoan]) => ({
      soGioTruocToiThieu,
      tyLeHoan,
    })),
  }) as UpdatePaymentPolicyDto;
