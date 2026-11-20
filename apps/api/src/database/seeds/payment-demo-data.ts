import type { RefundTier } from '../../payment/policy/policy.rules.js';
import { CATALOG_SERVICES } from './catalog-data.js';

// Dữ liệu demo cho payment và wallet (payment B18; PLAN payment Q7, H10). Toàn bộ là minh họa [đề xuất], không phải quyết định nghiệp vụ.

/**
 * Hai dịch vụ của `seed:catalog` mà bác sĩ mẫu (`dev-accounts`, `search-demo`) đang gắn, để đặt được lịch có cọc ngay (Trung chốt 20/11/2026: dùng dịch vụ có sẵn,
 * không tạo dịch vụ mới; không sửa `catalog-data.ts`).
 */
export const PAYMENT_DEMO_SERVICES: readonly { group: string; name: string }[] =
  [CATALOG_SERVICES[0], CATALOG_SERVICES[1]].map((s) => ({
    group: s.group,
    name: s.name,
  }));

/** Mức cọc, số nguyên đồng dạng chuỗi như DTO của B10 (≤ giá của cả hai dịch vụ: 200.000đ và 500.000đ). */
export const PAYMENT_DEMO_DEPOSIT = '100000';

/** Mốc hoàn theo ví dụ của `docs/database` (`moc_hoan_tien.ty_le_hoan`): huỷ trước 24 giờ hoàn 100%, trước 2 giờ hoàn 50%, sát giờ không hoàn. */
export const PAYMENT_DEMO_TIERS: readonly RefundTier[] = [
  { soGioTruocToiThieu: 24, tyLeHoan: 100 },
  { soGioTruocToiThieu: 2, tyLeHoan: 50 },
  { soGioTruocToiThieu: 0, tyLeHoan: 0 },
];

/** Bệnh nhân của `dev-accounts` được nạp ví mẫu. */
export const PAYMENT_DEMO_PATIENT_EMAIL = 'patient@example.invalid';

/** Số tiền nạp mẫu (Trung chốt 20/11/2026), trong hạn mức nạp 50.000đ đến 2.000.000đ (Q20). */
export const PAYMENT_DEMO_TOPUP = '500000.00';

/**
 * Mã cổng CỐ ĐỊNH của lần nạp mẫu: khoá chạy lại (UNIQUE `(phuong_thuc, ma_giao_dich_cong)` của `giao_dich_thanh_toan`), nên chạy lại không nạp hai lần.
 * Tiền tố `SEED-` để không bao giờ trùng mã thật của VNPAY (mã thật là số).
 */
export const PAYMENT_DEMO_GATEWAY_CODE = 'SEED-PAYMENT-DEMO-1';
