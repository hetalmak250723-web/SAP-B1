import React from 'react';

const TreeNode = ({
  node,
  depth,
  expandedMenus,
  selectedMenuId,
  selectedReportId,
  onToggleMenu,
  onSelectMenu,
  onSelectReport,
}) => {
  const directReport = !node.children?.length && node.reports?.length === 1 ? node.reports[0] : null;
  const hasChildren = Boolean(node.children?.length || (!directReport && node.reports?.length));
  const isExpanded = hasChildren ? (expandedMenus[node.menuId] ?? depth < 1) : false;
  const isSelected = selectedMenuId === node.menuId || (directReport && selectedReportId === directReport.reportId);

  return (
    <div className="rs-tree__node">
      <div
        className={`rs-tree__menu-row${isSelected ? ' is-selected' : ''}`}
        style={{ paddingLeft: `${14 + depth * 18}px` }}
      >
        <button
          type="button"
          className={`rs-tree__caret${isExpanded ? ' is-open' : ''}${hasChildren ? '' : ' is-empty'}`}
          onClick={() => {
            if (hasChildren) {
              onToggleMenu(node.menuId);
            }
          }}
        >
          {hasChildren ? '>' : ''}
        </button>
        <button
          type="button"
          className="rs-tree__menu"
          title={node.menuName}
          onClick={() => {
            if (directReport) {
              onSelectReport(directReport);
              return;
            }

            onSelectMenu(node);
          }}
        >
          <span className="rs-tree__menu-label">{node.menuName}</span>
        </button>
      </div>

      {isExpanded ? (
        <div className="rs-tree__children">
          {node.children?.map((child) => (
            <TreeNode
              key={child.menuId}
              node={child}
              depth={depth + 1}
              expandedMenus={expandedMenus}
              selectedMenuId={selectedMenuId}
              selectedReportId={selectedReportId}
              onToggleMenu={onToggleMenu}
              onSelectMenu={onSelectMenu}
              onSelectReport={onSelectReport}
            />
          ))}

          {directReport ? null : node.reports?.map((report) => (
            <button
              key={report.reportId}
              type="button"
              className={`rs-tree__report${selectedReportId === report.reportId ? ' is-selected' : ''}`}
              style={{ paddingLeft: `${40 + depth * 18}px` }}
              onClick={() => onSelectReport(report)}
              title={report.reportName}
            >
              <span className="rs-tree__report-bullet" />
              <span className="rs-tree__report-label">{report.reportName}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

function ReportTree({
  menus,
  expandedMenus,
  selectedMenuId,
  selectedReportId,
  onToggleMenu,
  onSelectMenu,
  onSelectReport,
}) {
  if (!menus?.length) {
    return <div className="rs-panel__empty">No report menus created yet.</div>;
  }

  return (
    <div className="rs-tree">
      <div className="rs-tree__content">
        {menus.map((node) => (
          <TreeNode
            key={node.menuId}
            node={node}
            depth={0}
            expandedMenus={expandedMenus}
            selectedMenuId={selectedMenuId}
            selectedReportId={selectedReportId}
            onToggleMenu={onToggleMenu}
            onSelectMenu={onSelectMenu}
            onSelectReport={onSelectReport}
          />
        ))}
      </div>
    </div>
  );
}

export default ReportTree;
