'use client';
import { useRef, useState } from 'react';
import BirthForm, { type BirthFormState } from '@/components/BirthForm';
import ChartBoard from '@/components/ChartBoard';
import InsightPanel from '@/components/InsightPanel';
import TimeNav, { type TimeView } from '@/components/TimeNav';
import { generateChart } from '@/lib/ziwei/algorithm';
import type { BirthInfo, ZiweiChart, Palace } from '@/lib/ziwei/types';

/**
 * 命盘页 —— 开源版「排盘引擎 Demo」
 *
 * 这是一个最小可运行示例：用本仓库的排盘引擎 generateChart() 配合基础 UI
 * 组件，渲染一张完整紫微命盘 + 基础解读，并支持本命 / 大限 / 流年切换。
 *
 * 说明：线上商业版的完整交互界面（重设计的新 UI、AI 流式解读、合盘、分享
 * 卡片等）不在开源范围内；但排盘内核——安星算法、四化、格局识别、古籍库——
 * 完全开放（见 lib/ziwei/*），可自由二次开发出你自己的界面。
 */
export default function ChartPage() {
  const [chart, setChart] = useState<ZiweiChart | null>(null);
  const [selectedPalace, setSelectedPalace] = useState<Palace | null>(null);
  const [view, setView] = useState<TimeView>('mingpan');
  const [liunianYear, setLiunianYear] = useState(() => new Date().getFullYear());
  // 原始填报表单（含未校正的钟点），用于跳到「本地解读」时按数据集口径查
  const formRef = useRef<BirthFormState | null>(null);

  // ── 未起盘：展示出生信息表单 ──
  if (!chart) {
    return (
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 20px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>紫微斗数排盘</h1>
        <p style={{ color: '#888', marginBottom: 32, fontSize: 14, lineHeight: 1.7 }}>
          输入出生年月日时，开源排盘引擎即时生成命盘。
          <br />
          （本页为引擎 Demo，完整商业版界面不在开源范围；排盘内核完全开放。）
        </p>
        <BirthForm
          onSubmit={(info: BirthInfo) => setChart(generateChart(info))}
          onFormSave={(d: BirthFormState) => { formRef.current = d; }}
        />
      </main>
    );
  }

  // 计算「本地解读」链接：用填报时的钟点换算时辰（数据集口径，不做真太阳时校正）
  const f = formRef.current;
  const rawHour = f && !f.unknownTime
    ? Math.floor(((parseInt(f.clockHour) || 0) * 60 + (parseInt(f.clockMinute) || 0) + 60) / 120) % 12
    : chart.birthInfo.hour;
  const interpHref =
    `/interp?y=${chart.birthInfo.year}&m=${chart.birthInfo.month}&d=${chart.birthInfo.day}` +
    `&h=${rawHour}&g=${chart.birthInfo.gender}`;

  // ── 已起盘：命盘 + 解读 ──
  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => { setChart(null); setSelectedPalace(null); }}
          style={{
            padding: '6px 14px', cursor: 'pointer',
            border: '1px solid #ccc', borderRadius: 8, background: 'transparent',
          }}
        >
          ← 重新起盘
        </button>
        <a
          href={interpHref}
          style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 13, textDecoration: 'none',
            border: '1px solid var(--ac-bdr)', background: 'var(--ac-bg)', color: 'var(--ac)',
          }}
          title="用开源解读数据集 v4.0 查看这张盘的 13 维解读（本地数据，不经 AI）"
        >
          本地解读（数据集）→
        </a>
      </div>

      <TimeNav
        chart={chart}
        view={view}
        liunianYear={liunianYear}
        onViewChange={setView}
        onYearChange={setLiunianYear}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 380px)',
          gap: 20, marginTop: 16, alignItems: 'start',
        }}
      >
        <ChartBoard chart={chart} onPalaceSelect={setSelectedPalace} />
        <InsightPanel chart={chart} selectedPalace={selectedPalace} />
      </div>
    </main>
  );
}
