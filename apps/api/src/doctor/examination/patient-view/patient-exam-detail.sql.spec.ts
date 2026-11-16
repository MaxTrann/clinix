import type { EntityManager } from 'typeorm';
import { PatientExamDetailRepository } from './patient-exam-detail.repository.js';
import {
  EXAM_VISIT_JOINS,
  PatientExamRecordsRepository,
} from './patient-exam-records.repository.js';
import { monthPeriod } from './patient-exam-records.rules.js';

// doctor-exam B5 — luật quét câu SQL THẬT của chi tiết (XHS-19 `[đề xuất]`; PLAN 5.6; H10, HD-08). Không DB: `EntityManager` giả chỉ ghi câu và tham số mà repository THẬT gửi đi (không gõ lại câu ở test).
// Bài học B4 (M7 lọt AR-05) và kế hoạch B5 (M3): đổi thứ tự điều kiện chủ sở hữu nhất quán ở cả câu lẫn tham số cho CÙNG kết quả đúng ở mọi ca hành vi; chỉ luật quét câu này bắt.
const CODE = 'CLX-20261110-7K3QD';

interface Sent {
  sql: string;
  params: unknown[];
}

async function sentByDetail(): Promise<Sent[]> {
  const sent: Sent[] = [];
  const em = {
    query: (sql: string, params: unknown[]) => {
      sent.push({ sql, params });
      return Promise.resolve([]);
    },
  } as unknown as EntityManager;
  await new PatientExamDetailRepository().findDetail(em, '5', CODE);
  return sent;
}

/** Các điều kiện của `WHERE`, theo thứ tự viết, bỏ khoảng trắng thừa. */
const conditionsOf = (sql: string): string[] =>
  (/\bWHERE\b([\s\S]*)$/i.exec(sql)?.[1] ?? '')
    .split(/\bAND\b/i)
    .map((part) => part.replace(/\s+/g, ' ').trim());

describe('XHS-19 câu SQL thật của chi tiết: một câu SELECT, chỉ đọc, chủ sở hữu ĐẦU TIÊN', () => {
  it('đúng MỘT câu, bắt đầu bằng SELECT, đúng hai tham số theo thứ tự (Bệnh nhân rồi mã), không ghi và không khoá', async () => {
    const sent = await sentByDetail();
    expect(sent).toHaveLength(1);
    const { sql, params } = sent[0] ?? { sql: '', params: [] };
    expect(sql).toMatch(/^\s*SELECT\b/i);
    expect(params).toEqual(['5', CODE]);
    expect(sql.match(/\?/g)).toHaveLength(2);
    expect(sql).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|REPLACE|FOR\s+UPDATE|LOCK\s+IN\s+SHARE\s+MODE|FOR\s+SHARE)\b/i,
    );
  });

  it("điều kiện: `lh.benh_nhan_id = ?` ĐẦU TIÊN, rồi `lh.ma_lich_hen = ?`, rồi `lh.trang_thai = 'HoanThanh'` (thứ tự của tham số khớp thứ tự của dấu ?)", async () => {
    const sql = (await sentByDetail())[0]?.sql ?? '';
    expect(conditionsOf(sql)).toEqual([
      'lh.benh_nhan_id = ?',
      'lh.ma_lich_hen = ?',
      "lh.trang_thai = 'HoanThanh'",
    ]);
  });

  it('câu KHÔNG nhắc cột đánh giá bị ẩn, giờ hệ thống, hay chi nhánh HIỆN TẠI của bác sĩ: lộ là bất khả dù mapper sai (Q19, H10)', async () => {
    const sql = (await sentByDetail())[0]?.sql ?? '';
    expect(sql).not.toMatch(/bi_an|ly_do_an/i);
    expect(sql).not.toMatch(
      /\bNOW\s*\(|CURRENT_TIMESTAMP|CURDATE\s*\(|SYSDATE\s*\(/i,
    );
    expect(sql).not.toMatch(/bs\.chi_nhanh_id/i);
    expect(sql).toContain('ch.chi_nhanh_id = lh.chi_nhanh_id');
  });

  it('nối: ba LEFT JOIN (người thân, hồ sơ, đánh giá) và chỉ INNER JOIN chuyên khoa, chi nhánh, hai tài khoản, bác sĩ; ngày tái khám qua DATE_FORMAT', async () => {
    const sql = (await sentByDetail())[0]?.sql ?? '';
    const joins = [...sql.matchAll(/\b(LEFT|INNER) JOIN (\w+)/g)].map(
      (match) => `${match[1] ?? ''} ${match[2] ?? ''}`,
    );
    expect(joins.toSorted()).toEqual(
      [
        'INNER bac_si',
        'INNER tai_khoan',
        'INNER tai_khoan',
        'INNER chuyen_khoa',
        'INNER chi_nhanh',
        'LEFT ho_so_nguoi_than',
        'LEFT ho_so_kham',
        'LEFT danh_gia_bac_si',
      ].toSorted(),
    );
    expect(sql).toContain("DATE_FORMAT(hsk.ngay_tai_kham_du_kien, '%Y-%m-%d')");
  });

  it('chuỗi nối dùng chung với B4: câu chi tiết và câu trang của danh sách cùng chứa NGUYÊN VĂN `EXAM_VISIT_JOINS` (không hai bản chép)', async () => {
    const detail = (await sentByDetail())[0]?.sql ?? '';
    const page: string[] = [];
    const em = {
      query: (sql: string) => {
        page.push(sql);
        return Promise.resolve([]);
      },
    } as unknown as EntityManager;
    await new PatientExamRecordsRepository().findPage(
      em,
      '5',
      null,
      monthPeriod(2026, 11),
      20,
      0,
    );
    expect(detail).toContain(EXAM_VISIT_JOINS);
    expect(page[0]).toContain(EXAM_VISIT_JOINS);
    expect(EXAM_VISIT_JOINS).toMatch(/^FROM lich_hen lh\n/);
  });
});
