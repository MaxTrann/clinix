import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { nowVN } from '../../common/time/time.js';
import {
  CHAT_ORPHAN_BATCH,
  CHAT_ORPHAN_MIN_AGE_MS,
} from '../chat.constants.js';
import {
  CHAT_FILE_STORE,
  type ChatFileEntry,
  type ChatFileStore,
} from './chat-file-store.js';

// Job dọn tệp mồ côi của chat (chat B4; PLAN chat 5.8). Tệp mồ côi = đã ghi kho nhưng KHÔNG dòng `tin_nhan` nào tham chiếu: tiến trình chết giữa lúc ghi tệp và commit,
// hay xoá tệp sau giao dịch lỗi bị lỗi. Chỉ xoá tệp KHÔNG được tham chiếu VÀ cũ hơn 24 giờ (một lượt gửi xong trong vài chục giây, nên tệp của giao dịch đang chạy
// không bao giờ bị xoá). Không bao giờ xoá tệp được tham chiếu. Log chỉ số đếm và tên lớp lỗi, không khoá hay tên tệp.
//
// Câu tra: `tep_dinh_kem` KHÔNG có chỉ mục nên mỗi lô quét cả bảng `tin_nhan` (EXPLAIN ghi ở TRACKING). Chạy một lần mỗi ngày, và chỉ khi có tệp cũ hơn 24 giờ:
// chấp nhận ở quy mô đồ án, không đổi schema (quyết định của Trung khi làm chat B4).
const REFERENCED_SQL =
  'SELECT tep_dinh_kem AS khoa FROM tin_nhan WHERE tep_dinh_kem IN (?)';

export interface CleanupResult {
  /** Số tệp cũ hơn 24 giờ đã đối chiếu. */
  checked: number;
  removed: number;
}

@Injectable()
export class ChatFileCleanupService {
  private readonly logger = new Logger(ChatFileCleanupService.name);
  private running = false;

  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(CHAT_FILE_STORE) private readonly store: ChatFileStore,
    @Inject(ConfigService)
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /** Hằng ngày 03:30 giờ máy chủ `[đề xuất]` (container đặt TZ giờ Việt Nam). Tắt khi `NODE_ENV=test`: test gọi `cleanup` trực tiếp với đồng hồ giả. */
  @Cron('0 30 3 * * *', { name: 'chat-file-cleanup' })
  async scheduled(): Promise<void> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.cleanup(nowVN());
      this.logger.log(
        `Dọn tệp mồ côi của chat: đối chiếu ${result.checked}, xoá ${result.removed}`,
      );
    } catch (error) {
      this.logger.error(
        `Dọn tệp mồ côi của chat lỗi (${error instanceof Error ? error.constructor.name : 'lỗi'})`,
      );
    } finally {
      this.running = false;
    }
  }

  async cleanup(now: Date): Promise<CleanupResult> {
    const cutoff = now.getTime() - CHAT_ORPHAN_MIN_AGE_MS;
    const result: CleanupResult = { checked: 0, removed: 0 };
    let batch: ChatFileEntry[] = [];
    for await (const entry of this.store.list()) {
      if (entry.modifiedAt.getTime() >= cutoff) continue;
      batch.push(entry);
      if (batch.length >= CHAT_ORPHAN_BATCH) {
        await this.sweep(batch, result);
        batch = [];
      }
    }
    if (batch.length > 0) await this.sweep(batch, result);
    return result;
  }

  private async sweep(
    batch: ChatFileEntry[],
    result: CleanupResult,
  ): Promise<void> {
    const keys = batch.map((entry) => entry.key);
    const rows = await this.db.query<{ khoa: string }[]>(REFERENCED_SQL, [
      keys,
    ]);
    const referenced = new Set(rows.map((row) => row.khoa));
    result.checked += keys.length;
    for (const key of keys) {
      if (referenced.has(key)) continue;
      await this.store.remove(key);
      result.removed += 1;
    }
  }
}
