// DBアクセス層。DATABASE_URL があれば PostgreSQL(Supabase等)、なければ組込みの PGlite を使う。
// どちらも $1, $2 形式のパラメータで同じSQLが動く。
import { SCHEMA_SQL } from "./schema";
import { SEED_COMPANIES, SEED_SOURCES } from "./seed-data";

type Params = unknown[];
interface Driver {
  query<T = Record<string, any>>(sql: string, params?: Params): Promise<T[]>;
  exec(sql: string): Promise<void>;
}

async function createDriver(): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const postgres = (await import("postgres")).default;
    const sql = postgres(url, { max: 5, prepare: false, ssl: url.includes("localhost") ? false : "require", onnotice: () => {} });
    return {
      async query(text, params = []) {
        return (await sql.unsafe(text, params as any[])) as any;
      },
      async exec(text) {
        await sql.unsafe(text);
      },
    };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR ?? "./.data/pglite";
  const { mkdirSync } = await import("node:fs");
  mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir);
  return {
    async query(text, params = []) {
      const r = await db.query(text, params as any[]);
      return r.rows as any;
    },
    async exec(text) {
      await db.exec(text);
    },
  };
}

const g = globalThis as unknown as { __aiIntelDb?: Promise<Driver> };

async function init(): Promise<Driver> {
  const d = await createDriver();
  // 複数のサーバーが同時に起動するとテーブル作成が競合することがあるため、競合時は少し待って再試行
  for (let i = 0; ; i++) {
    try {
      await d.exec(SCHEMA_SQL);
      break;
    } catch (e: any) {
      if (i >= 3 || !["23505", "42P07", "40P01"].includes(e?.code)) throw e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  const [{ n }] = await d.query<{ n: number }>("SELECT count(*)::int AS n FROM companies");
  if (n === 0) await seedBase(d);
  return d;
}

export function getDb(): Promise<Driver> {
  if (!g.__aiIntelDb) {
    g.__aiIntelDb = init().catch((e) => {
      g.__aiIntelDb = undefined;
      throw e;
    });
  }
  return g.__aiIntelDb;
}

export async function q<T = Record<string, any>>(sql: string, params?: Params): Promise<T[]> {
  const d = await getDb();
  return d.query<T>(sql, params);
}

async function seedBase(d: Driver) {
  for (const c of SEED_COMPANIES) {
    await d.query(
      `INSERT INTO companies (slug,name,name_ja,description,website,is_listed,ticker,keywords,sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (slug) DO NOTHING`,
      [c.slug, c.name, c.name_ja, c.description, c.website, c.is_listed, c.ticker ?? null, c.keywords, c.sort_order],
    );
  }
  for (const s of SEED_SOURCES) {
    const company = s.company_slug
      ? (await d.query<{ id: number }>("SELECT id FROM companies WHERE slug=$1", [s.company_slug]))[0]
      : undefined;
    await d.query(
      `INSERT INTO sources (name,feed_url,site_url,source_type,company_id,note)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (feed_url) DO NOTHING`,
      [s.name, s.feed_url, s.site_url, s.source_type, company?.id ?? null, s.note ?? null],
    );
  }
}
