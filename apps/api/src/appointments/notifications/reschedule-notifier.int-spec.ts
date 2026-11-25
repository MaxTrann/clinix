import { RESCHEDULE_NOTIFICATION_EVENTS } from '../appointments.constants.js';
import { readEmails, worldState } from '../testing/notification-world.js';
import {
  GIO_MOI,
  insertRescheduleRequest,
  MARKER_LY_DO_KHAM,
  MARKER_LY_DO_YEU_CAU,
  readRescheduleRows,
  REQUEST_LOAI,
  requestEvent,
  rescheduledEvent,
} from '../testing/reschedule-notification-world.js';
import {
  db,
  fx,
  useStatusWorldHooks,
  world,
} from '../testing/status-int-kit.js';
import { BookingNotifier } from './booking-notifier.js';

// reschedule B3 — bốn sự kiện đổi lịch qua `BookingNotifier` THẬT trên MySQL 8.4 THẬT (PLAN reschedule 5.10, 7.8, 7.10): NDL-01 (mỗi sự kiện một `thong_bao` và một email `ChoGui`, cột đúng, lỗi ghi ⇒ hoàn tác cả hành động
// gốc, không lý do khám và lý do yêu cầu), NDL-03 (chạy lại là "đã có"; một lịch hai yêu cầu theo thời gian vẫn đủ thông báo), NDL-07 (chỉ tài khoản ĐẶT nhận). Toàn bộ qua `db.transaction` như người gọi thật. Dữ liệu giả.
// Thư (worker): `reschedule-mail.int-spec.ts`. Chữ: `reschedule-text.spec.ts`. Đơn vị (chuỗi câu, 1062): `booking-notifier.spec.ts`.
useStatusWorldHooks();
const notifier = new BookingNotifier();
const { RESCHEDULED, REQUEST_PENDING, REQUEST_APPROVED, REQUEST_REJECTED } =
  RESCHEDULE_NOTIFICATION_EVENTS;
const MISSING_ID = '999999999';

/** Lịch CŨ `DaDoiLich` (khung giờ số 0) và lịch MỚI `DaXacNhan` (khung giờ số 3), như sau một lần đổi. */
async function pairOf(w: Awaited<ReturnType<typeof world>>) {
  return {
    cu: await w.booked('DaDoiLich', 0),
    moi: await w.booked('DaXacNhan', 3),
  };
}

describe('NDL-01 bốn sự kiện: mỗi sự kiện một `thong_bao` và một `email_thong_bao` ChoGui cho tài khoản ĐẶT, cùng giao dịch', () => {
  it('LichHenDaDoiLich gắn lịch MỚI (`yeu_cau_…_id` NULL); ba loại yêu cầu gắn yêu cầu (`lich_hen_id` NULL); mỗi dòng có đúng một email ChoGui, chưa thử lần nào', async () => {
    const w = await world();
    const { cu, moi } = await pairOf(w);
    const yeuCauId = await insertRescheduleRequest(db, {
      lichHenId: cu.lichHenId,
      khungGioMongMuonId: w.slotId(3),
    });
    await db.transaction(async (em) => {
      await notifier.notify(
        em,
        rescheduledEvent({
          lichHenMoiId: moi.lichHenId,
          taiKhoanId: w.patientId,
          maLichHenCu: cu.maLichHen,
          via: 'DoiHo',
          lyDo: 'Bác sĩ có việc đột xuất',
        }),
      );
      for (const loai of REQUEST_LOAI)
        await notifier.notify(
          em,
          requestEvent(loai, {
            lichHenCuId: cu.lichHenId,
            taiKhoanId: w.patientId,
            yeuCauId,
            ghiChu: 'Ghi chú của nhân sự',
            maLichHenMoi: moi.maLichHen,
          }),
        );
    });

    const rows = await readRescheduleRows(db);
    expect(rows.map((r) => r.loai)).toEqual([
      RESCHEDULED,
      REQUEST_PENDING,
      REQUEST_APPROVED,
      REQUEST_REJECTED,
    ]);
    expect(rows[0]).toMatchObject({
      taiKhoanId: w.patientId,
      lichHenId: moi.lichHenId,
      yeuCauId: null,
      emailTrangThai: 'ChoGui',
    });
    for (const row of rows.slice(1))
      expect(row).toMatchObject({
        taiKhoanId: w.patientId,
        lichHenId: null,
        yeuCauId,
        emailTrangThai: 'ChoGui',
      });
    expect(rows[0]!.noiDung).toContain(cu.maLichHen);
    expect(rows[0]!.noiDung).toContain(moi.maLichHen);
    expect(rows[0]!.noiDung).toContain('Lý do: Bác sĩ có việc đột xuất.');
    expect(rows[2]!.noiDung).toContain(`Lịch mới ${moi.maLichHen}`);
    expect(rows[3]!.noiDung).toContain('Ghi chú: Ghi chú của nhân sự.');
    expect(await readEmails(db)).toHaveLength(4);
    expect(
      (await readEmails(db)).every(
        (e) => e.trangThai === 'ChoGui' && e.soLanThu === 0,
      ),
    ).toBe(true);
  });

  it('`noi_dung` KHÔNG có lý do khám của lịch và lý do của yêu cầu (hàng DB có "mồi" ở cả hai chỗ)', async () => {
    const w = await world();
    const cu = await fx.appointmentIn('DaXacNhan', {
      doctor: w.doctor.profile,
      khungGioId: w.slotId(0),
      patientId: w.patientId,
      lyDoKham: MARKER_LY_DO_KHAM,
    });
    const yeuCauId = await insertRescheduleRequest(db, {
      lichHenId: cu.lichHenId,
      khungGioMongMuonId: w.slotId(3),
      lyDoYeuCau: MARKER_LY_DO_YEU_CAU,
    });
    await db.transaction(async (em) => {
      for (const loai of REQUEST_LOAI)
        await notifier.notify(
          em,
          requestEvent(loai, {
            lichHenCuId: cu.lichHenId,
            taiKhoanId: w.patientId,
            yeuCauId,
            ghiChu: 'Ghi chú',
            maLichHenMoi: 'CLX-20261110-0099',
          }),
        );
      await notifier.notify(
        em,
        rescheduledEvent({
          lichHenMoiId: cu.lichHenId,
          taiKhoanId: w.patientId,
          maLichHenCu: 'CLX-20261105-0007',
        }),
      );
    });
    const rows = await readRescheduleRows(db);
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.noiDung).not.toContain(MARKER_LY_DO_KHAM);
      expect(row.noiDung).not.toContain(MARKER_LY_DO_YEU_CAU);
      expect(row.noiDung.length).toBeLessThanOrEqual(500);
    }
  });

  it.each<[string, { taiKhoanId?: string; yeuCauId?: string }]>([
    ['tài khoản không tồn tại (1452)', { taiKhoanId: MISSING_ID }],
    ['yêu cầu không tồn tại (1452)', { yeuCauId: MISSING_ID }],
  ])(
    'lỗi ghi %s ở sự kiện thứ hai: NỔI LÊN và hoàn tác TRỌN giao dịch (hành động gốc, thông báo và email đã ghi trước đó)',
    async (_name, bad) => {
      const w = await world();
      const { cu, moi } = await pairOf(w);
      const yeuCauId = await insertRescheduleRequest(db, {
        lichHenId: cu.lichHenId,
        khungGioMongMuonId: w.slotId(3),
      });
      const before = await worldState(db);
      await expect(
        db.transaction(async (em) => {
          // hành động gốc giả: đổi một khung giờ khác, rồi ghi thông báo hợp lệ
          await em.query(
            "UPDATE khung_gio SET trang_thai = 'DaDat' WHERE khung_gio_id = ?",
            [w.slotId(5)],
          );
          await notifier.notify(
            em,
            rescheduledEvent({
              lichHenMoiId: moi.lichHenId,
              taiKhoanId: w.patientId,
              maLichHenCu: cu.maLichHen,
            }),
          );
          await notifier.notify(
            em,
            requestEvent(REQUEST_PENDING, {
              lichHenCuId: cu.lichHenId,
              taiKhoanId: bad.taiKhoanId ?? w.patientId,
              yeuCauId: bad.yeuCauId ?? yeuCauId,
            }),
          );
        }),
      ).rejects.toThrow();
      expect(await worldState(db)).toEqual(before);
      expect(await readRescheduleRows(db)).toEqual([]);
    },
  );

  it('tài khoản không tồn tại ở LichHenDaDoiLich (1452) cũng nổi lên và không để lại dòng nào', async () => {
    const w = await world();
    const { cu, moi } = await pairOf(w);
    await expect(
      db.transaction((em) =>
        notifier.notify(
          em,
          rescheduledEvent({
            lichHenMoiId: moi.lichHenId,
            taiKhoanId: MISSING_ID,
            maLichHenCu: cu.maLichHen,
          }),
        ),
      ),
    ).rejects.toThrow();
    expect(await readRescheduleRows(db)).toEqual([]);
    expect(await readEmails(db)).toEqual([]);
  });

  it('thiếu `doiLich` hay `yeuCau` ở sự kiện: NÉM trước mọi INSERT, không để lại dòng nào', async () => {
    const w = await world();
    const { cu, moi } = await pairOf(w);
    const noDoiLich = rescheduledEvent({
      lichHenMoiId: moi.lichHenId,
      taiKhoanId: w.patientId,
      maLichHenCu: cu.maLichHen,
    });
    delete noDoiLich.doiLich;
    const noYeuCau = requestEvent(REQUEST_PENDING, {
      lichHenCuId: cu.lichHenId,
      taiKhoanId: w.patientId,
      yeuCauId: '1',
    });
    delete noYeuCau.yeuCau;
    for (const event of [noDoiLich, noYeuCau])
      await expect(
        db.transaction((em) => notifier.notify(em, event)),
      ).rejects.toThrow(/thiếu/);
    expect(await readRescheduleRows(db)).toEqual([]);
  });
});

describe('NDL-03 chạy lại là "đã có": không lỗi, không dòng email thứ hai; một lịch có hai yêu cầu theo thời gian vẫn đủ thông báo', () => {
  it('mỗi loại ghi lần hai ở giao dịch KHÁC (khoá của lịch mới hay của yêu cầu): vẫn MỘT thong_bao và MỘT email, nội dung lần đầu giữ nguyên', async () => {
    const w = await world();
    const { cu, moi } = await pairOf(w);
    const yeuCauId = await insertRescheduleRequest(db, {
      lichHenId: cu.lichHenId,
      khungGioMongMuonId: w.slotId(3),
    });
    const events = [
      rescheduledEvent({
        lichHenMoiId: moi.lichHenId,
        taiKhoanId: w.patientId,
        maLichHenCu: cu.maLichHen,
      }),
      ...REQUEST_LOAI.map((loai) =>
        requestEvent(loai, {
          lichHenCuId: cu.lichHenId,
          taiKhoanId: w.patientId,
          yeuCauId,
          ghiChu: 'Lần đầu',
          maLichHenMoi: moi.maLichHen,
        }),
      ),
    ];
    for (const event of events)
      await db.transaction((em) => notifier.notify(em, event));
    const before = await readRescheduleRows(db);
    expect(before).toHaveLength(4);

    for (const event of events) {
      const again = {
        ...event,
        ...(event.yeuCau === undefined
          ? {}
          : { yeuCau: { ...event.yeuCau, ghiChu: 'Lần hai khác chữ' } }),
      };
      await expect(
        db.transaction((em) => notifier.notify(em, again)),
      ).resolves.toBeUndefined();
    }
    expect(await readRescheduleRows(db)).toEqual(before);
    expect(await readEmails(db)).toHaveLength(4);
  });

  it('lần hai NGAY TRONG CÙNG giao dịch: "đã có" và giao dịch dùng tiếp được (1062 chỉ ở cấp câu lệnh): một sự kiện khác vẫn ghi, commit còn đúng hai dòng', async () => {
    const w = await world();
    const cu = await w.booked('DaXacNhan', 0);
    const yeuCauId = await insertRescheduleRequest(db, {
      lichHenId: cu.lichHenId,
      khungGioMongMuonId: w.slotId(3),
    });
    const pending = requestEvent(REQUEST_PENDING, {
      lichHenCuId: cu.lichHenId,
      taiKhoanId: w.patientId,
      yeuCauId,
    });
    await db.transaction(async (em) => {
      await notifier.notify(em, pending);
      await notifier.notify(em, pending);
      await expect(em.query('SELECT 1 AS mot')).resolves.toBeDefined();
      await notifier.notify(
        em,
        requestEvent(REQUEST_REJECTED, {
          lichHenCuId: cu.lichHenId,
          taiKhoanId: w.patientId,
          yeuCauId,
          ghiChu: 'Hết chỗ',
        }),
      );
    });
    expect((await readRescheduleRows(db)).map((r) => r.loai)).toEqual([
      REQUEST_PENDING,
      REQUEST_REJECTED,
    ]);
    expect(await readEmails(db)).toHaveLength(2);
  });

  it('một lịch có HAI yêu cầu theo thời gian (đầu bị từ chối, sau gửi lại): đủ thông báo cho cả hai; không đụng khoá `lich_hen_id` vì thông báo của yêu cầu để NULL', async () => {
    const w = await world();
    const cu = await w.booked('DaXacNhan', 0);
    const first = await insertRescheduleRequest(db, {
      lichHenId: cu.lichHenId,
      khungGioMongMuonId: w.slotId(3),
      trangThai: 'TuChoi',
      nguoiXuLyId: w.receptionId,
    });
    const second = await insertRescheduleRequest(db, {
      lichHenId: cu.lichHenId,
      khungGioMongMuonId: w.slotId(4),
    });
    const of = (loai: (typeof REQUEST_LOAI)[number], yeuCauId: string) =>
      requestEvent(loai, {
        lichHenCuId: cu.lichHenId,
        taiKhoanId: w.patientId,
        yeuCauId,
        ghiChu: 'Ghi chú',
      });
    await db.transaction(async (em) => {
      await notifier.notify(em, of(REQUEST_PENDING, first));
      await notifier.notify(em, of(REQUEST_REJECTED, first));
    });
    await db.transaction((em) =>
      notifier.notify(em, of(REQUEST_PENDING, second)),
    );

    const rows = await readRescheduleRows(db);
    expect(rows.map((r) => [r.loai, r.yeuCauId, r.lichHenId])).toEqual([
      [REQUEST_PENDING, first, null],
      [REQUEST_REJECTED, first, null],
      [REQUEST_PENDING, second, null],
    ]);
    expect(await readEmails(db)).toHaveLength(3);
  });
});

describe('NDL-07 người nhận: chỉ tài khoản ĐẶT; Lễ tân, Bác sĩ, Quản trị viên và người khác không nhận', () => {
  it('cả bốn sự kiện của một lịch đặt HỘ người thân: thông báo và email chỉ của Bệnh nhân đặt; bảy tài khoản khác 0 dòng', async () => {
    const w = await world();
    const cu = await w.booked('DaXacNhan', 0, {
      hoSoNguoiThanId: w.relativeId,
    });
    const moi = await w.booked('DaXacNhan', 3, {
      hoSoNguoiThanId: w.relativeId,
    });
    const yeuCauId = await insertRescheduleRequest(db, {
      lichHenId: cu.lichHenId,
      khungGioMongMuonId: w.slotId(3),
    });
    await db.transaction(async (em) => {
      await notifier.notify(
        em,
        rescheduledEvent({
          lichHenMoiId: moi.lichHenId,
          taiKhoanId: w.patientId,
          maLichHenCu: cu.maLichHen,
          via: 'DoiHo',
          lyDo: 'Lễ tân đổi giúp',
        }),
      );
      for (const loai of REQUEST_LOAI)
        await notifier.notify(
          em,
          requestEvent(loai, {
            lichHenCuId: cu.lichHenId,
            taiKhoanId: w.patientId,
            yeuCauId,
            ghiChu: 'Ghi chú',
            maLichHenMoi: moi.maLichHen,
          }),
        );
    });

    const others = [
      w.receptionId,
      w.otherReceptionId,
      w.doctor.profile.taiKhoanId,
      w.systemAdmin.account.taiKhoanId,
      w.branchAdmin.account.taiKhoanId,
      w.secondPatientId,
    ];
    const count = async (sql: string, params: unknown[]): Promise<number> => {
      const rows: { n: number | string }[] = await db.query(sql, params);
      return Number(rows[0]?.n);
    };
    expect(
      await count(
        'SELECT COUNT(*) AS n FROM thong_bao WHERE tai_khoan_id = ?',
        [w.patientId],
      ),
    ).toBe(4);
    for (const id of others) {
      expect(
        await count(
          'SELECT COUNT(*) AS n FROM thong_bao WHERE tai_khoan_id = ?',
          [id],
        ),
        `thong_bao của ${id}`,
      ).toBe(0);
      expect(
        await count(
          'SELECT COUNT(*) AS n FROM email_thong_bao e JOIN thong_bao t ON t.thong_bao_id = e.thong_bao_id WHERE t.tai_khoan_id = ?',
          [id],
        ),
        `email của ${id}`,
      ).toBe(0);
    }
    expect(
      await count(
        'SELECT COUNT(*) AS n FROM thong_bao WHERE tai_khoan_id <> ?',
        [w.patientId],
      ),
    ).toBe(0);
  });

  it('người nhận là đúng `event.taiKhoanId` do người gọi truyền (không suy ra từ lịch hay yêu cầu): truyền Bệnh nhân thứ hai thì CHỈ người đó nhận', async () => {
    const w = await world();
    const cu = await w.booked('DaXacNhan', 0);
    const yeuCauId = await insertRescheduleRequest(db, {
      lichHenId: cu.lichHenId,
      khungGioMongMuonId: w.slotId(3),
    });
    await db.transaction((em) =>
      notifier.notify(
        em,
        requestEvent(REQUEST_PENDING, {
          lichHenCuId: cu.lichHenId,
          taiKhoanId: w.secondPatientId,
          yeuCauId,
        }),
      ),
    );
    expect((await readRescheduleRows(db)).map((r) => r.taiKhoanId)).toEqual([
      w.secondPatientId,
    ]);
  });
});

describe('NDL-01 giờ mong muốn của yêu cầu in theo giờ Việt Nam', () => {
  it('YeuCauDoiLichDangCho nêu đúng giờ mong muốn và giờ hiện tại của lịch cũ đọc từ DB', async () => {
    const w = await world();
    const cu = await w.booked('DaXacNhan', 0);
    const yeuCauId = await insertRescheduleRequest(db, {
      lichHenId: cu.lichHenId,
      khungGioMongMuonId: w.slotId(3),
    });
    await db.transaction((em) =>
      notifier.notify(
        em,
        requestEvent(REQUEST_PENDING, {
          lichHenCuId: cu.lichHenId,
          taiKhoanId: w.patientId,
          yeuCauId,
        }),
      ),
    );
    expect(GIO_MOI.toISOString()).toBe('2026-11-10T02:30:00.000Z');
    expect((await readRescheduleRows(db))[0]!.noiDung).toBe(
      `Yêu cầu đổi lịch hẹn ${cu.maLichHen} sang 09:30 10/11/2026 đã được gửi. Lịch hẹn giữ nguyên 08:00 10/11/2026 cho tới khi có kết quả.`,
    );
  });
});
