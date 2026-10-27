// Đo hiệu năng Argon2id của PasswordHasher thật (S6: m=19 MiB, t=2, p=1) trên môi trường đang chạy script.
//
// Cách dùng (cần đã `npm run build` để có dist/):
//   node scripts/bench-argon2.mjs                 máy hiện tại
//   docker compose exec api node scripts/bench-argon2.mjs
//   node scripts/bench-argon2.mjs --runs 50 --json
// Image prod không chứa thư mục scripts/ nên gắn vào khi chạy:
//   docker run --rm -v "<repo>/apps/api/scripts:/app/scripts:ro" <image-prod> node scripts/bench-argon2.mjs
// Biến BENCH_DIST đổi thư mục chứa mã đã build (mặc định ../dist).
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const runsIndex = args.indexOf('--runs');
const runs = runsIndex >= 0 ? Number(args[runsIndex + 1]) : 30;
if (!Number.isInteger(runs) || runs < 5)
  throw new Error('--runs phải là số nguyên ≥ 5');

const dist =
  process.env.BENCH_DIST ?? fileURLToPath(new URL('../dist', import.meta.url));
const { PasswordHasher } = await import(
  pathToFileURL(resolve(dist, 'auth/password/password-hasher.service.js')).href
);
const hasher = new PasswordHasher();

const PASSWORD = 'Mat-khau-thu-1!';
const WRONG = 'Sai-mat-khau-9!';

const elapsed = async (fn) => {
  const start = process.hrtime.bigint();
  await fn();
  return Number(process.hrtime.bigint() - start) / 1e6;
};
const sequential = async (fn) => {
  const times = [];
  for (let i = 0; i < runs; i++) times.push(await elapsed(fn));
  return times;
};
const summary = (times) => {
  const sorted = [...times].sort((a, b) => a - b);
  const at = (p) =>
    sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return {
    n: sorted.length,
    min: sorted[0],
    median: at(0.5),
    p95: at(0.95),
    max: sorted.at(-1),
  };
};
const readText = (path) => {
  try {
    return fs.readFileSync(path, 'utf8').trim();
  } catch {
    return 'n/a';
  }
};

await hasher.onModuleInit(); // tạo băm giả trước, như khi API khởi động
const hash = await hasher.hash(PASSWORD);
for (let i = 0; i < 3; i++) await hasher.hash(PASSWORD); // khởi động nóng

const result = {
  environment: {
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    logicalCpus: os.availableParallelism(),
    totalMemoryGiB: Number((os.totalmem() / 2 ** 30).toFixed(1)),
    cgroupCpuMax: readText('/sys/fs/cgroup/cpu.max'),
    cgroupMemoryMax: readText('/sys/fs/cgroup/memory.max'),
    uvThreadpoolSize: process.env.UV_THREADPOOL_SIZE ?? '4 (mặc định)',
    hashSample: `${hash.slice(0, 30)}… (${hash.length} ký tự)`,
    runsPerMeasurement: runs,
  },
  sequentialMs: {
    hash: summary(await sequential(() => hasher.hash(PASSWORD))),
    verifyCorrect: summary(
      await sequential(() => hasher.verify(hash, PASSWORD)),
    ),
    verifyWrong: summary(await sequential(() => hasher.verify(hash, WRONG))),
    verifyDummy: summary(await sequential(() => hasher.verifyDummy(WRONG))),
  },
  parallel: [],
};

for (const concurrency of [4, 8, 16]) {
  const start = process.hrtime.bigint();
  const each = await Promise.all(
    Array.from({ length: concurrency }, () =>
      elapsed(() => hasher.hash(PASSWORD)),
    ),
  );
  const wallMs = Number(process.hrtime.bigint() - start) / 1e6;
  result.parallel.push({
    concurrency,
    wallMs: Number(wallMs.toFixed(0)),
    medianPerRequestMs: Number(summary(each).median.toFixed(0)),
    hashesPerSecond: Number((concurrency / (wallMs / 1000)).toFixed(1)),
  });
}
result.environment.rssMiB = Math.round(process.memoryUsage().rss / 2 ** 20);

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const fmt = (s) =>
    `n=${s.n} min=${s.min.toFixed(1)} median=${s.median.toFixed(1)} p95=${s.p95.toFixed(1)} max=${s.max.toFixed(1)}`;
  const env = result.environment;
  console.log(
    `node ${env.node} | ${env.platform} | CPU logic=${env.logicalCpus} | RAM=${env.totalMemoryGiB} GiB`,
  );
  console.log(
    `cgroup cpu.max=${env.cgroupCpuMax} memory.max=${env.cgroupMemoryMax} | UV_THREADPOOL_SIZE=${env.uvThreadpoolSize}`,
  );
  console.log(`băm mẫu: ${env.hashSample}`);
  console.log('--- tuần tự (ms)');
  for (const [name, s] of Object.entries(result.sequentialMs))
    console.log(`${name.padEnd(14)} ${fmt(s)}`);
  console.log('--- song song (băm cùng lúc)');
  for (const p of result.parallel) {
    console.log(
      `x${String(p.concurrency).padEnd(3)} tổng=${p.wallMs}ms  trung vị/yêu cầu=${p.medianPerRequestMs}ms  thông lượng=${p.hashesPerSecond}/s`,
    );
  }
  console.log(`RSS cuối = ${env.rssMiB} MiB`);
}
