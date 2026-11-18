import { afterEach, describe, expect, it } from 'vitest';
import { UnexpectedResponseError } from '../../../shared/api/errors';
import {
  cleanUpFakeTopupApi,
  installFakeTopupApi,
  statusBody,
} from '../testing/fake-topup-api';
import { createTopup, getTopupStatus, parseTopupStatus } from './topup-api';

// payment F2: lớp gọi API nạp ví (hợp đồng B4). Mã test case theo PLAN payment 7 (WNT).
afterEach(cleanUpFakeTopupApi);

describe('topup-api (payment F2)', () => {
  it('WNT-01 tạo nạp: POST đúng hai khoá soTien (chuỗi chữ số) và phuongThuc, không gửi id ví hay Bệnh nhân', async () => {
    const api = installFakeTopupApi();
    await createTopup({ soTien: '200000', phuongThuc: 'VNPay' });
    expect(api.calls).toEqual([
      {
        method: 'POST',
        path: '/patient/wallet/topups',
        body: { soTien: '200000', phuongThuc: 'VNPay' },
      },
    ]);
  });

  it('WNT-05 đọc trạng thái: giữ NGUYÊN chuỗi tiền; trạng thái, cổng lạ hay tiền dạng số ⇒ lỗi hình dạng', async () => {
    installFakeTopupApi();
    expect(await getTopupStatus('42')).toEqual(statusBody());
    for (const patch of [
      { trangThai: 'HetHan' },
      { phuongThuc: 'Vi' },
      { soTien: 200000 },
      { daCongVi: 'true' },
      { thoiDiemTao: 'không phải ngày' },
    ])
      expect(() => parseTopupStatus(statusBody(patch))).toThrow(
        UnexpectedResponseError,
      );
  });
});
