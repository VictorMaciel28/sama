-- Separação de estoque: agrupa pedidos e acompanha status (Separando / Separado)

CREATE TABLE `stock_separation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `status` ENUM('SEPARANDO', 'SEPARADO') NOT NULL DEFAULT 'SEPARANDO',
    `id_vendedor_externo` VARCHAR(100) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
    `finished_at` DATETIME(0) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `idx_stock_separation_status` ON `stock_separation`(`status`);
CREATE INDEX `idx_stock_separation_created` ON `stock_separation`(`created_at`);

CREATE TABLE `stock_separation_order` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `separation_id` INTEGER NOT NULL,
    `order_numero` INTEGER NOT NULL,

    UNIQUE INDEX `uk_separation_order`(`separation_id`, `order_numero`),
    INDEX `idx_separation_order_numero`(`order_numero`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `stock_separation_order` ADD CONSTRAINT `fk_separation_order_sep` FOREIGN KEY (`separation_id`) REFERENCES `stock_separation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `stock_separation_order` ADD CONSTRAINT `fk_separation_order_pedido` FOREIGN KEY (`order_numero`) REFERENCES `platform_order`(`numero`) ON DELETE CASCADE ON UPDATE CASCADE;
