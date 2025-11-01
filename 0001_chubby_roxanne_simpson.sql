CREATE TABLE `locations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`latitude` varchar(50) NOT NULL,
	`longitude` varchar(50) NOT NULL,
	`locationType` enum('security','traffic','mixed') NOT NULL DEFAULT 'mixed',
	`radius` int DEFAULT 100,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `locations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `personnel` (
	`id` int AUTO_INCREMENT NOT NULL,
	`locationId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`role` varchar(100) NOT NULL,
	`phone` varchar(20),
	`email` varchar(320),
	`personnelType` enum('security','traffic') NOT NULL DEFAULT 'security',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `personnel_id` PRIMARY KEY(`id`)
);
