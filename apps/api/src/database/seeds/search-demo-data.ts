// Dữ liệu demo cho module search (task P2). Toàn bộ là minh họa [đề xuất], chờ Đại review;
// không phải số liệu hay quyết định nghiệp vụ chính thức. Không có phụ phí và đánh giá (Q24).
import { CATALOG_BRANCHES, CATALOG_SERVICES } from './catalog-data.js';

type Branch = (typeof CATALOG_BRANCHES)[number];

// Toạ độ chỉ mang tính minh họa quanh TP.HCM; chỉ điền khi chi nhánh chưa có toạ độ.
export const BRANCH_COORDINATES: {
  branch: Branch;
  lat: string;
  lng: string;
}[] = [
  { branch: CATALOG_BRANCHES[0]!, lat: '10.7769000', lng: '106.7009000' },
  { branch: CATALOG_BRANCHES[1]!, lat: '10.7843000', lng: '106.6844000' },
  { branch: CATALOG_BRANCHES[2]!, lat: '10.8503000', lng: '106.7717000' },
  { branch: CATALOG_BRANCHES[3]!, lat: '10.7324000', lng: '106.7197000' },
];

// Lịch gốc của seed catalog: T2–T7 sáng 08–12 + chiều 13–17, CN nghỉ.
// Chỉ đổi khi dòng đó còn đúng giá trị gốc, để không ghi đè lịch đã chỉnh tay.
export const SCHEDULE_CHANGES = [
  // Mẫu 2: thứ 7 chỉ nhận khám buổi sáng (nghỉ chiều thứ 7).
  { branch: CATALOG_BRANCHES[1]!, weekday: 6, open: true },
  // Mẫu 3: Chủ nhật nhận khám buổi sáng.
  { branch: CATALOG_BRANCHES[2]!, weekday: 7, open: true },
  // Mẫu 4: nghỉ cả thứ 7.
  { branch: CATALOG_BRANCHES[3]!, weekday: 6, open: false },
] as const;

export const SPECIALTY_DESCRIPTIONS: Record<string, string> = {
  'Cơ Xương Khớp':
    'Khám và theo dõi các bệnh về xương, khớp, cột sống và cơ (dữ liệu minh họa).',
  'Thần kinh':
    'Khám các vấn đề về đau đầu, chóng mặt, rối loạn giấc ngủ và thần kinh ngoại biên (dữ liệu minh họa).',
  'Tiêu hóa':
    'Khám các bệnh dạ dày, ruột, gan mật và rối loạn tiêu hóa (dữ liệu minh họa).',
  'Nội tổng quát':
    'Khám sức khỏe ban đầu, tư vấn và định hướng chuyên khoa phù hợp (dữ liệu minh họa).',
  'Y học gia đình':
    'Chăm sóc sức khỏe liên tục cho các thành viên trong gia đình (dữ liệu minh họa).',
  'Tâm thần':
    'Tư vấn và theo dõi các vấn đề lo âu, trầm cảm và sức khỏe tinh thần (dữ liệu minh họa).',
  'Tim mạch':
    'Khám huyết áp, nhịp tim và tầm soát bệnh tim mạch (dữ liệu minh họa).',
  'Tai Mũi Họng':
    'Khám các bệnh lý tai, mũi, họng và vùng đầu cổ (dữ liệu minh họa).',
};

// Chuyên khoa NgungHoatDong để thử ẩn khỏi tra cứu công khai.
export const INACTIVE_SPECIALTY = {
  ten: 'Da liễu (ngừng hoạt động)',
  moTa: 'Chuyên khoa mẫu đã ngừng hoạt động, dùng để thử lọc dữ liệu (dữ liệu minh họa).',
};

export interface DemoDoctor {
  email: string;
  name: string;
  phone: string;
  active: boolean; // false => ChoKichHoat, chưa có mật khẩu
  title:
    'BS' | 'BS_CKI' | 'BS_CKII' | 'ThS_BS' | 'TS_BS' | 'PGS_TS_BS' | 'GS_TS_BS';
  degree: 'BS' | 'ThS' | 'TS' | 'PGS' | 'GS';
  years: number;
  specialty: string;
  branch: Branch;
  service: string;
  bio: string;
}

const CHUYEN_KHOA = CATALOG_SERVICES[0].name;
const TONG_QUAT = CATALOG_SERVICES[1].name;
const [B1, B2, B3, B4] = CATALOG_BRANCHES as [Branch, Branch, Branch, Branch];

export const DEMO_DOCTORS: DemoDoctor[] = [
  {
    email: 'bacsi01@example.com',
    name: 'Trần Văn Hùng',
    phone: '0900000101',
    active: true,
    title: 'BS_CKII',
    degree: 'BS',
    years: 20,
    specialty: 'Cơ Xương Khớp',
    branch: B1,
    service: CHUYEN_KHOA,
    bio: 'Bác sĩ mẫu, quan tâm thoái hóa khớp và đau cột sống (dữ liệu minh họa).',
  },
  {
    email: 'bacsi02@example.com',
    name: 'Lê Thị Mai',
    phone: '0900000102',
    active: true,
    title: 'TS_BS',
    degree: 'TS',
    years: 15,
    specialty: 'Thần kinh',
    branch: B1,
    service: CHUYEN_KHOA,
    bio: 'Bác sĩ mẫu, quan tâm đau đầu và rối loạn giấc ngủ (dữ liệu minh họa).',
  },
  {
    email: 'bacsi03@example.com',
    name: 'Phạm Quốc Bảo',
    phone: '0900000103',
    active: true,
    title: 'BS_CKI',
    degree: 'BS',
    years: 8,
    specialty: 'Tiêu hóa',
    branch: B2,
    service: CHUYEN_KHOA,
    bio: 'Bác sĩ mẫu, quan tâm bệnh dạ dày và gan mật (dữ liệu minh họa).',
  },
  {
    email: 'bacsi04@example.com',
    name: 'Nguyễn Thị Lan',
    phone: '0900000104',
    active: true,
    title: 'ThS_BS',
    degree: 'ThS',
    years: 6,
    specialty: 'Nội tổng quát',
    branch: B2,
    service: TONG_QUAT,
    bio: 'Bác sĩ mẫu, khám sức khỏe tổng quát (dữ liệu minh họa).',
  },
  {
    email: 'bacsi05@example.com',
    name: 'Võ Thanh Tùng',
    phone: '0900000105',
    active: true,
    title: 'PGS_TS_BS',
    degree: 'PGS',
    years: 25,
    specialty: 'Tim mạch',
    branch: B3,
    service: CHUYEN_KHOA,
    bio: 'Bác sĩ mẫu, quan tâm tăng huyết áp và rối loạn nhịp (dữ liệu minh họa).',
  },
  {
    email: 'bacsi06@example.com',
    name: 'Đặng Thu Hà',
    phone: '0900000106',
    active: true,
    title: 'BS',
    degree: 'BS',
    years: 2,
    specialty: 'Y học gia đình',
    branch: B3,
    service: TONG_QUAT,
    bio: 'Bác sĩ mẫu, chăm sóc sức khỏe gia đình (dữ liệu minh họa).',
  },
  {
    email: 'bacsi07@example.com',
    name: 'Hoàng Gia Khánh',
    phone: '0900000107',
    active: true,
    title: 'GS_TS_BS',
    degree: 'GS',
    years: 30,
    specialty: 'Tâm thần',
    branch: B4,
    service: CHUYEN_KHOA,
    bio: 'Bác sĩ mẫu, quan tâm lo âu và trầm cảm (dữ liệu minh họa).',
  },
  {
    email: 'bacsi08@example.com',
    name: 'Bùi Ngọc Diệp',
    phone: '0900000108',
    active: true,
    title: 'BS_CKI',
    degree: 'BS',
    years: 10,
    specialty: 'Tai Mũi Họng',
    branch: B4,
    service: CHUYEN_KHOA,
    bio: 'Bác sĩ mẫu, quan tâm viêm xoang và viêm họng (dữ liệu minh họa).',
  },
  // Chờ kích hoạt: chưa có mật khẩu, không được hiện ở tra cứu công khai.
  {
    email: 'bacsi09@example.com',
    name: 'Ngô Đức Long',
    phone: '0900000109',
    active: false,
    title: 'BS',
    degree: 'BS',
    years: 0,
    specialty: 'Tiêu hóa',
    branch: B1,
    service: CHUYEN_KHOA,
    bio: 'Bác sĩ mẫu chờ kích hoạt (dữ liệu minh họa).',
  },
];
