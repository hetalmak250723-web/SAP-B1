const { REPORT_LAYOUT_MENU } = require('./reportLayoutService');

const DEFAULT_RIGHTS = {
  canView: true,
  canAdd: false,
  canEdit: false,
  canDelete: false,
};

const REPORTS_MENU = {
  menuId: 'virtual-reports-root',
  menuName: 'Reports',
  menuPath: '',
  parentId: null,
  icon: 'RP',
  sortOrder: 980000,
  rights: DEFAULT_RIGHTS,
  children: [
    {
      menuId: 'virtual-reports-studio',
      menuName: 'Report Studio',
      menuPath: '/reports',
      parentId: 'virtual-reports-root',
      icon: 'RS',
      sortOrder: 980050,
      rights: DEFAULT_RIGHTS,
      children: [],
    },
    {
      menuId: 'virtual-reports-sales',
      menuName: 'Sales',
      menuPath: '',
      parentId: 'virtual-reports-root',
      icon: 'SA',
      sortOrder: 980100,
      rights: DEFAULT_RIGHTS,
      children: [
        {
          menuId: 'virtual-reports-sales-analysis',
          menuName: 'Sales Analysis',
          menuPath: '/reports/sales/analysis',
          parentId: 'virtual-reports-sales',
          icon: 'SA',
          sortOrder: 980110,
          rights: DEFAULT_RIGHTS,
          children: [],
        },
      ],
    },
    {
      menuId: 'virtual-reports-purchasing',
      menuName: 'Purchasing',
      menuPath: '',
      parentId: 'virtual-reports-root',
      icon: 'PU',
      sortOrder: 980200,
      rights: DEFAULT_RIGHTS,
      children: [
        {
          menuId: 'virtual-reports-purchase-analysis',
          menuName: 'Purchase Analysis',
          menuPath: '/reports/purchasing/analysis',
          parentId: 'virtual-reports-purchasing',
          icon: 'PA',
          sortOrder: 980210,
          rights: DEFAULT_RIGHTS,
          children: [],
        },
        {
          menuId: 'virtual-reports-purchase-request-report',
          menuName: 'Purchase Request Report',
          menuPath: '/reports/purchasing/purchase-request-report',
          parentId: 'virtual-reports-purchasing',
          icon: 'PR',
          sortOrder: 980220,
          rights: DEFAULT_RIGHTS,
          children: [],
        },
      ],
    },
  ],
};

const cloneMenuNode = (node) => ({
  ...node,
  rights: { ...(node.rights || DEFAULT_RIGHTS) },
  children: Array.isArray(node.children) ? node.children.map(cloneMenuNode) : [],
});

const normalizeMenuName = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const findMatchingChild = (items, template) =>
  items.find((item) => {
    if (template.menuPath) {
      return String(item.menuPath || '').trim().toLowerCase() === String(template.menuPath).trim().toLowerCase();
    }

    return normalizeMenuName(item.menuName) === normalizeMenuName(template.menuName);
  });

const mergeMenuNode = (existingNode, templateNode) => {
  if (!existingNode.menuPath && templateNode.menuPath) {
    existingNode.menuPath = templateNode.menuPath;
  }

  if (!existingNode.icon && templateNode.icon) {
    existingNode.icon = templateNode.icon;
  }

  if (existingNode.sortOrder === undefined || existingNode.sortOrder === null) {
    existingNode.sortOrder = templateNode.sortOrder ?? 0;
  }

  if (!existingNode.rights) {
    existingNode.rights = { ...(templateNode.rights || DEFAULT_RIGHTS) };
  }

  if (!Array.isArray(existingNode.children)) {
    existingNode.children = [];
  }

  for (const childTemplate of templateNode.children || []) {
    upsertMenuNode(existingNode.children, childTemplate, existingNode.menuId);
  }
};

const upsertMenuNode = (items, templateNode, parentId = null) => {
  const existingNode = findMatchingChild(items, templateNode);
  if (existingNode) {
    mergeMenuNode(existingNode, templateNode);
    return existingNode;
  }

  const newNode = cloneMenuNode({
    ...templateNode,
    parentId,
  });
  items.push(newNode);
  return newNode;
};

const collectMenuPaths = (node, result = []) => {
  if (node.menuPath) {
    result.push(node.menuPath);
  }

  for (const child of node.children || []) {
    collectMenuPaths(child, result);
  }

  return result;
};

const appendVirtualMenus = (menuPayload = {}) => {
  const menus = Array.isArray(menuPayload.menus) ? [...menuPayload.menus] : [];
  const menuPaths = Array.isArray(menuPayload.menuPaths) ? [...menuPayload.menuPaths] : [];

  upsertMenuNode(menus, REPORTS_MENU, null);
  upsertMenuNode(menus, REPORT_LAYOUT_MENU, null);

  const requiredPaths = [
    ...collectMenuPaths(REPORTS_MENU),
    REPORT_LAYOUT_MENU.menuPath,
  ];

  for (const menuPath of requiredPaths) {
    if (!menuPaths.includes(menuPath)) {
      menuPaths.push(menuPath);
    }
  }

  return {
    menus,
    menuPaths,
  };
};

module.exports = {
  appendVirtualMenus,
};
