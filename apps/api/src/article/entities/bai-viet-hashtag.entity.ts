import { Entity, Index, PrimaryColumn } from 'typeorm';

// Dòng nối bài viết với thẻ (article B1). Khoá chính kép (bài, thẻ); chỉ mục `(hashtag_id, bai_viet_id)` phục vụ lọc bài theo một thẻ (PLAN article 5.10).
// Sửa bài bỏ thẻ chỉ xoá dòng nối, KHÔNG xoá thẻ (MH8).
@Entity({ name: 'bai_viet_hashtag' })
@Index('bai_viet_hashtag_index_23', ['hashtagId', 'baiVietId'])
export class BaiVietHashtag {
  @PrimaryColumn({ name: 'bai_viet_id', type: 'bigint' })
  baiVietId!: string;

  @PrimaryColumn({ name: 'hashtag_id', type: 'bigint' })
  hashtagId!: string;
}
