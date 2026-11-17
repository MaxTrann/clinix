import type { DataSource, EntityManager } from 'typeorm';
import { SlotHoldService } from '../../appointments/slots/slot-hold.service.js';
import { lockSlot } from '../../appointments/slots/slot-lock.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../database/testing/test-database.js';
import { createGate } from '../../doctor/testing/concurrency-harness.js';
import { buildSlotService, SlotFixtures } from '../testing/slot-fixtures.js';

// Search Slots PR-C1 — KGC-32 (PLAN search 9.5, kịch bản A): đọc khung giờ công khai CHỒNG LÊN ghi của booking trên MySQL 8.4 THẬT.
// Tiêu chí ĐẶT TRƯỚC khi chạy: (1) 0 lỗi ném phía đọc (kể cả 1213, 1205); (2) mọi phản hồi đủ 8 ô cùng bộ khungGioId, đúng thứ tự;
// (3) mọi phản hồi có ĐÚNG MỘT trong {A, B} ở DaDat (hoán đổi đặt lịch A sang B là MỘT giao dịch, nên không bao giờ thấy "nửa vời");
// (4) trạng thái S1 luôn thuộc {ConTrong, DangGiuCho, DaDat}, năm ô còn lại luôn ConTrong; (5) tổng phản hồi ≥ 1.000, đã thấy A rồi B làm ô DaDat
// và đã thấy đủ ba trạng thái của S1 (chứng minh hai luồng thật sự chồng nhau; nếu không thấy thì TĂNG số vòng, không đổi tiêu chí).
// Người ghi dùng `SlotHoldService` THẬT dưới `lockSlot` (khung_gio FOR UPDATE), khoá hai ô hoán đổi theo id tăng dần. Không `sleep` cố định, không ngưỡng thời gian ngắn.
const NOW = new Date('2026-11-18T07:00:00+07:00');
const NGAY = '2026-11-19';
const DEN = new Date(NOW.getTime() + 15 * 60_000);
const ROUNDS = 150; // vòng của người ghi
const READERS = 4;
const MIN_READS = 250; // mỗi người đọc

let db: DataSource;
let fx: SlotFixtures;
beforeAll(async () => {
  db = await createTestDataSource(readTestDbSettings());
  fx = new SlotFixtures(db);
});
beforeEach(async () => {
  await resetTables(db);
});
afterAll(async () => {
  await db?.destroy();
});

interface Findings {
  reads: number;
  errors: string[];
  violations: string[];
  s1: Set<string>;
  aBooked: number;
  bBooked: number;
}

describe('KGC-32 đọc công khai song song với giữ chỗ, đặt, thả và hoán đổi (MySQL thật)', () => {
  it('0 lỗi, 0 phản hồi nửa vời, mọi trạng thái hợp lệ; hai luồng thật sự chồng nhau', async () => {
    const branch = await fx.branch();
    const { id, slotIds } = await fx.publicDoctorWithShifts(branch, NGAY, [
      'CaSang',
    ]);
    const [s1, a, b] = [slotIds[0], slotIds[1], slotIds[2]] as [
      string,
      string,
      string,
    ];
    const others = slotIds.slice(3);
    await db.query(
      "UPDATE khung_gio SET trang_thai = 'DaDat', giu_cho_den = NULL WHERE khung_gio_id = ?",
      [a],
    );
    const { service } = buildSlotService(db);
    const holds = new SlotHoldService();

    const step = async (
      khungGioId: string,
      work: (
        em: EntityManager,
        slot: NonNullable<Awaited<ReturnType<typeof lockSlot>>>,
      ) => Promise<{ kind: string }>,
    ) => {
      await db.transaction(async (em) => {
        const slot = await lockSlot(em, khungGioId);
        if (!slot) throw new Error(`mất ô ${khungGioId}`);
        const outcome = await work(em, slot);
        if (outcome.kind !== 'Done')
          throw new Error(`ghi lệch ở ${khungGioId}: ${outcome.kind}`);
      });
    };
    /** Vòng đời một ô: giữ chỗ, đặt, thả (mỗi bước một giao dịch). */
    const lifecycle = async () => {
      await step(s1, (em, slot) => holds.hold(em, slot, { den: DEN }));
      await step(s1, (em, slot) => holds.markBooked(em, slot));
      await step(s1, (em, slot) =>
        holds.release(em, slot, { from: 'DaDat', den: null }),
      );
    };
    /** Đổi lịch: ô đang DaDat nhả ra, ô còn lại được giữ rồi đặt, TRONG MỘT giao dịch (khoá A rồi B theo id tăng). */
    const swap = (from: string, to: string) =>
      db.transaction(async (em) => {
        const locked = new Map<string, Awaited<ReturnType<typeof lockSlot>>>();
        for (const slotId of [a, b])
          locked.set(slotId, await lockSlot(em, slotId));
        const source = locked.get(from);
        const target = locked.get(to);
        if (!source || !target) throw new Error('mất ô hoán đổi');
        const outcomes = [
          await holds.release(em, source, { from: 'DaDat', den: null }),
          await holds.hold(em, target, { den: DEN }),
          await holds.markBooked(em, target),
        ];
        if (outcomes.some((o) => o.kind !== 'Done'))
          throw new Error(`hoán đổi lệch: ${JSON.stringify(outcomes)}`);
      });

    let writerDone = false;
    const gate = createGate(READERS + 1);
    const findings: Findings[] = [];

    const writer = async () => {
      await gate.arrive();
      for (let round = 0; round < ROUNDS; round += 1) {
        await lifecycle();
        await (round % 2 === 0 ? swap(a, b) : swap(b, a));
      }
      writerDone = true;
    };

    const reader = async () => {
      const found: Findings = {
        reads: 0,
        errors: [],
        violations: [],
        s1: new Set(),
        aBooked: 0,
        bBooked: 0,
      };
      findings.push(found);
      await gate.arrive();
      while (!writerDone || found.reads < MIN_READS) {
        try {
          const out = await service.list({ bacSiIds: id, ngay: NGAY }, NOW);
          const item = out.items[0];
          const slots = item?.khungGio ?? [];
          if (out.items.length !== 1 || slots.length !== 8)
            found.violations.push(
              `số phần tử/ô sai: ${out.items.length}/${slots.length}`,
            );
          if (slots.map((s) => s.khungGioId).join() !== slotIds.join())
            found.violations.push('bộ hoặc thứ tự khungGioId đổi');
          const status = (slotId: string) =>
            slots.find((s) => s.khungGioId === slotId)?.trangThai;
          const booked = [a, b].filter((slotId) => status(slotId) === 'DaDat');
          if (booked.length !== 1)
            found.violations.push(`A=${status(a)} B=${status(b)} (nửa vời)`);
          else if (booked[0] === a) found.aBooked += 1;
          else found.bBooked += 1;
          const s1Status = status(s1) ?? 'thiếu';
          found.s1.add(s1Status);
          if (!['ConTrong', 'DangGiuCho', 'DaDat'].includes(s1Status))
            found.violations.push(`S1 trạng thái lạ: ${s1Status}`);
          for (const other of others)
            if (status(other) !== 'ConTrong')
              found.violations.push(`ô ${other} đổi: ${status(other)}`);
        } catch (error) {
          found.errors.push(String(error));
        }
        found.reads += 1;
      }
    };

    await Promise.all([
      writer(),
      ...Array.from({ length: READERS }, () => reader()),
    ]);

    const total = findings.reduce((sum, f) => sum + f.reads, 0);
    const s1Seen = new Set(findings.flatMap((f) => [...f.s1]));
    const aBooked = findings.reduce((sum, f) => sum + f.aBooked, 0);
    const bBooked = findings.reduce((sum, f) => sum + f.bBooked, 0);
    process.stdout.write(
      `KGC-32: ${total} phản hồi (${READERS} người đọc), ${ROUNDS} vòng đời + ${ROUNDS} hoán đổi; A DaDat ${aBooked}, B DaDat ${bBooked}; S1 thấy: ${[...s1Seen].sort().join(', ')}\n`,
    );

    expect(findings.flatMap((f) => f.errors)).toEqual([]);
    expect(findings.flatMap((f) => f.violations)).toEqual([]);
    expect(total).toBeGreaterThanOrEqual(READERS * MIN_READS);
    expect([...s1Seen].sort()).toEqual(['ConTrong', 'DaDat', 'DangGiuCho']);
    expect(aBooked).toBeGreaterThan(0);
    expect(bBooked).toBeGreaterThan(0);

    // Trạng thái cuối khớp bước cuối của người ghi (vòng cuối là chẵn/lẻ).
    const final = await db.query<
      { id: string; trangThai: string; giuChoDen: string | null }[]
    >(
      `SELECT CAST(khung_gio_id AS CHAR) AS id, trang_thai AS trangThai, giu_cho_den AS giuChoDen
         FROM khung_gio WHERE khung_gio_id IN (?, ?, ?) ORDER BY khung_gio_id`,
      [s1, a, b],
    );
    const byId = new Map(final.map((row) => [row.id, row]));
    expect(byId.get(s1)).toMatchObject({
      trangThai: 'ConTrong',
      giuChoDen: null,
    });
    expect(
      [a, b].filter((slotId) => byId.get(slotId)?.trangThai === 'DaDat'),
    ).toHaveLength(1);
  }, 180_000);
});
