import { Inject, Injectable } from '@nestjs/common';
import { DataSource, IsNull, type EntityManager } from 'typeorm';
import { PhienDangNhap } from '../entities/phien-dang-nhap.entity.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import type { LoaiTaiKhoan, TrangThaiTaiKhoan } from '../entities/enums.js';

// Truy vấn bảng `phien_dang_nhap`. Mọi hàm nhận `em` (EntityManager) để chạy trong GIAO DỊCH của người gọi
// (ví dụ admin khoá tài khoản + thu hồi phiên trong cùng một giao dịch, Q29); không truyền thì dùng kết nối thường.
// Repository chỉ chứa câu lệnh; quy tắc nghiệp vụ (hết hạn, dùng lại…) nằm ở SessionService.
@Injectable()
export class PhienDangNhapRepository {
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  // EntityManager của người gọi (đang trong giao dịch của họ) hoặc kết nối thường; dùng cho lệnh chỉ gồm MỘT câu SQL
  use(manager: EntityManager | undefined): EntityManager {
    return manager ?? this.dataSource.manager;
  }

  // Chạy `work` trong giao dịch của người gọi nếu có `manager`; nếu không thì mở một giao dịch riêng
  inTransaction<T>(
    manager: EntityManager | undefined,
    work: (em: EntityManager) => Promise<T>,
  ): Promise<T> {
    return manager ? work(manager) : this.dataSource.transaction(work);
  }

  // Giao dịch READ COMMITTED riêng cho thu hồi một phiên: không khoá khoảng, đọc được dữ liệu vừa commit
  inReadCommitted<T>(work: (em: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction('READ COMMITTED', work);
  }

  async insert(
    em: EntityManager,
    row: {
      accountId: string;
      refreshTokenHash: string;
      createdAt: Date;
      idleExpiresAt: Date;
    },
  ): Promise<string> {
    const result = await em.insert(PhienDangNhap, {
      taiKhoanId: row.accountId,
      refreshTokenBam: row.refreshTokenHash,
      taoLuc: row.createdAt,
      hetHanLuc: row.idleExpiresAt,
    });
    return String(result.identifiers[0]?.phienDangNhapId);
  }

  // Đọc phiên và KHOÁ hàng (SELECT ... FOR UPDATE) tới hết giao dịch: các yêu cầu làm mới đồng thời cùng phiên
  // phải xếp hàng, nên chỉ một yêu cầu xoay được token và yêu cầu sau thấy băm đã đổi (xem SessionService.refresh).
  findByIdForUpdate(
    em: EntityManager,
    sessionId: string,
  ): Promise<PhienDangNhap | null> {
    return em
      .createQueryBuilder(PhienDangNhap, 'p')
      .setLock('pessimistic_write')
      .where('p.phienDangNhapId = :sessionId', { sessionId })
      .getOne();
  }

  // Đọc thường, không khoá: `tai_khoan_id` của một phiên không bao giờ đổi
  async findAccountIdOf(
    em: EntityManager,
    sessionId: string,
  ): Promise<string | null> {
    const session = await em.findOne(PhienDangNhap, {
      where: { phienDangNhapId: sessionId },
      select: { taiKhoanId: true },
    });
    return session?.taiKhoanId ?? null;
  }

  // Khoá S hàng `tai_khoan` trước khi ghi `thu_hoi_luc` (xem đầu TaiKhoanRepository). Trả false nếu hàng không còn, không ném lỗi.
  async lockAccountForShare(
    em: EntityManager,
    accountId: string,
  ): Promise<boolean> {
    const rows: unknown[] = await em.query(
      'SELECT tai_khoan_id FROM tai_khoan WHERE tai_khoan_id = ? FOR SHARE',
      [accountId],
    );
    return rows.length > 0;
  }

  async findAccountStatus(
    em: EntityManager,
    accountId: string,
  ): Promise<TrangThaiTaiKhoan | null> {
    // Đọc thường, KHÔNG khoá hàng tài khoản: giao dịch khoá tài khoản của admin khoá tài khoản trước rồi mới tới phiên,
    // nếu ở đây khoá ngược thứ tự thì hai bên có thể chờ nhau (deadlock)
    const account = await em.findOne(TaiKhoan, {
      where: { taiKhoanId: accountId },
      select: { trangThai: true },
    });
    return account?.trangThai ?? null;
  }

  async setRefreshHash(
    em: EntityManager,
    sessionId: string,
    refreshTokenHash: string,
  ): Promise<void> {
    await em.update(
      PhienDangNhap,
      { phienDangNhapId: sessionId },
      { refreshTokenBam: refreshTokenHash },
    );
  }

  // Xoay tại chỗ: thay băm và dời hạn không hoạt động; tao_luc giữ nguyên (mốc của trần 8 giờ)
  async rotate(
    em: EntityManager,
    sessionId: string,
    refreshTokenHash: string,
    idleExpiresAt: Date,
  ): Promise<void> {
    await em.update(
      PhienDangNhap,
      { phienDangNhapId: sessionId },
      { refreshTokenBam: refreshTokenHash, hetHanLuc: idleExpiresAt },
    );
  }

  // Thu hồi MỘT phiên nếu còn hiệu lực. `thu_hoi_luc IS NULL` nằm trong chính câu UPDATE nên không bao giờ ghi đè mốc cũ
  // (đăng xuất lần hai, hai nơi thu hồi cùng lúc…). Trả true nếu lần gọi này mới là lần thu hồi.
  async revokeIfActive(
    em: EntityManager,
    sessionId: string,
    at: Date,
  ): Promise<boolean> {
    const result = await em
      .createQueryBuilder()
      .update(PhienDangNhap)
      .set({ thuHoiLuc: at })
      .where('phien_dang_nhap_id = :sessionId AND thu_hoi_luc IS NULL', {
        sessionId,
      })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  // Thu hồi mọi phiên chưa thu hồi của tài khoản, trừ `exceptSessionId` nếu có. Trả số phiên vừa bị thu hồi.
  // Đọc thường mã phiên rồi UPDATE theo khoá chính, KHÔNG UPDATE theo chỉ mục `tai_khoan_id`: quét chỉ mục khoá lấn sang mục đầu của tài khoản kế tiếp trong chỉ mục, rồi chờ khoá
  // chính phiên của tài khoản đó; tài khoản kia đang giữ khoá chính ấy (`rotate` của đổi mật khẩu) và quét tới chỉ mục thì thành 1213 giữa hai tài khoản khác nhau.
  // Đọc thường chỉ an toàn khi giao dịch đã khoá hàng `tai_khoan` TRƯỚC lần đọc thường đầu tiên của nó: đăng nhập mới cũng cần khoá đó nên không chen vào được, và ảnh chụp của
  // REPEATABLE READ được lập sau khi có khoá. Danh sách mã không chia lô, không sắp xếp: các giao dịch cùng tài khoản đã xếp hàng ở khoá `tai_khoan`.
  async revokeAllActive(
    em: EntityManager,
    accountId: string,
    at: Date,
    exceptSessionId?: string,
  ): Promise<number> {
    const rows = await em.find(PhienDangNhap, {
      select: { phienDangNhapId: true },
      where: { taiKhoanId: accountId, thuHoiLuc: IsNull() },
    });
    const ids = rows
      .map((row) => row.phienDangNhapId)
      .filter((id) => id !== exceptSessionId);
    if (ids.length === 0) return 0;

    const result = await em
      .createQueryBuilder()
      .update(PhienDangNhap)
      .set({ thuHoiLuc: at })
      .where('phien_dang_nhap_id IN (:...ids) AND thu_hoi_luc IS NULL', { ids })
      .execute();
    return result.affected ?? 0;
  }

  // Cho guard của mỗi request (A4): phiên phải đúng chủ, chưa thu hồi, chưa quá trần (tao_luc còn mới hơn `createdAfter`)
  // và tài khoản vẫn DangHoatDong. Một câu truy vấn theo khoá chính, trả vai trò để guard khỏi tra thêm.
  async findActiveForAccess(
    em: EntityManager | undefined,
    sessionId: string,
    accountId: string,
    createdAfter: Date,
  ): Promise<LoaiTaiKhoan | null> {
    const rows: { loai_tai_khoan: LoaiTaiKhoan }[] = await (
      em ?? this.dataSource.manager
    ).query(
      `SELECT t.loai_tai_khoan
         FROM phien_dang_nhap p
         JOIN tai_khoan t ON t.tai_khoan_id = p.tai_khoan_id
        WHERE p.phien_dang_nhap_id = ?
          AND p.tai_khoan_id = ?
          AND p.thu_hoi_luc IS NULL
          AND p.tao_luc > ?
          AND t.trang_thai = 'DangHoatDong'`,
      [sessionId, accountId, createdAfter],
    );
    return rows[0]?.loai_tai_khoan ?? null;
  }

  // Xoá MỌI phiên của tài khoản. Chỉ để xoá tài khoản Bệnh nhân chưa xác minh quá 24 giờ (task A5; H2, H5: khoá ngoại không CASCADE,
  // và phòng thủ: tài khoản chưa xác minh không có phiên nhưng vẫn xoá để khỏi vướng khoá ngoại). Người gọi đã khoá hàng tai_khoan.
  async deleteByAccount(em: EntityManager, accountId: string): Promise<number> {
    const result = await em
      .createQueryBuilder()
      .delete()
      .from(PhienDangNhap)
      .where('tai_khoan_id = :accountId', { accountId })
      .execute();
    return result.affected ?? 0;
  }
}
