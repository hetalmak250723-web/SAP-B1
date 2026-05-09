const sql = require('mssql');
const env = require('../config/env');

const authDbConfig = {
  server: env.dbServer,
  database: env.authDbName,
  options: {
    instanceName: env.dbInstance || undefined,
    trustServerCertificate: env.dbTrustCert,
    encrypt: env.dbEncrypt,
  },
  authentication: {
    type: 'default',
    options: { userName: env.dbUser, password: env.dbPassword },
  },
  connectionTimeout: 15000,
  requestTimeout: 30000,
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
};

let authPool = null;

const getPool = async () => {
  if (authPool && authPool.connected) return authPool;
  authPool = await new sql.ConnectionPool(authDbConfig).connect();
  console.log(`[AUTH_DB] SQL Server pool connected to ${env.authDbName}`);
  return authPool;
};

const bindParams = (request, params = {}) => {
  for (const [key, value] of Object.entries(params)) {
    request.input(key, value);
  }
};

const query = async (queryText, params = {}) => {
  const pool = await getPool();
  const request = pool.request();

  bindParams(request, params);

  return request.query(queryText);
};

const transaction = async (callback) => {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  const runQuery = async (queryText, params = {}) => {
    const request = new sql.Request(tx);
    bindParams(request, params);
    return request.query(queryText);
  };

  try {
    const result = await callback({
      query: runQuery,
      queryRows: async (queryText, params = {}) => {
        const response = await runQuery(queryText, params);
        return response.recordset || [];
      },
      queryOne: async (queryText, params = {}) => {
        const rows = await runQuery(queryText, params);
        return rows.recordset?.[0] || null;
      },
    });

    await tx.commit();
    return result;
  } catch (error) {
    if (!tx._aborted) {
      await tx.rollback().catch(() => {});
    }
    throw error;
  }
};

const queryRows = async (queryText, params = {}) => {
  const result = await query(queryText, params);
  return result.recordset || [];
};

const queryOne = async (queryText, params = {}) => {
  const rows = await queryRows(queryText, params);
  return rows[0] || null;
};

const findUserByUsername = async (username) => queryOne(`
  SELECT UserId, Username, PasswordHash, FullName, Email, IsActive, CreatedAt
  FROM dbo.Users
  WHERE Username = @username
`, { username });

const getActiveCompanies = async () => queryRows(`
  SELECT
    CompanyId,
    CompanyName,
    DbName,
    DbUser,
    DbPassword,
    ServerName,
    LicenseServer,
    SAPVersion,
    IsActive,
    CreatedAt
  FROM dbo.Companies
  WHERE IsActive = 1
  ORDER BY CompanyName ASC
`);

const getUserCompanies = async (userId) => queryRows(`
  SELECT
    c.CompanyId,
    c.CompanyName,
    c.DbName,
    c.DbUser,
    c.DbPassword,
    c.ServerName,
    c.LicenseServer,
    c.SAPVersion,
    c.IsActive,
    c.CreatedAt,
    uc.IsDefault
  FROM dbo.UserCompanies uc
  INNER JOIN dbo.Companies c
    ON c.CompanyId = uc.CompanyId
  WHERE uc.UserId = @userId
    AND c.IsActive = 1
  ORDER BY uc.IsDefault DESC, c.CompanyName ASC
`, { userId });

const getAssignedCompanyForUser = async (userId, companyId) => queryOne(`
  SELECT
    c.CompanyId,
    c.CompanyName,
    c.DbName,
    c.DbUser,
    c.DbPassword,
    c.ServerName,
    c.LicenseServer,
    c.SAPVersion,
    c.IsActive,
    c.CreatedAt,
    uc.IsDefault
  FROM dbo.UserCompanies uc
  INNER JOIN dbo.Companies c
    ON c.CompanyId = uc.CompanyId
  WHERE uc.UserId = @userId
    AND uc.CompanyId = @companyId
    AND c.IsActive = 1
`, { userId, companyId });

const getUserRoleForCompany = async (userId, companyId) => queryOne(`
  SELECT TOP 1 ur.RoleId, r.RoleName
  FROM dbo.UserRoles ur
  INNER JOIN dbo.Roles r
    ON r.RoleId = ur.RoleId
  WHERE ur.UserId = @userId
    AND ur.CompanyId = @companyId
`, { userId, companyId });

const getAllMenus = async () => queryRows(`
  SELECT MenuId, MenuName, MenuPath, ParentId, Icon, SortOrder
  FROM dbo.Menus
  ORDER BY SortOrder, MenuId
`);

const getRoleRights = async (roleId) => queryRows(`
  SELECT RoleId, MenuId, CanView, CanAdd, CanEdit, CanDelete
  FROM dbo.RoleRights
  WHERE RoleId = @roleId
`, { roleId });

module.exports = {
  query,
  queryRows,
  queryOne,
  transaction,
  findUserByUsername,
  getActiveCompanies,
  getUserCompanies,
  getAssignedCompanyForUser,
  getUserRoleForCompany,
  getAllMenus,
  getRoleRights,
};
