import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { flattenMenuTree, normalizePath } from '../auth/routeUtils';

const getDisplayMenuName = (menuName) => {
  const normalized = String(menuName || '').trim().toLowerCase();
  if (normalized === 'report studio') {
    return 'Report Layout Manager';
  }
  return menuName;
};

const Header = () => {
  const navigate = useNavigate();
  const { user, company, roleName, logout, menus } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const flattenedMenus = flattenMenuTree(menus)
    .filter((menu) => menu?.menuPath)
    .filter((menu) => String(menu?.menuName || '').trim().toLowerCase() !== 'report layout manager')
    .map((menu) => ({
      menuId: menu.menuId,
      menuName: getDisplayMenuName(menu.menuName),
      menuPath: normalizePath(menu.menuPath),
    }));

  const searchItems = [...flattenedMenus];

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const searchResults = normalizedSearch
    ? searchItems
      .filter((item) => {
        const name = String(item.menuName || '').toLowerCase();
        const path = String(item.menuPath || '').toLowerCase();
        return name.includes(normalizedSearch) || path.includes(normalizedSearch);
      })
      .slice(0, 8)
    : [];

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const openSearchResult = (menuPath) => {
    if (!menuPath) return;
    navigate(normalizePath(menuPath));
    setSearchQuery('');
    setSearchOpen(false);
  };

  return (
    <header className="topbar">
      <div>
        <div className="topbar__eyebrow">SAP Business One</div>
        <h1>Web Client</h1>
      </div>

      <div className="topbar__search-shell">
        <input
          type="search"
          className="topbar__search-input"
          value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && searchResults[0]) {
              event.preventDefault();
              openSearchResult(searchResults[0].menuPath);
            }
          }}
          placeholder="Search screens, for example Report Layout Manager"
        />

        {searchOpen && normalizedSearch ? (
          <div className="topbar__search-results">
            {searchResults.length ? (
              searchResults.map((item) => (
                <button
                  key={`${item.menuId}-${item.menuPath}`}
                  type="button"
                  className="topbar__search-result"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => openSearchResult(item.menuPath)}
                >
                  <strong>{item.menuName}</strong>
                  <span>{normalizePath(item.menuPath)}</span>
                </button>
              ))
            ) : (
              <div className="topbar__search-empty">No matching screen found.</div>
            )}
          </div>
        ) : null}
      </div>

      <div className="topbar__meta">
        <div className="topbar__chip">
          <span className="topbar__chip-label">User</span>
          <strong>{user?.fullName || user?.username}</strong>
        </div>

        <div className="topbar__chip">
          <span className="topbar__chip-label">Company</span>
          <strong>{company?.companyName || 'Not selected'}</strong>
        </div>

        <div className="topbar__chip">
          <span className="topbar__chip-label">Role</span>
          <strong>{roleName || 'Unassigned'}</strong>
        </div>

        <button type="button" className="topbar__logout" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </header>
  );
};

export default Header;
