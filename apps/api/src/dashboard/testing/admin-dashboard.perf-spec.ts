import { writeFileSync } from 'node:fs';
import { cpus, platform, release, tmpdir, totalmem } from 'node:os';
import { join } from 'node:path';
import type { DataSource, EntityManager } from 'typeorm';
import {
  createMigratedTestDatabase,
  createTestDataSource,
  readTestDbSettings,
} from '../../database/testing/test-database.js';
import { AdminDashboardService } from '../admin/admin-dashboard.service.js';
import {
  toDateTimeBounds,
  type DateRange,
} from '../filter/date-range.rules.js';
import { countAppointments } from '../queries/appointment-metrics.query.js';
import {
  countFailingRefunds,
  sumDeposits,
  sumRefunds,
} from '../queries/money.query.js';
import { countPending } from '../queries/pending.query.js';
import { countSlotUsage } from '../queries/slot-usage.query.js';
import { countBookingsPerDay } from '../queries/trend.query.js';
import {
  isPerfDatasetLoaded,
  loadPerfDataset,
  PERF_DB_NAME,
  PERF_TARGET,
} from './perf-dataset.js';
import { measure, summarize, type TimingSummary } from './perf-stats.js';

// dashboard X1 — ĐO THẬT M1 đến M4 (PLAN dashboard 5.14; R2, Q10, T13) trên 100.000 lịch và 100.000 giao dịch. KHÔNG thuộc `test:int` hay CI:
// chạy bằng `npm run perf:dashboard` (cấu hình `vitest.config.dashboard-perf.ts`). DB tạm `clinix_dashboard_perf_test` được GIỮ giữa các lần chạy
// (quyết định của Trung 28/11/2026, để X3 đo M5 không phải nạp lại); `DASHBOARD_PERF_RELOAD=1` thì dựng lại từ đầu.
// Tiêu chí (cột `limit`) chép NGUYÊN từ PLAN 5.14, đặt TRƯỚC khi đo, KHÔNG sửa sau khi thấy số. Vượt tiêu chí ⇒ `expect.soft` báo đỏ nhưng vẫn đo
// hết các câu còn lại, để bảng số đầy đủ. Báo cáo ghi ra `DASHBOARD_PERF_OUT` (mặc định thư mục tạm của hệ điều hành), không ghi vào repo.

const RANGE_30: DateRange = { tuNgay: '2026-11-05', denNgay: '2026-12-04' };
const RANGE_366: DateRange = { tuNgay: '2025-12-04', denNgay: '2026-12-04' };
const LIMIT = { m1: 150, m2: 700, m3Short: 600, m3Long: 2_000, m4: 5_000 };
const PARALLEL_CALLS = 5;

type QueryRun = (
  manager: EntityManager,
  range: DateRange,
  chiNhanhId: string | null,
) => Promise<unknown>;

/** Bảy câu của một lần gọi `GET /admin/dashboard` (câu kiểm chi nhánh tồn tại là tra khoá chính, không đo). Câu không theo khoảng ngày vẫn đo ở M1 và M2. */
const QUERIES: readonly { name: string; run: QueryRun }[] = [
  {
    name: 'Lịch khám, vắng mặt (countAppointments)',
    run: (m, r, b) => countAppointments(m, toDateTimeBounds(r), b),
  },
  {
    name: 'Khung giờ (countSlotUsage)',
    run: (m, r, b) => countSlotUsage(m, r, b),
  },
  {
    name: 'Cọc (sumDeposits)',
    run: (m, r, b) => sumDeposits(m, toDateTimeBounds(r), b),
  },
  {
    name: 'Đã hoàn (sumRefunds)',
    run: (m, r, b) => sumRefunds(m, toDateTimeBounds(r), b),
  },
  {
    name: 'Khoản hoàn đang lỗi (countFailingRefunds)',
    run: (m, _r, b) => countFailingRefunds(m, b),
  },
  {
    name: 'Xu hướng (countBookingsPerDay)',
    run: (m, r, b) => countBookingsPerDay(m, toDateTimeBounds(r), b),
  },
  { name: 'Chờ duyệt (countPending)', run: (m, _r, b) => countPending(m, b) },
];

interface ResultRow {
  ma: string;
  doiTuong: string;
  phamVi: string;
  khoang: string;
  summary: TimingSummary;
  limit: number;
  loi?: number;
}

/** Bọc `manager` để ghi lại câu SQL và tham số mà hàm truy vấn gửi đi (cho `EXPLAIN ANALYZE`), không phải xuất hằng SQL khỏi mã thật. */
function recordingManager(
  manager: EntityManager,
  log: { sql: string; params: unknown[] }[],
): EntityManager {
  return new Proxy(manager, {
    get(target, property, receiver) {
      if (property === 'query')
        return (sql: string, params?: unknown[]) => {
          log.push({ sql, params: params ?? [] });
          return target.query(sql, params);
        };
      return Reflect.get(target, property, receiver) as unknown;
    },
  });
}

const rangeLabel = (range: DateRange) => `${range.tuNgay} → ${range.denNgay}`;

describe('dashboard X1 — đo thật truy vấn tổng hợp (M1 đến M4)', () => {
  let db: DataSource;
  let branchId: string;
  const results: ResultRow[] = [];
  const plans: string[] = [];
  const environment: string[] = [];

  beforeAll(async () => {
    const settings = readTestDbSettings(process.env, PERF_DB_NAME);
    const reload = process.env.DASHBOARD_PERF_RELOAD === '1';
    let ready = false;
    if (!reload) {
      try {
        db = await createTestDataSource(settings);
        ready = await isPerfDatasetLoaded(db);
        if (!ready) await db.destroy();
      } catch {
        ready = false; // DB tạm chưa có
      }
    }
    if (!ready) {
      const started = Date.now();
      db = await createMigratedTestDatabase(settings);
      await loadPerfDataset(db);
      environment.push(
        `Nạp dữ liệu: ${((Date.now() - started) / 1000).toFixed(0)} giây`,
      );
    } else environment.push('Dùng lại DB tạm đã nạp (không nạp lại)');

    const [branch]: { id: string }[] = await db.query(
      'SELECT CAST(MIN(chi_nhanh_id) AS CHAR) AS id FROM chi_nhanh',
    );
    branchId = String(branch?.id);
    const [server]: { v: string; pool: string }[] = await db.query(
      'SELECT VERSION() AS v, CAST(@@innodb_buffer_pool_size AS CHAR) AS pool',
    );
    environment.push(
      `MySQL ${server?.v}, innodb_buffer_pool_size ${(Number(server?.pool) / 1024 / 1024).toFixed(0)} MB`,
      `Máy: ${cpus()[0]?.model ?? '?'} × ${cpus().length} luồng, RAM ${(totalmem() / 1024 ** 3).toFixed(1)} GB, ${platform()} ${release()}, Node ${process.version}`,
    );
  }, 1_800_000);

  afterAll(async () => {
    const lines = [
      '# dashboard X1 — kết quả đo',
      '',
      ...environment.map((line) => `- ${line}`),
      '',
      '| Mã | Đối tượng | Phạm vi | Khoảng | n | p50 (ms) | p95 (ms) | max (ms) | Tiêu chí p95 (ms) | Đạt |',
      '|---|---|---|---|---|---|---|---|---|---|',
      ...results.map(
        (r) =>
          `| ${r.ma} | ${r.doiTuong} | ${r.phamVi} | ${r.khoang} | ${r.summary.n} | ${r.summary.p50.toFixed(1)} | ${r.summary.p95.toFixed(1)} | ${r.summary.max.toFixed(1)} | ≤ ${r.limit}${r.loi === undefined ? '' : `, lỗi ${r.loi}`} | ${r.summary.p95 <= r.limit && !r.loi ? 'Đạt' : '**KHÔNG**'} |`,
      ),
      '',
      '## EXPLAIN ANALYZE (khoảng 366 ngày, mọi chi nhánh)',
      '',
      ...plans,
    ];
    const out =
      process.env.DASHBOARD_PERF_OUT ??
      join(tmpdir(), 'clinix-dashboard-perf.md');
    writeFileSync(out, `${lines.join('\n')}\n`, 'utf8');
    console.log(
      `Báo cáo đo: ${out}\n${lines.slice(0, results.length + 7).join('\n')}`,
    );
    await db?.destroy();
  });

  it('dữ liệu đúng cỡ PLAN 5.14 (100.000 lịch, 100.000 giao dịch, 20.000 dòng hoàn, ~300.000 khung)', async () => {
    const [row]: Record<string, number | string>[] = await db.query(
      `SELECT (SELECT COUNT(*) FROM lich_hen) AS lichHen, (SELECT COUNT(*) FROM giao_dich_thanh_toan) AS giaoDich,
              (SELECT COUNT(*) FROM lich_su_hoan_tien) AS hoanTien, (SELECT COUNT(*) FROM khung_gio) AS khungGio,
              (SELECT COUNT(*) FROM yeu_cau_nghi_phep) AS nghiPhep, (SELECT COUNT(*) FROM yeu_cau_doi_lich_ngoai_chinh_sach) AS doiLich,
              (SELECT COUNT(*) FROM yeu_cau_rut_tien) AS rutTien, (SELECT COUNT(*) FROM bac_si) AS bacSi, (SELECT COUNT(*) FROM chi_nhanh) AS chiNhanh`,
    );
    const counts = Object.fromEntries(
      Object.entries(row ?? {}).map(([k, v]) => [k, Number(v)]),
    );
    environment.push(`Số dòng: ${JSON.stringify(counts)}`);
    expect(counts).toMatchObject({
      lichHen: PERF_TARGET.lichHen,
      giaoDich: PERF_TARGET.giaoDich,
      hoanTien: PERF_TARGET.hoanTien,
      nghiPhep: PERF_TARGET.nghiPhep,
      doiLich: PERF_TARGET.doiLich,
      rutTien: PERF_TARGET.rutTien,
      bacSi: PERF_TARGET.bacSi,
      chiNhanh: PERF_TARGET.chiNhanh,
    });
    expect(counts.khungGio).toBeGreaterThan(290_000);
  });

  for (const [ma, range, limit] of [
    ['M1', RANGE_30, LIMIT.m1],
    ['M2', RANGE_366, LIMIT.m2],
  ] as const) {
    it(`${ma}: từng câu, ${rangeLabel(range)}, mọi chi nhánh và một chi nhánh: p95 ≤ ${limit} ms`, async () => {
      for (const query of QUERIES)
        for (const scope of ['Tất cả', 'Một chi nhánh'] as const) {
          const chiNhanhId = scope === 'Tất cả' ? null : branchId;
          const summary = await measure(() =>
            query.run(db.manager, range, chiNhanhId),
          );
          results.push({
            ma,
            doiTuong: query.name,
            phamVi: scope,
            khoang: rangeLabel(range),
            summary,
            limit,
          });
          expect
            .soft(summary.p95, `${ma} ${query.name} ${scope}`)
            .toBeLessThanOrEqual(limit);
        }
    }, 1_800_000);
  }

  it('EXPLAIN ANALYZE từng câu (366 ngày, mọi chi nhánh) để ghi kế hoạch thực thi', async () => {
    for (const query of QUERIES) {
      const log: { sql: string; params: unknown[] }[] = [];
      await query.run(recordingManager(db.manager, log), RANGE_366, null);
      const statement = log[0];
      if (statement === undefined)
        throw new Error(`Không ghi được câu SQL của ${query.name}`);
      const rows: Record<string, string>[] = await db.query(
        `EXPLAIN ANALYZE ${statement.sql}`,
        statement.params,
      );
      plans.push(
        `### ${query.name}`,
        '',
        '```',
        Object.values(rows[0] ?? {}).join('\n'),
        '```',
        '',
      );
    }
    expect(plans.length).toBeGreaterThan(0);
  }, 600_000);

  it(`M3: cả service (một giao dịch chỉ đọc), 30 ngày p95 ≤ ${LIMIT.m3Short} ms, 366 ngày p95 ≤ ${LIMIT.m3Long} ms`, async () => {
    const service = new AdminDashboardService(db);
    for (const [range, limit] of [
      [RANGE_30, LIMIT.m3Short],
      [RANGE_366, LIMIT.m3Long],
    ] as const)
      for (const scope of ['Tất cả', 'Một chi nhánh'] as const) {
        const summary = await measure(() =>
          service.overview(
            { kind: 'ToanHeThong' },
            {
              ...range,
              ...(scope === 'Tất cả' ? {} : { chiNhanhId: branchId }),
            },
          ),
        );
        results.push({
          ma: 'M3',
          doiTuong: 'AdminDashboardService.overview',
          phamVi: scope,
          khoang: rangeLabel(range),
          summary,
          limit,
        });
        expect
          .soft(summary.p95, `M3 ${rangeLabel(range)} ${scope}`)
          .toBeLessThanOrEqual(limit);
      }
  }, 1_800_000);

  it(`M4: ${PARALLEL_CALLS} lời gọi song song 366 ngày (pool mặc định 10 kết nối): 0 lỗi, p95 ≤ ${LIMIT.m4} ms`, async () => {
    const service = new AdminDashboardService(db);
    const call = async () => {
      const start = performance.now();
      await service.overview({ kind: 'ToanHeThong' }, RANGE_366);
      return performance.now() - start;
    };
    const round = () =>
      Promise.allSettled(Array.from({ length: PARALLEL_CALLS }, call));
    for (let i = 0; i < 5; i += 1) await round();
    const samples: number[] = [];
    let errors = 0;
    for (let i = 0; i < 30; i += 1)
      for (const outcome of await round())
        if (outcome.status === 'fulfilled') samples.push(outcome.value);
        else errors += 1;
    const summary = summarize(samples);
    results.push({
      ma: 'M4',
      doiTuong: `${PARALLEL_CALLS} lời gọi song song × 30 lượt`,
      phamVi: 'Tất cả',
      khoang: rangeLabel(RANGE_366),
      summary,
      limit: LIMIT.m4,
      loi: errors,
    });
    expect.soft(errors, 'M4 số lời gọi lỗi').toBe(0);
    expect.soft(summary.p95, 'M4 p95').toBeLessThanOrEqual(LIMIT.m4);
  }, 1_800_000);
});
