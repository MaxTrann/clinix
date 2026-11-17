import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { addMoney } from '../../pricing/money.js';
import type {
  LoaiGiaoDichThanhToan,
  PhuongThucThanhToan,
  TrangThaiDoiSoat,
  TrangThaiGiaoDichThanhToan,
} from '../../payment/entities/payment-enums.js';
import type {
  KetQuaHoanTien,
  LoaiGiaoDichVi,
  TrangThaiYeuCauRutTien,
} from '../entities/wallet-enums.js';

// Hạ tầng test của `wallet/` (payment P3; PLAN payment 5.15). BỌC `AdminFixtures` (Bệnh nhân kèm ví do `AdminFixtures.patient` dựng), KHÔNG chép. Mọi hàm `insert*` GHI THẲNG bằng SQL, không đi qua
// `WalletLedger`, để dựng được cả dữ liệu ĐÚNG lẫn dữ liệu cố ý LỆCH cho kiểm hai chiều của bất biến (wallet-invariants.int-spec.ts). Số tiền trong file là MINH HOẠ cho test.

/** Thời điểm cố định cho dòng chèn thẳng (cột `datetime` không có mặc định ở DB). */
export const FIXTURE_TIME = '2026-11-02 08:00:00';

export interface PaymentRowInput {
  viNoiBoId?: string | null;
  lichHenId?: string | null;
  loai: LoaiGiaoDichThanhToan;
  phuongThuc: PhuongThucThanhToan;
  soTien: string;
  trangThai?: TrangThaiGiaoDichThanhToan;
  trangThaiDoiSoat?: TrangThaiDoiSoat;
  nguoiThuId?: string | null;
  /** Giờ tạo, dạng `YYYY-MM-DD HH:mm:ss` (giờ VN); mặc định `FIXTURE_TIME` */
  thoiDiemTao?: string;
}

export interface LedgerRowInput {
  viNoiBoId: string;
  loai: LoaiGiaoDichVi;
  /** CÓ DẤU: dương = tiền vào (`Nap`, `HoanTien`), âm = tiền ra (`ThanhToan`, `Rut`) */
  soTien: string;
  soDuSau: string;
  giaoDichThanhToanId?: string | null;
  lichSuHoanTienId?: string | null;
  yeuCauRutTienId?: string | null;
  /** Giờ ghi sổ, dạng `YYYY-MM-DD HH:mm:ss`; mặc định `FIXTURE_TIME` */
  thoiDiem?: string;
}

export class WalletFixtures {
  readonly admin: AdminFixtures;

  constructor(private readonly db: DataSource) {
    this.admin = new AdminFixtures(db);
  }

  /** Bệnh nhân mới kèm ví (số dư 0). Trả `patientId` (= `benh_nhan_id`) và `walletId` (= `vi_noi_bo_id`), cả hai dạng chuỗi. */
  async patientWithWallet() {
    const created = await this.admin.patient();
    return {
      patientId: created.account.taiKhoanId,
      walletId: created.wallet.viNoiBoId,
    };
  }

  /** Đặt thẳng `so_du` và `so_tien_dang_giu` của ví (KHÔNG ghi sổ cái): dùng để dựng số dư ban đầu hoặc cố ý làm lệch. */
  async setWallet(walletId: string, soDu: string, soTienDangGiu = '0.00') {
    await this.db.query(
      'UPDATE vi_noi_bo SET so_du = ?, so_tien_dang_giu = ? WHERE vi_noi_bo_id = ?',
      [soDu, soTienDangGiu, walletId],
    );
  }

  /** Đọc ví ở dạng chuỗi decimal. */
  async readWallet(walletId: string) {
    const rows: { soDu: string; soTienDangGiu: string }[] = await this.db.query(
      'SELECT so_du AS soDu, so_tien_dang_giu AS soTienDangGiu FROM vi_noi_bo WHERE vi_noi_bo_id = ?',
      [walletId],
    );
    const row = rows[0];
    if (row === undefined) throw new Error(`Ví ${walletId} không tồn tại`);
    return row;
  }

  /** Chèn một dòng `giao_dich_thanh_toan` (mặc định `ThanhCong`, không cần đối soát). Trả `giao_dich_thanh_toan_id`. */
  async insertPayment(input: PaymentRowInput): Promise<string> {
    const result: { insertId: string } = await this.db.query(
      `INSERT INTO giao_dich_thanh_toan
         (vi_noi_bo_id, lich_hen_id, loai, phuong_thuc, so_tien, trang_thai, ma_giao_dich_cong, trang_thai_doi_soat, nguoi_thu_id, thoi_diem_tao)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.viNoiBoId ?? null,
        input.lichHenId ?? null,
        input.loai,
        input.phuongThuc,
        input.soTien,
        input.trangThai ?? 'ThanhCong',
        input.phuongThuc === 'VNPay' || input.phuongThuc === 'MoMo'
          ? randomUUID().slice(0, 30)
          : null,
        input.trangThaiDoiSoat ?? 'KhongCan',
        input.nguoiThuId ?? null,
        input.thoiDiemTao ?? FIXTURE_TIME,
      ],
    );
    return String(result.insertId);
  }

  /** Chèn một dòng sổ cái `giao_dich_vi` (chỉ nên dùng khi dựng dữ liệu chuẩn hay cố ý lệch; luồng thật ghi qua `WalletLedger`). */
  async insertLedgerRow(input: LedgerRowInput): Promise<string> {
    const result: { insertId: string } = await this.db.query(
      `INSERT INTO giao_dich_vi
         (vi_noi_bo_id, loai, so_tien, so_du_sau, giao_dich_thanh_toan_id, lich_su_hoan_tien_id, yeu_cau_rut_tien_id, thoi_diem)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.viNoiBoId,
        input.loai,
        input.soTien,
        input.soDuSau,
        input.giaoDichThanhToanId ?? null,
        input.lichSuHoanTienId ?? null,
        input.yeuCauRutTienId ?? null,
        input.thoiDiem ?? FIXTURE_TIME,
      ],
    );
    return String(result.insertId);
  }

  /** Chèn một dòng `lich_su_hoan_tien` (một lần thử hoàn). Trả `lich_su_hoan_tien_id`. */
  async insertRefund(input: {
    giaoDichThanhToanId: string;
    viNoiBoId: string;
    soTien: string;
    trangThai?: KetQuaHoanTien;
    soLanThu?: number;
  }): Promise<string> {
    const result: { insertId: string } = await this.db.query(
      `INSERT INTO lich_su_hoan_tien (giao_dich_thanh_toan_id, vi_noi_bo_id, loai, so_tien, trang_thai, so_lan_thu, thoi_diem)
       VALUES (?, ?, 'TuDong', ?, ?, ?, ?)`,
      [
        input.giaoDichThanhToanId,
        input.viNoiBoId,
        input.soTien,
        input.trangThai ?? 'ThanhCong',
        input.soLanThu ?? 1,
        FIXTURE_TIME,
      ],
    );
    return String(result.insertId);
  }

  /** Chèn một `yeu_cau_rut_tien`; xử lý xong (`DaDuyet`, `TuChoi`) thì cần `nguoiXuLyId` (CHECK `chk_rut_tien_xu_ly`). */
  async insertWithdrawal(input: {
    viNoiBoId: string;
    soTien: string;
    trangThai?: TrangThaiYeuCauRutTien;
    nguoiXuLyId?: string;
    thoiDiemYeuCau?: string;
  }): Promise<string> {
    const handled = (input.trangThai ?? 'ChoDuyet') !== 'ChoDuyet';
    const result: { insertId: string } = await this.db.query(
      `INSERT INTO yeu_cau_rut_tien (vi_noi_bo_id, so_tien, trang_thai, nguoi_xu_ly_id, thoi_diem_yeu_cau, thoi_diem_xu_ly)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.viNoiBoId,
        input.soTien,
        input.trangThai ?? 'ChoDuyet',
        handled ? (input.nguoiXuLyId ?? null) : null,
        input.thoiDiemYeuCau ?? FIXTURE_TIME,
        handled ? FIXTURE_TIME : null,
      ],
    );
    return String(result.insertId);
  }

  /**
   * Khoản cọc ĐÃ TRẢ bằng ví của một lịch, NHẤT QUÁN với sổ cái (IVT-01, IVT-04, IVT-05): nạp đúng số tiền trước (`NapVi` + dòng `Nap`), rồi `ThanhToanLichHen` qua `Vi` + dòng `ThanhToan` số âm.
   * `so_du` sau cùng bằng `so_du` trước đó (nạp rồi trừ ngay), nên gọi nhiều lần liên tiếp vẫn nhất quán. Điều kiện: ví đang nhất quán sẵn (sổ cái rỗng và `so_du` 0, hay do `fundWallet` dựng). Trả `giao_dich_thanh_toan_id`.
   */
  async insertWalletDeposit(input: {
    viNoiBoId: string;
    lichHenId: string;
    soTien: string;
  }): Promise<string> {
    const before = (await this.readWallet(input.viNoiBoId)).soDu;
    const topup = await this.insertPayment({
      viNoiBoId: input.viNoiBoId,
      loai: 'NapVi',
      phuongThuc: 'VNPay',
      soTien: input.soTien,
    });
    await this.insertLedgerRow({
      viNoiBoId: input.viNoiBoId,
      loai: 'Nap',
      soTien: input.soTien,
      soDuSau: addMoney(before, input.soTien),
      giaoDichThanhToanId: topup,
    });
    const paymentId = await this.insertPayment({
      viNoiBoId: input.viNoiBoId,
      lichHenId: input.lichHenId,
      loai: 'ThanhToanLichHen',
      phuongThuc: 'Vi',
      soTien: input.soTien,
    });
    await this.insertLedgerRow({
      viNoiBoId: input.viNoiBoId,
      loai: 'ThanhToan',
      soTien: `-${input.soTien}`,
      soDuSau: before,
      giaoDichThanhToanId: paymentId,
    });
    return paymentId;
  }

  /**
   * Ví có `soDu` NHẤT QUÁN với sổ cái: một giao dịch `NapVi` `ThanhCong` + một dòng `Nap` + `so_du` (bất biến IVT-01, IVT-04 đúng ngay từ đầu).
   * Dùng làm số dư ban đầu cho test ledger mà không cần chính ledger (không để test của ledger phụ thuộc vào chính nó).
   */
  async fundWallet(walletId: string, soDu: string) {
    const paymentId = await this.insertPayment({
      viNoiBoId: walletId,
      loai: 'NapVi',
      phuongThuc: 'VNPay',
      soTien: soDu,
    });
    await this.insertLedgerRow({
      viNoiBoId: walletId,
      loai: 'Nap',
      soTien: soDu,
      soDuSau: soDu,
      giaoDichThanhToanId: paymentId,
    });
    await this.setWallet(walletId, soDu);
    return paymentId;
  }
}
