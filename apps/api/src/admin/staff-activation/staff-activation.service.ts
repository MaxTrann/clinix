import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { PasswordHasher } from '../../auth/password/password-hasher.service.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import { ActivationLinkRepository } from './activation-link.repository.js';
import { isActivationLinkUsable } from './activation-link-usability.js';
import { StaffActivationRepository } from './staff-activation.repository.js';
import {
  parseLinkReference,
  type LinkReference,
} from './staff-activation.dto.js';
import { invalidActivationLink } from './staff-activation-errors.js';

/** Đồng hồ DUY NHẤT: nowVN() (test dùng đồng hồ giả), cắt xuống giây như B14. Không dùng NOW() của DB. */
const currentSecond = (): Date => toSecond(nowVN());

// Id MỐC khi người dùng gửi id sai dạng: vẫn làm đúng MỘT lần đọc theo khoá chính (ra "không có hàng") như nhánh id đúng dạng mà không tồn tại (NS-35)
const ABSENT_ID = '0';

/** Thân phản hồi 200 của `validate`: chỉ một cờ, không lộ vai trò, họ tên, email hay hạn (quyết định (a) của Đại, 18/11/2026). */
export interface ValidateActivationResult {
  hopLe: true;
}

/** Thân phản hồi 200 của `complete`: chỉ một cờ; KHÔNG cấp phiên, KHÔNG đặt cookie (PLAN: chuyển sang màn Đăng nhập). */
export interface CompleteActivationResult {
  daKichHoat: true;
}

export interface CompleteActivationInput {
  /** Chưa kiểm dạng: sai dạng ⇒ LIEN_KET_KHONG_HOP_LE như mọi lý do khác */
  id: unknown;
  token: unknown;
  /** Mật khẩu rõ, đã qua chính sách ở DTO: chỉ sống tới khi băm xong, không bao giờ được lưu, log hay đưa vào lỗi */
  matKhauMoi: string;
}

// Kết quả của giao dịch. Giao dịch vẫn TRẢ kết quả và lỗi nghiệp vụ chỉ được ném SAU khi nó kết thúc (cùng nếp auth A2, A8, A12).
type Outcome =
  | { kind: 'refused'; taiKhoanId: string; maXacThucId: string }
  | { kind: 'activated'; taiKhoanId: string; maXacThucId: string };

/**
 * Kích hoạt tài khoản nhân sự CÔNG KHAI (task B16; PLAN admin 5.5 "Kích hoạt công khai", 5.9; quyết định Q22, Q24, Q25; TRACKING admin 9A.5).
 *
 * `validate`: đọc KHÔNG khoá, không ghi, không giao dịch. Dùng được ⇔ `isActivationLinkUsable` (token khớp băm, liên kết hợp lệ, tài khoản `ChoKichHoat`).
 * `complete`, theo thứ tự chống tốn CPU (mật khẩu đã được DTO kiểm ở biên, TRƯỚC khi vào đây):
 *   1. kiểm sơ bộ liên kết, KHÔNG khoá (thất bại ⇒ chưa băm, chưa mở giao dịch: kẻ gửi token ngẫu nhiên không gây tốn Argon2id);
 *   2. băm Argon2id NGOÀI giao dịch (không giữ khoá và kết nối khi băm, như auth A12);
 *   3. giao dịch READ COMMITTED: khoá `tai_khoan` TRƯỚC, `ma_xac_thuc` SAU (cùng thứ tự `issue`, `deliver` của B14 và auth: không khoá ngược chiều), ĐỌC LẠI và
 *      kiểm LẠI bằng chính hàm của bước 1 với `now` lấy SAU khoá (giữa bước 1 và 3 liên kết có thể bị dùng, thu hồi, hết hạn, tài khoản đổi trạng thái);
 *   4. MỘT câu UPDATE đặt mật khẩu + `DangHoatDong` + `da_xac_minh_email` (Q24), rồi đánh dấu `da_dung_luc`. Mỗi câu phải đúng 1 hàng, không thì ném lỗi
 *      thường (hoàn tác, 500: bất biến bị vi phạm, không phải lỗi người dùng).
 * Hai `complete` song song: lần hai chờ ở khoá tài khoản; sau khi lần một commit thấy `DangHoatDong` và `da_dung_luc` ⇒ LIEN_KET_KHONG_HOP_LE (NS-40).
 *
 * Mọi nhánh thất bại trả CÙNG một lỗi (`invalidActivationLink`) và làm CÙNG việc (một lần đọc, một lần băm SHA-256 + so hằng định), nên mã lỗi và thời gian
 * không cho biết liên kết nào tồn tại. Không audit (PLAN 5.10 không có hành động cho kích hoạt), không đăng nhập tự động, không đặt cookie.
 * Log CHỈ có mã tài khoản và mã liên kết lấy từ DB: không token, URL, mật khẩu, băm. Thất bại ở bước sơ bộ KHÔNG log gì (không có gì đáng tin để ghi).
 */
@Injectable()
export class StaffActivationService {
  private readonly logger = new Logger(StaffActivationService.name);

  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(StaffActivationRepository)
    private readonly repo: StaffActivationRepository,
    @Inject(ActivationLinkRepository)
    private readonly accounts: ActivationLinkRepository,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
  ) {}

  async validate(body: unknown): Promise<ValidateActivationResult> {
    const inspected = await this.inspect(parseLinkReference(body));
    if (!inspected.usable) throw invalidActivationLink();
    return { hopLe: true };
  }

  async complete(
    input: CompleteActivationInput,
  ): Promise<CompleteActivationResult> {
    const ref = parseLinkReference({ id: input.id, token: input.token });
    const inspected = await this.inspect(ref);
    if (!inspected.usable || ref === null || inspected.taiKhoanId === null) {
      throw invalidActivationLink();
    }
    const { taiKhoanId } = inspected;

    const matKhauBam = await this.hasher.hash(input.matKhauMoi);
    const outcome = await this.dataSource.transaction('READ COMMITTED', (em) =>
      this.apply(em, ref, taiKhoanId, matKhauBam),
    );
    return this.finish(outcome);
  }

  // Kiểm sơ bộ KHÔNG khoá: đúng một lần đọc theo khoá chính (id mốc khi id sai dạng) rồi `isActivationLinkUsable`, không ngắn mạch
  private async inspect(
    ref: LinkReference | null,
  ): Promise<{ usable: boolean; taiKhoanId: string | null }> {
    const found = await this.repo.findLinkWithAccount(
      this.dataSource.manager,
      ref?.id ?? ABSENT_ID,
    );
    const usable = isActivationLinkUsable(
      found?.link ?? null,
      found?.account ?? null,
      ref?.token ?? null,
      currentSecond(),
    );
    return { usable, taiKhoanId: found?.link.taiKhoanId ?? null };
  }

  private async apply(
    em: EntityManager,
    ref: LinkReference,
    taiKhoanId: string,
    matKhauBam: string,
  ): Promise<Outcome> {
    // Thứ tự khoá cố định: tai_khoan → ma_xac_thuc
    const account = await this.accounts.lockAccount(em, taiKhoanId);
    const link = await this.repo.lockLink(em, ref.id);
    // `now` lấy SAU khi đã giữ khoá: hết hạn trong lúc băm hay chờ khoá vẫn bị từ chối
    const usable = isActivationLinkUsable(
      link,
      account,
      ref.token,
      currentSecond(),
    );
    if (!usable) {
      return { kind: 'refused', taiKhoanId, maXacThucId: ref.id };
    }

    // --- Từ đây mới ghi. Lỗi nào cũng hoàn tác trọn giao dịch.
    if (!(await this.repo.activateAccount(em, taiKhoanId, matKhauBam))) {
      throw new Error(
        `Không kích hoạt được tài khoản ${taiKhoanId} dù đã khoá và kiểm điều kiện`,
      );
    }
    if (!(await this.repo.markUsed(em, ref.id, currentSecond()))) {
      throw new Error(
        `Không đánh dấu dùng được liên kết kích hoạt ${ref.id} dù đã khoá và kiểm điều kiện`,
      );
    }
    return { kind: 'activated', taiKhoanId, maXacThucId: ref.id };
  }

  // Chạy SAU khi giao dịch đã kết thúc
  private finish(outcome: Outcome): CompleteActivationResult {
    if (outcome.kind === 'refused') {
      // Đã qua kiểm sơ bộ nhưng dưới khoá thì không còn dùng được: có người khác vừa dùng, thu hồi hay hết hạn.
      // Mã tài khoản lấy từ DB; mã liên kết đã qua kiểm dạng số và đã khớp một hàng ở bước sơ bộ (không phải chuỗi tự do của người dùng)
      this.logger.warn(
        `Tài khoản ${outcome.taiKhoanId}: liên kết kích hoạt ${outcome.maXacThucId} không còn dùng được khi khoá (đã dùng, thu hồi, hết hạn hoặc tài khoản đổi trạng thái)`,
      );
      throw invalidActivationLink();
    }
    this.logger.log(
      `Tài khoản ${outcome.taiKhoanId} đã kích hoạt qua liên kết ${outcome.maXacThucId}`,
    );
    return { daKichHoat: true };
  }
}
