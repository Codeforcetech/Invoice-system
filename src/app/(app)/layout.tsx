import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { hasRole, roleLabel } from "@/lib/workspace/access";
import { workspaceOf } from "@/lib/auth/require-workspace";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { MobileAppHeader } from "@/components/app-shell/mobile-app-header";
import { NavigationProgress } from "@/components/app-shell/navigation-progress";
export default async function AppLayout(props: { children: React.ReactNode }) {
  const user = await requireUser();
  // 未読件数と事業所の確認は、互いに待たずに同時に行う。
  const [unreadNotifications, ws] = await Promise.all([
    prisma.appNotification.count({ where: { userId: user.id, readAt: null } }),
    workspaceOf(user.id),
  ]);
  const canEdit = hasRole(ws.role, "EDITOR");
  const submitter = ws.role === "SUBMITTER";
  const memberRole = ws.isOwner ? undefined : roleLabel[ws.role];
  return (
    <div className="app-workspace min-h-screen bg-background text-slate-800">
      <NavigationProgress />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3"
      >
        本文へ移動
      </a>
      <AppSidebar
        email={user.email}
        showAdmin={user.role === "ADMIN" && !submitter}
        canEdit={canEdit}
        submitter={submitter}
        memberRole={memberRole}
      />
      <div className="min-w-0 lg:pl-[232px]">
        <MobileAppHeader
          email={user.email}
          showAdmin={user.role === "ADMIN" && !submitter}
          canEdit={canEdit}
          submitter={submitter}
          memberRole={memberRole}
          unreadNotifications={unreadNotifications}
        />
        <main id="main-content" className="min-w-0">
          {props.children}
        </main>
      </div>
    </div>
  );
}
