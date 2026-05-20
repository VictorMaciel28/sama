ALTER TABLE `stock_separation`
  ADD COLUMN `separacao_vendedor_id` INTEGER NULL AFTER `id_vendedor_externo`;

ALTER TABLE `stock_separation`
  ADD CONSTRAINT `fk_stock_sep_colaborador` FOREIGN KEY (`separacao_vendedor_id`) REFERENCES `vendedor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE `stock_separation` s
INNER JOIN `vendedor` v ON v.`id_vendedor_externo` IS NOT NULL AND s.`id_vendedor_externo` IS NOT NULL AND v.`id_vendedor_externo` = s.`id_vendedor_externo`
SET s.`separacao_vendedor_id` = v.`id`
WHERE s.`separacao_vendedor_id` IS NULL;
