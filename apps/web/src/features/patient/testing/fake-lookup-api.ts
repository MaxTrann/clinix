import { apiError } from '../../../test/fake-auth-api';
import { hang, json } from './fake-profile-api';
import { keywordProblem, normalizeKeyword } from '../lookup/lookup-keyword';

// Hàm giả GET /api/reception/patients và GET /api/reception/patients/:id cho test của trang tra cứu (patient F8; TRACKING F8-C, F8-I).
// Bọc `fetch` của fake auth và CHỈ chặn hai đường dẫn đó; mọi đường dẫn khác chuyển cho fake auth. Cư xử như API thật ở những chỗ F8 dựa
// vào: chỉ nhận `q`, `page`, `pageSize` (khoá lạ ⇒ 400 TRUONG_KHONG_DUOC_PHEP), `q` sai luật ⇒ 400 TU_KHOA_KHONG_HOP_LE, tìm không phân biệt
// dấu và hoa thường, sắp theo họ tên, trang vượt cuối ⇒ `items: []` mà `total` đúng, id lạ ⇒ 404 KHONG_TIM_THAY. Dữ liệu giả đuôi `.invalid`.

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
type Kind = 'search' | 'detail';
type Override = (init?: RequestInit) => Response | Promise<Response>;

export interface FakeRelative {
  hoTen: string;
  moiQuanHe: string;
  gioiTinh: string;
  ngaySinh: string;
  soDienThoai: string | null;
  trangThaiHieuLuc: boolean;
}

// Đúng mười khoá của GET /reception/patients/:id (PLAN 5.7)
export interface FakeDetail {
  hoTen: string;
  email: string;
  soDienThoai: string;
  gioiTinh: string | null;
  ngaySinh: string | null;
  diaChi: string | null;
  thoiDiemTao: string;
  trangThai: string;
  soLanVangMat: number;
  nguoiThan: FakeRelative[];
}

export interface FakePatient {
  taiKhoanId: string;
  detail: FakeDetail;
}

// Một lần gọi đã ghi: đường dẫn, query (để kiểm CHỈ ba khoá), header và `signal` (để kiểm yêu cầu cũ bị huỷ)
export interface FakeLookupCall {
  path: string;
  query: URLSearchParams;
  headers: Headers;
  signal: AbortSignal | null | undefined;
}

// `json` và `hang` dùng lại của hàm giả hồ sơ (cùng khuôn), re-export để test của trang tra cứu import một nơi
export { hang, json };

export const RELATIVE_CON: FakeRelative = {
  hoTen: 'Nguyễn Thị Con',
  moiQuanHe: 'Con',
  gioiTinh: 'Nu',
  ngaySinh: '2018-03-04',
  soDienThoai: '0911222333',
  trangThaiHieuLuc: true,
};

export const RELATIVE_CHA_STOPPED: FakeRelative = {
  hoTen: 'Trần Văn Cha',
  moiQuanHe: 'Cha',
  gioiTinh: 'Nam',
  ngaySinh: '1960-12-31',
  soDienThoai: null,
  trangThaiHieuLuc: false,
};

// Mẫu của TRACKING mục 5 (JSON thật của API trên MySQL thật): `2026-11-07T17:30:00.000Z` là 00:30 ngày 08/11/2026 giờ Việt Nam
export const PATIENT_HUNG: FakePatient = {
  taiKhoanId: '3',
  detail: {
    hoTen: 'Đặng Văn Hùng',
    email: 'hung@example.invalid',
    soDienThoai: '0901234567',
    gioiTinh: 'Nam',
    ngaySinh: '1985-02-20',
    diaChi: '12 Đường Giả, Quận Giả',
    thoiDiemTao: '2026-11-07T17:30:00.000Z',
    trangThai: 'DangHoatDong',
    soLanVangMat: 2,
    nguoiThan: [RELATIVE_CON, RELATIVE_CHA_STOPPED],
  },
};

// Tài khoản ngừng, mọi trường tuỳ chọn trống
export const PATIENT_MAI: FakePatient = {
  taiKhoanId: '4',
  detail: {
    hoTen: 'Lê Thị Mai',
    email: 'mai@example.invalid',
    soDienThoai: '0912345678',
    gioiTinh: null,
    ngaySinh: null,
    diaChi: null,
    thoiDiemTao: '2026-10-01T02:15:00.000Z',
    trangThai: 'NgungHoatDong',
    soLanVangMat: 0,
    nguoiThan: [],
  },
};

// Id lớn hơn 2^53: qua `Number` sẽ thành 9007199254740992
export const BIG_ID = '9007199254740993';
export const PATIENT_BIG: FakePatient = {
  taiKhoanId: BIG_ID,
  detail: {
    hoTen: 'Nguyễn Văn A',
    email: 'nguyenvana@example.invalid',
    soDienThoai: '0987654321',
    gioiTinh: 'Nam',
    ngaySinh: '1990-05-15',
    diaChi: null,
    thoiDiemTao: '2026-01-01T05:00:00.000Z',
    trangThai: 'DangHoatDong',
    soLanVangMat: 0,
    nguoiThan: [],
  },
};

export const SAMPLE_PATIENTS: FakePatient[] = [
  PATIENT_HUNG,
  PATIENT_MAI,
  PATIENT_BIG,
];

// `count` bệnh nhân cùng chung từ khoá "Mẫu" để thử phân trang; họ tên có số thứ tự 3 chữ số nên sắp theo họ tên cũng là thứ tự tạo
export function makePatients(count: number): FakePatient[] {
  return Array.from({ length: count }, (_unused, index) => {
    const n = String(index + 1).padStart(3, '0');
    return {
      taiKhoanId: String(1000 + index),
      detail: {
        ...PATIENT_MAI.detail,
        hoTen: `Mẫu ${n}`,
        email: `mau${n}@example.invalid`,
        soDienThoai: `0900000${n}`.slice(0, 10),
        trangThai: 'DangHoatDong',
      },
    };
  });
}

// Bỏ dấu và gấp đ ⇒ d như API (B6)
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();

const ALLOWED_QUERY = new Set(['q', 'page', 'pageSize']);

export function createFakeLookupApi(
  delegate: FetchLike,
  initial: FakePatient[] = SAMPLE_PATIENTS,
) {
  const overrides: Record<Kind, Override[]> = { search: [], detail: [] };

  // Giữ lần gọi kế tiếp tới đường `kind` cho tới khi test tự trả phản hồi. Promise treo KHÔNG nghe `signal`: giống phản hồi đã về sát lúc
  // huỷ, nên `request()` vẫn trả thân cho nơi gọi (kiểm số thứ tự lời gọi).
  function holder(kind: Kind) {
    let release!: (response: Response) => void;
    api.failNext(
      kind,
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    return (status: number, body: unknown) => release(json(status, body));
  }

  const api = {
    patients: initial.map((patient) => ({
      ...patient,
      detail: { ...patient.detail },
    })) as FakePatient[],
    searches: [] as FakeLookupCall[],
    details: [] as FakeLookupCall[],

    failNext(kind: Kind, override: Override) {
      overrides[kind].push(override);
    },
    hold(kind: Kind) {
      return holder(kind);
    },
    // Phản hồi 200 đúng như API cho một từ khoá và trang (để test tự dựng phản hồi giữ)
    searchBody(q: string, page = 1, pageSize = 20) {
      return api.search(q, page, pageSize);
    },
    summaryOf(patient: FakePatient) {
      const { hoTen, soDienThoai, email, trangThai } = patient.detail;
      return {
        taiKhoanId: patient.taiKhoanId,
        hoTen,
        soDienThoai,
        email,
        trangThai,
      };
    },
    search(q: string, page: number, pageSize: number) {
      const key = fold(q);
      const digits = q.replace(/[ .]/g, '');
      const matched = api.patients
        .filter(
          ({ detail }) =>
            fold(detail.hoTen).includes(key) ||
            detail.email.toLowerCase().includes(q.toLowerCase()) ||
            (/^[0-9]+$/.test(digits) && detail.soDienThoai.includes(digits)),
        )
        .sort((a, b) => a.detail.hoTen.localeCompare(b.detail.hoTen, 'vi'));
      const start = (page - 1) * pageSize;
      return {
        items: matched.slice(start, start + pageSize).map(api.summaryOf),
        total: matched.length,
        page,
        pageSize,
      };
    },

    fetch: async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const [path, search = ''] = String(input).split('?');
      const detailMatch = /^\/api\/reception\/patients\/([^/]+)$/.exec(path);
      if (path !== '/api/reception/patients' && !detailMatch) {
        return delegate(input, init);
      }
      const kind: Kind = detailMatch ? 'detail' : 'search';
      const call: FakeLookupCall = {
        path,
        query: new URLSearchParams(search),
        headers: new Headers(init?.headers),
        signal: init?.signal,
      };
      (kind === 'search' ? api.searches : api.details).push(call);

      const override = overrides[kind].shift();
      if (override) return override(init);

      if (detailMatch) {
        const found = api.patients.find(
          (patient) => patient.taiKhoanId === detailMatch[1],
        );
        return found
          ? json(200, found.detail)
          : apiError(404, 'KHONG_TIM_THAY');
      }

      for (const key of call.query.keys()) {
        if (!ALLOWED_QUERY.has(key)) {
          return apiError(400, 'TRUONG_KHONG_DUOC_PHEP');
        }
      }
      const q = call.query.get('q') ?? '';
      if (
        keywordProblem(normalizeKeyword(q)) !== null ||
        q !== normalizeKeyword(q)
      ) {
        return json(400, {
          maLoi: 'DU_LIEU_KHONG_HOP_LE',
          thongBao: 'Dữ liệu không hợp lệ.',
          loi: [{ truong: 'q', ma: 'TU_KHOA_KHONG_HOP_LE' }],
        });
      }
      return json(
        200,
        api.search(
          q,
          Number(call.query.get('page') ?? 1),
          Number(call.query.get('pageSize') ?? 20),
        ),
      );
    },
  };
  return api;
}
