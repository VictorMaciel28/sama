ALTER TABLE `stock_separation`
  ADD COLUMN `embalagem_finalizada_vendedor_id` INTEGER NULL AFTER `embalagem_iniciada_at`;

ALTER TABLE `stock_separation`
  ADD CONSTRAINT `fk_stock_sep_emb_final_vend` FOREIGN KEY (`embalagem_finalizada_vendedor_id`) REFERENCES `vendedor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
