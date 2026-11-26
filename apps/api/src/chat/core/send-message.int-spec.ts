import { vi } from 'vitest';
import type { DataSource, EntityManager } from 'typeorm';
import { T0, at } from '../../auth/testing/otp-int-helpers.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import {
  buildChatWorld,
  buildSendService,
  deferred,
  newSendId,
  RecordingNotifier,
  RecordingRealtime,
  type ChatWorld,
} from '../testing/chat-world.js';
import type { ChatActor } from './chat-access.policy.js';
import {
  ConversationOpenRepository,
  type OpenTarget,
} from './conversation-open.repository.js';
import type { ChatMessageEvent } from './ports/chat-notifier.port.js';
import type {
  SendMessageService,
  SendOutcome,
  SendTarget,
} from './send-message.service.js';
import { ChatInternalError } from './send-message.service.js';

// chat B1 — lõi gửi trên MySQL 8.4 THẬT (PLAN chat 7.4, 7.10). Đồng hồ giả chỉ giả `Date` (T0 = 2026-11-02 08:00:00 giờ Việt Nam); bộ hẹn giờ thật vẫn chạy.
let db: DataSource;
let logs: string[];
let w: ChatWorld;
useIntegrationHooks((d, l) => {
  db = d;
  logs = l;
});
beforeEach(async () => {
  w = await buildChatWorld(db);
});

const count = async (sql: string, params: unknown[] = []): Promise<number> => {
  const rows = (await db.query(sql, params)) as { n: string | number }[];
  return Number(rows[0]?.n ?? 0);
};
const messagesIn = (hoiThoaiId: string) =>
  count('SELECT COUNT(*) AS n FROM tin_nhan WHERE hoi_thoai_id = ?', [
    hoiThoaiId,
  ]);
const allMessages = () => count('SELECT COUNT(*) AS n FROM tin_nhan');
const allConversations = () => count('SELECT COUNT(*) AS n FROM hoi_thoai');

function send(
  service: SendMessageService,
  actor: ChatActor,
  target: SendTarget,
  noiDung: unknown = 'Xin chào',
  maGui: unknown = newSendId(),
): Promise<SendOutcome> {
  return service.send({ actor, target, noiDung, maGui });
}
function sent(outcome: SendOutcome) {
  if (outcome.kind !== 'Sent')
    throw new Error(`mong Sent, nhận ${outcome.kind}`);
  return outcome;
}
const toDoctor = (doctor: ChatActor): OpenTarget => ({
  bacSiId: doctor.taiKhoanId,
});
const setStatus = (taiKhoanId: string, trangThai: string) =>
  db.query('UPDATE tai_khoan SET trang_thai = ? WHERE tai_khoan_id = ?', [
    trangThai,
    taiKhoanId,
  ]);

describe('chat B1 — tìm-hoặc-tạo và gửi', () => {
  it('LOI-02: gửi tới bác sĩ, chi nhánh đã có hội thoại thì KHÔNG tạo hội thoại mới; hội thoại bác sĩ có đúng hai thành viên', async () => {
    const service = buildSendService(db);
    const first = sent(await send(service, w.patientA, toDoctor(w.doctorA)));
    expect(first.hoiThoaiMoi).toBe(true);
    const again = sent(await send(service, w.patientA, toDoctor(w.doctorA)));
    expect(again.hoiThoaiMoi).toBe(false);
    expect(again.tinNhan.hoiThoaiId).toBe(first.tinNhan.hoiThoaiId);
    expect(
      await count(
        'SELECT COUNT(*) AS n FROM tai_khoan_hoi_thoai WHERE hoi_thoai_id = ?',
        [first.tinNhan.hoiThoaiId],
      ),
    ).toBe(2);

    const inbox = sent(
      await send(service, w.patientA, { chiNhanhId: w.branchA }),
    );
    const inboxAgain = sent(
      await send(service, w.patientA, { chiNhanhId: w.branchA }),
    );
    expect(inboxAgain.tinNhan.hoiThoaiId).toBe(inbox.tinNhan.hoiThoaiId);
    // Chi nhánh khác, bác sĩ khác: hội thoại riêng
    const other = sent(
      await send(service, w.patientA, { chiNhanhId: w.branchB }),
    );
    expect(other.tinNhan.hoiThoaiId).not.toBe(inbox.tinNhan.hoiThoaiId);
    expect(await allConversations()).toBe(3);
    expect(await allMessages()).toBe(5);
  });

  it('LOI-03: rỗng, toàn khoảng trắng, toàn xuống dòng ⇒ Invalid NOI_DUNG_TRONG, không ghi gì (cả luồng mở)', async () => {
    const service = buildSendService(db);
    for (const raw of ['', '   ', '\r\n\n']) {
      expect(await send(service, w.patientA, toDoctor(w.doctorA), raw)).toEqual(
        {
          kind: 'Invalid',
          loi: [{ truong: 'noiDung', ma: 'NOI_DUNG_TRONG' }],
        },
      );
    }
    expect(await allConversations()).toBe(0);
    expect(await allMessages()).toBe(0);
  });

  it('LOI-07: gửi lại cùng mã và nội dung ⇒ Duplicate cùng id, một dòng, không thông báo hay đẩy thêm; vẫn thành công khi đã hết lượt', async () => {
    const notifier = new RecordingNotifier();
    const realtime = new RecordingRealtime();
    const service = buildSendService(db, { notifier, realtime });
    const maGui = newSendId();
    const first = sent(
      await send(service, w.patientA, toDoctor(w.doctorA), 'Tin một', maGui),
    );
    const again = await send(
      service,
      w.patientA,
      toDoctor(w.doctorA),
      '  Tin một ',
      maGui.toUpperCase(),
    );
    expect(again).toEqual({ kind: 'Duplicate', tinNhan: first.tinNhan });
    expect(await allMessages()).toBe(1);
    expect(notifier.events).toHaveLength(1);
    expect(realtime.events).toHaveLength(1);

    // Hết lượt (đủ 20 tin trong 60 giây) rồi gửi lại tin đầu: vẫn Duplicate, không 429
    for (let i = 0; i < 19; i++)
      sent(
        await send(service, w.patientA, {
          hoiThoaiId: first.tinNhan.hoiThoaiId,
        }),
      );
    expect(
      (
        await send(service, w.patientA, {
          hoiThoaiId: first.tinNhan.hoiThoaiId,
        })
      ).kind,
    ).toBe('RateLimited');
    const late = await send(
      service,
      w.patientA,
      { hoiThoaiId: first.tinNhan.hoiThoaiId },
      'Tin một',
      maGui,
    );
    expect(late).toEqual({ kind: 'Duplicate', tinNhan: first.tinNhan });
    expect(notifier.events).toHaveLength(20);
  });

  it('LOI-07: gửi lại cùng mã khi bên kia đã bị khoá vẫn Duplicate (thứ tự kiểm 5.5: mã gửi trước trạng thái)', async () => {
    const service = buildSendService(db);
    const maGui = newSendId();
    const first = sent(
      await send(service, w.patientA, toDoctor(w.doctorA), 'Tin', maGui),
    );
    await setStatus(w.doctorA.taiKhoanId, 'NgungHoatDong');
    expect(
      await send(service, w.patientA, toDoctor(w.doctorA), 'Tin', maGui),
    ).toEqual({
      kind: 'Duplicate',
      tinNhan: first.tinNhan,
    });
  });

  it('LOI-08: cùng mã mà khác nội dung, hay ở hội thoại khác (kể cả khi mở hội thoại mới) ⇒ SendIdUsed, không ghi', async () => {
    const service = buildSendService(db);
    const maGui = newSendId();
    const first = sent(
      await send(service, w.patientA, toDoctor(w.doctorA), 'Tin A', maGui),
    );
    expect(
      (
        await send(
          service,
          w.patientA,
          { hoiThoaiId: first.tinNhan.hoiThoaiId },
          'Tin B',
          maGui,
        )
      ).kind,
    ).toBe('SendIdUsed');
    expect(
      (
        await send(
          service,
          w.patientA,
          { chiNhanhId: w.branchA },
          'Tin A',
          maGui,
        )
      ).kind,
    ).toBe('SendIdUsed');
    const inbox = sent(
      await send(service, w.patientA, { chiNhanhId: w.branchA }),
    );
    expect(
      (
        await send(
          service,
          w.patientA,
          { hoiThoaiId: inbox.tinNhan.hoiThoaiId },
          'Tin A',
          maGui,
        )
      ).kind,
    ).toBe('SendIdUsed');
    expect(await allConversations()).toBe(2);
    expect(await allMessages()).toBe(2);
  });

  it('LOI-09: hai người gửi dùng cùng một mã ⇒ cả hai được nhận (mã duy nhất theo người gửi)', async () => {
    const service = buildSendService(db);
    const maGui = newSendId();
    const first = sent(
      await send(service, w.patientA, toDoctor(w.doctorA), 'Hỏi', maGui),
    );
    const reply = sent(
      await send(
        service,
        w.doctorA,
        { hoiThoaiId: first.tinNhan.hoiThoaiId },
        'Đáp',
        maGui,
      ),
    );
    expect(reply.tinNhan.tinNhanId).not.toBe(first.tinNhan.tinNhanId);
    expect(await allMessages()).toBe(2);
  });

  it('LOI-10: tin thứ 20 nhận, 21 ⇒ RateLimited (không ghi); vẫn bị chặn ở giây 59; sau cửa sổ 60 giây nhận lại; giới hạn riêng từng người', async () => {
    const service = buildSendService(db);
    const first = sent(await send(service, w.patientA, toDoctor(w.doctorA)));
    const conversation = { hoiThoaiId: first.tinNhan.hoiThoaiId };
    for (let i = 2; i <= 20; i++)
      sent(await send(service, w.patientA, conversation));
    expect((await send(service, w.patientA, conversation)).kind).toBe(
      'RateLimited',
    );
    expect(await allMessages()).toBe(20);
    // Người khác trong cùng hội thoại không bị ảnh hưởng
    sent(await send(service, w.doctorA, conversation));
    // Biên: ở giây 59 cả 20 tin vẫn trong cửa sổ; ở giây 60 tin lúc T0 không còn "sau" mốc (cửa sổ nửa mở)
    vi.setSystemTime(at(59));
    expect((await send(service, w.patientA, conversation)).kind).toBe(
      'RateLimited',
    );
    vi.setSystemTime(at(60));
    sent(await send(service, w.patientA, conversation));
    expect(await allMessages()).toBe(22);
  });

  it('LOI-11: bác sĩ không hoạt động (chờ kích hoạt, bị khoá) ⇒ RecipientInactive cả khi mở mới lẫn hội thoại đã có; chiều ngược lại cũng chặn; không ghi', async () => {
    const service = buildSendService(db);
    expect(
      (await send(service, w.patientA, { bacSiId: w.pendingDoctorId })).kind,
    ).toBe('RecipientInactive');
    expect(await allConversations()).toBe(0);

    const doctorChat = sent(
      await send(service, w.patientA, toDoctor(w.doctorA)),
    );
    const inbox = sent(
      await send(service, w.patientA, { chiNhanhId: w.branchA }),
    );
    await setStatus(w.doctorA.taiKhoanId, 'NgungHoatDong');
    expect((await send(service, w.patientA, toDoctor(w.doctorA))).kind).toBe(
      'RecipientInactive',
    );
    expect(
      (
        await send(service, w.patientA, {
          hoiThoaiId: doctorChat.tinNhan.hoiThoaiId,
        })
      ).kind,
    ).toBe('RecipientInactive');
    // Hộp thư chung luôn gửi được (chi nhánh không có trạng thái)
    sent(
      await send(service, w.patientA, { hoiThoaiId: inbox.tinNhan.hoiThoaiId }),
    );

    await setStatus(w.doctorA.taiKhoanId, 'DangHoatDong');
    await setStatus(w.patientA.taiKhoanId, 'NgungHoatDong');
    expect(
      (
        await send(service, w.doctorA, {
          hoiThoaiId: doctorChat.tinNhan.hoiThoaiId,
        })
      ).kind,
    ).toBe('RecipientInactive');
    expect(
      (
        await send(service, w.receptionistA, {
          hoiThoaiId: inbox.tinNhan.hoiThoaiId,
        })
      ).kind,
    ).toBe('RecipientInactive');
    expect(await allMessages()).toBe(3);
  });

  it('LOI-12: thoi_diem_gui là giờ Việt Nam cắt tới giây, như nhau khi tiến trình chạy dưới TZ=UTC hay TZ=Asia/Ho_Chi_Minh', async () => {
    const service = buildSendService(db);
    const previous = process.env.TZ;
    const stored: string[] = [];
    try {
      for (const [tz, offset] of [
        ['UTC', 0.789],
        ['Asia/Ho_Chi_Minh', 1.5],
      ] as const) {
        process.env.TZ = tz;
        vi.setSystemTime(at(offset));
        const out = sent(await send(service, w.patientA, toDoctor(w.doctorA)));
        expect(out.tinNhan.thoiDiemGui.getTime() % 1000).toBe(0);
        const rows = (await db.query(
          "SELECT DATE_FORMAT(thoi_diem_gui, '%Y-%m-%d %H:%i:%s') AS t FROM tin_nhan WHERE tin_nhan_id = ?",
          [out.tinNhan.tinNhanId],
        )) as { t: string }[];
        stored.push(rows[0]?.t ?? '');
      }
    } finally {
      process.env.TZ = previous;
    }
    expect(stored).toEqual(['2026-11-02 08:00:00', '2026-11-02 08:00:01']);
    expect(T0.toISOString()).toBe('2026-11-02T01:00:00.000Z');
  });

  it('LOI-13: cổng đẩy được gọi SAU commit (tin đã thấy được từ kết nối khác), đúng một lần; không gọi khi Duplicate hay lỗi; cổng ném không làm hỏng việc gửi', async () => {
    const seenCommitted: boolean[] = [];
    const calls: ChatMessageEvent[] = [];
    let fail = false;
    const realtime = {
      publish: async (event: ChatMessageEvent) => {
        calls.push(event);
        seenCommitted.push(
          (await count(
            'SELECT COUNT(*) AS n FROM tin_nhan WHERE tin_nhan_id = ?',
            [event.tinNhanId],
          )) === 1,
        );
        if (fail) throw new Error('socket hỏng');
      },
    };
    const service = buildSendService(db, { realtime });
    const maGui = newSendId();
    const first = sent(
      await send(service, w.patientA, toDoctor(w.doctorA), 'Tin', maGui),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      hoiThoaiId: first.tinNhan.hoiThoaiId,
      tinNhanId: first.tinNhan.tinNhanId,
      hoiThoaiMoi: true,
      vaiTroNguoiGui: 'BenhNhan',
      bacSiId: w.doctorA.taiKhoanId,
    });
    expect(
      (await send(service, w.patientA, toDoctor(w.doctorA), 'Tin', maGui)).kind,
    ).toBe('Duplicate');
    expect(
      (await send(service, w.patientA, toDoctor(w.doctorA), '')).kind,
    ).toBe('Invalid');
    expect(
      (
        await send(service, w.patientB, {
          hoiThoaiId: first.tinNhan.hoiThoaiId,
        })
      ).kind,
    ).toBe('NotFound');
    expect(calls).toHaveLength(1);

    fail = true;
    const second = await send(service, w.doctorA, {
      hoiThoaiId: first.tinNhan.hoiThoaiId,
    });
    expect(second.kind).toBe('Sent');
    expect(calls).toHaveLength(2);
    expect(seenCommitted).toEqual([true, true]);
    expect(await allMessages()).toBe(2);
    expect(logs.some((line) => line.includes('Đẩy tin tức thời lỗi'))).toBe(
      true,
    );
  });

  // chat B3 (BCH-02): lỗi ra ngoài là `ChatInternalError`, KHÔNG mang câu của lỗi gốc (có thể chứa nội dung tin); ca chi tiết ở test/chat-send.e2e-spec.ts
  it('LOI-14: cổng thông báo ném ⇒ tin bị hoàn tác (luồng mở: cả hội thoại; hội thoại đã có: không thêm tin)', async () => {
    const service = buildSendService(db);
    const conversation = sent(
      await send(service, w.patientA, toDoctor(w.doctorA)),
    );
    const broken = buildSendService(db, {
      notifier: {
        notify: () => Promise.reject(new Error('ghi thông báo lỗi')),
      },
    });
    await expect(
      send(broken, w.patientA, { chiNhanhId: w.branchA }),
    ).rejects.toThrow(ChatInternalError);
    await expect(
      send(broken, w.doctorA, { hoiThoaiId: conversation.tinNhan.hoiThoaiId }),
    ).rejects.toThrow(ChatInternalError);
    expect(await allConversations()).toBe(1);
    expect(await allMessages()).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM tai_khoan_hoi_thoai')).toBe(
      2,
    );
  });

  it('LOI-15: nội dung có HTML, SQL được lưu nguyên văn; hai tin liên tiếp có id tăng', async () => {
    const service = buildSendService(db);
    const raw = `<img src=x onerror=alert(1)>'); DROP TABLE tin_nhan; -- "x" \\ %_`;
    const first = sent(
      await send(service, w.patientA, toDoctor(w.doctorA), raw),
    );
    const second = sent(
      await send(
        service,
        w.patientA,
        { hoiThoaiId: first.tinNhan.hoiThoaiId },
        'Tin hai',
      ),
    );
    const rows = (await db.query(
      'SELECT noi_dung AS noiDung FROM tin_nhan WHERE tin_nhan_id = ?',
      [first.tinNhan.tinNhanId],
    )) as { noiDung: string }[];
    expect(rows[0]?.noiDung).toBe(raw);
    expect(BigInt(second.tinNhan.tinNhanId)).toBeGreaterThan(
      BigInt(first.tinNhan.tinNhanId),
    );
  });
});

describe('chat B1 — chính sách quyền ở lõi (PLAN 5.3; ca HTTP là QCH-03, QCH-04, QCH-05, QCH-07 của B2, B3)', () => {
  it('không thấy hội thoại ⇒ NotFound, không ghi: Bệnh nhân khác, Bác sĩ khác, Bác sĩ vào hộp thư, Lễ tân chi nhánh khác, Lễ tân vào hội thoại bác sĩ, id không có hay sai dạng', async () => {
    const service = buildSendService(db);
    const doctorChat = sent(
      await send(service, w.patientA, toDoctor(w.doctorA)),
    );
    const inbox = sent(
      await send(service, w.patientA, { chiNhanhId: w.branchA }),
    );
    const cases: [ChatActor, SendTarget][] = [
      [w.patientB, { hoiThoaiId: doctorChat.tinNhan.hoiThoaiId }],
      [w.doctorB, { hoiThoaiId: doctorChat.tinNhan.hoiThoaiId }],
      [w.doctorA, { hoiThoaiId: inbox.tinNhan.hoiThoaiId }],
      [w.receptionistB, { hoiThoaiId: inbox.tinNhan.hoiThoaiId }],
      [w.receptionistA, { hoiThoaiId: doctorChat.tinNhan.hoiThoaiId }],
      [w.patientA, { hoiThoaiId: '999999' }],
      [w.patientA, { hoiThoaiId: '0' }],
      [w.patientA, { hoiThoaiId: '-1' }],
      [w.patientA, { hoiThoaiId: 'abc' }],
      [w.patientA, { hoiThoaiId: '1'.repeat(21) }],
      [w.patientA, { bacSiId: '999999' }],
      [w.patientA, { bacSiId: w.brokenDoctorId }],
      [w.patientA, { bacSiId: w.patientB.taiKhoanId }],
      [w.patientA, { chiNhanhId: '999999' }],
      [w.patientA, { chiNhanhId: 'x' }],
    ];
    for (const [actor, target] of cases)
      expect(
        (await send(service, actor, target)).kind,
        JSON.stringify(target),
      ).toBe('NotFound');
    expect(await allConversations()).toBe(2);
    expect(await allMessages()).toBe(2);
  });

  it('Bác sĩ, Lễ tân không mở hội thoại mới ⇒ Forbidden', async () => {
    const service = buildSendService(db);
    expect(
      (await send(service, w.doctorA, { chiNhanhId: w.branchA })).kind,
    ).toBe('Forbidden');
    expect(
      (await send(service, w.receptionistA, toDoctor(w.doctorA))).kind,
    ).toBe('Forbidden');
    expect(await allConversations()).toBe(0);
  });

  it('Lễ tân đúng chi nhánh trả lời hộp thư (không cần dòng thành viên trước): có dòng riêng mốc NULL; trả lời lần hai không đổi mốc', async () => {
    const service = buildSendService(db);
    const inbox = sent(
      await send(service, w.patientA, { chiNhanhId: w.branchA }),
    );
    const reply = sent(
      await send(service, w.receptionistA, {
        hoiThoaiId: inbox.tinNhan.hoiThoaiId,
      }),
    );
    const member = () =>
      db.query(
        'SELECT tin_nhan_cuoi_da_doc_id AS moc FROM tai_khoan_hoi_thoai WHERE tai_khoan_id = ? AND hoi_thoai_id = ?',
        [w.receptionistA.taiKhoanId, inbox.tinNhan.hoiThoaiId],
      ) as Promise<{ moc: string | null }[]>;
    expect(await member()).toEqual([{ moc: null }]);
    await db.query(
      'UPDATE tai_khoan_hoi_thoai SET tin_nhan_cuoi_da_doc_id = ? WHERE tai_khoan_id = ? AND hoi_thoai_id = ?',
      [
        reply.tinNhan.tinNhanId,
        w.receptionistA.taiKhoanId,
        inbox.tinNhan.hoiThoaiId,
      ],
    );
    sent(
      await send(service, w.receptionistA, {
        hoiThoaiId: inbox.tinNhan.hoiThoaiId,
      }),
    );
    expect(await member()).toEqual([{ moc: reply.tinNhan.tinNhanId }]);
  });
});

// ---------- khoá và đồng thời ----------

/** Repository có cổng: `lockPatient` chờ đủ hai bên mới khoá (cổng đồng bộ); `findExisting` nán lại khi không thấy hội thoại. */
class GatedConversations extends ConversationOpenRepository {
  barrier?: { arrived: number; all: ReturnType<typeof deferred> };
  /** Khi không thấy hội thoại thì nán lại một chút: nếu ai bỏ khoá tài khoản, hai giao dịch chắc chắn cùng "không thấy" rồi cùng tạo. */
  widenMs = 0;

  override async lockPatient(em: EntityManager, benhNhanId: string) {
    if (this.barrier) {
      this.barrier.arrived++;
      if (this.barrier.arrived >= 2) this.barrier.all.resolve();
      await this.barrier.all.promise;
    }
    return super.lockPatient(em, benhNhanId);
  }

  override async findExisting(
    ...args: Parameters<ConversationOpenRepository['findExisting']>
  ) {
    const found = await super.findExisting(...args);
    if (found === null && this.widenMs > 0)
      await new Promise((resolve) => setTimeout(resolve, this.widenMs));
    return found;
  }
}

/**
 * Bọc `DataSource` để giao dịch ĐẦU TIÊN dừng ở CUỐI thân (mọi câu đã chạy, chưa commit): đo được mọi khoá giao dịch đó đã xin, kể cả khoá xin sau câu tìm.
 * Chỉ một lần, các giao dịch sau chạy bình thường.
 */
function gateFirstTransaction(gate: {
  reached: ReturnType<typeof deferred>;
  open: ReturnType<typeof deferred>;
}): DataSource {
  let used = false;
  return new Proxy(db, {
    get(target, property, receiver) {
      if (property !== 'transaction')
        return Reflect.get(target, property, receiver) as unknown;
      return (
        isolation: 'READ COMMITTED',
        work: (em: EntityManager) => Promise<unknown>,
      ) =>
        target.transaction(isolation, async (em) => {
          const result = await work(em);
          if (!used) {
            used = true;
            gate.reached.resolve();
            await gate.open.promise;
          }
          return result;
        });
    },
  });
}

interface HeldLock {
  bang: string;
  cheDo: string;
}
// Khoá HÀNG của DB test, đo từ một kết nối KHÁC với kết nối đang giữ giao dịch (cách của admin B14, B15, B18)
const heldLocks = (): Promise<HeldLock[]> =>
  db.query(
    `SELECT OBJECT_NAME AS bang, LOCK_MODE AS cheDo FROM performance_schema.data_locks
      WHERE OBJECT_SCHEMA = DATABASE() AND LOCK_TYPE = 'RECORD' ORDER BY OBJECT_NAME`,
  );
const lockWaits = () =>
  count(
    `SELECT COUNT(*) AS n FROM performance_schema.data_lock_waits w
       JOIN performance_schema.data_locks l ON l.ENGINE_LOCK_ID = w.REQUESTING_ENGINE_LOCK_ID
      WHERE l.OBJECT_SCHEMA = DATABASE()`,
  );

describe('chat B1 — khoá (PLAN 5.4)', () => {
  it('LOI-16: hai lần mở cùng cặp chạy đồng thời trên hai kết nối thật (cổng đồng bộ) ⇒ MỘT hội thoại, hai tin; bên sau gửi vào hội thoại đã có', async () => {
    const conversations = new GatedConversations();
    conversations.barrier = { arrived: 0, all: deferred() };
    conversations.widenMs = 150;
    const service = buildSendService(db, { conversations });
    const results = await Promise.all([
      send(service, w.patientA, toDoctor(w.doctorA), 'Tab một'),
      send(service, w.patientA, toDoctor(w.doctorA), 'Tab hai'),
    ]);
    const outcomes = results.map(sent);
    // Đúng một bên tạo hội thoại, bên kia gửi vào hội thoại đã có
    expect(outcomes.filter((o) => o.hoiThoaiMoi)).toHaveLength(1);
    expect(outcomes[0]?.tinNhan.hoiThoaiId).toBe(
      outcomes[1]?.tinNhan.hoiThoaiId,
    );
    expect(await allConversations()).toBe(1);
    expect(await allMessages()).toBe(2);
  });

  it('LOI-17: hai tin cùng hội thoại, giao dịch đầu dừng trước commit ⇒ giao dịch sau CHỜ khoá hội thoại; id commit đúng thứ tự', async () => {
    const service = buildSendService(db);
    const conversation = sent(
      await send(service, w.patientA, toDoctor(w.doctorA)),
    );
    const target = { hoiThoaiId: conversation.tinNhan.hoiThoaiId };

    const reached = deferred();
    const open = deferred();
    let calls = 0;
    const gated = buildSendService(db, {
      notifier: {
        notify: async () => {
          calls++;
          if (calls === 1) {
            reached.resolve();
            await open.promise;
          }
        },
      },
    });
    const first = send(gated, w.patientA, target, 'Tin trước');
    let second: Promise<SendOutcome> | undefined;
    try {
      await reached.promise;
      second = send(gated, w.doctorA, target, 'Tin sau');
      // Chờ tới khi MySQL ghi nhận giao dịch sau đang chờ khoá (tối đa 2 giây, dưới hạn chờ khoá 3 giây)
      let waits = 0;
      for (let i = 0; i < 40 && waits === 0; i++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        waits = await lockWaits();
      }
      expect(waits).toBeGreaterThan(0);
      expect(calls).toBe(1);
    } finally {
      open.resolve();
    }
    const [a, b] = [
      sent(await first),
      sent(await (second as Promise<SendOutcome>)),
    ];
    expect(BigInt(a.tinNhan.tinNhanId)).toBeLessThan(
      BigInt(b.tinNhan.tinNhanId),
    );
    expect(await messagesIn(target.hoiThoaiId)).toBe(3);
  });

  it('LOI-18: mở tới đích đã có hội thoại ⇒ ở cuối giao dịch mở (trước commit) chỉ có khoá hàng tai_khoan (X), KHÔNG khoá nào trên hoi_thoai', async () => {
    const service = buildSendService(db);
    sent(await send(service, w.patientA, toDoctor(w.doctorA)));
    const gate = { reached: deferred(), open: deferred() };
    const gated = buildSendService(gateFirstTransaction(gate));
    const pending = send(gated, w.patientA, toDoctor(w.doctorA));
    let locks: HeldLock[];
    try {
      await Promise.race([
        gate.reached.promise,
        pending.then(() => {
          throw new Error('giao dịch kết thúc mà chưa tới cổng');
        }),
      ]);
      locks = await heldLocks();
    } finally {
      gate.open.resolve();
    }
    expect(sent(await pending).hoiThoaiMoi).toBe(false);
    expect([...new Set(locks.map((l) => l.bang))]).toEqual(['tai_khoan']);
    expect(locks.every((l) => l.cheDo.startsWith('X'))).toBe(true);
  });
});

describe('chat B1 — log (BCH-01)', () => {
  it('BCH-01: gửi thành công, lỗi dữ liệu, không thấy, quá nhanh, gửi trùng mã, cổng đẩy lỗi: log không có nội dung tin, SĐT, email', async () => {
    const marker = 'NOIDUNGBIMAT-0912345678-ai@vidu.vn';
    const realtime = {
      publish: () => Promise.reject(new Error(marker)),
    };
    const service = buildSendService(db, { realtime });
    const maGui = newSendId();
    const first = sent(
      await send(service, w.patientA, toDoctor(w.doctorA), marker, maGui),
    );
    await send(service, w.patientA, toDoctor(w.doctorA), marker, maGui);
    await send(service, w.patientA, toDoctor(w.doctorA), `${marker}\u0000`);
    await send(
      service,
      w.patientB,
      { hoiThoaiId: first.tinNhan.hoiThoaiId },
      marker,
    );
    for (let i = 0; i < 20; i++)
      await send(
        service,
        w.patientA,
        { hoiThoaiId: first.tinNhan.hoiThoaiId },
        marker,
      );
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      expect(line).not.toContain('NOIDUNGBIMAT');
      expect(line).not.toContain('0912345678');
      expect(line).not.toContain('ai@vidu.vn');
    }
  });
});
