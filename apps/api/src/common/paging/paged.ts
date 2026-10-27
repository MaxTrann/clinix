/** Kết quả danh sách theo hợp đồng Q42. */
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
