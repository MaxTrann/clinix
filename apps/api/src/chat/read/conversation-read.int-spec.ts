import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { bookAppointment } from '../../admin/accounts/testing/account-world.js';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { ChatActor } from '../core/chat-access.policy.js';
import type { SendMessageService } from '../core/send-message.service.js';
import {
  buildChatWorld,
  buildReadService,
  buildSendService,
  insertMessages,
  newSendId,
  openConversation,
  userOf,
  type ChatWorld,
} from '../testing/chat-world.js';
import type { ConversationReadService } from './conversation-read.service.js';

// chat B2 — API đọc trên MySQL 8.4 THẬT (PLAN chat 7.1, 7.3, 7.5): quan hệ (NBS-04…NBS-07, NBN-04), tin theo con trỏ (NBS-11), danh sách theo vai trò, tìm, chưa đọc,
// nhãn trả lời, mốc đã đọc (NBN-05, NBN-06, NBN-08…NBN-12, NBN-14, NBN-15), phạm vi (QCH-04, QCH-05, QCH-10, QCH-11 phần I). Ca HTTP (401, 403, 404 cùng thân, no-store) ở
// test/chat-read.e2e-spec.ts. Dữ liệu dựng bằng fixture; hội thoại chỉ được tạo qua lõi gửi thật (trừ NBN-11 cần 120 hội thoại, ghi rõ ở ca).
let db: DataSource;
let w: ChatWorld;
let sender: SendMessageService;
let reader: ConversationReadService;
useIntegrationHooks((d) => {
  db = d;
});
beforeEach(async () => {
  w = await buildChatWorld(db);
  sender = buildSendService(db);
  reader = buildReadService(db);
});

const toDoctor = (doctor: ChatActor) => ({ bacSiId: doctor.taiKhoanId });
const say = async (
  actor: ChatActor,
  hoiThoaiId: string,
  noiDung = 'Trả lời',
) => {
  const outcome = await sender.send({
    actor,
    target: { hoiThoaiId },
    noiDung,
    maGui: newSendId(),
  });
  if (outcome.kind !== 'Sent') throw new Error(`gửi lỗi: ${outcome.kind}`);
  return outcome.tinNhan.tinNhanId;
};
const list = (
  actor: ChatActor,
  query: Partial<Parameters<ConversationReadService['list']>[1]> = {},
) => reader.list(userOf(actor), { loc: 'tat-ca', limit: 20, ...query });
const detail = (actor: ChatActor, id: string) =>
  reader.detail(userOf(actor), id);
const messages = (
  actor: ChatActor,
  id: string,
  query: { truoc?: string; sau?: string; limit?: number } = {},
) => reader.messages(userOf(actor), id, { limit: 30, ...query });
const markRead = (actor: ChatActor, id: string, tinNhanId: string) =>
  reader.markRead(userOf(actor), id, tinNhanId);
const unread = async (actor: ChatActor) =>
  (await reader.unreadCount(userOf(actor))).soHoiThoaiChuaDoc;
const ids = (page: { items: { id: string }[] }) => page.items.map((i) => i.id);

/** Lỗi API của một lời gọi: trạng thái và mã (bắt `AppException`). */
async function failure(
  call: Promise<unknown>,
): Promise<{ status: number; maLoi: string; body: unknown }> {
  try {
    await call;
  } catch (error) {
    if (error instanceof AppException)
      return {
        status: error.getStatus(),
        maLoi: error.maLoi,
        body: error.getResponse(),
      };
    throw error;
  }
  throw new Error('mong lỗi, nhận thành công');
}
const markOf = async (taiKhoanId: string, hoiThoaiId: string) => {
  const rows = (await db.query(
    'SELECT tin_nhan_cuoi_da_doc_id AS moc FROM tai_khoan_hoi_thoai WHERE tai_khoan_id = ? AND hoi_thoai_id = ?',
    [taiKhoanId, hoiThoaiId],
  )) as { moc: string | null }[];
  return rows[0] === undefined
    ? undefined
    : rows[0].moc === null
      ? null
      : String(rows[0].moc);
};

describe('chat B2 — trạng thái quan hệ (Q16)', () => {
  const doctorAProfile = () => w.accounts.doctorA.profile;
  // Bệnh nhân C chưa có lịch nào; mỗi trạng thái một lịch riêng ở một ngày riêng rồi xoá trước trạng thái sau
  async function relationshipWith(status: TrangThaiLichHen, ngay: string) {
    await db.query('DELETE FROM lich_hen WHERE benh_nhan_id = ?', [
      w.patientC.taiKhoanId,
    ]);
    await bookAppointment(
      db,
      doctorAProfile(),
      w.patientC.taiKhoanId,
      status,
      ngay,
    );
    return conversationRelationship();
  }
  let conversation: string;
  async function conversationRelationship() {
    const asPatient = await detail(w.patientC, conversation);
    const asDoctor = await detail(w.doctorA, conversation);
    const listed = (await list(w.doctorA)).items.find(
      (i) => i.id === conversation,
    );
    return [asPatient.quanHe, asDoctor.quanHe, listed?.quanHe];
  }
  beforeEach(async () => {
    ({ hoiThoaiId: conversation } = await openConversation(
      sender,
      w.patientC,
      toDoctor(w.doctorA),
    ));
  });

  it('NBS-04, NBN-04: lịch DaXacNhan, DaTiepDon, HoanThanh (từng cái) ⇒ DaTungKham ở chi tiết của Bệnh nhân, của Bác sĩ và ở danh sách', async () => {
    expect(await conversationRelationship()).toEqual([
      'ChuaTungKham',
      'ChuaTungKham',
      'ChuaTungKham',
    ]);
    let day = 10;
    for (const status of ['DaXacNhan', 'DaTiepDon', 'HoanThanh'] as const) {
      day += 1;
      expect(
        await relationshipWith(status, `2026-11-${String(day)}`),
        status,
      ).toEqual(['DaTungKham', 'DaTungKham', 'DaTungKham']);
    }
  });

  it('NBS-05, NBN-04: chỉ có lịch ChoThanhToan, DaHuy, DaDoiLich, VangMat (từng cái) ⇒ ChuaTungKham', async () => {
    let day = 10;
    for (const status of [
      'ChoThanhToan',
      'DaHuy',
      'DaDoiLich',
      'VangMat',
    ] as const) {
      day += 1;
      expect(
        await relationshipWith(status, `2026-11-${String(day)}`),
        status,
      ).toEqual(['ChuaTungKham', 'ChuaTungKham', 'ChuaTungKham']);
    }
  });

  it('NBS-06: lịch của hồ sơ NGƯỜI THÂN cùng tài khoản ⇒ DaTungKham', async () => {
    // Bệnh nhân "đặt cho người thân" của thế giới chỉ có một lịch DaXacNhan với bác sĩ A, đặt cho người thân
    const relativeOwner: ChatActor = {
      vaiTro: 'BenhNhan',
      taiKhoanId: w.accounts.relativeA.account.taiKhoanId,
    };
    const own = (await db.query(
      'SELECT COUNT(*) AS n FROM lich_hen WHERE benh_nhan_id = ? AND ho_so_nguoi_than_id IS NULL',
      [relativeOwner.taiKhoanId],
    )) as { n: string }[];
    expect(Number(own[0]?.n)).toBe(0);
    const { hoiThoaiId } = await openConversation(
      sender,
      relativeOwner,
      toDoctor(w.doctorA),
    );
    expect((await detail(relativeOwner, hoiThoaiId)).quanHe).toBe('DaTungKham');
  });

  it('NBS-07: lịch DaXacNhan với bác sĩ KHÁC ⇒ ChuaTungKham với bác sĩ này; DaTungKham với bác sĩ kia', async () => {
    await bookAppointment(
      db,
      w.accounts.doctorB.profile,
      w.patientC.taiKhoanId,
      'DaXacNhan',
      '2026-11-20',
    );
    expect((await detail(w.patientC, conversation)).quanHe).toBe(
      'ChuaTungKham',
    );
    const { hoiThoaiId: withB } = await openConversation(
      sender,
      w.patientC,
      toDoctor(w.doctorB),
    );
    expect((await detail(w.patientC, withB)).quanHe).toBe('DaTungKham');
  });

  it('hộp thư chung không có quan hệ, không banner; hội thoại bác sĩ có banner ở cả hai phía', async () => {
    const { hoiThoaiId: inbox } = await openConversation(sender, w.patientC, {
      chiNhanhId: w.branchA,
    });
    const inboxDetail = await detail(w.patientC, inbox);
    expect([inboxDetail.quanHe, inboxDetail.banner]).toEqual([null, false]);
    expect((await detail(w.patientC, conversation)).banner).toBe(true);
    expect((await detail(w.doctorA, conversation)).banner).toBe(true);
  });
});

describe('chat B2 — tin theo con trỏ', () => {
  it('NBS-11: 45 tin; trang mới nhất 30 rồi `truoc` 15; id tăng dần, không trùng, không thiếu; `sau` đọc tiếp lên', async () => {
    const { hoiThoaiId, tinNhanId: first } = await openConversation(
      sender,
      w.patientA,
      toDoctor(w.doctorA),
    );
    const more = await insertMessages(db, hoiThoaiId, w.doctorA.taiKhoanId, 44);
    const all = [first, ...more];
    expect(all).toHaveLength(45);

    const newest = await messages(w.patientA, hoiThoaiId);
    expect(newest.items).toHaveLength(30);
    expect(newest.coThem).toBe(true);
    expect(ids(newest)).toEqual(all.slice(15));
    const older = await messages(w.patientA, hoiThoaiId, {
      truoc: newest.items[0]?.id,
    });
    expect(older.items).toHaveLength(15);
    expect(older.coThem).toBe(false);
    expect([...ids(older), ...ids(newest)]).toEqual(all);

    const after = await messages(w.patientA, hoiThoaiId, {
      sau: all[9],
      limit: 20,
    });
    expect(ids(after)).toEqual(all.slice(10, 30));
    expect(after.coThem).toBe(true);
    const tail = await messages(w.patientA, hoiThoaiId, { sau: all[39] });
    expect([ids(tail), tail.coThem]).toEqual([all.slice(40), false]);

    const both = await failure(
      messages(w.patientA, hoiThoaiId, { truoc: all[5], sau: all[1] }),
    );
    expect([both.status, both.maLoi]).toEqual([400, 'DU_LIEU_KHONG_HOP_LE']);
  });

  it('tin của người khác không trả `maGui`; tin của chính mình trả `maGui` (gửi lại cùng mã)', async () => {
    const { hoiThoaiId } = await openConversation(
      sender,
      w.patientA,
      toDoctor(w.doctorA),
    );
    await say(w.doctorA, hoiThoaiId);
    const [mine, theirs] = (await messages(w.patientA, hoiThoaiId)).items;
    expect(mine?.laCuaToi).toBe(true);
    expect(mine?.maGui).toMatch(/^[0-9a-f-]{36}$/);
    expect([theirs?.laCuaToi, theirs?.maGui]).toEqual([false, null]);
    expect(theirs?.nguoiGui).toEqual({
      vaiTro: 'BacSi',
      tenHienThi: 'BS. Bác sĩ A một',
    });
  });
});

describe('chat B2 — danh sách theo vai trò và phạm vi', () => {
  it('NBN-05, QCH-05: Lễ tân chỉ thấy hộp thư chung CHI NHÁNH MÌNH; không hội thoại bác sĩ; không hộp thư chi nhánh khác', async () => {
    const inboxA = await openConversation(sender, w.patientA, {
      chiNhanhId: w.branchA,
    });
    const inboxB = await openConversation(sender, w.patientB, {
      chiNhanhId: w.branchB,
    });
    const doctorConv = await openConversation(
      sender,
      w.patientA,
      toDoctor(w.doctorA),
    );
    expect(ids(await list(w.receptionistA))).toEqual([inboxA.hoiThoaiId]);
    expect(ids(await list(w.receptionistB))).toEqual([inboxB.hoiThoaiId]);
    for (const id of [inboxB.hoiThoaiId, doctorConv.hoiThoaiId]) {
      const res = await failure(detail(w.receptionistA, id));
      expect([res.status, res.maLoi], id).toEqual([404, 'KHONG_TIM_THAY']);
    }
  });

  it('NBN-01, QCH-04: Bác sĩ chỉ thấy hội thoại mình là thành viên; bác sĩ khác nhận 404 cùng thân ở chi tiết, tin, đánh dấu', async () => {
    const mine = await openConversation(
      sender,
      w.patientA,
      toDoctor(w.doctorA),
    );
    const other = await openConversation(
      sender,
      w.patientA,
      toDoctor(w.doctorB),
    );
    await openConversation(sender, w.patientA, { chiNhanhId: w.branchA });
    expect(ids(await list(w.doctorA))).toEqual([mine.hoiThoaiId]);
    const results = [
      await failure(detail(w.doctorA, other.hoiThoaiId)),
      await failure(messages(w.doctorA, other.hoiThoaiId)),
      await failure(markRead(w.doctorA, other.hoiThoaiId, other.tinNhanId)),
    ];
    for (const r of results)
      expect([r.status, r.body]).toEqual([404, results[0]?.body]);
    expect(
      await markOf(w.doctorA.taiKhoanId, other.hoiThoaiId),
    ).toBeUndefined();
  });

  it('Bệnh nhân: sắp theo tin cuối mới nhất; lọc `bac-si`, `le-tan`; phân trang theo con trỏ không trùng, không thiếu', async () => {
    const a = await openConversation(sender, w.patientA, toDoctor(w.doctorA));
    const b = await openConversation(sender, w.patientA, {
      chiNhanhId: w.branchA,
    });
    const c = await openConversation(sender, w.patientA, toDoctor(w.doctorB));
    await say(w.doctorA, a.hoiThoaiId); // a có tin mới nhất
    expect(ids(await list(w.patientA))).toEqual([
      a.hoiThoaiId,
      c.hoiThoaiId,
      b.hoiThoaiId,
    ]);
    expect(ids(await list(w.patientA, { loc: 'bac-si' }))).toEqual([
      a.hoiThoaiId,
      c.hoiThoaiId,
    ]);
    expect(ids(await list(w.patientA, { loc: 'le-tan' }))).toEqual([
      b.hoiThoaiId,
    ]);
    const first = await list(w.patientA, { limit: 2 });
    expect(ids(first)).toEqual([a.hoiThoaiId, c.hoiThoaiId]);
    expect(first.truocTiepTheo).not.toBeNull();
    const second = await list(w.patientA, {
      limit: 2,
      truoc: first.truocTiepTheo ?? undefined,
    });
    expect([ids(second), second.truocTiepTheo]).toEqual([[b.hoiThoaiId], null]);
  });

  it('bộ lọc `bac-si`, `le-tan` chỉ cho Bệnh nhân; `q` không cho Bệnh nhân ⇒ 400 kèm trường', async () => {
    for (const actor of [w.doctorA, w.receptionistA]) {
      const res = await failure(list(actor, { loc: 'bac-si' }));
      expect([res.status, res.body]).toMatchObject([
        400,
        { loi: [{ truong: 'loc', ma: 'IS_IN' }] },
      ]);
    }
    const res = await failure(list(w.patientA, { q: 'abc' }));
    expect([res.status, res.body]).toMatchObject([
      400,
      { loi: [{ truong: 'q', ma: 'TRUONG_KHONG_DUOC_PHEP' }] },
    ]);
  });

  it('NBN-06, QCH-05: Lễ tân tìm theo họ tên (có, không dấu, `đ`), SĐT, email; chỉ trong chi nhánh mình', async () => {
    await db.query(
      "UPDATE tai_khoan SET ho_ten = 'Đặng Thị Hoà' WHERE tai_khoan_id IN (?)",
      [[w.patientA.taiKhoanId, w.patientB.taiKhoanId]],
    );
    const inA = await openConversation(sender, w.patientA, {
      chiNhanhId: w.branchA,
    });
    await openConversation(sender, w.patientB, { chiNhanhId: w.branchB }); // cùng tên, chi nhánh khác
    await openConversation(sender, w.patientC, { chiNhanhId: w.branchA }); // khác tên
    const [{ so_dien_thoai: phone, email }] = (await db.query(
      'SELECT so_dien_thoai, email FROM tai_khoan WHERE tai_khoan_id = ?',
      [w.patientA.taiKhoanId],
    )) as { so_dien_thoai: string; email: string }[];
    for (const q of [
      'Đặng',
      'đặng',
      'dang',
      'DANG thi hoa',
      phone,
      phone.slice(5),
      email,
      `${email.split('@')[0] ?? ''}@`,
    ])
      expect(ids(await list(w.receptionistA, { q })), q).toEqual([
        inA.hoiThoaiId,
      ]);
    expect(ids(await list(w.receptionistA, { q: 'khong-co-ai' }))).toEqual([]);
  });

  it('NBN-12: lọc `chua-doc` chỉ hội thoại có tin chưa đọc; Bác sĩ tìm được theo họ tên, KHÔNG theo SĐT hay email', async () => {
    const a = await openConversation(sender, w.patientA, toDoctor(w.doctorA));
    const b = await openConversation(sender, w.patientB, toDoctor(w.doctorA));
    await markRead(w.doctorA, b.hoiThoaiId, b.tinNhanId);
    expect(ids(await list(w.doctorA, { loc: 'chua-doc' }))).toEqual([
      a.hoiThoaiId,
    ]);
    expect(ids(await list(w.doctorA))).toEqual([b.hoiThoaiId, a.hoiThoaiId]);

    const [{ so_dien_thoai: phone, email }] = (await db.query(
      'SELECT so_dien_thoai, email FROM tai_khoan WHERE tai_khoan_id = ?',
      [w.patientA.taiKhoanId],
    )) as { so_dien_thoai: string; email: string }[];
    expect(ids(await list(w.doctorA, { q: 'chỉ A' }))).toEqual([a.hoiThoaiId]);
    expect(ids(await list(w.doctorA, { q: phone }))).toEqual([]);
    expect(ids(await list(w.doctorA, { q: email }))).toEqual([]);
    expect(ids(await list(w.doctorA, { q: 'chỉ A', loc: 'chua-doc' }))).toEqual(
      [a.hoiThoaiId],
    );
  });

  it('NBN-14: Lễ tân đổi chi nhánh ⇒ hội thoại chi nhánh cũ 404 NGAY ở yêu cầu sau; chi nhánh mới thấy được', async () => {
    const inA = await openConversation(sender, w.patientA, {
      chiNhanhId: w.branchA,
    });
    const inB = await openConversation(sender, w.patientB, {
      chiNhanhId: w.branchB,
    });
    expect((await detail(w.receptionistA, inA.hoiThoaiId)).id).toBe(
      inA.hoiThoaiId,
    );
    await db.query(
      'UPDATE le_tan SET chi_nhanh_id = ? WHERE tai_khoan_id = ?',
      [w.branchB, w.receptionistA.taiKhoanId],
    );
    expect(
      (await failure(detail(w.receptionistA, inA.hoiThoaiId))).status,
    ).toBe(404);
    expect(
      (await failure(markRead(w.receptionistA, inA.hoiThoaiId, inA.tinNhanId)))
        .status,
    ).toBe(404);
    expect((await detail(w.receptionistA, inB.hoiThoaiId)).id).toBe(
      inB.hoiThoaiId,
    );
    expect(ids(await list(w.receptionistA))).toEqual([inB.hoiThoaiId]);
  });
});

describe('chat B2 — chưa đọc, nhãn trả lời, mốc đã đọc', () => {
  it('NBN-08: tin cuối của Bệnh nhân ⇒ ChoTraLoi; của Lễ tân ⇒ DaTraLoi kèm tên (chính mình: "Bạn"); Bệnh nhân, Bác sĩ không có nhãn', async () => {
    const colleague = await new AdminFixtures(db).receptionist(
      w.accounts.branchA,
      { hoTen: 'Lễ tân A hai' },
    );
    const colleagueActor: ChatActor = {
      vaiTro: 'LeTan',
      taiKhoanId: colleague.account.taiKhoanId,
      chiNhanhId: w.branchA,
    };
    const { hoiThoaiId } = await openConversation(sender, w.patientA, {
      chiNhanhId: w.branchA,
    });
    const label = async (actor: ChatActor) => {
      const item = (await list(actor)).items[0];
      return [item?.trangThaiTraLoi, item?.traLoiBoi];
    };
    expect(await label(w.receptionistA)).toEqual(['ChoTraLoi', null]);
    await say(w.receptionistA, hoiThoaiId);
    expect(await label(w.receptionistA)).toEqual(['DaTraLoi', 'Bạn']);
    expect(await label(colleagueActor)).toEqual(['DaTraLoi', 'Lễ tân A']);
    expect(await label(w.patientA)).toEqual([null, null]);
    await say(w.patientA, hoiThoaiId);
    expect(await label(colleagueActor)).toEqual(['ChoTraLoi', null]);
  });

  it('NBN-09: Lễ tân chưa có dòng ⇒ chưa đọc = mọi tin của người khác; đọc ⇒ 0; đồng nghiệp trả lời ⇒ lại tăng', async () => {
    const colleague = await new AdminFixtures(db).receptionist(
      w.accounts.branchA,
      {},
    );
    const colleagueActor: ChatActor = {
      vaiTro: 'LeTan',
      taiKhoanId: colleague.account.taiKhoanId,
      chiNhanhId: w.branchA,
    };
    const { hoiThoaiId } = await openConversation(sender, w.patientA, {
      chiNhanhId: w.branchA,
    });
    const last = await say(w.patientA, hoiThoaiId);
    expect(
      await markOf(w.receptionistA.taiKhoanId, hoiThoaiId),
    ).toBeUndefined();
    expect((await list(w.receptionistA)).items[0]?.soTinChuaDoc).toBe(2);
    expect(await unread(w.receptionistA)).toBe(1);

    expect(await markRead(w.receptionistA, hoiThoaiId, last)).toEqual({
      tinNhanCuoiDaDocId: last,
    });
    expect(await markOf(w.receptionistA.taiKhoanId, hoiThoaiId)).toBe(last); // dòng thành viên mới của Lễ tân
    expect((await list(w.receptionistA)).items[0]?.soTinChuaDoc).toBe(0);
    expect(await unread(w.receptionistA)).toBe(0);

    await say(colleagueActor, hoiThoaiId);
    expect((await list(w.receptionistA)).items[0]?.soTinChuaDoc).toBe(1);
    expect(await unread(w.receptionistA)).toBe(1);
    expect((await list(colleagueActor)).items[0]?.soTinChuaDoc).toBe(2); // tin của chính đồng nghiệp đó không tính
  });

  it('NBN-10: tin do chính mình gửi không bao giờ là chưa đọc (cả khi chưa đánh dấu gì)', async () => {
    const { hoiThoaiId } = await openConversation(
      sender,
      w.patientA,
      toDoctor(w.doctorA),
    );
    await say(w.patientA, hoiThoaiId);
    await say(w.patientA, hoiThoaiId);
    expect(await markOf(w.patientA.taiKhoanId, hoiThoaiId)).toBeNull();
    expect((await list(w.patientA)).items[0]?.soTinChuaDoc).toBe(0);
    expect(await unread(w.patientA)).toBe(0);
    expect(ids(await list(w.patientA, { loc: 'chua-doc' }))).toEqual([]);
    expect((await list(w.doctorA)).items[0]?.soTinChuaDoc).toBe(3);
  });

  it('NBN-11: 150 tin chưa đọc ⇒ số trần 100; 120 hội thoại chưa đọc ⇒ số menu trần 100', async () => {
    const { hoiThoaiId } = await openConversation(
      sender,
      w.patientA,
      toDoctor(w.doctorA),
    );
    await insertMessages(db, hoiThoaiId, w.patientA.taiKhoanId, 149);
    expect((await list(w.doctorA)).items[0]?.soTinChuaDoc).toBe(100);
    expect(await unread(w.doctorA)).toBe(1);

    // 120 hộp thư chung chi nhánh A: chèn THẲNG (không qua lõi mở) chỉ để có đủ số hội thoại; cố ý không giữ bất biến "một hội thoại mỗi cặp" (IVC-01) ở ca này
    await db.query('SET SESSION cte_max_recursion_depth = 1000');
    await db.query(
      `INSERT INTO hoi_thoai (loai, chi_nhanh_id, nguoi_tao_id, thoi_diem_tao)
       WITH RECURSIVE seq (n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 120)
       SELECT 'BenhNhan_LeTan', ?, ?, '2026-11-02 08:00:00' FROM seq`,
      [w.branchA, w.patientB.taiKhoanId],
    );
    await db.query(
      `INSERT INTO tin_nhan (hoi_thoai_id, nguoi_gui_id, ma_gui, noi_dung, thoi_diem_gui)
       SELECT hoi_thoai_id, nguoi_tao_id, NULL, 'Tin thử', '2026-11-02 08:00:00' FROM hoi_thoai WHERE chi_nhanh_id = ?`,
      [w.branchA],
    );
    expect(await unread(w.receptionistA)).toBe(100);
    expect(
      (await list(w.receptionistA, { loc: 'chua-doc', limit: 50 })).items,
    ).toHaveLength(50);
  });

  it('NBN-15: đánh dấu bằng id CŨ hơn mốc ⇒ thành công, mốc không lùi; bằng mốc ⇒ không đổi; mới hơn ⇒ tiến tới', async () => {
    const { hoiThoaiId, tinNhanId: first } = await openConversation(
      sender,
      w.patientA,
      toDoctor(w.doctorA),
    );
    const second = await say(w.patientA, hoiThoaiId);
    const third = await say(w.patientA, hoiThoaiId);
    expect(await markRead(w.doctorA, hoiThoaiId, second)).toEqual({
      tinNhanCuoiDaDocId: second,
    });
    expect(await markRead(w.doctorA, hoiThoaiId, first)).toEqual({
      tinNhanCuoiDaDocId: second,
    });
    expect(await markRead(w.doctorA, hoiThoaiId, second)).toEqual({
      tinNhanCuoiDaDocId: second,
    });
    expect(await markOf(w.doctorA.taiKhoanId, hoiThoaiId)).toBe(second);
    expect((await list(w.doctorA)).items[0]?.soTinChuaDoc).toBe(1);
    expect(await markRead(w.doctorA, hoiThoaiId, third)).toEqual({
      tinNhanCuoiDaDocId: third,
    });
  });

  it('QCH-10: đánh dấu bằng id tin của hội thoại KHÁC (dù người xem thấy được hội thoại đó) ⇒ 404; mốc không đổi', async () => {
    const a = await openConversation(sender, w.patientA, toDoctor(w.doctorA));
    const b = await openConversation(sender, w.patientA, toDoctor(w.doctorB));
    await markRead(w.patientA, a.hoiThoaiId, a.tinNhanId);
    const later = await say(w.doctorB, b.hoiThoaiId);
    const res = await failure(markRead(w.patientA, a.hoiThoaiId, later));
    expect([res.status, res.maLoi]).toEqual([404, 'KHONG_TIM_THAY']);
    expect(await markOf(w.patientA.taiKhoanId, a.hoiThoaiId)).toBe(a.tinNhanId);
    const missing = await failure(
      markRead(w.patientA, a.hoiThoaiId, '999999999'),
    );
    expect(missing.status).toBe(404);
  });
});

describe('chat B2 — danh sách trắng theo vai trò (QCH-11, phần I)', () => {
  it('QCH-11: Bệnh nhân không nhận họ tên hay id Lễ tân; Bác sĩ không nhận SĐT; Lễ tân nhận họ tên và SĐT; không ai nhận email, ngày sinh, địa chỉ, tai_khoan_id', async () => {
    const inbox = await openConversation(sender, w.patientA, {
      chiNhanhId: w.branchA,
    });
    await say(w.receptionistA, inbox.hoiThoaiId);
    const doc = await openConversation(sender, w.patientA, toDoctor(w.doctorA));
    await say(w.doctorA, doc.hoiThoaiId);
    const accounts = (await db.query(
      'SELECT tai_khoan_id AS id, ho_ten AS hoTen, so_dien_thoai AS sdt, email, dia_chi AS diaChi FROM tai_khoan WHERE tai_khoan_id IN (?)',
      [
        [
          w.patientA.taiKhoanId,
          w.receptionistA.taiKhoanId,
          w.doctorA.taiKhoanId,
        ],
      ],
    )) as {
      id: string;
      hoTen: string;
      sdt: string;
      email: string;
      diaChi: string;
    }[];
    const byId = new Map(accounts.map((a) => [String(a.id), a]));
    const patient = byId.get(w.patientA.taiKhoanId);
    const reception = byId.get(w.receptionistA.taiKhoanId);
    const viewOf = async (actor: ChatActor, convs: string[]) =>
      JSON.stringify([
        await list(actor),
        ...(await Promise.all(convs.map((c) => detail(actor, c)))),
        ...(await Promise.all(convs.map((c) => messages(actor, c)))),
      ]);

    const patientView = await viewOf(w.patientA, [
      inbox.hoiThoaiId,
      doc.hoiThoaiId,
    ]);
    expect(patientView).toContain('Lễ tân · Chi nhánh A');
    expect(patientView).not.toContain(reception?.hoTen);
    expect(patientView).not.toContain(`"${w.receptionistA.taiKhoanId}"`);

    const doctorView = await viewOf(w.doctorA, [doc.hoiThoaiId]);
    expect(doctorView).toContain(patient?.hoTen);
    expect(doctorView).not.toContain(patient?.sdt);
    expect(doctorView).not.toContain('soDienThoai');

    const receptionView = await viewOf(w.receptionistA, [inbox.hoiThoaiId]);
    expect(receptionView).toContain(patient?.hoTen);
    expect(receptionView).toContain(patient?.sdt);

    for (const view of [patientView, doctorView, receptionView]) {
      for (const a of accounts) {
        expect(view).not.toContain(a.email);
        expect(view).not.toContain(a.diaChi);
      }
      expect(view).not.toMatch(
        /taiKhoanId|tai_khoan_id|ngaySinh|email|diaChi|nguoiTaoId|bacSiId/,
      );
    }
    const item = (await list(w.receptionistA)).items[0];
    expect(Object.keys(item ?? {}).sort()).toEqual([
      'doiTac',
      'id',
      'loai',
      'quanHe',
      'soTinChuaDoc',
      'tinCuoi',
      'traLoiBoi',
      'trangThaiTraLoi',
    ]);
    expect(Object.keys(item?.doiTac ?? {}).sort()).toEqual([
      'soDienThoai',
      'tenHienThi',
      'vaiTro',
    ]);
    expect(
      Object.keys((await list(w.doctorA)).items[0]?.doiTac ?? {}).sort(),
    ).toEqual(['tenHienThi', 'vaiTro']);
  });

  it('coTheGui (Q3): bác sĩ ngưng hoạt động ⇒ Bệnh nhân đọc được nhưng không gửi được; Bệnh nhân bị khoá ⇒ Bác sĩ, Lễ tân không gửi được; hộp thư chung luôn gửi được với Bệnh nhân', async () => {
    const doc = await openConversation(sender, w.patientA, toDoctor(w.doctorA));
    const inbox = await openConversation(sender, w.patientA, {
      chiNhanhId: w.branchA,
    });
    const sendState = async (actor: ChatActor, id: string) => {
      const d = await detail(actor, id);
      return [d.coTheGui, d.lyDoKhongGui];
    };
    expect(await sendState(w.patientA, doc.hoiThoaiId)).toEqual([true, null]);
    await db.query(
      "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
      [w.doctorA.taiKhoanId],
    );
    expect(await sendState(w.patientA, doc.hoiThoaiId)).toEqual([
      false,
      'CHAT_NGUOI_NHAN_KHONG_HOAT_DONG',
    ]);
    expect(await sendState(w.patientA, inbox.hoiThoaiId)).toEqual([true, null]);
    expect((await messages(w.patientA, doc.hoiThoaiId)).items).toHaveLength(1);

    await db.query(
      "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
      [w.patientA.taiKhoanId],
    );
    expect(await sendState(w.receptionistA, inbox.hoiThoaiId)).toEqual([
      false,
      'CHAT_NGUOI_NHAN_KHONG_HOAT_DONG',
    ]);
  });
});
