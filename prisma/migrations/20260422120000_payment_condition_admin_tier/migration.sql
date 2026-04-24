-- Faixa de taxa administrativa (0=isenta, 1=3%, 2=5%) + espelho em percent
ALTER TABLE `payment_condition`
  ADD COLUMN `admin_tier` INT NOT NULL DEFAULT 0 AFTER `percent`;

-- Migrar faixa a partir do percent gravado (aproximação)
UPDATE `payment_condition`
SET `admin_tier` = CASE
  WHEN `percent` >= 4.5 THEN 2
  WHEN `percent` >= 2.5 THEN 1
  ELSE 0
END;

UPDATE `payment_condition`
SET `percent` = CASE `admin_tier`
  WHEN 2 THEN 5
  WHEN 1 THEN 3
  ELSE 0
END;
