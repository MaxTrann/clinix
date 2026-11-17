import { describe, expect, it } from 'vitest';
import type { WalletTransaction } from '../api/wallet-types';
import {
  describeTransaction,
  formatVietnamDate,
  formatVietnamTime,
  withdrawalStatusLabel,
} from './wallet-labels';

// payment F1: chữ và màu của một dòng lịch sử ví. Dữ liệu giả.
const tx = (patch: Partial<WalletTransaction>): WalletTransaction => ({
  id: 'vi-1',
  thoiDiem: '2026-10-08T01:05:00.000Z',
  loai: 'Nap',
  noiDung: 'Nạp tiền vào ví qua VNPAY',
  soTien: '500000.00',
  trangThai: 'ThanhCong',
  quaCuaSo: false,
  ...patch,
});

describe('wallet-labels (payment F1)', () => {
  it('WVI-01 dòng đã ra sổ: tiền vào "+" xanh, cọc "−" đỏ, đúng chữ Figma 417:2', () => {
    expect(describeTransaction(tx({}))).toEqual({
      typeLabel: 'Nạp ví',
      typeIcon: 'in',
      amountText: '+500.000đ',
      amountTone: 'success',
      statusLabel: 'Thành công',
      statusTone: 'success',
    });
    const deposit = describeTransaction(
      tx({ loai: 'ThanhToan', soTien: '-100000.00' }),
    );
    expect(deposit).toMatchObject({
      typeLabel: 'Đặt cọc',
      typeIcon: 'out',
      amountText: '−100.000đ',
      amountTone: 'danger',
    });
    expect(
      describeTransaction(tx({ loai: 'HoanTien', soTien: '50000.50' })),
    ).toMatchObject({ typeLabel: 'Hoàn tiền', amountText: '+50.000,5đ' });
    expect(
      describeTransaction(tx({ loai: 'Rut', soTien: '-100000.00' })),
    ).toMatchObject({ typeLabel: 'Rút tiền', amountTone: 'danger' });
  });

  it('WVI-01 nạp DangXuLy trong cửa sổ là "Đang xử lý", quá cửa sổ là "Chưa nhận kết quả" (không gọi là thất bại); số tiền không dấu', () => {
    const pending = describeTransaction(tx({ trangThai: 'DangXuLy' }));
    expect(pending).toMatchObject({
      statusLabel: 'Đang xử lý',
      statusTone: 'warning',
      amountText: '500.000đ',
      amountTone: 'neutral',
    });
    const stale = describeTransaction(
      tx({ trangThai: 'DangXuLy', quaCuaSo: true }),
    );
    expect(stale).toMatchObject({
      statusLabel: 'Chưa nhận kết quả',
      statusTone: 'neutral',
    });
    expect(describeTransaction(tx({ trangThai: 'ThatBai' })).statusLabel).toBe(
      'Thất bại',
    );
  });

  it('WVI-05 yêu cầu rút chưa trừ số dư: "Yêu cầu rút", số tiền KHÔNG dấu (Figma 437:2); đủ ba trạng thái rút', () => {
    const waiting = describeTransaction(
      tx({ loai: 'Rut', soTien: '-100000.00', trangThai: 'ChoDuyet' }),
    );
    expect(waiting).toMatchObject({
      typeLabel: 'Yêu cầu rút',
      typeIcon: 'withdraw',
      amountText: '100.000đ',
      amountTone: 'neutral',
      statusLabel: 'Chờ duyệt',
      statusTone: 'warning',
    });
    expect(
      describeTransaction(
        tx({ loai: 'Rut', soTien: '-100000.00', trangThai: 'TuChoi' }),
      ),
    ).toMatchObject({ typeLabel: 'Yêu cầu rút', statusLabel: 'Từ chối' });
    expect(withdrawalStatusLabel('DaDuyet')).toEqual({
      label: 'Đã duyệt',
      tone: 'success',
    });
  });

  it('ngày giờ theo giờ Việt Nam: 17:30Z là 00:30 của ngày hôm sau (ca biên qua nửa đêm)', () => {
    expect(formatVietnamDate('2026-10-08T01:05:00.000Z')).toBe('08/10/2026');
    expect(formatVietnamTime('2026-10-08T01:05:00.000Z')).toBe('08:05');
    expect(formatVietnamDate('2026-12-31T17:30:00.000Z')).toBe('01/01/2027');
    expect(formatVietnamTime('2026-12-31T17:30:00.000Z')).toBe('00:30');
  });
});
