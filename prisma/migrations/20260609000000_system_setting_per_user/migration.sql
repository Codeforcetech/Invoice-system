-- SystemSetting をユーザーごとに分離（singleton 廃止）

ALTER TABLE "SystemSetting" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "SystemSetting" ADD COLUMN "userId" TEXT;

-- 既存 singleton の内容を各ユーザー用の行として複製
INSERT INTO "SystemSetting" (
  "id",
  "userId",
  "companyName",
  "invoiceRegistrationNumber",
  "postalCode",
  "address",
  "phone",
  "email",
  "contactPerson",
  "stampImageUrl",
  "bankName",
  "branchName",
  "accountType",
  "accountNumber",
  "accountHolder",
  "accountHolderKana",
  "transferNote",
  "taxRate",
  "createdAt",
  "updatedAt"
)
SELECT
  'ss_' || u."id",
  u."id",
  COALESCE(s."companyName", '未設定'),
  s."invoiceRegistrationNumber",
  s."postalCode",
  s."address",
  s."phone",
  s."email",
  s."contactPerson",
  s."stampImageUrl",
  s."bankName",
  s."branchName",
  s."accountType",
  s."accountNumber",
  s."accountHolder",
  s."accountHolderKana",
  s."transferNote",
  COALESCE(s."taxRate", 1000),
  NOW(),
  NOW()
FROM "User" u
LEFT JOIN "SystemSetting" s ON s."id" = 'singleton'
WHERE NOT EXISTS (
  SELECT 1 FROM "SystemSetting" ss WHERE ss."userId" = u."id"
);

-- 旧 singleton 行を削除
DELETE FROM "SystemSetting" WHERE "userId" IS NULL;

ALTER TABLE "SystemSetting" ALTER COLUMN "userId" SET NOT NULL;

CREATE UNIQUE INDEX "SystemSetting_userId_key" ON "SystemSetting"("userId");

ALTER TABLE "SystemSetting"
  ADD CONSTRAINT "SystemSetting_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
