-- 客户等级改为星级：三星 / 两星 / 一星 / 无意向(叉)

UPDATE "Customer" SET "customerGrade" = 'STAR_3' WHERE "customerGrade" = 'INTERESTED';
UPDATE "Customer" SET "customerGrade" = 'STAR_2' WHERE "customerGrade" = 'POTENTIAL';
UPDATE "Customer" SET "customerGrade" = 'NONE' WHERE "customerGrade" = 'NOT_INTERESTED';

UPDATE "FollowUp" SET "suggestedGrade" = 'STAR_3' WHERE "suggestedGrade" = 'INTERESTED';
UPDATE "FollowUp" SET "suggestedGrade" = 'STAR_2' WHERE "suggestedGrade" = 'POTENTIAL';
UPDATE "FollowUp" SET "suggestedGrade" = 'NONE' WHERE "suggestedGrade" = 'NOT_INTERESTED';

DELETE FROM "ConfigOption" WHERE "category" = 'customer_grade';

INSERT INTO "ConfigOption" ("id", "category", "value", "label", "sortOrder", "enabled") VALUES
  ('cfg-grade-star3', 'customer_grade', 'STAR_3', '三星', 1, 1),
  ('cfg-grade-star2', 'customer_grade', 'STAR_2', '两星', 2, 1),
  ('cfg-grade-star1', 'customer_grade', 'STAR_1', '一星', 3, 1),
  ('cfg-grade-none', 'customer_grade', 'NONE', '无意向', 4, 1);
