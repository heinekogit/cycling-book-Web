import { useState } from 'react'

import { ElevationPanel } from './ElevationPanel'
import type { TrackPoint } from '../routes/geometry'

export function EditorElevationPreview({ points, isRouting }: { points: TrackPoint[]; isRouting: boolean }) {
  const [snapshot, setSnapshot] = useState<{ points: TrackPoint[]; revision: number } | null>(null)
  const [visible, setVisible] = useState(false)
  const [activeDistanceM, setActiveDistanceM] = useState<number | null>(null)
  const canPreview = points.length >= 2 && !isRouting
  const isStale = snapshot !== null && (snapshot.points !== points || isRouting)

  const refresh = () => {
    if (!canPreview) return
    setSnapshot((previous) => ({ points, revision: (previous?.revision ?? 0) + 1 }))
    setActiveDistanceM(null)
    setVisible(true)
  }

  return <section className="editor-elevation-preview" aria-label="作成中のルートの標高">
    <div className="editor-elevation-actions">
      <p role="status">{isRouting
        ? 'ルートの計算が終わると標高を確認できます。'
        : points.length < 2
          ? '地図に2点以上追加すると、保存前に標高を確認できます。'
          : isStale
            ? 'ルートが変更されています。「標高を再表示」で最新のルートを確認してください。'
            : 'ボタンを押した時点のルートの標高を表示します。保存は不要です。'}</p>
      <div>
        <button className="button button-primary" type="button" onClick={refresh} disabled={!canPreview} aria-controls="editor-elevation-result">{snapshot ? '標高を再表示' : '標高を確認'}</button>
        {snapshot && points.length >= 2 && <button className="button button-quiet" type="button" aria-expanded={visible} aria-controls="editor-elevation-result" onClick={() => setVisible((value) => !value)}>{visible ? '閉じる' : 'グラフを開く'}</button>}
      </div>
    </div>
    <div id="editor-elevation-result" hidden={!visible || points.length < 2}>
      {snapshot && <>
        {isStale && <p className="editor-elevation-stale">以下は更新前のルートの標高です。</p>}
        <ElevationPanel key={snapshot.revision} points={snapshot.points} activeDistanceM={activeDistanceM} onActiveDistanceChange={setActiveDistanceM} />
        <p className="editor-elevation-note">標高は地形データなどに基づく目安です。取得できない場合は「標高を再表示」で再試行できます。</p>
      </>}
    </div>
  </section>
}
