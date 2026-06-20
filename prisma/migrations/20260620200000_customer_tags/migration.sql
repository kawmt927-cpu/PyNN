-- 客户标签 + ConfigOption 颜色字段

ALTER TABLE "ConfigOption" ADD COLUMN "color" TEXT;

CREATE TABLE "CustomerTag" (
    "customerId" TEXT NOT NULL,
    "tagValue" TEXT NOT NULL,
    CONSTRAINT "CustomerTag_pkey" PRIMARY KEY ("customerId", "tagValue"),
    CONSTRAINT "CustomerTag_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

UPDATE "ConfigOption" SET "label" = '低意向' WHERE "category" = 'customer_grade' AND "value" = 'NONE';

INSERT INTO "ConfigOption" ("id", "category", "value", "label", "sortOrder", "color", "enabled") VALUES
  ('cfg-tag-key', 'customer_tag', 'TAG_KEY_ACCOUNT', '重点客户', 1, '#2563eb', 1),
  ('cfg-tag-strategic', 'customer_tag', 'TAG_STRATEGIC', '战略客户', 2, '#7c3aed', 1),
  ('cfg-tag-risk', 'customer_tag', 'TAG_RISK', '风险关注', 3, '#dc2626', 1);
