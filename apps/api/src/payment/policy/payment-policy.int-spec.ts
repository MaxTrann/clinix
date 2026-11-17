import type { DataSource } from 'typeorm';
import { BookingFixtures } from '../../appointments/testing/booking-fixtures.js';
import {
  createAppointmentWorld,
  failureOf,
  lichHenRows,
} from '../../appointments/testing/create-appointment-world.js';
import { failAfterStatement } from '../../appointments/testing/statement-recorder.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import {
  MAU,
  SYSTEM_SCOPE,
  adminServiceOf,
  policyBody,
  policyService,
} from '../testing/policy-kit.js';
import { PaymentPolicyService } from './payment-policy.service.js';
import { PaymentPolicyRepository } from './policy.repository.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';

// payment B10 — cấu hình chính sách cọc trên MySQL 8.4 THẬT (PLAN payment 7.1): CSD-01, CSD-02, CSD-04, CSD-09, CSD-10, CSD-11, CSD-12 (phần dữ liệu), CSD-13, CSD-17, CSD-18. Phần HTTP (CSD-14, CSD-15)
// ở `test/payment-policy.e2e-spec.ts`; đồng thời (CSD-16, CSD-19, DTT-14, M15) ở `payment-policy.concurrency.int-spec.ts`. Dùng thế giới đặt lịch của booking để chứng minh KHÔNG HỒI TỐ bằng `create` thật.
// Dịch vụ của thế giới có `gia_mac_dinh` = 100000.00. Dữ liệu giả.
let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const system = SYSTEM_SCOPE;
const policies = () => policyService(db);
const adminServices = () => adminServiceOf(db);
const body = policyBody;

/** Trạng thái cọc và mốc của một dịch vụ đọc thẳng từ DB (mốc giờ giảm dần). */
async function stored(id: string) {
  const [row]: { coc: string }[] = await db.query(
    'SELECT CAST(muc_dat_coc AS CHAR) AS coc FROM dich_vu_kham WHERE dich_vu_kham_id = ?',
    [id],
  );
  const moc: { soGio: number; tyLe: number }[] = await db.query(
    'SELECT so_gio_truoc_toi_thieu AS soGio, ty_le_hoan AS tyLe FROM moc_hoan_tien WHERE dich_vu_kham_id = ? ORDER BY so_gio_truoc_toi_thieu DESC',
    [id],
  );
  return { coc: row!.coc, moc };
}

describe('CSD đọc: danh sách và chi tiết', () => {
  it('CSD-01 danh sách theo nhóm kèm mucDatCoc và coChinhSachRieng: chưa cấu hình là "mặc định", có cọc hay có mốc là "riêng"; id và tiền là chuỗi', async () => {
    const w = await fx.world();
    const serviceId = w.doctor.profile.dichVuKhamId;
    const other = await fx.admin.catalog();
    const otherId = other.service.dichVuKhamId;
    const third = await fx.admin.catalog();

    await policies().replace(system, serviceId, body('100000', MAU));
    // Cọc 0 mà có mốc: vẫn là chính sách riêng (đã cấu hình mốc)
    await policies().replace(system, otherId, body('0', [[10, 100]]));

    const { nhom } = await policies().list(system);
    const all = nhom.flatMap((group) => group.dichVu);
    const byId = new Map(all.map((item) => [item.dichVuKhamId, item]));
    expect(byId.get(serviceId)).toMatchObject({
      mucDatCoc: '100000.00',
      giaMacDinh: '100000.00',
      coChinhSachRieng: true,
    });
    expect(byId.get(otherId)).toMatchObject({
      mucDatCoc: '0.00',
      coChinhSachRieng: true,
    });
    expect(byId.get(third.service.dichVuKhamId)).toMatchObject({
      mucDatCoc: '0.00',
      coChinhSachRieng: false,
    });
    // Mỗi dịch vụ nằm đúng nhóm của nó, nhóm có tên; không dịch vụ nào bị lặp
    expect(all).toHaveLength(new Set(all.map((i) => i.dichVuKhamId)).size);
    const group = nhom.find((g) =>
      g.dichVu.some((i) => i.dichVuKhamId === otherId),
    );
    expect(group).toMatchObject({
      nhomDichVuId: other.group.nhomDichVuId,
      ten: other.group.ten,
    });
    expect(typeof group!.nhomDichVuId).toBe('string');
  });

  it('CSD-01 chi tiết một dịch vụ: cọc và mốc giờ giảm dần; dịch vụ không tồn tại ⇒ 404 KHONG_TIM_THAY', async () => {
    const w = await fx.world();
    const id = w.doctor.profile.dichVuKhamId;
    await policies().replace(
      system,
      id,
      body('50000', [
        [0, 0],
        [24, 100],
        [2, 50],
      ]),
    );

    expect(await policies().get(system, id)).toStrictEqual({
      dichVuKhamId: id,
      mucDatCoc: '50000.00',
      moc: [
        { soGioTruocToiThieu: 24, tyLeHoan: 100 },
        { soGioTruocToiThieu: 2, tyLeHoan: 50 },
        { soGioTruocToiThieu: 0, tyLeHoan: 0 },
      ],
    });
    const failure = await failureOf(policies().get(system, '999999999'));
    expect(failure.status).toBe(404);
    expect(failure.body.maLoi).toBe('KHONG_TIM_THAY');
  });

  it('phạm vi: Quản trị viên chi nhánh bị từ chối ở service dù guard ở controller bị bỏ qua (kiểm ở backend)', async () => {
    const w = await fx.world();
    const id = w.doctor.profile.dichVuKhamId;
    const branch = { kind: 'ChiNhanh', chiNhanhId: '1' } as const;
    for (const call of [
      () => policies().list(branch),
      () => policies().get(branch, id),
      () => policies().replace(branch, id, body('0', [])),
    ]) {
      expect((await failureOf(call())).status).toBe(403);
    }
    expect((await stored(id)).coc).toBe('0.00');
  });
});

describe('CSD ghi: thay toàn bộ cọc và mốc trong một giao dịch', () => {
  it('CSD-02 PUT hợp lệ (cọc 100.000; 24 ⇒ 100, 2 ⇒ 50, 0 ⇒ 0): lưu đủ, đọc lại đúng, mốc giờ giảm dần; PUT lần hai THAY hẳn bộ mốc cũ', async () => {
    const w = await fx.world();
    const id = w.doctor.profile.dichVuKhamId;

    const saved = await policies().replace(system, id, body('100000', MAU));
    expect(saved).toStrictEqual({
      dichVuKhamId: id,
      mucDatCoc: '100000.00',
      moc: [
        { soGioTruocToiThieu: 24, tyLeHoan: 100 },
        { soGioTruocToiThieu: 2, tyLeHoan: 50 },
        { soGioTruocToiThieu: 0, tyLeHoan: 0 },
      ],
    });
    expect(await stored(id)).toStrictEqual({
      coc: '100000.00',
      moc: [
        { soGio: 24, tyLe: 100 },
        { soGio: 2, tyLe: 50 },
        { soGio: 0, tyLe: 0 },
      ],
    });

    // Lần hai: ít mốc hơn, giờ khác. Mốc cũ không còn sót (không cộng dồn).
    await policies().replace(system, id, body('60000', [[48, 80]]));
    expect(await stored(id)).toStrictEqual({
      coc: '60000.00',
      moc: [{ soGio: 48, tyLe: 80 }],
    });
  });

  it('CSD-02 một giao dịch, thứ tự khoá đúng: câu đầu là SELECT … FOR UPDATE hàng dich_vu_kham, rồi UPDATE cọc, DELETE mốc, INSERT mốc (không ghi gì trước khi khoá)', async () => {
    const w = await fx.world();
    const id = w.doctor.profile.dichVuKhamId;
    const seen: string[] = [];
    // Ghi lại từng câu bằng cách bọc `manager.query` của giao dịch THẬT (câu vẫn chạy thật)
    const repo = new PaymentPolicyRepository(db);
    const original = repo.transaction.bind(repo);
    vi.spyOn(repo, 'transaction').mockImplementation((work) =>
      original(async (manager) => {
        const query = manager.query.bind(manager);
        manager.query = ((sql: string, params?: unknown[]) => {
          seen.push(sql.replace(/\s+/g, ' ').trim());
          return query(sql, params);
        }) as typeof manager.query;
        return work(manager);
      }),
    );
    await new PaymentPolicyService(repo, new BranchAccessPolicy()).replace(
      system,
      id,
      body('100000', MAU),
    );

    expect(seen[0]).toMatch(
      /FROM dich_vu_kham WHERE dich_vu_kham_id=\? FOR UPDATE$/,
    );
    expect(
      seen.slice(1, 4).map((sql) => sql.split(' ').slice(0, 3).join(' ')),
    ).toEqual([
      'UPDATE dich_vu_kham SET',
      'DELETE FROM moc_hoan_tien',
      'INSERT INTO moc_hoan_tien',
    ]);
    // Câu cập nhật dịch vụ CHỈ đổi muc_dat_coc (CSD-17: câu hẹp)
    expect(seen[1]).toBe(
      'UPDATE dich_vu_kham SET muc_dat_coc=? WHERE dich_vu_kham_id=?',
    );
  });

  it('CSD-04 cọc vượt giá ⇒ 400 CHINH_SACH_COC_KHONG_HOP_LE kèm MUC_COC_VUOT_GIA; đúng bằng giá là hợp lệ (biên); giá đọc từ DB (không tin client)', async () => {
    const w = await fx.world();
    const id = w.doctor.profile.dichVuKhamId;

    const failure = await failureOf(
      policies().replace(system, id, body('100001', MAU)),
    );
    expect(failure.status).toBe(400);
    expect(failure.body).toMatchObject({
      maLoi: 'CHINH_SACH_COC_KHONG_HOP_LE',
      loi: [{ truong: 'mucDatCoc', ma: 'MUC_COC_VUOT_GIA' }],
    });
    expect((await stored(id)).coc).toBe('0.00');

    await policies().replace(system, id, body('100000', MAU));
    expect((await stored(id)).coc).toBe('100000.00');
  });

  it('CSD-09 lỗi hợp lệ ⇒ DB giữ NGUYÊN cọc và mốc cũ; thân lỗi liệt kê đủ lỗi, không mang giá trị gửi lên', async () => {
    const w = await fx.world();
    const id = w.doctor.profile.dichVuKhamId;
    await policies().replace(system, id, body('100000', MAU));
    const before = await stored(id);

    const failure = await failureOf(
      policies().replace(
        system,
        id,
        body('-7', [
          [24, 101],
          [24, 50],
          [2, 100],
        ]),
      ),
    );
    expect(failure.status).toBe(400);
    const codes = (
      failure.body as unknown as { loi: { truong: string; ma: string }[] }
    ).loi;
    expect(codes).toEqual([
      { truong: 'mucDatCoc', ma: 'MUC_COC_AM' },
      { truong: 'moc[0].tyLeHoan', ma: 'TY_LE_HOAN_NGOAI_KHOANG' },
      { truong: 'moc[1].soGioTruocToiThieu', ma: 'MOC_TRUNG_SO_GIO' },
    ]);
    expect(JSON.stringify(failure.body)).not.toMatch(/-7|101/);
    expect(await stored(id)).toStrictEqual(before);
  });

  it('CSD-10 ★ ép lỗi ở INSERT mốc giữa chừng (sau UPDATE cọc và DELETE mốc đã chạy thật) ⇒ hoàn tác TRỌN: cọc và mốc cũ còn nguyên', async () => {
    const w = await fx.world();
    const id = w.doctor.profile.dichVuKhamId;
    await policies().replace(system, id, body('100000', MAU));
    const before = await stored(id);

    const boom = new Error('lỗi giả sau INSERT mốc');
    const matched = failAfterStatement(db, /^INSERT INTO moc_hoan_tien/i, boom);
    await expect(
      policies().replace(system, id, body('50000', [[12, 70]])),
    ).rejects.toBe(boom);

    // INSERT đã chạy thật rồi mới ném (không phải ném trước khi ghi): hoàn tác là việc của giao dịch
    expect(matched).toHaveLength(1);
    expect(await stored(id)).toStrictEqual(before);
  });

  it('CSD-11 ★ KHÔNG HỒI TỐ: lịch tạo TRƯỚC khi đổi giữ snapshot cũ; lịch tạo SAU (qua `create` thật) chụp chính sách mới', async () => {
    const w = await createAppointmentWorld(db, fx);
    const serviceId = w.dichVuKhamId;
    await policies().replace(system, serviceId, body('100000', MAU));

    const first = await w.create(0);
    expect(first).toMatchObject({
      trangThai: 'ChoThanhToan',
      tienCoc: '100000.00',
    });
    const [before] = await lichHenRows(db);
    expect(before).toMatchObject({ coc: '100000.00' });
    // JSON snapshot do booking chụp dùng khoá snake_case của cột (định dạng của booking, không phải của API này)
    expect(before!.chinhSach).toEqual([
      { so_gio_truoc_toi_thieu: 24, ty_le_hoan: 100 },
      { so_gio_truoc_toi_thieu: 2, ty_le_hoan: 50 },
      { so_gio_truoc_toi_thieu: 0, ty_le_hoan: 0 },
    ]);

    await policies().replace(system, serviceId, body('40000', [[6, 30]]));

    // Lịch cũ: nguyên si, kể cả thứ tự khoá trong JSON
    const [after] = await lichHenRows(db);
    expect(after).toStrictEqual(before);

    // Lịch mới tạo sau (cùng Bệnh nhân, ô khác) chụp chính sách mới
    const second = await w.create(1);
    expect(second).toMatchObject({ tienCoc: '40000.00' });
    const rows = await lichHenRows(db);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ coc: '40000.00' });
    expect(rows[1]!.chinhSach).toEqual([
      { so_gio_truoc_toi_thieu: 6, ty_le_hoan: 30 },
    ]);
    // Và lịch cũ VẪN nguyên sau khi lịch mới ra đời
    expect((await lichHenRows(db))[0]).toStrictEqual(before);
  });

  it('CSD-12 ★ (phần dữ liệu) lịch ChoThanhToan tạo trước khi đổi cọc vẫn mang tien_coc_snapshot cũ sau khi cọc hiện hành đổi, kể cả khi đổi về 0; việc payment ĐÒI đúng số này là TLK-12 của B5', async () => {
    const w = await createAppointmentWorld(db, fx);
    const serviceId = w.dichVuKhamId;
    await policies().replace(system, serviceId, body('100000', MAU));
    await w.create(0);

    for (const next of ['60000', '0', '100000']) {
      await policies().replace(system, serviceId, body(next, []));
      const [row] = await lichHenRows(db);
      expect(row).toMatchObject({
        trangThai: 'ChoThanhToan',
        coc: '100000.00',
      });
    }
  });

  it('CSD-13 cọc > 0 và mảng mốc rỗng: lưu được; lịch tạo sau có chinh_sach_hoan_snapshot = [] (không hoàn)', async () => {
    const w = await createAppointmentWorld(db, fx);
    await policies().replace(system, w.dichVuKhamId, body('100000', MAU));
    await policies().replace(system, w.dichVuKhamId, body('80000', []));
    expect(await stored(w.dichVuKhamId)).toStrictEqual({
      coc: '80000.00',
      moc: [],
    });

    await w.create(0);
    const [row] = await lichHenRows(db);
    expect(row).toMatchObject({ coc: '80000.00', chinhSachSqlNull: '0' });
    expect(row!.chinhSach).toEqual([]);
  });

  it('CSD-17 PUT không đổi cột nào khác của dich_vu_kham (tên, giá, thời lượng, nhóm) và không đụng dịch vụ khác hay mốc của dịch vụ khác', async () => {
    const w = await fx.world();
    const id = w.doctor.profile.dichVuKhamId;
    const other = (await fx.admin.catalog()).service.dichVuKhamId;
    await policies().replace(system, other, body('30000', [[5, 20]]));

    const snapshot = async () => ({
      rows: await db.query(
        'SELECT dich_vu_kham_id, nhom_dich_vu_id, ten, thoi_luong, CAST(gia_mac_dinh AS CHAR) AS gia, CAST(muc_dat_coc AS CHAR) AS coc FROM dich_vu_kham ORDER BY dich_vu_kham_id',
      ),
      mocKhac: await stored(other),
    });
    const before = await snapshot();
    await policies().replace(system, id, body('90000', MAU));
    const after = await snapshot();

    const changed = (after.rows as Record<string, unknown>[]).filter(
      (row, i) =>
        JSON.stringify(row) !==
        JSON.stringify((before.rows as Record<string, unknown>[])[i]),
    );
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ dich_vu_kham_id: id, coc: '90000.00' });
    // Chỉ cột `coc` khác: mọi cột còn lại của dịch vụ đó bằng nhau
    const row = (rows: unknown, key: string) =>
      (rows as Record<string, unknown>[]).find(
        (r) => String(r.dich_vu_kham_id) === key,
      )!;
    expect({ ...row(after.rows, id), coc: null }).toStrictEqual({
      ...row(before.rows, id),
      coc: null,
    });
    expect(after.mocKhac).toStrictEqual(before.mocKhac);
  });
});

describe('CSD-18 đường admin: hạ giá không được dưới mức cọc', () => {
  it('CSD-18 hạ giaMacDinh xuống DƯỚI cọc hiện hành ⇒ 409 GIA_DUOI_MUC_COC và DB giữ giá cũ; hạ đúng BẰNG cọc là hợp lệ (biên)', async () => {
    const w = await fx.world();
    const id = w.doctor.profile.dichVuKhamId;
    await policies().replace(system, id, body('100000', MAU));

    const failure = await failureOf(
      adminServices().update(system, id, { giaMacDinh: '99999' }),
    );
    expect(failure.status).toBe(409);
    expect(failure.body).toMatchObject({
      maLoi: 'GIA_DUOI_MUC_COC',
      thongBao: 'Giá mặc định không được thấp hơn mức đặt cọc của dịch vụ.',
    });
    const [still]: { gia: string }[] = await db.query(
      'SELECT CAST(gia_mac_dinh AS CHAR) AS gia FROM dich_vu_kham WHERE dich_vu_kham_id = ?',
      [id],
    );
    expect(still!.gia).toBe('100000.00');

    await expect(
      adminServices().update(system, id, { giaMacDinh: '100000' }),
    ).resolves.toMatchObject({ giaMacDinh: '100000.00' });
    // Cọc hạ xuống thì giá được phép hạ theo
    await policies().replace(system, id, body('50000', MAU));
    await expect(
      adminServices().update(system, id, { giaMacDinh: '50000' }),
    ).resolves.toMatchObject({ giaMacDinh: '50000.00' });
  });

  it('CSD-18 dịch vụ cọc 0đ hạ giá tuỳ ý; sửa trường khác (tên) khi giá đang bằng cọc không bị chặn', async () => {
    const w = await fx.world();
    const id = w.doctor.profile.dichVuKhamId;
    await expect(
      adminServices().update(system, id, { giaMacDinh: '1' }),
    ).resolves.toMatchObject({ giaMacDinh: '1.00' });

    await policies().replace(system, id, body('1', []));
    await expect(
      adminServices().update(system, id, { ten: 'Tên mới của dịch vụ' }),
    ).resolves.toMatchObject({ ten: 'Tên mới của dịch vụ' });
  });
});
