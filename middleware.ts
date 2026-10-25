// Один сервер — три сайта. По домену запроса выбирается нужный сайт:
//   SITE_HOST_AUTO=crave-auto.ru       → страницы из /auto
//   SITE_HOST_SERVICE=crave-service.ru → страницы из /service
// Сайт проката и CRM работают на основном домене (crave-rental.ru).
// Если переменные не заданы (локальная разработка), сайты открываются по путям /auto и /service.
import { NextResponse, type NextRequest } from 'next/server';

const host = (h: string | null) => (h ?? '').split(':')[0].toLowerCase().replace(/^www\./, '');

export function middleware(req: NextRequest) {
  const auto = process.env.SITE_HOST_AUTO?.toLowerCase();
  const service = process.env.SITE_HOST_SERVICE?.toLowerCase();
  if (!auto && !service) return NextResponse.next();

  const h = host(req.headers.get('host'));
  const { pathname } = req.nextUrl;
  const site = h === auto ? '/auto' : h === service ? '/service' : null;

  if (site) {
    if (pathname.startsWith(site) || pathname === '/robots.txt' || pathname === '/politika-konfidencialnosti') return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = site + (pathname === '/' ? '' : pathname);
    return NextResponse.rewrite(url);
  }
  // На домене проката адреса /auto и /service ведут на отдельные домены.
  const target = pathname.startsWith('/auto') ? auto : pathname.startsWith('/service') ? service : null;
  if (target) {
    const rest = pathname.replace(/^\/(auto|service)/, '') || '/';
    return NextResponse.redirect(`https://${target}${rest}${req.nextUrl.search}`, 301);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|api|brand|cars|media|favicon).*)'],
};
