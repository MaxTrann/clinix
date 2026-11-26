import type { DataSource } from 'typeorm';
import type { BacSi } from '../../admin/entities/bac-si.entity.js';
import type { ChiNhanh } from '../../admin/entities/chi-nhanh.entity.js';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { HoSoNguoiThan } from '../../admin/entities/ho-so-nguoi-than.entity.js';
import type { LichLamViec } from '../../admin/entities/lich-lam-viec.entity.js';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { AppException } from '../../common/errors/app.exception.js';
import { todayVN } from '../../common/time/time.js';
import type { ChatActor } from '../core/chat-access.policy.js';
import { ChatInternalError } from '../core/send-message.service.js';
import {
  buildChatSendService,
  buildChatWorld,
  buildReadService,
  buildSendService,
  buildStartService,
  newSendId,
  userOf,
  type ChatWorld,
} from '../testing/chat-world.js';
import type { ChatSendService } from './chat-send.service.js';

// chat B3 — gửi qua REST và bắt đầu hội thoại trên MySQL 8.4 THẬT (PLAN chat 7.1, 7.2, 7.3): NBS-02, NBS-09, NBS-10, NLE-01…NLE-05, NLE-07, NLE-10, NBN-13.
// Đồng hồ giả: T0 = 2026-11-02 08:00:00 giờ Việt Nam (int-hooks). Ca HTTP (201/200, 403, 404 cùng thân, 400 trường lạ, log) ở test/chat-send.e2e-spec.ts.
let db: DataSource;
let w: ChatWorld;
let rest: ChatSendService;
useIntegrationHooks((d) => {
  db = d;
});
beforeEach(async () => {
  w = await buildChatWorld(db);
  rest = buildChatSendService(db);
});

const count = async (sql: string, params: unknown[] = []) =>
  Number(((await db.query(sql, params)) as { n: string }[])[0]?.n ?? 0);
const conversations = () => count('SELECT COUNT(*) AS n FROM hoi_thoai');
const messages = () => count('SELECT COUNT(*) AS n FROM tin_nhan');
const post = (
  actor: ChatActor,
  target: { hoiThoaiId: string } | { bacSiId: string } | { chiNhanhId: string },
  noiDung: unknown = 'Xin chào',
  maGui: unknown = newSendId(),
) => rest.send(userOf(actor), target, noiDung, maGui);
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
const setStatus = (taiKhoanId: string, trangThai: string) =>
  db.query('UPDATE tai_khoan SET trang_thai = ? WHERE tai_khoan_id = ?', [
    trangThai,
    taiKhoanId,
  ]);

describe('chat B3 — gửi qua REST', () => {
  it('NBS-02: tin tiếp theo tới cùng bác sĩ dùng hội thoại cũ, không tạo mới; cả hai lần 201', async () => {
    const first = await post(w.patientC, { bacSiId: w.doctorA.taiKhoanId });
    const second = await post(w.patientC, { bacSiId: w.doctorA.taiKhoanId });
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(second.body.hoiThoaiId).toBe(first.body.hoiThoaiId);
    expect([await conversations(), await messages()]).toEqual([1, 2]);
    const third = await post(w.patientC, { hoiThoaiId: first.body.hoiThoaiId });
    expect(third.body.hoiThoaiId).toBe(first.body.hoiThoaiId);
  });

  it('gửi lại đúng mã gửi và nội dung ⇒ 200 với ĐÚNG thân của lần đầu, không thêm dòng', async () => {
    const maGui = newSendId();
    const first = await post(
      w.patientC,
      { chiNhanhId: w.branchA },
      'Hỏi lịch',
      maGui,
    );
    const again = await post(
      w.patientC,
      { chiNhanhId: w.branchA },
      'Hỏi lịch',
      maGui,
    );
    expect([first.status, again.status]).toEqual([201, 200]);
    expect(again.body).toEqual(first.body);
    expect(first.body.tinNhan).toMatchObject({
      laCuaToi: true,
      maGui,
      noiDung: 'Hỏi lịch',
    });
    expect(await messages()).toBe(1);
  });

  it('NBS-09: bác sĩ ChoKichHoat hay NgungHoatDong ⇒ 409 CHAT_NGUOI_NHAN_KHONG_HOAT_DONG; không hội thoại, không tin; đầu khung coTheGui sai', async () => {
    await setStatus(w.doctorB.taiKhoanId, 'NgungHoatDong');
    for (const bacSiId of [w.pendingDoctorId, w.doctorB.taiKhoanId]) {
      expect(await failure(post(w.patientC, { bacSiId })), bacSiId).toEqual({
        status: 409,
        maLoi: 'CHAT_NGUOI_NHAN_KHONG_HOAT_DONG',
      });
      const header = await buildStartService(db).doctor(
        userOf(w.patientC),
        bacSiId,
      );
      expect([header.hoiThoaiId, header.coTheGui, header.lyDoKhongGui]).toEqual(
        [null, false, 'CHAT_NGUOI_NHAN_KHONG_HOAT_DONG'],
      );
    }
    expect([await conversations(), await messages()]).toEqual([0, 0]);
  });

  it('NBS-10: lỗi giữa giao dịch (cổng thông báo ném) ⇒ hoàn tác trọn: không hội thoại, không tin, không dòng thành viên (A1)', async () => {
    const broken = buildChatSendService(
      db,
      buildSendService(db, {
        notifier: {
          notify: () => Promise.reject(new Error('lỗi ghi thông báo')),
        },
      }),
    );
    await expect(
      broken.send(
        userOf(w.patientC),
        { bacSiId: w.doctorA.taiKhoanId },
        'Xin chào',
        newSendId(),
      ),
    ).rejects.toThrow(ChatInternalError);
    expect([
      await conversations(),
      await messages(),
      await count('SELECT COUNT(*) AS n FROM tai_khoan_hoi_thoai'),
    ]).toEqual([0, 0, 0]);
  });

  it('NLE-07: gửi lại cùng chi nhánh ⇒ cùng hội thoại; gửi chi nhánh khác ⇒ hội thoại thứ hai; GET chi nhánh trả đúng hoiThoaiId', async () => {
    const a1 = await post(w.patientC, { chiNhanhId: w.branchA });
    const a2 = await post(w.patientC, { chiNhanhId: w.branchA });
    const b = await post(w.patientC, { chiNhanhId: w.branchB });
    expect(a2.body.hoiThoaiId).toBe(a1.body.hoiThoaiId);
    expect(b.body.hoiThoaiId).not.toBe(a1.body.hoiThoaiId);
    expect(await conversations()).toBe(2);
    const start = buildStartService(db);
    expect((await start.branch(userOf(w.patientC), w.branchA)).hoiThoaiId).toBe(
      a1.body.hoiThoaiId,
    );
    expect(
      (await start.branch(userOf(w.patientB), w.branchA)).hoiThoaiId,
    ).toBeNull();
  });

  it('NLE-10: Bệnh nhân bị khoá, Lễ tân trả lời ⇒ 409 CHAT_NGUOI_NHAN_KHONG_HOAT_DONG; lịch sử vẫn đọc được', async () => {
    const opened = await post(w.patientA, { chiNhanhId: w.branchA });
    await setStatus(w.patientA.taiKhoanId, 'NgungHoatDong');
    expect(
      await failure(
        post(w.receptionistA, { hoiThoaiId: opened.body.hoiThoaiId }),
      ),
    ).toEqual({
      status: 409,
      maLoi: 'CHAT_NGUOI_NHAN_KHONG_HOAT_DONG',
    });
    const history = await buildReadService(db).messages(
      userOf(w.receptionistA),
      opened.body.hoiThoaiId,
      { limit: 30 },
    );
    expect(history.items.map((m) => m.id)).toEqual([opened.body.tinNhan.id]);
    expect(await messages()).toBe(1);
  });

  it('NBN-13: Lễ tân trả lời lần đầu tạo ĐÚNG một dòng thành viên cho người đó (mốc trống); lần sau không thêm', async () => {
    const opened = await post(w.patientA, { chiNhanhId: w.branchA });
    const rows = () =>
      count(
        'SELECT COUNT(*) AS n FROM tai_khoan_hoi_thoai WHERE hoi_thoai_id = ? AND tai_khoan_id = ?',
        [opened.body.hoiThoaiId, w.receptionistA.taiKhoanId],
      );
    expect(await rows()).toBe(0);
    const reply = await post(
      w.receptionistA,
      { hoiThoaiId: opened.body.hoiThoaiId },
      'Chào bạn',
    );
    expect(reply.status).toBe(201);
    expect(reply.body.tinNhan.nguoiGui).toEqual({
      vaiTro: 'LeTan',
      tenHienThi: 'Lễ tân A',
    });
    await post(w.receptionistA, { hoiThoaiId: opened.body.hoiThoaiId }, 'Thêm');
    expect(await rows()).toBe(1);
    expect(
      await count(
        'SELECT COUNT(*) AS n FROM tai_khoan_hoi_thoai WHERE hoi_thoai_id = ?',
        [opened.body.hoiThoaiId],
      ),
    ).toBe(2);
  });
});

describe('chat B3 — chi nhánh mặc định (Q4, MH2)', () => {
  // Bệnh nhân C chưa có lịch nào. Mỗi ca dựng bác sĩ mới (ca làm việc riêng) để đặt lịch đúng giờ cần thử.
  let fx: AdminFixtures;
  let branchC: ChiNhanh;
  const shifts = new Map<string, Promise<LichLamViec>>();
  beforeEach(async () => {
    fx = new AdminFixtures(db);
    branchC = await fx.branch({ ten: 'Chi nhánh C' });
    shifts.clear();
  });
  const doctorIn = async (branch: ChiNhanh): Promise<BacSi> =>
    (await fx.doctor(branch)).profile;
  /** Đặt lịch ở đúng thời điểm `iso` (giờ có múi). Mỗi (bác sĩ, ngày) một ca làm việc. */
  async function bookAt(
    doctor: BacSi,
    status: TrangThaiLichHen,
    iso: string,
    hoSoNguoiThanId?: string,
  ) {
    const at = new Date(iso);
    const key = `${doctor.taiKhoanId}:${todayVN(at)}`;
    if (!shifts.has(key))
      shifts.set(key, fx.shift(doctor, { ngay: todayVN(at) }));
    const shift = shifts.get(key) ?? fx.shift(doctor, { ngay: todayVN(at) });
    const slot = await fx.slot(await shift, { ngayGio: at });
    const appointment = await fx.appointment(
      doctor,
      slot,
      w.patientC.taiKhoanId,
      {
        trangThai: status,
        ...(hoSoNguoiThanId ? { hoSoNguoiThanId } : {}),
      },
    );
    return String(appointment.lichHenId);
  }
  const suggest = () => buildStartService(db).defaultBranch(userOf(w.patientC));

  it('NLE-01: có lịch còn hiệu lực sắp tới (ChoThanhToan, DaXacNhan, DaTiepDon) ⇒ chi nhánh của lịch đó, LichHenSapToi', async () => {
    for (const status of ['ChoThanhToan', 'DaXacNhan', 'DaTiepDon'] as const) {
      await db.query('DELETE FROM lich_hen WHERE benh_nhan_id = ?', [
        w.patientC.taiKhoanId,
      ]);
      await bookAt(
        await doctorIn(branchC),
        status,
        '2026-11-05T09:00:00+07:00',
      );
      expect(await suggest(), status).toEqual({
        chiNhanhId: String(branchC.chiNhanhId),
        nguon: 'LichHenSapToi',
      });
    }
  });

  it('NLE-02: không lịch sắp tới, có lịch HoanThanh ⇒ chi nhánh của lịch Hoàn thành MỚI nhất, LichHenDaKham; lịch sắp tới thắng lịch đã khám', async () => {
    await bookAt(
      await doctorIn(w.accounts.branchA),
      'HoanThanh',
      '2026-10-01T09:00:00+07:00',
    );
    await bookAt(
      await doctorIn(branchC),
      'HoanThanh',
      '2026-10-20T09:00:00+07:00',
    );
    await bookAt(
      await doctorIn(w.accounts.branchB),
      'HoanThanh',
      '2026-09-01T09:00:00+07:00',
    );
    expect(await suggest()).toEqual({
      chiNhanhId: String(branchC.chiNhanhId),
      nguon: 'LichHenDaKham',
    });
    await bookAt(
      await doctorIn(w.accounts.branchB),
      'DaXacNhan',
      '2026-12-01T09:00:00+07:00',
    );
    expect(await suggest()).toEqual({
      chiNhanhId: w.branchB,
      nguon: 'LichHenSapToi',
    });
  });

  it('NLE-03: chỉ có lịch DaHuy, DaDoiLich, VangMat (kể cả sắp tới), hoặc không lịch nào ⇒ null; lịch DaXacNhan đã qua (hôm trước) cũng không tính', async () => {
    expect(await suggest()).toEqual({ chiNhanhId: null, nguon: null });
    for (const status of ['DaHuy', 'DaDoiLich', 'VangMat'] as const)
      await bookAt(
        await doctorIn(branchC),
        status,
        '2026-11-10T09:00:00+07:00',
      );
    await bookAt(
      await doctorIn(branchC),
      'DaXacNhan',
      '2026-11-01T09:00:00+07:00',
    );
    expect(await suggest()).toEqual({ chiNhanhId: null, nguon: null });
  });

  it('NLE-04: hai lịch sắp tới ⇒ lịch GẦN nhất; lịch DaTiepDon HÔM NAY đã qua giờ vẫn tính; trùng giờ ⇒ lich_hen_id nhỏ', async () => {
    await bookAt(
      await doctorIn(w.accounts.branchA),
      'DaXacNhan',
      '2026-11-20T09:00:00+07:00',
    );
    await bookAt(
      await doctorIn(w.accounts.branchB),
      'DaXacNhan',
      '2026-11-06T09:00:00+07:00',
    );
    expect((await suggest()).chiNhanhId).toBe(w.branchB);
    // T0 là 08:00 hôm nay: lịch 07:00 hôm nay đã qua giờ nhưng còn trong ngày
    await bookAt(
      await doctorIn(branchC),
      'DaTiepDon',
      '2026-11-02T07:00:00+07:00',
    );
    expect(await suggest()).toEqual({
      chiNhanhId: String(branchC.chiNhanhId),
      nguon: 'LichHenSapToi',
    });

    await db.query('DELETE FROM lich_hen WHERE benh_nhan_id = ?', [
      w.patientC.taiKhoanId,
    ]);
    const firstId = await bookAt(
      await doctorIn(w.accounts.branchB),
      'DaXacNhan',
      '2026-11-04T09:00:00+07:00',
    );
    const secondId = await bookAt(
      await doctorIn(w.accounts.branchA),
      'DaXacNhan',
      '2026-11-04T09:00:00+07:00',
    );
    expect(BigInt(firstId) < BigInt(secondId)).toBe(true);
    expect((await suggest()).chiNhanhId).toBe(w.branchB);
  });

  it('NLE-05: lịch của hồ sơ NGƯỜI THÂN cùng tài khoản được tính', async () => {
    const relatives = db.getRepository(HoSoNguoiThan);
    const relative = await relatives.save(
      relatives.create({
        benhNhanId: w.patientC.taiKhoanId,
        hoTen: 'Mẹ',
        ngaySinh: '1960-01-01',
        gioiTinh: 'Nu',
        moiQuanHe: 'Me',
      }),
    );
    await bookAt(
      await doctorIn(branchC),
      'DaXacNhan',
      '2026-11-07T09:00:00+07:00',
      relative.hoSoNguoiThanId,
    );
    expect(await suggest()).toEqual({
      chiNhanhId: String(branchC.chiNhanhId),
      nguon: 'LichHenSapToi',
    });
  });
});
