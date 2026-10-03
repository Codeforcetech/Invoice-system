-- Align the foreign key with schema.prisma (it was created without ON UPDATE CASCADE).
-- No data changes; the table only references "User" by id, which never changes.
ALTER TABLE "ReportAnnotation" DROP CONSTRAINT "ReportAnnotation_userId_fkey";
ALTER TABLE "ReportAnnotation" ADD CONSTRAINT "ReportAnnotation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
