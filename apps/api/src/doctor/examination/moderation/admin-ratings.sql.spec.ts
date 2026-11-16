import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { EntityManager } from 'typeorm';
import { stripComments } from '../../testing/architecture-scan.js';
import {
  AdminRatingsRepository,
  READ_DETAIL_SQL,
  type AdminRatingFilter,
} from './admin-ratings.repository.js';

// doctor-exam B7 — luật quét câu SQL THẬT của danh sách và chi tiết đánh giá cho Quản trị viên (KDD-21 `[đề xuất]`; PLAN 5.8; L10, HD-08; mẫu `rating.sql.spec` của B6). Không DB: `EntityManager` giả chỉ ghi câu và tham số
// mà repository THẬT gửi đi (không gõ lại câu ở test). Phạm vi chi nhánh có ở CẢ câu đếm lẫn câu trang (QHK-11) và "nối muộn" (M8) chỉ quan sát được ở đây: kết quả đúng như cũ, chỉ thời gian khác.
const DIR = fileURLToPath(new URL('.', import.meta.url));
const repository = new AdminRatingsRepository();

interface Sent {
  sql: string;
  params: unknown[];
}

/** `EntityManager` giả ghi câu và tham số; `answer` là hàng trả về cho mọi câu. */
function recorder(answer: unknown[] = []) {
  const sent: Sent[] = [];
  const em = {
    query: (sql: string, params: unknown[]) => {
      sent.push({ sql, params });
      return Promise.resolve(answer);
    },
  } as unknown as EntityManager;
  return { em, sent };
}

const squash = (sql: string) => sql.replace(/\s+/g, ' ').trim();
const placeholders = (sql: string) => sql.match(/\?/g)?.length ?? 0;

/** Các điều kiện của MỘT mệnh đề `WHERE … (GROUP BY | ORDER BY)`, theo thứ tự viết. */
const conditionsOf = (sql: string): string[] =>
  squash(
    /\bWHERE\b([\s\S]*?)(?:\bGROUP BY\b|\bORDER BY\b)/i.exec(sql)?.[1] ?? '',
  )
    .split(/\bAND\b/i)
    .map((part) => part.trim())
    .filter((part) => part !== '');

const ALL: AdminRatingFilter = {
  chiNhanhId: '7',
  bacSiId: '31',
  soSao: 4,
  q: '50%_!\\',
};
const PATTERN = '%50!%!_!!\\%'; // `%`, `_`, `!` được thoát bằng `!`; dấu gạch ngược là ký tự thường (ESCAPE '!')

async function countSent(filter: AdminRatingFilter) {
  const { em, sent } = recorder();
  await repository.countByStatus(em, filter);
  return sent;
}
async function pageSent(
  filter: AdminRatingFilter,
  trangThai?: 'HienThi' | 'DaAn',
) {
  const { em, sent } = recorder();
  await repository.findPage(em, filter, trangThai, 20, 40);
  return sent;
}

describe('KDD-21 câu đếm theo trạng thái: MỘT câu SELECT, áp mọi lọc TRỪ trangThai', () => {
  it('không bộ lọc: một câu, không tham số, không WHERE, nhóm theo bi_an; không nối tai_khoan', async () => {
    const sent = await countSent({});
    expect(sent).toHaveLength(1);
    const { sql, params } = sent[0] ?? { sql: '', params: [] };
    expect(sql).toMatch(/^\s*SELECT\b/i);
    expect(params).toEqual([]);
    expect(sql).not.toMatch(/\bWHERE\b/i);
    expect(sql).toMatch(/GROUP BY dg\.bi_an\s*$/);
    expect(sql).not.toMatch(/tai_khoan|chi_nhanh\b/);
  });

  it('đủ bộ lọc: tham số theo đúng thứ tự điều kiện (chi nhánh, bác sĩ, số sao, hai mẫu LIKE); số dấu ? bằng số tham số', async () => {
    const { sql, params } = (await countSent(ALL))[0] ?? {
      sql: '',
      params: [],
    };
    expect(params).toEqual(['7', '31', 4, PATTERN, PATTERN]);
    expect(placeholders(sql)).toBe(params.length);
    expect(conditionsOf(sql)).toEqual([
      'lh.chi_nhanh_id = ?',
      'lh.bac_si_id = ?',
      'dg.so_sao = ?',
      "(tbn.ho_ten LIKE ? ESCAPE '!' OR dg.nhan_xet LIKE ? ESCAPE '!')",
    ]);
  });

  it('KHÔNG có điều kiện trạng thái (bi_an = …) ở câu đếm: bi_an chỉ là cột nhóm', async () => {
    const { sql } = (await countSent(ALL))[0] ?? { sql: '' };
    expect(sql).not.toMatch(/dg\.bi_an\s*(=|<>|IN\b)/i);
  });

  it('QHK-11: phạm vi `lh.chi_nhanh_id = ?` CÓ ở câu đếm khi có lọc chi nhánh, và KHÔNG có khi không lọc', async () => {
    expect((await countSent({ chiNhanhId: '7' }))[0]?.sql).toContain(
      'lh.chi_nhanh_id = ?',
    );
    expect((await countSent({ bacSiId: '31' }))[0]?.sql).not.toContain(
      'chi_nhanh_id',
    );
  });

  it('hàng trả về đi nguyên cho service (repository không đổi kiểu)', async () => {
    const rows = [{ biAn: 0, soLuong: '3' }];
    const { em } = recorder(rows);
    expect(await repository.countByStatus(em, {})).toBe(rows);
  });
});

describe('KDD-21 câu trang: PHÂN TRANG TRƯỚC rồi NỐI MUỘN (M8)', () => {
  it('một câu SELECT; tham số = tham số lọc, rồi limit, rồi offset; số dấu ? khớp', async () => {
    const sent = await pageSent(ALL);
    expect(sent).toHaveLength(1);
    const { sql, params } = sent[0] ?? { sql: '', params: [] };
    expect(sql).toMatch(/^\s*SELECT\b/i);
    expect(params).toEqual(['7', '31', 4, PATTERN, PATTERN, 20, 40]);
    expect(placeholders(sql)).toBe(params.length);
  });

  it('QHK-11: phạm vi chi nhánh có ở câu trang, CÙNG điều kiện và CÙNG tham số với câu đếm', async () => {
    const count = (await countSent(ALL))[0];
    const page = (await pageSent(ALL))[0];
    expect(conditionsOf(page?.sql ?? '')).toEqual(
      conditionsOf(count?.sql ?? ''),
    );
    expect(page?.params.slice(0, 5)).toEqual(count?.params);
  });

  it('trangThai chỉ ở câu trang: HienThi ⇒ `dg.bi_an = 0`, DaAn ⇒ `dg.bi_an = 1`, đứng CUỐI các điều kiện; vắng ⇒ không điều kiện bi_an', async () => {
    const shown = (await pageSent(ALL, 'HienThi'))[0]?.sql ?? '';
    const hidden = (await pageSent(ALL, 'DaAn'))[0]?.sql ?? '';
    expect(conditionsOf(shown).at(-1)).toBe('dg.bi_an = 0');
    expect(conditionsOf(hidden).at(-1)).toBe('dg.bi_an = 1');
    expect((await pageSent(ALL))[0]?.sql).not.toMatch(
      /WHERE[\s\S]*dg\.bi_an\s*=/,
    );
  });

  it('sắp xếp: thoi_diem_tao giảm dần rồi id giảm dần, cả trong truy vấn con (trước LIMIT) lẫn câu ngoài', async () => {
    const sql = squash((await pageSent({}))[0]?.sql ?? '');
    expect(sql).toContain(
      'ORDER BY dg.thoi_diem_tao DESC, dg.danh_gia_bac_si_id DESC LIMIT ? OFFSET ?',
    );
    expect(sql).toMatch(/ORDER BY p\.thoiDiemTao DESC, p\.danhGiaId DESC$/);
  });

  it('NỐI MUỘN: tên bác sĩ (tbs), chi nhánh (cn) và người đặt (nd) chỉ được nối SAU truy vấn con đã phân trang; truy vấn con chỉ có danh_gia_bac_si và lich_hen', async () => {
    const sql = (await pageSent({}))[0]?.sql ?? '';
    const cut = sql.indexOf(') p');
    expect(cut).toBeGreaterThan(0);
    const inner = sql.slice(0, cut);
    const outer = sql.slice(cut);
    for (const late of [
      'INNER JOIN tai_khoan tbs',
      'INNER JOIN chi_nhanh cn',
      'INNER JOIN tai_khoan nd',
    ]) {
      expect(inner, late).not.toContain(late);
      expect(outer, late).toContain(late);
    }
    expect(inner).toContain('FROM danh_gia_bac_si dg');
    expect(inner).toContain('INNER JOIN lich_hen lh');
    expect(inner).not.toMatch(/tai_khoan|chi_nhanh\b/);
    expect(outer).not.toMatch(/danh_gia_bac_si|LIMIT/);
  });

  it('tai_khoan người đặt (tbn) CHỈ có ở truy vấn con khi có `q`; không có `q` thì không nối và không có LIKE', async () => {
    const without = (await pageSent({ chiNhanhId: '7' }))[0]?.sql ?? '';
    expect(without).not.toMatch(/\btbn\b|\bLIKE\b/);
    const withQ = (await pageSent({ q: 'abc' }))[0]?.sql ?? '';
    const cut = withQ.indexOf(') p');
    expect(withQ.slice(0, cut)).toContain(
      'INNER JOIN tai_khoan tbn ON tbn.tai_khoan_id = lh.benh_nhan_id',
    );
    expect(withQ.slice(cut)).not.toContain('tbn');
  });
});

describe('KDD-19 LIKE: mẫu đã thoát, ESCAPE đi kèm MỌI LIKE, giá trị chỉ qua tham số', () => {
  it.each([
    ['50%', '%50!%%'],
    ['_', '%!_%'],
    ['!', '%!!%'],
    ['\\', '%\\%'],
    ['%_!', '%!%!_!!%'],
    ['Văn 004212', '%Văn 004212%'],
  ])('q %j ⇒ mẫu %j ở CẢ HAI cột, ở CẢ HAI câu', async (q, expected) => {
    for (const sent of [await countSent({ q }), await pageSent({ q })]) {
      expect(sent[0]?.params.slice(0, 2)).toEqual([expected, expected]);
      // mẫu (luôn bắt đầu bằng `%`) không bao giờ nằm trong chữ của câu: chỉ đi qua tham số
      expect(sent[0]?.sql).not.toContain(expected);
    }
  });

  it("mọi `LIKE` trong câu có `ESCAPE '!'` đứng ngay sau; số LIKE = 2; không nối chuỗi q vào câu", async () => {
    for (const { sql } of [
      ...(await countSent({ q: 'abc' })),
      ...(await pageSent({ q: 'abc' })),
    ]) {
      expect(sql.match(/\bLIKE\b/g)).toHaveLength(2);
      expect(sql.match(/LIKE \? ESCAPE '!'/g)).toHaveLength(2);
      expect(sql).not.toContain('abc');
    }
  });
});

describe('KDD-03 câu chi tiết: MỘT câu theo khoá chính, không cột nhạy cảm', () => {
  it('một tham số là id; chỉ một điều kiện `dg.danh_gia_bac_si_id = ?`; trả dòng đầu hay null', async () => {
    const { em, sent } = recorder([{ danhGiaId: '501' }]);
    expect(await repository.findOne(em, '501')).toEqual({ danhGiaId: '501' });
    expect(sent).toEqual([{ sql: READ_DETAIL_SQL, params: ['501'] }]);
    expect(conditionsOf(`${READ_DETAIL_SQL} ORDER BY x`)).toEqual([
      'dg.danh_gia_bac_si_id = ?',
    ]);
    expect(placeholders(READ_DETAIL_SQL)).toBe(1);
    expect(await repository.findOne(recorder([]).em, '9')).toBeNull();
  });

  it('chi nhánh lấy từ `lh.chi_nhanh_id` (chi nhánh của LỊCH), không từ bác sĩ; có cả lý do ẩn và mã lịch', () => {
    expect(READ_DETAIL_SQL).toContain('lh.chi_nhanh_id AS chiNhanhId');
    expect(READ_DETAIL_SQL).toContain('dg.ly_do_an AS lyDoAn');
    expect(READ_DETAIL_SQL).toContain('lh.ma_lich_hen AS maLichHen');
    expect(READ_DETAIL_SQL).not.toMatch(/\bbac_si\b/);
  });
});

// Quét VĂN BẢN mọi file mã `admin-ratings.*` (không phải spec) của moderation/: file MỚI cùng tiền tố cũng bị quét. File của B8 (`rating-hide.*`) tự có luật riêng vì có câu ghi.
const codeOf = readdirSync(DIR)
  .filter(
    (name) =>
      name.startsWith('admin-ratings.') &&
      name.endsWith('.ts') &&
      !/\.(spec|int-spec)\.ts$/.test(name),
  )
  .map((name) => ({
    name,
    code: stripComments(readFileSync(`${DIR}${name}`, 'utf8')),
  }));

describe('KDD-21 quét văn bản mọi file mã admin-ratings.* (không phải spec)', () => {
  it('quét ĐÚNG các file mong đợi (nếu không thì luật vô nghĩa)', () => {
    expect(codeOf.map((file) => file.name).toSorted()).toEqual([
      'admin-ratings.controller.ts',
      'admin-ratings.dto.ts',
      'admin-ratings.mapper.ts',
      'admin-ratings.repository.ts',
      'admin-ratings.rules.ts',
      'admin-ratings.service.ts',
    ]);
  });

  it('SQL chỉ nằm ở admin-ratings.repository.ts: file khác không có từ khoá SQL', () => {
    for (const { name, code } of codeOf)
      if (name !== 'admin-ratings.repository.ts')
        expect(code, name).not.toMatch(
          /\b(?:SELECT|INSERT|UPDATE|DELETE|REPLACE)\b/,
        );
  });

  it('chỉ ĐỌC: không INSERT, UPDATE, DELETE, REPLACE, FOR UPDATE, LOCK IN SHARE MODE, FOR SHARE, SELECT *; không giờ hệ thống; không hàm ngày quanh cột', () => {
    for (const { name, code } of codeOf)
      expect(code, name).not.toMatch(
        /FOR\s+UPDATE|LOCK\s+IN\s+SHARE|FOR\s+SHARE|SELECT\s+\*|\bINSERT\b|\bUPDATE\s+\w|\bDELETE\b|\bREPLACE\b|\bNOW\s*\(|CURDATE\s*\(|CURRENT_TIMESTAMP|SYSDATE\s*\(|\b(?:DATE|MONTH|YEAR|DATE_FORMAT)\s*\(/i,
      );
  });

  it('chỉ chạm bốn bảng danh_gia_bac_si, lich_hen, tai_khoan, chi_nhanh; không nhật ký, thông báo, thư, hồ sơ khám, dịch vụ', () => {
    const repo =
      codeOf.find((f) => f.name === 'admin-ratings.repository.ts')?.code ?? '';
    const tables = new Set(
      [...repo.matchAll(/\b(?:FROM|JOIN)\s+`?(\w+)`?/g)].map((m) => m[1]),
    );
    expect([...tables].toSorted()).toEqual([
      'chi_nhanh',
      'danh_gia_bac_si',
      'lich_hen',
      'tai_khoan',
    ]);
    for (const { name, code } of codeOf)
      expect(code, name).not.toMatch(
        /nhat_ky|thong_bao|email_thong_bao|ho_so_kham|AuditService|ExamNotifier|AppointmentTransitionService/,
      );
  });

  it('cột của tai_khoan chỉ là tai_khoan_id và ho_ten (không email, SĐT, mật khẩu, địa chỉ, ngày sinh); không cột ly_do_kham', () => {
    const repo =
      codeOf.find((f) => f.name === 'admin-ratings.repository.ts')?.code ?? '';
    const columns = new Set(
      [...repo.matchAll(/\b(?:tbs|tbn|nd)\.(\w+)/g)].map((m) => m[1]),
    );
    expect([...columns].toSorted()).toEqual(['ho_ten', 'tai_khoan_id']);
    expect(repo).not.toMatch(
      /so_dien_thoai|email|mat_khau|dia_chi\b|ngay_sinh|gioi_tinh|ly_do_kham|anh_dai_dien|cccd/,
    );
  });

  it('không ghi log (không Logger, không console): tên, nhận xét và mã lịch không bao giờ vào log (BDK-01)', () => {
    for (const { name, code } of codeOf)
      expect(code, name).not.toMatch(/\bLogger\b|\bconsole\./);
  });
});
