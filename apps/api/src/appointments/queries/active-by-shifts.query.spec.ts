import { describe, expect, it } from 'vitest';
import { ACTIVE_APPOINTMENT_STATES } from '../active-appointment-states.js';
import { ScriptedEntityManager } from '../testing/scripted-entity-manager.js';
import { countActiveByShifts } from './active-by-shifts.query.js';

// Task B11 — AFL-02 (phần `countActiveByShifts`) và AFL-04 (mức đơn vị: MỘT câu, không N+1) (PLAN booking 7.30; TRACKING 3.24.3), `EntityManager` GIẢ. CG-16, CG-17 và số câu trên MySQL thật ở
// active-by-shifts.int-spec.ts.
const setup = (rows: unknown[] = []) => new ScriptedEntityManager(() => rows);

describe('AFL-02 countActiveByShifts: kiểm đầu vào, mặc định 0, danh sách rỗng', () => {
  it('danh sách rỗng ⇒ {} và KHÔNG chạy SQL', async () => {
    const em = setup();
    expect(await countActiveByShifts(em.em, { lichLamViecIds: [] })).toEqual(
      {},
    );
    expect(em.queries).toHaveLength(0);
  });

  it('id không có lịch ⇒ 0; mọi id được hỏi đều có khoá; id có lịch ⇒ số đếm (COUNT có thể là chuỗi)', async () => {
    const em = setup([
      { lichLamViecId: '3', soLich: 2 },
      { lichLamViecId: '8', soLich: '4' },
    ]);
    expect(
      await countActiveByShifts(em.em, { lichLamViecIds: ['3', '5', '8'] }),
    ).toEqual({ '3': 2, '5': 0, '8': 4 });
  });

  it('id trùng gộp thành một (không đếm đôi, không đổi số tham số)', async () => {
    const em = setup([{ lichLamViecId: '3', soLich: 1 }]);
    expect(
      await countActiveByShifts(em.em, { lichLamViecIds: ['3', '3', '3'] }),
    ).toEqual({ '3': 1 });
    expect(em.queries[0]?.params).toEqual(['3', ...ACTIVE_APPOINTMENT_STATES]);
  });

  it.each([
    '',
    'abc',
    '0',
    '-1',
    '01',
    '1.5',
    ' 3',
    '3 ',
    '1;DROP TABLE x',
    '9223372036854775808',
  ])(
    'id %j không phải id BIGINT hợp lệ: RangeError, không chạy SQL (kể cả khi lẫn id hợp lệ)',
    async (bad) => {
      const em = setup();
      await expect(
        countActiveByShifts(em.em, { lichLamViecIds: ['3', bad] }),
      ).rejects.toBeInstanceOf(RangeError);
      expect(em.queries).toHaveLength(0);
    },
  );

  it('id sai kiểu (số thay vì chuỗi): RangeError', async () => {
    const em = setup();
    await expect(
      countActiveByShifts(em.em, {
        lichLamViecIds: [3] as unknown as string[],
      }),
    ).rejects.toBeInstanceOf(RangeError);
  });
});

describe('AFL-04 (đơn vị) MỘT câu GROUP BY, tập trạng thái lấy từ ACTIVE_APPOINTMENT_STATES', () => {
  it.each([1, 2, 60])(
    '%s ca ⇒ đúng MỘT câu (không N+1), số `?` của IN theo số id, tham số là các id rồi ba trạng thái',
    async (count) => {
      const ids = Array.from({ length: count }, (_, i) => String(i + 1));
      const em = setup();
      await countActiveByShifts(em.em, { lichLamViecIds: ids });
      expect(em.queries).toHaveLength(1);
      const query = em.queries[0];
      expect(query?.sql).toContain('GROUP BY kg.lich_lam_viec_id');
      expect(query?.sql).toContain(
        `kg.lich_lam_viec_id IN (${ids.map(() => '?').join(', ')})`,
      );
      expect(query?.sql).toContain(
        `lh.trang_thai IN (${ACTIVE_APPOINTMENT_STATES.map(() => '?').join(', ')})`,
      );
      expect(query?.params).toEqual([...ids, ...ACTIVE_APPOINTMENT_STATES]);
    },
  );

  it('đếm lịch theo khung giờ của ca, không đọc cột nào của lịch ngoài trạng thái; không khoá, không ghi', async () => {
    const em = setup();
    await countActiveByShifts(em.em, { lichLamViecIds: ['3'] });
    const sql = em.queries[0]?.sql ?? '';
    expect(sql).toContain('FROM khung_gio kg');
    expect(sql).toContain(
      'INNER JOIN lich_hen lh ON lh.khung_gio_id = kg.khung_gio_id',
    );
    expect(sql).not.toMatch(/\bFOR\s+(?:UPDATE|SHARE)\b/i);
    expect(sql).not.toMatch(/^\s*(?:INSERT|UPDATE|DELETE)/i);
  });
});
