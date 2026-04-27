import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface ChampionEntry {
  id: number;
  key: string;
  name: string;
  iconUrl: string;
}

export interface AugmentEntry {
  id: number;
  name: string;
  desc: string;
  rarity: number;
  iconLarge: string;
  iconSmall: string;
}

interface DataCtx {
  champions: Map<number, ChampionEntry>;
  augments: Map<number, AugmentEntry>;
  loaded: boolean;
}

const Ctx = createContext<DataCtx>({ champions: new Map(), augments: new Map(), loaded: false });

export function DataProvider({ children }: { children: ReactNode }) {
  const [champions, setChampions] = useState<Map<number, ChampionEntry>>(new Map());
  const [augments, setAugments] = useState<Map<number, AugmentEntry>>(new Map());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([window.api.dragon.champions(), window.api.dragon.augments()]).then(
      ([cs, as]) => {
        setChampions(new Map((cs as ChampionEntry[]).map((c) => [c.id, c])));
        setAugments(new Map((as as AugmentEntry[]).map((a) => [a.id, a])));
        setLoaded(true);
      }
    );
  }, []);

  return <Ctx.Provider value={{ champions, augments, loaded }}>{children}</Ctx.Provider>;
}

export function useStaticData(): DataCtx {
  return useContext(Ctx);
}
