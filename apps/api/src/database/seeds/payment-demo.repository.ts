import type { EntityManager } from 'typeorm';
import { nowVN, toSecond } from '../../common/time/time.js';
import { PaymentPolicyRepository } from '../../payment/policy/policy.repository.js';
import { validatePolicy } from '../../payment/policy/policy.rules.js';
import { compareMoney } from '../../pricing/money.js';
import { WalletLedger } from '../../wallet/ledger/wallet-ledger.js';
import {
  PAYMENT_DEMO_DEPOSIT,
  PAYMENT_DEMO_GATEWAY_CODE,
  PAYMENT_DEMO_PATIENT_EMAIL,
  PAYMENT_DEMO_SERVICES,
  PAYMENT_DEMO_TIERS,
  PAYMENT_DEMO_TOPUP,
} from './payment-demo-data.js';
import { SeedError } from './seed-error.js';
import type { SeedCounts } from './seed.repository.js';

// Seed demo cho payment và wallet (payment B18; PLAN payment Q7, H10; MGT-13). Chạy trong MỘT giao dịch của `seedTransaction`; add-only, chạy lại không ghi đè.
// Dùng ĐÚNG mã sản xuất: luật cọc và mốc của B10 (`validatePolicy`), câu ghi của `PaymentPolicyRepository` (khoá hàng dịch vụ trước), sổ cái `WalletLedger` (nơi DUY NHẤT đổi số dư, giữ IVT).
// Không ghi thông báo hay thư (dữ liệu mẫu, không phải sự kiện thật), không ghi nhật ký (đổi cọc không ghi nhật ký, Q7).
export class PaymentDemoRepository {
  readonly counts: SeedCounts = { created: 0, skipped: 0 };
  // `PaymentPolicyRepository` chỉ dùng `DataSource` cho giao dịch đọc của route GET; seed chỉ gọi các hàm nhận `manager`.
  private readonly policy: PaymentPolicyRepository;
  private readonly ledger = new WalletLedger();

  constructor(
    private readonly manager: EntityManager,
    private readonly now: Date = nowVN(),
  ) {
    this.policy = new PaymentPolicyRepository(manager.connection);
  }

  async run(): Promise<void> {
    // Kiểm đủ điều kiện TRƯỚC mọi câu ghi: thiếu thì ném, cả giao dịch không có gì để hoàn tác
    const serviceIds = await this.findServices();
    const patientId = await this.findPatient();
    for (const id of serviceIds) await this.ensurePolicy(id);
    await this.ensureTopup(patientId);
  }

  // Hai dịch vụ của `seed:catalog` (theo tên nhóm và tên dịch vụ); thiếu một ⇒ chưa chạy `catalog`.
  private async findServices(): Promise<string[]> {
    const ids: string[] = [];
    for (const service of PAYMENT_DEMO_SERVICES) {
      const rows = await this.manager.query<{ id: string }[]>(
        `SELECT CAST(s.dich_vu_kham_id AS CHAR) AS id FROM dich_vu_kham s
           JOIN nhom_dich_vu g ON g.nhom_dich_vu_id = s.nhom_dich_vu_id
          WHERE s.ten = ? AND g.ten = ?`,
        [service.name, service.group],
      );
      if (!rows[0]) throw new SeedError('SEED_CATALOG_REQUIRED');
      ids.push(rows[0].id);
    }
    return ids;
  }

  // Bệnh nhân của `dev-accounts` và ví của họ; thiếu ⇒ chưa chạy `dev-accounts`.
  private async findPatient(): Promise<string> {
    const rows = await this.manager.query<{ id: string }[]>(
      `SELECT CAST(v.benh_nhan_id AS CHAR) AS id FROM vi_noi_bo v
         JOIN tai_khoan tk ON tk.tai_khoan_id = v.benh_nhan_id
        WHERE tk.email = ?`,
      [PAYMENT_DEMO_PATIENT_EMAIL],
    );
    if (!rows[0]) throw new SeedError('SEED_DEV_ACCOUNTS_REQUIRED');
    return rows[0].id;
  }

  /**
   * Cọc và mốc của một dịch vụ. Dịch vụ đã có cọc > 0 hoặc đã có mốc thì GIỮ NGUYÊN (Quản trị viên có thể đã sửa ở màn Đặt cọc & Hoàn tiền): seed không bao giờ đè.
   * Khoá X hàng dịch vụ như route B10, rồi kiểm bằng đúng luật của B10 (cọc ≤ giá, mốc hợp lệ) trước khi ghi.
   */
  private async ensurePolicy(id: string): Promise<void> {
    const service = await this.policy.lockService(this.manager, id);
    if (!service) throw new SeedError('SEED_CATALOG_REQUIRED');
    const tiers = await this.policy.listTiers(this.manager, id);
    if (compareMoney(service.mucDatCoc, '0') > 0 || tiers.length > 0) {
      this.counts.skipped++;
      return;
    }
    const errors = validatePolicy(
      { mucDatCoc: PAYMENT_DEMO_DEPOSIT, moc: PAYMENT_DEMO_TIERS },
      service.giaMacDinh,
    );
    if (errors.length > 0) throw new SeedError('SEED_PAYMENT_POLICY_INVALID');
    await this.policy.updateDeposit(this.manager, id, PAYMENT_DEMO_DEPOSIT);
    await this.policy.replaceTiers(this.manager, id, PAYMENT_DEMO_TIERS);
    this.counts.created++;
  }

  /**
   * Một lần nạp ví mẫu: giao dịch `NapVi` `VNPay` `ThanhCong` với mã cổng cố định (khoá chạy lại), rồi cộng ví qua `WalletLedger` (dòng `Nap` trỏ đúng giao dịch, `chk_gd_vi_tham_chieu`).
   * Thứ tự khoá như luồng nạp thật: khoá ví (7b) trước khi chèn giao dịch con của ví.
   */
  private async ensureTopup(patientId: string): Promise<void> {
    const existing = await this.manager.query<{ id: string }[]>(
      `SELECT CAST(giao_dich_thanh_toan_id AS CHAR) AS id FROM giao_dich_thanh_toan WHERE phuong_thuc = 'VNPay' AND ma_giao_dich_cong = ?`,
      [PAYMENT_DEMO_GATEWAY_CODE],
    );
    if (existing[0]) {
      this.counts.skipped++;
      return;
    }
    const wallet = await this.ledger.lockWallet(this.manager, patientId);
    if (!wallet) throw new SeedError('SEED_DEV_ACCOUNTS_REQUIRED');
    const at = toSecond(this.now);
    const inserted: { insertId: number | string } = await this.manager.query(
      `INSERT INTO giao_dich_thanh_toan (vi_noi_bo_id, lich_hen_id, loai, phuong_thuc, so_tien, trang_thai, ma_giao_dich_cong, trang_thai_doi_soat, thoi_diem_tao)
       VALUES (?, NULL, 'NapVi', 'VNPay', ?, 'ThanhCong', ?, 'KhongCan', ?)`,
      [wallet.viNoiBoId, PAYMENT_DEMO_TOPUP, PAYMENT_DEMO_GATEWAY_CODE, at],
    );
    await this.ledger.credit(this.manager, wallet, {
      loai: 'Nap',
      soTien: PAYMENT_DEMO_TOPUP,
      ref: { giaoDichThanhToanId: String(inserted.insertId) },
      now: at,
    });
    this.counts.created++;
  }
}
