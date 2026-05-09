USE [henny_master];
GO

IF OBJECT_ID(N'dbo.ReportMenus', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ReportMenus (
    ReportMenuId INT IDENTITY(1,1) PRIMARY KEY,
    MenuName NVARCHAR(150) NOT NULL,
    ParentId INT NULL,
    Icon NVARCHAR(50) NULL,
    SortOrder INT NOT NULL CONSTRAINT DF_ReportMenus_SortOrder DEFAULT (0),
    CreatedBy INT NOT NULL,
    CompanyId INT NOT NULL,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_ReportMenus_CreatedAt DEFAULT (SYSUTCDATETIME()),
    UpdatedAt DATETIME2 NULL,
    CONSTRAINT FK_ReportMenus_Parent FOREIGN KEY (ParentId) REFERENCES dbo.ReportMenus(ReportMenuId)
  );
END;
GO

IF COL_LENGTH(N'dbo.ReportMenus', N'CreatedBy') IS NULL
BEGIN
  ALTER TABLE dbo.ReportMenus ADD CreatedBy INT NULL;
END;
GO

IF COL_LENGTH(N'dbo.ReportMenus', N'CompanyId') IS NULL
BEGIN
  ALTER TABLE dbo.ReportMenus ADD CompanyId INT NULL;
END;
GO

IF COL_LENGTH(N'dbo.ReportMenus', N'Icon') IS NULL
BEGIN
  ALTER TABLE dbo.ReportMenus ADD Icon NVARCHAR(50) NULL;
END;
GO

IF COL_LENGTH(N'dbo.ReportMenus', N'SortOrder') IS NULL
BEGIN
  ALTER TABLE dbo.ReportMenus ADD SortOrder INT NOT NULL CONSTRAINT DF_ReportMenus_SortOrder_Alter DEFAULT (0);
END;
GO

IF COL_LENGTH(N'dbo.ReportMenus', N'CreatedAt') IS NULL
BEGIN
  ALTER TABLE dbo.ReportMenus ADD CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_ReportMenus_CreatedAt_Alter DEFAULT (SYSUTCDATETIME());
END;
GO

IF COL_LENGTH(N'dbo.ReportMenus', N'UpdatedAt') IS NULL
BEGIN
  ALTER TABLE dbo.ReportMenus ADD UpdatedAt DATETIME2 NULL;
END;
GO

IF OBJECT_ID(N'dbo.Reports', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Reports (
    ReportId INT IDENTITY(1,1) PRIMARY KEY,
    ReportName NVARCHAR(150) NOT NULL,
    ReportCode NVARCHAR(100) NOT NULL,
    ReportMenuId INT NULL,
    ApiUrl NVARCHAR(500) NOT NULL,
    ReportType NVARCHAR(50) NOT NULL CONSTRAINT DF_Reports_ReportType DEFAULT ('GET'),
    CompanyId INT NOT NULL,
    CreatedBy INT NOT NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_Reports_IsActive DEFAULT (1),
    IsPublic BIT NOT NULL CONSTRAINT DF_Reports_IsPublic DEFAULT (0),
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Reports_CreatedAt DEFAULT (SYSUTCDATETIME()),
    UpdatedAt DATETIME2 NULL,
    CONSTRAINT FK_Reports_ReportMenus FOREIGN KEY (ReportMenuId) REFERENCES dbo.ReportMenus(ReportMenuId)
  );
END;
GO

IF COL_LENGTH(N'dbo.Reports', N'CreatedBy') IS NULL
BEGIN
  ALTER TABLE dbo.Reports ADD CreatedBy INT NULL;
END;
GO

IF COL_LENGTH(N'dbo.Reports', N'CompanyId') IS NULL
BEGIN
  ALTER TABLE dbo.Reports ADD CompanyId INT NULL;
END;
GO

IF COL_LENGTH(N'dbo.Reports', N'IsActive') IS NULL
BEGIN
  ALTER TABLE dbo.Reports ADD IsActive BIT NOT NULL CONSTRAINT DF_Reports_IsActive_Alter DEFAULT (1);
END;
GO

IF COL_LENGTH(N'dbo.Reports', N'ReportMenuId') IS NULL
BEGIN
  ALTER TABLE dbo.Reports ADD ReportMenuId INT NULL;
END;
GO

IF COL_LENGTH(N'dbo.Reports', N'ApiUrl') IS NULL
BEGIN
  ALTER TABLE dbo.Reports ADD ApiUrl NVARCHAR(500) NULL;
END;
GO

IF COL_LENGTH(N'dbo.Reports', N'ReportType') IS NULL
BEGIN
  ALTER TABLE dbo.Reports ADD ReportType NVARCHAR(50) NOT NULL CONSTRAINT DF_Reports_ReportType_Alter DEFAULT ('GET');
END;
GO

IF COL_LENGTH(N'dbo.Reports', N'IsPublic') IS NULL
BEGIN
  ALTER TABLE dbo.Reports ADD IsPublic BIT NOT NULL CONSTRAINT DF_Reports_IsPublic_Alter DEFAULT (0);
END;
GO

IF COL_LENGTH(N'dbo.Reports', N'CreatedAt') IS NULL
BEGIN
  ALTER TABLE dbo.Reports ADD CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Reports_CreatedAt_Alter DEFAULT (SYSUTCDATETIME());
END;
GO

IF COL_LENGTH(N'dbo.Reports', N'UpdatedAt') IS NULL
BEGIN
  ALTER TABLE dbo.Reports ADD UpdatedAt DATETIME2 NULL;
END;
GO

IF OBJECT_ID(N'dbo.ReportParameters', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ReportParameters (
    ParamId INT IDENTITY(1,1) PRIMARY KEY,
    ReportId INT NOT NULL,
    ParamName NVARCHAR(100) NOT NULL,
    DisplayName NVARCHAR(150) NOT NULL,
    ParamType NVARCHAR(30) NOT NULL,
    IsRequired BIT NOT NULL CONSTRAINT DF_ReportParameters_IsRequired DEFAULT (0),
    SortOrder INT NOT NULL CONSTRAINT DF_ReportParameters_SortOrder DEFAULT (0),
    DefaultValue NVARCHAR(255) NULL,
    CreatedBy INT NOT NULL,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_ReportParameters_CreatedAt DEFAULT (SYSUTCDATETIME()),
    UpdatedAt DATETIME2 NULL,
    CONSTRAINT FK_ReportParameters_Reports FOREIGN KEY (ReportId) REFERENCES dbo.Reports(ReportId)
  );
END;
GO

IF COL_LENGTH(N'dbo.ReportParameters', N'CreatedBy') IS NULL
BEGIN
  ALTER TABLE dbo.ReportParameters ADD CreatedBy INT NULL;
END;
GO

IF COL_LENGTH(N'dbo.ReportParameters', N'SortOrder') IS NULL
BEGIN
  ALTER TABLE dbo.ReportParameters ADD SortOrder INT NOT NULL CONSTRAINT DF_ReportParameters_SortOrder_Alter DEFAULT (0);
END;
GO

IF COL_LENGTH(N'dbo.ReportParameters', N'DefaultValue') IS NULL
BEGIN
  ALTER TABLE dbo.ReportParameters ADD DefaultValue NVARCHAR(255) NULL;
END;
GO

IF COL_LENGTH(N'dbo.ReportParameters', N'CreatedAt') IS NULL
BEGIN
  ALTER TABLE dbo.ReportParameters ADD CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_ReportParameters_CreatedAt_Alter DEFAULT (SYSUTCDATETIME());
END;
GO

IF COL_LENGTH(N'dbo.ReportParameters', N'UpdatedAt') IS NULL
BEGIN
  ALTER TABLE dbo.ReportParameters ADD UpdatedAt DATETIME2 NULL;
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'IX_ReportMenus_CompanyOwner'
    AND object_id = OBJECT_ID(N'dbo.ReportMenus')
)
BEGIN
  CREATE INDEX IX_ReportMenus_CompanyOwner
    ON dbo.ReportMenus (CompanyId, CreatedBy, ParentId, SortOrder, MenuName);
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'IX_Reports_CompanyOwner'
    AND object_id = OBJECT_ID(N'dbo.Reports')
)
BEGIN
  CREATE INDEX IX_Reports_CompanyOwner
    ON dbo.Reports (CompanyId, CreatedBy, IsPublic, ReportMenuId, ReportName);
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'IX_ReportParameters_Report'
    AND object_id = OBJECT_ID(N'dbo.ReportParameters')
)
BEGIN
  CREATE INDEX IX_ReportParameters_Report
    ON dbo.ReportParameters (ReportId, SortOrder, ParamId);
END;
GO

PRINT 'SaaS report studio schema is ready in henny_master.';
