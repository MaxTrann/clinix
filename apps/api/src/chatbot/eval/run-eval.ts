import { createHash, randomInt } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { AppException } from '../../common/errors/app.exception.js';
import {
  buildSystemPrompt,
  createCanary,
  SYSTEM_PROMPT_LINES,
} from '../answer/system-prompt.js';
import type { AskMessageDto, AskResponse } from '../ask/ask.dto.js';
import { AskService } from '../ask/ask.service.js';
import { AI_API_KEY_PATTERN, AI_DEFAULTS } from '../chatbot.constants.js';
import {
  readChatbotConfig,
  type ChatbotEnv,
} from '../config/chatbot.config.js';
import { RequestLimiter } from '../limit/request-limiter.js';
import {
  SYSTEM_CLOCK,
  type AiProvider,
  type Clock,
  type ProviderName,
} from '../providers/ai-provider.js';
import {
  chainSettingsFromConfig,
  FallbackChain,
} from '../providers/fallback-chain.js';
import { FetchHttpTransport } from '../providers/http-transport.js';
import { createAiProviders } from '../providers/provider-factory.js';
import {
  attemptsOf,
  checkObserved,
  computeReport,
  entityKeysOf,
  finalAttempt,
  formatSummary,
  isAiBound,
  type AttemptRecord,
  type Outcome,
  type Report,
} from './eval-metrics.js';
import {
  CallRecorder,
  createRealPaceClock,
  createVirtualPaceClock,
  Pacer,
  PACING_DEFAULTS,
  RateLimitGuard,
  type PaceClock,
  type RecordedCall,
} from './eval-http.js';
import {
  buildGradingCsv,
  configMismatch,
  createScrubber,
  EvalSetupError,
  EvalStore,
  type RunConfig,
} from './eval-store.js';
import {
  buildTruth,
  createSampleDeps,
  defaultDryRunScript,
  DryRunProvider,
  SampleWorld,
  type DryRunScript,
} from './eval-world.js';
import {
  loadGoldenSet,
  runOrder,
  type GoldenSet,
  type RunItem,
} from './golden-set.js';

// CHẠY BỘ CÂU HỎI CHUẨN của Trợ lý AI (chatbot X2; PLAN chatbot 5.15). Chạy TAY ở máy người có khoá, KHÔNG trong CI: `npm run chatbot:eval -- --out <thư mục>`.
// Dùng MÃ THẬT của sản phẩm: `AskService` (14 bước), `ContextBuilder`, `AnswerReconciler`, `FallbackChain` và hai adapter thật; chỉ thay NGUỒN DỮ LIỆU
// bằng thế giới mẫu trong bộ nhớ (phương án B, không DB). Hỏi tuần tự từng câu, ghi checkpoint sau MỖI câu (chạy tiếp được), giãn lời gọi theo hạn mức,
// dừng hẳn sau 3 lần 429 liên tiếp. KHÔNG in và KHÔNG ghi khoá; thư mục ra phải nằm ngoài repo git.
// `--dry-run`: nhà cung cấp giả, không khoá, không mạng; mọi tệp ra mang cờ "gia" và KHÔNG PHẢI số đo.

export type EvalMode = 'chuoi' | 'groq' | 'gemini';

export interface RunOptions {
  readonly dryRun: boolean;
  readonly only: ProviderName | null;
  readonly resume: boolean;
  readonly retryDuPhong: boolean;
  readonly out: string;
  readonly envFile: string | null;
  readonly gapMs: number;
  readonly groqTpm: number;
  readonly groqTpd: number;
  readonly groqUsedToday: number;
  readonly includeExtra: boolean;
}

export interface Keys {
  readonly groq?: string;
  readonly gemini?: string;
  readonly groqModel?: string;
  readonly geminiModel?: string;
}

/** Phần tiêm vào được để test không cần mạng, không cần chờ thật. */
export interface RunDeps {
  readonly keys?: Keys;
  /** Nếu có thì dùng đúng các lớp này (test), thay vì nhà máy thật hay lớp giả của `--dry-run`. */
  readonly providers?: AiProvider[];
  readonly dryRunScript?: DryRunScript;
  readonly fetchImpl?: typeof globalThis.fetch;
  readonly paceClock?: PaceClock;
  readonly chainClock?: Clock;
  readonly monotonic?: () => number;
  readonly nodeEnv?: string;
  readonly stdout?: (line: string) => void;
  readonly goldenPath?: string;
  readonly pick?: (max: number) => number;
  /** Chỉ dừng sau chừng này câu (test dừng giữa chừng); mặc định không giới hạn. */
  readonly stopAfterAttempts?: number;
}

export type StopReason = 'ngan-sach-ngay' | '429' | 'gioi-han-thu-nghiem';

export interface RunOutcome {
  /** 0 xong; 2 dừng vì hết ngân sách token ngày; 3 dừng vì 429 liên tiếp; 1 lỗi cài đặt (ném `EvalSetupError`). */
  readonly exitCode: 0 | 2 | 3;
  readonly stopReason: StopReason | null;
  readonly report: Report;
  readonly records: readonly AttemptRecord[];
}

const MAX_ATTEMPTS_PER_ITEM = 3;

/** Từ chối chạy thật khi `NODE_ENV=test`: CI và test không bao giờ gọi AI thật (T11, CFG-03). */
export function assertLiveAllowed(nodeEnv: string | undefined): void {
  if (nodeEnv === 'test') {
    throw new EvalSetupError(
      'từ chối chạy thật khi NODE_ENV=test (CI và test không bao giờ gọi AI thật)',
    );
  }
}

const sha256 = (text: string): string =>
  createHash('sha256').update(text).digest('hex');

/** Đọc các trường của dòng log do `AskService` ghi (chỉ có mã, không có nội dung). */
export function parseAskLog(line: string): {
  loai: string | null;
  lop: string | null;
  luat: string | null;
} {
  const pick = (name: string): string | null =>
    new RegExp(`${name}=([A-Za-z0-9_]+)`).exec(line)?.[1] ?? null;
  return { loai: pick('loai'), lop: pick('lop'), luat: pick('luat') };
}

function statusOfFailure(
  kind: string,
  httpStatus: number | undefined,
): number | null {
  if (httpStatus !== undefined) return httpStatus;
  switch (kind) {
    case 'rateLimited':
      return 429;
    case 'server':
      return 503;
    case 'rejected':
      return 400;
    case 'timeout':
    case 'network':
      return null;
    default:
      return 200;
  }
}

function sum(values: readonly (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0
    ? null
    : present.reduce((total, value) => total + value, 0);
}

function buildEnv(keys: Keys): ChatbotEnv {
  return {
    AI_ENABLED: AI_DEFAULTS.enabled,
    ...(keys.groq === undefined ? {} : { GROQ_API_KEY: keys.groq }),
    ...(keys.gemini === undefined ? {} : { GEMINI_API_KEY: keys.gemini }),
    GROQ_MODEL: keys.groqModel ?? AI_DEFAULTS.groqModel,
    GEMINI_MODEL: keys.geminiModel ?? AI_DEFAULTS.geminiModel,
    GROQ_BASE_URL: AI_DEFAULTS.groqBaseUrl,
    GEMINI_BASE_URL: AI_DEFAULTS.geminiBaseUrl,
    AI_GROQ_TIMEOUT_MS: AI_DEFAULTS.groqTimeoutMs,
    AI_GEMINI_TIMEOUT_MS: AI_DEFAULTS.geminiTimeoutMs,
    AI_TOTAL_TIMEOUT_MS: AI_DEFAULTS.totalTimeoutMs,
    AI_COOLDOWN_SECONDS: AI_DEFAULTS.cooldownSeconds,
    AI_IP_PER_MINUTE: AI_DEFAULTS.ipPerMinute,
    AI_IP_PER_DAY: AI_DEFAULTS.ipPerDay,
    AI_MAX_CONCURRENT: AI_DEFAULTS.maxConcurrent,
    AI_GROQ_PER_MINUTE: AI_DEFAULTS.groqPerMinute,
    AI_GEMINI_PER_MINUTE: AI_DEFAULTS.geminiPerMinute,
  };
}

function modeOf(options: RunOptions): EvalMode {
  return options.only ?? 'chuoi';
}

/** Chạy bộ câu hỏi chuẩn. Ném `EvalSetupError` khi cài đặt sai (thư mục ra, khoá, checkpoint cũ không khớp). */
export async function runEval(
  options: RunOptions,
  deps: RunDeps = {},
): Promise<RunOutcome> {
  const stdout =
    deps.stdout ?? ((line: string) => void process.stdout.write(`${line}\n`));
  const keys = deps.keys ?? {};
  const secrets = [keys.groq, keys.gemini].filter(
    (value): value is string => value !== undefined,
  );
  const scrubber = createScrubber(secrets);
  const store = new EvalStore(resolve(options.out), scrubber);
  store.prepare();

  const { set, sha256: goldenSha256 } = loadGoldenSet(deps.goldenPath);
  const order = runOrder(set, { includeExtra: options.includeExtra });
  const thatHayGia = options.dryRun ? 'gia' : 'that';

  // --- nhà cung cấp -----------------------------------------------------------------------------------------------------------------
  const monotonic = deps.monotonic ?? (() => performance.now());
  const paceClock =
    deps.paceClock ??
    (options.dryRun ? createVirtualPaceClock() : createRealPaceClock());
  const recorder = new CallRecorder(
    deps.fetchImpl ?? ((input, init) => globalThis.fetch(input, init)),
    monotonic,
  );
  const chainWarnings = new Map<string, number>();
  const env = buildEnv(keys);
  const config = readChatbotConfig(env);

  let providers: AiProvider[];
  if (deps.providers !== undefined) {
    providers = deps.providers;
  } else if (options.dryRun) {
    const script = deps.dryRunScript ?? defaultDryRunScript(set);
    const sink = (
      call: Parameters<
        NonNullable<ConstructorParameters<typeof DryRunProvider>[2]>
      >[0],
    ): void => {
      const failure = call.failure;
      recorder.record({
        layer: call.layer,
        status:
          failure === null
            ? 200
            : statusOfFailure(failure.kind, failure.httpStatus),
        ms: 0,
        tokensIn: failure === null ? call.tokensIn : null,
        tokensOut: failure === null ? call.tokensOut : null,
        tokensTotal: failure === null ? call.tokensIn + call.tokensOut : null,
        retryAfterMs: null,
        remainingTokens: null,
        resetMs: null,
        error:
          failure?.kind === 'timeout'
            ? 'timeout'
            : failure?.kind === 'network'
              ? 'network'
              : null,
      });
    };
    providers = [
      new DryRunProvider('groq', script, sink),
      new DryRunProvider('gemini', script, sink),
    ];
  } else {
    const nodeEnv = deps.nodeEnv ?? process.env.NODE_ENV;
    assertLiveAllowed(nodeEnv);
    // Chỗ DUY NHẤT tạo adapter thật là nhà máy của P1; truyền môi trường khác 'test' để nó tạo
    providers = createAiProviders({
      config,
      nodeEnv: nodeEnv ?? 'development',
      transport: new FetchHttpTransport(recorder.fetch),
    });
  }
  if (options.only !== null)
    providers = providers.filter((provider) => provider.name === options.only);
  if (!options.dryRun && !providers.some((provider) => provider.configured)) {
    throw new EvalSetupError(
      options.only === null
        ? 'chưa có khoá nào (GROQ_API_KEY, GEMINI_API_KEY): đặt khoá ở biến môi trường hay .env'
        : `chưa có khoá cho lớp ${options.only}: đặt khoá ở biến môi trường hay .env`,
    );
  }
  const groqActive = providers.some((provider) => provider.name === 'groq');

  // --- cấu hình lần chạy và checkpoint ---------------------------------------------------------------------------------------------
  const runConfig: RunConfig = {
    phienBan: 1,
    thatHayGia,
    che: modeOf(options),
    modelGroq: env.GROQ_MODEL,
    modelGemini: env.GEMINI_MODEL,
    goldenSha256,
    promptSha256: sha256(SYSTEM_PROMPT_LINES.join('\n')),
    coMucPhu: options.includeExtra,
    node: process.version,
    batDau: new Date().toISOString(),
  };
  const existing = store.readLines();
  const previousRun = existing.find((line) => line.kind === 'run');
  if (existing.length > 0) {
    if (!options.resume) {
      throw new EvalSetupError(
        'đã có checkpoint trong --out: dùng --resume để chạy tiếp hoặc chọn --out khác',
      );
    }
    if (previousRun?.kind === 'run') {
      const mismatch = configMismatch(previousRun.config, runConfig);
      if (mismatch !== null)
        throw new EvalSetupError(`không --resume được vì cấu hình ${mismatch}`);
    }
  } else if (options.resume) {
    throw new EvalSetupError('--resume nhưng chưa có checkpoint trong --out');
  }
  if (previousRun === undefined)
    store.append({ kind: 'run', config: runConfig });
  const records: AttemptRecord[] = existing.filter(
    (line): line is AttemptRecord => line.kind === 'attempt',
  );

  // --- dựng sản phẩm thật trên thế giới mẫu ----------------------------------------------------------------------------------------
  const world = new SampleWorld();
  const truth = await buildTruth(world);
  // Chạy khô dùng đồng hồ ẢO nối với bộ giãn lời gọi (cooldown 60 giây của chuỗi trôi cùng thời gian ảo, không chờ thật); chạy thật dùng đồng hồ hệ thống
  const chainClock: Clock =
    deps.chainClock ??
    (options.dryRun
      ? { now: () => paceClock.now(), setTimer: () => () => undefined }
      : SYSTEM_CLOCK);
  const sample = createSampleDeps(world, chainClock);
  const chain = new FallbackChain(
    providers,
    chainSettingsFromConfig(config),
    chainClock,
    {
      warn: (message) =>
        chainWarnings.set(message, (chainWarnings.get(message) ?? 0) + 1),
    },
  );
  const canary = createCanary(deps.pick ?? ((max) => randomInt(max)));
  const systemPrompt = buildSystemPrompt(canary);
  let lastLog = '';
  const service = new AskService({
    limiter: new RequestLimiter({ now: () => chainClock.now() }),
    context: sample.context,
    chain,
    reconciler: sample.reconciler,
    branches: sample.branches,
    prompt: { canary, systemPrompt },
    clock: chainClock,
    logger: { log: (message) => void (lastLog = message) },
  });

  // Bộ chạy KHÔNG được tự đụng trần "mỗi phút" của sản phẩm (Groq 20, Gemini 10): chạm trần thì chuỗi bỏ qua lớp và ra DuPhong giả, làm sai CB5.
  // Nên khoảng cách tối thiểu tự nâng lên 60 giây chia trần nhỏ nhất của các lớp đang chạy (Gemini: 6 giây).
  const perMinute = {
    groq: config.groq.perMinute,
    gemini: config.gemini.perMinute,
  };
  const capGapMs =
    providers.length === 0
      ? 0
      : Math.ceil(
          60_000 /
            Math.min(...providers.map((provider) => perMinute[provider.name])),
        );
  const gapMs = Math.max(options.gapMs, capGapMs);
  const pacer = new Pacer(paceClock, {
    gapMs,
    groqTpm: options.groqTpm,
    groqTpd: options.groqTpd,
    groqUsedToday: options.groqUsedToday,
    groqActive,
  });
  const guard = new RateLimitGuard();
  const total = order.length;
  stdout(
    `Chạy ${String(total)} mục (${thatHayGia === 'gia' ? 'CHẠY KHÔ, nhà cung cấp giả' : 'nhà cung cấp THẬT'}), chế độ ${modeOf(options)}, bộ câu ${goldenSha256.slice(0, 12)}…, cách nhau tối thiểu ${String(gapMs)} ms`,
  );

  let stopReason: StopReason | null = null;
  let done = 0;
  for (const item of order) {
    const prior = attemptsOf(records, item.ma);
    const aiBound = isAiBound(item.cauHoi);
    const last = prior[prior.length - 1];
    let lan: number;
    if (last === undefined) lan = 1;
    else if (
      options.retryDuPhong &&
      aiBound &&
      last.ketQua === 'DuPhong' &&
      prior.length < MAX_ATTEMPTS_PER_ITEM
    ) {
      lan = last.lan + 1;
    } else continue;

    if (
      deps.stopAfterAttempts !== undefined &&
      done >= deps.stopAfterAttempts
    ) {
      stopReason = 'gioi-han-thu-nghiem';
      break;
    }
    if (!pacer.affords(aiBound)) {
      stopReason = 'ngan-sach-ngay';
      stdout(
        `Dừng trước ${item.ma}: ước ${String(PACING_DEFAULTS.estimateGroqTokens)} token nữa sẽ vượt ngân sách ngày ${String(options.groqTpd)} (đã dùng ${String(pacer.groqTokensToday)}). Chạy tiếp bằng --resume khi hạn mức hồi.`,
      );
      break;
    }
    const waited = await pacer.before(aiBound);
    recorder.drain();
    lastLog = '';
    const attempt = await askOne(item, lan, aiBound, waited);
    records.push(attempt);
    store.append(attempt);
    pacer.after(attempt.goiHttp);
    guard.record(attempt.goiHttp);
    done += 1;
    stdout(
      `[${String(records.length)}] ${item.ma}${lan > 1 ? `#${String(lan)}` : ''} ${attempt.ketQua} ${attempt.lop ?? '-'} ${String(attempt.thoiGianMs)} ms: ${attempt.kiemTra.ketQua}`,
    );
    const tripped = guard.tripped();
    if (tripped !== null) {
      stopReason = '429';
      stdout(
        `Dừng hẳn: lớp ${tripped} trả 429 ${String(PACING_DEFAULTS.max429InARow)} lần liên tiếp. Chờ hạn mức hồi rồi chạy tiếp bằng --resume.`,
      );
      break;
    }
  }

  async function askOne(
    item: RunItem,
    lan: number,
    aiBound: boolean,
    waited: number,
  ): Promise<AttemptRecord> {
    const body = {
      cauHoi: item.cauHoi,
      ...(item.lichSu === undefined
        ? {}
        : {
            lichSu: item.lichSu.map((turn) => ({
              vai: turn.vai,
              noiDung: turn.noiDung,
            })),
          }),
    } as AskMessageDto;
    const started = monotonic();
    let response: AskResponse | null = null;
    let maLoi: string | null = null;
    try {
      // Mỗi lần hỏi một IP giả riêng để bộ đếm IP thật của sản phẩm (5 câu mỗi phút) không chặn bộ chạy tuần tự
      response = await service.ask({
        body,
        ip: `eval-${item.ma}-${String(lan)}`,
      });
    } catch (error) {
      maLoi = error instanceof AppException ? error.maLoi : 'LOI_KHONG_RO';
    }
    const thoiGianMs = Math.round(monotonic() - started);
    const calls: RecordedCall[] = recorder.drain();
    const log = parseAskLog(lastLog);
    const outcome: Outcome = response?.ketQua ?? 'LoiHttp';
    const doan = response?.doan ?? [];
    const chuyenKhoaIds = (response?.chuyenKhoaGoiY ?? []).map(
      (entry) => entry.chuyenKhoaId,
    );
    const checked = checkObserved(
      item.main?.kyVong ?? null,
      { ketQua: outcome, doan, chuyenKhoaIds },
      aiBound,
      { truth, canary, systemPrompt },
    );
    return {
      kind: 'attempt',
      ma: item.ma,
      phu: item.phu,
      nhom: item.nhom,
      lan,
      aiBound,
      coLichSu: item.lichSu !== undefined,
      ketQua: outcome,
      maLoi,
      loai: log.loai,
      lop: log.lop,
      luat: log.luat,
      thoiGianMs,
      daCho: waited,
      goiHttp: calls,
      tokenVao: sum(calls.map((call) => call.tokensIn)),
      tokenRa: sum(calls.map((call) => call.tokensOut)),
      chuyenKhoaIds,
      thucThe: entityKeysOf(doan),
      kinSo: checked.kinSo,
      tenThucThe: checked.tenThucThe,
      kiemTra: checked.kiemTra,
      doan,
    };
  }

  // --- ghi kết quả -----------------------------------------------------------------------------------------------------------------
  const report = computeReport(set, records);
  const hoanThanh = stopReason === null;
  store.writeResults(
    buildResults(runConfig, set, records, report, {
      hoanThanh,
      dungVi: stopReason,
      tokenGroqDaDung: pacer.groqTokensThisRun,
      canhBao: Object.fromEntries(chainWarnings),
    }),
  );
  store.writeGrading(
    buildGradingCsv(set, records, truth, report.mauKiemTayCB2),
  );
  for (const line of formatSummary(report, thatHayGia)) stdout(line);
  stdout(
    `Đã ghi: ${store.resultsPath}, ${store.gradingPath}, ${store.checkpointPath}`,
  );
  const exitCode =
    stopReason === 'ngan-sach-ngay' ? 2 : stopReason === '429' ? 3 : 0;
  return { exitCode, stopReason, report, records };
}

/** `results.json`: số liệu, mã câu, loại phản hồi, mã luật. KHÔNG có chữ câu trả lời và KHÔNG có khoá. */
function buildResults(
  config: RunConfig,
  set: GoldenSet,
  records: readonly AttemptRecord[],
  report: Report,
  extra: {
    hoanThanh: boolean;
    dungVi: StopReason | null;
    tokenGroqDaDung: number;
    canhBao: Record<string, number>;
  },
): unknown {
  const view = (attempt: AttemptRecord): unknown => ({
    ma: attempt.ma,
    nhom: attempt.nhom,
    lan: attempt.lan,
    aiBound: attempt.aiBound,
    coLichSu: attempt.coLichSu,
    ketQua: attempt.ketQua,
    maLoi: attempt.maLoi,
    loai: attempt.loai,
    lop: attempt.lop,
    luat: attempt.luat,
    thoiGianMs: attempt.thoiGianMs,
    daChoMs: attempt.daCho,
    soLoiGoiHttp: attempt.goiHttp.length,
    maHttp: attempt.goiHttp.map((call) => call.status),
    tokenVao: attempt.tokenVao,
    tokenRa: attempt.tokenRa,
    chuyenKhoaIds: attempt.chuyenKhoaIds,
    thucThe: attempt.thucThe,
    kinSo: attempt.kinSo,
    tenThucThe: attempt.tenThucThe,
    tuDong: attempt.kiemTra.ketQua,
    lyDo: attempt.kiemTra.lyDo,
  });
  const finals = [...set.cau, ...set.phu].flatMap((item) => {
    const attempt = finalAttempt(records, item.ma);
    return attempt === undefined ? [] : [attempt];
  });
  return {
    phienBan: 1,
    thatHayGia: config.thatHayGia,
    canhBaoGia:
      config.thatHayGia === 'gia'
        ? 'KHÔNG PHẢI SỐ ĐO THẬT: chạy khô bằng nhà cung cấp giả'
        : undefined,
    che: config.che,
    cauHinh: config,
    hoanThanh: extra.hoanThanh,
    dungVi: extra.dungVi,
    tokenGroqDaDungLanChayNay: extra.tokenGroqDaDung,
    canhBaoChuoi: extra.canhBao,
    chiSo: report.chiSo,
    theoNhom: report.theoNhom,
    doTre: report.doTre,
    doTreTheoLop: report.doTreTheoLop,
    coLichSu: report.coLichSu,
    a2TheoLuat: report.a2TheoLuat,
    cb4TheoLop: report.cb4TheoLop,
    cb4KhongDau: report.cb4KhongDau,
    mauKiemTayCB2: report.mauKiemTayCB2,
    chuaChay: report.chuaChay,
    cauCuoi: finals.map(view),
    moiLanHoi: records.map(view),
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Dòng lệnh

const USAGE = [
  'Dùng: npm run chatbot:eval -- --out <thư mục NGOÀI repo> [tuỳ chọn]',
  '  --dry-run              chạy khô: nhà cung cấp giả, không khoá, không mạng (KHÔNG phải số đo)',
  '  --only groq|gemini     chỉ một lớp (mặc định cả chuỗi Groq rồi Gemini)',
  '  --resume               chạy tiếp từ checkpoint trong --out',
  '  --retry-duphong        (kèm --resume) hỏi lại các câu mà lần cuối là DuPhong',
  '  --env-file <đường dẫn> tệp .env để đọc GROQ_API_KEY, GEMINI_API_KEY (mặc định <gốc repo>/.env nếu có)',
  `  --gap-ms <n>           khoảng cách tối thiểu giữa hai câu cần AI (mặc định ${String(PACING_DEFAULTS.gapMs)})`,
  `  --groq-tpm <n>         giả định token Groq mỗi phút (mặc định ${String(PACING_DEFAULTS.groqTpm)})`,
  `  --groq-tpd <n>         giả định token Groq mỗi ngày (mặc định ${String(PACING_DEFAULTS.groqTpd)})`,
  '  --groq-used-today <n>  token Groq đã dùng trong cửa sổ hạn mức hiện tại (đọc ở console)',
  '  --without-extra        bỏ năm câu của mục phụ',
].join('\n');

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

function numberOf(
  name: string,
  value: string | undefined,
  min: number,
): number {
  const parsed = Number(value);
  if (value === undefined || !Number.isInteger(parsed) || parsed < min) {
    throw new UsageError(`${name} cần một số nguyên từ ${String(min)} trở lên`);
  }
  return parsed;
}

export function parseArgs(argv: readonly string[]): RunOptions {
  let out: string | null = null;
  let dryRun = false;
  let only: ProviderName | null = null;
  let resume = false;
  let retryDuPhong = false;
  let envFile: string | null = null;
  let gapMs: number = PACING_DEFAULTS.gapMs;
  let groqTpm: number = PACING_DEFAULTS.groqTpm;
  let groqTpd: number = PACING_DEFAULTS.groqTpd;
  let groqUsedToday = 0;
  let includeExtra = true;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = (): string | undefined => argv[++index];
    switch (arg) {
      case '--dry-run':
        dryRun = true;
        break;
      case '--resume':
        resume = true;
        break;
      case '--retry-duphong':
        retryDuPhong = true;
        resume = true;
        break;
      case '--without-extra':
        includeExtra = false;
        break;
      case '--out':
        out = next() ?? null;
        break;
      case '--env-file':
        envFile = next() ?? null;
        break;
      case '--only': {
        const value = next();
        if (value !== 'groq' && value !== 'gemini')
          throw new UsageError('--only chỉ nhận groq hoặc gemini');
        only = value;
        break;
      }
      case '--gap-ms':
        gapMs = numberOf('--gap-ms', next(), 0);
        break;
      case '--groq-tpm':
        groqTpm = numberOf('--groq-tpm', next(), 1);
        break;
      case '--groq-tpd':
        groqTpd = numberOf('--groq-tpd', next(), 1);
        break;
      case '--groq-used-today':
        groqUsedToday = numberOf('--groq-used-today', next(), 0);
        break;
      default:
        throw new UsageError(`tham số lạ: ${String(arg)}`);
    }
  }
  if (out === null || out === '') throw new UsageError('thiếu --out <thư mục>');
  if (envFile === null && argv.includes('--env-file'))
    throw new UsageError('--env-file cần một đường dẫn');
  return {
    dryRun,
    only,
    resume,
    retryDuPhong,
    out,
    envFile,
    gapMs,
    groqTpm,
    groqTpd,
    groqUsedToday,
    includeExtra,
  };
}

export interface MainIo {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly cwd: string;
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
  readonly exists: (path: string) => boolean;
  readonly readFile: (path: string) => string;
}

/**
 * Lấy khoá và tên model: biến môi trường thắng tệp `.env`. Chỉ đọc đúng bốn tên; KHÔNG in giá trị (kể cả độ dài).
 * Tệp `--env-file` chỉ định mà không có thì lỗi; mặc định `<gốc repo>/.env` (hai cấp trên `apps/api`) chỉ dùng nếu có.
 */
export function loadKeys(
  envFile: string | null,
  io: Pick<MainIo, 'env' | 'cwd' | 'exists' | 'readFile'>,
): Keys {
  let fromFile: Record<string, string | undefined> = {};
  const path = envFile ?? resolve(io.cwd, '..', '..', '.env');
  if (envFile !== null && !io.exists(path))
    throw new EvalSetupError(`không thấy tệp --env-file: ${path}`);
  if (io.exists(path)) fromFile = parseEnv(io.readFile(path));
  const read = (name: string): string | undefined => {
    const value = io.env[name] ?? fromFile[name];
    return value === undefined || value === '' ? undefined : value;
  };
  const keyOf = (name: string): string | undefined => {
    const value = read(name);
    if (value !== undefined && !AI_API_KEY_PATTERN.test(value)) {
      throw new EvalSetupError(
        `${name} sai dạng (chỉ ASCII in được, không khoảng trắng, tối đa 512 ký tự)`,
      );
    }
    return value;
  };
  const groq = keyOf('GROQ_API_KEY');
  const gemini = keyOf('GEMINI_API_KEY');
  const groqModel = read('GROQ_MODEL');
  const geminiModel = read('GEMINI_MODEL');
  return {
    ...(groq === undefined ? {} : { groq }),
    ...(gemini === undefined ? {} : { gemini }),
    ...(groqModel === undefined ? {} : { groqModel }),
    ...(geminiModel === undefined ? {} : { geminiModel }),
  };
}

/** Điểm vào của dòng lệnh. Trả mã thoát: 0 xong, 1 sai cài đặt, 2 hết ngân sách ngày, 3 dừng vì 429 liên tiếp. */
export async function main(
  argv: readonly string[],
  io: MainIo,
  deps: RunDeps = {},
): Promise<number> {
  try {
    if (argv.includes('--help') || argv.includes('-h')) {
      io.stdout(USAGE);
      return 0;
    }
    const options = parseArgs(argv);
    // Chạy khô KHÔNG đọc khoá và không đọc tệp .env
    const keys = options.dryRun
      ? {}
      : (deps.keys ?? loadKeys(options.envFile, io));
    const outcome = await runEval(options, {
      ...deps,
      keys,
      stdout: io.stdout,
    });
    return outcome.exitCode;
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr(`${error.message}\n${USAGE}`);
      return 1;
    }
    if (error instanceof EvalSetupError) {
      io.stderr(error.message);
      return 1;
    }
    io.stderr(
      `Lỗi không dự kiến: ${error instanceof Error ? error.name : 'không rõ'}`,
    );
    return 1;
  }
}

function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return (
    resolve(fileURLToPath(import.meta.url)).toLowerCase() ===
    resolve(entry).toLowerCase()
  );
}

if (isEntryPoint()) {
  void main(process.argv.slice(2), {
    env: process.env,
    cwd: process.cwd(),
    stdout: (line) => void process.stdout.write(`${line}\n`),
    stderr: (line) => void process.stderr.write(`${line}\n`),
    exists: (path) => existsSync(path),
    readFile: (path) => readFileSync(path, 'utf8'),
  }).then(
    (code) => {
      process.exitCode = code;
    },
    () => {
      process.exitCode = 1;
    },
  );
}
