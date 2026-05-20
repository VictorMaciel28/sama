ALTER TABLE `stock_separation`
  ADD COLUMN `embalagem_iniciada_vendedor_id` INTEGER NULL AFTER `concluido_at`,
  ADD COLUMN `embalagem_iniciada_at` DATETIME(0) NULL AFTER `embalagem_iniciada_vendedor_id`;

ALTER TABLE `stock_separation`
  ADD CONSTRAINT `fk_stock_sep_emb_vend` FOREIGN KEY (`embalagem_iniciada_vendedor_id`) REFERENCES `vendedor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
