import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { EntityManager } from 'typeorm';
import { stripComments } from '../../testing/architecture-scan.js';
import {
  HIDE_RATING_SQL,
  LOCK_RATING_SQL,
  RatingHideRepository,
  READ_FOR_HIDE_SQL,
} from './rating-hide.repository.js';

// doctor-exam B8 — luật quét câu SQL THẬT của ẨN đánh giá (KDD-14, KDD-23, KDD-24 `[đề xuất]`; PLAN 5.3, 5.8; HD-08; mẫu `rating.sql.spec` của B6). Không DB: `EntityManager` giả chỉ ghi câu và tham số mà
// repository THẬT gửi đi (không gõ lại câu ở test). Bài học B4 (M7 lọt AR-05): đổi thứ tự điều kiện hay thêm cột vào `SET` cho CÙNG kết quả đúng ở nhiều ca hành vi; chỉ luật quét câu này bắt.
const DIR = fileURLToPath(new URL('.', import.meta.url));

interface Sent {
  sql: string;
  params: unknown[];
}

/** `EntityManager` giả ghi câu và tham số; `answer` là kết quả trả về cho mọi câu. */
function recorder(answer: unknown = []) {
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
/** Các điều kiện của `WHERE`, theo thứ tự viết, bỏ `FOR UPDATE` và khoảng trắng thừa. */
const conditionsOf = (sql: string): string[] =>
  (/\bWHERE\b([\s\S]*)$/i.exec(sql)?.[1] ?? '')
    .replace(/\bFOR\s+UPDATE\b/i, '')
    .split(/\bAND\b/i)
    .map((part) => part.replace(/\s+/g, ' ').trim());
/** Các cột của `SET`, theo thứ tự viết. */
const setColumnsOf = (sql: string): string[] =>
  [
    ...(/\bSET\b([\s\S]*?)\bWHERE\b/i.exec(sql)?.[1] ?? '').matchAll(
      /(\w+)\s*=/g,
    ),
  ].map((match) => match[1] ?? '');

const repository = new RatingHideRepository();

describe('KDD-23 câu đọc thường: MỘT câu SELECT theo khoá chính, không khoá, chỉ ba cột', () => {
  it('đúng MỘT câu với đúng một tham số (id); không ghi, không khoá; trả đúng ba trường', async () => {
    const { em, sent } = recorder([
      { danhGiaId: '501', bacSiId: '31', chiNhanhId: '7' },
    ]);
    expect(await repository.readForHide(em, '501')).toEqual({
      danhGiaId: '501',
      bacSiId: '31',
      chiNhanhId: '7',
    });
    expect(sent).toEqual([{ sql: READ_FOR_HIDE_SQL, params: ['501'] }]);
    expect(READ_FOR_HIDE_SQL.match(/\?/g)).toHaveLength(1);
    expect(READ_FOR_HIDE_SQL).toMatch(/^\s*SELECT\b/i);
    expect(READ_FOR_HIDE_SQL).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|REPLACE|FOR\s+UPDATE|LOCK\s+IN\s+SHARE\s+MODE|FOR\s+SHARE)\b/i,
    );
  });

  it('điều kiện DUY NHẤT là khoá chính của đánh giá; nối lich_hen theo khoá chính của lịch; id qua CAST … AS CHAR (id là bigint)', () => {
    expect(conditionsOf(READ_FOR_HIDE_SQL)).toEqual([
      'dg.danh_gia_bac_si_id = ?',
    ]);
    expect(squash(READ_FOR_HIDE_SQL)).toContain(
      'INNER JOIN lich_hen lh ON lh.lich_hen_id = dg.lich_hen_id',
    );
    for (const column of ['danhGiaId', 'bacSiId', 'chiNhanhId'])
      expect(READ_FOR_HIDE_SQL).toMatch(
        new RegExp(`CAST\\([\\w.]+ AS CHAR\\) AS ${column}\\b`),
      );
  });

  it('chỉ lấy ba cột cần cho phạm vi và nhật ký: không nhận xét, tên, SĐT, email, lý do khám; không SELECT *', () => {
    expect(READ_FOR_HIDE_SQL).not.toMatch(/\*/);
    expect(READ_FOR_HIDE_SQL).not.toMatch(
      /nhan_xet|ho_ten|so_dien_thoai|email|ly_do_kham|ly_do_an|so_sao|benh_nhan_id/i,
    );
    // ba bí danh cột (không đếm `AS CHAR` của CAST)
    expect(READ_FOR_HIDE_SQL.match(/\bAS\s+(?!CHAR\b)\w+/g)).toEqual([
      'AS danhGiaId',
      'AS bacSiId',
      'AS chiNhanhId',
    ]);
  });

  it('không dòng ⇒ null', async () => {
    expect(await repository.readForHide(recorder([]).em, '501')).toBeNull();
  });
});

describe('HDK-05 câu khoá: FOR UPDATE theo khoá chính của MỘT bảng (danh_gia_bac_si, tầng 6b), không nối, không lich_hen', () => {
  it('đúng một câu, một tham số (id); chỉ danh_gia_bac_si; điều kiện là khoá chính; có FOR UPDATE', async () => {
    const { em, sent } = recorder([{ biAn: 0 }]);
    expect(await repository.lock(em, '501')).toEqual({ biAn: false });
    expect(sent).toEqual([{ sql: LOCK_RATING_SQL, params: ['501'] }]);
    expect(squash(LOCK_RATING_SQL)).toBe(
      'SELECT CAST(bi_an AS UNSIGNED) AS biAn FROM danh_gia_bac_si WHERE danh_gia_bac_si_id = ? FOR UPDATE',
    );
    expect(LOCK_RATING_SQL).not.toMatch(/\bJOIN\b|lich_hen/i);
  });

  it('bi_an ra 0, 1, "0", "1", true, false ⇒ boolean đúng; không hàng ⇒ null', async () => {
    const answer = (biAn: unknown) => recorder([{ biAn }]).em;
    expect(await repository.lock(answer(1), '1')).toEqual({ biAn: true });
    expect(await repository.lock(answer('1'), '1')).toEqual({ biAn: true });
    expect(await repository.lock(answer(true), '1')).toEqual({ biAn: true });
    expect(await repository.lock(answer(0), '1')).toEqual({ biAn: false });
    expect(await repository.lock(answer('0'), '1')).toEqual({ biAn: false });
    expect(await repository.lock(answer(false), '1')).toEqual({ biAn: false });
    expect(await repository.lock(recorder([]).em, '1')).toBeNull();
  });
});

describe('KDD-14, KDD-24 câu ẩn: chỉ đổi bi_an và ly_do_an của đúng một hàng, kèm AND bi_an = 0', () => {
  it('đúng văn bản: SET bi_an = 1 (HẰNG), ly_do_an = ?; WHERE khoá chính = ? AND bi_an = 0', () => {
    expect(squash(HIDE_RATING_SQL)).toBe(
      'UPDATE danh_gia_bac_si SET bi_an = 1, ly_do_an = ? WHERE danh_gia_bac_si_id = ? AND bi_an = 0',
    );
    expect(setColumnsOf(HIDE_RATING_SQL)).toEqual(['bi_an', 'ly_do_an']);
    expect(conditionsOf(HIDE_RATING_SQL)).toEqual([
      'danh_gia_bac_si_id = ?',
      'bi_an = 0',
    ]);
    expect(HIDE_RATING_SQL.match(/\?/g)).toHaveLength(2);
  });

  it('không đổi so_sao, nhan_xet, thoi_diem_tao, lich_hen_id (KDD-14)', () => {
    expect(HIDE_RATING_SQL).not.toMatch(
      /so_sao|nhan_xet|thoi_diem_tao|lich_hen/i,
    );
  });

  it('tham số theo thứ tự [lý do, id] khớp thứ tự dấu ?; trả số hàng đổi (affectedRows), thiếu ⇒ 0', async () => {
    const hit = recorder({ affectedRows: 1 });
    expect(await repository.markHidden(hit.em, '501', 'Lý do ẩn')).toBe(1);
    expect(hit.sent).toEqual([
      { sql: HIDE_RATING_SQL, params: ['Lý do ẩn', '501'] },
    ]);
    expect(
      await repository.markHidden(
        recorder({ affectedRows: 0 }).em,
        '501',
        'Lý do ẩn',
      ),
    ).toBe(0);
    expect(
      await repository.markHidden(recorder({}).em, '501', 'Lý do ẩn'),
    ).toBe(0);
  });
});

// Quét VĂN BẢN mọi file mã `rating-hide.*` (không phải spec) của moderation/: file MỚI cùng tiền tố cũng bị quét. Comment được bỏ trước khi quét. File `admin-ratings.*` của B7 có luật riêng (chỉ đọc).
const codeOf = readdirSync(DIR)
  .filter(
    (name) =>
      name.startsWith('rating-hide.') &&
      name.endsWith('.ts') &&
      !/\.(spec|int-spec)\.ts$/.test(name),
  )
  .map((name) => ({
    name,
    code: stripComments(readFileSync(`${DIR}${name}`, 'utf8')),
  }));
const repositoryCode =
  codeOf.find((file) => file.name === 'rating-hide.repository.ts')?.code ?? '';

describe('KDD-24 quét văn bản mọi file mã rating-hide.* (không phải spec)', () => {
  it('quét ĐÚNG các file mong đợi (nếu không thì luật vô nghĩa)', () => {
    expect(codeOf.map((file) => file.name).toSorted()).toEqual([
      'rating-hide.dto.ts',
      'rating-hide.failure.ts',
      'rating-hide.repository.ts',
      'rating-hide.rules.ts',
      'rating-hide.service.ts',
    ]);
  });

  it('SQL chỉ nằm ở rating-hide.repository.ts: file khác không có từ khoá SQL', () => {
    for (const { name, code } of codeOf)
      if (name !== 'rating-hide.repository.ts')
        expect(code, name).not.toMatch(
          /\b(?:SELECT|INSERT|UPDATE|DELETE|REPLACE)\b/,
        );
  });

  it('không SELECT *, DELETE, REPLACE, INSERT, giờ hệ thống, hàm ngày; thời gian không vào câu nào (nhật ký tự lấy `at`)', () => {
    for (const { name, code } of codeOf)
      expect(code, name).not.toMatch(
        /SELECT\s+\*|\bDELETE\b|\bREPLACE\b|\bINSERT\b|\bNOW\s*\(|CURDATE\s*\(|CURRENT_TIMESTAMP|SYSDATE\s*\(|\b(?:DATE|MONTH|YEAR|DATE_FORMAT)\s*\(/i,
      );
  });

  it('FOR UPDATE xuất hiện ĐÚNG MỘT lần, trong câu khoá danh_gia_bac_si; không LOCK IN SHARE MODE, FOR SHARE', () => {
    const all = codeOf.map((file) => file.code).join('\n');
    expect(all.match(/FOR\s+UPDATE/gi)).toHaveLength(1);
    expect(repositoryCode).toMatch(
      /LOCK_RATING_SQL\s*=\s*`[^`]*FROM danh_gia_bac_si[^`]*FOR UPDATE`/,
    );
    expect(all).not.toMatch(/LOCK\s+IN\s+SHARE|FOR\s+SHARE/i);
  });

  it('UPDATE xuất hiện ĐÚNG MỘT lần và chỉ trên danh_gia_bac_si (không UPDATE lich_hen, khung_gio, thong_bao…)', () => {
    const all = codeOf.map((file) => file.code).join('\n');
    expect(all.match(/\bUPDATE\b/g)).toHaveLength(2); // `UPDATE danh_gia_bac_si` và `FOR UPDATE`
    expect(all.match(/\bUPDATE\s+(\w+)/g)).toEqual(['UPDATE danh_gia_bac_si']);
  });

  it('chỉ chạm hai bảng danh_gia_bac_si và lich_hen; lich_hen CHỈ ở câu đọc thường (không khoá, không ghi: PLAN 5.3 "không khoá lich_hen")', () => {
    for (const { name, code } of codeOf) {
      const tables = [
        ...code.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+`?(\w+)`?/g),
      ].map((match) => match[1]);
      for (const table of tables)
        expect(
          ['lich_hen', 'danh_gia_bac_si'],
          `${name}: ${String(table)}`,
        ).toContain(table);
    }
    const withoutRead = repositoryCode.replace(
      /READ_FOR_HIDE_SQL\s*=\s*`[^`]*`/,
      '',
    );
    expect(withoutRead).not.toMatch(/lich_hen/);
  });

  it('không chạm nhật ký, thông báo, thư, hồ sơ khám bằng SQL; nhật ký đi qua AuditService (service) và không file nào gọi AppointmentTransitionService hay ExamNotifier', () => {
    for (const { name, code } of codeOf)
      expect(code, name).not.toMatch(
        /nhat_ky|thong_bao|email_thong_bao|ho_so_kham|ExamNotifier|AppointmentTransitionService/,
      );
    const service =
      codeOf.find((file) => file.name === 'rating-hide.service.ts')?.code ?? '';
    expect(service.match(/\.record\(/g)).toHaveLength(1);
    expect(service).toMatch(/action:\s*'AnDanhGia'/);
  });

  it('không file nào nhắc nhận xét, tên, SĐT, email, lý do khám (nhật ký và phản hồi không lộ dữ liệu cá nhân: TDK-05)', () => {
    for (const { name, code } of codeOf)
      expect(code, name).not.toMatch(
        /nhan_xet|nhanXet|ho_ten|hoTen|so_dien_thoai|soDienThoai|email|ly_do_kham|lyDoKham/i,
      );
  });

  it('không ghi log (không Logger, không console): lý do ẩn không bao giờ vào log (BDK-01)', () => {
    for (const { name, code } of codeOf)
      expect(code, name).not.toMatch(/\bLogger\b|\bconsole\./);
  });
});

describe('KDD-13, KDD-24 bảng route của controller: không PUT, PATCH, DELETE; POST duy nhất là `:id/hide`', () => {
  const controller = stripComments(
    readFileSync(`${DIR}admin-ratings.controller.ts`, 'utf8'),
  );

  it('đúng hai @Get và MỘT @Post(":id/hide"); không @Put, @Patch, @Delete, @All', () => {
    expect(controller.match(/@Get\(/g)).toHaveLength(2);
    expect(controller.match(/@Post\(/g)).toHaveLength(1);
    expect(controller).toMatch(/@Post\(\s*':id\/hide'\s*\)/);
    expect(controller).not.toMatch(/@(?:Put|Patch|Delete|All|Options|Head)\(/);
  });

  it('không route nào có tên hiện lại (show, unhide, restore, reveal, undo)', () => {
    expect(controller).not.toMatch(
      /['"/:](?:show|unhide|restore|reveal|undo)['"/]/i,
    );
  });
});
