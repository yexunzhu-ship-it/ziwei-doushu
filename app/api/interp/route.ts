/**
 * /api/interp —— 本地解读数据集查询（v4.0）
 *
 * 数据：紫微斗数开源解读数据集 v4.0（2026-10-15）
 *   674,976 张命盘 × 13 维 = 8,774,688 段解读，CC BY 4.0
 *   来源 https://github.com/Renhuai123/ziwei-doushu
 *
 * 口径（与上游 README 一致）：数据集按时辰序号直接排盘，**未做真太阳时校正**。
 * 所以本接口的 h 参数必须是「填报时辰」的序号 0-11，而不是经度校正后的时辰。
 *
 * 实现：按年份读 data/interp-v4/year-YYYY.jsonl.zst，Node 内置 zstd 流式解压，
 * 逐行找 "k":"YYYY-MM-DD-h-性别"，命中即返回，不落盘解压后的 700MB 文本。
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATA_DIR = path.join(process.cwd(), 'data', 'interp-v4');
const CACHE_MAX = 40;
const cache = new Map<string, unknown>();

type Row = {
  k: string;
  y: number;
  m: number;
  d: number;
  h: number;
  g: 'male' | 'female';
  ms: string | null;
  t?: Record<string, number>;
  c: Record<string, string>;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Node 24 内置 zstd，但本项目的 @types/node 仍是 20.x，类型声明里还没有
 * createZstdDecompress。这里做一次局部断言，运行时是真实存在的 API
 * （已实测 zlib.createZstdDecompress 可用）。
 */
const createZstdDecompress = (
  zlib as unknown as { createZstdDecompress: () => import('node:stream').Duplex }
).createZstdDecompress;

async function findRow(year: number, key: string): Promise<Row | null> {
  const file = path.join(DATA_DIR, `year-${year}.jsonl.zst`);
  if (!fs.existsSync(file)) return null;

  const rs = fs.createReadStream(file);
  const zs = createZstdDecompress();
  const rl = readline.createInterface({ input: rs.pipe(zs), crlfDelay: Infinity });
  const needle = `"k":"${key}"`;

  try {
    for await (const line of rl) {
      if (line.includes(needle)) {
        return JSON.parse(line) as Row;
      }
    }
  } finally {
    rl.close();
    rs.destroy();
    zs.destroy();
  }
  return null;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const y = Number(sp.get('y'));
  const m = Number(sp.get('m'));
  const d = Number(sp.get('d'));
  const h = Number(sp.get('h'));
  const g = sp.get('g');

  const bad =
    !Number.isInteger(y) || y < 1950 || y > 2026 ||
    !Number.isInteger(m) || m < 1 || m > 12 ||
    !Number.isInteger(d) || d < 1 || d > 31 ||
    !Number.isInteger(h) || h < 0 || h > 11 ||
    (g !== 'male' && g !== 'female');

  if (bad) {
    return NextResponse.json({ ok: false, error: '参数不合法（y 1950-2026 / m 1-12 / d 1-31 / h 0-11 / g male|female）' }, { status: 400 });
  }

  const key = `${y}-${pad2(m)}-${pad2(d)}-${h}-${g}`;

  if (cache.has(key)) {
    return NextResponse.json({ ok: true, cached: true, ms: 0, ...(cache.get(key) as object) });
  }

  const file = path.join(DATA_DIR, `year-${y}.jsonl.zst`);
  if (!fs.existsSync(file)) {
    return NextResponse.json(
      { ok: false, error: `本机没有 ${y} 年的数据文件`, key, needYear: y },
      { status: 404 },
    );
  }

  const t0 = Date.now();
  const row = await findRow(y, key);
  if (!row) {
    return NextResponse.json({ ok: false, error: '该命盘未找到（请检查日期是否真实存在）', key }, { status: 404 });
  }

  const payload = { key, row, ms: Date.now() - t0 };
  cache.set(key, payload);
  if (cache.size > CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  return NextResponse.json({ ok: true, ...payload });
}
