// `DiaryRepository` 계약 스위트 — memory·indexeddb 공용. ADR-0007 규칙 3 (a)~(d) 포함
// + diary.md R1 유일성이 **저장소 조회 위에서** 어떻게 보이는지(툼스톤 날짜 재작성) 검증한다.
import type { DateKey } from '@/domain/date/date-key';
import type { DiaryEntry } from '@/domain/diary/diary-entry';
import { createMeta, markDeleted, touch, type MetaDeps, type Persistable } from '@/domain/meta';

import {
  contractDeps,
  idsOf,
  CONTRACT_DATE,
  CONTRACT_INSTANT,
  type ContractTarget,
} from '@/repositories/contract';
import type { DiaryRepository } from '@/repositories/diary-repository';

/** 다이어리 기록 한 건. 계약 전용 — `diary.rules.ts#createDiaryEntry` 의 검증을 거치지 않고 바로 만든다. */
function contractDiaryEntry(
  deps: MetaDeps,
  fields: Partial<DiaryEntry> & { id?: string } = {},
): Persistable<DiaryEntry> {
  return createMeta<DiaryEntry>(deps, { date: CONTRACT_DATE, content: '개운했다', ...fields });
}

const OTHER_DATE = '2026-02-01' as DateKey;
const T1 = '2026-01-16T09:30:00.000Z';

export function runDiaryRepositoryContract(target: ContractTarget): void {
  describe(`DiaryRepository 계약 (${target.name})`, () => {
    let repo: DiaryRepository;

    beforeEach(async () => {
      repo = (await target.create()).diaryEntries;
    });

    it('(a) Meta 를 왕복해도 값이 그대로다', async () => {
      const entry = contractDiaryEntry(contractDeps());

      await repo.upsert(entry);

      expect(await repo.getByDate(CONTRACT_DATE)).toEqual({ ...entry });
    });

    it('(b) touch 한 값을 저장하면 rev 가 정확히 +1 된다', async () => {
      const entry = contractDiaryEntry(contractDeps());
      await repo.upsert(entry);

      await repo.upsert(touch({ ...entry, content: '바뀐 기록' }, T1));

      const saved = await repo.getByDate(CONTRACT_DATE);
      expect(saved?.rev).toBe(entry.rev + 1);
      expect(saved?.content).toBe('바뀐 기록');
      expect(saved?.updatedAt).toBe(T1);
    });

    it('(c) 툼스톤은 getByDate()·list() 에서 빠진다', async () => {
      const entry = contractDiaryEntry(contractDeps());
      await repo.upsert(entry);

      await repo.upsert(markDeleted(entry, T1));

      expect(await repo.getByDate(CONTRACT_DATE)).toBeUndefined();
      expect(idsOf(await repo.list())).not.toContain(entry.id);
    });

    it('(d) 브랜드 없는 값은 저장할 수 없다', async () => {
      const entry = contractDiaryEntry(contractDeps());
      await repo.upsert(entry);
      const plain = await repo.getByDate(CONTRACT_DATE);
      expect(plain).toBeDefined();
      if (plain === undefined) {
        return;
      }

      // @ts-expect-error 조회 결과는 브랜드가 없다 (ADR-0007 규칙 3-d, TS2345)
      await repo.upsert(plain);
    });

    it('list() 는 살아 있는 전부를 날짜 오름차순으로 돌려준다', async () => {
      const deps = contractDeps();
      const later = contractDiaryEntry(deps, {
        id: '60000000-0000-4000-8000-000000000001',
        date: OTHER_DATE,
      });
      const earlier = contractDiaryEntry(deps, {
        id: '60000000-0000-4000-8000-000000000002',
      });
      await repo.upsert(later);
      await repo.upsert(earlier);

      expect(idsOf(await repo.list())).toEqual([earlier.id, later.id]);
    });

    it(
      '유일성이 저장소 위에서 보이는 방식: 삭제(툼스톤) 뒤 같은 날짜에 새로 쓰면 ' +
        'getByDate() 는 새 기록을 돌려준다(diary R1, 유일성 자체는 도메인이 지킨다)',
      async () => {
        const deps = contractDeps();
        const first = contractDiaryEntry(deps, { content: '첫 기록' });
        await repo.upsert(first);
        await repo.upsert(markDeleted(first, T1));
        expect(await repo.getByDate(CONTRACT_DATE)).toBeUndefined();

        const second = contractDiaryEntry(deps, {
          id: '60000000-0000-4000-8000-000000000003',
          content: '같은 날짜, 새 기록',
        });
        await repo.upsert(second);

        const saved = await repo.getByDate(CONTRACT_DATE);
        expect(saved?.id).toBe(second.id);
        expect(saved?.content).toBe('같은 날짜, 새 기록');
      },
    );

    it('같은 날짜에 살아 있는 두 건이 있으면(데이터 어긋남) createdAt 이 빠른 쪽을 돌려준다', async () => {
      const later = contractDiaryEntry(
        { ...contractDeps({ now: '2026-01-15T05:00:00.000Z' }) },
        { id: '60000000-0000-4000-8000-000000000004' },
      );
      const earlier = contractDiaryEntry(
        { ...contractDeps({ now: '2026-01-15T01:00:00.000Z' }) },
        { id: '60000000-0000-4000-8000-000000000005' },
      );
      await repo.upsert(later);
      await repo.upsert(earlier);

      const saved = await repo.getByDate(CONTRACT_DATE);
      expect(saved?.id).toBe(earlier.id);
    });

    it('삭제 되돌리기: 되살린 값을 upsert 하면 다시 getByDate() 에 보인다', async () => {
      const entry = contractDiaryEntry(contractDeps());
      await repo.upsert(entry);
      const deleted = markDeleted(entry, T1);
      await repo.upsert(deleted);
      expect(await repo.getByDate(CONTRACT_DATE)).toBeUndefined();

      const restored = touch(touch(entry, T1), CONTRACT_INSTANT);
      await repo.upsert(restored);

      const saved = await repo.getByDate(CONTRACT_DATE);
      expect(saved?.id).toBe(entry.id);
      expect(saved?.deletedAt).toBeUndefined();
    });
  });
}
