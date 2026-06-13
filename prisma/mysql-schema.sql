-- CityWalk Planner MySQL schema
-- Run this inside the existing production database before starting the app.
-- This script is intended for an empty schema and does not drop existing tables.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(80) NOT NULL,
    `displayName` VARCHAR(120) NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `folders` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `isVisible` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `folders_userId_idx`(`userId`),
    INDEX `folders_userId_parentId_idx`(`userId`, `parentId`),
    INDEX `folders_parentId_idx`(`parentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `route_plans` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `folderId` VARCHAR(191) NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` TEXT NULL,
    `color` VARCHAR(16) NOT NULL DEFAULT '#1677ff',
    `isVisible` BOOLEAN NOT NULL DEFAULT true,
    `pointsJson` JSON NULL,
    `mapLng` DOUBLE NULL,
    `mapLat` DOUBLE NULL,
    `mapZoom` DOUBLE NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `route_plans_userId_idx`(`userId`),
    INDEX `route_plans_userId_folderId_idx`(`userId`, `folderId`),
    INDEX `route_plans_folderId_idx`(`folderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `route_points` (
    `id` VARCHAR(191) NOT NULL,
    `routePlanId` VARCHAR(191) NOT NULL,
    `lng` DOUBLE NOT NULL,
    `lat` DOUBLE NOT NULL,
    `name` VARCHAR(120) NULL,
    `note` TEXT NULL,
    `orderIndex` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `route_points_routePlanId_orderIndex_idx`(`routePlanId`, `orderIndex`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `auth_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `auth_sessions_tokenHash_key`(`tokenHash`),
    INDEX `auth_sessions_userId_idx`(`userId`),
    INDEX `auth_sessions_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

ALTER TABLE `folders`
    ADD CONSTRAINT `folders_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `folders`
    ADD CONSTRAINT `folders_parentId_fkey`
    FOREIGN KEY (`parentId`) REFERENCES `folders`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `route_plans`
    ADD CONSTRAINT `route_plans_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `route_plans`
    ADD CONSTRAINT `route_plans_folderId_fkey`
    FOREIGN KEY (`folderId`) REFERENCES `folders`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `route_points`
    ADD CONSTRAINT `route_points_routePlanId_fkey`
    FOREIGN KEY (`routePlanId`) REFERENCES `route_plans`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `auth_sessions`
    ADD CONSTRAINT `auth_sessions_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
