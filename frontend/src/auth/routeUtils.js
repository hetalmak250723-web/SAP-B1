export const normalizePath = (path) => {
  const normalized = `/${String(path || '').trim().replace(/^\/+|\/+$/g, '')}`;
  return normalized === '/' ? '/dashboard' : normalized;
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
  const normalizedPaths = menuPaths.map(normalizePath);
  if (normalizedPaths.includes('/dashboard')) return '/dashboard';
  return normalizedPaths[0] || '/dashboard';
};

export const isPathAllowed = (menuPaths = [], pathname = '/') => {
  const normalizedPath = normalizePath(pathname);
  const normalizedMenuPaths = menuPaths.map(normalizePath);

  if (!normalizedMenuPaths.length) {
    return normalizedPath === '/dashboard';
  }

  return normalizedMenuPaths.some((menuPath) =>
    normalizedPath === menuPath || normalizedPath.startsWith(`${menuPath}/`),
  );
};
