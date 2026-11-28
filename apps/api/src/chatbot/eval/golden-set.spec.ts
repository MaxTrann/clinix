import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { detectAccountQuestion } from '../safety/account.rules.js';
import { detectEmergency } from '../safety/emergency.rules.js';
import { detectOutOfScope } from '../safety/out-of-scope.rules.js';
import { normalizeQuestion } from '../safety/question-normalizer.js';
import { isAiBound } from './eval-metrics.js';
import {
  SampleWorld,
  buildTruth,
  createSampleDeps,
  type Truth,
} from './eval-world.js';
import { toPlaceholderRef } from '../context/placeholder.js';
import {
  GROUPS,
  GROUP_SIZES,
  GoldenSetError,
  defaultGoldenSetPath,
  loadGoldenSet,
  parseGoldenSet,
  runOrder,
  type GoldenItem,
} from './golden-set.js';

// Test của bộ câu hỏi chuẩn (chatbot X2): cơ cấu, tính hợp lệ, khớp với LUẬT THẬT của B1 và với thế giới mẫu. Không mạng, không DB, không khoá.

/**
 * SHA-256 của `golden-set.json` (đã đổi CRLF về LF) sau khi Đại DUYỆT TRỰC TIẾP nội dung (28/11/2026, "được cả ba"): 30 câu, năm câu phụ, và ba chữ đổi sau khi
 * chạy khô phát hiện kỳ vọng không với tới được (G03, G08 thêm "mẫu" vào tên dịch vụ; L02 thêm "khoa Thần kinh có phù hợp không" vào lượt người dùng), trước mọi lời gọi thật.
 * Đổi bất kỳ chữ nào của tệp là ca khoá đỏ: phải duyệt lại và ghi lý do ở TRACKING.
 */
const APPROVED_SHA256 =
  '6ff278e90c498bd2cb6fd0a2cc8e4ee745007d84c4616a374e155835ed0aae54';

// Chuẩn hoá giống bước 2 của AskService (NFC, bỏ ký tự điều khiển, cắt khoảng trắng)
function norm(text: string): string {
  const result = normalizeQuestion(text);
  if (!result.ok) throw new Error(`câu không chuẩn hoá được: ${result.code}`);
  return result.text;
}

const loaded = loadGoldenSet();
const { set } = loaded;
const byCode = (ma: string): GoldenItem => {
  const item = set.cau.find((candidate) => candidate.ma === ma);
  if (item === undefined) throw new Error(`không có ${ma}`);
  return item;
};

describe('X2-01: golden-set.json', () => {
  it('X2-01: đúng cơ cấu 8, 8, 5, 4, 3, 2; mã G01 đến G30 liền nhau; năm mã phụ', () => {
    expect(set.cau).toHaveLength(30);
    for (const group of GROUPS) {
      expect(set.cau.filter((item) => item.nhom === group)).toHaveLength(
        GROUP_SIZES[group],
      );
    }
    expect(set.cau.map((item) => item.ma)).toEqual(
      Array.from(
        { length: 30 },
        (_v, index) => `G${String(index + 1).padStart(2, '0')}`,
      ),
    );
    expect(set.phu.map((item) => item.ma)).toEqual([
      'P01',
      'L01',
      'L02',
      'L03',
      'L04',
    ]);
  });

  it('X2-01: câu hỏi 1 đến 500 điểm mã, không trùng; lịch sử tối đa 6 lượt mỗi lượt tối đa 800 điểm mã (parseGoldenSet đã kiểm)', () => {
    const all = [...set.cau, ...set.phu];
    expect(new Set(all.map((item) => item.cauHoi.toLowerCase())).size).toBe(
      all.length,
    );
    expect(
      Math.max(...all.map((item) => Array.from(item.cauHoi).length)),
    ).toBeLessThanOrEqual(500);
    expect(Math.max(...all.map((item) => item.lichSu?.length ?? 0))).toBe(6);
  });

  it('X2-01: mỗi nhóm có kiểu kiểm đúng theo bảng PLAN 5.15', () => {
    for (const item of set.cau.filter((candidate) => candidate.nhom === 'A')) {
      expect(item.kyVong.ketQua).toEqual(['TraLoi']);
      expect(item.kyVong.nhac?.length ?? 0).toBeGreaterThan(0);
    }
    for (const item of set.cau.filter((candidate) => candidate.nhom === 'B')) {
      expect(item.kyVong.ketQua).toEqual(['GoiY']);
      expect(item.kyVong.chapNhan?.length ?? 0).toBeGreaterThan(0);
    }
    for (const item of set.cau.filter((candidate) => candidate.nhom === 'C'))
      expect(item.kyVong.ketQua).toEqual(['NgoaiPhamVi']);
    for (const item of set.cau.filter((candidate) => candidate.nhom === 'D')) {
      expect(item.kyVong).toMatchObject({
        ketQua: ['KhanCap'],
        canCo115: true,
      });
    }
    for (const item of set.cau.filter((candidate) => candidate.nhom === 'E')) {
      expect(item.kyVong).toMatchObject({
        khongLoLoiNhac: true,
        khongChuCam: true,
        khongUrl: true,
      });
      expect(item.kyVong.ketQua).not.toContain('DuPhong');
    }
    for (const item of set.cau.filter((candidate) => candidate.nhom === 'F')) {
      expect(item.kyVong).toMatchObject({
        ketQua: ['TraLoi', 'KhongKhopDuLieu'],
        khongUrl: true,
      });
    }
  });

  it('X2-01: có ít nhất ba câu gợi ý không dấu hay lỏng lẻo (G13 đến G15) và G28 mang lịch sử', () => {
    const noAccent = set.cau.filter(
      (item) =>
        item.nhom === 'B' &&
        !/[ăâđêôơưáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ]/i.test(item.cauHoi),
    );
    expect(noAccent.map((item) => item.ma)).toEqual(['G13', 'G14', 'G15']);
    expect(byCode('G28').lichSu).toHaveLength(2);
  });

  it('X2-01: thứ tự chạy xen kẽ nhóm A, B, C, D, E, F, A, … rồi mục phụ; --without-extra bỏ mục phụ', () => {
    const order = runOrder(set, { includeExtra: true });
    expect(order).toHaveLength(35);
    expect(order.slice(0, 7).map((item) => item.ma)).toEqual([
      'G01',
      'G09',
      'G17',
      'G22',
      'G26',
      'G29',
      'G02',
    ]);
    expect(order.slice(-5).map((item) => item.ma)).toEqual([
      'P01',
      'L01',
      'L02',
      'L03',
      'L04',
    ]);
    expect(new Set(order.map((item) => item.ma)).size).toBe(35);
    expect(runOrder(set, { includeExtra: false })).toHaveLength(30);
  });

  it('X2-01: đường dẫn mặc định trỏ tới tệp ở src/ và SHA-256 là của nguyên văn tệp', () => {
    expect(defaultGoldenSetPath().replace(/\\/g, '/')).toMatch(
      /apps\/api\/src\/chatbot\/eval\/golden-set\.json$/,
    );
    expect(loaded.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(defaultGoldenSetPath(), 'utf8').length).toBeGreaterThan(
      1000,
    );
  });

  it('X2-01: nội dung 30 câu đã duyệt không đổi (khoá SHA-256)', () => {
    expect(loaded.sha256).toBe(APPROVED_SHA256);
  });

  it('X2-01: băm gắn với nội dung, không với kiểu xuống dòng (bản sao CRLF cho cùng băm; đổi một chữ thì băm đổi)', () => {
    const text = readFileSync(defaultGoldenSetPath(), 'utf8');
    const directory = mkdtempSync(join(tmpdir(), 'clinix-x2-golden-'));
    try {
      const crlf = join(directory, 'crlf.json');
      writeFileSync(crlf, text.replace(/\n/g, '\r\n'));
      expect(loadGoldenSet(crlf).sha256).toBe(APPROVED_SHA256);
      const edited = join(directory, 'edited.json');
      writeFileSync(edited, text.replace('Xin chào', 'Xin chao'));
      expect(loadGoldenSet(edited).sha256).not.toBe(APPROVED_SHA256);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('X2-01 (ca âm): file hỏng thì GoldenSetError nêu đúng chỗ', () => {
    const base = JSON.parse(readFileSync(defaultGoldenSetPath(), 'utf8')) as {
      cau: Record<string, unknown>[];
      phu: Record<string, unknown>[];
    };
    const clone = (): typeof base =>
      JSON.parse(JSON.stringify(base)) as typeof base;
    const tooFew = clone();
    tooFew.cau.pop();
    expect(() => parseGoldenSet(tooFew)).toThrow(/phải có đúng 30 câu/);
    const wrongGroup = clone();
    (wrongGroup.cau[0] as { nhom: string }).nhom = 'B';
    expect(() => parseGoldenSet(wrongGroup)).toThrow(/nhóm A phải có 8 câu/);
    const duplicateCode = clone();
    (duplicateCode.cau[1] as { ma: string }).ma = 'G01';
    expect(() => parseGoldenSet(duplicateCode)).toThrow(/phải mang mã G02/);
    const badPlaceholder = clone();
    (badPlaceholder.cau[0] as { kyVong: { nhac: string[] } }).kyVong.nhac = [
      'XX:1',
    ];
    expect(() => parseGoldenSet(badPlaceholder)).toThrow(/chỗ giữ sai dạng/);
    const badId = clone();
    (badId.cau[8] as { kyVong: { chapNhan: string[] } }).kyVong.chapNhan = [
      'abc',
    ];
    expect(() => parseGoldenSet(badId)).toThrow(/id sai dạng/);
    const duplicateQuestion = clone();
    (duplicateQuestion.phu[0] as { cauHoi: string }).cauHoi = (
      duplicateQuestion.cau[0] as { cauHoi: string }
    ).cauHoi;
    expect(() => parseGoldenSet(duplicateQuestion)).toThrow(
      /trùng một câu khác/,
    );
    const tooLong = clone();
    (tooLong.cau[0] as { cauHoi: string }).cauHoi = 'a'.repeat(501);
    expect(() => parseGoldenSet(tooLong)).toThrow(/quá 500 điểm mã/);
    const sevenTurns = clone();
    (sevenTurns.cau[27] as { lichSu: unknown[] }).lichSu = Array.from(
      { length: 7 },
      () => ({ vai: 'NguoiDung', noiDung: 'x' }),
    );
    expect(() => parseGoldenSet(sevenTurns)).toThrow(/từ 1 đến 6 lượt/);
    expect(() => parseGoldenSet(null)).toThrow(GoldenSetError);
    expect(() => parseGoldenSet({ phienBan: 0, cau: [], phu: [] })).toThrow(
      /phienBan/,
    );
  });
});

describe('X2-02: bộ câu khớp với luật THẬT của B1', () => {
  const hits = (text: string) => ({
    emergency: detectEmergency(norm(text)),
    account: detectAccountQuestion(norm(text)),
    outOfScope: detectOutOfScope(norm(text)),
  });

  it('X2-02: bốn câu khẩn cấp G22 đến G25 đều do luật tất định bắt', () => {
    for (const item of set.cau.filter((candidate) => candidate.nhom === 'D')) {
      expect(hits(item.cauHoi).emergency, item.ma).not.toBeNull();
    }
  });

  it('X2-02: G17 đến G19 do luật ngoài phạm vi bắt; G20 và G21 KHÔNG có từ khoá của luật nào (ít nhất 2 câu không từ khoá)', () => {
    for (const ma of ['G17', 'G18', 'G19']) {
      const result = hits(byCode(ma).cauHoi);
      expect(result.outOfScope, ma).not.toBeNull();
      expect(result.emergency, ma).toBeNull();
    }
    for (const ma of ['G20', 'G21']) {
      const result = hits(byCode(ma).cauHoi);
      expect(result, ma).toEqual({
        emergency: null,
        account: null,
        outOfScope: null,
      });
      expect(isAiBound(byCode(ma).cauHoi), ma).toBe(true);
    }
  });

  it('X2-02: mọi câu còn lại (nhóm A, B, E, F và mục phụ) không chạm luật nào nên đều đi qua chuỗi AI; có đúng 23 câu chính đi qua AI', () => {
    const others = [
      ...set.cau.filter((item) => ['A', 'B', 'E', 'F'].includes(item.nhom)),
      ...set.phu,
    ];
    for (const item of others) {
      expect(hits(item.cauHoi), item.ma).toEqual({
        emergency: null,
        account: null,
        outOfScope: null,
      });
    }
    expect(set.cau.filter((item) => isAiBound(item.cauHoi))).toHaveLength(23);
  });

  it('X2-02 (ca âm): đổi G20 thành câu có từ khoá thì phát hiện được; câu khẩn cấp gõ không dấu vẫn bắt', () => {
    expect(
      hits('Tôi đau lưng dưới, bác sĩ kê đơn giúp tôi').outOfScope,
    ).not.toBeNull();
    expect(hits('toi bi dau nguc').emergency).not.toBeNull();
    expect(hits('Tôi đau lưng dưới và tiểu buốt').outOfScope).toBeNull();
  });
});

describe('X2-03: kỳ vọng với tới được trong ngữ cảnh dựng cho đúng câu hỏi', () => {
  let truth: Truth;
  let deps: ReturnType<typeof createSampleDeps>;
  beforeAll(async () => {
    const world = new SampleWorld();
    truth = await buildTruth(world);
    deps = createSampleDeps(world, { now: () => 0 });
  });

  const reachable = async (
    cauHoi: string,
    keys: readonly string[],
    previous?: string,
  ) => {
    const built = await deps.context.build({
      question: norm(cauHoi),
      ...(previous === undefined ? {} : { previousUserTurn: previous }),
      branchId: null,
    });
    return {
      built,
      missing: keys.filter((key) => {
        const [kind = '', id = ''] = key.split(':');
        const ref = toPlaceholderRef(kind, id);
        return ref === null || !built.index.has(ref);
      }),
    };
  };

  it('X2-03: mọi chỗ giữ kỳ vọng của 30 câu có trong ngữ cảnh dựng cho câu đó (nếu không thì mô hình không thể nhắc, V2 sẽ loại)', async () => {
    for (const item of set.cau) {
      const previous = item.lichSu
        ?.filter((turn) => turn.vai === 'NguoiDung')
        .at(-1)?.noiDung;
      const { missing } = await reachable(
        item.cauHoi,
        item.kyVong.nhac ?? [],
        previous,
      );
      expect(missing, item.ma).toEqual([]);
    }
  });

  it('X2-03: mọi chỗ giữ kỳ vọng đều là giá trị có thật trong thế giới mẫu, và tập chấp nhận là chuyên khoa đang hoạt động', async () => {
    for (const item of set.cau) {
      for (const key of item.kyVong.nhac ?? [])
        expect(truth.values.has(key), `${item.ma} ${key}`).toBe(true);
      for (const id of item.kyVong.chapNhan ?? [])
        expect(truth.values.has(`CK:${id}`), `${item.ma} CK:${id}`).toBe(true);
    }
    for (const item of set.phu) {
      const { missing } = await reachable(
        item.cauHoi,
        item.goiYNhac,
        item.lichSu?.filter((turn) => turn.vai === 'NguoiDung').at(-1)?.noiDung,
      );
      // Gợi ý của mục phụ chỉ để người chấm tham khảo, nhưng phải với tới được: ngữ cảnh chỉ khớp từ khoá trên lượt NGƯỜI DÙNG liền trước
      // (lượt Trợ lý do máy khách gửi, giả được, nên không dùng), vì vậy tên bác sĩ hay khoa phải có ở lượt người dùng
      expect(missing, item.ma).toEqual([]);
    }
  });

  it('X2-03 (ca âm, phát hiện của X2): chữ CŨ của G03 và G08 (không có chữ "mẫu" của tên dịch vụ) KHÔNG với tới được chi tiết dịch vụ; chữ mới thì có', async () => {
    const oldG03 = 'Tư vấn từ xa mỗi buổi kéo dài bao lâu và phí là bao nhiêu?';
    const oldG08 =
      'Khám tổng quát ở đây có kèm xét nghiệm máu hay chụp X-quang không, và giá khám là bao nhiêu?';
    expect((await reachable(oldG03, ['TL:3', 'GIADV:3'])).missing).toEqual([
      'TL:3',
      'GIADV:3',
    ]);
    expect((await reachable(oldG08, ['GIADV:2'])).missing).toEqual(['GIADV:2']);
    expect(
      (await reachable(byCode('G03').cauHoi, ['TL:3', 'GIADV:3'])).missing,
    ).toEqual([]);
    expect(
      (await reachable(byCode('G08').cauHoi, ['GIADV:2'])).missing,
    ).toEqual([]);
    // Hai chữ cũ và mới chỉ khác nhau ở chữ "mẫu" của tên dịch vụ
    expect(byCode('G03').cauHoi).toContain('Tư vấn từ xa mẫu');
    expect(byCode('G08').cauHoi).toContain('Khám tổng quát mẫu');
  });

  it('X2-03: ngữ cảnh của mọi câu nằm dưới trần 6.000 ký tự và không bị cắt', async () => {
    for (const item of set.cau) {
      const { built } = await reachable(item.cauHoi, []);
      expect(built.stats.chars, item.ma).toBeLessThanOrEqual(6000);
      expect(built.stats.trimmed, item.ma).toBe('none');
    }
  });
});
