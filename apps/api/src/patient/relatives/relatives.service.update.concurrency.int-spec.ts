import type { DataSource } from 'typeorm';
import { together } from '../../auth/testing/reset-password-int-helpers.js';
import {
  serverDeadlocks,
  sleep,
} from '../../auth/testing/verification-int-helpers.js';
import { failureOf } from '../testing/profile-update-helpers.js';
import {
  insertRelativeRow,
  NEW_RELATIVE,
} from '../testing/relatives-helpers.js';
import {
  expectAppException,
  pauseNextRead,
  queueBehindLock,
  storedRow,
  UPDATE_A,
  UPDATE_B,
  useRelativesIntegration,
  waitForLockWaiter,
} from '../testing/relatives-update-helpers.js';
import type { RelativeResponse } from './relatives.dto.js';
import {
  RelativesRepository,
  type NewRelative,
} from './relatives.repository.js';

// Task B4 — PUT /patient/relatives/:id ĐUA NHAU và với việc ngừng hồ sơ trên MySQL 8.4 thật (Q24, H10, H1; PLAN patient 3.5): ép thứ tự bằng chờ khoá thật
// (`data_lock_waits`, không `sleep` cố định), như auth/change-password.concurrency.int-spec.ts và profile.service.update.concurrency.int-spec.ts.
// B5 (ngừng sử dụng) chưa có nên "ngừng" được GIẢ LẬP bằng một giao dịch `UPDATE … SET trang_thai_hieu_luc = FALSE` ở kết nối khác.
// Mã ca RUR-nn là [đề xuất] (TRACKING patient B4-G). Số vòng RELATIVE_RACE_ROUNDS (mặc định 12).
const ROUNDS = Number(process.env['RELATIVE_RACE_ROUNDS'] ?? 12);
const TEST_TIMEOUT = Math.max(60_000, ROUNDS * 3_000);
const DEACTIVATE_SQL =
  'UPDATE ho_so_nguoi_than SET trang_thai_hieu_luc = FALSE WHERE ho_so_nguoi_than_id = ?';
// Hạn chót cho việc "không bị chặn" của RUR-06, và hạn chờ khoá NGẮN của kết nối thử (giây): hết hạn khoá ⇒ lỗi chứ không treo DB dùng chung
const NOT_BLOCKED_WITHIN_MS = 1500;
const SHORT_LOCK_WAIT_SECONDS = 2;

const repository = new RelativesRepository();
const ctx = useRelativesIntegration(repository);

const deactivate = (id: string) =>
  ctx.db.transaction('READ COMMITTED', (em) => em.query(DEACTIVATE_SQL, [id]));

// Năm giá trị người dùng nhập của một phản hồi, để so với một bộ đã gửi
const fieldsOf = (r: RelativeResponse): NewRelative => ({
  hoTen: r.hoTen,
  moiQuanHe: r.moiQuanHe,
  gioiTinh: r.gioiTinh,
  ngaySinh: r.ngaySinh,
  soDienThoai: r.soDienThoai,
});

describe('hai PUT cùng một hồ sơ', { timeout: TEST_TIMEOUT }, () => {
  it(`RUR-01 (Q24, H10) hai PUT khác dữ liệu, thả tự do (${String(ROUNDS)} vòng): cả hai thành công, MỖI phản hồi là bộ của chính nó, hàng cuối bằng đúng MỘT trong hai bộ (không trộn trường), 0 deadlock`, async () => {
    const deadlocksBefore = await serverDeadlocks(ctx.db);
    for (let round = 0; round < ROUNDS; round++) {
      const owner = await ctx.newPatient();
      const id = await insertRelativeRow(ctx.db, owner, {
        hoTen: 'Tên Gốc Giả',
        active: true,
      });
      const results: RelativeResponse[] = [];

      const codes = await together(
        [UPDATE_A, UPDATE_B].map((input, i) => async () => {
          results[i] = await ctx.service.update(owner, id, input);
        }),
      );

      expect(codes, `vòng ${String(round)}`).toEqual(['ok', 'ok']);
      expect(results.map(fieldsOf)).toStrictEqual([UPDATE_A, UPDATE_B]);
      const row = await storedRow(ctx.db, id);
      const stored: NewRelative = {
        hoTen: row.ho_ten,
        moiQuanHe: row.moi_quan_he as NewRelative['moiQuanHe'],
        gioiTinh: row.gioi_tinh,
        ngaySinh: row.ngay_sinh,
        soDienThoai: row.so_dien_thoai,
      };
      expect([UPDATE_A, UPDATE_B], `vòng ${String(round)}`).toContainEqual(
        stored,
      );
    }
    expect((await serverDeadlocks(ctx.db)) - deadlocksBefore).toBe(0);
  });

  it('RUR-02 (Q24) ép thứ tự bằng chờ khoá thật: PUT thứ nhất giữ khoá (dừng sau UPDATE), PUT thứ hai xếp hàng; nhả ⇒ mỗi bên nhận đúng bộ của mình, hàng cuối là bộ của PUT sau', async () => {
    const owner = await ctx.newPatient();
    const id = await insertRelativeRow(ctx.db, owner, {
      hoTen: 'Tên Gốc Giả',
      active: true,
    });
    const pause = pauseNextRead(repository);
    const first = ctx.service.update(owner, id, UPDATE_A);
    let second: Promise<RelativeResponse> | undefined;
    try {
      await Promise.race([
        pause.entered,
        first.then(() => {
          throw new Error('PUT thứ nhất xong trước khi dừng');
        }),
      ]);
      second = ctx.service.update(owner, id, UPDATE_B);
      second.catch(() => undefined);
      await waitForLockWaiter(ctx.db);
    } finally {
      pause.resume();
    }

    expect(fieldsOf(await first)).toStrictEqual(UPDATE_A);
    expect(fieldsOf((await second) as RelativeResponse)).toStrictEqual(
      UPDATE_B,
    );
    expect((await storedRow(ctx.db, id)).ho_ten).toBe(UPDATE_B.hoTen);
  });
});

describe(
  'PUT với việc ngừng hồ sơ (giả lập B5)',
  { timeout: TEST_TIMEOUT },
  () => {
    it('RUR-03 (NT-09, H1) NGỪNG giữ khoá TRƯỚC, PUT xếp hàng; ngừng commit ⇒ PUT 409 HO_SO_NGUOI_THAN_DA_NGUNG, dữ liệu không đổi, hồ sơ đã ngừng', async () => {
      const owner = await ctx.newPatient();
      const id = await insertRelativeRow(ctx.db, owner, {
        hoTen: 'Tên Gốc Giả',
        active: true,
      });
      const before = await storedRow(ctx.db, id);

      const error = await queueBehindLock(
        ctx.db,
        (em) => em.query(DEACTIVATE_SQL, [id]),
        () => failureOf(() => ctx.service.update(owner, id, UPDATE_A)),
      );

      expectAppException(error, 409, 'HO_SO_NGUOI_THAN_DA_NGUNG');
      expect(await storedRow(ctx.db, id)).toStrictEqual({
        ...before,
        trang_thai_hieu_luc: 0,
      });
    });

    it('RUR-04 (H1) PUT giữ khoá TRƯỚC (dừng sau UPDATE), ngừng xếp hàng ⇒ PUT 200 với dữ liệu mới; cuối cùng dữ liệu mới và đã ngừng', async () => {
      const owner = await ctx.newPatient();
      const id = await insertRelativeRow(ctx.db, owner, {
        hoTen: 'Tên Gốc Giả',
        active: true,
      });
      const pause = pauseNextRead(repository);
      const put = ctx.service.update(owner, id, UPDATE_A);
      let deactivation: Promise<unknown> | undefined;
      try {
        await Promise.race([
          pause.entered,
          put.then(() => {
            throw new Error('PUT xong trước khi dừng');
          }),
        ]);
        deactivation = deactivate(id);
        deactivation.catch(() => undefined);
        await waitForLockWaiter(ctx.db);
      } finally {
        pause.resume();
      }

      const response = await put;
      await deactivation;

      expect(fieldsOf(response)).toStrictEqual(UPDATE_A);
      expect(response.trangThaiHieuLuc).toBe(true);
      expect(await storedRow(ctx.db, id)).toMatchObject({
        ho_ten: UPDATE_A.hoTen,
        trang_thai_hieu_luc: 0,
      });
    });

    it(`RUR-05 (H1) đua tự do PUT với ngừng (${String(ROUNDS)} vòng): mỗi vòng đúng một trong hai kết quả (PUT 200 rồi mới ngừng, hoặc ngừng trước và PUT 409); không 500, không 404, 0 deadlock`, async () => {
      const owner = await ctx.newPatient();
      const deadlocksBefore = await serverDeadlocks(ctx.db);
      for (let round = 0; round < ROUNDS; round++) {
        const id = await insertRelativeRow(ctx.db, owner, {
          hoTen: 'Tên Gốc Giả',
          active: true,
        });

        const [putCode, stopCode] = await together([
          async () => {
            await ctx.service.update(owner, id, UPDATE_A);
          },
          async () => {
            await deactivate(id);
          },
        ]);

        const row = await storedRow(ctx.db, id);
        expect(stopCode, `vòng ${String(round)}`).toBe('ok');
        expect(row.trang_thai_hieu_luc, `vòng ${String(round)}`).toBe(0);
        if (putCode === 'ok') {
          expect(row.ho_ten, `vòng ${String(round)}`).toBe(UPDATE_A.hoTen);
        } else {
          expect(putCode, `vòng ${String(round)}`).toBe(
            'HO_SO_NGUOI_THAN_DA_NGUNG',
          );
          expect(row.ho_ten, `vòng ${String(round)}`).toBe('Tên Gốc Giả');
        }
      }
      expect((await serverDeadlocks(ctx.db)) - deadlocksBefore).toBe(0);
    });
  },
);

describe('PUT không khớp hàng nào không giữ khoá (READ COMMITTED)', () => {
  /**
   * Giữ giao dịch của `update` MỞ ngay sau câu UPDATE 0 hàng, rồi chạy `concurrent` trên một kết nối RIÊNG có hạn chờ khoá ngắn và đo xem nó có xong trong hạn
   * chót không. Cổng luôn được nhả trong `finally` và việc `concurrent` được chờ cho xong (nó cùng lắm chờ khoá SHORT_LOCK_WAIT_SECONDS giây), nên dù ca đỏ
   * cũng không có giao dịch nào mở treo DB dùng chung.
   */
  async function finishesWhileUpdateIsOpen(
    caller: string,
    targetId: string,
    concurrent: (em: DataSource['manager']) => Promise<unknown>,
  ): Promise<boolean> {
    const pause = pauseNextRead(repository);
    const held = failureOf(() =>
      ctx.service.update(caller, targetId, UPDATE_A),
    );
    const runner = ctx.db.createQueryRunner();
    let work: Promise<unknown> = Promise.resolve();
    try {
      await Promise.race([
        pause.entered,
        held.then(() => {
          throw new Error('update xong trước khi dừng');
        }),
      ]);
      await runner.connect();
      await runner.query(
        `SET SESSION innodb_lock_wait_timeout = ${String(SHORT_LOCK_WAIT_SECONDS)}`,
      );
      work = concurrent(runner.manager);
      work.catch(() => undefined);
      const outcome = await Promise.race([
        work.then(
          () => 'xong',
          () => 'lỗi (hết hạn chờ khoá)',
        ),
        sleep(NOT_BLOCKED_WITHIN_MS).then(() => 'quá hạn chót'),
      ]);
      return outcome === 'xong';
    } finally {
      pause.resume();
      await held;
      await work.catch(() => undefined);
      await runner.release();
    }
  }

  it('RUR-06 (khoá lựa chọn READ COMMITTED, TRACKING B4-D) trong lúc một PUT 0 hàng còn mở giao dịch: (i) PUT lên id không tồn tại ⇒ INSERT hồ sơ mới của B3 vẫn xong trong hạn; (ii) PUT của Bệnh nhân A lên hồ sơ của B ⇒ PUT hợp lệ của chính B vẫn xong trong hạn. Đỏ nếu đổi sang REPEATABLE READ', async () => {
    const a = await ctx.newPatient();
    const b = await ctx.newPatient();
    const idOfB = await insertRelativeRow(ctx.db, b, {
      hoTen: 'Hồ sơ của B',
      active: true,
    });

    const insertNotBlocked = await finishesWhileUpdateIsOpen(a, '99999', (em) =>
      repository.insertRelative(em, a, NEW_RELATIVE),
    );
    const ownerNotBlocked = await finishesWhileUpdateIsOpen(a, idOfB, (em) =>
      repository.updateRelative(em, b, idOfB, UPDATE_B),
    );

    expect(insertNotBlocked, 'INSERT bị chặn bởi PUT 0 hàng').toBe(true);
    expect(ownerNotBlocked, 'PUT của chủ thật bị chặn bởi PUT lạ').toBe(true);
    // Sau khi cổng nhả: cả hai việc đã thật sự ghi
    expect((await storedRow(ctx.db, idOfB)).ho_ten).toBe(UPDATE_B.hoTen);
  });
});
