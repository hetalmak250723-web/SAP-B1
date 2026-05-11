import React, { useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { normalizePath } from '../auth/routeUtils';
import '../styles/sidebar.css';

const DASHBOARD_PATH = '/dashboard';
const REPORT_LAYOUT_MANAGER_PATH = '/reports';
const STATIC_DASHBOARD_MENU = {
  menuId: 'dashboard-static',
  menuName: 'Dashboard',
  menuPath: DASHBOARD_PATH,
  parentId: null,
  icon: 'dashboard',
  sortOrder: -1,
  children: [],
};

const TOP_LEVEL_MENU_PRIORITY = new Map([
  ['dashboard', 0],
  ['sales', 1],
  ['sales a r', 1],
  ['purchase', 2],
  ['purchase a p', 2],
  ['purchasing', 2],
  ['purchasing a p', 2],
  ['master', 3],
  ['production', 4],
  ['inventory', 5],
  ['reports', 6],
  ['report layout manager', 7],
]);

const buildShortLabel = (label, fallback = 'MN') => {
  const words = String(label || '')
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return fallback;
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
};

const LEGACY_REPORT_LAYOUT_MANAGER_NAME = 'report layout manager';
const REPORT_STUDIO_NAME = 'report studio';
const MASTER_MENU_NAME = 'master';
const ALLOWED_MASTER_CHILDREN = new Set(['item master', 'business partner']);

const getDisplayMenuName = (menu) => {
  const normalized = String(menu?.menuName || '').trim().toLowerCase();
  if (normalized === 'sales' && !menu?.parentId) {
    return 'Sales - A/R';
  }

  if (normalized === REPORT_STUDIO_NAME) {
    return 'Report Layout Manager';
  }

  return menu?.menuName;
};

const normalizeMenuPriorityName = (menuName) =>
  String(menuName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const isDashboardMenu = (menu) => {
  const menuPath = menu?.menuPath ? normalizePath(menu.menuPath) : '';
  return menuPath === DASHBOARD_PATH || normalizeMenuPriorityName(menu?.menuName) === 'dashboard';
};

const extractDashboardMenu = (menus = []) => {
  let dashboardMenu = null;

  const stripDashboard = (items) =>
    items.reduce((nextItems, item) => {
      const nextChildren = item.children?.length ? stripDashboard(item.children) : item.children;

      if (isDashboardMenu(item)) {
        if (!dashboardMenu) {
          dashboardMenu = {
            ...item,
            parentId: null,
            menuPath: DASHBOARD_PATH,
            children: [],
          };
        }
        return nextItems;
      }

      nextItems.push(
        nextChildren === item.children
          ? item
          : {
              ...item,
              children: nextChildren,
            },
      );
      return nextItems;
    }, []);

  return {
    dashboardMenu: dashboardMenu || STATIC_DASHBOARD_MENU,
    remainingMenus: stripDashboard(menus),
  };
};

const sortTopLevelMenus = (menus = []) =>
  [...menus].sort((a, b) => {
    const priorityA = TOP_LEVEL_MENU_PRIORITY.get(normalizeMenuPriorityName(a.menuName)) ?? Number.MAX_SAFE_INTEGER;
    const priorityB = TOP_LEVEL_MENU_PRIORITY.get(normalizeMenuPriorityName(b.menuName)) ?? Number.MAX_SAFE_INTEGER;

    if (priorityA !== priorityB) return priorityA - priorityB;
    if ((a.sortOrder ?? 0) !== (b.sortOrder ?? 0)) return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    return String(a.menuId).localeCompare(String(b.menuId), undefined, { numeric: true });
  });

const buildSidebarMenus = (menus = []) => {
  const { dashboardMenu, remainingMenus } = extractDashboardMenu(menus);

  const removeHiddenSidebarItems = (items = []) =>
    items.reduce((nextItems, item) => {
      const menuPath = item?.menuPath ? normalizePath(item.menuPath) : '';
      const isMasterMenu = normalizeMenuPriorityName(item.menuName) === MASTER_MENU_NAME;
      const children = removeHiddenSidebarItems(item.children || []);
      const filteredChildren = isMasterMenu
        ? removeHiddenSidebarItems(
            (item.children || []).filter((child) =>
              ALLOWED_MASTER_CHILDREN.has(normalizeMenuPriorityName(child.menuName)),
            ),
          )
        : children;

      if (
        menuPath === REPORT_LAYOUT_MANAGER_PATH
        || normalizeMenuPriorityName(item.menuName) === LEGACY_REPORT_LAYOUT_MANAGER_NAME
      ) {
        return nextItems;
      }

      if (!menuPath && !filteredChildren.length) {
        return nextItems;
      }

      nextItems.push({
        ...item,
        children: filteredChildren,
      });
      return nextItems;
    }, []);

  return [dashboardMenu, ...sortTopLevelMenus(removeHiddenSidebarItems(remainingMenus))];
};

const hasActiveChild = (menu, pathname) => {
  const menuPath = menu.menuPath ? normalizePath(menu.menuPath) : '';
  if (menuPath && (pathname === menuPath || pathname.startsWith(`${menuPath}/`))) {
    return true;
  }

  return menu.children?.some((child) => hasActiveChild(child, pathname));
};

const SidebarMenuNode = ({ menu, collapsed, openState, setOpenState, pathname }) => {
  const hasChildren = Boolean(menu.children?.length);
  const menuPath = menu.menuPath ? normalizePath(menu.menuPath) : '';
  const isOpen = openState[menu.menuId] ?? hasActiveChild(menu, pathname);
  const displayMenuName = getDisplayMenuName(menu);
  const shortLabel = buildShortLabel(displayMenuName, buildShortLabel(menu.icon, 'MN'));

  if (hasChildren) {
    return (
      <div className="sidebar__section">
        <button
          type="button"
          className={`sidebar__section-toggle${isOpen ? ' is-open' : ''}`}
          onClick={() => setOpenState((current) => ({ ...current, [menu.menuId]: !isOpen }))}
          title={collapsed ? displayMenuName : undefined}
        >
          <span className="sidebar__section-title">
            {collapsed ? shortLabel : displayMenuName}
          </span>
        </button>

        {isOpen ? (
          <div className={`sidebar__section-body${collapsed ? ' is-collapsed' : ''}`}>
            {menu.children.map((child) => (
              <SidebarMenuNode
                key={child.menuId}
                menu={child}
                collapsed={collapsed}
                openState={openState}
                setOpenState={setOpenState}
                pathname={pathname}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (!menuPath) {
    return null;
  }

  return (
    <NavLink
      to={menuPath}
      end={menuPath === DASHBOARD_PATH}
      className={({ isActive }) =>
        `sidebar__link${isActive ? ' sidebar__link--active' : ''}`
      }
      title={collapsed ? displayMenuName : undefined}
    >
      <span className="sidebar__link-icon">{shortLabel}</span>
      {!collapsed ? <span className="sidebar__link-text">{displayMenuName}</span> : null}
    </NavLink>
  );
};

export default function Sidebar() {
  const location = useLocation();
  const { menus, company } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [openState, setOpenState] = useState({});
  const sidebarMenus = useMemo(() => buildSidebarMenus(menus), [menus]);

  return (
    <aside className={`sidebar-shell${collapsed ? ' is-collapsed' : ''}`}>
      <div className="sidebar">
        <div className="sidebar__top">
          <button
            type="button"
            className="sidebar__collapse-btn"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className="sidebar__collapse-icon">{collapsed ? '>' : '<'}</span>
          </button>

          {!collapsed ? (
            <div className="sidebar__brand">
              <div className="sidebar__brand-mark">SB</div>
              <div>
                <div className="sidebar__brand-title">SAP Client</div>
                <div className="sidebar__brand-subtitle">{company?.dbName || 'Business One'}</div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="sidebar__content">
          <nav className="sidebar__nav">
            {sidebarMenus.length ? (
              sidebarMenus.map((menu) => (
                <SidebarMenuNode
                  key={menu.menuId}
                  menu={menu}
                  collapsed={collapsed}
                  openState={openState}
                  setOpenState={setOpenState}
                  pathname={location.pathname}
                />
              ))
            ) : (
              <div className="sidebar__empty">
                No menus are available for this role.
              </div>
            )}
          </nav>
        </div>
      </div>
    </aside>
  );
}
