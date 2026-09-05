import { Link } from 'react-router-dom'
export function PlaceholderPage({ title }: { title: string }) { return <main className="narrow-page"><section className="state-panel"><p className="eyebrow">COMING NEXT</p><h1>{title}</h1><p>この画面は次の移行工程でReact版を実装します。</p><Link className="button button-primary" to="/">トップへ戻る</Link></section></main> }
