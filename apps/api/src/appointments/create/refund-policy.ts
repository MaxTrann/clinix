import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { toCents } from '../../pricing/money.js';

// Chính sách hoàn tiền của một dịch vụ khám (Q15, Q16; TRACKING booking 3.18 B7-E). MỘT nơi dựng, hai nơi dùng: `POST /booking/checks` (B7, hiển thị ở Bước 5) và
// bước tạo lịch (B8, ghi `lich_hen.chinh_sach_hoan_snapshot`). Hai dạng của CÙNG một mảng: SNAPSHOT giữ khoá snake_case của schema (đã ghi vào DB, đọc lại bằng
// `RefundCalculator` của B10) và bản nhìn API camelCase (khoá JSON của `tomTat`, theo nếp module). Ba trường hợp, phân biệt bằng `null` và mảng rỗng:
//   - cọc = 0        ⇒ `null`  (không có chính sách; KHÔNG đọc bảng `moc_hoan_tien`);
//   - cọc > 0, chưa có mốc ⇒ `[]`  (= không hoàn gì);
//   - cọc > 0, có mốc ⇒ mảng sắp GIẢM DẦN theo `so_gio_truoc_toi_thieu`.

/** Một mốc của snapshot: huỷ trước giờ hẹn ít nhất `so_gio_truoc_toi_thieu` giờ thì hoàn `ty_le_hoan` phần trăm. */
export interface RefundTierSnapshot {
  so_gio_truoc_toi_thieu: number;
  ty_le_hoan: number;
}

/** Mốc ở dạng của API (`tomTat.chinhSachHoan`). */
export interface RefundTierView {
  soGioTruocToiThieu: number;
  tyLeHoan: number;
}

/** Hàng `moc_hoan_tien` đã đổi tên cột sang camelCase. */
export interface RefundTierRow {
  soGioTruocToiThieu: number;
  tyLeHoan: number;
}

/**
 * Dựng snapshot từ cọc và các mốc của dịch vụ. `tienCoc` là chuỗi decimal của DB và so bằng `toCents` (không so số thực): "0", "0.00", "0.0" đều là cọc 0, còn "0.01" là cọc > 0.
 * Không đổi mảng đầu vào. Chuỗi không phải số tiền ném lỗi: dữ liệu hỏng không được coi là cọc 0.
 */
export function buildRefundPolicySnapshot(
  tienCoc: string,
  tiers: readonly RefundTierRow[],
): RefundTierSnapshot[] | null {
  if (toCents(tienCoc) === 0n) return null;
  return [...tiers]
    .sort((a, b) => b.soGioTruocToiThieu - a.soGioTruocToiThieu)
    .map((tier) => ({
      so_gio_truoc_toi_thieu: tier.soGioTruocToiThieu,
      ty_le_hoan: tier.tyLeHoan,
    }));
}

/** Bản nhìn API của snapshot: `null` giữ `null`, `[]` giữ `[]` (hai ý nghĩa khác nhau), mỗi mốc đổi sang camelCase và giữ thứ tự. */
export function toRefundPolicyView(
  snapshot: readonly RefundTierSnapshot[] | null,
): RefundTierView[] | null {
  if (snapshot === null) return null;
  return snapshot.map((tier) => ({
    soGioTruocToiThieu: tier.so_gio_truoc_toi_thieu,
    tyLeHoan: tier.ty_le_hoan,
  }));
}

// Chỉ ĐỌC, theo đúng dịch vụ; `ORDER BY` chỉ để kết quả ổn định (hàm thuần vẫn tự sắp). UNIQUE `(dich_vu_kham_id, so_gio_truoc_toi_thieu)` nên không có hai mốc cùng số giờ.
const READ_TIERS_SQL = `SELECT so_gio_truoc_toi_thieu AS soGioTruocToiThieu, ty_le_hoan AS tyLeHoan
FROM moc_hoan_tien
WHERE dich_vu_kham_id = ?
ORDER BY so_gio_truoc_toi_thieu DESC`;

/** Đọc các mốc của một dịch vụ rồi dựng snapshot. Lớp không trạng thái, nhận `em` của người gọi (cùng ảnh chụp với các câu đọc khác). */
@Injectable()
export class RefundPolicyReader {
  /** Cọc 0 ⇒ `null` mà không truy vấn gì; `dichVuKhamId` là chuỗi (id BIGINT lớn hơn 2^53 mà ép `Number` sẽ trỏ nhầm dịch vụ khác). */
  async read(
    em: EntityManager,
    dichVuKhamId: string,
    tienCoc: string,
  ): Promise<RefundTierSnapshot[] | null> {
    if (toCents(tienCoc) === 0n) return null;
    const rows = await em.query<
      { soGioTruocToiThieu: number | string; tyLeHoan: number | string }[]
    >(READ_TIERS_SQL, [dichVuKhamId]);
    return buildRefundPolicySnapshot(
      tienCoc,
      rows.map((row) => ({
        soGioTruocToiThieu: Number(row.soGioTruocToiThieu),
        tyLeHoan: Number(row.tyLeHoan),
      })),
    );
  }
}
