CREATE TABLE "ReportAnnotation" (
  "userId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "department" TEXT NOT NULL DEFAULT '',
  "office" TEXT NOT NULL DEFAULT '',
  "plannedDate" DATE,
  "bankCode" TEXT NOT NULL DEFAULT '',
  "branchCode" TEXT NOT NULL DEFAULT '',
  "bankAccountType" TEXT NOT NULL DEFAULT '',
  "bankAccountNumber" TEXT NOT NULL DEFAULT '',
  "bankAccountHolder" TEXT NOT NULL DEFAULT '',
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReportAnnotation_pkey" PRIMARY KEY ("userId", "targetType", "targetId"),
  CONSTRAINT "ReportAnnotation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "ReportAnnotation_type_check" CHECK ("targetType" IN ('INVOICE','EXPENSE','CLAIM','ASSET','JOURNAL')),
  CONSTRAINT "ReportAnnotation_label_check" CHECK (length("department") <= 60 AND length("office") <= 60),
  CONSTRAINT "ReportAnnotation_bank_check" CHECK (
    ("bankCode" = '' AND "branchCode" = '' AND "bankAccountType" = '' AND "bankAccountNumber" = '' AND "bankAccountHolder" = '')
    OR ("targetType" IN ('EXPENSE','CLAIM') AND "bankCode" ~ '^[0-9]{4}$' AND "branchCode" ~ '^[0-9]{3}$'
    AND "bankAccountType" IN ('1','2') AND "bankAccountNumber" ~ '^[0-9]{7}$' AND length("bankAccountHolder") BETWEEN 1 AND 30)
  )
);
CREATE INDEX "ReportAnnotation_userId_department_office_idx" ON "ReportAnnotation"("userId", "department", "office");
