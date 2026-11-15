import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import type { PatientExamRecordsQuery } from './patient-exam-records.dto.js';
import type { ExamRecordRow } from './patient-exam-records.mapper.js';
import type { PatientExamRecordsRepository } from './patient-exam-records.repository.js';
import { PatientExamRecordsService } from './patient-exam-records.service.js';

// doctor-exam B4 — PatientExamRecordsService với DataSource và repository GIẢ (PLAN 5.6; XHS-04, XHS-05, XHS-16). Không DB: SQL thật và ảnh chụp nhất quán ở patient-exam-records.int-spec.ts.
const NOW = new Date('2026-11-10T09:00:00+07:00');
const BASE: PatientExamRecordsQuery = { page: 1, pageSize: 20, offset: 0 };
const ROW: ExamRecordRow = {
  maLichHen: 'CLX-20261110-7K3QD',
  thoiGian: new Date('2026-11-10T09:00:00+07:00'),
  chuyenKhoa: 'Nội',
  bacSiHoTen: 'Bác sĩ Mẫu',
  chucDanh: 'BS',
  nguoiKhamHoTen: 'Bệnh nhân Mẫu',
  quanHe: null,
  coHoSoKham: 1,
  daDanhGia: 0,
};

function setup(total = 1) {
  const manager = { tag: 'manager' } as unknown as EntityManager;
  const calls: string[] = [];
  const runner = {
    manager,
    connect: vi.fn(),
    query: vi.fn((sql: string) => {
      calls.push(`query ${sql}`);
    }),
    startTransaction: vi.fn((level: string) => {
      calls.push(`start ${level}`);
    }),
    commitTransaction: vi.fn(() => {
      calls.push('commit');
    }),
    rollbackTransaction: vi.fn(() => {
      calls.push('rollback');
    }),
    release: vi.fn(() => {
      calls.push('release');
    }),
  };
  const records = {
    count: vi.fn((..._args: unknown[]) => {
      calls.push('count');
      return Promise.resolve(total);
    }),
    countByMonth: vi.fn((..._args: unknown[]) => {
      calls.push('countByMonth');
      return Promise.resolve({ m11: '1' } as Record<string, string>);
    }),
    findExaminees: vi.fn((..._args: unknown[]) => {
      calls.push('findExaminees');
      return Promise.resolve([{ id: null, hoTen: 'Tôi', quanHe: null }]);
    }),
    findPage: vi.fn((..._args: unknown[]) => {
      calls.push('findPage');
      return Promise.resolve([ROW]);
    }),
  };
  const service = new PatientExamRecordsService(
    { createQueryRunner: () => runner } as unknown as DataSource,
    records as unknown as PatientExamRecordsRepository,
  );
  return { service, records, runner, manager, calls };
}

describe('XHS-16 bốn câu trong MỘT giao dịch chỉ đọc', () => {
  it('thứ tự: SET TRANSACTION READ ONLY, bắt đầu REPEATABLE READ, count, countByMonth, findExaminees, findPage, commit, release; cả bốn câu dùng chung MỘT manager', async () => {
    const t = setup();
    await t.service.list('41', BASE, NOW);
    expect(t.calls).toEqual([
      'query SET TRANSACTION READ ONLY',
      'start REPEATABLE READ',
      'count',
      'countByMonth',
      'findExaminees',
      'findPage',
      'commit',
      'release',
    ]);
    for (const fn of [
      t.records.count,
      t.records.countByMonth,
      t.records.findExaminees,
      t.records.findPage,
    ]) {
      expect(fn.mock.calls[0]?.[0]).toBe(t.manager);
      expect(fn.mock.calls[0]?.[1]).toBe('41');
    }
  });

  it('lỗi giữa chừng ⇒ hoàn tác và trả kết nối, lỗi đi nguyên ra ngoài', async () => {
    const t = setup();
    const failure = new Error('MySQL hỏng');
    t.records.countByMonth.mockRejectedValueOnce(failure);
    await expect(t.service.list('41', BASE, NOW)).rejects.toBe(failure);
    expect(t.calls.slice(-2)).toEqual(['rollback', 'release']);
    expect(t.records.findPage).not.toHaveBeenCalled();
  });
});

describe('XHS-04 bộ lọc và khoảng thời gian đi sang repository', () => {
  it('vắng nam: cả năm HIỆN TẠI GIỜ VN; đồng hồ 17:30 UTC ngày 31/12 ⇒ năm sau', async () => {
    const t = setup();
    await t.service.list('41', BASE, new Date('2026-12-31T17:30:00Z'));
    expect(t.records.count.mock.calls[0]?.slice(2)).toEqual([
      null,
      { from: '2027-01-01 00:00:00', to: '2028-01-01 00:00:00' },
    ]);
    expect(t.records.countByMonth.mock.calls[0]?.slice(2)).toEqual([
      null,
      2027,
    ]);
  });

  it('nam và thang: total và trang áp đúng THÁNG; `demTheoThang` áp cả NĂM và KHÔNG nhận `thang`', async () => {
    const t = setup();
    await t.service.list(
      '41',
      { ...BASE, nam: 2028, thang: 2, nguoiKham: '17' },
      NOW,
    );
    const feb = { from: '2028-02-01 00:00:00', to: '2028-03-01 00:00:00' };
    expect(t.records.count.mock.calls[0]?.slice(2)).toEqual(['17', feb]);
    expect(t.records.findPage.mock.calls[0]?.slice(2)).toEqual([
      '17',
      feb,
      20,
      0,
    ]);
    expect(t.records.countByMonth.mock.calls[0]?.slice(2)).toEqual([
      '17',
      2028,
    ]);
  });

  it('nguoiKham vắng ⇒ null (mọi người khám); BanThan đi nguyên; bộ lọc người khám KHÔNG đi vào câu lựa chọn người khám', async () => {
    const t = setup();
    await t.service.list('41', { ...BASE, nguoiKham: 'BanThan' }, NOW);
    expect(t.records.count.mock.calls[0]?.[2]).toBe('BanThan');
    expect(t.records.findExaminees.mock.calls[0]).toHaveLength(2);
  });
});

describe('XHS-05 phân trang và hình dạng trả về', () => {
  it('offset < total ⇒ lấy trang với đúng pageSize và offset', async () => {
    const t = setup(120);
    await t.service.list('41', { page: 3, pageSize: 50, offset: 100 }, NOW);
    expect(t.records.findPage.mock.calls[0]?.slice(4)).toEqual([50, 100]);
  });

  it.each([
    ['offset = total', 20, 20],
    ['offset > total', 5, 20],
    ['không có lịch nào', 0, 0],
    ['page rất lớn', 1, 1e18],
  ])(
    '%s ⇒ KHÔNG gọi câu trang, items rỗng, total đúng, vẫn trả đủ demTheoThang và nguoiKham',
    async (_name, total, offset) => {
      const t = setup(total);
      const page = await t.service.list(
        '41',
        { page: 2, pageSize: 20, offset },
        NOW,
      );
      expect(t.records.findPage).not.toHaveBeenCalled();
      expect(page.items).toEqual([]);
      expect(page.total).toBe(total);
      expect(Object.keys(page.demTheoThang)).toHaveLength(12);
      expect(page.nguoiKham).toHaveLength(1);
    },
  );

  it('kết quả: items qua mapper, page và pageSize nguyên văn, demTheoThang đủ 12 khoá bằng số, nguoiKham qua mapper', async () => {
    const t = setup();
    const page = await t.service.list('41', BASE, NOW);
    expect(page).toEqual({
      items: [
        {
          maLichHen: 'CLX-20261110-7K3QD',
          thoiGian: '2026-11-10T02:00:00.000Z',
          chuyenKhoa: 'Nội',
          bacSi: { hoTen: 'Bác sĩ Mẫu', chucDanh: 'BS' },
          nguoiKham: { hoTen: 'Bệnh nhân Mẫu', quanHe: null },
          coHoSoKham: true,
          daDanhGia: false,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      demTheoThang: expect.objectContaining({ '11': 1, '1': 0, '12': 0 }),
      nguoiKham: [{ id: null, hoTen: 'Tôi', quanHe: null }],
    });
  });
});
