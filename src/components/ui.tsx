import * as React from "react";
import { cn } from "../lib/utils";

export function Button({ className, variant = "default", size = "md", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "secondary" | "ghost" | "destructive" | "outline"; size?: "sm" | "md" | "icon" }) {
  return (
    <button
      className={cn(
        "focus-ring inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-50",
        size === "sm" && "h-8 px-2.5 text-xs",
        size === "md" && "h-9 px-3 text-sm",
        size === "icon" && "h-9 w-9",
        variant === "default" && "bg-primary text-primary-foreground shadow-sm hover:-translate-y-px hover:brightness-105 hover:shadow-md",
        variant === "secondary" && "border border-border/70 bg-secondary text-secondary-foreground shadow-sm hover:-translate-y-px hover:bg-secondary/80 hover:shadow-md",
        variant === "ghost" && "hover:bg-muted/80",
        variant === "outline" && "border bg-card shadow-sm hover:-translate-y-px hover:bg-muted/60 hover:shadow-md",
        variant === "destructive" && "bg-destructive text-destructive-foreground shadow-sm hover:-translate-y-px hover:brightness-105 hover:shadow-md",
        className
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("focus-ring h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm transition-colors placeholder:text-muted-foreground/70 hover:border-ring/40 disabled:opacity-60", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("focus-ring min-h-20 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground/70 hover:border-ring/40 disabled:opacity-60", className)} {...props} />;
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn("focus-ring h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm transition-colors hover:border-ring/40 disabled:opacity-60", className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-xs font-semibold text-muted-foreground", className)} {...props} />;
}

export function Field({ label, error, children, className }: { label: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function Panel({ title, description, action, children, className }: { title?: string; description?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("overflow-hidden rounded-lg border border-border/80 bg-card/95 text-card-foreground shadow-panel backdrop-blur-sm", className)}>
      {(title || description || action) && (
        <div className="flex items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
          <div>
            {title ? <h2 className="text-sm font-semibold tracking-tight">{title}</h2> : null}
            {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
          </div>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Badge({ className, tone = "default", ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: "default" | "success" | "warning" | "danger" | "muted" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold",
        tone === "default" && "border-accent/70 bg-accent text-accent-foreground",
        tone === "success" && "border-emerald-300/70 bg-emerald-100 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-500/20 dark:text-emerald-100",
        tone === "warning" && "border-amber-300/80 bg-amber-100 text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/20 dark:text-amber-100",
        tone === "danger" && "border-red-300/70 bg-red-100 text-red-900 dark:border-red-400/30 dark:bg-red-500/20 dark:text-red-100",
        tone === "muted" && "border-border/80 bg-muted/70 text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/35 px-4 py-8 text-center shadow-inner">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{body}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (value: T) => void; items: Array<{ value: T; label: string }> }) {
  return (
    <div className="inline-flex rounded-md border bg-muted/80 p-1 shadow-inner">
      {items.map((item) => (
        <button
          key={item.value}
          className={cn("focus-ring rounded px-3 py-1.5 text-sm font-medium transition-all", value === item.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/60 hover:text-foreground")}
          onClick={() => onChange(item.value)}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-lg border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="max-h-[calc(90vh-56px)] overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}
