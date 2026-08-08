import { AlertCircle, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-card-border bg-card p-8 shadow-2xl text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-500/15 text-amber-500">
          <AlertCircle size={28} />
        </div>
        <h1 className="mt-5 font-display text-2xl font-bold text-foreground sm:text-3xl">
          404 Page Not Found
        </h1>
        <p className="mt-2 text-xs text-muted-foreground leading-relaxed sm:text-sm">
          The requested path could not be found. Goal & Time Tracker operates offline and stores all your data right in your browser.
        </p>

        <a
          href="/"
          className="mt-6 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"
          data-testid="button-back-home"
        >
          <ArrowLeft size={16} /> Return to Goal Tracker
        </a>
      </div>
    </div>
  );
}
