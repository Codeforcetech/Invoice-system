import { requireUser } from "@/lib/auth/require-user";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { MobileAppHeader } from "@/components/app-shell/mobile-app-header";

export default async function AppLayout(props: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen bg-slate-100/80">
      <div className="mx-auto flex w-full max-w-7xl gap-8 px-4 py-6 md:px-6 md:py-8">
        <AppSidebar email={user.email} showAdmin={user.role === "ADMIN"} />

        <main className="min-w-0 flex-1 overflow-x-hidden">
          <MobileAppHeader />
          <div className="mx-auto w-full min-w-0 max-w-7xl">{props.children}</div>
        </main>
      </div>
    </div>
  );
}
