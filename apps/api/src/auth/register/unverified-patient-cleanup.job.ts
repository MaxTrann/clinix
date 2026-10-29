import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import {
  isDeadlockError,
  isForeignKeyError,
  isLockWaitTimeoutError,
} from '../../database/mysql-errors.js';
import {
  UNVERIFIED_ACCOUNT_TTL_MS,
  UNVERIFIED_CLEANUP_BATCH_SIZE,
  UNVERIFIED_CLEANUP_CRON,
  UNVERIFIED_CLEANUP_JOB_NAME,
  UNVERIFIED_CLEANUP_MAX_BATCHES,
} from '../auth.constants.js';
import { currentSecond } from '../otp/otp-time.js';
import { TaiKhoanRepository } from '../repositories/tai-khoan.repository.js';
import { UnverifiedPatientCleaner } from './unverified-patient-cleaner.js';

export interface CleanupSummary {
  /** `purgeIfExpired` trả true: tài khoản cùng mã xác thực và phiên của nó đã bị xoá */
  deleted: number;
  /** `purgeIfExpired` trả false: tài khoản đã đổi giữa lúc quét và lúc xoá (vừa xác minh, đã bị xoá bởi bên khác) */
  skipped: number;
  /** Giao dịch của tài khoản đó đã hoàn tác trọn; lượt sau thử lại */
  failed: number;
  /** Có thể còn ứng viên chưa tới lượt vì đã hết trần số lô của lượt này */
  more: boolean;
}

/**
 * Job dọn tài khoản Bệnh nhân chưa xác minh quá 24 giờ (task A7; ĐK b5 câu cuối, Q4). Lớp chạy theo lịch (`*.job.ts`).
 *
 * Mỗi lượt: quét theo lô (khoá chính tăng dần, tối đa MAX_BATCHES lô × BATCH_SIZE) rồi xoá MỖI tài khoản trong một giao dịch READ COMMITTED riêng
 * bằng `UnverifiedPatientCleaner.purgeIfExpired` (khoá hàng tai_khoan, kiểm lại điều kiện dưới khoá, xoá ma_xac_thuc → phien_dang_nhap → tai_khoan).
 *  - Câu chọn chỉ đọc và dùng đúng điều kiện của `isExpiredUnverifiedPatient` (nửa mở) với cùng đồng hồ `currentSecond()`; nó chỉ là danh sách ứng viên,
 *    quyết định thật nằm ở `purgeIfExpired` dưới khoá, nên tài khoản vừa xác minh hay vừa bị xoá bởi bên khác chỉ bị bỏ qua (`skipped`), không bao giờ bị xoá nhầm.
 *  - READ COMMITTED (không khoá khoảng chỉ mục) để xoá nhiều tài khoản không deadlock chéo với đăng ký/xác minh/gửi lại của tài khoản khác (A5-C).
 *    Không qua `OtpService.transaction` vì hàm xoá không gọi OtpService.
 *  - Một tài khoản lỗi (khoá ngoại, deadlock 1213, hết thời gian chờ khoá 1205…) KHÔNG dừng lượt và không làm sập tiến trình: giao dịch của nó đã hoàn tác
 *    trọn, nó vẫn là ứng viên nên lượt sau thử lại. Con trỏ khoá chính bảo đảm tài khoản lỗi vĩnh viễn không chặn các tài khoản sau nó.
 *  - Hai bản API cùng chạy job là an toàn, không cần khoá riêng: bên sau bị chặn ở khoá hàng rồi thấy hàng đã biến mất (`skipped`); cả hai đều đi theo
 *    thứ tự khoá chính tăng dần nên không có chu trình chờ.
 *  - Chống chạy chồng trong cùng tiến trình bằng cờ `running` (lượt trước chưa xong thì bỏ qua lượt này).
 *
 * Log CHỈ có số lượng, mã tài khoản và loại lỗi (mã MySQL hoặc tên lớp lỗi): không bao giờ có email, họ tên, băm hay `error.message`
 * (framework log nguyên đối tượng lỗi nếu hàm này ném ra, nên `run` không bao giờ ném).
 *
 * Lịch: `ScheduleModule` đã được `UploadModule` đăng ký TOÀN CỤC; KHÔNG gọi `ScheduleModule.forRoot()` lần nữa (mỗi lần gọi là một module riêng nên
 * mọi job chạy gấp đôi mỗi nhịp). Tắt ở NODE_ENV=test để job không tự chạy giữa các test dựng AppModule; test gọi `run()` trực tiếp.
 */
@Injectable()
export class UnverifiedPatientCleanupJob {
  private readonly logger = new Logger(UnverifiedPatientCleanupJob.name);
  private running = false;

  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(TaiKhoanRepository) private readonly accounts: TaiKhoanRepository,
    @Inject(UnverifiedPatientCleaner)
    private readonly cleaner: UnverifiedPatientCleaner,
  ) {}

  /** Trả tóm tắt lượt vừa chạy; `undefined` nếu lượt này bị bỏ qua vì lượt trước (cùng tiến trình) còn chạy. */
  @Cron(UNVERIFIED_CLEANUP_CRON, {
    name: UNVERIFIED_CLEANUP_JOB_NAME,
    disabled: process.env.NODE_ENV === 'test',
  })
  async run(): Promise<CleanupSummary | undefined> {
    if (this.running) {
      this.logger.warn(
        'Lượt dọn tài khoản chưa xác minh trước vẫn đang chạy: bỏ qua lượt này',
      );
      return undefined;
    }
    this.running = true;
    const summary: CleanupSummary = {
      deleted: 0,
      skipped: 0,
      failed: 0,
      more: false,
    };
    let completed = false;
    try {
      await this.sweep(summary);
      completed = true;
    } catch (error) {
      // Lỗi đọc danh sách ứng viên (DB sập…): nuốt ở đây, KHÔNG ném lên framework (nó log nguyên lỗi, kể cả message)
      this.logger.error(
        `Dọn tài khoản chưa xác minh: không đọc được danh sách ứng viên (${failureKind(error)})`,
      );
    } finally {
      this.running = false;
    }
    this.report(summary, completed);
    return summary;
  }

  private async sweep(summary: CleanupSummary): Promise<void> {
    const cutoff = new Date(
      currentSecond().getTime() - UNVERIFIED_ACCOUNT_TTL_MS,
    );
    let afterId = '0';
    for (let batch = 0; batch < UNVERIFIED_CLEANUP_MAX_BATCHES; batch++) {
      const ids = await this.accounts.findExpiredUnverifiedPatientIds(
        this.dataSource.manager,
        cutoff,
        afterId,
        UNVERIFIED_CLEANUP_BATCH_SIZE,
      );
      for (const id of ids) await this.purgeOne(id, summary);
      if (ids.length < UNVERIFIED_CLEANUP_BATCH_SIZE) return;
      afterId = ids[ids.length - 1] ?? afterId;
    }
    summary.more = true;
  }

  private async purgeOne(id: string, summary: CleanupSummary): Promise<void> {
    try {
      const purged = await this.dataSource.transaction('READ COMMITTED', (em) =>
        this.cleaner.purgeIfExpired(em, id),
      );
      if (purged) summary.deleted += 1;
      else summary.skipped += 1;
    } catch (error) {
      summary.failed += 1;
      this.logFailure(id, error);
    }
  }

  // Chỉ mã tài khoản và loại lỗi. Deadlock và hết thời gian chờ khoá là tạm thời (lượt sau lấy lại) nên chỉ cảnh báo; còn lại là ERROR cần người xem
  // (khoá ngoại: `purgeIfExpired` đã ghi thêm một dòng ERROR riêng).
  private logFailure(id: string, error: unknown): void {
    const message = `Không dọn được tài khoản ${id}: ${failureKind(error)}`;
    if (isDeadlockError(error) || isLockWaitTimeoutError(error)) {
      this.logger.warn(`${message}; giao dịch đã hoàn tác, lượt sau thử lại`);
    } else {
      this.logger.error(message);
    }
  }

  private report(summary: CleanupSummary, completed: boolean): void {
    const { deleted, skipped, failed, more } = summary;
    if (deleted + skipped + failed === 0) {
      if (completed) {
        this.logger.debug(
          'Dọn tài khoản chưa xác minh: không có tài khoản nào quá 24 giờ',
        );
      }
      return;
    }
    this.logger.log(
      `Dọn tài khoản Bệnh nhân chưa xác minh quá 24 giờ: đã xoá ${String(deleted)}, bỏ qua ${String(skipped)}, lỗi ${String(failed)}${more ? '; còn ứng viên chờ lượt sau' : ''}`,
    );
  }
}

// Loại lỗi để ghi log: mã MySQL cho lỗi đã biết, ngược lại chỉ tên lớp lỗi. Không bao giờ dùng `message`: thông điệp lỗi của DB/driver có thể mang dữ liệu người dùng.
function failureKind(error: unknown): string {
  if (isDeadlockError(error)) return 'deadlock (MySQL 1213)';
  if (isLockWaitTimeoutError(error)) {
    return 'hết thời gian chờ khoá (MySQL 1205)';
  }
  if (isForeignKeyError(error)) return 'khoá ngoại chặn xoá (MySQL 1451)';
  return error instanceof Error ? error.name : 'lỗi không rõ';
}
