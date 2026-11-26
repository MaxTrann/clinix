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
