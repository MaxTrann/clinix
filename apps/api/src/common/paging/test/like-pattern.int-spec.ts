import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestDataSource,
  readTestDbSettings,
} from '../../../database/testing/test-database.js';
import { escapeLikePattern } from '../like-pattern.js';

let db: DataSource;

beforeAll(async () => {
  db = await createTestDataSource(readTestDbSettings());
});

afterAll(async () => {
  await db?.destroy();
});

describe('LIKE escape trên MySQL (TK-06)', () => {
  it.each([
    ['%', 'prefix%middle', 'prefixXmiddle'],
    ['_', 'prefix_middle', 'prefixXmiddle'],
    ['!', 'prefix!middle', 'prefixXmiddle'],
    ["'", "prefix'middle", 'prefixmiddle'],
    ['--', 'prefix--middle', 'prefixXXmiddle'],
  ])(
    'tìm %j theo giá trị literal và không khớp ký tự thay thế',
    async (term, matchingValue, nonmatchingValue) => {
      const pattern = `%${escapeLikePattern(term)}%`;
      const query = "SELECT ? LIKE ? ESCAPE '!' AS matched";

      const [matching] = (await db.query(query, [matchingValue, pattern])) as {
        matched: number | string;
      }[];
      const [nonmatching] = (await db.query(query, [
        nonmatchingValue,
        pattern,
      ])) as { matched: number | string }[];

      expect(Number(matching.matched)).toBe(1);
      expect(Number(nonmatching.matched)).toBe(0);
    },
  );
});
