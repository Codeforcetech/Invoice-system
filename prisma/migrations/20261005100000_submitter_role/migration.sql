-- 業務委託メンバー向けの最小の役割「SUBMITTER（提出者）」を追加する。
-- 提出者は、自分の請求書・領収書を提出することだけができ、事業所の他のデータは見えない。
ALTER TABLE "WorkspaceMember" DROP CONSTRAINT "WorkspaceMember_role_check";
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_role_check"
  CHECK ("role" IN ('SUBMITTER', 'VIEWER', 'EDITOR', 'APPROVER', 'ADMIN'));
