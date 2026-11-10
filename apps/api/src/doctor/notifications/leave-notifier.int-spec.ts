import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { DoctorFixtures } from '../testing/doctor-fixtures.js';
import {
  LEAVE_EVENTS,
  LeaveNotifier,
  type LeaveNotificationInput,
} from './leave-notifier.js';

// Doctor B10 — LeaveNotifier trên MySQL 8.4 THẬT: TD-02, TD-03, TD-04 (và ghi đúng người nhận cho 3 sự kiện gửi Bác sĩ).
let db: DataSource;
let fx: DoctorFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new DoctorFixtures(d);
});
const notifier = new LeaveNotifier();

const inputOf = (w: Awaited<ReturnType<DoctorFixtures['world']>>) =>
  ({
    bacSiId: w.doctor.profile.taiKhoanId,
    chiNhanhId: w.branch.chiNhanhId,
    tenBacSi: 'Bác sĩ Mẫu',
    ngayBatDau: '2026-11-10',
    ngayKetThuc: '2026-11-10',
    ca: 'CaSang',
  }) satisfies LeaveNotificationInput;

const rows = (): Promise<
  { taiKhoanId: string; loai: string; noiDung: string; daDoc: number }[]
> =>
  db.query(
    `SELECT CAST(tai_khoan_id AS CHAR) AS taiKhoanId, loai_su_kien AS loai, noi_dung AS noiDung, trang_thai_doc AS daDoc
       FROM thong_bao ORDER BY thong_bao_id`,
  );

describe('TD-02 người nhận Admin', () => {
  it('Toàn hệ thống và Chi nhánh ĐÚNG chi nhánh nhận; Chi nhánh khác, tài khoản ngừng hoạt động, bác sĩ và Lễ tân thì không', async () => {
    const w = await fx.world();
    const other = await fx.admin.branch();
    const otherBranchAdmin = await fx.admin.admin(other);
    const inactiveAdmin = await fx.admin.admin(undefined, {
      trangThai: 'NgungHoatDong',
    });
    const inactiveBranchAdmin = await fx.admin.admin(w.branch, {
      trangThai: 'NgungHoatDong',
    });

    await db.transaction((em) =>
      notifier.notify(em, {
        loaiSuKien: LEAVE_EVENTS.Pending,
        ...inputOf(w),
      }),
    );

    const got = await rows();
    const receivers = got.map((r) => r.taiKhoanId).sort();
    expect(receivers).toEqual(
      [
        w.systemAdmin.account.taiKhoanId,
        w.branchAdmin.account.taiKhoanId,
      ].sort(),
    );
    for (const excluded of [
      otherBranchAdmin,
      inactiveAdmin,
      inactiveBranchAdmin,
    ]) {
      expect(receivers).not.toContain(excluded.account.taiKhoanId);
    }
    expect(receivers).not.toContain(w.doctor.profile.taiKhoanId);
    expect(receivers).not.toContain(w.receptionist.account.taiKhoanId);
    expect(
      got.every((r) => r.loai === 'NghiPhepChoDuyet' && r.daDoc === 0),
    ).toBe(true);
  });

  it('không có Admin nào đủ điều kiện ⇒ không ghi gì và không lỗi', async () => {
    const w = await fx.world();
    await db.query(
      "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE loai_tai_khoan = 'QuanTriVien'",
    );
    await db.transaction((em) =>
      notifier.notify(em, { loaiSuKien: LEAVE_EVENTS.Pending, ...inputOf(w) }),
    );
    expect(await rows()).toEqual([]);
  });
});

describe('sự kiện gửi Bác sĩ', () => {
  it('Đã gửi / Đã duyệt / Từ chối chỉ tới đúng Bác sĩ, không tới Admin', async () => {
    const w = await fx.world();
    const input = inputOf(w);
    await db.transaction(async (em) => {
      await notifier.notify(em, {
        loaiSuKien: LEAVE_EVENTS.Submitted,
        ...input,
      });
      await notifier.notify(em, {
        loaiSuKien: LEAVE_EVENTS.Approved,
        ...input,
      });
      await notifier.notify(em, {
        loaiSuKien: LEAVE_EVENTS.Rejected,
        ...input,
        lyDoTuChoi: 'Thiếu người trực',
      });
    });
    const got = await rows();
    expect(got.map((r) => r.loai)).toEqual([
      'NghiPhepDaGui',
      'NghiPhepDaDuyet',
      'NghiPhepTuChoi',
    ]);
    expect(got.every((r) => r.taiKhoanId === input.bacSiId)).toBe(true);
    expect(got[2]?.noiDung).toContain('Thiếu người trực');
  });
});

describe('TD-03 ghi cùng giao dịch', () => {
  it('giao dịch của người gọi lỗi sau khi notify ⇒ không còn dòng thong_bao nào', async () => {
    const w = await fx.world();
    await expect(
      db.transaction(async (em) => {
        await notifier.notify(em, {
          loaiSuKien: LEAVE_EVENTS.Pending,
          ...inputOf(w),
        });
        throw new Error('lỗi giả sau khi ghi thông báo');
      }),
    ).rejects.toThrow('lỗi giả');
    expect(await rows()).toEqual([]);
  });

  it('notify tự lỗi (người nhận không tồn tại ⇒ vi phạm khoá ngoại) thì lỗi được ném ra, không bị nuốt', async () => {
    const w = await fx.world();
    await expect(
      db.transaction((em) =>
        notifier.notify(em, {
          loaiSuKien: LEAVE_EVENTS.Submitted,
          ...inputOf(w),
          bacSiId: '999999999',
        }),
      ),
    ).rejects.toThrow();
    expect(await rows()).toEqual([]);
  });
});

describe('TD-04 không ghi email_thong_bao', () => {
  it('sau đủ 4 sự kiện, bảng email_thong_bao vẫn rỗng', async () => {
    const w = await fx.world();
    const input = inputOf(w);
    await db.transaction(async (em) => {
      await notifier.notify(em, {
        loaiSuKien: LEAVE_EVENTS.Submitted,
        ...input,
      });
      await notifier.notify(em, { loaiSuKien: LEAVE_EVENTS.Pending, ...input });
      await notifier.notify(em, {
        loaiSuKien: LEAVE_EVENTS.Approved,
        ...input,
      });
      await notifier.notify(em, {
        loaiSuKien: LEAVE_EVENTS.Rejected,
        ...input,
      });
    });
    expect((await rows()).length).toBeGreaterThanOrEqual(4);
    const email: { n: string }[] = await db.query(
      'SELECT COUNT(*) AS n FROM email_thong_bao',
    );
    expect(Number(email[0]?.n)).toBe(0);
  });
});
