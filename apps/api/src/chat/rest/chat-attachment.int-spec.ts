import { mkdtemp, readFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ChatFileCleanupService } from '../attachments/chat-file-cleanup.service.js';
import { LocalDiskChatFileStore } from '../attachments/local-disk-chat-file-store.js';
import type { ChatActor } from '../core/chat-access.policy.js';
import {
  MessageRepository,
  type AttachedFile,
} from '../core/message.repository.js';
import type { SendMessageService } from '../core/send-message.service.js';
import {
  animatedWebp,
  brokenJpeg,
  fakePdf,
  hugePng,
  imageWithGps,
  noisyPng,
  pdf,
  storedKeys,
  windowsExecutable,
} from '../testing/chat-files.js';
import {
  buildChatSendService,
  buildChatWorld,
  buildReadService,
  buildSendService,
  newSendId,
  openConversation,
  userOf,
  type ChatWorld,
} from '../testing/chat-world.js';
import type { ChatSendService } from './chat-send.service.js';

// chat B4 — gửi tin kèm tệp trên MySQL 8.4 THẬT và kho đĩa thật (thư mục tạm riêng mỗi ca; PLAN chat 7.7, 7.5, 7.10):
// TEP-01…TEP-04, TEP-08, TEP-11, TEP-13, QCH-12 (phần tệp), BCH-01 (phần lõi). Ca HTTP (multipart, 413, hai tệp, tải xuống, 503, log) ở test/chat-attachment.e2e-spec.ts.
let db: DataSource;
let logs: string[];
let w: ChatWorld;
let root: string;
let store: LocalDiskChatFileStore;
let core: SendMessageService;
let rest: ChatSendService;

useIntegrationHooks((d, l) => {
  db = d;
  logs = l;
});
beforeEach(async () => {
  w = await buildChatWorld(db);
  root = await mkdtemp(join(tmpdir(), 'clinix-chat-b4-'));
  store = new LocalDiskChatFileStore(root);
  core = buildSendService(db);
  rest = buildChatSendService(db, core, store);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

type Target =
  { hoiThoaiId: string } | { bacSiId: string } | { chiNhanhId: string };
const sendFile = (
  actor: ChatActor,
  target: Target,
  data: Buffer,
  name = 'tep.bin',
  noiDung: unknown = 'Kèm tệp',
  maGui: unknown = newSendId(),
  service: ChatSendService = rest,
) =>
  service.sendWithFile(userOf(actor), target, noiDung, maGui, {
    buffer: data,
    originalname: name,
  });
async function failure(call: Promise<unknown>) {
  try {
    await call;
  } catch (error) {
    if (error instanceof AppException)
      return { status: error.getStatus(), maLoi: error.maLoi };
    throw error;
  }
  throw new Error('mong lỗi, nhận thành công');
}
const count = async (sql: string, params: unknown[] = []) =>
  Number(((await db.query(sql, params)) as { n: string }[])[0]?.n ?? 0);
const messageCount = () => count('SELECT COUNT(*) AS n FROM tin_nhan');
interface FileRow {
  khoa: string | null;
  ten: string | null;
  loai: string | null;
  dungLuong: number | null;
  noiDung: string;
}
const fileRow = async (tinNhanId: string): Promise<FileRow> => {
  const rows = (await db.query(
    'SELECT tep_dinh_kem AS khoa, tep_ten_goc AS ten, tep_loai AS loai, tep_dung_luong AS dungLuong, noi_dung AS noiDung FROM tin_nhan WHERE tin_nhan_id = ?',
    [tinNhanId],
  )) as FileRow[];
  return rows[0]!;
};
const storedBytes = (key: string) => readFile(join(root, ...key.split('/')));

describe('chat B4 — gửi tin kèm ảnh (TEP-01, TEP-02)', () => {
  it.each(['jpeg', 'png', 'webp'] as const)(
    'TEP-01: %s có EXIF toạ độ ⇒ 201; tệp TRONG KHO không còn EXIF; bốn cột tệp đúng; thân trả về có tep',
    async (format) => {
      const res = await sendFile(
        w.patientC,
        { bacSiId: w.doctorA.taiKhoanId },
        await imageWithGps(format),
        `anh.${format === 'jpeg' ? 'jpg' : format}`,
      );
      expect(res.status).toBe(201);
      const row = await fileRow(res.body.tinNhan.id);
      const bytes = await storedBytes(row.khoa!);
      expect((await sharp(bytes).metadata()).exif).toBeUndefined();
      expect(bytes.includes(Buffer.from('clinix-test-exif'))).toBe(false);
      expect(bytes.length).toBeLessThanOrEqual(2 * 1024 * 1024);
      expect(Number(row.dungLuong)).toBe(bytes.length);
      expect(row.loai).toBe(`image/${format}`);
      expect(res.body.tinNhan.tep).toEqual({
        ten: row.ten,
        loai: row.loai,
        dungLuong: bytes.length,
      });
      expect(await storedKeys(root)).toEqual([row.khoa]);
    },
  );

  it('TEP-02: ảnh trên 2 MB ⇒ lưu ≤ 2 MB dạng WebP, tên đổi đuôi .webp; trên 25 megapixel ⇒ 400, không tệp, không tin', async () => {
    const res = await sendFile(
      w.patientC,
      { bacSiId: w.doctorA.taiKhoanId },
      await noisyPng(),
      'chup.png',
    );
    const row = await fileRow(res.body.tinNhan.id);
    expect([row.loai, row.ten]).toEqual(['image/webp', 'chup.webp']);
    expect(Number(row.dungLuong)).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(row.khoa!.endsWith('.webp')).toBe(true);

    const before = await messageCount();
    expect(
      await failure(
        sendFile(
          w.patientC,
          { bacSiId: w.doctorA.taiKhoanId },
          await hugePng(),
          'lon.png',
        ),
      ),
    ).toEqual({ status: 400, maLoi: 'CHAT_TEP_KHONG_HOP_LE' });
    expect(await messageCount()).toBe(before);
    expect(await storedKeys(root)).toEqual([row.khoa]);
  }, 60_000);
});

describe('chat B4 — tệp sai và PDF (TEP-03, TEP-04)', () => {
  it.each([
    [
      'tệp thực thi đổi đuôi',
      () => Promise.resolve(windowsExecutable()),
      'anh.jpg',
    ],
    ['ảnh động', animatedWebp, 'dong.webp'],
    ['ảnh hỏng', () => Promise.resolve(brokenJpeg()), 'hong.jpg'],
  ])(
    'TEP-03: %s ⇒ 400 CHAT_TEP_KHONG_HOP_LE; không tệp trong kho, không tin, không hội thoại mới',
    async (_case, make, name) => {
      expect(
        await failure(
          sendFile(
            w.patientC,
            { bacSiId: w.doctorA.taiKhoanId },
            await make(),
            name,
          ),
        ),
      ).toEqual({ status: 400, maLoi: 'CHAT_TEP_KHONG_HOP_LE' });
      expect(await messageCount()).toBe(0);
      expect(await count('SELECT COUNT(*) AS n FROM hoi_thoai')).toBe(0);
      expect(await storedKeys(root)).toEqual([]);
    },
  );

  it('TEP-04: PDF đúng ⇒ nhận, byte trong kho GIỐNG HỆT byte gửi; PDF giả ⇒ 400, không tệp; đúng 10 MB ⇒ nhận', async () => {
    const source = pdf(20_000);
    const res = await sendFile(
      w.patientC,
      { chiNhanhId: w.branchA },
      source,
      'Đơn thuốc.pdf',
    );
    const row = await fileRow(res.body.tinNhan.id);
    expect([row.loai, row.ten]).toEqual(['application/pdf', 'Đơn thuốc.pdf']);
    expect(await storedBytes(row.khoa!)).toEqual(source);

    expect(
      await failure(
        sendFile(w.patientC, { chiNhanhId: w.branchA }, fakePdf(), 'gia.pdf'),
      ),
    ).toEqual({ status: 400, maLoi: 'CHAT_TEP_KHONG_HOP_LE' });
    expect(await storedKeys(root)).toEqual([row.khoa]);

    const big = await sendFile(
      w.patientC,
      { chiNhanhId: w.branchA },
      pdf(10 * 1024 * 1024),
      'lon.pdf',
    );
    expect(Number((await fileRow(big.body.tinNhan.id)).dungLuong)).toBe(
      10 * 1024 * 1024,
    );
  });
});

describe('chat B4 — xoá tệp khi không thành tin mới (TEP-08)', () => {
  it('TEP-08: giao dịch gửi lỗi (chèn tin ném) ⇒ lỗi trả ra, tệp vừa ghi bị xoá, không tin; không còn tệp tạm', async () => {
    class FailingInsert extends MessageRepository {
      override insert(): Promise<string> {
        return Promise.reject(new Error('mất kết nối giả'));
      }
    }
    const broken = buildChatSendService(
      db,
      buildSendService(db, { messages: new FailingInsert() }),
      store,
    );
    await expect(
      sendFile(
        w.patientC,
        { bacSiId: w.doctorA.taiKhoanId },
        pdf(),
        'a.pdf',
        'x',
        newSendId(),
        broken,
      ),
    ).rejects.toThrow();
    expect(await messageCount()).toBe(0);
    expect(await storedKeys(root)).toEqual([]);
  });

  it('TEP-08: bị từ chối DƯỚI KHOÁ sau khi đã ghi tệp (bác sĩ bị khoá giữa lúc kiểm trước và lúc gửi) ⇒ 409, tệp bị xoá', async () => {
    const opened = await openConversation(core, w.patientC, {
      bacSiId: w.doctorA.taiKhoanId,
    });
    // Kiểm trước cho qua, rồi bác sĩ bị khoá ngay trước khi lõi gửi chạy (mô phỏng chạy đua)
    const realSend = core.send.bind(core);
    vi.spyOn(core, 'send').mockImplementation(async (input) => {
      await db.query(
        'UPDATE tai_khoan SET trang_thai = ? WHERE tai_khoan_id = ?',
        ['NgungHoatDong', w.doctorA.taiKhoanId],
      );
      return realSend(input);
    });
    expect(
      await failure(
        sendFile(w.patientC, { hoiThoaiId: opened.hoiThoaiId }, pdf(), 'a.pdf'),
      ),
    ).toEqual({ status: 409, maLoi: 'CHAT_NGUOI_NHAN_KHONG_HOAT_DONG' });
    expect(await messageCount()).toBe(1);
    expect(await storedKeys(root)).toEqual([]);
  });

  it('TEP-08: gửi lại cùng mã gửi ⇒ 200 đúng thân lần đầu; KHÔNG xử lý, KHÔNG ghi tệp mới (chỉ còn một tệp)', async () => {
    const maGui = newSendId();
    const target = { bacSiId: w.doctorA.taiKhoanId };
    const first = await sendFile(
      w.patientC,
      target,
      pdf(),
      'a.pdf',
      'Kết quả',
      maGui,
    );
    const again = await sendFile(
      w.patientC,
      target,
      pdf(),
      'a.pdf',
      'Kết quả',
      maGui,
    );
    expect([first.status, again.status]).toEqual([201, 200]);
    expect(again.body).toEqual(first.body);
    expect(await messageCount()).toBe(1);
    expect((await storedKeys(root)).length).toBe(1);
  });

  it('TEP-08: gửi lại cùng mã gửi chạy đua (kiểm trước chưa thấy tin cũ, lõi dưới khoá thấy) ⇒ 200 tin cũ, tệp thứ hai bị xoá', async () => {
    const maGui = newSendId();
    const target = { bacSiId: w.doctorA.taiKhoanId };
    const first = await sendFile(
      w.patientC,
      target,
      pdf(),
      'a.pdf',
      'Kết quả',
      maGui,
    );
    vi.spyOn(core, 'precheck').mockResolvedValue({ kind: 'Proceed' });
    const again = await sendFile(
      w.patientC,
      target,
      pdf(),
      'a.pdf',
      'Kết quả',
      maGui,
    );
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    const keys = await storedKeys(root);
    expect(keys).toEqual([(await fileRow(first.body.tinNhan.id)).khoa]);
  });

  it('TEP-08: cùng mã gửi nhưng khác chữ, hay lần đầu là tin chữ ⇒ 409 CHAT_MA_GUI_DA_DUNG trước khi xử lý tệp', async () => {
    const maGui = newSendId();
    const target = { bacSiId: w.doctorA.taiKhoanId };
    await sendFile(w.patientC, target, pdf(), 'a.pdf', 'Lần đầu', maGui);
    expect(
      await failure(
        sendFile(w.patientC, target, pdf(), 'a.pdf', 'Khác chữ', maGui),
      ),
    ).toEqual({ status: 409, maLoi: 'CHAT_MA_GUI_DA_DUNG' });
    const textId = newSendId();
    await rest.send(userOf(w.patientC), target, 'Tin chữ', textId);
    expect(
      await failure(
        sendFile(w.patientC, target, pdf(), 'a.pdf', 'Tin chữ', textId),
      ),
    ).toEqual({ status: 409, maLoi: 'CHAT_MA_GUI_DA_DUNG' });
    expect((await storedKeys(root)).length).toBe(1);
  });
});

describe('chat B4 — tin chỉ có tệp (TEP-13)', () => {
  it('TEP-13: không có chữ (trống hay không gửi trường) ⇒ nhận; trích dẫn ở danh sách là "[Ảnh]" hay "[Tệp PDF]", không lộ tên tệp', async () => {
    const image = await sendFile(
      w.patientC,
      { bacSiId: w.doctorA.taiKhoanId },
      await imageWithGps('png'),
      'bi-mat.png',
      '',
    );
    expect(image.status).toBe(201);
    expect(image.body.tinNhan.noiDung).toBe('');
    const reader = buildReadService(db);
    const listed = async (actor: ChatActor) =>
      (await reader.list(userOf(actor), { loc: 'tat-ca', limit: 20 })).items;
    expect((await listed(w.doctorA))[0]?.tinCuoi.trichDan).toBe('[Ảnh]');

    // Không gửi trường `noiDung` (gọi thẳng service: tham số mặc định của `sendFile` sẽ thay `undefined` bằng chữ)
    const file = await rest.sendWithFile(
      userOf(w.patientC),
      { chiNhanhId: w.branchA },
      undefined,
      newSendId(),
      { buffer: pdf(), originalname: 'bi-mat.pdf' },
    );
    expect((await fileRow(file.body.tinNhan.id)).noiDung).toBe('');
    expect((await listed(w.receptionistA))[0]?.tinCuoi.trichDan).toBe(
      '[Tệp PDF]',
    );
  });

  it('TEP-13, LOI-03: tin KHÔNG tệp vẫn bắt buộc có chữ (bỏ trường hay để trống ⇒ 400 NOI_DUNG_TRONG)', async () => {
    for (const noiDung of [undefined, '', '   '])
      expect(
        await failure(
          rest.send(
            userOf(w.patientC),
            { bacSiId: w.doctorA.taiKhoanId },
            noiDung,
            newSendId(),
          ),
        ),
      ).toEqual({ status: 400, maLoi: 'DU_LIEU_KHONG_HOP_LE' });
  });
});

describe('chat B4 — quyền (QCH-12, phần tệp)', () => {
  it('QCH-12: gửi tệp vào hội thoại không thấy được, đủ ba vai trò ⇒ 404 cùng thân; không tin, KHÔNG ghi tệp (kiểm trước khi xử lý)', async () => {
    const doctorChat = await openConversation(core, w.patientA, {
      bacSiId: w.doctorA.taiKhoanId,
    });
    const inboxA = await openConversation(core, w.patientA, {
      chiNhanhId: w.branchA,
    });
    const before = await messageCount();
    const outsiders: [ChatActor, string][] = [
      [w.patientB, doctorChat.hoiThoaiId],
      [w.doctorB, doctorChat.hoiThoaiId],
      [w.receptionistB, inboxA.hoiThoaiId],
      [w.receptionistA, doctorChat.hoiThoaiId],
    ];
    for (const [actor, hoiThoaiId] of outsiders)
      expect(
        await failure(sendFile(actor, { hoiThoaiId }, pdf(), 'a.pdf')),
      ).toEqual({ status: 404, maLoi: 'KHONG_TIM_THAY' });
    // Bác sĩ, Lễ tân không tự mở hội thoại bằng tệp (403), bác sĩ không có (404)
    expect(
      await failure(
        sendFile(w.doctorA, { bacSiId: w.doctorB.taiKhoanId }, pdf()),
      ),
    ).toEqual({ status: 403, maLoi: 'KHONG_DU_QUYEN' });
    expect(
      await failure(sendFile(w.patientC, { bacSiId: '999999' }, pdf())),
    ).toEqual({ status: 404, maLoi: 'KHONG_TIM_THAY' });
    expect(await messageCount()).toBe(before);
    expect(await storedKeys(root)).toEqual([]);
  });

  it('BCH-01: gửi tệp thành công và bị từ chối không ghi chữ của tin hay tên tệp vào log', async () => {
    await sendFile(
      w.patientC,
      { bacSiId: w.doctorA.taiKhoanId },
      pdf(),
      'TenRiengTu.pdf',
      'NoiDungRiengTu',
    );
    await failure(
      sendFile(
        w.patientC,
        { bacSiId: w.doctorA.taiKhoanId },
        fakePdf(),
        'TenRiengTu2.pdf',
        'NoiDungRiengTu2',
      ),
    );
    const joined = logs.join('\n');
    for (const secret of ['NoiDungRiengTu', 'TenRiengTu'])
      expect(joined).not.toContain(secret);
  });
});

describe('chat B4 — job dọn tệp mồ côi (TEP-11)', () => {
  it('TEP-11: chỉ xoá tệp mồ côi cũ hơn 24 giờ; tệp mồ côi mới và tệp được tham chiếu (dù cũ) giữ nguyên', async () => {
    const now = new Date('2026-11-27T10:00:00Z');
    const day = 24 * 60 * 60 * 1000;
    const setAge = (key: string, ms: number) => {
      const at = new Date(now.getTime() - ms);
      return utimes(join(root, ...key.split('/')), at, at);
    };
    const res = await sendFile(
      w.patientC,
      { bacSiId: w.doctorA.taiKhoanId },
      pdf(),
      'a.pdf',
    );
    const referenced = (await fileRow(res.body.tinNhan.id)).khoa!;
    const oldOrphan = (await store.write('pdf', pdf())).key;
    const edgeOrphan = (await store.write('png', Buffer.from('x'))).key;
    const newOrphan = (await store.write('jpg', Buffer.from('y'))).key;
    await setAge(referenced, 30 * day);
    await setAge(oldOrphan, day + 1000);
    await setAge(edgeOrphan, day - 1000);
    await setAge(newOrphan, 60 * 1000);

    const cleaner = new ChatFileCleanupService(db, store, {
      get: () => 'test',
    } as never);
    const result = await cleaner.cleanup(now);
    expect(result).toEqual({ checked: 2, removed: 1 });
    expect(await storedKeys(root)).toEqual(
      [referenced, edgeOrphan, newOrphan].sort(),
    );
  });

  it('TEP-11: nhiều hơn một lô (lô 500): tệp được tham chiếu ở mọi lô đều giữ', async () => {
    const now = new Date('2026-11-27T10:00:00Z');
    const old = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const opened = await openConversation(core, w.patientC, {
      bacSiId: w.doctorA.taiKhoanId,
    });
    const keys: string[] = [];
    for (let i = 0; i < 510; i++) {
      const { key } = await store.write('pdf', Buffer.from(String(i)));
      await utimes(join(root, ...key.split('/')), old, old);
      keys.push(key);
    }
    // Tham chiếu tệp số 0 (lô đầu) và tệp cuối (lô hai) bằng tin thật
    const tep = (k: string): AttachedFile => ({
      khoa: k,
      tenGoc: 'a.pdf',
      loai: 'application/pdf',
      dungLuong: 1,
    });
    for (const key of [keys[0]!, keys[509]!])
      await new MessageRepository().insert(db.manager, {
        hoiThoaiId: opened.hoiThoaiId,
        nguoiGuiId: w.patientC.taiKhoanId,
        maGui: newSendId(),
        noiDung: '',
        thoiDiemGui: new Date('2026-11-02T01:00:00Z'),
        tep: tep(key),
      });
    const cleaner = new ChatFileCleanupService(db, store, {
      get: () => 'test',
    } as never);
    expect(await cleaner.cleanup(now)).toEqual({ checked: 510, removed: 508 });
    expect(await storedKeys(root)).toEqual([keys[0]!, keys[509]!].sort());
  }, 60_000);

  it('TEP-11: job theo lịch tắt khi NODE_ENV=test (không xoá gì)', async () => {
    const { key } = await store.write('pdf', pdf());
    const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    await utimes(join(root, ...key.split('/')), old, old);
    const cleaner = new ChatFileCleanupService(db, store, {
      get: () => 'test',
    } as never);
    await cleaner.scheduled();
    expect(await storedKeys(root)).toEqual([key]);
  });
});
