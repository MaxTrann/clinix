import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { ChucDanhBacSi } from '../../admin/entities/enums.js';
import { HAS_VISITED_SQL } from './relationship.query.js';

// Câu ĐỌC cho Bệnh nhân bắt đầu trò chuyện (chat B3; PLAN chat 5.6, Q4, MH2). Chỉ đọc, không tạo gì: hội thoại chỉ được tạo ở tin đầu (lõi gửi B1, HCH-01).
// Mọi câu tham số hoá, liệt kê cột (HCH-02).

// Bác sĩ đích: tài khoản loại Bác sĩ CÓ dòng `bac_si` (cùng định nghĩa với lõi mở hội thoại; tài khoản thiếu hồ sơ coi như không có, NBS-08)
const DOCTOR_TARGET_SQL = `SELECT t.ho_ten AS hoTen, t.trang_thai AS trangThai, b.chuc_danh AS chucDanh
  FROM tai_khoan t
  JOIN bac_si b ON b.tai_khoan_id = t.tai_khoan_id
 WHERE t.tai_khoan_id = ? AND t.loai_tai_khoan = 'BacSi'`;
const BRANCH_TARGET_SQL =
  'SELECT ten AS ten FROM chi_nhanh WHERE chi_nhanh_id = ?';

// Q4, MH2 `[đề xuất]`: (1) lịch CÒN HIỆU LỰC sắp tới: `ChoThanhToan`, `DaXacNhan`, `DaTiepDon` có `thoi_gian` từ ĐẦU NGÀY hôm nay (giờ Việt Nam) trở đi,
// lấy lịch GẦN nhất (trùng giờ lấy `lich_hen_id` nhỏ; lịch hôm nay đã qua giờ vẫn tính, NLE-04); (2) không có thì lịch `HoanThanh` có `thoi_gian` LỚN nhất
// (trùng giờ lấy `lich_hen_id` lớn `[đề xuất]`); (3) không có thì không gợi ý. `DaHuy`, `DaDoiLich`, `VangMat` không bao giờ tính (NLE-03).
// Lọc theo tài khoản chủ lịch nên lịch của người thân cũng tính (MH3, NLE-05). Cả hai câu đi chỉ mục `lich_hen_index_9 (benh_nhan_id, trang_thai, thoi_gian)`.
const UPCOMING_BRANCH_SQL = `SELECT l.chi_nhanh_id AS chiNhanhId
  FROM lich_hen l
 WHERE l.benh_nhan_id = ? AND l.trang_thai IN ('ChoThanhToan', 'DaXacNhan', 'DaTiepDon') AND l.thoi_gian >= ?
 ORDER BY l.thoi_gian ASC, l.lich_hen_id ASC
 LIMIT 1`;
const LAST_VISIT_BRANCH_SQL = `SELECT l.chi_nhanh_id AS chiNhanhId
  FROM lich_hen l
 WHERE l.benh_nhan_id = ? AND l.trang_thai = 'HoanThanh'
 ORDER BY l.thoi_gian DESC, l.lich_hen_id DESC
 LIMIT 1`;

export interface DoctorTarget {
  hoTen: string;
  trangThai: string;
  chucDanh: ChucDanhBacSi;
}

export type DefaultBranchSource = 'LichHenSapToi' | 'LichHenDaKham';

@Injectable()
export class StartConversationRepository {
  async doctor(
    em: EntityManager,
    bacSiId: string,
  ): Promise<DoctorTarget | null> {
    const rows = await em.query<DoctorTarget[]>(DOCTOR_TARGET_SQL, [bacSiId]);
    return rows[0] ?? null;
  }

  async branchName(
    em: EntityManager,
    chiNhanhId: string,
  ): Promise<string | null> {
    const rows = await em.query<{ ten: string }[]>(BRANCH_TARGET_SQL, [
      chiNhanhId,
    ]);
    return rows[0]?.ten ?? null;
  }

  async hasVisited(
    em: EntityManager,
    benhNhanId: string,
    bacSiId: string,
  ): Promise<boolean> {
    const rows = await em.query<{ daTungKham: string | number }[]>(
      HAS_VISITED_SQL,
      [benhNhanId, bacSiId],
    );
    return Number(rows[0]?.daTungKham) === 1;
  }

  /** `startOfToday` là chuỗi `YYYY-MM-DD 00:00:00` giờ Việt Nam (cột DATETIME lưu giờ Việt Nam, so trực tiếp). */
  async defaultBranch(
    em: EntityManager,
    benhNhanId: string,
    startOfToday: string,
  ): Promise<{ chiNhanhId: string; nguon: DefaultBranchSource } | null> {
    const upcoming = await em.query<{ chiNhanhId: string | number }[]>(
      UPCOMING_BRANCH_SQL,
      [benhNhanId, startOfToday],
    );
    if (upcoming[0])
      return {
        chiNhanhId: String(upcoming[0].chiNhanhId),
        nguon: 'LichHenSapToi',
      };
    const visited = await em.query<{ chiNhanhId: string | number }[]>(
      LAST_VISIT_BRANCH_SQL,
      [benhNhanId],
    );
    if (visited[0])
      return {
        chiNhanhId: String(visited[0].chiNhanhId),
        nguon: 'LichHenDaKham',
      };
    return null;
  }
}
