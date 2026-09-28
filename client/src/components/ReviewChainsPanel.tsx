import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import type { GraphState, MinimumChainsResult, ReviewChainHighlight } from '../types';

interface ReviewChainsPanelProps {
  state: GraphState;
  titleOf: (id: string) => string;
  /** 把当前选中组同步给画布高亮（组员按组内先后排列） */
  onHighlight: (h: ReviewChainHighlight | null) => void;
}

/**
 * 最少复核链面板（只读）：服务端以当前全部卡片与「必须早于」连线为输入，
 * 用 DAG 最小路径覆盖（传递闭包 + 二分图最大匹配）求全局最少组数及一份对应分组。
 * 组内相邻卡片只要求前者沿现有连线可达后者，路径可经过其他组卡片。
 */
export default function ReviewChainsPanel({ state, titleOf, onHighlight }: ReviewChainsPanelProps) {
  const [result, setResult] = useState<MinimumChainsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** 当前选中并在画布高亮的组下标 */
  const [selected, setSelected] = useState<number | null>(null);

  const onHighlightRef = useRef(onHighlight);
  onHighlightRef.current = onHighlight;

  /* 图一变化（卡片增删改、连线增删、导入、合并等都会带来新的 state）：
     在绘制前同步清除旧分组与画布高亮，绝不让旧分组在新图上残留一帧 */
  useLayoutEffect(() => {
    setResult(null);
    setErr(null);
    setSelected(null);
    onHighlightRef.current(null);
  }, [state]);

  /* 随后按最新图重新向服务端取分组；请求序号保证过期响应不得回填 */
  const seqRef = useRef(0);
  useEffect(() => {
    if (state.evidence.length === 0) {
      // 空图固定为 0 组：终止任何在途请求的回填，并复位加载态
      seqRef.current++;
      setLoading(false);
      return;
    }
    let alive = true;
    const seq = ++seqRef.current;
    setLoading(true);
    api
      .reviewChains()
      .then((r) => {
        if (!alive || seq !== seqRef.current) return;
        setResult(r);
      })
      .catch((e) => {
        if (!alive || seq !== seqRef.current) return;
        setErr(e instanceof ApiError ? e.message : '分组计算失败，请重试');
      })
      .finally(() => {
        if (alive && seq === seqRef.current) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [state]);

  /* 选中组变化时同步画布高亮 */
  useEffect(() => {
    if (result !== null && selected !== null && result.groups[selected]) {
      onHighlightRef.current({ group: result.groups[selected] });
    } else {
      onHighlightRef.current(null);
    }
  }, [result, selected]);

  /* Esc 取消组高亮 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const incident = (id: string): boolean => state.edges.some((e) => e.fromId === id || e.toId === id);

  return (
    <section className="chain-panel">
      <div className="chain-head">
        <h2>最少复核链分组</h2>
        <p className="muted">
          按确定的先后顺序把全部卡片分成最少的复核组：每组内卡片按约束先后排列，前一张卡片必须能沿现有「必须早于」连线到达后一张（允许路径经过其他组的卡片，不要求相邻组员直接相连），每张卡片恰好归入一组，孤立卡片单独成组。服务端以传递闭包上的二分图最大匹配求全局最优解（非贪心、非拓扑层数），只读不写库；图一变化旧分组与高亮立即清除。
        </p>
      </div>

      {loading && <div className="chain-summary muted">正在按当前证据链计算最优分组…</div>}
      {err && <div className="order-error">⚠ {err}</div>}

      {!loading && !err && state.evidence.length === 0 && (
        <div className="chain-summary">当前没有卡片：<b>0 组</b>。新增证据后自动重新分组。</div>
      )}

      {!loading && !err && result && result.cardCount > 0 && (
        <>
          <div className="chain-summary">
            全局最少 <b>{result.groupCount}</b> 组（共 {result.cardCount} 张卡片）；点击任意一组在画布高亮其组员（组内序号标在卡片角标，Esc 取消）。
          </div>
          <ol className="chain-list">
            {result.groups.map((group, i) => {
              const singleton = group.length === 1 && !incident(group[0]);
              return (
                <li key={i}>
                  <button
                    type="button"
                    className={`chain-item${selected === i ? ' active' : ''}`}
                    aria-pressed={selected === i}
                    onClick={() => setSelected((cur) => (cur === i ? null : i))}
                    title="在画布上高亮本组组员（再次点击取消）"
                  >
                    <span className="chain-index">
                      第 {i + 1} 组 · {group.length} 张{singleton ? ' · 孤立卡片' : ''}
                    </span>
                    <span className="chain-seq">
                      {group.map((id, j) => (
                        <span key={id} className="chain-node">
                          <span className="chain-pos">{j + 1}</span>
                          {titleOf(id)}
                        </span>
                      ))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
