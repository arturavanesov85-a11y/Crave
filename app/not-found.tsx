import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="wrap stack" style={{ paddingTop: 96, paddingBottom: 96, maxWidth: 560, gap: 16 }}>
      <h1 className="page-title">Страница не найдена</h1>
      <Link className="btn btn-primary" href="/" style={{ alignSelf: 'flex-start' }}>На главную</Link>
    </div>
  );
}
