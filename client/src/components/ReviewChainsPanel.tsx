import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import type { GraphState, ReviewChainsResult } from '../types';

interface ReviewChainsPanelProps {
  state: GraphState;
  titleOf: (id: string) => string;
  /** 把当前选中组的组员同步给画布高亮；null 表示清除高亮 */
  onHighlight: (cardIds: string[] | null) => void;
}

/**
 * 最少复核链面板（只读）：
 * 以当前全部卡片与「必须早于」连线为输入，服务端在传递闭包上求最小路径覆盖
 * （二分图最大匹配，全局最优，非贪心 / 非拓扑层数），给出最少组数与一份分组。
 * 点击某组即在画布高亮其组员；图一变化立即清除旧分组与高亮，再取新结果；
 * 过期响应（组件卸载或图已再变）不会回填。
 */
export default function ReviewChainsPanel(props: ReviewChainsPanelProps) {
  const { state, titleOf } = props;
  const [result, setResult] = useState<ReviewChainsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** 当前在画布高亮的组下标；null 表示未选中任何组 */
  const [selected, setSelected] = useState<number | null>(null);

  const onHighlightRef = useRef(props.onHighlight);
  onHighlightRef.current = props.onHighlight;

  /* 图变化（含首次挂载）：立即清除旧分组、选中与高亮，再重新只读计算；过期响应不回填 */
  useEffect(() => {
    setResult(null);
    setSelected(null);
    setErr(null);
    onHighlightRef.current(null);
    let alive = true;
    setLoading(true);
    api
      .reviewChains()
      .then((r) => {
        if (!alive) return;
        setResult(r);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setErr(e instanceof ApiError ? e.message : '计算最少复核链失败，请重试');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [state]);

  /* 卸载时清掉画布高亮 */
  useEffect(() => () => onHighlightRef.current(null), []);

  /* 把选中组的组员同步给画布；无选中时清除 */
  useEffect(() => {
    if (result === null || selected === null) {
      onHighlightRef.current(null);
      return;
    }
    onHighlightRef.current(result.chains[selected]?.cardIds ?? null);
  }, [result, selected]);

  /* Esc 取消组选中与高亮 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const empty = state.evidence.length === 0;

  return (
    <section className="rc-panel">
      <div className="rc-head">
        <h2>最少复核链（只读）</h2>
        <p className="muted">
          以当前全部卡片与「必须早于」连线为输入，把每张卡片恰好分入一组：组内按先后排列，前卡沿现有连线可达后卡（路径允许经过其他组的卡片，不要求相邻组员直接相连）。
          服务端在传递闭包上用二分图最大匹配求<b>全局最少组数</b>（非贪心、非拓扑层数近似），孤立卡单独成组。点击某组可在画布高亮组员（Esc 取消）；图一变化立即清除旧分组与高亮。
        </p>
      </div>

      {loading && <div className="rc-summary muted">正在计算最少复核链…</div>}
      {err && <div className="order-error">⚠ {err}</div>}

      {!loading && !err && result && (
        <>
          <div className="rc-summary">
            {empty ? (
              <>
                当前图为空：共 <b>0</b> 组复核链。
              </>
            ) : (
              <>
                共 <b>{state.evidence.length}</b> 张卡片，全局最少需要 <b>{result.chainCount}</b> 组复核链：
              </>
            )}
          </div>

          {result.chains.length > 0 && (
            <ol className="rc-list">
              {result.chains.map((chain, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className={`rc-chain${selected === i ? ' active' : ''}`}
                    onClick={() => setSelected((cur) => (cur === i ? null : i))}
                    title="点击在画布高亮本组组员；再次点击或按 Esc 取消"
                  >
                    <span className="rc-index">第 {i + 1} 组</span>
                    <span className="rc-cards">
                      {chain.cardIds.map((id, j) => (
                        <span key={id} className="rc-card">
                          {j > 0 && <span className="rc-arrow"> → </span>}
                          {titleOf(id)}
                        </span>
                      ))}
                    </span>
                    <span className="rc-count muted">{chain.cardIds.length} 张</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
