import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { MobileAppHeader } from "@/components/app-shell/mobile-app-header";
export default async function AppLayout(props: { children: React.ReactNode }) {
  const user = await requireUser();
  const unreadNotifications = await prisma.appNotification.count({
    where: { userId: user.id, readAt: null },
  });
  return (
    <div className="app-workspace min-h-screen bg-[#f5f7f9] text-slate-800">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3"
      >
        本文へ移動
      </a>
      <AppSidebar email={user.email} showAdmin={user.role === "ADMIN"} />
      <div className="min-w-0 lg:pl-[232px]">
        <MobileAppHeader
          email={user.email}
          showAdmin={user.role === "ADMIN"}
          unreadNotifications={unreadNotifications}
        />
        <main id="main-content" className="min-w-0">
          {props.children}
        </main>
      </div>
    </div>
  );
}
