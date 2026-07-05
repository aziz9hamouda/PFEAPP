-- PFEAPP - Base de données applicative (comptes, historique ETL, historique prédictions)
-- Séparée de DataWarehouse : aucune table FACT_/DIM_ n'est touchée.
-- À exécuter manuellement via SSMS contre l'instance desktop-62gqjao\SQLEXPRESS.

IF DB_ID('PFEAPP_App') IS NULL
BEGIN
    CREATE DATABASE PFEAPP_App;
END
GO

USE PFEAPP_App;
GO

IF OBJECT_ID('dbo.APP_USERS', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.APP_USERS (
        Id              INT IDENTITY(1,1) PRIMARY KEY,
        TandemEmail     NVARCHAR(256)  NOT NULL UNIQUE,
        MicrosoftEmail  NVARCHAR(256)  NOT NULL,
        PasswordHash    NVARCHAR(256)  NOT NULL,
        DisplayName     NVARCHAR(200)  NOT NULL,
        Role            NVARCHAR(100)  NOT NULL,
        RoleCode        NVARCHAR(20)   NOT NULL,   -- CEO | LOG | ADMIN
        IsActive        BIT            NOT NULL DEFAULT 1,
        CreatedAt       DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
        LastLoginAt     DATETIME2      NULL
    );
END
GO

IF OBJECT_ID('dbo.PASSWORD_RESET_TOKENS', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.PASSWORD_RESET_TOKENS (
        Id          INT IDENTITY(1,1) PRIMARY KEY,
        UserId      INT NOT NULL REFERENCES dbo.APP_USERS(Id),
        Token       NVARCHAR(200) NOT NULL UNIQUE,
        ExpiresAt   DATETIME2 NOT NULL,
        UsedAt      DATETIME2 NULL,
        CreatedAt   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID('dbo.ETL_EXECUTION_LOG', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ETL_EXECUTION_LOG (
        Id              INT IDENTITY(1,1) PRIMARY KEY,
        Package         NVARCHAR(200) NOT NULL,
        Type            NVARCHAR(50)  NOT NULL,  -- Dimensions | Faits | Master
        Success         BIT           NOT NULL,
        Message         NVARCHAR(1000) NOT NULL,
        Output          NVARCHAR(MAX) NULL,
        Error           NVARCHAR(MAX) NULL,
        ExecutedAt      DATETIME2     NOT NULL,
        DurationSeconds INT           NOT NULL
    );
END
GO

IF OBJECT_ID('dbo.PREDICTION_HISTORY', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.PREDICTION_HISTORY (
        Id                INT IDENTITY(1,1) PRIMARY KEY,
        Type              NVARCHAR(20)  NOT NULL,  -- Margin | Segmentation
        InputJson         NVARCHAR(MAX) NOT NULL,
        ResultJson        NVARCHAR(MAX) NOT NULL,
        PredictedByEmail  NVARCHAR(256) NULL,
        PredictedByRole   NVARCHAR(20)  NULL,
        PredictedAt       DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO
