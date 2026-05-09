export const normalizePath = (path) => {
  const normalized = `/${String(path || '').trim().replace(/^\/+|\/+$/g, '')}`;
  const route = normalized === '/' ? '/dashboard' : normalized;
  const routeKey = route.toLowerCase().replace(/[\s_]+/g, '-');
  const compactRouteKey = routeKey.replace(/-/g, '');

  const canonicalRoutes = {
    '/salesorder': '/sales-order',
    '/salesorders': '/sales-order',
    '/salesquotation': '/sales-quotation',
    '/salesquotations': '/sales-quotation',
    '/sales-quotations': '/sales-quotation',
    '/ar-invoice': '/ar-invoice',
    '/arinvoice': '/ar-invoice',
    '/ar-credit-memo': '/ar-credit-memo',
    '/arcreditmemo': '/ar-credit-memo',
    '/delivery': '/delivery',
    '/deliveries': '/delivery',
    '/issue-production': '/issue-for-production',
    '/issueforproduction': '/issue-for-production',
    '/receipt-production': '/receipt-from-production',
    '/receiptfromproduction': '/receipt-from-production',
  };

  if (canonicalRoutes[routeKey] || canonicalRoutes[compactRouteKey]) {
    return canonicalRoutes[routeKey] || canonicalRoutes[compactRouteKey];
  }

  const [firstSegment, ...restSegments] = routeKey.slice(1).split('/');
  const firstRoute = `/${firstSegment}`;
  const compactFirstRoute = `/${firstSegment.replace(/-/g, '')}`;
  const canonicalFirstRoute = canonicalRoutes[firstRoute] || canonicalRoutes[compactFirstRoute];
  if (canonicalFirstRoute) {
    return `${canonicalFirstRoute}${restSegments.length ? `/${restSegments.join('/')}` : ''}`;
  }

  return route;
};

const APP_ROUTE_BASES = new Set([
  '/dashboard',
  '/item-master',
  '/business-partner',
  '/warehouse',
  '/price-list',
  '/tax-code',
  '/uom-group',
  '/payment-terms',
  '/goods-receipt',
  '/goods-issue',
  '/inventory-transfer-request',
  '/inventory-transfer',
  '/delivery',
  '/shipping-type',
  '/branch',
  '/chart-of-accounts',
  '/purchase-order',
  '/purchase-quotation',
  '/purchase-request',
  '/grpo',
  '/sales-order',
  '/sales-quotation',
  '/reports/sales/analysis',
  '/reports/purchasing/analysis',
  '/reports/purchase-analysis',
  '/reports/purchase/analysis',
  '/reports/purchasing/purchase-quotation-comparison',
  '/reports/purchase-quotation-comparison',
  '/reports/purchasing/purchase-request-report',
  '/report-layout-manager',
  '/bom',
  '/production-order',
  '/issue-for-production',
  '/receipt-from-production',
  '/ap-invoice',
  '/ar-invoice',
  '/ar-credit-memo',
  '/ap-credit-memo',
  '/return',
]);

const isAdminRole = (roleName = '') =>
  String(roleName).trim().toLowerCase() === 'admin';

export const isKnownAppPath = (pathname = '/') => {
  const normalizedPath = normalizePath(pathname);

  return [...APP_ROUTE_BASES].some((routeBase) =>
    normalizedPath === routeBase || normalizedPath.startsWith(`${routeBase}/`),
  );
};

export const flattenMenuTree = (menus = []) => {
  const flattened = [];

  for (const menu of menus) {
    flattened.push(menu);
    if (menu.children?.length) {
      flattened.push(...flattenMenuTree(menu.children));
    }
  }

  return flattened;
};

export const getDefaultRoute = (menuPaths = []) => {
  return '/dashboard';
};

export const isPathAllowed = (menuPaths = [], pathname = '/', roleName = '') => {
  const normalizedPath = normalizePath(pathname);
  const normalizedMenuPaths = menuPaths.map(normalizePath);

  if (normalizedPath === '/dashboard') {
    return true;
  }

  if (isAdminRole(roleName) && isKnownAppPath(normalizedPath)) {
    return true;
  }

  if (!normalizedMenuPaths.length) {
    return normalizedPath === '/dashboard';
  }

  return normalizedMenuPaths.some((menuPath) =>
    normalizedPath === menuPath || normalizedPath.startsWith(`${menuPath}/`),
  );
};
