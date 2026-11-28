import { describe, expect, it } from 'vitest';
import type { ModelAnswer } from '../answer/output.schema.js';
import type { AiRequest } from '../providers/ai-provider.js';
import { ProviderError } from '../providers/provider-error.js';
import {
  DOCTOR_ID_BASE,
  DryRunProvider,
  SampleWorld,
  buildTruth,
  createSampleDeps,
  defaultDryRunScript,
  scheduleOfBranch,
  truthTable,
} from './eval-world.js';
import { loadGoldenSet } from './golden-set.js';

// Test của thế giới mẫu và nhà cung cấp giả của bộ câu hỏi chuẩn (chatbot X2). Không DB, không mạng, không khoá.

const { set } = loadGoldenSet();

describe('X2-03: thế giới mẫu dựng từ seed', () => {
  const world = new SampleWorld();

  it('X2-03: id theo thứ tự trong seed; bác sĩ công khai từ 11 và bác sĩ chờ kích hoạt không vào', async () => {
    const doctors = await world.listAll();
    expect(doctors.map((doctor) => doctor.bacSiId)).toEqual([
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
      '17',
      '18',
    ]);
    expect(DOCTOR_ID_BASE).toBe(11);
    expect(doctors.find((doctor) => doctor.bacSiId === '12')).toMatchObject({
      hoTen: 'Lê Thị Mai',
      chuyenKhoaId: '2',
      chuyenKhoaTen: 'Thần kinh',
      chiNhanhId: '1',
      dichVuKhamId: '1',
      giaKham: '200000.00',
    });
    expect(doctors.find((doctor) => doctor.bacSiId === '14')).toMatchObject({
      dichVuKhamId: '2',
      giaKham: '500000.00',
      chiNhanhId: '2',
    });
    // Bác sĩ thứ chín của seed chờ kích hoạt (id 19) không được công khai
    expect(await world.findById('19')).toBeNull();
    expect(await world.findById('12')).not.toBeNull();
  });

  it('X2-03: phần nền: 8 chuyên khoa, 4 chi nhánh, 3 dịch vụ; không hotline; có email; cấu hình chính sách', async () => {
    const base = await world.loadBase();
    expect(base.specialties).toHaveLength(8);
    expect(base.specialties.map((specialty) => specialty.id).sort()).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
    ]);
    expect(base.branches.map((branch) => branch.ten)).toEqual([
      'CLINIX Mẫu 1',
      'CLINIX Mẫu 2',
      'CLINIX Mẫu 3',
      'CLINIX Mẫu 4',
    ]);
    expect(base.services.map((service) => service.ten)).toEqual([
      'Khám chuyên khoa mẫu',
      'Khám tổng quát mẫu',
      'Tư vấn từ xa mẫu',
    ]);
    expect(base.clinic.hotline).toBeNull();
    expect(base.clinic.email).not.toBeNull();
    expect(await world.get()).toEqual({
      thoiGianGiuCho: 15,
      soLanTuDoiLichToiDa: 2,
    });
    expect(await world.findActiveSpecialties(['1', '9', '8'])).toEqual(
      new Map([
        ['1', 'Cơ Xương Khớp'],
        ['8', 'Tai Mũi Họng'],
      ]),
    );
  });

  it('X2-03: giờ nhận khám theo ghi chú của seed (Mẫu 2 thứ Bảy chỉ sáng, Mẫu 3 thêm sáng Chủ Nhật, Mẫu 4 nghỉ thứ Bảy)', () => {
    const day = (branchIndex: number, weekday: number) =>
      scheduleOfBranch(branchIndex).find((row) => row.thuTrongTuan === weekday);
    expect(scheduleOfBranch(0)).toHaveLength(7);
    expect(day(1, 6)).toMatchObject({ hoatDong: true, gioBatDauChieu: null });
    expect(day(2, 7)).toMatchObject({
      hoatDong: true,
      gioBatDauSang: '08:00:00',
      gioBatDauChieu: null,
    });
    expect(day(3, 6)).toMatchObject({ hoatDong: false });
    expect(day(0, 6)).toMatchObject({
      hoatDong: true,
      gioBatDauChieu: '13:00:00',
    });
    expect(day(0, 7)).toMatchObject({ hoatDong: false });
  });

  it('X2-03: sự thật chuẩn do bộ đọc THẬT dựng: tên bác sĩ, giá, thời lượng, giờ, địa chỉ; hotline không có', async () => {
    const truth = await buildTruth(world);
    const value = (key: string): string =>
      truth.values.get(key)?.chu ?? '(không có)';
    expect(value('BS:12')).toBe('TS.BS. Lê Thị Mai');
    expect(value('BS:11')).toBe('BS.CKII Trần Văn Hùng');
    expect(value('GIA:14')).toBe('500.000 đồng');
    expect(value('GIADV:3')).toBe('từ 150.000 đồng');
    expect(value('TL:3')).toBe('30 phút');
    expect(value('DC:1')).toBe('Địa chỉ minh họa 1');
    expect(value('CN:3')).toBe('CLINIX Mẫu 3');
    expect(value('GIO:3')).toContain('Chủ Nhật: 08:00 đến 12:00');
    expect(value('GIO:2')).toContain('Thứ Bảy: 08:00 đến 12:00');
    expect(value('GIO:4')).toContain('Thứ Bảy đến Chủ Nhật: nghỉ');
    expect(truth.values.has('PK:hotline')).toBe(false);
    expect(truth.values.has('PK:email')).toBe(true);
    expect(truth.values.has('BS:19')).toBe(false);
    expect(truth.entityNames.get('BacSi:12')).toBe('TS.BS. Lê Thị Mai');
    expect(truth.entityNames.get('ChuyenKhoa:2')).toBe('Thần kinh');
    expect(truth.entityNames.get('ChiNhanh:4')).toBe('CLINIX Mẫu 4');
    expect(truth.entityNames.get('DichVu:2')).toBe('Khám tổng quát mẫu');
    expect(truthTable(truth).length).toBe(truth.values.size);
  });

  it('X2-03: tập chuỗi hợp lệ xếp DÀI TRƯỚC và có câu dựng sẵn, tiêu đề khối địa chỉ, giá trị chỗ giữ', async () => {
    const truth = await buildTruth(world);
    const lengths = truth.allowedTexts.map((text) => text.length);
    expect(lengths).toEqual([...lengths].sort((a, b) => b - a));
    expect(truth.allowedTexts).toContain('Địa chỉ chi nhánh:');
    expect(truth.allowedTexts).toContain(
      'Trợ lý AI hiện không phản hồi, vui lòng thử lại sau',
    );
    expect(truth.allowedTexts).toContain('500.000 đồng');
    expect(truth.allowedTexts.filter((text) => text === '')).toEqual([]);
  });

  it('X2-03: các phần thật của sản phẩm dựng được trên thế giới mẫu: ngữ cảnh có chỗ giữ, danh bạ chi nhánh trả địa chỉ', async () => {
    const deps = createSampleDeps(world, { now: () => 0 });
    const built = await deps.context.build({
      question: 'Cho mình hỏi bác sĩ Lê Thị Mai',
      branchId: null,
    });
    expect(built.text).toContain('[[BS:12]]');
    expect(built.stats.chars).toBeLessThanOrEqual(6000);
    expect(await deps.branches.addressesFor()).toHaveLength(4);
    expect(await deps.branches.addressesFor('2')).toEqual([
      { id: '2', ten: 'CLINIX Mẫu 2', diaChi: 'Địa chỉ minh họa 2' },
    ]);
  });
});

describe('X2-08: nhà cung cấp giả của --dry-run', () => {
  const request = (question: string): AiRequest<unknown> => ({
    systemPrompt: 'lời nhắc',
    context: 'ngữ cảnh',
    history: [],
    question,
    output: {
      name: 'x',
      jsonSchema: {},
      isValid: (value): value is unknown => value !== undefined,
    },
    maxOutputTokens: 100,
  });
  const script = defaultDryRunScript(set);
  const asAnswer = (value: ModelAnswer | ProviderError): ModelAnswer => {
    if (value instanceof ProviderError) throw new Error('không mong đợi lỗi');
    return value;
  };

  it('X2-08: kịch bản mặc định trả đúng theo kỳ vọng từng nhóm', () => {
    const g05 = set.cau.find((item) => item.ma === 'G05');
    expect(asAnswer(script('groq', request(g05?.cauHoi ?? ''))).traLoi).toBe(
      'Thông tin bạn cần: [[BS:14]], [[GIA:14]], [[CN:2]].',
    );
    const g13 = asAnswer(
      script(
        'groq',
        request(set.cau.find((item) => item.ma === 'G13')?.cauHoi ?? ''),
      ),
    );
    expect(g13).toEqual({
      loai: 'goiYDatLich',
      traLoi: 'Bạn có thể cân nhắc [[CK:2]] để được thăm khám.',
      chuyenKhoaGoiY: ['2'],
    });
    expect(
      asAnswer(
        script(
          'groq',
          request(set.cau.find((item) => item.ma === 'G20')?.cauHoi ?? ''),
        ),
      ).loai,
    ).toBe('ngoaiPhamVi');
    expect(
      asAnswer(
        script(
          'groq',
          request(set.cau.find((item) => item.ma === 'G26')?.cauHoi ?? ''),
        ),
      ).loai,
    ).toBe('hoiDap');
    expect(
      asAnswer(
        script(
          'groq',
          request(set.phu.find((item) => item.ma === 'P01')?.cauHoi ?? ''),
        ),
      ).loai,
    ).toBe('khanCap');
    expect(
      asAnswer(script('groq', request('Một câu lạ chưa có kịch bản'))).loai,
    ).toBe('hoiDap');
  });

  it('X2-08: DryRunProvider ghi lời gọi giả (thành công và lỗi) và ném đúng lỗi', async () => {
    const seen: {
      layer: string;
      failure: string | null;
      tokensIn: number;
      tokensOut: number;
    }[] = [];
    const sink = (call: {
      layer: string;
      failure: ProviderError | null;
      tokensIn: number;
      tokensOut: number;
    }): void => {
      seen.push({
        layer: call.layer,
        failure: call.failure?.kind ?? null,
        tokensIn: call.tokensIn,
        tokensOut: call.tokensOut,
      });
    };
    const good = new DryRunProvider(
      'gemini',
      () => ({ loai: 'hoiDap', traLoi: 'Xin chào', chuyenKhoaGoiY: [] }),
      sink,
    );
    expect(good.configured).toBe(true);
    expect(good.name).toBe('gemini');
    const answer = await good.generate(request('x'));
    expect(JSON.parse(answer.text)).toEqual({
      loai: 'hoiDap',
      traLoi: 'Xin chào',
      chuyenKhoaGoiY: [],
    });
    const bad = new DryRunProvider(
      'groq',
      () => new ProviderError('rateLimited', 429),
      sink,
    );
    await expect(bad.generate(request('x'))).rejects.toMatchObject({
      kind: 'rateLimited',
      httpStatus: 429,
    });
    expect(seen.map((entry) => [entry.layer, entry.failure])).toEqual([
      ['gemini', null],
      ['groq', 'rateLimited'],
    ]);
    expect(seen[0]?.tokensOut).toBeGreaterThan(0);
    expect(seen[1]?.tokensOut).toBe(0);
  });
});
