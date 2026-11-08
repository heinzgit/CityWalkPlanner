-- Apply this once to an existing CityWalk Planner MySQL database.
-- The application does not execute this migration automatically.

ALTER TABLE `route_plans`
    ADD COLUMN `completedOn` DATE NULL AFTER `sortOrder`,
    ADD COLUMN `distanceMeters` INT UNSIGNED NULL AFTER `completedOn`,
    ADD COLUMN `travelMode` VARCHAR(16) NULL AFTER `distanceMeters`,
    ADD INDEX `route_plans_userId_completedOn_idx` (`userId`, `completedOn`),
    ADD INDEX `route_plans_userId_travelMode_completedOn_idx`
        (`userId`, `travelMode`, `completedOn`);
