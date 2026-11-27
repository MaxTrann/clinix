import { createContextIndex } from '../context/context-index.js';
import type { BuiltContext } from '../context/context.types.js';
import type { PlaceholderRef } from '../context/placeholder.js';
import { AnswerReconciler } from './answer-reconciler.js';
import type { ResolveResult } from './entity-resolver.js';
import type { ModelAnswer } from './output.schema.js';

// chatbot B2 — cầu nối bước 12 đến 14 của PLAN 5.4. Mã test: ANX-03 (A4), DCR-01 (thành đoạn), A2 giữ thẻ chuyên khoa, `B2-nn` thứ tự và không rò chữ mô hình.

const refs: PlaceholderRef[] = [
  { kind: 'CK', id: '3' },
  { kind: 'BS', id: '12' },
  { kind: 'GIA', id: '12' },
];
const context: BuiltContext = {
  text: 'ngữ cảnh giả',
  index: createContextIndex(
    refs,
    new Map([
      ['3', 'Tim mạch'],
      ['4', 'Nhi khoa'],
    ]),
  ),
  stats: {
    chars: 10,
    doctors: 1,
    trimmed: 'none',
    overBudget: false,
    snapshotAgeMs: 0,
  },
};
const guard = { canary: 'CANARYXKQZPLMNBV', protectedPrompt: '' };

const RESOLVED: ResolveResult = {
  ok: true,
  values: new Map([
    ['CK:3', { chu: 'Tim mạch', entity: { doiTuong: 'ChuyenKhoa', id: '3' } }],
    ['BS:12', { chu: 'BS. Lê An', entity: { doiTuong: 'BacSi', id: '12' } }],
    ['GIA:12', { chu: '350.000 đồng' }],
  ]),
};

function setup(options: { active?: string[]; resolved?: ResolveResult } = {}) {
  const resolveCalls: PlaceholderRef[][] = [];
  const specialtyCalls: (readonly string[])[] = [];
  const active = options.active ?? ['3', '4'];
  const reconciler = new AnswerReconciler({
    resolver: {
      resolve: (input) => {
        resolveCalls.push([...input]);
        return Promise.resolve(options.resolved ?? RESOLVED);
      },
    },
    specialties: {
      findActiveSpecialties: (ids) => {
        specialtyCalls.push(ids);
        return Promise.resolve(
          new Map(
            ids
              .filter((id) => active.includes(id))
              .map((id) => [id, `Thật ${id}`]),
          ),
        );
      },
    },
  });
  return { reconciler, resolveCalls, specialtyCalls };
}

const answer = (over: Partial<ModelAnswer> = {}): ModelAnswer => ({
  loai: 'hoiDap',
  traLoi: 'Chuyên khoa [[CK:3]] có [[BS:12]], giá [[GIA:12]].',
  chuyenKhoaGoiY: [],
  ...over,
});

describe('chatbot B2 — AnswerReconciler', () => {
  it('DCR-01: hoiDap hợp lệ thành TraLoi với đoạn đã dựng, danh sách chuyên khoa rỗng', async () => {
    const { reconciler, resolveCalls } = setup();
    const result = await reconciler.reconcile({
      answer: answer(),
      context,
      guard,
    });
    expect(result).toEqual({
      ketQua: 'TraLoi',
      doan: [
        { kieu: 'chu', chu: 'Chuyên khoa ' },
        { kieu: 'thucThe', doiTuong: 'ChuyenKhoa', id: '3', chu: 'Tim mạch' },
        { kieu: 'chu', chu: ' có ' },
        { kieu: 'thucThe', doiTuong: 'BacSi', id: '12', chu: 'BS. Lê An' },
        { kieu: 'chu', chu: ', giá 350.000 đồng.' },
      ],
      chuyenKhoaGoiY: [],
    });
    expect(resolveCalls).toHaveLength(1);
  });

  it('B2-58: goiYDatLich hợp lệ thành GoiY kèm chuyên khoa đã lọc, tên lấy từ DB', async () => {
    const { reconciler } = setup();
    const result = await reconciler.reconcile({
      answer: answer({ loai: 'goiYDatLich', chuyenKhoaGoiY: ['4', '3'] }),
      context,
      guard,
    });
    expect(result.ketQua).toBe('GoiY');
    expect('chuyenKhoaGoiY' in result && result.chuyenKhoaGoiY).toEqual([
      { chuyenKhoaId: '4', ten: 'Thật 4' },
      { chuyenKhoaId: '3', ten: 'Thật 3' },
    ]);
  });

  it('ANX-03: goiYDatLich mà mọi id bị loại thì KhongCoChuyenKhoa, KHÔNG đối chiếu và KHÔNG đọc lại thực thể', async () => {
    const { reconciler, resolveCalls } = setup({ active: [] });
    const result = await reconciler.reconcile({
      answer: answer({
        loai: 'goiYDatLich',
        chuyenKhoaGoiY: ['3', '99', 'abc'],
        // câu này vi phạm V3, nhưng A4 đứng trước: không được báo V3
        traLoi: 'Giá 200 đồng',
      }),
      context,
      guard,
    });
    expect(result).toEqual({ ketQua: 'KhongCoChuyenKhoa', chuyenKhoaGoiY: [] });
    expect(resolveCalls).toEqual([]);
  });

  it('A2: vi phạm luật thì KhongKhopDuLieu kèm mã luật, GIỮ thẻ chuyên khoa đã lọc, không đọc lại thực thể', async () => {
    const { reconciler, resolveCalls } = setup();
    const result = await reconciler.reconcile({
      answer: answer({
        loai: 'goiYDatLich',
        chuyenKhoaGoiY: ['3'],
        traLoi: 'Giá chỉ 200.000 đồng',
      }),
      context,
      guard,
    });
    expect(result).toEqual({
      ketQua: 'KhongKhopDuLieu',
      ruleId: 'V3',
      chuyenKhoaGoiY: [{ chuyenKhoaId: '3', ten: 'Thật 3' }],
    });
    expect(resolveCalls).toEqual([]);
  });

  it('B2-59: kết quả A2 chỉ mang mã luật: không chứa chữ của mô hình', async () => {
    const { reconciler } = setup();
    const secret = 'Bác sĩ Nguyễn Văn Bí Mật giá 200.000 miễn phí';
    const result = await reconciler.reconcile({
      answer: answer({ traLoi: secret }),
      context,
      guard,
    });
    expect(result.ketQua).toBe('KhongKhopDuLieu');
    expect(JSON.stringify(result)).not.toContain('Bí Mật');
    expect(JSON.stringify(result)).not.toContain('200.000');
  });

  it('DCR-11: thực thể không còn hiệu lực khi đọc lại thì KhongKhopDuLieu V2 (vẫn giữ thẻ chuyên khoa)', async () => {
    const { reconciler } = setup({
      resolved: { ok: false, reason: 'gone' },
    });
    const result = await reconciler.reconcile({
      answer: answer({ loai: 'goiYDatLich', chuyenKhoaGoiY: ['3'] }),
      context,
      guard,
    });
    expect(result).toEqual({
      ketQua: 'KhongKhopDuLieu',
      ruleId: 'V2',
      chuyenKhoaGoiY: [{ chuyenKhoaId: '3', ten: 'Thật 3' }],
    });
  });

  it('B2-55: quá trần số thực thể cũng là V2', async () => {
    const { reconciler } = setup({
      resolved: { ok: false, reason: 'tooMany' },
    });
    const result = await reconciler.reconcile({
      answer: answer(),
      context,
      guard,
    });
    expect(result).toMatchObject({ ketQua: 'KhongKhopDuLieu', ruleId: 'V2' });
  });

  it('B2-60: hoiDap bỏ qua chuyenKhoaGoiY của mô hình (không gọi DB để lọc, không báo A4)', async () => {
    const { reconciler, specialtyCalls } = setup();
    const result = await reconciler.reconcile({
      answer: answer({ loai: 'hoiDap', chuyenKhoaGoiY: ['3'] }),
      context,
      guard,
    });
    expect(result.ketQua).toBe('TraLoi');
    expect('chuyenKhoaGoiY' in result && result.chuyenKhoaGoiY).toEqual([]);
    expect(specialtyCalls).toEqual([]);
  });

  it.each([
    ['khanCap', 'KhanCap'],
    ['ngoaiPhamVi', 'NgoaiPhamVi'],
  ] as const)(
    'B2-61: loai %s chuyển nguyên loại, bỏ chữ mô hình, không đọc gì',
    async (loai, ketQua) => {
      const { reconciler, resolveCalls, specialtyCalls } = setup();
      const result = await reconciler.reconcile({
        answer: answer({ loai, traLoi: 'chữ của mô hình sẽ bị bỏ' }),
        context,
        guard,
      });
      expect(result).toEqual({ ketQua });
      expect(resolveCalls).toEqual([]);
      expect(specialtyCalls).toEqual([]);
    },
  );

  it('B2-62: chỗ giữ ngoài ngữ cảnh đã gửi thì V2 ngay cả khi DB có thực thể đó', async () => {
    const { reconciler, resolveCalls } = setup();
    const result = await reconciler.reconcile({
      answer: answer({ traLoi: 'Gặp [[BS:99]]' }),
      context,
      guard,
    });
    expect(result).toMatchObject({ ketQua: 'KhongKhopDuLieu', ruleId: 'V2' });
    expect(resolveCalls).toEqual([]);
  });
});
