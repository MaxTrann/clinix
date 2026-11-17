import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { LoaiGiaoDichVi } from '../entities/wallet-enums.js';
import type { TopupGateway } from '../wallet.constants.js';
import type {
  HistoryRow,
  PendingTopupRow,
  WalletRow,
  WithdrawalRow,
} from './wallet-balance.mapper.js';

// SQL thô của số dư và lịch sử ví Bệnh nhân (payment B1; PLAN 5.11 #1, #2; L9, L10). Chỉ ĐỌC, không khoá (số chỉ để hiển thị; quyết định thật ở bước trừ dưới khoá: E5). Mọi giá trị người dùng đi qua tham số `?`.
// Không ghi log: số dư và giao dịch là dữ liệu tài chính cá nhân. Mọi câu đều lọc theo `vi_noi_bo_id` của CHÍNH người gọi (tìm từ `benh_nhan_id` của token ở `findWallet`), nên ví người khác không lẫn vào.

interface Branch {
  /** Câu đếm của nhánh (một cột). */
  count: string;
  /** Câu chọn của nhánh, đã tự cắt `LIMIT`; cùng danh sách cột với hai nhánh kia. */
  select: string;
  countParams: unknown[];
  /** Tham số của `select` KHÔNG kể `limit` (thêm ở cuối khi ghép). */
  selectParams: unknown[];
}

// Nhánh 1 — sổ cái. Chỉ có loại `Nap`, `ThanhToan`, `HoanTien`, `Rut`; nối nguồn để dựng "nội dung": cổng nạp (trực tiếp hoặc qua khoản hoàn), mã lịch gốc, hoàn đặc biệt hay tự động.
// Cắt `LIMIT` TRƯỚC khi nối để chỉ nối ≤ (offset + kichThuoc) dòng; thứ tự trong nhánh (thời điểm giảm dần, id giảm dần) khớp thứ tự câu ngoài nên cắt không làm mất dòng của trang.
function ledgerBranch(walletId: string, loai: LoaiGiaoDichVi | null): Branch {
  const filter = loai === null ? '' : ' AND loai = ?';
  const params = loai === null ? [walletId] : [walletId, loai];
  return {
    count: `SELECT COUNT(*) FROM giao_dich_vi WHERE vi_noi_bo_id = ?${filter}`,
    countParams: params,
    select: `SELECT 'vi' AS nguon, g.giao_dich_vi_id AS id, g.thoi_diem AS thoiDiem, g.loai AS loai, g.so_tien AS soTien, 'ThanhCong' AS trangThai,
  COALESCE(t.phuong_thuc, t2.phuong_thuc) AS phuongThuc, lh.ma_lich_hen AS maLichHen, h.loai AS loaiHoan
FROM (SELECT * FROM giao_dich_vi WHERE vi_noi_bo_id = ?${filter} ORDER BY thoi_diem DESC, giao_dich_vi_id DESC LIMIT ?) g
LEFT JOIN giao_dich_thanh_toan t ON t.giao_dich_thanh_toan_id = g.giao_dich_thanh_toan_id
LEFT JOIN lich_su_hoan_tien h ON h.lich_su_hoan_tien_id = g.lich_su_hoan_tien_id
LEFT JOIN giao_dich_thanh_toan t2 ON t2.giao_dich_thanh_toan_id = h.giao_dich_thanh_toan_id
LEFT JOIN lich_hen lh ON lh.lich_hen_id = COALESCE(t.lich_hen_id, t2.lich_hen_id)`,
    selectParams: params,
  };
}

// Nhánh 2 — nạp CHƯA ra sổ: `DangXuLy` và `ThatBai` (`ThanhCong` đã có dòng `Nap` ở sổ cái nên không lấy lại). Chỉ khi lọc `loai` là `Nap` hoặc không lọc.
function topupBranch(walletId: string): Branch {
  const where = `vi_noi_bo_id = ? AND loai = 'NapVi' AND trang_thai IN ('DangXuLy', 'ThatBai')`;
  return {
    count: `SELECT COUNT(*) FROM giao_dich_thanh_toan WHERE ${where}`,
    countParams: [walletId],
    select: `SELECT 'nap' AS nguon, t.giao_dich_thanh_toan_id AS id, t.thoi_diem_tao AS thoiDiem, 'Nap' AS loai, t.so_tien AS soTien, t.trang_thai AS trangThai,
  t.phuong_thuc AS phuongThuc, NULL AS maLichHen, NULL AS loaiHoan
FROM (SELECT * FROM giao_dich_thanh_toan WHERE ${where} ORDER BY thoi_diem_tao DESC, giao_dich_thanh_toan_id DESC LIMIT ?) t`,
    selectParams: [walletId],
  };
}

// Nhánh 3 — yêu cầu rút CHƯA ra sổ: `ChoDuyet` và `TuChoi` (`DaDuyet` đã có dòng `Rut`, lấy ở sổ cái để một lần rút không hiện hai dòng). `soTien` âm vì là tiền ra. Chỉ khi lọc `loai` là `Rut` hoặc không lọc.
function withdrawalBranch(walletId: string): Branch {
  const where = `vi_noi_bo_id = ? AND trang_thai IN ('ChoDuyet', 'TuChoi')`;
  return {
    count: `SELECT COUNT(*) FROM yeu_cau_rut_tien WHERE ${where}`,
    countParams: [walletId],
    select: `SELECT 'rut' AS nguon, r.yeu_cau_rut_tien_id AS id, r.thoi_diem_yeu_cau AS thoiDiem, 'Rut' AS loai, -r.so_tien AS soTien, r.trang_thai AS trangThai,
  NULL AS phuongThuc, NULL AS maLichHen, NULL AS loaiHoan
FROM (SELECT * FROM yeu_cau_rut_tien WHERE ${where} ORDER BY thoi_diem_yeu_cau DESC, yeu_cau_rut_tien_id DESC LIMIT ?) r`,
    selectParams: [walletId],
  };
}

/** Các nhánh cần hợp theo bộ lọc `loai` (không lọc ⇒ cả ba). */
function branchesFor(walletId: string, loai: LoaiGiaoDichVi | null): Branch[] {
  const branches = [ledgerBranch(walletId, loai)];
  if (loai === null || loai === 'Nap') branches.push(topupBranch(walletId));
  if (loai === null || loai === 'Rut')
    branches.push(withdrawalBranch(walletId));
  return branches;
}

@Injectable()
export class WalletBalanceRepository {
  /** Ví của Bệnh nhân theo `benh_nhan_id` (từ token); `null` khi không có hàng ví. */
  async findWallet(
    em: EntityManager,
    patientId: string,
  ): Promise<WalletRow | null> {
    const rows = await em.query<WalletRow[]>(
      'SELECT vi_noi_bo_id AS id, so_du AS soDu, so_tien_dang_giu AS soTienDangGiu FROM vi_noi_bo WHERE benh_nhan_id = ?',
      [patientId],
    );
    return rows[0] ?? null;
  }

  /**
   * Tổng nạp `DangXuLy` CÒN TRONG cửa sổ của từng cổng (PLAN 4.7 #2). `cutoffs`: với mỗi cổng, thời điểm sớm nhất còn tính (tạo đúng lúc đó hoặc muộn hơn là còn trong cửa sổ).
   * Chuỗi decimal; không dòng nào ⇒ `"0.00"`.
   */
  async sumPendingTopups(
    em: EntityManager,
    walletId: string,
    cutoffs: ReadonlyMap<TopupGateway, Date>,
  ): Promise<string> {
    const conditions = [...cutoffs.keys()].map(
      () => '(phuong_thuc = ? AND thoi_diem_tao >= ?)',
    );
    const params = [...cutoffs].flatMap(([gateway, cutoff]) => [
      gateway,
      cutoff,
    ]);
    const rows = await em.query<PendingTopupRow[]>(
      `SELECT CAST(COALESCE(SUM(so_tien), 0) AS DECIMAL(12,2)) AS tong FROM giao_dich_thanh_toan
WHERE vi_noi_bo_id = ? AND loai = 'NapVi' AND trang_thai = 'DangXuLy' AND (${conditions.join(' OR ')})`,
      [walletId, ...params],
    );
    return String(rows[0]?.tong ?? '0.00');
  }

  /** Yêu cầu rút gần nhất (mọi trạng thái); `null` khi chưa có. */
  async findLatestWithdrawal(
    em: EntityManager,
    walletId: string,
  ): Promise<WithdrawalRow | null> {
    const rows = await em.query<WithdrawalRow[]>(
      `SELECT yeu_cau_rut_tien_id AS maYeuCau, so_tien AS soTien, trang_thai AS trangThai, thoi_diem_yeu_cau AS thoiDiemYeuCau
FROM yeu_cau_rut_tien WHERE vi_noi_bo_id = ?
ORDER BY thoi_diem_yeu_cau DESC, yeu_cau_rut_tien_id DESC LIMIT 1`,
      [walletId],
    );
    return rows[0] ?? null;
  }

  /** Tổng số dòng lịch sử (cộng đếm của từng nhánh). */
  async countHistory(
    em: EntityManager,
    walletId: string,
    loai: LoaiGiaoDichVi | null,
  ): Promise<number> {
    const branches = branchesFor(walletId, loai);
    const rows = await em.query<{ total: string | number }[]>(
      `SELECT ${branches.map((b) => `(${b.count})`).join(' + ')} AS total`,
      branches.flatMap((b) => b.countParams),
    );
    return Number(rows[0]?.total ?? 0);
  }

  /**
   * Một trang lịch sử: hợp các nhánh, mới nhất trước; cùng thời điểm thì theo nguồn rồi id giảm dần cho thứ tự xác định.
   * Người gọi chỉ gọi khi `offset < total` (MySQL báo 1064 với `OFFSET` quá lớn là chuyện của service, không gửi xuống đây).
   */
  async findHistoryPage(
    em: EntityManager,
    walletId: string,
    loai: LoaiGiaoDichVi | null,
    limit: number,
    offset: number,
  ): Promise<HistoryRow[]> {
    const branches = branchesFor(walletId, loai);
    const branchLimit = limit + offset;
    return em.query<HistoryRow[]>(
      `${branches.map((b) => `(${b.select})`).join('\nUNION ALL\n')}
ORDER BY thoiDiem DESC, nguon ASC, id DESC LIMIT ? OFFSET ?`,
      [
        ...branches.flatMap((b) => [...b.selectParams, branchLimit]),
        limit,
        offset,
      ],
    );
  }
}
