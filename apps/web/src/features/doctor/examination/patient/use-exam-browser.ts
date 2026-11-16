import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useRemote } from '../../../../shared/hooks/use-remote';
import { getPatientExamRecords } from '../api/exam-api';
import type { ExamineeOption, ExamListPage } from '../api/patient-exam-types';
import {
  currentYearVN,
  latestMonthWithCases,
  yearTabs,
} from './patient-exam-format';
import { EXAM_CASE_PARAM } from './patient-exam-paths';

// Trạng thái và việc tải của trang "Hồ sơ khám bệnh" (doctor-exam F5; PLAN 5.13; WXH-02, WXH-03, WXH-08, WXH-15). Hai bước tải, mỗi bước là một `useRemote` (huỷ yêu cầu cũ khi khoá đổi, kết quả muộn không đè kết quả mới):
//   A "lưới"          theo (người khám, năm): `pageSize=1`, chỉ để lấy `demTheoThang` và `nguoiKham[]`; KHÔNG đổi khi chọn tháng nên lưới không nhấp nháy;
//   B "danh sách tháng" theo (người khám, năm, tháng): `pageSize=50` (tối đa của API); chỉ chạy khi đã có tháng.
// Tháng đang xem là tháng người dùng chọn; chưa chọn thì là tháng MỚI NHẤT có ca của năm (Figma `414:2`, `443:2`), lấy từ `demTheoThang` của bước A.
// Người khám, năm, tháng chỉ ở BỘ NHỚ của trang (BDK-02, không URL, không kho trình duyệt); URL chỉ có `?ca=<maLichHen>`: chọn ca dùng `replace` (chọn ca không phải điều hướng) và đổi bộ lọc xoá `ca` (ca cũ không còn trong danh sách đang xem).
const LIST_PAGE_SIZE = 50;
const COUNTS_PAGE_SIZE = 1;

interface Filters {
  // `null` là tất cả người khám; còn lại `BanThan` hoặc id hồ sơ người thân
  person: string | null;
  year: number;
  // `null` là chưa chọn: tự lấy tháng mới nhất có ca
  month: number | null;
}

export function useExamBrowser() {
  const [params, setParams] = useSearchParams();
  // Năm hiện tại THEO GIỜ VIỆT NAM, chốt một lần lúc mở trang (đồng hồ giả trong test)
  const [currentYear] = useState(() => currentYearVN(new Date()));
  const [filters, setFilters] = useState<Filters>({
    person: null,
    year: currentYear,
    month: null,
  });
  // Lựa chọn của bộ lọc người khám GIỮ lại giữa các lần tải lưới (API trả cùng danh sách cho mọi bộ lọc), để chip không biến mất khi đổi người hay năm
  const [people, setPeople] = useState<ExamineeOption[] | null>(null);

  const personKey = filters.person ?? '';
  const nguoiKham = filters.person ?? undefined;

  const counts = useRemote<ExamListPage>(
    (signal) =>
      getPatientExamRecords(
        { nguoiKham, nam: filters.year, pageSize: COUNTS_PAGE_SIZE },
        signal,
      ),
    [personKey, filters.year],
  );
  if (
    counts.state.status === 'ready' &&
    counts.state.data.nguoiKham !== people
  ) {
    setPeople(counts.state.data.nguoiKham);
  }

  const month =
    filters.month ??
    (counts.state.status === 'ready'
      ? latestMonthWithCases(counts.state.data.demTheoThang)
      : null);

  const list = useRemote<ExamListPage | null>(
    (signal) =>
      month === null
        ? Promise.resolve(null)
        : getPatientExamRecords(
            {
              nguoiKham,
              nam: filters.year,
              thang: month,
              pageSize: LIST_PAGE_SIZE,
            },
            signal,
          ),
    [personKey, filters.year, month ?? 0],
  );

  const selectedCase = params.get(EXAM_CASE_PARAM) || null;

  function clearCase() {
    if (selectedCase !== null) setParams({}, { replace: true });
  }
  function change(next: Filters) {
    setFilters(next);
    clearCase();
  }

  return {
    years: yearTabs(currentYear),
    year: filters.year,
    person: filters.person,
    month,
    people,
    counts: counts.state,
    retryCounts: counts.retry,
    list: list.state,
    retryList: list.retry,
    selectedCase,
    selectPerson: (value: string | null) => {
      if (value !== filters.person) {
        change({ person: value, year: filters.year, month: null });
      }
    },
    selectYear: (year: number) => {
      if (year !== filters.year) {
        change({ person: filters.person, year, month: null });
      }
    },
    selectMonth: (value: number) => {
      if (value !== month) {
        change({ person: filters.person, year: filters.year, month: value });
      }
    },
    selectCase: (maLichHen: string) =>
      setParams({ [EXAM_CASE_PARAM]: maLichHen }, { replace: true }),
  };
}

export type ExamBrowser = ReturnType<typeof useExamBrowser>;
