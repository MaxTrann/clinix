import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import type { ListItemRow } from './list-query.sql.js';

// Mười khoá CHUNG của một dòng danh sách, dùng cho mọi vai trò (B1 Bệnh nhân, B3 Lễ tân, B4 Quản trị viên; TRACKING 3.17 B3-D). Chỉ liệt kê từng khoá (không trải hàng thô):
// cột thừa của repository, như `lichHenId`, không bao giờ ra ngoài (LSH-14, DSV-08). Phần riêng của từng vai trò (`hanThanhToan`, `choPhepHuy`, `nguoiDat`…) do mapper của vai trò đó thêm.

export interface ItemCore<S extends string = TrangThaiLichHen> {
  maLichHen: string;
  trangThai: S;
  /** ISO 8601 UTC */
  thoiGian: string;
  bacSi: string;
  chuyenKhoa: string;
  chiNhanh: string;
  dichVu: string;
  nguoiKham: { hoTen: string; laBanThan: boolean };
  /** Chuỗi decimal */
  giaSnapshot: string;
  /** Chuỗi decimal */
  tienCoc: string;
}

export function toItemCore<S extends string>(row: ListItemRow<S>): ItemCore<S> {
  return {
    maLichHen: row.maLichHen,
    trangThai: row.trangThai,
    thoiGian: row.thoiGian.toISOString(),
    bacSi: row.bacSi,
    chuyenKhoa: row.chuyenKhoa,
    chiNhanh: row.chiNhanh,
    dichVu: row.dichVu,
    nguoiKham: {
      hoTen: row.nguoiKham,
      laBanThan: Number(row.laBanThan) === 1,
    },
    giaSnapshot: row.giaSnapshot,
    tienCoc: row.tienCoc,
  };
}
