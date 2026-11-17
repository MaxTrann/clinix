// Hình dạng dữ liệu ví mà web dùng (payment F1; hợp đồng `GET /patient/wallet` và `GET /patient/wallet/transactions` của B1, PLAN 5.11 #1, #2).
// Tiền là CHUỖI decimal, id là chuỗi: không đổi sang `number` ở bất kỳ đâu (H4, WVI-04).

export const WALLET_TRANSACTION_TYPES = [
  'Nap',
  'ThanhToan',
  'HoanTien',
  'Rut',
] as const;
export type WalletTransactionType = (typeof WALLET_TRANSACTION_TYPES)[number];

export const WITHDRAWAL_STATUSES = ['ChoDuyet', 'DaDuyet', 'TuChoi'] as const;
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number];

// Trạng thái một dòng lịch sử: sổ cái luôn `ThanhCong`; nạp chưa ra sổ `DangXuLy`/`ThatBai`; yêu cầu rút chưa ra sổ `ChoDuyet`/`TuChoi`
export const WALLET_TRANSACTION_STATUSES = [
  'ThanhCong',
  'DangXuLy',
  'ThatBai',
  ...WITHDRAWAL_STATUSES,
] as const;
export type WalletTransactionStatus =
  (typeof WALLET_TRANSACTION_STATUSES)[number];

export interface LatestWithdrawal {
  maYeuCau: string;
  soTien: string;
  trangThai: WithdrawalStatus;
  thoiDiemYeuCau: string;
}

// Chỉ các khoá F1 hiển thị. `hanMucNap`, `congThanhToan` là của tab Nạp tiền (F2) nên F1 không đọc.
export interface WalletOverview {
  soDuKhaDung: string;
  soTienDangGiu: string;
  napChoXacNhan: string;
  yeuCauRutGanNhat: LatestWithdrawal | null;
}

export interface WalletTransaction {
  id: string;
  thoiDiem: string;
  loai: WalletTransactionType;
  noiDung: string;
  // CÓ DẤU: tiền vào dương, tiền ra âm
  soTien: string;
  trangThai: WalletTransactionStatus;
  // Nạp `DangXuLy` quá cửa sổ chờ: hiện "Chưa nhận kết quả" (PLAN 4.7 #2). Máy chủ tính, web không tự lọc.
  quaCuaSo: boolean;
}

export interface WalletTransactionPage {
  items: WalletTransaction[];
  total: number;
  trang: number;
  kichThuoc: number;
}
