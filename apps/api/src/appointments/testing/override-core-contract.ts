import type { EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import type { OnChanged } from '../state/on-changed.js';
import {
  ScriptedEntityManager,
  mysqlError,
} from './scripted-entity-manager.js';
import {
  CHI_NHANH_ID,
  LICH_HEN_ID,
  lockedRows,
  newTransition,
  statesExcept,
  touchesTable,
} from './status-unit-helpers.js';

// HỢP ĐỒNG CHUNG của hai lõi họ B có biến thể Quản trị viên và chỉ khoá `lich_hen` (task B14; PLAN booking 7.37 `[đề xuất]` OVR-01…OVR-03; TRACKING 3.31 B14-H): `checkIn` (nguồn `DaXacNhan`, `VangMat` ⇒ `DaTiepDon`) và
// `restoreConfirmed` (nguồn `VangMat`, `DaTiepDon` ⇒ `DaXacNhan`). Cả hai cùng khuôn bảy bước: khoá lịch theo khoá chính, kiểm phạm vi và ma trận DƯỚI khoá, MỘT `UPDATE` có điều kiện nguồn, không đụng khung giờ,
// `benh_nhan` hay `thong_bao`, và điểm cắm `onChanged`. Các ca giống nhau nằm MỘT chỗ để sửa một nơi (hai spec không lệch nhau; jscpd bỏ qua `*.spec.ts` nhưng quét `testing/*.ts` và `*.int-spec.ts`); mỗi spec chỉ thêm ca riêng của lõi mình. `EntityManager` GIẢ, không DB.

interface Script {
  locked: unknown[];
  update: { affectedRows: number };
}

/** Một lõi trên `em` giả: lịch đang ở `initial` (hay `locked` tuỳ ý), `canAct` và `onChanged` là hàm giả đếm được lời gọi. */
export function scriptedCore(
  initial: TrangThaiLichHen,
  script: Partial<Script> = {},
) {
  const full: Script = {
    locked: lockedRows(initial),
    update: { affectedRows: 1 },
    ...script,
  };
  const em = new ScriptedEntityManager((sql) => {
    if (sql.includes('FROM lich_hen') && sql.includes('FOR UPDATE'))
      return full.locked;
    if (sql.startsWith('UPDATE lich_hen')) return full.update;
    throw new Error(`câu lạ: ${sql}`);
  });
  const { service, waitlist, notifier } = newTransition();
  const canAct = vi.fn((_target: { chiNhanhId: string }) => true);
  // Nhãn các câu đã chạy tại MỖI lần gọi `onChanged`: phải là [khoá, ghi] (gọi SAU lần ghi, dưới khoá)
  const labelsAtCall: string[][] = [];
  const onChanged = vi.fn<OnChanged>((_em, _change) => {
    labelsAtCall.push(em.labels);
    return Promise.resolve();
  });
  return { em, service, waitlist, notifier, canAct, onChanged, labelsAtCall };
}
export type ScriptedCore = ReturnType<typeof scriptedCore>;

export interface CoreSubject {
  /** Mã ca của PLAN 7.37, ví dụ `OVR-01` */
  tag: string;
  /** Tên lõi, để đọc báo cáo */
  name: string;
  /** Các trạng thái nguồn ma trận Q24 cho phép */
  okFrom: readonly TrangThaiLichHen[];
  /** Trạng thái đích của lõi */
  to: TrangThaiLichHen;
  /** Nhãn kết quả thành công (`CheckedIn`, `Restored`) */
  success: string;
  /**
   * Gọi lõi với đầu vào của biến thể Quản trị viên: `canAct` và `onChanged` của `s` (hay `onChanged` thay thế, hay KHÔNG có `onChanged` khi `omitOnChanged`).
   */
  run: (
    s: ScriptedCore,
    options?: { onChanged?: OnChanged; omitOnChanged?: boolean },
  ) => Promise<{ kind: string; trangThai?: TrangThaiLichHen }>;
  /** Mẩu chữ của lỗi dữ liệu lệch khi `UPDATE` không trúng 1 hàng (khẳng định `rejects.toThrow`) */
  driftMessage: RegExp;
}

/** Các ca chung của hợp đồng; gọi MỘT lần trong spec của mỗi lõi (ngoài `describe`). */
export function describeOverrideCoreContract(subject: CoreSubject): void {
  const { tag, name, okFrom, to, success, run } = subject;
  const badFrom = statesExcept(...okFrom);

  describe(`${tag} ${name} biến thể Quản trị viên: nguồn theo ma trận Q24, phạm vi, không đụng khung giờ và bộ đếm no-show`, () => {
    it.each(okFrom)(
      'nguồn %s: thành công; khoá lịch theo khoá chính rồi MỘT UPDATE có điều kiện nguồn; KHÔNG câu nào chạm khung_gio, benh_nhan (không trừ so_lan_no_show, không mở cờ khoá), thong_bao; không thông báo, không danh sách chờ',
      async (from) => {
        const s = scriptedCore(from);
        expect(await run(s)).toEqual({ kind: success });
        expect(s.em.labels).toEqual(['lock lich_hen', 'write lich_hen']);
        expect(s.em.queries[1]?.params).toEqual([to, LICH_HEN_ID, from]);
        for (const table of ['khung_gio', 'benh_nhan', 'thong_bao'])
          expect(
            s.em.queries.some(({ sql }) => touchesTable(sql, table)),
            table,
          ).toBe(false);
        expect(s.notifier.events).toEqual([]);
        expect(s.waitlist.releasedSlotIds).toEqual([]);
      },
    );

    it.each(badFrom)(
      'nguồn %s: InvalidState kèm đúng trạng thái (ma trận Q24 không có ô); chỉ một câu khoá, không ghi, không onChanged',
      async (trangThai: TrangThaiLichHen) => {
        const s = scriptedCore(trangThai);
        expect(await run(s)).toEqual({ kind: 'InvalidState', trangThai });
        expect(s.em.labels).toEqual(['lock lich_hen']);
        expect(s.onChanged).not.toHaveBeenCalled();
      },
    );

    it('không có lịch đó: NotFound, chỉ một câu khoá, không hỏi phạm vi, không onChanged', async () => {
      const s = scriptedCore(okFrom[0] as TrangThaiLichHen, { locked: [] });
      expect(await run(s)).toEqual({ kind: 'NotFound' });
      expect(s.em.labels).toEqual(['lock lich_hen']);
      expect(s.canAct).not.toHaveBeenCalled();
      expect(s.onChanged).not.toHaveBeenCalled();
    });

    it('ngoài phạm vi (canAct false): NotFound DƯỚI khoá và TRƯỚC trạng thái (lịch DaHuy cũng chỉ ra NotFound); canAct nhận chi nhánh của lịch đọc dưới khoá', async () => {
      for (const trangThai of [okFrom[0], 'DaHuy'] as TrangThaiLichHen[]) {
        const s = scriptedCore(trangThai);
        s.canAct.mockReturnValue(false);
        expect(await run(s)).toEqual({ kind: 'NotFound' });
        expect(s.canAct).toHaveBeenCalledWith({ chiNhanhId: CHI_NHANH_ID });
        expect(s.em.labels).toEqual(['lock lich_hen']);
        expect(s.onChanged).not.toHaveBeenCalled();
      }
    });

    it('UPDATE không trúng đúng 1 hàng dưới khoá là dữ liệu lệch: ném Error (người gọi hoàn tác trọn), không onChanged', async () => {
      const s = scriptedCore(okFrom[0] as TrangThaiLichHen, {
        update: { affectedRows: 0 },
      });
      await expect(run(s)).rejects.toThrow(subject.driftMessage);
      expect(s.onChanged).not.toHaveBeenCalled();
    });

    it('lỗi MySQL 1213 ở câu khoá nổi lên nguyên văn (không bị nuốt: vỏ withBookingTransaction của người gọi thử lại)', async () => {
      const s = scriptedCore(okFrom[0] as TrangThaiLichHen);
      s.em.failQuery = (sql) =>
        sql.includes('FOR UPDATE') ? mysqlError(1213) : undefined;
      await expect(run(s)).rejects.toMatchObject({ errno: 1213 });
    });
  });

  describe(`OVR-03 (phần ${name}) điểm cắm onChanged: một lần, sau lần ghi, dưới khoá, kèm trạng thái nguồn; từ chối thì không gọi; ném thì lõi ném`, () => {
    it.each(okFrom)(
      'nguồn %s: gọi ĐÚNG MỘT LẦN với em của người gọi và { from } đọc dưới khoá, SAU câu UPDATE (nhãn lúc gọi: khoá rồi ghi)',
      async (from) => {
        const s = scriptedCore(from);
        await run(s);
        expect(s.onChanged).toHaveBeenCalledTimes(1);
        const [manager, change] = s.onChanged.mock.calls[0] as [
          EntityManager,
          { from: TrangThaiLichHen },
        ];
        expect(manager).toBe(s.em.em);
        expect(change).toEqual({ from });
        expect(s.labelsAtCall).toEqual([['lock lich_hen', 'write lich_hen']]);
      },
    );

    it('onChanged ném: lõi ném tiếp nguyên lỗi (người gọi hoàn tác cả lần ghi), không nuốt', async () => {
      const s = scriptedCore(okFrom[0] as TrangThaiLichHen);
      const boom = new Error('audit giả lỗi');
      const failing = vi.fn<OnChanged>(() => Promise.reject(boom));
      await expect(run(s, { onChanged: failing })).rejects.toBe(boom);
      expect(s.em.labels).toEqual(['lock lich_hen', 'write lich_hen']);
    });

    it('không có onChanged (người gọi không cần audit): vẫn thành công', async () => {
      const s = scriptedCore(okFrom[0] as TrangThaiLichHen);
      expect(await run(s, { omitOnChanged: true })).toEqual({ kind: success });
    });
  });
}
