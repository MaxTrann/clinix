import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import {
  buildAccountWorld,
  type AccountWorld,
} from '../../admin/accounts/testing/account-world.js';
import type { ChatActor } from '../core/chat-access.policy.js';
import { ConversationOpenRepository } from '../core/conversation-open.repository.js';
import { MessageRepository } from '../core/message.repository.js';
import {
  NoopChatNotifier,
  type ChatMessageEvent,
  type ChatNotifier,
} from '../core/ports/chat-notifier.port.js';
import {
  NoopChatRealtime,
  type ChatRealtime,
} from '../core/ports/chat-realtime.port.js';
import { SendMessageService } from '../core/send-message.service.js';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import { ReceptionScopeRepository } from '../../rbac/reception-scope.repository.js';
import { ReceptionScopeService } from '../../rbac/reception-scope.service.js';
import { ChatActorResolver } from '../read/chat-actor.resolver.js';
import { ConversationReadRepository } from '../read/conversation-read.repository.js';
import { ConversationReadService } from '../read/conversation-read.service.js';

// Fixture của chat (B1 trở đi; PLAN chat 5.15: test tự động KHÔNG dùng seed demo). Dựng trên thế giới tài khoản của admin (hai chi nhánh, đủ vai trò).

export interface ChatWorld {
  accounts: AccountWorld;
  branchA: string;
  branchB: string;
  /** Bệnh nhân (có lịch ở A), Bệnh nhân khác (có lịch ở cả hai), Bệnh nhân chưa từng đặt lịch. */
  patientA: ChatActor;
  patientB: ChatActor;
  patientC: ChatActor;
  doctorA: ChatActor;
  doctorB: ChatActor;
  /** Bác sĩ chi nhánh A đang `ChoKichHoat` (không hoạt động). */
  pendingDoctorId: string;
  /** Tài khoản loại Bác sĩ thiếu dòng `bac_si`. */
  brokenDoctorId: string;
  receptionistA: ChatActor;
  receptionistB: ChatActor;
}

export async function buildChatWorld(db: DataSource): Promise<ChatWorld> {
  const w = await buildAccountWorld(db);
  const id = (pair: { account: { taiKhoanId: string } }) =>
    pair.account.taiKhoanId;
  const branchA = w.branchA.chiNhanhId;
  const branchB = w.branchB.chiNhanhId;
  return {
    accounts: w,
    branchA,
    branchB,
    patientA: { vaiTro: 'BenhNhan', taiKhoanId: id(w.onlyA) },
    patientB: { vaiTro: 'BenhNhan', taiKhoanId: id(w.both) },
    patientC: { vaiTro: 'BenhNhan', taiKhoanId: id(w.none) },
    doctorA: { vaiTro: 'BacSi', taiKhoanId: id(w.doctorA) },
    doctorB: { vaiTro: 'BacSi', taiKhoanId: id(w.doctorB) },
    pendingDoctorId: id(w.pendingDoctorA),
    brokenDoctorId: w.brokenDoctor.taiKhoanId,
    receptionistA: {
      vaiTro: 'LeTan',
      taiKhoanId: id(w.receptionistA),
      chiNhanhId: branchA,
    },
    receptionistB: {
      vaiTro: 'LeTan',
      taiKhoanId: id(w.receptionistB),
      chiNhanhId: branchB,
    },
  };
}

export const newSendId = (): string => randomUUID();

/** Cổng thông báo ghi lại sự kiện (không ghi DB). */
export class RecordingNotifier implements ChatNotifier {
  readonly events: ChatMessageEvent[] = [];
  notify(_em: unknown, event: ChatMessageEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
}

/** Cổng đẩy ghi lại sự kiện. */
export class RecordingRealtime implements ChatRealtime {
  readonly events: ChatMessageEvent[] = [];
  publish(event: ChatMessageEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
}

export interface SendServiceParts {
  conversations?: ConversationOpenRepository;
  messages?: MessageRepository;
  notifier?: ChatNotifier;
  realtime?: ChatRealtime;
}

/** Dựng lõi gửi như Nest dựng (mặc định hai cổng `Noop` im lặng); test thay từng phần. */
export function buildSendService(
  db: DataSource,
  parts: SendServiceParts = {},
): SendMessageService {
  const quiet = { warn: () => undefined } as Pick<Logger, 'warn'>;
  const notifier = parts.notifier ?? new NoopChatNotifier();
  const realtime = parts.realtime ?? new NoopChatRealtime();
  if (notifier instanceof NoopChatNotifier) notifier.logger = quiet;
  if (realtime instanceof NoopChatRealtime) realtime.logger = quiet;
  return new SendMessageService(
    db,
    parts.conversations ?? new ConversationOpenRepository(),
    parts.messages ?? new MessageRepository(),
    notifier,
    realtime,
  );
}

/** Dựng service đọc (chat B2) như Nest dựng: phạm vi Lễ tân đọc DB thật qua `ReceptionScopeService`. */
export function buildReadService(db: DataSource): ConversationReadService {
  return new ConversationReadService(
    db,
    new ConversationReadRepository(),
    new ChatActorResolver(
      new ReceptionScopeService(new ReceptionScopeRepository(db)),
    ),
    new MessageRepository(),
  );
}

/** Người dùng như guard gắn vào request (vai trò của chat suy từ `ChatActor`). */
export const userOf = (actor: ChatActor): AuthenticatedUser => ({
  accountId: actor.taiKhoanId,
  sessionId: '1',
  role: actor.vaiTro,
});

/** Mở hội thoại bằng tin đầu qua lõi gửi thật (nơi DUY NHẤT tạo hội thoại); trả id hội thoại và id tin đầu. */
export async function openConversation(
  service: SendMessageService,
  patient: ChatActor,
  target: { bacSiId: string } | { chiNhanhId: string },
): Promise<{ hoiThoaiId: string; tinNhanId: string }> {
  const outcome = await service.send({
    actor: patient,
    target,
    noiDung: 'Tin mở đầu',
    maGui: newSendId(),
  });
  if (outcome.kind !== 'Sent') throw new Error(`mở lỗi: ${outcome.kind}`);
  return {
    hoiThoaiId: outcome.tinNhan.hoiThoaiId,
    tinNhanId: outcome.tinNhan.tinNhanId,
  };
}

/**
 * Chèn thẳng `count` tin của một người gửi (bỏ qua lõi gửi: không vướng giới hạn 20 tin/phút) bằng MỘT câu `INSERT … SELECT` đệ quy. Giờ gửi tăng mỗi tin một giây
 * từ `from`. Trả id các tin theo thứ tự tăng dần.
 */
export async function insertMessages(
  db: DataSource,
  hoiThoaiId: string,
  nguoiGuiId: string,
  count: number,
  from = new Date('2026-11-02T01:00:00.000Z'),
): Promise<string[]> {
  if (count === 0) return [];
  // Phiên test có `cte_max_recursion_depth` mặc định 1000: nâng cho lô lớn
  await db.query('SET SESSION cte_max_recursion_depth = 100000');
  await db.query(
    `INSERT INTO tin_nhan (hoi_thoai_id, nguoi_gui_id, ma_gui, noi_dung, thoi_diem_gui)
     WITH RECURSIVE seq (n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < ?)
     SELECT ?, ?, NULL, CONCAT('Tin thử ', n), DATE_ADD(?, INTERVAL n SECOND) FROM seq`,
    [count, hoiThoaiId, nguoiGuiId, from],
  );
  const rows = (await db.query(
    'SELECT tin_nhan_id AS id FROM tin_nhan WHERE hoi_thoai_id = ? AND nguoi_gui_id = ? ORDER BY tin_nhan_id DESC LIMIT ?',
    [hoiThoaiId, nguoiGuiId, count],
  )) as { id: string }[];
  return rows.map((r) => String(r.id)).reverse();
}

export interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}
export function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
