import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export function AuthShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-12">
        <section className="rounded-2xl border border-white/[0.08] bg-[#111722] p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <div className="mt-6">{children}</div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
