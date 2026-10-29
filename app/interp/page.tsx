'use client';
/**
 * /interp —— 本地解读（紫微斗数开源解读数据集 v4.0）
 *
 * 上游开源版缺少「断语库」，排盘页的解读面板只能调 AI。本页改用上游放出的
 * 公开数据集（877 万段解读，CC BY 4.0）：输入生辰 → 按 key 直接查到该盘的
 * 13 维解读全文，不经过 AI、不需要 API Key。
 *
 * 口径提醒：数据集按时辰序号直接排盘，未做真太阳时校正。本页按「填报时辰」
 * 查询，与排盘页经过经度校正的盘可能不是同一张（若两者时辰不同会明确提示）。
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import BirthForm, { type BirthFormState } from '@/components/BirthForm';
import type { BirthInfo } from '@/lib/ziwei/types';
import { TOPIC_LABEL } from '@/lib/ziwei/db-analysis';

const TOPIC_ORDER = [
  'overview', 'personality', 'love', 'career', 'wealth', 'health',
  'family', 'children', 'move', 'friends', 'home', 'spirit', 'parents',
] as const;

type TopicKey = (typeof TOPIC_ORDER)[number];

const SHICHEN_NAMES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/** 填报钟点 → 时辰序号（不校正经度，与数据集口径一致） */
function rawBranchFromClock(clockHour: number, clockMinute: number): number {
  const mins = clockHour * 60 + clockMinute;
  return Math.floor((mins + 60) / 120) % 12;
}

/** 极简 Markdown：**粗体** + 段落。数据内容可信，但仍不用 innerHTML。 */
function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') && p.length > 4 ? (
      <strong key={i} style={{ color: 'var(--ac)', fontWeight: 650 }}>
        {p.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function renderBody(md: string): ReactNode[] {
  const out: ReactNode[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (!buf.length) return;
    out.push(
      <p key={`p${out.length}`} style={{ margin: '0 0 14px', lineHeight: 1.95, fontSize: 15, color: 'var(--tx-1)' }}>
        {renderInline(buf.join(''))}
      </p>,
    );
    buf = [];
  };
  for (const raw of md.split(/\r?\n/)) {
    const t = raw.trim();
    if (!t) { flush(); continue; }
    const only = /^\*\*(.+?)\*\*$/.exec(t);
    if (only) {
      flush();
      out.push(
        <h4
          key={`h${out.length}`}
          style={{ margin: '22px 0 10px', fontSize: 15, fontWeight: 700, color: 'var(--tx-0)', letterSpacing: '0.02em' }}
        >
          {only[1]}
        </h4>,
      );
      continue;
    }
    if (t.startsWith('#')) {
      flush();
      out.push(
        <h3 key={`h${out.length}`} style={{ margin: '22px 0 10px', fontSize: 17, fontWeight: 700, color: 'var(--tx-0)' }}>
          {t.replace(/^#+\s*/, '')}
        </h3>,
      );
      continue;
    }
    buf.push(t);
  }
  flush();
  return out;
}

type ApiRow = {
  k: string; y: number; m: number; d: number; h: number;
  g: 'male' | 'female'; ms: string | null;
  c: Record<string, string>;
};

export default function InterpPage() {
  const [data, setData] = useState<{ key: string; row: ApiRow; ms: number; cached?: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState<TopicKey>('overview');
  const [meta, setMeta] = useState<{ rawH: number; corrH: number; name?: string } | null>(null);
  const formRef = useRef<BirthFormState | null>(null);

  const lookup = async (info: BirthInfo, rawH: number, name?: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        y: String(info.year), m: String(info.month), d: String(info.day),
        h: String(rawH), g: info.gender,
      });
      const res = await fetch(`/api/interp?${qs}`);
      const json = await res.json();
      if (!json.ok) {
        setData(null);
        setError(json.error || '查询失败');
      } else {
        setData(json);
        setMeta({ rawH, corrH: info.hour, name });
        setTopic('overview');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (info: BirthInfo) => {
    const f = formRef.current;
    const clockH = f ? parseInt(f.clockHour) || 0 : 0;
    const clockM = f ? parseInt(f.clockMinute) || 0 : 0;
    const rawH = f && !f.unknownTime ? rawBranchFromClock(clockH, clockM) : info.hour;
    lookup(info, rawH, f?.name);
  };

  // 支持 ?y=&m=&d=&h=&g= 直接查询（排盘页会跳过来）
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const y = Number(sp.get('y')), m = Number(sp.get('m')), d = Number(sp.get('d'));
    const h = Number(sp.get('h')), g = sp.get('g');
    if (y && m && d && Number.isInteger(h) && h >= 0 && h <= 11 && (g === 'male' || g === 'female')) {
      lookup({ year: y, month: m, day: d, hour: h, gender: g }, h, sp.get('name') || undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const row = data?.row;
  const content = row?.c?.[topic] ?? '';
  const mismatch = meta && meta.rawH !== meta.corrH;

  return (
    <main style={{ maxWidth: 1120, margin: '0 auto', padding: '40px 20px 80px' }}>
      <header style={{ marginBottom: 26 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.35em', color: 'var(--ac)', marginBottom: 10 }}>
          LOCAL DATASET · v4.0
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 10px', color: 'var(--tx-0)' }}>
          本地解读 · 数据集版
        </h1>
        <p style={{ margin: 0, color: 'var(--tx-2)', fontSize: 14, lineHeight: 1.8 }}>
          13 维解读来自上游开源数据集（67.5 万张命盘 × 13 维，按倪师《天纪》逐句校正），
          <strong style={{ color: 'var(--tx-1)' }}>不经 AI、不需要 API Key</strong>，同一生辰永远是同一份内容。
        </p>
      </header>

      {!data && !loading && (
        <>
          <BirthForm onSubmit={handleSubmit} onFormSave={(d) => { formRef.current = d; }} />
          {error && (
            <div style={{ marginTop: 18, padding: '12px 16px', borderRadius: 10, background: 'rgba(168,50,40,0.08)', border: '1px solid rgba(168,50,40,0.3)', color: 'var(--ji)', fontSize: 14 }}>
              {error}
            </div>
          )}
        </>
      )}

      {loading && (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--tx-2)' }}>
          <div style={{ fontSize: 14 }}>正在解压并检索该年份数据，首次查询需要几秒…</div>
        </div>
      )}

      {data && row && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 18 }}>
            <button
              type="button"
              onClick={() => { setData(null); setError(null); setMeta(null); }}
              style={{ padding: '6px 14px', cursor: 'pointer', border: '1px solid var(--bdr-med)', borderRadius: 8, background: 'transparent', color: 'var(--tx-1)', fontSize: 13 }}
            >
              ← 重新查询
            </button>
            <span style={{ fontSize: 13, color: 'var(--tx-2)' }}>
              {row.y} 年 {row.m} 月 {row.d} 日 · {SHICHEN_NAMES[row.h]}时 · {row.g === 'male' ? '男' : '女'}
              {row.ms ? ` · 命宫主星 ${row.ms}` : ' · 命宫无主星'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)' }}>
              {data.cached ? '已缓存' : `${(data.ms / 1000).toFixed(1)}s`}
            </span>
          </div>

          {mismatch && (
            <div style={{ marginBottom: 18, padding: '12px 16px', borderRadius: 10, background: 'var(--ac-bg)', border: '1px solid var(--ac-bdr)', fontSize: 13, lineHeight: 1.75, color: 'var(--tx-1)' }}>
              ⚠ 口径提示：数据集按「填报时辰（{SHICHEN_NAMES[meta!.rawH]}时）」排盘，未做真太阳时校正；
              排盘页经经度校正后是「{SHICHEN_NAMES[meta!.corrH]}时」。
              两者不是同一张盘，本页内容对应的是
              <strong> {SHICHEN_NAMES[meta!.rawH]}时 </strong>
              那张。
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 20 }}>
            {TOPIC_ORDER.map((k) => {
              const active = k === topic;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTopic(k)}
                  style={{
                    padding: '9px 12px', cursor: 'pointer', borderRadius: 9, fontSize: 13,
                    border: `1px solid ${active ? 'var(--ac)' : 'var(--bdr-med)'}`,
                    background: active ? 'var(--ac-bg)' : 'transparent',
                    color: active ? 'var(--ac)' : 'var(--tx-2)',
                    fontWeight: active ? 650 : 400,
                    transition: 'all .15s ease',
                  }}
                >
                  {TOPIC_LABEL[k as TopicKey] ?? k}
                </button>
              );
            })}
          </div>

          <article
            style={{
              padding: '26px 28px', borderRadius: 14, background: 'var(--bg-1)',
              border: '1px solid var(--bdr)', boxShadow: 'var(--sh-sm)',
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 18px', color: 'var(--tx-0)' }}>
              {TOPIC_LABEL[topic as TopicKey] ?? topic}
            </h2>
            {content ? renderBody(content) : <p style={{ color: 'var(--tx-3)', fontSize: 14 }}>该维度没有内容。</p>}
          </article>

          <footer style={{ marginTop: 26, fontSize: 12, color: 'var(--tx-3)', lineHeight: 1.9 }}>
            <div>
              数据来源：<strong style={{ color: 'var(--tx-2)' }}>紫微斗数开源解读数据集 v4.0</strong>（674,976 张命盘 × 13 维）
            </div>
            <div>
              作者：王多鱼AI ｜ 仓库：
              <a href="https://github.com/Renhuai123/ziwei-doushu" target="_blank" rel="noreferrer" style={{ color: 'var(--ac)' }}>
                github.com/Renhuai123/ziwei-doushu
              </a>
              ｜ 许可 CC BY 4.0
            </div>
            <div style={{ marginTop: 6 }}>
              口径：按时辰序号直接排盘，未做真太阳时校正；不含网站按年龄改写的句子、倪师法则段与 AI 解读。
            </div>
          </footer>
        </>
      )}
    </main>
  );
}
