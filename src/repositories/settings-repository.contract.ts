// `SettingsRepository` 계약 스위트 — memory·indexeddb 공용. ADR-0007 규칙 3 (a)~(e) 포함.
//
// 단일 행이라 조회가 `get()` 하나뿐이고, **레포지토리는 기본값을 만들지 않는다** — 비어 있으면
// `undefined` 이며 기본값은 도메인 `createSettings(deps)` 가 만든다(ADR-0005, TECH_PLAN §6).
import { markDeleted, touch } from '@/domain/meta';
import type { Settings } from '@/domain/theme/settings';

import { contractDeps, contractSettings, type ContractTarget } from '@/repositories/contract';
import type { SettingsRepository } from '@/repositories/settings-repository';

type ReadName = Exclude<keyof SettingsRepository, 'upsert'>;
type ReadCall = (repo: SettingsRepository) => Promise<Settings | Settings[] | undefined>;

/** (e) `READS` 전수 대조(ADR-0007 결정 6). */
const READS = {
  get: (repo) => repo.get(),
} satisfies Record<ReadName, ReadCall>;

function rowsOf(result: Settings | Settings[] | undefined): Settings[] {
  return result === undefined ? [] : Array.isArray(result) ? result : [result];
}

const T1 = '2026-01-16T09:30:00.000Z';

export function runSettingsRepositoryContract(target: ContractTarget): void {
  describe(`SettingsRepository 계약 (${target.name})`, () => {
    let repo: SettingsRepository;

    beforeEach(async () => {
      repo = (await target.create()).settings;
    });

    it('비어 있으면 undefined 다 — 레포지토리가 기본값을 만들지 않는다', async () => {
      expect(await repo.get()).toBeUndefined();
    });

    it('(a) Meta 를 왕복해도 값이 그대로다', async () => {
      const settings = contractSettings(contractDeps(), { theme: 'dark' });

      await repo.upsert(settings);

      expect(await repo.get()).toEqual({ ...settings });
      expect((await repo.get())?.id).toBe('default');
    });

    it('(b) touch 한 값을 저장하면 rev 가 정확히 +1 되고 행은 하나로 유지된다', async () => {
      const settings = contractSettings(contractDeps());
      await repo.upsert(settings);

      await repo.upsert(touch({ ...settings, theme: 'light' }, T1));

      const saved = await repo.get();
      expect(saved?.rev).toBe(settings.rev + 1);
      expect(saved?.updatedAt).toBe(T1);
      expect(saved?.theme).toBe('light');
    });

    it('(c) 툼스톤은 READS 의 모든 조회 메서드에서 빠진다', async () => {
      const settings = contractSettings(contractDeps());
      await repo.upsert(settings);

      // 설정은 실제로는 삭제되지 않지만(ADR-0005 규칙 1), 계약은 다른 엔티티와 같아야 한다.
      await repo.upsert(markDeleted(settings, T1));

      for (const [name, read] of Object.entries(READS)) {
        expect(rowsOf(await read(repo)), `${name} 가 툼스톤을 돌려줬다`).toEqual([]);
      }
    });

    it('(d) 브랜드 없는 값은 저장할 수 없다', async () => {
      const settings = contractSettings(contractDeps());
      await repo.upsert(settings);
      const plain = await repo.get();
      expect(plain).toBeDefined();
      if (plain === undefined) {
        return;
      }

      // @ts-expect-error 조회 결과는 브랜드가 없다 (ADR-0007 규칙 3-d, TS2345)
      await repo.upsert(plain);
    });

    it('(e) READS 는 인터페이스의 조회 메서드를 하나도 빠뜨리지 않는다', () => {
      for (const name of Object.keys(READS)) {
        expect(repo[name as ReadName]).toBeTypeOf('function');
      }
    });
  });
}
