import * as React from "react";
import {
  AlertTriangle,
  Archive,
  Barcode,
  Bluetooth,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Copy,
  Database,
  Download,
  FileText,
  FlaskConical,
  FolderOpen,
  Gauge,
  Home,
  Keyboard,
  LayoutGrid,
  Leaf,
  Link2,
  Moon,
  Package,
  Plus,
  Printer,
  RefreshCcw,
  Save,
  Search,
  Settings,
  Sprout,
  Sun,
  Trash2,
  Undo2,
  Upload,
  Users,
  Wheat
} from "lucide-react";
import QRCode from "qrcode";
import { createFreshData, createSeedData } from "./data/seedData";
import { buildAutoPlantingPlan, getSeedBackedCrops, reserveSeedInventoryForCandidates } from "./domain/autoPlanner";
import { checkCompatibility } from "./domain/compatibility";
import { planDates } from "./domain/datePlanning";
import { diagnosticDisclaimer, runDiagnostic } from "./domain/diagnostics";
import { autoArrangeEnvironmentLayouts, defaultEnvironmentAssumptions, defaultRootDepthIn, estimateEnvironmentUsableArea, estimateUnitPlantSlots, fitEnvironmentLayoutsByDimensions, getEnvironmentLayout } from "./domain/layout";
import { generateRecommendations } from "./domain/recommendations";
import { createRestorePoint } from "./domain/restore";
import { generateSuppliesForPlanting } from "./domain/supplies";
import { generateTasksForPlanting } from "./domain/tasks";
import { cropSchema, diagnosticCaseFormSchema, expenseSchema, farmSchema, harvestSchema, inventoryLotSchema, plantingSchema, safeParseJsonBackup, taskSchema } from "./domain/validators";
import {
  exportBackup,
  exportCsvFile,
  exportSyncPackageFile,
  fetchWebImport,
  checkUpdateManifest,
  getAppStatus,
  importBackupText,
  loadSnapshot,
  openBluetoothSettings,
  openBluetoothTransfer,
  revealLocalFile,
  savePhotoAsset,
  saveSnapshot,
  type UpdateCheckResult,
  type WebImportResult
} from "./storage/repository";
import type {
  AppData,
  AppStatus,
  BackupRecord,
  BedOrUnit,
  Crop,
  ExpenseLog,
  DiagnosticCase,
  Environment,
  Farm,
  GrowingArea,
  HarvestLog,
  InventoryLot,
  Planting,
  Recommendation,
  RestorePoint,
  SupplyItem,
  Task
} from "./domain/types";
import { Badge, Button, EmptyState, Field, Input, Modal, Panel, Select, Tabs, Textarea } from "./components/ui";
import { addDaysIso, downloadTextFile, formatCurrency, formatNumber, id, titleCase, todayIso } from "./lib/utils";
import { parseCsv, toCsv } from "./domain/csv";

const GrowOpsModule = React.lazy(() => import("./features/growops/GrowOpsModule").then((module) => ({ default: module.GrowOpsModule })));

type Page =
  | "dashboard"
  | "growops"
  | "workspaces"
  | "environments"
  | "crops"
  | "planning"
  | "tasks"
  | "supplies"
  | "harvest"
  | "diagnostics"
  | "compatibility"
  | "webImport"
  | "collaboration"
  | "traceability"
  | "labels"
  | "recommendations"
  | "data"
  | "settings";

const navItems: Array<{ page: Page; label: string; icon: React.ElementType }> = [
  { page: "dashboard", label: "Dashboard", icon: Home },
  { page: "growops", label: "GrowOps", icon: Sprout },
  { page: "workspaces", label: "Workspaces", icon: FolderOpen },
  { page: "environments", label: "Environments", icon: LayoutGrid },
  { page: "crops", label: "Crop Library", icon: Leaf },
  { page: "planning", label: "Crop Planning", icon: CalendarDays },
  { page: "tasks", label: "Tasks", icon: ClipboardList },
  { page: "supplies", label: "Seed & Supply", icon: Package },
  { page: "harvest", label: "Harvest", icon: Wheat },
  { page: "diagnostics", label: "Diagnostics", icon: FlaskConical },
  { page: "compatibility", label: "Compatibility", icon: Gauge },
  { page: "webImport", label: "Web Import", icon: Download },
  { page: "collaboration", label: "Collaboration", icon: Users },
  { page: "traceability", label: "Traceability", icon: Link2 },
  { page: "labels", label: "Labels", icon: Barcode },
  { page: "recommendations", label: "Recommendations", icon: AlertTriangle },
  { page: "data", label: "Data", icon: Database },
  { page: "settings", label: "Settings", icon: Settings }
];

const multiOptions = {
  affectedParts: ["new leaves", "older leaves", "stems", "roots", "flowers", "fruit", "whole plant"],
  symptomTypes: ["chlorosis", "interveinal chlorosis", "necrosis", "spots", "wilting", "distortion", "marginal scorch", "stunting"],
  recentActions: ["transplanted", "missed_irrigation", "heavy_pruning", "fertilizer_change", "pesticide_application", "heat_event", "reservoir_change"]
};

const APP_ARTWORK = "/artwork/growops-operations-art.png";
const APP_ICON = "/branding/growops-app-icon.png";

export function App() {
  const [data, setData] = React.useState<AppData | null>(null);
  const [status, setStatus] = React.useState<AppStatus | null>(null);
  const [page, setPage] = React.useState<Page>("dashboard");
  const [search, setSearch] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [undoSnapshot, setUndoSnapshot] = React.useState<{ data: AppData; message: string } | null>(null);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([loadSnapshot(), getAppStatus()])
      .then(([snapshot, appStatus]) => {
        if (cancelled) return;
        const withRecommendations = { ...snapshot, recommendations: generateRecommendations(snapshot, snapshot.appSettings.activeFarmId) };
        setData(withRecommendations);
        setStatus(appStatus);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!data || !loaded) return;
    document.documentElement.classList.toggle("dark", data.appSettings.theme === "dark");
    const timer = window.setTimeout(() => {
      setSaving(true);
      saveSnapshot(data)
        .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
        .finally(() => setSaving(false));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [data, loaded]);

  const updateData = React.useCallback((updater: (current: AppData) => AppData, message?: string) => {
    setData((current) => {
      if (!current) return current;
      let next = updater(current);
      if (message && isUndoableMessage(message)) {
        setUndoSnapshot({ data: current, message });
        const restorePoint = createRestorePoint(current, message);
        next = {
          ...next,
          appSettings: {
            ...next.appSettings,
            restorePoints: [restorePoint, ...(current.appSettings.restorePoints ?? [])].slice(0, 24)
          }
        };
      }
      return { ...next, recommendations: generateRecommendations(next, next.appSettings.activeFarmId) };
    });
    if (message) setToast(message);
  }, []);

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && undoSnapshot) {
        event.preventDefault();
        setData(undoSnapshot.data);
        setToast(`Undid: ${undoSnapshot.message}`);
        setUndoSnapshot(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undoSnapshot]);

  React.useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Panel>
          <div className="flex items-center gap-3">
            <Sprout className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold">Loading GrowOps Planner</p>
              <p className="text-sm text-muted-foreground">{error ?? "Opening local workspace and SQLite store..."}</p>
            </div>
          </div>
        </Panel>
      </main>
    );
  }

  const activeFarm = data.farms.find((farm) => farm.id === data.appSettings.activeFarmId) ?? data.farms[0];
  const farmId = activeFarm.id;
  const pageTitle = navItems.find((item) => item.page === page)?.label ?? "GrowOps Planner";

  return (
    <div className="app-shell flex h-[100dvh] flex-col overflow-hidden bg-background xl:flex-row">
      <aside className="shell-sidebar flex w-full shrink-0 flex-col border-b border-border/80 shadow-subtle xl:w-64 xl:border-b-0 xl:border-r">
        <div className="border-b border-border/80 px-4 py-3 xl:py-4">
          <div className="flex items-center gap-2">
            <div className="brand-mark flex h-9 w-9 items-center justify-center overflow-hidden rounded-md text-primary-foreground shadow-sm">
              <img src={APP_ICON} alt="" className="h-full w-full object-cover" />
            </div>
            <div>
              <h1 className="text-sm font-semibold">GrowOps Planner</h1>
              <p className="text-xs text-muted-foreground">Offline farm ops</p>
            </div>
          </div>
          <Select
            className="mt-3 xl:mt-4"
            value={farmId}
            onChange={(event) =>
              updateData(
                (current) => ({
                  ...current,
                  appSettings: { ...current.appSettings, activeFarmId: event.target.value }
                }),
                "Workspace switched"
              )
            }
          >
            {data.farms.map((farm) => (
              <option key={farm.id} value={farm.id}>
                {farm.name}
              </option>
            ))}
          </Select>
        </div>
        <nav className="scrollbar-thin flex max-h-28 flex-row gap-1 overflow-auto p-2 xl:max-h-none xl:flex-1 xl:flex-col">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.page}
                type="button"
                onClick={() => setPage(item.page)}
                className={`focus-ring flex min-w-max items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-all xl:w-full xl:min-w-0 ${page === item.page ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"}`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="hidden border-t border-border/80 p-3 text-xs text-muted-foreground xl:block">
          <div className="flex items-center justify-between">
            <span>{saving ? "Saving..." : "Saved locally"}</span>
            <Button
              size="icon"
              variant="ghost"
              title="Toggle theme"
              onClick={() =>
                updateData((current) => ({
                  ...current,
                  appSettings: { ...current.appSettings, theme: current.appSettings.theme === "dark" ? "light" : "dark" }
                }))
              }
            >
              {data.appSettings.theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="topbar flex flex-col items-stretch justify-between gap-3 border-b border-border/80 px-4 py-3 shadow-sm xl:flex-row xl:items-center xl:px-5">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{pageTitle}</h2>
            <p className="text-sm text-muted-foreground">{activeFarm.name} · {activeFarm.location || "Local workspace"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1 xl:flex-none">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="w-full pl-8 xl:w-72" placeholder="Search current workspace" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <Button
              variant="secondary"
              title="Command palette (Ctrl+K)"
              onClick={() => setPaletteOpen(true)}
            >
              <Keyboard className="h-4 w-4" />
              Commands
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                exportBackup(data)
                  .then((path) => {
                    updateData((current) => ({ ...current, appSettings: { ...current.appSettings, lastBackupAt: new Date().toISOString() } }), "Backup exported");
                    setToast(path);
                  })
                  .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
              }
            >
              <Download className="h-4 w-4" />
              Backup
            </Button>
          </div>
        </header>

        <section className="scrollbar-thin flex-1 overflow-auto p-3 sm:p-4 lg:p-6">
          {error ? (
            <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
              <Button className="ml-3" size="sm" variant="ghost" onClick={() => setError(null)}>
                Dismiss
              </Button>
            </div>
          ) : null}
          {toast ? (
            <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-md border bg-card px-4 py-3 text-sm shadow-panel">
              <span>{toast}</span>
              {undoSnapshot ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setData(undoSnapshot.data);
                    setToast(`Undid: ${undoSnapshot.message}`);
                    setUndoSnapshot(null);
                  }}
                >
                  <Undo2 className="h-4 w-4" />
                  Undo
                </Button>
              ) : null}
            </div>
          ) : null}
          {page === "dashboard" && <Dashboard data={data} farm={activeFarm} setPage={setPage} updateData={updateData} />}
          {page === "growops" && (
            <React.Suspense fallback={<Panel><div className="text-sm text-muted-foreground">Loading GrowOps module...</div></Panel>}>
              <GrowOpsModule data={data} farm={activeFarm} status={status} updateData={updateData} setError={setError} />
            </React.Suspense>
          )}
          {page === "workspaces" && <WorkspacesPage data={data} activeFarm={activeFarm} updateData={updateData} />}
          {page === "environments" && <EnvironmentPage data={data} farmId={farmId} search={search} updateData={updateData} />}
          {page === "crops" && <CropsPage data={data} farmId={farmId} search={search} updateData={updateData} />}
          {page === "planning" && <PlanningPage data={data} farm={activeFarm} search={search} updateData={updateData} />}
          {page === "tasks" && <TasksPage data={data} farmId={farmId} search={search} updateData={updateData} />}
          {page === "supplies" && <SuppliesPage data={data} farmId={farmId} search={search} updateData={updateData} />}
          {page === "harvest" && <HarvestPage data={data} farm={activeFarm} search={search} updateData={updateData} />}
          {page === "diagnostics" && <DiagnosticsPage data={data} farmId={farmId} updateData={updateData} />}
          {page === "compatibility" && <CompatibilityPage data={data} farm={activeFarm} />}
          {page === "webImport" && <WebImportPage data={data} farm={activeFarm} updateData={updateData} setError={setError} />}
          {page === "collaboration" && <CollaborationPage data={data} farm={activeFarm} updateData={updateData} setData={setData} setError={setError} />}
          {page === "traceability" && <TraceabilityPage data={data} farm={activeFarm} />}
          {page === "labels" && <LabelsPage data={data} farm={activeFarm} />}
          {page === "recommendations" && <RecommendationsPage data={data} farmId={farmId} updateData={updateData} />}
          {page === "data" && <DataPage data={data} status={status} farm={activeFarm} updateData={updateData} setData={setData} setError={setError} />}
          {page === "settings" && <SettingsPage data={data} status={status} activeFarm={activeFarm} updateData={updateData} />}
        </section>
      </main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} setPage={setPage} data={data} farm={activeFarm} updateData={updateData} />
    </div>
  );
}

function Dashboard({ data, farm, setPage, updateData }: { data: AppData; farm: Farm; setPage: (page: Page) => void; updateData: (updater: (current: AppData) => AppData, message?: string) => void }) {
  const farmId = farm.id;
  const today = todayIso();
  const tasks = data.tasks.filter((task) => task.farmId === farmId);
  const openTasks = tasks.filter((task) => task.status !== "done" && task.status !== "skipped");
  const overdue = openTasks.filter((task) => task.dueDate < today);
  const todayTasks = openTasks.filter((task) => task.dueDate === today);
  const plantings = data.plantings.filter((planting) => planting.farmId === farmId);
  const upcomingPlantings = plantings.filter((planting) => planting.seedDate >= today).slice(0, 5);
  const harvests = data.harvestLogs.filter((harvest) => harvest.farmId === farmId);
  const totalRevenue = harvests.reduce((sum, harvest) => sum + harvest.revenue, 0);
  const projectedRevenue = plantings.reduce((sum, planting) => sum + planting.expectedRevenue, 0);
  const activeDiagnostics = data.diagnosticCases.filter((item) => item.farmId === farmId && item.status !== "resolved");
  const capacity = data.bedOrUnits.filter((unit) => unit.farmId === farmId).reduce((sum, unit) => sum + unit.lengthFt * unit.widthFt, 0);
  const usedArea = plantings.filter((planting) => planting.status !== "finished").reduce((sum, planting) => sum + planting.areaSqFt, 0);
  const utilization = capacity ? Math.min(100, (usedArea / capacity) * 100) : 0;
  const setupGoals = [
    { label: "Farm profile", done: Boolean(farm.name && farm.seasonStart && farm.seasonEnd), page: "workspaces" as Page },
    { label: "Seed inventory", done: data.inventoryLots.some((lot) => lot.farmId === farmId && lot.itemType === "seed"), page: "supplies" as Page },
    { label: "Growing spaces", done: data.environments.some((env) => env.farmId === farmId) && data.bedOrUnits.some((unit) => unit.farmId === farmId), page: "environments" as Page },
    { label: "First plan", done: plantings.length > 0, page: "planning" as Page },
    { label: "Backup habit", done: Boolean(data.appSettings.lastBackupAt), page: "data" as Page }
  ];
  const incompleteGoals = setupGoals.filter((goal) => !goal.done);
  const nextActions = data.recommendations.filter((item) => item.farmId === farmId).slice(0, 3);

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-lg border border-border/80 bg-card shadow-panel">
        <img src={APP_ARTWORK} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-card via-card/90 to-card/20 dark:from-card dark:via-card/92 dark:to-card/35" />
        <div className="relative grid min-h-[218px] gap-5 p-5 md:grid-cols-[1fr_260px] md:p-6">
          <div className="flex max-w-2xl flex-col justify-center">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone="success">Local workspace</Badge>
              <Badge tone="muted">{farm.climateZone || "Climate zone unset"}</Badge>
            </div>
            <h3 className="text-2xl font-semibold tracking-tight md:text-3xl">{farm.name}</h3>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              {farm.seasonStart} to {farm.seasonEnd} · {openTasks.length} open tasks · {plantings.length} planned plantings
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setPage("planning")}><Plus className="h-4 w-4" />Planting</Button>
              <Button size="sm" variant="secondary" onClick={() => setPage("environments")}><LayoutGrid className="h-4 w-4" />Map space</Button>
              <Button size="sm" variant="secondary" onClick={() => setPage("diagnostics")}><FlaskConical className="h-4 w-4" />Diagnostic</Button>
            </div>
          </div>
          <div className="hidden rounded-lg border bg-card/80 p-4 shadow-subtle backdrop-blur-sm md:block">
            <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Season snapshot</p>
            <div className="mt-4 space-y-3">
              <HeroStat label="Projected" value={formatCurrency(projectedRevenue, farm.currency)} />
              <HeroStat label="Logged" value={formatCurrency(totalRevenue, farm.currency)} />
              <HeroStat label="Utilization" value={`${formatNumber(utilization, 0)}%`} />
            </div>
          </div>
        </div>
      </div>

      {incompleteGoals.length || !data.appSettings.onboardingComplete ? (
        <Panel
          title="First-Run Setup"
          description="Finish these local setup goals once, then GrowOps can calculate more of the plan for you."
          action={<Button size="sm" variant="secondary" onClick={() => updateData((current) => ({ ...current, appSettings: { ...current.appSettings, onboardingComplete: true } }), "Setup marked complete")}>Mark complete</Button>}
        >
          <div className="grid gap-2 md:grid-cols-5">
            {setupGoals.map((goal) => (
              <button key={goal.label} type="button" className="focus-ring rounded-md border p-3 text-left hover:bg-muted" onClick={() => setPage(goal.page)}>
                <Badge tone={goal.done ? "success" : "warning"}>{goal.done ? "Done" : "Next"}</Badge>
                <p className="mt-2 text-sm font-medium">{goal.label}</p>
              </button>
            ))}
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric title="Today's tasks" value={todayTasks.length} detail={`${overdue.length} overdue`} tone={overdue.length ? "danger" : "success"} />
        <Metric title="Projected revenue" value={formatCurrency(projectedRevenue, farm.currency)} detail={`${formatCurrency(totalRevenue, farm.currency)} logged`} />
        <Metric title="Space utilization" value={`${formatNumber(utilization, 0)}%`} detail={`${formatNumber(usedArea)} of ${formatNumber(capacity)} sq ft`} />
        <Metric title="Active diagnostics" value={activeDiagnostics.length} detail="offline rule engine" tone={activeDiagnostics.length ? "warning" : "success"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1fr_0.8fr]">
        <Panel title="What Should I Do Next?" description="Assistant-style local recommendations from your plan, inventory, tasks, diagnostics, and spaces.">
          <div className="space-y-3">
            {nextActions.length ? nextActions.map((rec) => (
              <div key={rec.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{rec.title}</p>
                  <PriorityBadge priority={rec.priority} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{rec.explanation}</p>
                <p className="mt-2 text-sm">{rec.suggestedAction}</p>
              </div>
            )) : <EmptyState title="No urgent next steps" body="Refresh recommendations after changing plans, inventory, or environments." />}
          </div>
        </Panel>
        <Panel
          title="Today"
          description="Open work due today and quick actions."
          action={
            <Button size="sm" onClick={() => setPage("tasks")}>
              Open tasks
            </Button>
          }
        >
          <TaskMiniList tasks={[...overdue, ...todayTasks].slice(0, 8)} data={data} />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setPage("planning")}>
              <Plus className="h-4 w-4" />
              Planting
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setPage("diagnostics")}>
              <FlaskConical className="h-4 w-4" />
              Diagnostic
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setPage("harvest")}>
              <Wheat className="h-4 w-4" />
              Harvest
            </Button>
          </div>
        </Panel>

        <Panel
          title="Alerts"
          description="Compatibility, labor, environment, and diagnostic recommendations."
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => updateData((current) => ({ ...current, recommendations: generateRecommendations(current, farmId) }), "Recommendations refreshed")}
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
          }
        >
          <div className="space-y-3">
            {data.recommendations.filter((item) => item.farmId === farmId).slice(0, 6).map((rec) => (
              <div key={rec.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{rec.title}</p>
                  <PriorityBadge priority={rec.priority} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{rec.suggestedAction}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Upcoming Plantings">
          {upcomingPlantings.length ? <PlantingTable plantings={upcomingPlantings} data={data} compact /> : <EmptyState title="No upcoming plantings" body="Add a succession or future crop plan from Crop Planning." />}
        </Panel>
        <Panel title="Harvest Snapshot">
          <HarvestSummary data={data} farm={farm} />
        </Panel>
      </div>
    </div>
  );
}

function CommandPalette({ open, onClose, setPage, data, farm, updateData }: { open: boolean; onClose: () => void; setPage: (page: Page) => void; data: AppData; farm: Farm; updateData: (updater: (current: AppData) => AppData, message?: string) => void }) {
  const [query, setQuery] = React.useState("");
  const commands: Array<{ label: string; detail: string; run: () => void }> = [
    ...navItems.map((item) => ({ label: `Open ${item.label}`, detail: "Navigation", run: () => setPage(item.page) })),
    { label: "New task", detail: "Go to Tasks", run: () => setPage("tasks") },
    { label: "Log harvest", detail: "Go to Harvest", run: () => setPage("harvest") },
    { label: "Run diagnostic", detail: "Go to Diagnostics", run: () => setPage("diagnostics") },
    { label: "Print task sheet", detail: "Printable report", run: () => printReport("Task Sheet", buildTaskReportHtml(data, farm)) },
    { label: "Export calendar ICS", detail: "Tasks and planting dates", run: () => exportIcs(data, farm.id) },
    {
      label: "Fresh start",
      detail: "Reset to clean workspace",
      run: () => updateData(() => createFreshData(), "Fresh start created")
    }
  ].filter((command) => matches(command.label + command.detail, query));

  React.useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  return (
    <Modal title="Command Palette" open={open} onClose={onClose}>
      <div className="space-y-3">
        <Input autoFocus placeholder="Search commands or pages" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="max-h-[55vh] overflow-auto rounded-md border">
          {commands.map((command) => (
            <button
              key={`${command.label}-${command.detail}`}
              type="button"
              className="focus-ring flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted"
              onClick={() => {
                command.run();
                onClose();
              }}
            >
              <span className="font-medium">{command.label}</span>
              <span className="text-xs text-muted-foreground">{command.detail}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Shortcuts: Ctrl+K opens commands. Ctrl+Z restores the last destructive action when available.</p>
      </div>
    </Modal>
  );
}

function WorkspacesPage({ data, activeFarm, updateData }: { data: AppData; activeFarm: Farm; updateData: (updater: (current: AppData) => AppData, message?: string) => void }) {
  const [editing, setEditing] = React.useState<Farm | null>(activeFarm);

  function submitFarm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = farmSchema.parse({
      name: form.get("name"),
      location: form.get("location"),
      climateZone: form.get("climateZone"),
      firstFrostDate: form.get("firstFrostDate"),
      lastFrostDate: form.get("lastFrostDate"),
      seasonStart: form.get("seasonStart"),
      seasonEnd: form.get("seasonEnd"),
      currency: form.get("currency"),
      measurementUnits: form.get("measurementUnits"),
      productionStyleTags: String(form.get("productionStyleTags") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      notes: form.get("notes")
    });
    const timestamp = new Date().toISOString();
    const farm: Farm = {
      ...(editing ?? {
        id: id("farm"),
        createdAt: timestamp
      }),
      ...parsed,
      updatedAt: timestamp
    };
    updateData(
      (current) => ({
        ...current,
        farms: current.farms.some((item) => item.id === farm.id) ? current.farms.map((item) => (item.id === farm.id ? farm : item)) : [...current.farms, farm],
        appSettings: { ...current.appSettings, activeFarmId: farm.id, onboardingComplete: true }
      }),
      "Workspace saved"
    );
    setEditing(farm);
  }

  function duplicateFarm(farm: Farm) {
    const newFarmId = id("farm");
    const timestamp = new Date().toISOString();
    const cloneIds = new Map<string, string>();
    const cloneId = (oldId: string, prefix: string) => {
      if (!cloneIds.has(oldId)) cloneIds.set(oldId, id(prefix));
      return cloneIds.get(oldId)!;
    };
    updateData((current) => {
      const nextFarm = { ...farm, id: newFarmId, name: `${farm.name} Copy`, createdAt: timestamp, updatedAt: timestamp };
      const environments = current.environments
        .filter((item) => item.farmId === farm.id)
        .map((item) => ({ ...item, id: cloneId(item.id, "env"), farmId: newFarmId, createdAt: timestamp, updatedAt: timestamp }));
      const areas = current.growingAreas
        .filter((item) => item.farmId === farm.id)
        .map((item) => ({ ...item, id: cloneId(item.id, "area"), farmId: newFarmId, environmentId: cloneId(item.environmentId, "env"), createdAt: timestamp, updatedAt: timestamp }));
      const units = current.bedOrUnits
        .filter((item) => item.farmId === farm.id)
        .map((item) => ({ ...item, id: cloneId(item.id, "unit"), farmId: newFarmId, environmentId: cloneId(item.environmentId, "env"), growingAreaId: cloneId(item.growingAreaId, "area"), createdAt: timestamp, updatedAt: timestamp }));
      return {
        ...current,
        farms: [...current.farms, nextFarm],
        environments: [...current.environments, ...environments],
        growingAreas: [...current.growingAreas, ...areas],
        bedOrUnits: [...current.bedOrUnits, ...units],
        appSettings: { ...current.appSettings, activeFarmId: newFarmId }
      };
    }, "Workspace duplicated");
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <Panel title="Local Workspaces" description="No login is required. Each workspace is stored locally.">
        <div className="space-y-3">
          {data.farms.map((farm) => (
            <div key={farm.id} className={`rounded-md border p-3 ${farm.id === activeFarm.id ? "bg-accent/40" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{farm.name}</p>
                  <p className="text-sm text-muted-foreground">{farm.location} · {farm.climateZone}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {farm.productionStyleTags.map((tag) => (
                      <Badge key={tag} tone="muted">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="icon" variant="ghost" title="Edit" onClick={() => setEditing(farm)}>
                    <Save className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" title="Duplicate" onClick={() => duplicateFarm(farm)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <Button className="mt-4" variant="secondary" onClick={() => setEditing(null)}>
          <Plus className="h-4 w-4" />
          New workspace
        </Button>
      </Panel>

      <Panel title={editing ? "Edit Workspace" : "Create Workspace"} description="Farm profile, climate dates, units, and operating notes.">
        <form className="grid gap-4 md:grid-cols-2" onSubmit={submitFarm}>
          <Field label="Name">
            <Input name="name" defaultValue={editing?.name ?? ""} required />
          </Field>
          <Field label="Location">
            <Input name="location" defaultValue={editing?.location ?? ""} />
          </Field>
          <Field label="USDA / Climate Zone">
            <Input name="climateZone" defaultValue={editing?.climateZone ?? ""} placeholder="USDA 6b" />
          </Field>
          <Field label="Currency">
            <Input name="currency" defaultValue={editing?.currency ?? "USD"} maxLength={3} />
          </Field>
          <Field label="Last Frost">
            <Input name="lastFrostDate" type="date" defaultValue={editing?.lastFrostDate ?? "2026-04-15"} required />
          </Field>
          <Field label="First Frost">
            <Input name="firstFrostDate" type="date" defaultValue={editing?.firstFrostDate ?? "2026-10-15"} required />
          </Field>
          <Field label="Season Start">
            <Input name="seasonStart" type="date" defaultValue={editing?.seasonStart ?? "2026-03-15"} required />
          </Field>
          <Field label="Season End">
            <Input name="seasonEnd" type="date" defaultValue={editing?.seasonEnd ?? "2026-11-15"} required />
          </Field>
          <Field label="Units">
            <Select name="measurementUnits" defaultValue={editing?.measurementUnits ?? "imperial"}>
              <option value="imperial">Imperial</option>
              <option value="metric">Metric</option>
            </Select>
          </Field>
          <Field label="Production Tags">
            <Input name="productionStyleTags" defaultValue={editing?.productionStyleTags.join(", ") ?? ""} placeholder="market garden, hydroponic" />
          </Field>
          <Field className="md:col-span-2" label="Notes">
            <Textarea name="notes" defaultValue={editing?.notes ?? ""} />
          </Field>
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit">
              <Save className="h-4 w-4" />
              Save workspace
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}

function EnvironmentPage({ data, farmId, search, updateData }: { data: AppData; farmId: string; search: string; updateData: (updater: (current: AppData) => AppData, message?: string) => void }) {
  const farmEnvironments = data.environments.filter((env) => env.farmId === farmId);
  const environments = farmEnvironments.filter((env) => matches(env.name + env.type + env.notes, search));
  const [selectedId, setSelectedId] = React.useState(environments[0]?.id ?? "");
  const [selectedAreaId, setSelectedAreaId] = React.useState("");
  const [selectedUnitId, setSelectedUnitId] = React.useState("");
  const [snapToGrid, setSnapToGrid] = React.useState(true);
  const [gridStep, setGridStep] = React.useState(2);
  const selected = farmEnvironments.find((env) => env.id === selectedId) ?? environments[0] ?? farmEnvironments[0];
  const units = data.bedOrUnits.filter((unit) => unit.farmId === farmId && (!selected || unit.environmentId === selected.id));
  const selectedUnit = units.find((unit) => unit.id === selectedUnitId) ?? units[0];
  const areas = data.growingAreas.filter((area) => area.farmId === farmId && (!selected || area.environmentId === selected.id));
  const selectedArea = areas.find((area) => area.id === selectedAreaId) ?? areas[0];
  const plantings = data.plantings.filter((planting) => planting.farmId === farmId);
  const environmentPlantings = selected ? plantings.filter((planting) => planting.environmentId === selected.id && planting.status !== "finished") : [];
  const usableArea = selected ? selected.usableAreaSqFt || selected.lengthFt * selected.widthFt : 0;
  const mappedArea = units.reduce((sum, unit) => sum + unit.lengthFt * unit.widthFt, 0);
  const plantedArea = environmentPlantings.reduce((sum, planting) => sum + planting.areaSqFt, 0);
  const plantSlots = units.reduce((sum, unit) => sum + unit.capacityPlants, 0);
  const assignedPlants = environmentPlantings.reduce((sum, planting) => sum + planting.plantCount, 0);

  React.useEffect(() => {
    if (!selectedId && environments[0]) setSelectedId(environments[0].id);
  }, [environments, selectedId]);

  React.useEffect(() => {
    if (!selectedAreaId && areas[0]) setSelectedAreaId(areas[0].id);
    if (selectedAreaId && !areas.some((area) => area.id === selectedAreaId)) setSelectedAreaId(areas[0]?.id ?? "");
  }, [areas, selectedAreaId]);

  React.useEffect(() => {
    if (!selectedUnitId && units[0]) setSelectedUnitId(units[0].id);
    if (selectedUnitId && !units.some((unit) => unit.id === selectedUnitId)) setSelectedUnitId(units[0]?.id ?? "");
  }, [selectedUnitId, units]);

  function addEnvironment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const timestamp = new Date().toISOString();
    const layout = getEnvironmentLayout({ mapX: undefined, mapY: undefined, mapWidth: undefined, mapHeight: undefined } as Environment, farmEnvironments.length);
    const type = String(form.get("type")) as Environment["type"];
    const lengthFt = Number(form.get("lengthFt") || 0);
    const widthFt = Number(form.get("widthFt") || 0);
    const defaults = defaultEnvironmentAssumptions(type);
    const usableAreaInput = Number(form.get("usableAreaSqFt") || 0);
    const env: Environment = {
      id: id("env"),
      farmId,
      name: String(form.get("name") ?? ""),
      type,
      lengthFt,
      widthFt,
      usableAreaSqFt: usableAreaInput || estimateEnvironmentUsableArea(lengthFt, widthFt, type),
      mapX: layout.x,
      mapY: layout.y,
      mapWidth: layout.width,
      mapHeight: layout.height,
      layoutNotes: String(form.get("layoutNotes") ?? ""),
      assumptions: {
        lowTempF: Number(form.get("lowTempF") || defaults.lowTempF),
        highTempF: Number(form.get("highTempF") || defaults.highTempF),
        humidityPercent: Number(form.get("humidityPercent") || defaults.humidityPercent),
        lightHours: Number(form.get("lightHours") || defaults.lightHours),
        airflow: String(form.get("airflow")) as Environment["assumptions"]["airflow"],
        seasonExtensionDays: Number(form.get("seasonExtensionDays") || defaults.seasonExtensionDays)
      },
      notes: String(form.get("notes") ?? ""),
      photoAssetIds: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    updateData((current) => ({ ...current, environments: [...current.environments, env] }), "Environment added");
    setSelectedId(env.id);
    event.currentTarget.reset();
  }

  function addUnit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const timestamp = new Date().toISOString();
    const areaId = String(form.get("growingAreaId") || areas[0]?.id || "");
    const unitType = String(form.get("unitType")) as BedOrUnit["unitType"];
    const lengthFt = Number(form.get("lengthFt") || 0);
    const widthFt = Number(form.get("widthFt") || 0);
    const capacityInput = Number(form.get("capacityPlants") || 0);
    const unit: BedOrUnit = {
      id: id("unit"),
      farmId,
      environmentId: selected.id,
      growingAreaId: areaId,
      name: String(form.get("name") ?? ""),
      unitType,
      x: Number(form.get("x") || 4),
      y: Number(form.get("y") || 4),
      width: Number(form.get("width") || 20),
      height: Number(form.get("height") || 6),
      lengthFt,
      widthFt,
      capacityPlants: capacityInput || estimateUnitPlantSlots({ lengthFt, widthFt, unitType }),
      rootDepthIn: Number(form.get("rootDepthIn") || defaultRootDepthIn(unitType)),
      notes: String(form.get("notes") ?? ""),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    updateData((current) => ({ ...current, bedOrUnits: [...current.bedOrUnits, unit] }), "Unit added");
    event.currentTarget.reset();
  }

  function addArea() {
    if (!selected) return;
    const timestamp = new Date().toISOString();
    const area: GrowingArea = {
      id: id("area"),
      farmId,
      environmentId: selected.id,
      name: `Area ${areas.length + 1}`,
      kind: "bed_block",
      x: 6 + areas.length * 4,
      y: 6 + areas.length * 4,
      width: 36,
      height: 22,
      notes: "",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    updateData((current) => ({ ...current, growingAreas: [...current.growingAreas, area] }), "Growing area added");
    setSelectedAreaId(area.id);
  }

  function addBedTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const count = Math.max(1, Number(form.get("count") || 1));
    const lengthFt = Number(form.get("lengthFt") || 30);
    const widthFt = Number(form.get("widthFt") || 4);
    const startX = Number(form.get("startX") || 8);
    const startY = Number(form.get("startY") || 8);
    const mapWidth = Number(form.get("mapWidth") || 64);
    const mapHeight = Number(form.get("mapHeight") || 4);
    const gapY = Number(form.get("gapY") || 4);
    const prefix = String(form.get("prefix") || "Bed");
    const unitType = String(form.get("unitType") || "bed") as BedOrUnit["unitType"];
    const rootDepthIn = Number(form.get("rootDepthIn") || defaultRootDepthIn(unitType));
    const plantSlotsPerUnit = Number(form.get("plantSlots") || estimateUnitPlantSlots({ lengthFt, widthFt, unitType }));
    const areaId = String(form.get("growingAreaId") || areas[0]?.id || "");
    const timestamp = new Date().toISOString();
    const newUnits: BedOrUnit[] = Array.from({ length: count }, (_, index) => ({
      id: id("unit"),
      farmId,
      environmentId: selected.id,
      growingAreaId: areaId,
      name: `${prefix} ${index + 1}`,
      unitType,
      x: clampPercent(startX, 0, 96),
      y: clampPercent(startY + index * (mapHeight + gapY), 0, 96),
      width: clampPercent(mapWidth, 2, 100 - startX),
      height: clampPercent(mapHeight, 2, 100),
      lengthFt,
      widthFt,
      capacityPlants: plantSlotsPerUnit,
      rootDepthIn,
      notes: "",
      createdAt: timestamp,
      updatedAt: timestamp
    }));
    updateData((current) => ({ ...current, bedOrUnits: [...current.bedOrUnits, ...newUnits] }), `${newUnits.length} units added from template`);
    event.currentTarget.reset();
  }

  function applyEnvironmentLayouts(layouts: Record<string, { x: number; y: number; width: number; height: number }>, message: string) {
    const timestamp = new Date().toISOString();
    updateData((current) => ({
      ...current,
      environments: current.environments.map((environment) => {
        const layout = layouts[environment.id];
        return layout ? { ...environment, mapX: layout.x, mapY: layout.y, mapWidth: layout.width, mapHeight: layout.height, updatedAt: timestamp } : environment;
      })
    }), message);
  }

  return (
    <div className="space-y-5">
      <Panel
        title="Farm-Level Environment Map"
        description="Drag whole environments to arrange the farm. Resize from the bottom-right handle, then use precision fields below when exact dimensions matter."
        action={
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
              <input type="checkbox" checked={snapToGrid} onChange={(event) => setSnapToGrid(event.target.checked)} />
              Snap
            </label>
            <Select className="h-8 w-24 text-xs" value={String(gridStep)} onChange={(event) => setGridStep(Number(event.target.value) || 2)}>
              <option value="1">1%</option>
              <option value="2">2%</option>
              <option value="5">5%</option>
            </Select>
            <Button size="sm" variant="secondary" onClick={() => applyEnvironmentLayouts(autoArrangeEnvironmentLayouts(farmEnvironments), "Environment map auto-arranged")}>Auto arrange</Button>
            <Button size="sm" variant="secondary" onClick={() => applyEnvironmentLayouts(fitEnvironmentLayoutsByDimensions(farmEnvironments), "Environment map fit by dimensions")}>Fit by dimensions</Button>
          </div>
        }
      >
        {farmEnvironments.length ? (
          <FarmEnvironmentCanvas environments={farmEnvironments} data={data} selectedId={selected?.id ?? ""} setSelectedId={(idValue) => { setSelectedId(idValue); setSelectedAreaId(""); setSelectedUnitId(""); }} snapToGrid={snapToGrid} gridStep={gridStep} updateData={updateData} />
        ) : (
          <EmptyState title="No environments mapped" body="Create an environment, then drag it into position on the farm-level map." />
        )}
      </Panel>
      <div className="grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
      <div className="space-y-5">
        <Panel title="Growing Environments" action={<Button size="sm" onClick={addArea} disabled={!selected}><Plus className="h-4 w-4" />Area</Button>}>
          <div className="space-y-2">
            {environments.map((env) => (
              <div key={env.id} className={`focus-ring flex w-full items-stretch overflow-hidden rounded-md border ${selected?.id === env.id ? "bg-accent" : "hover:bg-muted"}`}>
                <button
                  type="button"
                  className="min-w-0 flex-1 p-3 text-left"
                  onClick={() => {
                    setSelectedId(env.id);
                    setSelectedAreaId("");
                    setSelectedUnitId("");
                  }}
                >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{env.name}</p>
                  <Badge tone="muted">{titleCase(env.type)}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{formatNumber(env.usableAreaSqFt, 0)} sq ft usable · airflow {env.assumptions.airflow}</p>
                </button>
                <Button
                  className="m-2 self-center"
                  size="icon"
                  variant="ghost"
                  title={`Delete ${env.name}`}
                  onClick={() => {
                    updateData((current) => deleteEnvironmentIds(current, new Set([env.id])), "Environment deleted");
                    if (selectedId === env.id) {
                      const next = environments.find((item) => item.id !== env.id);
                      setSelectedId(next?.id ?? "");
                      setSelectedAreaId("");
                      setSelectedUnitId("");
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {!environments.length ? <EmptyState title="No environments yet" body="Create a field, tunnel, room, rack, or nursery area to start planning physical growing space." /> : null}
          </div>
        </Panel>
        {selected ? (
          <Panel title="Environment Summary" description="These numbers explain what is currently mapped and planted in this location.">
            <div className="grid gap-3 sm:grid-cols-2">
              <MiniStat label="Usable area" value={`${formatNumber(usableArea, 0)} sq ft`} />
              <MiniStat label="Mapped units" value={`${formatNumber(mappedArea, 0)} sq ft`} detail={`${units.length} units`} />
              <MiniStat label="Planted area" value={`${formatNumber(plantedArea, 0)} sq ft`} detail={`${formatNumber(usableArea ? (plantedArea / usableArea) * 100 : 0, 0)}% of usable`} />
              <MiniStat label="Plant slots" value={`${formatNumber(assignedPlants, 0)} / ${formatNumber(plantSlots, 0)}`} detail={`${formatNumber(Math.max(0, plantSlots - assignedPlants), 0)} open`} />
            </div>
          </Panel>
        ) : null}
        {selected ? (
          <EnvironmentPrecisionEditor environment={selected} farmEnvironments={farmEnvironments} setSelectedId={setSelectedId} updateData={updateData} />
        ) : null}
        <Panel title="Add Environment" description="Leave usable area or climate assumptions blank and GrowOps will fill reasonable local defaults from the environment type and dimensions.">
          <form className="grid gap-3" onSubmit={addEnvironment}>
            <Field label="Name"><Input name="name" required /></Field>
            <Field label="Type">
              <Select name="type">
                {["outdoor_field", "greenhouse", "high_tunnel", "low_tunnel", "shade_house", "indoor_grow_room", "vertical_rack", "container_patio", "nursery_seedling_area"].map((type) => (
                  <option key={type} value={type}>{titleCase(type)}</option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Length ft"><Input name="lengthFt" type="number" step="0.1" /></Field>
              <Field label="Width ft"><Input name="widthFt" type="number" step="0.1" /></Field>
              <Field label="Usable sq ft"><Input name="usableAreaSqFt" type="number" step="0.1" placeholder="Auto" /></Field>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Low F"><Input name="lowTempF" type="number" placeholder="Auto" /></Field>
              <Field label="High F"><Input name="highTempF" type="number" placeholder="Auto" /></Field>
              <Field label="Humidity %"><Input name="humidityPercent" type="number" placeholder="Auto" /></Field>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Light hours"><Input name="lightHours" type="number" placeholder="Auto" /></Field>
              <Field label="Airflow"><Select name="airflow"><option value="moderate">Moderate</option><option value="low">Low</option><option value="high">High</option></Select></Field>
              <Field label="Extension days"><Input name="seasonExtensionDays" type="number" placeholder="Auto" /></Field>
            </div>
            <Field label="Layout notes"><Textarea name="layoutNotes" /></Field>
            <Field label="Notes"><Textarea name="notes" /></Field>
            <Button type="submit"><Plus className="h-4 w-4" />Add environment</Button>
          </form>
        </Panel>
        <Panel title="Fast Layout Templates" description="Add repeated beds, channels, trays, rack levels, or rows without typing each one.">
          <form className="grid gap-3" onSubmit={addBedTemplate}>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Prefix"><Input name="prefix" defaultValue="Bed" /></Field>
              <Field label="Type"><Select name="unitType">{["bed", "row", "container", "rack_level", "channel", "tray", "zone"].map((type) => <option key={type} value={type}>{titleCase(type)}</option>)}</Select></Field>
              <Field label="Count"><Input name="count" type="number" defaultValue="4" /></Field>
              <Field label="Area"><Select name="growingAreaId">{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</Select></Field>
              <Field label="Length ft"><Input name="lengthFt" type="number" step="0.1" defaultValue="30" /></Field>
              <Field label="Width ft"><Input name="widthFt" type="number" step="0.1" defaultValue="4" /></Field>
              <Field label="Plant slots"><Input name="plantSlots" type="number" placeholder="Auto" /></Field>
              <Field label="Root depth in"><Input name="rootDepthIn" type="number" placeholder="Auto" /></Field>
            </div>
            <div className="grid grid-cols-5 gap-2">
              <Field label="Start X %"><Input name="startX" type="number" defaultValue="8" /></Field>
              <Field label="Start Y %"><Input name="startY" type="number" defaultValue="8" /></Field>
              <Field label="Map W %"><Input name="mapWidth" type="number" defaultValue="64" /></Field>
              <Field label="Map H %"><Input name="mapHeight" type="number" defaultValue="4" /></Field>
              <Field label="Gap Y %"><Input name="gapY" type="number" defaultValue="4" /></Field>
            </div>
            <Button type="submit" disabled={!selected}><Plus className="h-4 w-4" />Add repeated units</Button>
          </form>
        </Panel>
      </div>

      <div className="space-y-5">
        <Panel title={selected ? `${selected.name} Layout` : "Layout Planner"} description="Drag areas or units to move them. Drag a bottom-right handle to resize. Use the precision fields below for exact sizing.">
          {selected ? <LayoutCanvas areas={areas} units={units} plantings={plantings} data={data} selectedAreaId={selectedAreaId} setSelectedAreaId={setSelectedAreaId} selectedUnitId={selectedUnitId} setSelectedUnitId={setSelectedUnitId} snapToGrid={snapToGrid} gridStep={gridStep} updateData={updateData} /> : <EmptyState title="No environment selected" body="Create or select an environment to edit layout." />}
        </Panel>
        <Panel title="Growing Areas and Zones" description="Areas are larger blocks, rack footprints, hydro zones, or container groups that hold beds and units.">
          <div className="mb-4 max-h-60 overflow-auto rounded-md border">
            <table className="table-grid">
              <thead><tr><th>Name</th><th>Kind</th><th>Map size</th><th>Units</th><th></th></tr></thead>
              <tbody>
                {areas.map((area) => (
                  <tr key={area.id} className={selectedAreaId === area.id ? "bg-accent/30" : ""} onClick={() => setSelectedAreaId(area.id)}>
                    <td>{area.name}</td>
                    <td>{titleCase(area.kind)}</td>
                    <td>{formatNumber(area.width, 0)}% x {formatNumber(area.height, 0)}%</td>
                    <td>{units.filter((unit) => unit.growingAreaId === area.id).length}</td>
                    <td className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        title={`Delete ${area.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          updateData((current) => deleteAreaIds(current, new Set([area.id])), "Growing area deleted");
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selected && selectedArea ? <AreaPrecisionEditor area={selectedArea} environment={selected} updateData={updateData} /> : <EmptyState title="No areas yet" body="Add an area from the environment panel, then drag it on the map or enter exact values here." />}
        </Panel>
        <Panel title="Units, Beds, Racks, Channels, and Trays" description="Plant slots are the planned number of crop positions the unit can hold at normal spacing, not an automatic yield estimate. GrowOps can estimate them from dimensions, unit type, and assigned crop spacing.">
          <div className="mb-4 max-h-72 overflow-auto rounded-md border">
            <table className="table-grid">
              <thead>
                <tr><th>Name</th><th>Type</th><th>Area</th><th>Plant slots</th><th>Root depth</th><th></th></tr>
              </thead>
              <tbody>
                {units.map((unit) => (
                  <tr key={unit.id} className={selectedUnitId === unit.id ? "bg-accent/30" : ""} onClick={() => setSelectedUnitId(unit.id)}>
                    <td>{unit.name}</td>
                    <td>{titleCase(unit.unitType)}</td>
                    <td>{formatNumber(unit.lengthFt * unit.widthFt)} sq ft</td>
                    <td>{unit.capacityPlants}</td>
                    <td>{unit.rootDepthIn}"</td>
                    <td className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        title={`Delete ${unit.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          updateData((current) => deleteUnitIds(current, new Set([unit.id])), "Unit deleted");
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selected && selectedUnit ? <UnitPrecisionEditor unit={selectedUnit} environment={selected} data={data} plantings={environmentPlantings} updateData={updateData} /> : null}
          <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={addUnit}>
            <Field label="Name"><Input name="name" required /></Field>
            <Field label="Type"><Select name="unitType">{["bed", "row", "container", "rack_level", "channel", "reservoir", "tray", "zone"].map((type) => <option key={type} value={type}>{titleCase(type)}</option>)}</Select></Field>
            <Field label="Area"><Select name="growingAreaId">{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</Select></Field>
            <Field label="Plant slots"><Input name="capacityPlants" type="number" placeholder="Auto" /></Field>
            <Field label="Length ft"><Input name="lengthFt" type="number" step="0.1" defaultValue="30" /></Field>
            <Field label="Width ft"><Input name="widthFt" type="number" step="0.1" defaultValue="4" /></Field>
            <Field label="Root depth in"><Input name="rootDepthIn" type="number" placeholder="Auto" /></Field>
            <div className="grid grid-cols-4 gap-2 md:col-span-2">
              <Field label="Map X %"><Input name="x" type="number" defaultValue="8" /></Field>
              <Field label="Map Y %"><Input name="y" type="number" defaultValue="8" /></Field>
              <Field label="Map W %"><Input name="width" type="number" defaultValue="24" /></Field>
              <Field label="Map H %"><Input name="height" type="number" defaultValue="6" /></Field>
            </div>
            <Field className="md:col-span-3" label="Notes"><Input name="notes" /></Field>
            <div className="flex items-end"><Button type="submit" className="w-full"><Plus className="h-4 w-4" />Add unit</Button></div>
          </form>
        </Panel>
        {selected ? <EnvironmentCropPlan data={data} environment={selected} units={units} plantings={environmentPlantings} updateData={updateData} /> : null}
      </div>
    </div>
    </div>
  );
}

type EnvironmentDrag =
  | { id: string; mode: "move"; startX: number; startY: number; item: Environment }
  | { id: string; mode: "resize"; startX: number; startY: number; item: Environment };

function FarmEnvironmentCanvas({
  environments,
  data,
  selectedId,
  setSelectedId,
  snapToGrid,
  gridStep,
  updateData
}: {
  environments: Environment[];
  data: AppData;
  selectedId: string;
  setSelectedId: (id: string) => void;
  snapToGrid: boolean;
  gridStep: number;
  updateData: (updater: (current: AppData) => AppData, message?: string) => void;
}) {
  const canvasRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<EnvironmentDrag | null>(null);

  React.useEffect(() => {
    function move(event: PointerEvent) {
      const drag = dragRef.current;
      const canvas = canvasRef.current;
      if (!drag || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const index = environments.findIndex((environment) => environment.id === drag.id);
      const layout = getEnvironmentLayout(drag.item, Math.max(0, index));
      const dx = ((event.clientX - drag.startX) / rect.width) * 100;
      const dy = ((event.clientY - drag.startY) / rect.height) * 100;
      const patch =
        drag.mode === "move"
          ? { mapX: snapPercent(clampPercent(layout.x + dx, 0, 100 - layout.width), snapToGrid, gridStep), mapY: snapPercent(clampPercent(layout.y + dy, 0, 100 - layout.height), snapToGrid, gridStep) }
          : { mapWidth: snapPercent(clampPercent(layout.width + dx, 4, 100 - layout.x), snapToGrid, gridStep), mapHeight: snapPercent(clampPercent(layout.height + dy, 4, 100 - layout.y), snapToGrid, gridStep) };
      updateData((current) => ({
        ...current,
        environments: current.environments.map((environment) => (environment.id === drag.id ? { ...environment, ...patch, updatedAt: new Date().toISOString() } : environment))
      }));
    }
    function stop() {
      dragRef.current = null;
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
  }, [environments, gridStep, snapToGrid, updateData]);

  return (
    <div className="overflow-auto">
      <div ref={canvasRef} className="canvas-grid relative h-[430px] min-w-[860px] rounded-lg border bg-card/60 shadow-inner">
        <MapRulers step={gridStep} snapToGrid={snapToGrid} />
        {environments.map((environment, index) => {
          const layout = getEnvironmentLayout(environment, index);
          const units = data.bedOrUnits.filter((unit) => unit.environmentId === environment.id);
          const activePlantings = data.plantings.filter((planting) => planting.environmentId === environment.id && planting.status !== "finished");
          return (
            <div
              key={environment.id}
              className={`absolute cursor-move touch-none rounded-md border-2 bg-card/95 p-2 text-xs shadow-panel backdrop-blur-sm transition-all ${selectedId === environment.id ? "border-primary ring-2 ring-ring" : "border-border hover:border-primary/60"}`}
              style={{ left: `${layout.x}%`, top: `${layout.y}%`, width: `${layout.width}%`, height: `${layout.height}%` }}
              title={`${environment.name} - ${titleCase(environment.type)}`}
              onPointerDown={(event) => {
                event.preventDefault();
                setSelectedId(environment.id);
                dragRef.current = { id: environment.id, mode: "move", startX: event.clientX, startY: event.clientY, item: environment };
              }}
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{environment.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{titleCase(environment.type)}</p>
                </div>
                <Badge tone="muted">{formatNumber(environment.usableAreaSqFt || environment.lengthFt * environment.widthFt, 0)} ft2</Badge>
              </div>
              <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
                <span>{formatNumber(environment.lengthFt, 0)} x {formatNumber(environment.widthFt, 0)} ft</span>
                <span>{units.length} units</span>
                <span>{activePlantings.length} active crops</span>
                <span>{titleCase(environment.assumptions.airflow)} airflow</span>
              </div>
              <button
                type="button"
                aria-label={`Resize ${environment.name}`}
                className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize rounded-tl bg-primary/60"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  setSelectedId(environment.id);
                  dragRef.current = { id: environment.id, mode: "resize", startX: event.clientX, startY: event.clientY, item: environment };
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EnvironmentPrecisionEditor({
  environment,
  farmEnvironments,
  setSelectedId,
  updateData
}: {
  environment: Environment;
  farmEnvironments: Environment[];
  setSelectedId: (id: string) => void;
  updateData: (updater: (current: AppData) => AppData, message?: string) => void;
}) {
  const layout = getEnvironmentLayout(environment, Math.max(0, farmEnvironments.findIndex((item) => item.id === environment.id)));

  function patch(patchValue: Partial<Environment>) {
    updateData((current) => ({
      ...current,
      environments: current.environments.map((item) => (item.id === environment.id ? { ...item, ...patchValue, updatedAt: new Date().toISOString() } : item))
    }));
  }

  function applyCalculatedDefaults() {
    const defaults = defaultEnvironmentAssumptions(environment.type);
    patch({
      usableAreaSqFt: estimateEnvironmentUsableArea(environment.lengthFt, environment.widthFt, environment.type),
      assumptions: {
        ...environment.assumptions,
        lowTempF: environment.assumptions.lowTempF || defaults.lowTempF,
        highTempF: environment.assumptions.highTempF || defaults.highTempF,
        humidityPercent: environment.assumptions.humidityPercent || defaults.humidityPercent,
        lightHours: environment.assumptions.lightHours || defaults.lightHours,
        airflow: environment.assumptions.airflow || defaults.airflow,
        seasonExtensionDays: environment.assumptions.seasonExtensionDays || defaults.seasonExtensionDays
      }
    });
  }

  function duplicateEnvironment() {
    const timestamp = new Date().toISOString();
    updateData((current) => {
      const nextEnvironmentId = id("env");
      const areaIds = new Map<string, string>();
      const nextEnvironment: Environment = {
        ...environment,
        id: nextEnvironmentId,
        name: `${environment.name} Copy`,
        mapX: clampPercent(layout.x + 4, 0, 100 - layout.width),
        mapY: clampPercent(layout.y + 4, 0, 100 - layout.height),
        createdAt: timestamp,
        updatedAt: timestamp
      };
      const clonedAreas = current.growingAreas
        .filter((area) => area.environmentId === environment.id)
        .map((area) => {
          const nextAreaId = id("area");
          areaIds.set(area.id, nextAreaId);
          return { ...area, id: nextAreaId, environmentId: nextEnvironmentId, createdAt: timestamp, updatedAt: timestamp };
        });
      const clonedUnits = current.bedOrUnits
        .filter((unit) => unit.environmentId === environment.id)
        .map((unit) => ({ ...unit, id: id("unit"), environmentId: nextEnvironmentId, growingAreaId: areaIds.get(unit.growingAreaId) ?? "", createdAt: timestamp, updatedAt: timestamp }));
      return {
        ...current,
        environments: [...current.environments, nextEnvironment],
        growingAreas: [...current.growingAreas, ...clonedAreas],
        bedOrUnits: [...current.bedOrUnits, ...clonedUnits]
      };
    }, "Environment duplicated");
  }

  return (
    <Panel title="Selected Environment" description="Edit the environment itself. Map fields control the farm-level canvas; real dimensions control planning calculations.">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Badge tone="muted">{titleCase(environment.type)}</Badge>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={applyCalculatedDefaults}><RefreshCcw className="h-4 w-4" />Auto-fill</Button>
          <Button size="sm" variant="secondary" onClick={duplicateEnvironment}><Copy className="h-4 w-4" />Duplicate</Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              updateData((current) => deleteEnvironmentIds(current, new Set([environment.id])), "Environment deleted");
              const next = farmEnvironments.find((item) => item.id !== environment.id);
              setSelectedId(next?.id ?? "");
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete environment
          </Button>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-4">
        <Field className="md:col-span-2" label="Name"><Input value={environment.name} onChange={(event) => patch({ name: event.target.value })} /></Field>
        <Field className="md:col-span-2" label="Type">
          <Select value={environment.type} onChange={(event) => patch({ type: event.target.value as Environment["type"] })}>
            {["outdoor_field", "greenhouse", "high_tunnel", "low_tunnel", "shade_house", "indoor_grow_room", "vertical_rack", "container_patio", "nursery_seedling_area"].map((type) => <option key={type} value={type}>{titleCase(type)}</option>)}
          </Select>
        </Field>
        <Field label="Length ft"><Input type="number" step="0.1" value={environment.lengthFt} onChange={(event) => patch({ lengthFt: Number(event.target.value) })} /></Field>
        <Field label="Width ft"><Input type="number" step="0.1" value={environment.widthFt} onChange={(event) => patch({ widthFt: Number(event.target.value) })} /></Field>
        <Field label="Usable sq ft"><Input type="number" step="0.1" value={environment.usableAreaSqFt} onChange={(event) => patch({ usableAreaSqFt: Number(event.target.value) })} /></Field>
        <Field label="Airflow">
          <Select value={environment.assumptions.airflow} onChange={(event) => patch({ assumptions: { ...environment.assumptions, airflow: event.target.value as Environment["assumptions"]["airflow"] } })}>
            <option value="low">Low</option>
            <option value="moderate">Moderate</option>
            <option value="high">High</option>
          </Select>
        </Field>
        <Field label="Map X %"><Input type="number" value={layout.x} onChange={(event) => patch({ mapX: clampPercent(Number(event.target.value), 0, 100 - layout.width) })} /></Field>
        <Field label="Map Y %"><Input type="number" value={layout.y} onChange={(event) => patch({ mapY: clampPercent(Number(event.target.value), 0, 100 - layout.height) })} /></Field>
        <Field label="Map W %"><Input type="number" value={layout.width} onChange={(event) => patch({ mapWidth: clampPercent(Number(event.target.value), 4, 100 - layout.x) })} /></Field>
        <Field label="Map H %"><Input type="number" value={layout.height} onChange={(event) => patch({ mapHeight: clampPercent(Number(event.target.value), 4, 100 - layout.y) })} /></Field>
        <Field label="Low F"><Input type="number" value={environment.assumptions.lowTempF ?? 0} onChange={(event) => patch({ assumptions: { ...environment.assumptions, lowTempF: Number(event.target.value) } })} /></Field>
        <Field label="High F"><Input type="number" value={environment.assumptions.highTempF ?? 0} onChange={(event) => patch({ assumptions: { ...environment.assumptions, highTempF: Number(event.target.value) } })} /></Field>
        <Field label="Humidity %"><Input type="number" value={environment.assumptions.humidityPercent ?? 0} onChange={(event) => patch({ assumptions: { ...environment.assumptions, humidityPercent: Number(event.target.value) } })} /></Field>
        <Field label="Light hours"><Input type="number" value={environment.assumptions.lightHours ?? 0} onChange={(event) => patch({ assumptions: { ...environment.assumptions, lightHours: Number(event.target.value) } })} /></Field>
        <Field className="md:col-span-4" label="Layout notes"><Textarea value={environment.layoutNotes} onChange={(event) => patch({ layoutNotes: event.target.value })} /></Field>
        <Field className="md:col-span-4" label="Notes"><Textarea value={environment.notes} onChange={(event) => patch({ notes: event.target.value })} /></Field>
      </div>
    </Panel>
  );
}

type LayoutDrag =
  | { kind: "area"; id: string; mode: "move" | "resize"; startX: number; startY: number; item: GrowingArea }
  | { kind: "unit"; id: string; mode: "move" | "resize"; startX: number; startY: number; item: BedOrUnit };

function LayoutCanvas({
  areas,
  units,
  plantings,
  data,
  selectedAreaId,
  setSelectedAreaId,
  selectedUnitId,
  setSelectedUnitId,
  snapToGrid,
  gridStep,
  updateData
}: {
  areas: GrowingArea[];
  units: BedOrUnit[];
  plantings: Planting[];
  data: AppData;
  selectedAreaId: string;
  setSelectedAreaId: (id: string) => void;
  selectedUnitId: string;
  setSelectedUnitId: (id: string) => void;
  snapToGrid: boolean;
  gridStep: number;
  updateData: (updater: (current: AppData) => AppData, message?: string) => void;
}) {
  const canvasRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<LayoutDrag | null>(null);

  React.useEffect(() => {
    function move(event: PointerEvent) {
      const drag = dragRef.current;
      const canvas = canvasRef.current;
      if (!drag || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dx = ((event.clientX - drag.startX) / rect.width) * 100;
      const dy = ((event.clientY - drag.startY) / rect.height) * 100;
      const patch =
        drag.mode === "move"
          ? { x: snapPercent(clampPercent(drag.item.x + dx, 0, 98), snapToGrid, gridStep), y: snapPercent(clampPercent(drag.item.y + dy, 0, 98), snapToGrid, gridStep) }
          : { width: snapPercent(clampPercent(drag.item.width + dx, 2, 100 - drag.item.x), snapToGrid, gridStep), height: snapPercent(clampPercent(drag.item.height + dy, 2, 100 - drag.item.y), snapToGrid, gridStep) };
      const timestamp = new Date().toISOString();
      updateData((current) =>
        drag.kind === "area"
          ? {
              ...current,
              growingAreas: current.growingAreas.map((area) => (area.id === drag.id ? { ...area, ...patch, updatedAt: timestamp } : area))
            }
          : {
              ...current,
              bedOrUnits: current.bedOrUnits.map((unit) => (unit.id === drag.id ? { ...unit, ...patch, updatedAt: timestamp } : unit))
            }
      );
    }
    function stop() {
      if (dragRef.current) dragRef.current = null;
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
  }, [gridStep, snapToGrid, updateData]);

  return (
    <div className="overflow-auto">
      <div ref={canvasRef} className="canvas-grid relative h-[520px] min-w-[860px] rounded-lg border bg-card/60 shadow-inner">
        <MapRulers step={gridStep} snapToGrid={snapToGrid} />
        {areas.map((area) => (
          <div
            key={area.id}
            className={`absolute z-10 cursor-move touch-none rounded-md border-2 border-dashed border-primary/55 bg-primary/10 px-2 py-1 text-xs font-medium shadow-sm backdrop-blur-sm transition-all ${selectedAreaId === area.id ? "ring-2 ring-ring" : ""}`}
            style={{ left: `${area.x}%`, top: `${area.y}%`, width: `${area.width}%`, height: `${area.height}%` }}
            onPointerDown={(event) => {
              event.preventDefault();
              setSelectedAreaId(area.id);
              setSelectedUnitId("");
              dragRef.current = { kind: "area", id: area.id, mode: "move", startX: event.clientX, startY: event.clientY, item: area };
            }}
          >
            <span>{area.name}</span>
            <button
              type="button"
              aria-label={`Resize ${area.name}`}
              className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize rounded-tl bg-primary/40"
              onPointerDown={(event) => {
                event.stopPropagation();
                event.preventDefault();
                setSelectedAreaId(area.id);
                setSelectedUnitId("");
                dragRef.current = { kind: "area", id: area.id, mode: "resize", startX: event.clientX, startY: event.clientY, item: area };
              }}
            />
          </div>
        ))}
        {units.map((unit) => {
          const planting = plantings.find((item) => item.bedOrUnitId === unit.id && item.status !== "finished");
          const crop = data.crops.find((item) => item.id === planting?.cropId);
          return (
            <div
              key={unit.id}
              className={`absolute z-20 flex cursor-move touch-none flex-col justify-between rounded-md border bg-card/95 p-2 text-xs shadow-panel backdrop-blur-sm transition-all ${selectedUnitId === unit.id ? "ring-2 ring-ring" : ""}`}
              style={{ left: `${unit.x}%`, top: `${unit.y}%`, width: `${unit.width}%`, height: `${unit.height}%`, borderColor: crop ? cropColor(crop.id) : undefined, backgroundColor: crop ? `${cropColor(crop.id)}22` : undefined }}
              onPointerDown={(event) => {
                event.preventDefault();
                setSelectedAreaId(unit.growingAreaId);
                setSelectedUnitId(unit.id);
                dragRef.current = { kind: "unit", id: unit.id, mode: "move", startX: event.clientX, startY: event.clientY, item: unit };
              }}
            >
              <span className="font-semibold">{unit.name}</span>
              <span className="truncate text-muted-foreground">{crop?.name ?? titleCase(unit.unitType)}</span>
              <span className="truncate text-[10px] text-muted-foreground">{formatNumber(unit.lengthFt * unit.widthFt)} sq ft · {unit.capacityPlants} slots</span>
              <button
                type="button"
                aria-label={`Resize ${unit.name}`}
                className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize rounded-tl bg-foreground/20"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  setSelectedAreaId(unit.growingAreaId);
                  setSelectedUnitId(unit.id);
                  dragRef.current = { kind: "unit", id: unit.id, mode: "resize", startX: event.clientX, startY: event.clientY, item: unit };
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AreaPrecisionEditor({ area, environment, updateData }: { area: GrowingArea; environment: Environment; updateData: (updater: (current: AppData) => AppData, message?: string) => void }) {
  function patch(patchValue: Partial<GrowingArea>) {
    updateData((current) => ({
      ...current,
      growingAreas: current.growingAreas.map((item) => (item.id === area.id ? { ...item, ...patchValue, updatedAt: new Date().toISOString() } : item))
    }));
  }

  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Precision edit: {area.name}</p>
          <p className="text-xs text-muted-foreground">Drag the area on the map, resize from the handle, or enter exact map percentages here.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => patch({ x: 4, y: 4, width: 92, height: 82 })}
          >
            Fit to environment
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const timestamp = new Date().toISOString();
              const clone: GrowingArea = { ...area, id: id("area"), name: `${area.name} Copy`, x: clampPercent(area.x + 4, 0, 96), y: clampPercent(area.y + 4, 0, 96), createdAt: timestamp, updatedAt: timestamp };
              updateData((current) => ({ ...current, growingAreas: [...current.growingAreas, clone] }), "Growing area duplicated");
            }}
          >
            <Copy className="h-4 w-4" />
            Duplicate
          </Button>
          <Button size="sm" variant="destructive" onClick={() => updateData((current) => deleteAreaIds(current, new Set([area.id])), "Growing area deleted")}>
            <Trash2 className="h-4 w-4" />
            Delete area
          </Button>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-8">
        <Field className="md:col-span-2" label="Name"><Input value={area.name} onChange={(event) => patch({ name: event.target.value })} /></Field>
        <Field className="md:col-span-2" label="Kind">
          <Select value={area.kind} onChange={(event) => patch({ kind: event.target.value as GrowingArea["kind"] })}>
            <option value="bed_block">Bed block</option>
            <option value="rack">Rack</option>
            <option value="container_group">Container group</option>
            <option value="hydro_zone">Hydro zone</option>
            <option value="nursery_zone">Nursery zone</option>
          </Select>
        </Field>
        <Field label="Map X %"><Input type="number" value={area.x} onChange={(event) => patch({ x: clampPercent(Number(event.target.value), 0, 98) })} /></Field>
        <Field label="Map Y %"><Input type="number" value={area.y} onChange={(event) => patch({ y: clampPercent(Number(event.target.value), 0, 98) })} /></Field>
        <Field label="Map W %"><Input type="number" value={area.width} onChange={(event) => patch({ width: clampPercent(Number(event.target.value), 2, 100 - area.x) })} /></Field>
        <Field label="Map H %"><Input type="number" value={area.height} onChange={(event) => patch({ height: clampPercent(Number(event.target.value), 2, 100 - area.y) })} /></Field>
        <Field className="md:col-span-8" label="Notes"><Input value={area.notes} onChange={(event) => patch({ notes: event.target.value })} placeholder={`${environment.name} zone notes`} /></Field>
      </div>
    </div>
  );
}

function UnitPrecisionEditor({ unit, environment, data, plantings, updateData }: { unit: BedOrUnit; environment: Environment; data: AppData; plantings: Planting[]; updateData: (updater: (current: AppData) => AppData, message?: string) => void }) {
  const assignablePlantings = plantings.filter((planting) => planting.status !== "finished");
  const assigned = assignablePlantings.filter((planting) => planting.bedOrUnitId === unit.id);
  const [assignPlantingId, setAssignPlantingId] = React.useState(assignablePlantings[0]?.id ?? "");
  const primaryAssignedCrop = data.crops.find((crop) => crop.id === assigned[0]?.cropId);

  React.useEffect(() => {
    if (!assignPlantingId || !assignablePlantings.some((planting) => planting.id === assignPlantingId)) {
      setAssignPlantingId(assignablePlantings[0]?.id ?? "");
    }
  }, [assignPlantingId, assignablePlantings]);

  function patch(patchValue: Partial<BedOrUnit>) {
    updateData((current) => ({
      ...current,
      bedOrUnits: current.bedOrUnits.map((item) => (item.id === unit.id ? { ...item, ...patchValue, updatedAt: new Date().toISOString() } : item))
    }));
  }

  function fitMapFromDimensions() {
    const width = environment.lengthFt ? (unit.lengthFt / environment.lengthFt) * 100 : unit.width;
    const height = environment.widthFt ? (unit.widthFt / environment.widthFt) * 100 : unit.height;
    patch({
      width: clampPercent(width, 2, 100 - unit.x),
      height: clampPercent(height, 2, 100 - unit.y)
    });
  }

  function autoFillUnitFromDimensions() {
    patch({
      capacityPlants: estimateUnitPlantSlots(unit, primaryAssignedCrop),
      rootDepthIn: unit.rootDepthIn || primaryAssignedCrop?.rootDepthIn || defaultRootDepthIn(unit.unitType)
    });
  }

  function applyUnitCapacityToAssignedPlantings() {
    const cropById = new Map(data.crops.map((crop) => [crop.id, crop]));
    updateData((current) => ({
      ...current,
      plantings: current.plantings.map((planting) => {
        if (!assigned.some((item) => item.id === planting.id)) return planting;
        const crop = cropById.get(planting.cropId);
        const plantCount = unit.capacityPlants || estimateUnitPlantSlots(unit, crop);
        const areaSqFt = Math.max(0, unit.lengthFt * unit.widthFt);
        const expectedYield = crop ? (crop.estimatedYieldBasis === "per_sqft" ? crop.estimatedYield * areaSqFt : crop.estimatedYield * plantCount) : planting.expectedYield;
        return {
          ...planting,
          plantCount,
          areaSqFt,
          spacingIn: crop?.spacingIn ?? planting.spacingIn,
          expectedYield,
          expectedRevenue: crop ? expectedYield * crop.estimatedPricePerUnit : planting.expectedRevenue,
          updatedAt: new Date().toISOString()
        };
      })
    }), "Assigned planting calculations refreshed");
  }

  return (
    <div className="mb-4 rounded-md border bg-muted/20 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Precision edit: {unit.name}</p>
          <p className="text-xs text-muted-foreground">Map values are percentages of the drawing area. Real dimensions drive area and plant-slot planning.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={assigned.reduce((sum, planting) => sum + planting.plantCount, 0) > unit.capacityPlants ? "warning" : "muted"}>
            {assigned.reduce((sum, planting) => sum + planting.plantCount, 0)} / {unit.capacityPlants} slots
          </Badge>
          <Button size="sm" variant="secondary" onClick={autoFillUnitFromDimensions}><RefreshCcw className="h-4 w-4" />Auto slots</Button>
          <Button size="sm" variant="secondary" onClick={applyUnitCapacityToAssignedPlantings} disabled={!assigned.length}>Refresh planting</Button>
          <Button size="sm" variant="secondary" onClick={fitMapFromDimensions}>Fit map</Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const timestamp = new Date().toISOString();
              const clone: BedOrUnit = { ...unit, id: id("unit"), name: `${unit.name} Copy`, x: clampPercent(unit.x + 3, 0, 96), y: clampPercent(unit.y + 3, 0, 96), createdAt: timestamp, updatedAt: timestamp };
              updateData((current) => ({ ...current, bedOrUnits: [...current.bedOrUnits, clone] }), "Unit duplicated");
            }}
          >
            <Copy className="h-4 w-4" />
            Duplicate
          </Button>
          <Button size="sm" variant="destructive" onClick={() => updateData((current) => deleteUnitIds(current, new Set([unit.id])), "Unit deleted")}>
            <Trash2 className="h-4 w-4" />
            Delete unit
          </Button>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-8">
        <Field label="Map X %"><Input type="number" value={unit.x} onChange={(event) => patch({ x: Number(event.target.value) })} /></Field>
        <Field label="Map Y %"><Input type="number" value={unit.y} onChange={(event) => patch({ y: Number(event.target.value) })} /></Field>
        <Field label="Map W %"><Input type="number" value={unit.width} onChange={(event) => patch({ width: Number(event.target.value) })} /></Field>
        <Field label="Map H %"><Input type="number" value={unit.height} onChange={(event) => patch({ height: Number(event.target.value) })} /></Field>
        <Field label="Length ft"><Input type="number" step="0.1" value={unit.lengthFt} onChange={(event) => patch({ lengthFt: Number(event.target.value) })} /></Field>
        <Field label="Width ft"><Input type="number" step="0.1" value={unit.widthFt} onChange={(event) => patch({ widthFt: Number(event.target.value) })} /></Field>
        <Field label="Plant slots"><Input type="number" value={unit.capacityPlants} onChange={(event) => patch({ capacityPlants: Number(event.target.value) })} /></Field>
        <Field label="Root in"><Input type="number" value={unit.rootDepthIn} onChange={(event) => patch({ rootDepthIn: Number(event.target.value) })} /></Field>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
        <Field label="Assign existing planting to this unit">
          <Select value={assignPlantingId} onChange={(event) => setAssignPlantingId(event.target.value)}>
            {assignablePlantings.map((planting) => (
              <option key={planting.id} value={planting.id}>{planting.name} - {cropName(data, planting.cropId)}</option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end">
          <Button
            className="w-full"
            variant="secondary"
            disabled={!assignPlantingId}
            onClick={() => {
              updateData((current) => ({
                ...current,
                plantings: current.plantings.map((planting) => {
                  if (planting.id !== assignPlantingId) return planting;
                  const crop = data.crops.find((item) => item.id === planting.cropId);
                  const plantCount = unit.capacityPlants || estimateUnitPlantSlots(unit, crop);
                  const areaSqFt = Math.max(0, unit.lengthFt * unit.widthFt);
                  const expectedYield = crop ? (crop.estimatedYieldBasis === "per_sqft" ? crop.estimatedYield * areaSqFt : crop.estimatedYield * plantCount) : planting.expectedYield;
                  return {
                    ...planting,
                    environmentId: environment.id,
                    bedOrUnitId: unit.id,
                    plantCount,
                    areaSqFt,
                    spacingIn: crop?.spacingIn ?? planting.spacingIn,
                    expectedYield,
                    expectedRevenue: crop ? expectedYield * crop.estimatedPricePerUnit : planting.expectedRevenue,
                    updatedAt: new Date().toISOString()
                  };
                })
              }), "Planting assigned to unit");
            }}
          >
            Assign
          </Button>
        </div>
      </div>
      {assigned.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {assigned.map((planting) => <Badge key={planting.id} tone="default">{planting.name}</Badge>)}
        </div>
      ) : null}
    </div>
  );
}

function EnvironmentCropPlan({ data, environment, units, plantings, updateData }: { data: AppData; environment: Environment; units: BedOrUnit[]; plantings: Planting[]; updateData: (updater: (current: AppData) => AppData, message?: string) => void }) {
  const rows = plantings.map((planting) => {
    const unit = units.find((item) => item.id === planting.bedOrUnitId);
    const unitPlantCount = plantings.filter((item) => item.bedOrUnitId === planting.bedOrUnitId).reduce((sum, item) => sum + item.plantCount, 0);
    return { planting, unit, overCapacity: Boolean(unit && unitPlantCount > unit.capacityPlants) };
  });

  return (
    <Panel title="Crop Assignments in This Environment" description="Active plantings tied to this environment and its beds, racks, channels, or trays.">
      {rows.length ? (
        <div className="max-h-72 overflow-auto rounded-md border">
          <table className="table-grid">
            <thead><tr><th>Planting</th><th>Crop</th><th>Unit</th><th>Plants</th><th>Area</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map(({ planting, unit, overCapacity }) => (
                <tr key={planting.id}>
                  <td className="font-medium">{planting.name}</td>
                  <td>{cropName(data, planting.cropId)}</td>
                  <td>{unit?.name ?? "Unassigned"}</td>
                  <td>{planting.plantCount}{overCapacity ? <Badge className="ml-2" tone="warning">over slots</Badge> : null}</td>
                  <td>{formatNumber(planting.areaSqFt)} sq ft</td>
                  <td>{titleCase(planting.status)}</td>
                  <td className="text-right">
                    <Button size="icon" variant="ghost" title={`Remove ${planting.name}`} onClick={() => updateData((current) => deletePlantingIds(current, new Set([planting.id])), "Planting deleted")}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No active plantings assigned" body={`No active plantings are currently mapped to ${environment.name}. Add a planting or assign one from the unit precision editor.`} />
      )}
    </Panel>
  );
}

function CropsPage({ data, farmId, search, updateData }: { data: AppData; farmId: string; search: string; updateData: (updater: (current: AppData) => AppData, message?: string) => void }) {
  const [editing, setEditing] = React.useState<Crop | null>(null);
  const [selectedCropIds, setSelectedCropIds] = React.useState<string[]>([]);
  const crops = data.crops.filter((crop) => !crop.archived && matches(crop.name + crop.cropType + crop.commonProblems.join(" "), search));

  function submitCrop(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = cropSchema.parse(Object.fromEntries(form));
    const timestamp = new Date().toISOString();
    const base: Partial<Crop> = editing ?? {
      id: id("crop"),
      farmId,
      germinationTempRangeF: [55, 80],
      transplantTimingDays: 0,
      preferredPhRange: [6, 7],
      temperatureRangeF: [45, 85],
      humidityPreference: "moderate",
      lightPreference: "full",
      compatibleEnvironmentTypes: ["outdoor_field", "greenhouse", "high_tunnel", "container_patio"],
      compatibleMethodTypes: ["direct_in_ground_soil", "raised_beds", "containers_pots_grow_bags"],
      compatibleMediumIds: ["medium_amended_soil", "medium_loam", "medium_potting_mix"],
      commonProblems: [],
      estimatedYieldBasis: "per_plant",
      archived: false,
      builtin: false,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const crop = {
      ...base,
      ...parsed,
      commonProblems: String(form.get("commonProblems") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      updatedAt: timestamp
    } as Crop;
    updateData((current) => ({ ...current, crops: current.crops.some((item) => item.id === crop.id) ? current.crops.map((item) => (item.id === crop.id ? crop : item)) : [...current.crops, crop] }), "Crop saved");
    setEditing(null);
    event.currentTarget.reset();
  }

  function duplicate(crop: Crop) {
    const timestamp = new Date().toISOString();
    const clone = { ...crop, id: id("crop"), name: `${crop.name} Copy`, farmId, builtin: false, archived: false, createdAt: timestamp, updatedAt: timestamp };
    updateData((current) => ({ ...current, crops: [...current.crops, clone] }), "Crop duplicated");
    setEditing(clone);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <Panel title="Editable Crop Library" description="Built-in profiles can be duplicated. Custom crops can be edited, archived, or deleted.">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge tone="muted">{selectedCropIds.length} selected</Badge>
          <Button size="sm" variant="secondary" onClick={() => setSelectedCropIds(crops.map((crop) => crop.id))}>Select visible</Button>
          <Button size="sm" variant="secondary" onClick={() => setSelectedCropIds([])}>Clear</Button>
          <Button size="sm" variant="secondary" disabled={!selectedCropIds.length} onClick={() => {
            const selected = new Set(selectedCropIds);
            updateData((current) => ({ ...current, crops: current.crops.map((crop) => selected.has(crop.id) ? { ...crop, archived: true, updatedAt: new Date().toISOString() } : crop) }), "Crops archived");
            setSelectedCropIds([]);
          }}><Archive className="h-4 w-4" />Archive selected</Button>
          <Button size="sm" variant="destructive" disabled={!selectedCropIds.length} onClick={() => {
            const selected = new Set(selectedCropIds);
            updateData((current) => ({ ...current, crops: current.crops.filter((crop) => !selected.has(crop.id) || crop.builtin) }), "Custom crops deleted");
            setSelectedCropIds([]);
          }}><Trash2 className="h-4 w-4" />Delete custom</Button>
        </div>
        <div className="max-h-[70vh] overflow-auto rounded-md border">
          <table className="table-grid">
            <thead>
              <tr><th className="w-10"></th><th>Crop</th><th>Type</th><th>Maturity</th><th>Spacing</th><th>pH</th><th>Methods</th><th></th></tr>
            </thead>
            <tbody>
              {crops.map((crop) => (
                <tr key={crop.id} className={selectedCropIds.includes(crop.id) ? "bg-accent/30" : ""}>
                  <td><input type="checkbox" checked={selectedCropIds.includes(crop.id)} onChange={() => setSelectedCropIds((current) => current.includes(crop.id) ? current.filter((idValue) => idValue !== crop.id) : [...current, crop.id])} /></td>
                  <td>
                    <div className="font-medium">{crop.name}</div>
                    <div className="text-xs text-muted-foreground">{crop.commonProblems.slice(0, 3).join(", ")}</div>
                  </td>
                  <td>{titleCase(crop.cropType)}</td>
                  <td>{crop.daysToMaturity} days</td>
                  <td>{crop.spacingIn}"</td>
                  <td>{crop.preferredPhRange.join("-")}</td>
                  <td>{crop.compatibleMethodTypes.slice(0, 2).map(titleCase).join(", ")}</td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" title="Edit" onClick={() => setEditing(crop)}><Save className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" title="Duplicate" onClick={() => duplicate(crop)}><Copy className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" title="Archive" onClick={() => updateData((current) => ({ ...current, crops: current.crops.map((item) => (item.id === crop.id ? { ...item, archived: true, updatedAt: new Date().toISOString() } : item)) }), "Crop archived")}><Archive className="h-4 w-4" /></Button>
                      {!crop.builtin && <Button size="icon" variant="ghost" title="Delete" onClick={() => updateData((current) => ({ ...current, crops: current.crops.filter((item) => item.id !== crop.id) }), "Crop deleted")}><Trash2 className="h-4 w-4" /></Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title={editing ? "Edit Crop" : "Create Custom Crop"}>
        <form className="grid gap-3" onSubmit={submitCrop}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name"><Input name="name" defaultValue={editing?.name ?? ""} required /></Field>
            <Field label="Type"><Select name="cropType" defaultValue={editing?.cropType ?? "leafy"}><option value="fruiting">Fruiting</option><option value="leafy">Leafy</option><option value="root">Root</option><option value="legume">Legume</option><option value="herb">Herb</option><option value="microgreen">Microgreen</option></Select></Field>
            <Field label="Days to maturity"><Input name="daysToMaturity" type="number" defaultValue={editing?.daysToMaturity ?? 45} /></Field>
            <Field label="Spacing in"><Input name="spacingIn" type="number" defaultValue={editing?.spacingIn ?? 8} /></Field>
            <Field label="Row spacing in"><Input name="rowSpacingIn" type="number" defaultValue={editing?.rowSpacingIn ?? 12} /></Field>
            <Field label="Root depth in"><Input name="rootDepthIn" type="number" defaultValue={editing?.rootDepthIn ?? 8} /></Field>
            <Field label="Succession days"><Input name="successionIntervalDays" type="number" defaultValue={editing?.successionIntervalDays ?? 14} /></Field>
            <Field label="Harvest unit"><Input name="harvestUnit" defaultValue={editing?.harvestUnit ?? "lb"} /></Field>
            <Field label="Estimated yield"><Input name="estimatedYield" type="number" step="0.01" defaultValue={editing?.estimatedYield ?? 1} /></Field>
            <Field label="Price per unit"><Input name="estimatedPricePerUnit" type="number" step="0.01" defaultValue={editing?.estimatedPricePerUnit ?? 3} /></Field>
          </div>
          <Field label="Common problems"><Input name="commonProblems" defaultValue={editing?.commonProblems.join(", ") ?? ""} /></Field>
          <Field label="Notes"><Textarea name="notes" defaultValue={editing?.notes ?? ""} /></Field>
          <div className="flex justify-between">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>New</Button>
            <Button type="submit"><Save className="h-4 w-4" />Save crop</Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}

function PlanningPage({ data, farm, search, updateData }: { data: AppData; farm: Farm; search: string; updateData: (updater: (current: AppData) => AppData, message?: string) => void }) {
  const farmId = farm.id;
  const plantings = data.plantings.filter((planting) => planting.farmId === farmId && matches(planting.name + cropName(data, planting.cropId), search));
  const [view, setView] = React.useState<"table" | "timeline" | "calendar">("table");
  const [selectedPlantingIds, setSelectedPlantingIds] = React.useState<string[]>([]);
  const seedBackedCrops = React.useMemo(() => getSeedBackedCrops(data, farmId), [data, farmId]);
  const seedBackedKey = seedBackedCrops.map((crop) => crop.cropId).join("|");
  const [autoSelectedCropIds, setAutoSelectedCropIds] = React.useState<string[]>([]);
  const [autoSeedDate, setAutoSeedDate] = React.useState(todayIso());
  const [autoMaxPlantings, setAutoMaxPlantings] = React.useState(6);
  const [autoGoal, setAutoGoal] = React.useState<"balanced" | "revenue" | "food" | "quick" | "trials">("balanced");

  React.useEffect(() => {
    setAutoSelectedCropIds((current) => {
      const available = new Set(seedBackedCrops.map((crop) => crop.cropId));
      const filtered = current.filter((cropId) => available.has(cropId));
      return filtered.length ? filtered : seedBackedCrops.slice(0, 8).map((crop) => crop.cropId);
    });
  }, [seedBackedKey, seedBackedCrops]);

  const autoPlan = React.useMemo(
    () => buildAutoPlantingPlan(data, farm, { selectedCropIds: autoSelectedCropIds, seedDate: autoSeedDate, maxPlantings: autoMaxPlantings, goal: autoGoal }),
    [data, farm, autoSelectedCropIds, autoSeedDate, autoMaxPlantings, autoGoal]
  );

  function addPlanting(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const growingMethodIds = form.getAll("growingMethodIds").map(String);
    const mediumIds = form.getAll("mediumIds").map(String);
    const parsed = plantingSchema.parse({ ...Object.fromEntries(form), growingMethodIds, mediumIds });
    const crop = data.crops.find((item) => item.id === parsed.cropId)!;
    const dates = planDates(crop, parsed.seedDate, parsed.startMethod);
    const expectedYield = crop.estimatedYieldBasis === "per_plant" ? crop.estimatedYield * parsed.plantCount : crop.estimatedYield * parsed.areaSqFt;
    const timestamp = new Date().toISOString();
    const planting: Planting = {
      id: id("planting"),
      farmId,
      ...parsed,
      transplantDate: dates.transplantDate,
      firstHarvestDate: dates.firstHarvestDate,
      harvestWindowDays: dates.harvestWindowDays,
      terminationDate: dates.terminationDate,
      successionIndex: 1,
      expectedYield,
      expectedRevenue: expectedYield * crop.estimatedPricePerUnit,
      irrigationProfile: { mode: "drip", frequency: "daily check", fertigation: growingMethodIds.some((method) => method.includes("dwc") || method.includes("nft") || method.includes("dutch")), targetPh: crop.preferredPhRange, targetEc: crop.preferredEcRange },
      status: "planned",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const methodCategories = data.growingMethods.filter((method) => planting.growingMethodIds.includes(method.id)).map((method) => method.category);
    const tasks = generateTasksForPlanting(planting, crop, methodCategories);
    const generated = generateSuppliesForPlanting(planting, crop);
    updateData(
      (current) => ({
        ...current,
        plantings: [...current.plantings, planting],
        tasks: [...current.tasks, ...tasks],
        supplyItems: [...current.supplyItems, ...generated.supplies],
        seedOrderItems: [...current.seedOrderItems, ...generated.seeds]
      }),
      "Planting, tasks, and supplies generated"
    );
    event.currentTarget.reset();
  }

  function duplicatePlanting(planting: Planting) {
    const crop = data.crops.find((item) => item.id === planting.cropId);
    const timestamp = new Date().toISOString();
    const seedDate = crop?.successionIntervalDays ? addDaysIso(planting.seedDate, crop.successionIntervalDays) : addDaysIso(planting.seedDate, 14);
    const dates = crop ? planDates(crop, seedDate, planting.startMethod) : { seedDate, firstHarvestDate: addDaysIso(seedDate, 30), harvestWindowDays: 14, terminationDate: addDaysIso(seedDate, 45) };
    const clone: Planting = { ...planting, ...dates, id: id("planting"), name: `${planting.name} Succession`, status: "planned", successionIndex: planting.successionIndex + 1, createdAt: timestamp, updatedAt: timestamp };
    updateData((current) => ({ ...current, plantings: [...current.plantings, clone] }), "Planting duplicated");
  }

  function addAutoGeneratedPlan() {
    if (!autoPlan.candidates.length) return;
    const generatedTasks = autoPlan.candidates.flatMap((candidate) => {
      const methodCategories = data.growingMethods.filter((method) => candidate.planting.growingMethodIds.includes(method.id)).map((method) => method.category);
      return generateTasksForPlanting(candidate.planting, candidate.crop, methodCategories);
    });
    const generatedSupplies = autoPlan.candidates.flatMap((candidate) => {
      const generated = generateSuppliesForPlanting(candidate.planting, candidate.crop);
      return generated.supplies;
    });
    const generatedSeeds = autoPlan.candidates.flatMap((candidate) => {
      const generated = generateSuppliesForPlanting(candidate.planting, candidate.crop);
      return generated.seeds.map((seed) => ({
        ...seed,
        ordered: true,
        estimatedCost: 0,
        notes: `Covered by available seed record. Sources: ${candidate.seedSources.join("; ") || "seed inventory/order"}. Verify lot before sowing.`
      }));
    });
    updateData(
      (current) => {
        const reservation = reserveSeedInventoryForCandidates(current, autoPlan.candidates);
        const reservationByPlanting = new Map(reservation.reservations.map((item) => [item.plantingId, item.note]));
        return {
          ...current,
          inventoryLots: reservation.inventoryLots,
          plantings: [...current.plantings, ...autoPlan.candidates.map((candidate) => candidate.planting)],
          tasks: [...current.tasks, ...generatedTasks],
          supplyItems: [...current.supplyItems, ...generatedSupplies],
          seedOrderItems: [
            ...current.seedOrderItems,
            ...generatedSeeds.map((seed) => ({ ...seed, notes: `${seed.notes} ${reservationByPlanting.get(seed.plantingId ?? "") ?? ""}`.trim() }))
          ]
        };
      },
      `${autoPlan.candidates.length} seed-backed planting${autoPlan.candidates.length === 1 ? "" : "s"} auto-filled`
    );
  }

  return (
    <div className="space-y-5">
      <Panel
        title="Guided Plan Builder"
        description="Choose a production goal and seed-backed crops. GrowOps ranks open units by compatibility, spacing, method/media fit, timing, root depth, seed coverage, yield, and projected revenue."
        action={
          <Button size="sm" onClick={addAutoGeneratedPlan} disabled={!autoPlan.candidates.length}>
            <Sprout className="h-4 w-4" />
            Create {autoPlan.candidates.length || ""} plan{autoPlan.candidates.length === 1 ? "" : "s"}
          </Button>
        }
      >
        <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Production goal">
                <Select value={autoGoal} onChange={(event) => setAutoGoal(event.target.value as typeof autoGoal)}>
                  <option value="balanced">Balanced</option>
                  <option value="revenue">Revenue</option>
                  <option value="food">Food diversity</option>
                  <option value="quick">Quick harvest</option>
                  <option value="trials">Small trials</option>
                </Select>
              </Field>
              <Field label="Target seed date"><Input type="date" value={autoSeedDate} onChange={(event) => setAutoSeedDate(event.target.value || todayIso())} /></Field>
              <Field label="Max plantings"><Input type="number" min="1" max="24" value={autoMaxPlantings} onChange={(event) => setAutoMaxPlantings(Math.max(1, Math.min(24, Number(event.target.value) || 1)))} /></Field>
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Setup steps</p>
              <p className="mt-1">1. Link seed lots to crops in Seed & Supply. 2. Confirm environment dimensions and unit slots. 3. Pick a goal here. 4. Review the generated plan, tasks, supplies, and seed reservations.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setAutoSelectedCropIds(seedBackedCrops.map((crop) => crop.cropId))}>Select seed-backed</Button>
              <Button size="sm" variant="secondary" onClick={() => setAutoSelectedCropIds([])}>Clear</Button>
            </div>
            {seedBackedCrops.length ? (
              <div className="grid max-h-52 gap-2 overflow-auto rounded-md border p-2">
                {seedBackedCrops.map((crop) => (
                  <label key={crop.cropId} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60">
                    <input
                      className="mt-1"
                      type="checkbox"
                      checked={autoSelectedCropIds.includes(crop.cropId)}
                      onChange={(event) =>
                        setAutoSelectedCropIds((current) => event.target.checked ? [...current, crop.cropId] : current.filter((cropId) => cropId !== crop.cropId))
                      }
                    />
                    <span>
                      <span className="font-medium">{crop.cropName}</span>
                      <span className="block text-xs text-muted-foreground">{crop.sources.join("; ")}</span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <EmptyState title="No seed-backed crops found" body="Add seed inventory lots or mark seed orders as ordered in Seed & Supply, then GrowOps can auto-fill a crop plan from what you have." />
            )}
          </div>
          <div>
            {autoPlan.candidates.length ? (
              <div className="max-h-72 overflow-auto rounded-md border">
                <table className="table-grid">
                  <thead><tr><th>Crop</th><th>Best unit</th><th>Seed date</th><th>Fit</th><th>Projected</th></tr></thead>
                  <tbody>
                    {autoPlan.candidates.map((candidate) => (
                      <tr key={candidate.planting.id}>
                        <td><b>{candidate.crop.name}</b><div className="text-xs text-muted-foreground">{candidate.methodNames.join(", ")} / {candidate.mediumNames.join(", ")}</div></td>
                        <td>{candidate.environment.name}<div className="text-xs text-muted-foreground">{candidate.bedOrUnit.name} - {candidate.planting.plantCount} slots</div></td>
                        <td>{candidate.planting.seedDate}<div className="text-xs text-muted-foreground">Harvest {candidate.planting.firstHarvestDate}</div></td>
                        <td><Badge tone={candidate.compatibilityScore >= 90 ? "success" : "warning"}>{candidate.compatibilityScore}/100</Badge><div className="mt-1 text-xs text-muted-foreground">{candidate.reason}</div><div className="mt-1 text-xs text-muted-foreground">Seed: {formatNumber(candidate.seedAvailable, 0)} available / {formatNumber(candidate.seedNeed, 0)} needed</div></td>
                        <td>{formatNumber(candidate.planting.expectedYield)} {candidate.crop.harvestUnit}<div className="text-xs text-muted-foreground">{formatCurrency(candidate.planting.expectedRevenue, farm.currency)}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No auto plan yet" body="Select seed-backed crops and make sure the workspace has growing units with compatible methods, media, and open timing." />
            )}
            {autoPlan.skipped.length ? (
              <div className="mt-3 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">Skipped or unresolved</p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {autoPlan.skipped.slice(0, 5).map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </Panel>

      <Panel title="Add Planting" description="Dates, tasks, supplies, expected yield, and revenue are generated from the crop profile.">
        <form className="grid gap-3 lg:grid-cols-6" onSubmit={addPlanting}>
          <Field className="lg:col-span-2" label="Name"><Input name="name" required /></Field>
          <Field label="Crop"><Select name="cropId">{data.crops.filter((crop) => !crop.archived).map((crop) => <option key={crop.id} value={crop.id}>{crop.name}</option>)}</Select></Field>
          <Field label="Start method"><Select name="startMethod">{["direct_seed", "indoor_start", "transplant", "purchased_transplant", "cutting_clone", "hydroponic_transplant", "microgreen_sowing"].map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</Select></Field>
          <Field label="Seed date"><Input name="seedDate" type="date" defaultValue={todayIso()} /></Field>
          <Field label="Environment"><Select name="environmentId">{data.environments.filter((env) => env.farmId === farmId).map((env) => <option key={env.id} value={env.id}>{env.name}</option>)}</Select></Field>
          <Field label="Unit"><Select name="bedOrUnitId">{data.bedOrUnits.filter((unit) => unit.farmId === farmId).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</Select></Field>
          <Field label="Plants"><Input name="plantCount" type="number" defaultValue="48" /></Field>
          <Field label="Area sq ft"><Input name="areaSqFt" type="number" defaultValue="120" /></Field>
          <Field label="Spacing in"><Input name="spacingIn" type="number" defaultValue="8" /></Field>
          <Field label="Labor hours"><Input name="laborHoursEstimate" type="number" step="0.1" defaultValue="2" /></Field>
          <Field className="lg:col-span-3" label="Growing methods"><CheckboxGroup name="growingMethodIds" items={data.growingMethods.map((method) => ({ value: method.id, label: method.name }))} limitHeight /></Field>
          <Field className="lg:col-span-3" label="Growing media"><CheckboxGroup name="mediumIds" items={data.growingMedia.map((medium) => ({ value: medium.id, label: medium.name }))} limitHeight /></Field>
          <Field className="lg:col-span-5" label="Notes"><Input name="notes" /></Field>
          <div className="flex items-end"><Button className="w-full" type="submit"><Plus className="h-4 w-4" />Add plan</Button></div>
        </form>
      </Panel>

      <Panel title="Planting Bulk Edit">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="muted">{selectedPlantingIds.length} selected</Badge>
          <Button size="sm" variant="secondary" onClick={() => setSelectedPlantingIds(plantings.map((planting) => planting.id))}>Select visible</Button>
          <Button size="sm" variant="secondary" onClick={() => setSelectedPlantingIds([])}>Clear</Button>
          {(["planned", "active", "harvesting", "finished"] as Planting["status"][]).map((status) => (
            <Button key={status} size="sm" variant="secondary" disabled={!selectedPlantingIds.length} onClick={() => {
              const selected = new Set(selectedPlantingIds);
              updateData((current) => ({ ...current, plantings: current.plantings.map((planting) => selected.has(planting.id) ? { ...planting, status, updatedAt: new Date().toISOString() } : planting) }), "Planting statuses updated");
              setSelectedPlantingIds([]);
            }}>{titleCase(status)}</Button>
          ))}
          <Button size="sm" variant="destructive" disabled={!selectedPlantingIds.length} onClick={() => {
            updateData((current) => deletePlantingIds(current, new Set(selectedPlantingIds)), "Plantings deleted");
            setSelectedPlantingIds([]);
          }}><Trash2 className="h-4 w-4" />Delete selected</Button>
        </div>
      </Panel>

      <Panel title="Season Planner" action={<Tabs value={view} onChange={setView} items={[{ value: "table", label: "Table" }, { value: "timeline", label: "Timeline" }, { value: "calendar", label: "Calendar" }]} />}>
        {view === "table" && <PlantingTable plantings={plantings} data={data} selectedIds={selectedPlantingIds} setSelectedIds={setSelectedPlantingIds} onDuplicate={duplicatePlanting} onDelete={(planting) => updateData((current) => deletePlantingIds(current, new Set([planting.id])), "Planting deleted")} />}
        {view === "timeline" && <TimelineView plantings={plantings} data={data} />}
        {view === "calendar" && <CalendarList plantings={plantings} data={data} />}
      </Panel>
    </div>
  );
}

function TasksPage({ data, farmId, search, updateData }: { data: AppData; farmId: string; search: string; updateData: (updater: (current: AppData) => AppData, message?: string) => void }) {
  const [view, setView] = React.useState<"daily" | "weekly" | "calendar" | "kanban">("daily");
  const preset = data.appSettings.tablePresets?.tasks ?? {};
  const [selectedTaskIds, setSelectedTaskIds] = React.useState<string[]>([]);
  const visibleColumns = preset.visibleColumns ?? ["task", "due", "status", "priority", "crop", "minutes"];
  const tasks = data.tasks
    .filter((task) => task.farmId === farmId && matches(task.title + task.category + task.notes, search))
    .filter((task) => !preset.statusFilter || preset.statusFilter === "all" || task.status === preset.statusFilter)
    .filter((task) => !preset.priorityFilter || preset.priorityFilter === "all" || task.priority === preset.priorityFilter)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  function updateTask(task: Task, patch: Partial<Task>) {
    updateData((current) => ({ ...current, tasks: current.tasks.map((item) => (item.id === task.id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item)) }));
  }

  function addTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = taskSchema.parse(Object.fromEntries(form));
    const timestamp = new Date().toISOString();
    const task: Task = { id: id("task"), farmId, category: "manual", ...parsed, createdAt: timestamp, updatedAt: timestamp };
    updateData((current) => ({ ...current, tasks: [...current.tasks, task] }), "Task added");
    event.currentTarget.reset();
  }

  function patchTaskPreset(patch: NonNullable<AppData["appSettings"]["tablePresets"]>["tasks"]) {
    updateData((current) => ({
      ...current,
      appSettings: {
        ...current.appSettings,
        tablePresets: { ...(current.appSettings.tablePresets ?? {}), tasks: { ...(current.appSettings.tablePresets?.tasks ?? {}), ...patch } }
      }
    }), "Task table preset saved");
  }

  function toggleTaskColumn(column: string) {
    patchTaskPreset({ visibleColumns: visibleColumns.includes(column) ? visibleColumns.filter((item) => item !== column) : [...visibleColumns, column] });
  }

  function bulkPatchTasks(patch: Partial<Task>, message: string) {
    if (!selectedTaskIds.length) return;
    updateData((current) => ({
      ...current,
      tasks: current.tasks.map((task) => selectedTaskIds.includes(task.id) ? { ...task, ...patch, updatedAt: new Date().toISOString() } : task)
    }), message);
    setSelectedTaskIds([]);
  }

  return (
    <div className="space-y-5">
      <Panel title="Add Task">
        <form className="grid gap-3 md:grid-cols-6" onSubmit={addTask}>
          <Field className="md:col-span-2" label="Title"><Input name="title" required /></Field>
          <Field label="Due date"><Input name="dueDate" type="date" defaultValue={todayIso()} /></Field>
          <Field label="Status"><Select name="status"><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option><option value="skipped">Skipped</option></Select></Field>
          <Field label="Priority"><Select name="priority"><option value="normal">Normal</option><option value="low">Low</option><option value="high">High</option><option value="urgent">Urgent</option></Select></Field>
          <Field label="Minutes"><Input name="estimatedMinutes" type="number" defaultValue="30" /></Field>
          <Field className="md:col-span-5" label="Notes"><Input name="notes" /></Field>
          <div className="flex items-end"><Button className="w-full" type="submit"><Plus className="h-4 w-4" />Add</Button></div>
        </form>
      </Panel>
      <Panel title="Task Filters and Bulk Edit" description="Saved filters and visible columns stay with this local workspace. Select rows in the table for bulk changes.">
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_2fr]">
          <Field label="Saved status filter">
            <Select value={preset.statusFilter ?? "all"} onChange={(event) => patchTaskPreset({ statusFilter: event.target.value })}>
              <option value="all">All statuses</option><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option><option value="skipped">Skipped</option>
            </Select>
          </Field>
          <Field label="Saved priority filter">
            <Select value={preset.priorityFilter ?? "all"} onChange={(event) => patchTaskPreset({ priorityFilter: event.target.value })}>
              <option value="all">All priorities</option><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
            </Select>
          </Field>
          <Field label="Visible columns">
            <div className="flex flex-wrap gap-2 rounded-md border p-2">
              {["task", "due", "status", "priority", "crop", "minutes"].map((column) => (
                <label key={column} className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={visibleColumns.includes(column)} onChange={() => toggleTaskColumn(column)} />
                  {titleCase(column)}
                </label>
              ))}
            </div>
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone="muted">{selectedTaskIds.length} selected</Badge>
          <Button size="sm" variant="secondary" onClick={() => setSelectedTaskIds(tasks.map((task) => task.id))}>Select visible</Button>
          <Button size="sm" variant="secondary" onClick={() => setSelectedTaskIds([])}>Clear</Button>
          <Button size="sm" onClick={() => bulkPatchTasks({ status: "done" }, "Tasks marked done")}>Mark done</Button>
          <Button size="sm" variant="secondary" onClick={() => bulkPatchTasks({ priority: "high" }, "Task priorities updated")}>Priority high</Button>
          <Button size="sm" variant="destructive" onClick={() => {
            const ids = new Set(selectedTaskIds);
            updateData((current) => ({ ...current, tasks: current.tasks.filter((task) => !ids.has(task.id)) }), "Tasks deleted");
            setSelectedTaskIds([]);
          }} disabled={!selectedTaskIds.length}><Trash2 className="h-4 w-4" />Delete selected</Button>
        </div>
      </Panel>
      <Panel title="Task Views" action={<Tabs value={view} onChange={setView} items={[{ value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "calendar", label: "Calendar" }, { value: "kanban", label: "Kanban" }]} />}>
        {view === "kanban" ? <KanbanTasks tasks={tasks} data={data} updateTask={updateTask} /> : <TaskTable tasks={view === "daily" ? tasks.filter((task) => task.dueDate <= todayIso()) : tasks} data={data} updateTask={updateTask} selectedIds={selectedTaskIds} setSelectedIds={setSelectedTaskIds} visibleColumns={visibleColumns} />}
      </Panel>
    </div>
  );
}

function SuppliesPage({ data, farmId, search, updateData }: { data: AppData; farmId: string; search: string; updateData: (updater: (current: AppData) => AppData, message?: string) => void }) {
  const supplies = data.supplyItems.filter((item) => item.farmId === farmId && matches(item.name + item.itemType + item.notes, search));
  const seeds = data.seedOrderItems.filter((item) => item.farmId === farmId && matches(item.seedName + item.notes, search));
  const lots = data.inventoryLots.filter((item) => item.farmId === farmId && matches(item.name + item.itemType + item.lotCode + item.vendor + cropName(data, item.cropId) + item.notes, search));
  const expenses = data.expenseLogs.filter((item) => item.farmId === farmId && matches(item.description + item.category + item.vendor + item.notes, search));
  const totalCost = [...supplies, ...seeds].reduce((sum, item) => sum + item.estimatedCost, 0);
  const inventoryValue = lots.reduce((sum, item) => sum + item.quantityOnHand * item.unitCost, 0);
  const expenseTotal = expenses.reduce((sum, item) => sum + item.amount, 0);

  function addInventory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = inventoryLotSchema.parse(Object.fromEntries(form));
    const timestamp = new Date().toISOString();
    const lot: InventoryLot = { id: id("lot"), farmId, ...parsed, cropId: parsed.cropId || undefined, expirationDate: parsed.expirationDate || undefined, createdAt: timestamp, updatedAt: timestamp };
    updateData((current) => ({ ...current, inventoryLots: [lot, ...current.inventoryLots] }), "Inventory lot added");
    event.currentTarget.reset();
  }

  function addExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = expenseSchema.parse(Object.fromEntries(form));
    const timestamp = new Date().toISOString();
    const expense: ExpenseLog = { id: id("expense"), farmId, ...parsed, createdAt: timestamp, updatedAt: timestamp };
    updateData((current) => ({ ...current, expenseLogs: [expense, ...current.expenseLogs] }), "Expense logged");
    event.currentTarget.reset();
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-5">
        <Metric title="Supply items" value={supplies.length} detail="generated and manual" />
        <Metric title="Seed orders" value={seeds.length} detail={`${seeds.filter((item) => !item.ordered).length} open`} />
        <Metric title="Estimated cost" value={formatCurrency(totalCost)} detail="local estimate" />
        <Metric title="Inventory value" value={formatCurrency(inventoryValue)} detail={`${lots.length} lots`} />
        <Metric title="Expenses" value={formatCurrency(expenseTotal)} detail={`${expenses.length} logs`} />
      </div>
      <Panel
        title="Seed and Supply List"
        action={
          <Button
            size="sm"
            onClick={() => {
              const csv = toCsv(
                [
                  ...supplies.map((item) => ({ kind: item.itemType, name: item.name, quantity: item.quantity, unit: item.unit, estimatedCost: item.estimatedCost, notes: item.notes })),
                  ...seeds.map((item) => ({ kind: "seed", name: item.seedName, quantity: item.quantityNeeded, unit: item.unit, estimatedCost: item.estimatedCost, notes: item.notes }))
                ],
                ["kind", "name", "quantity", "unit", "estimatedCost", "notes"]
              );
              exportCsvFile("growops-supplies.csv", csv);
            }}
          >
            <Download className="h-4 w-4" />CSV
          </Button>
        }
      >
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-md border">
            <table className="table-grid"><thead><tr><th>Supply</th><th>Qty</th><th>Cost</th><th></th></tr></thead><tbody>{supplies.map((item) => <tr key={item.id}><td><b>{item.name}</b><div className="text-xs text-muted-foreground">{item.itemType} · {plantingName(data, item.plantingId)}</div></td><td>{item.quantity} {item.unit}</td><td>{formatCurrency(item.estimatedCost)}</td><td><Button size="icon" variant="ghost" onClick={() => updateData((current) => ({ ...current, supplyItems: current.supplyItems.filter((supply) => supply.id !== item.id) }), "Supply removed")}><Trash2 className="h-4 w-4" /></Button></td></tr>)}</tbody></table>
          </div>
          <div className="rounded-md border">
            <table className="table-grid"><thead><tr><th>Seed</th><th>Qty</th><th>Cost</th><th>Ordered</th></tr></thead><tbody>{seeds.map((item) => <tr key={item.id}><td><b>{item.seedName}</b><div className="text-xs text-muted-foreground">{cropName(data, item.cropId)}</div></td><td>{item.quantityNeeded} {item.unit}</td><td>{formatCurrency(item.estimatedCost)}</td><td><input type="checkbox" checked={item.ordered} onChange={(event) => updateData((current) => ({ ...current, seedOrderItems: current.seedOrderItems.map((seed) => seed.id === item.id ? { ...seed, ordered: event.target.checked } : seed) }))} /></td></tr>)}</tbody></table>
          </div>
        </div>
      </Panel>
      <Panel title="Inventory Lots" description="Track seeds, media, nutrients, labels, containers, and other supplies by lot code.">
        <form className="mb-4 grid gap-3 md:grid-cols-8" onSubmit={addInventory}>
          <Field label="Type"><Select name="itemType"><option value="seed">Seed</option><option value="media">Media</option><option value="fertilizer">Fertilizer</option><option value="nutrient">Nutrient</option><option value="label">Label</option><option value="container">Container</option><option value="supply">Supply</option><option value="other">Other</option></Select></Field>
          <Field label="Crop link"><Select name="cropId"><option value="">None</option>{data.crops.filter((crop) => !crop.archived).map((crop) => <option key={crop.id} value={crop.id}>{crop.name}</option>)}</Select></Field>
          <Field className="md:col-span-2" label="Name"><Input name="name" required /></Field>
          <Field label="Lot code"><Input name="lotCode" /></Field>
          <Field label="Vendor"><Input name="vendor" /></Field>
          <Field label="Qty"><Input name="quantityOnHand" type="number" step="0.01" defaultValue="1" /></Field>
          <Field label="Reserved"><Input name="reservedQuantity" type="number" step="0.01" defaultValue="0" /></Field>
          <Field label="Unit"><Input name="unit" defaultValue="each" /></Field>
          <Field label="Seeds/unit"><Input name="seedsPerUnit" type="number" step="1" placeholder="Optional" /></Field>
          <Field label="Germination %"><Input name="germinationRatePercent" type="number" step="1" min="1" max="100" placeholder="Optional" /></Field>
          <Field label="Unit cost"><Input name="unitCost" type="number" step="0.01" defaultValue="0" /></Field>
          <Field label="Storage"><Input name="storageLocation" /></Field>
          <Field label="Received"><Input name="receivedDate" type="date" defaultValue={todayIso()} /></Field>
          <Field label="Expires"><Input name="expirationDate" type="date" /></Field>
          <Field className="md:col-span-4" label="Notes"><Input name="notes" /></Field>
          <div className="flex items-end"><Button type="submit" className="w-full"><Plus className="h-4 w-4" />Add lot</Button></div>
        </form>
        {lots.some((lot) => lot.cropId) ? (
          <div className="mb-3 flex flex-wrap gap-2 rounded-md border bg-muted/30 p-2 text-xs">
            {lots
              .filter((lot) => lot.cropId)
              .slice(0, 12)
              .map((lot) => <Badge key={lot.id} tone="success">{lot.name} to {cropName(data, lot.cropId)}</Badge>)}
          </div>
        ) : null}
        <div className="max-h-72 overflow-auto rounded-md border">
          <table className="table-grid"><thead><tr><th>Item</th><th>Crop</th><th>Lot</th><th>On hand</th><th>Reserved</th><th>Available</th><th>Seed math</th><th>Storage</th><th>Value</th><th></th></tr></thead><tbody>{lots.map((lot) => <tr key={lot.id}><td><b>{lot.name}</b><div className="text-xs text-muted-foreground">{titleCase(lot.itemType)} - {lot.vendor}</div></td><td>{lot.cropId ? cropName(data, lot.cropId) : "Unlinked"}</td><td>{lot.lotCode || "Unlotted"}</td><td>{lot.quantityOnHand} {lot.unit}</td><td>{lot.reservedQuantity ?? 0} {lot.unit}</td><td>{Math.max(0, Math.round((lot.quantityOnHand - (lot.reservedQuantity ?? 0)) * 1000) / 1000)} {lot.unit}</td><td>{lot.seedsPerUnit ? `${formatNumber(lot.seedsPerUnit, 0)} seeds/${lot.unit}` : "Manual"}{lot.germinationRatePercent ? <div className="text-xs text-muted-foreground">{lot.germinationRatePercent}% germ</div> : null}</td><td>{lot.storageLocation}</td><td>{formatCurrency(lot.quantityOnHand * lot.unitCost)}</td><td><Button size="icon" variant="ghost" onClick={() => updateData((current) => ({ ...current, inventoryLots: current.inventoryLots.filter((item) => item.id !== lot.id) }), "Inventory lot deleted")}><Trash2 className="h-4 w-4" /></Button></td></tr>)}</tbody></table>
        </div>
      </Panel>
      <Panel title="Expense Tracking" description="Log costs that are not harvest revenue so profitability is visible locally.">
        <form className="mb-4 grid gap-3 md:grid-cols-7" onSubmit={addExpense}>
          <Field label="Date"><Input name="date" type="date" defaultValue={todayIso()} /></Field>
          <Field label="Category"><Select name="category"><option value="seed">Seed</option><option value="media">Media</option><option value="fertility">Fertility</option><option value="labor">Labor</option><option value="packaging">Packaging</option><option value="equipment">Equipment</option><option value="utilities">Utilities</option><option value="other">Other</option></Select></Field>
          <Field label="Vendor"><Input name="vendor" /></Field>
          <Field className="md:col-span-2" label="Description"><Input name="description" required /></Field>
          <Field label="Amount"><Input name="amount" type="number" step="0.01" defaultValue="0" /></Field>
          <Field label="Notes"><Input name="notes" /></Field>
          <div className="flex items-end"><Button type="submit" className="w-full"><Plus className="h-4 w-4" />Log</Button></div>
        </form>
        <div className="max-h-72 overflow-auto rounded-md border">
          <table className="table-grid"><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Vendor</th><th>Amount</th><th></th></tr></thead><tbody>{expenses.map((expense) => <tr key={expense.id}><td>{expense.date}</td><td>{titleCase(expense.category)}</td><td>{expense.description}</td><td>{expense.vendor}</td><td>{formatCurrency(expense.amount)}</td><td><Button size="icon" variant="ghost" onClick={() => updateData((current) => ({ ...current, expenseLogs: current.expenseLogs.filter((item) => item.id !== expense.id) }), "Expense deleted")}><Trash2 className="h-4 w-4" /></Button></td></tr>)}</tbody></table>
        </div>
      </Panel>
    </div>
  );
}

function HarvestPage({ data, farm, search, updateData }: { data: AppData; farm: Farm; search: string; updateData: (updater: (current: AppData) => AppData, message?: string) => void }) {
  const farmId = farm.id;
  const [selectedHarvestIds, setSelectedHarvestIds] = React.useState<string[]>([]);
  const harvests = data.harvestLogs.filter((harvest) => harvest.farmId === farmId && matches(cropName(data, harvest.cropId) + harvest.destination + harvest.notes, search)).sort((a, b) => b.harvestDate.localeCompare(a.harvestDate));

  function addHarvest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = harvestSchema.parse(Object.fromEntries(form));
    const timestamp = new Date().toISOString();
    const harvest: HarvestLog = {
      id: id("harvest"),
      farmId,
      ...parsed,
      plantingId: parsed.plantingId || undefined,
      revenue: parsed.quantity * parsed.salePrice,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    updateData((current) => ({ ...current, harvestLogs: [...current.harvestLogs, harvest], revenueLogs: [...current.revenueLogs, { id: id("revenue"), farmId, harvestLogId: harvest.id, date: harvest.harvestDate, source: `Harvest ${cropName(current, harvest.cropId)}`, amount: harvest.revenue, notes: "" }] }), "Harvest logged");
    event.currentTarget.reset();
  }

  return (
    <div className="space-y-5">
      <HarvestSummary data={data} farm={farm} />
      <Panel title="Log Harvest">
        <form className="grid gap-3 md:grid-cols-6" onSubmit={addHarvest}>
          <Field label="Crop"><Select name="cropId">{data.crops.filter((crop) => !crop.archived).map((crop) => <option key={crop.id} value={crop.id}>{crop.name}</option>)}</Select></Field>
          <Field label="Planting"><Select name="plantingId"><option value="">None</option>{data.plantings.filter((planting) => planting.farmId === farmId).map((planting) => <option key={planting.id} value={planting.id}>{planting.name}</option>)}</Select></Field>
          <Field label="Date"><Input name="harvestDate" type="date" defaultValue={todayIso()} /></Field>
          <Field label="Quantity"><Input name="quantity" type="number" step="0.01" defaultValue="1" /></Field>
          <Field label="Unit"><Input name="unit" defaultValue="lb" /></Field>
          <Field label="Grade"><Select name="grade"><option value="premium">Premium</option><option value="standard">Standard</option><option value="seconds">Seconds</option><option value="waste">Waste</option></Select></Field>
          <Field label="Destination"><Input name="destination" /></Field>
          <Field label="Sale price"><Input name="salePrice" type="number" step="0.01" defaultValue="0" /></Field>
          <Field label="Waste/loss"><Input name="wasteLoss" type="number" step="0.01" defaultValue="0" /></Field>
          <Field className="md:col-span-2" label="Notes"><Input name="notes" /></Field>
          <div className="flex items-end"><Button type="submit" className="w-full"><Plus className="h-4 w-4" />Log</Button></div>
        </form>
      </Panel>
      <Panel title="Harvest Log">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge tone="muted">{selectedHarvestIds.length} selected</Badge>
          <Button size="sm" variant="secondary" onClick={() => setSelectedHarvestIds(harvests.map((harvest) => harvest.id))}>Select visible</Button>
          <Button size="sm" variant="secondary" onClick={() => setSelectedHarvestIds([])}>Clear</Button>
          <Button size="sm" variant="secondary" disabled={!selectedHarvestIds.length} onClick={() => {
            const selected = new Set(selectedHarvestIds);
            updateData((current) => ({ ...current, harvestLogs: current.harvestLogs.map((harvest) => selected.has(harvest.id) ? { ...harvest, grade: "standard", updatedAt: new Date().toISOString() } : harvest) }), "Harvest grades updated");
            setSelectedHarvestIds([]);
          }}>Grade standard</Button>
          <Button size="sm" variant="destructive" disabled={!selectedHarvestIds.length} onClick={() => {
            updateData((current) => deleteHarvestIds(current, new Set(selectedHarvestIds)), "Harvests deleted");
            setSelectedHarvestIds([]);
          }}><Trash2 className="h-4 w-4" />Delete selected</Button>
        </div>
        <div className="max-h-[55vh] overflow-auto rounded-md border">
          <table className="table-grid">
            <thead><tr><th className="w-10"></th><th>Date</th><th>Crop</th><th>Quantity</th><th>Grade</th><th>Destination</th><th>Revenue</th><th></th></tr></thead>
            <tbody>{harvests.map((harvest) => <tr key={harvest.id} className={selectedHarvestIds.includes(harvest.id) ? "bg-accent/30" : ""}><td><input type="checkbox" checked={selectedHarvestIds.includes(harvest.id)} onChange={() => setSelectedHarvestIds((current) => current.includes(harvest.id) ? current.filter((idValue) => idValue !== harvest.id) : [...current, harvest.id])} /></td><td>{harvest.harvestDate}</td><td>{cropName(data, harvest.cropId)}</td><td>{harvest.quantity} {harvest.unit}</td><td>{titleCase(harvest.grade)}</td><td>{harvest.destination}</td><td>{formatCurrency(harvest.revenue, farm.currency)}</td><td><Button size="icon" variant="ghost" onClick={() => updateData((current) => deleteHarvestIds(current, new Set([harvest.id])), "Harvest deleted")}><Trash2 className="h-4 w-4" /></Button></td></tr>)}</tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function DiagnosticsPage({ data, farmId, updateData }: { data: AppData; farmId: string; updateData: (updater: (current: AppData) => AppData, message?: string) => void }) {
  const [selectedCaseId, setSelectedCaseId] = React.useState(data.diagnosticCases.find((item) => item.farmId === farmId)?.id ?? "");
  const selectedCase = data.diagnosticCases.find((item) => item.id === selectedCaseId);
  const results = data.diagnosticResults.filter((result) => result.diagnosticCaseId === selectedCaseId).sort((a, b) => b.confidence - a.confidence);
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  function addCase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = {
      ...Object.fromEntries(form),
      growingMethodIds: form.getAll("growingMethodIds").map(String),
      mediumIds: form.getAll("mediumIds").map(String),
      affectedParts: form.getAll("affectedParts").map(String),
      symptomTypes: form.getAll("symptomTypes").map(String),
      recentActions: form.getAll("recentActions").map(String)
    };
    const parsed = diagnosticCaseFormSchema.parse(values);
    const timestamp = new Date().toISOString();
    const diagnosticCase: DiagnosticCase = {
      id: id("diag"),
      farmId,
      ...parsed,
      photoAssetIds: [],
      status: "open",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const context = diagnosticContext(data, diagnosticCase);
    const results = runDiagnostic(context);
    updateData((current) => ({ ...current, diagnosticCases: [...current.diagnosticCases, diagnosticCase], diagnosticResults: [...current.diagnosticResults, ...results] }), "Diagnostic case scored");
    setSelectedCaseId(diagnosticCase.id);
    event.currentTarget.reset();
  }

  async function attachPhoto(file: File) {
    if (!selectedCase) return;
    const asset = await savePhotoAsset(farmId, file);
    updateData((current) => ({
      ...current,
      photoAssets: [...current.photoAssets, asset],
      diagnosticCases: current.diagnosticCases.map((item) => (item.id === selectedCase.id ? { ...item, photoAssetIds: [...item.photoAssetIds, asset.id], updatedAt: new Date().toISOString() } : item))
    }), "Photo attached locally");
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <Panel title="New Diagnostic Case" description="Explainable offline scoring. Photos are stored locally as supporting evidence only.">
        <form className="grid gap-3" onSubmit={addCase}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Crop"><Select name="cropId">{data.crops.filter((crop) => !crop.archived).map((crop) => <option key={crop.id} value={crop.id}>{crop.name}</option>)}</Select></Field>
            <Field label="Cultivar"><Input name="cultivar" /></Field>
            <Field label="Growth stage"><Select name="growthStage">{["seedling", "vegetative", "flowering", "fruiting", "harvest", "post_harvest"].map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</Select></Field>
            <Field label="Environment"><Select name="environmentId">{data.environments.filter((env) => env.farmId === farmId).map((env) => <option key={env.id} value={env.id}>{env.name}</option>)}</Select></Field>
            <Field label="Zone/location"><Input name="locationZone" /></Field>
            <Field label="Moisture"><Select name="moisture"><option value="normal">Normal</option><option value="dry">Dry</option><option value="wet">Wet</option><option value="saturated">Saturated</option></Select></Field>
          </div>
          <Field label="Symptoms"><Textarea name="symptoms" required placeholder="Describe pattern, color, timing, spread, and affected plants." /></Field>
          <Field label="Affected parts"><CheckboxGroup name="affectedParts" items={multiOptions.affectedParts.map((value) => ({ value, label: value }))} /></Field>
          <Field label="Symptom types"><CheckboxGroup name="symptomTypes" items={multiOptions.symptomTypes.map((value) => ({ value, label: value }))} /></Field>
          <Field label="Recent actions"><CheckboxGroup name="recentActions" items={multiOptions.recentActions.map((value) => ({ value, label: titleCase(value) }))} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Distribution"><Select name="distribution">{["single_plant", "scattered", "edge", "whole_bed", "new_growth", "older_growth"].map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</Select></Field>
            <Field label="Air temp F"><Input name="airTempF" type="number" /></Field>
            <Field label="Humidity %"><Input name="humidityPercent" type="number" /></Field>
            <Field label="VPD kPa"><Input name="vpdKpa" type="number" step="0.1" /></Field>
            <Field label="pH"><Input name="ph" type="number" step="0.1" /></Field>
            <Field label="EC/PPM"><Input name="ec" type="number" step="0.1" /></Field>
            <Field label="Light hours"><Input name="lightHours" type="number" /></Field>
            <Field label="Light intensity"><Input name="lightIntensity" type="number" /></Field>
            <Field label="Reservoir temp F"><Input name="reservoirTempF" type="number" /></Field>
            <Field label="Dissolved oxygen"><Input name="dissolvedOxygen" type="number" step="0.1" /></Field>
          </div>
          <Field label="Growing methods"><CheckboxGroup name="growingMethodIds" items={data.growingMethods.map((method) => ({ value: method.id, label: method.name }))} limitHeight /></Field>
          <Field label="Media"><CheckboxGroup name="mediumIds" items={data.growingMedia.map((medium) => ({ value: medium.id, label: medium.name }))} limitHeight /></Field>
          <Field label="Notes"><Input name="notes" /></Field>
          <Button type="submit"><FlaskConical className="h-4 w-4" />Run offline diagnosis</Button>
        </form>
      </Panel>

      <div className="space-y-5">
        <Panel title="Diagnostic History">
          <Select value={selectedCaseId} onChange={(event) => setSelectedCaseId(event.target.value)}>
            {data.diagnosticCases.filter((item) => item.farmId === farmId).map((item) => <option key={item.id} value={item.id}>{cropName(data, item.cropId)} · {item.createdAt.slice(0, 10)} · {titleCase(item.status)}</option>)}
          </Select>
          {selectedCase ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <b>{cropName(data, selectedCase.cropId)}</b>
                  <Select className="w-36" value={selectedCase.status} onChange={(event) => updateData((current) => ({ ...current, diagnosticCases: current.diagnosticCases.map((item) => item.id === selectedCase.id ? { ...item, status: event.target.value as DiagnosticCase["status"], updatedAt: new Date().toISOString() } : item) }))}>
                    <option value="open">Open</option><option value="monitoring">Monitoring</option><option value="resolved">Resolved</option>
                  </Select>
                </div>
                <p className="mt-2 text-muted-foreground">{selectedCase.symptoms}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedCase.photoAssetIds.map((photoId) => {
                    const asset = data.photoAssets.find((photo) => photo.id === photoId);
                    return asset ? <Badge key={photoId} tone="muted">{asset.fileName}</Badge> : null;
                  })}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {selectedCase.photoAssetIds.map((photoId) => {
                    const asset = data.photoAssets.find((photo) => photo.id === photoId);
                    return asset ? <PhotoPreview key={photoId} asset={asset} /> : null;
                  })}
                </div>
                <input ref={fileRef} className="hidden" type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && attachPhoto(event.target.files[0])} />
                <Button className="mt-3" size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>Attach photo</Button>
              </div>
              <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">{diagnosticDisclaimer}</p>
            </div>
          ) : <EmptyState title="No diagnostic selected" body="Create a diagnostic case to see ranked likely causes." />}
        </Panel>
        <Panel title="Ranked Results">
          {results.length ? (
            <div className="space-y-3">
              {results.map((result) => (
                <div key={result.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{result.cause}</p>
                    <Badge tone={result.confidence > 0.65 ? "danger" : result.confidence > 0.35 ? "warning" : "muted"}>{Math.round(result.confidence * 100)}%</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Severity {result.severity} · urgency {result.urgency}{result.extensionRecommended ? " · extension/lab confirmation recommended" : ""}</p>
                  <DetailList title="Evidence" items={result.evidence} />
                  <DetailList title="Check next" items={result.checks} />
                  <DetailList title="Immediate safe actions" items={result.immediateActions} />
                  <DetailList title="Correction plan" items={result.correctionPlan} />
                  <DetailList title="Prevention" items={result.prevention} />
                </div>
              ))}
            </div>
          ) : <EmptyState title="No scored results" body="Run a diagnostic case with symptoms, crop, method, medium, and readings." />}
        </Panel>
      </div>
    </div>
  );
}

function CompatibilityPage({ data, farm }: { data: AppData; farm: Farm }) {
  const [cropId, setCropId] = React.useState(data.crops[0]?.id ?? "");
  const [environmentId, setEnvironmentId] = React.useState(data.environments.find((env) => env.farmId === farm.id)?.id ?? "");
  const [methodIds, setMethodIds] = React.useState<string[]>([data.growingMethods[0]?.id].filter(Boolean));
  const [mediumIds, setMediumIds] = React.useState<string[]>([data.growingMedia[0]?.id].filter(Boolean));
  const crop = data.crops.find((item) => item.id === cropId);
  const environment = data.environments.find((item) => item.id === environmentId);
  const methods = data.growingMethods.filter((item) => methodIds.includes(item.id));
  const media = data.growingMedia.filter((item) => mediumIds.includes(item.id));
  const report = checkCompatibility({ farm, crop, environment, methods, media });
  return (
    <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <Panel title="Compatibility Checker" description="Offline crop, environment, method, medium, pH, EC, root depth, humidity, and hydroponic suitability checks.">
        <div className="grid gap-3">
          <Field label="Crop"><Select value={cropId} onChange={(event) => setCropId(event.target.value)}>{data.crops.filter((item) => !item.archived).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
          <Field label="Environment"><Select value={environmentId} onChange={(event) => setEnvironmentId(event.target.value)}>{data.environments.filter((item) => item.farmId === farm.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
          <Field label="Methods"><CheckboxGroup controlled values={methodIds} onChange={setMethodIds} items={data.growingMethods.map((item) => ({ value: item.id, label: item.name }))} limitHeight /></Field>
          <Field label="Media"><CheckboxGroup controlled values={mediumIds} onChange={setMediumIds} items={data.growingMedia.map((item) => ({ value: item.id, label: item.name }))} limitHeight /></Field>
        </div>
      </Panel>
      <Panel title="Result" action={<Badge tone={report.status === "compatible" ? "success" : report.status === "incompatible" ? "danger" : "warning"}>{titleCase(report.status)} · {report.score}/100</Badge>}>
        <div className="space-y-3">
          {report.issues.map((issue, index) => (
            <div key={`${issue.field}-${index}`} className="rounded-md border p-3">
              <div className="flex items-center gap-2"><Badge tone={issue.status === "compatible" ? "success" : issue.status === "incompatible" ? "danger" : "warning"}>{titleCase(issue.status)}</Badge><p className="font-medium">{titleCase(issue.field)}</p></div>
              <p className="mt-2 text-sm text-muted-foreground">{issue.message}</p>
              <p className="mt-2 text-sm">{issue.suggestedFix}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function WebImportPage({ data, farm, updateData, setError }: { data: AppData; farm: Farm; updateData: (updater: (current: AppData) => AppData, message?: string) => void; setError: (message: string | null) => void }) {
  const [source, setSource] = React.useState<"crop_summary" | "weather_snapshot">("crop_summary");
  const [topic, setTopic] = React.useState("tomato");
  const [location, setLocation] = React.useState(farm.location);
  const [targetCropId, setTargetCropId] = React.useState(data.crops[0]?.id ?? "");
  const [result, setResult] = React.useState<WebImportResult | null>(null);
  const [loading, setLoading] = React.useState(false);

  function runImportLookup() {
    setLoading(true);
    setError(null);
    fetchWebImport(source, topic, location)
      .then(setResult)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }

  function saveAsRecommendation() {
    if (!result) return;
    const createdAt = new Date().toISOString();
    const rec: Recommendation = {
      id: id("web_rec"),
      farmId: farm.id,
      title: result.title,
      category: result.kind === "weather_snapshot" ? "environment" : "diagnostic",
      priority: "normal",
      explanation: `${result.summary}\n\nSource: ${result.source} ${result.sourceUrl}`,
      suggestedAction: result.kind === "weather_snapshot" ? "Review this snapshot against upcoming irrigation, ventilation, and scouting tasks." : "Review the imported reference and decide whether to update crop notes or planning assumptions.",
      createdAt
    };
    updateData((current) => ({ ...current, recommendations: [rec, ...current.recommendations] }), "Imported as recommendation");
  }

  function appendToCropNotes() {
    if (!result || !targetCropId) return;
    updateData(
      (current) => ({
        ...current,
        crops: current.crops.map((crop) =>
          crop.id === targetCropId
            ? {
                ...crop,
                notes: `${crop.notes ? `${crop.notes}\n\n` : ""}Web import from ${result.source}: ${result.summary}\nSource: ${result.sourceUrl}`,
                updatedAt: new Date().toISOString()
              }
            : crop
        )
      }),
      "Imported into crop notes"
    );
  }

  function createFollowUpTask() {
    if (!result) return;
    const timestamp = new Date().toISOString();
    const task: Task = {
      id: id("web_task"),
      farmId: farm.id,
      title: result.kind === "weather_snapshot" ? `Review weather snapshot: ${location || topic}` : `Review imported crop reference: ${topic}`,
      category: "web import review",
      dueDate: todayIso(),
      status: "todo",
      priority: result.kind === "weather_snapshot" ? "normal" : "low",
      estimatedMinutes: 15,
      notes: `${result.summary}\n\nSource: ${result.sourceUrl}`,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    updateData((current) => ({ ...current, tasks: [task, ...current.tasks] }), "Review task created");
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <Panel title="Optional Web Import" description="Requires internet only when you press Fetch. Imported data is saved locally after review.">
        <div className="grid gap-3">
          <Field label="Import type">
            <Select value={source} onChange={(event) => setSource(event.target.value as "crop_summary" | "weather_snapshot")}>
              <option value="crop_summary">Crop or plant reference note</option>
              <option value="weather_snapshot">Weather snapshot by location</option>
            </Select>
          </Field>
          <Field label={source === "weather_snapshot" ? "Location or ZIP" : "Crop or plant topic"}>
            <Input value={source === "weather_snapshot" ? location : topic} onChange={(event) => (source === "weather_snapshot" ? setLocation(event.target.value) : setTopic(event.target.value))} />
          </Field>
          {source === "crop_summary" ? (
            <Field label="Append target crop">
              <Select value={targetCropId} onChange={(event) => setTargetCropId(event.target.value)}>
                {data.crops.filter((crop) => !crop.archived).map((crop) => (
                  <option key={crop.id} value={crop.id}>
                    {crop.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Button onClick={runImportLookup} disabled={loading}>
            <Download className="h-4 w-4" />
            {loading ? "Fetching..." : "Fetch"}
          </Button>
        </div>
      </Panel>

      <Panel title="Review Before Import">
        {result ? (
          <div className="space-y-4">
            <div className="rounded-md border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="muted">{result.source}</Badge>
                <Badge>{titleCase(result.kind)}</Badge>
              </div>
              <h3 className="mt-3 text-lg font-semibold">{result.title}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{result.summary}</p>
              <p className="mt-3 break-all text-xs text-muted-foreground">{result.sourceUrl}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={saveAsRecommendation}>
                <Save className="h-4 w-4" />
                Save recommendation
              </Button>
              {result.kind === "crop_summary" ? (
                <Button variant="secondary" onClick={appendToCropNotes}>
                  <Leaf className="h-4 w-4" />
                  Append to crop notes
                </Button>
              ) : null}
              <Button variant="secondary" onClick={createFollowUpTask}>
                <ClipboardList className="h-4 w-4" />
                Create review task
              </Button>
            </div>
          </div>
        ) : (
          <EmptyState title="No web data loaded" body="Choose an import type and fetch a preview before saving anything locally." />
        )}
      </Panel>
    </div>
  );
}

function CollaborationPage({ data, farm, updateData, setData, setError }: { data: AppData; farm: Farm; updateData: (updater: (current: AppData) => AppData, message?: string) => void; setData: React.Dispatch<React.SetStateAction<AppData | null>>; setError: (message: string | null) => void }) {
  const [groupCode, setGroupCode] = React.useState(data.appSettings.collaboration?.groupCode ?? "");
  const [deviceName, setDeviceName] = React.useState(data.appSettings.collaboration?.deviceName ?? "My device");
  const [lastPackagePath, setLastPackagePath] = React.useState("");
  const [handoffMessage, setHandoffMessage] = React.useState("");
  const [busyAction, setBusyAction] = React.useState<"package" | "transfer" | "settings" | "show" | "">("");
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  function saveLink(code = groupCode) {
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    updateData(
      (current) => ({
        ...current,
        appSettings: {
          ...current.appSettings,
          collaboration: { groupCode: clean, deviceName: deviceName.trim() || "My device", lastSyncAt: current.appSettings.collaboration?.lastSyncAt }
        }
      }),
      "Collaboration link saved"
    );
    setGroupCode(clean);
  }

  function buildSyncPayload(clean: string) {
    return {
      product: "GrowOps Planner",
      packageType: "private-sync",
      version: data.appSettings.appVersion,
      groupCode: clean,
      deviceName: deviceName.trim() || "My device",
      exportedAt: new Date().toISOString(),
      farmId: farm.id,
      snapshot: data
    };
  }

  function generateCode() {
    const code = Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map((value) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[value % 32])
      .join("");
    setGroupCode(code);
    saveLink(code);
  }

  async function createSyncPackage(message = "Sync package exported") {
    const clean = groupCode.trim().toUpperCase();
    if (!clean) {
      setError("Create or enter a group code before exporting a sync package.");
      return "";
    }
    setBusyAction("package");
    setHandoffMessage("");
    try {
      const path = await exportSyncPackageFile(`growops-sync-${clean}-${new Date().toISOString().slice(0, 10)}.json`, buildSyncPayload(clean));
      setLastPackagePath(path);
      setHandoffMessage(path);
      updateData(
        (current) => ({
          ...current,
          collaborationEvents: [
            {
              id: id("collab"),
              farmId: farm.id,
              eventType: message.toLowerCase().includes("bluetooth") ? "bluetooth_package" : "export",
              groupCode: clean,
              deviceName: deviceName.trim() || "My device",
              packageName: path,
              summary: `${message}: ${path}`,
              createdAt: new Date().toISOString()
            },
            ...(current.collaborationEvents ?? [])
          ],
          appSettings: {
            ...current.appSettings,
            collaboration: { groupCode: clean, deviceName: deviceName.trim() || "My device", lastSyncAt: current.appSettings.collaboration?.lastSyncAt }
          }
        }),
        message
      );
      return path;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return "";
    } finally {
      setBusyAction("");
    }
  }

  function exportSyncPackage() {
    void createSyncPackage();
  }

  async function createBluetoothPackage() {
    const path = await createSyncPackage("Bluetooth package ready");
    if (path) setHandoffMessage(`Created Bluetooth-ready package: ${path}`);
  }

  function launchBluetoothTransfer() {
    setBusyAction("transfer");
    openBluetoothTransfer()
      .then(setHandoffMessage)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusyAction(""));
  }

  function launchBluetoothSettings() {
    setBusyAction("settings");
    openBluetoothSettings()
      .then(setHandoffMessage)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusyAction(""));
  }

  function showLastPackage() {
    if (!lastPackagePath) return;
    setBusyAction("show");
    revealLocalFile(lastPackagePath)
      .then((path) => setHandoffMessage(`Opened local package: ${path}`))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusyAction(""));
  }

  function importSyncPackage(file: File) {
    file
      .text()
      .then((text) => {
        const payload = JSON.parse(text) as { packageType?: string; groupCode?: string; snapshot?: AppData };
        const clean = groupCode.trim().toUpperCase();
        if (payload.packageType !== "private-sync" || !payload.snapshot) throw new Error("This is not a GrowOps private sync package.");
        if (!clean || payload.groupCode !== clean) throw new Error("The sync package group code does not match this workspace.");
        const merged = mergeSnapshots(data, payload.snapshot);
        const eventRecord = {
          id: id("collab"),
          farmId: farm.id,
          eventType: "import" as const,
          groupCode: clean,
          deviceName: payload.groupCode,
          packageName: file.name,
          summary: `Imported ${file.name} and merged peer data by newest timestamp.`,
          createdAt: new Date().toISOString()
        };
        setData({
          ...merged,
          collaborationEvents: [eventRecord, ...(merged.collaborationEvents ?? [])],
          appSettings: {
            ...merged.appSettings,
            activeFarmId: farm.id,
            collaboration: { groupCode: clean, deviceName, lastSyncAt: new Date().toISOString() }
          }
        });
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
      <Panel title="Private Group Code" description="No cloud account is required. Share the code and exchange local sync files with the other user.">
        <div className="grid gap-3">
          <Field label="Device name">
            <Input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} />
          </Field>
          <Field label="Group code">
            <Input value={groupCode} onChange={(event) => setGroupCode(event.target.value.toUpperCase())} placeholder="Example: G7K2Q9" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => saveLink()}>
              <Link2 className="h-4 w-4" />
              Save code
            </Button>
            <Button variant="secondary" onClick={generateCode}>
              Generate code
            </Button>
          </div>
        </div>
      </Panel>

      <Panel title="Sync Packages" description="Export a package, send it privately, then import the other user's package with the same group code.">
        <div className="space-y-4">
          <div className="rounded-md border p-3 text-sm">
            <p className="font-medium">Current link</p>
            <p className="mt-1 text-muted-foreground">{data.appSettings.collaboration?.groupCode ? `Group ${data.appSettings.collaboration.groupCode} on ${data.appSettings.collaboration.deviceName}` : "No group code saved yet."}</p>
            <p className="mt-1 text-xs text-muted-foreground">Last sync: {data.appSettings.collaboration?.lastSyncAt ?? "Never"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={exportSyncPackage}>
              <Download className="h-4 w-4" />
              Export sync package
            </Button>
            <input ref={fileRef} className="hidden" type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && importSyncPackage(event.target.files[0])} />
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" />
              Import peer package
            </Button>
          </div>
        </div>
      </Panel>

      <Panel title="Bluetooth Handoff" description="Windows Bluetooth file transfer uses the same private group-code package. It works without internet or a cloud relay.">
        <div className="space-y-4">
          <div className="rounded-md border p-3 text-sm">
            <p className="font-medium">How it works</p>
            <p className="mt-1 text-muted-foreground">Create a Bluetooth package, pair the computers in Windows, send the JSON file with Bluetooth File Transfer, then import it on the receiving device.</p>
            {lastPackagePath ? <p className="mt-2 break-all text-xs text-muted-foreground">{lastPackagePath}</p> : null}
            {handoffMessage ? <p className="mt-2 text-xs text-muted-foreground">{handoffMessage}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={createBluetoothPackage} disabled={busyAction === "package"}>
              <Bluetooth className="h-4 w-4" />
              {busyAction === "package" ? "Creating..." : "Create Bluetooth package"}
            </Button>
            <Button variant="secondary" onClick={showLastPackage} disabled={!lastPackagePath || busyAction === "show"}>
              <FolderOpen className="h-4 w-4" />
              Show file
            </Button>
            <Button variant="secondary" onClick={launchBluetoothTransfer} disabled={busyAction === "transfer"}>
              <Upload className="h-4 w-4" />
              Open Bluetooth Transfer
            </Button>
            <Button variant="secondary" onClick={launchBluetoothSettings} disabled={busyAction === "settings"}>
              <Settings className="h-4 w-4" />
              Bluetooth Settings
            </Button>
          </div>
        </div>
      </Panel>

      <Panel title="Collaboration History" description="Local audit trail of package imports and exports.">
        <div className="max-h-72 overflow-auto rounded-md border">
          <table className="table-grid">
            <thead><tr><th>Date</th><th>Type</th><th>Package</th><th>Summary</th></tr></thead>
            <tbody>{(data.collaborationEvents ?? []).filter((event) => !event.farmId || event.farmId === farm.id).map((event) => <tr key={event.id}><td>{event.createdAt.slice(0, 19).replace("T", " ")}</td><td>{titleCase(event.eventType)}</td><td>{event.packageName ?? event.groupCode ?? ""}</td><td>{event.summary}</td></tr>)}</tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function TraceabilityPage({ data, farm }: { data: AppData; farm: Farm }) {
  const plantings = data.plantings.filter((planting) => planting.farmId === farm.id);
  const [plantingId, setPlantingId] = React.useState(plantings[0]?.id ?? "");
  const planting = plantings.find((item) => item.id === plantingId) ?? plantings[0];
  const crop = data.crops.find((item) => item.id === planting?.cropId);
  const environment = data.environments.find((item) => item.id === planting?.environmentId);
  const unit = data.bedOrUnits.find((item) => item.id === planting?.bedOrUnitId);
  const tasks = planting ? data.tasks.filter((task) => task.plantingId === planting.id) : [];
  const supplies = planting ? data.supplyItems.filter((item) => item.plantingId === planting.id) : [];
  const seedOrders = planting ? data.seedOrderItems.filter((item) => item.plantingId === planting.id || item.cropId === planting.cropId) : [];
  const harvests = planting ? data.harvestLogs.filter((item) => item.plantingId === planting.id) : [];
  const expenses = planting ? data.expenseLogs.filter((item) => item.linkedEntityId === planting.id || item.linkedEntityId === planting.cropId || item.linkedEntityId === planting.bedOrUnitId) : [];
  const diagnostics = planting ? data.diagnosticCases.filter((item) => item.cropId === planting.cropId && (item.environmentId === planting.environmentId || item.locationZone.includes(unit?.name ?? ""))) : [];
  const revenue = harvests.reduce((sum, harvest) => sum + harvest.revenue, 0);
  const expenseTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  React.useEffect(() => {
    if (!plantingId || !plantings.some((item) => item.id === plantingId)) setPlantingId(plantings[0]?.id ?? "");
  }, [plantingId, plantings]);

  if (!planting) {
    return <EmptyState title="No plantings to trace" body="Create a planting first, then this page will show its seed, task, diagnostic, harvest, and revenue chain." />;
  }

  return (
    <div className="space-y-5">
      <Panel
        title="Traceability Chain"
        description="Follow one planting from crop profile through location, supplies, tasks, diagnostics, harvest lots, and profitability."
        action={<Button size="sm" variant="secondary" onClick={() => printReport("GrowOps Traceability Report", buildTraceabilityReportHtml(data, farm, planting))}><FileText className="h-4 w-4" />Trace report</Button>}
      >
        <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
          <Field label="Planting"><Select value={planting.id} onChange={(event) => setPlantingId(event.target.value)}>{plantings.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
          <div className="grid gap-3 md:grid-cols-4">
            <MiniStat label="Crop" value={crop?.name ?? "Unknown"} detail={crop ? titleCase(crop.cropType) : undefined} />
            <MiniStat label="Location" value={environment?.name ?? "Unknown"} detail={unit?.name} />
            <MiniStat label="Harvest revenue" value={formatCurrency(revenue, farm.currency)} detail={`${harvests.length} harvest lots`} />
            <MiniStat label="Linked expenses" value={formatCurrency(expenseTotal, farm.currency)} detail={`${expenses.length} records`} />
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel title="Production Chain">
          <div className="space-y-3">
            <TraceStep title="Crop profile" detail={`${crop?.name ?? "Unknown"} - ${crop?.daysToMaturity ?? 0} days - ${crop?.harvestUnit ?? "unit"}`} />
            <TraceStep title="Location" detail={`${environment?.name ?? "Unknown"} / ${unit?.name ?? "Unknown"} - ${unit ? `${unit.capacityPlants} plant slots` : "no unit"}`} />
            <TraceStep title="Schedule" detail={`Seed ${planting.seedDate} - Harvest ${planting.firstHarvestDate} - End ${planting.terminationDate}`} />
            <TraceStep title="Expected output" detail={`${formatNumber(planting.expectedYield)} ${crop?.harvestUnit ?? "units"} - ${formatCurrency(planting.expectedRevenue, farm.currency)}`} />
            <TraceStep title="Actual output" detail={`${formatNumber(harvests.reduce((sum, harvest) => sum + harvest.quantity, 0))} harvested - ${formatCurrency(revenue, farm.currency)}`} />
          </div>
        </Panel>
        <Panel title="Linked Records">
          <div className="grid gap-3 md:grid-cols-2">
            <TraceList title="Seed Orders" empty="No seed orders linked." items={seedOrders.map((item) => `${item.seedName}: ${formatNumber(item.quantityNeeded)} ${item.unit}${item.ordered ? " ordered" : ""}`)} />
            <TraceList title="Supplies" empty="No supplies linked." items={supplies.map((item) => `${item.name}: ${formatNumber(item.quantity)} ${item.unit} - ${formatCurrency(item.estimatedCost, farm.currency)}`)} />
            <TraceList title="Tasks" empty="No tasks linked." items={tasks.slice(0, 8).map((task) => `${task.dueDate}: ${task.title} - ${titleCase(task.status)}`)} />
            <TraceList title="Diagnostics" empty="No diagnostics linked." items={diagnostics.map((item) => `${item.createdAt.slice(0, 10)}: ${titleCase(item.status)} - ${item.symptoms.slice(0, 80)}`)} />
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Harvest Lots">
          {harvests.length ? (
            <div className="max-h-72 overflow-auto rounded-md border">
              <table className="table-grid"><thead><tr><th>Date</th><th>Quantity</th><th>Grade</th><th>Destination</th><th>Revenue</th></tr></thead><tbody>{harvests.map((harvest) => <tr key={harvest.id}><td>{harvest.harvestDate}</td><td>{formatNumber(harvest.quantity)} {harvest.unit}</td><td>{titleCase(harvest.grade)}</td><td>{harvest.destination}</td><td>{formatCurrency(harvest.revenue, farm.currency)}</td></tr>)}</tbody></table>
            </div>
          ) : <EmptyState title="No harvest lots" body="Harvest logs tied to this planting will appear here." />}
        </Panel>
        <Panel title="Linked Expenses">
          {expenses.length ? (
            <div className="max-h-72 overflow-auto rounded-md border">
              <table className="table-grid"><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th></tr></thead><tbody>{expenses.map((expense) => <tr key={expense.id}><td>{expense.date}</td><td>{titleCase(expense.category)}</td><td>{expense.description}</td><td>{formatCurrency(expense.amount, farm.currency)}</td></tr>)}</tbody></table>
            </div>
          ) : <EmptyState title="No linked expenses" body="Expenses can be linked to plantings, crops, or units to show production cost here." />}
        </Panel>
      </div>
    </div>
  );
}

function TraceStep({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-md border p-3"><p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{title}</p><p className="mt-1 text-sm">{detail}</p></div>;
}

function TraceList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return <div className="rounded-md border p-3"><p className="text-sm font-semibold">{title}</p>{items.length ? <ul className="mt-2 space-y-1 text-sm text-muted-foreground">{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">{empty}</p>}</div>;
}

type LabelKind = "plantings" | "environments" | "units" | "inventory" | "supplies" | "harvests" | "diagnostics";

interface LabelTarget {
  id: string;
  label: string;
  detail: string;
  text: string;
}

function LabelsPage({ data, farm }: { data: AppData; farm: Farm }) {
  const [kind, setKind] = React.useState<LabelKind>("plantings");
  const targets = React.useMemo(() => labelTargetsForKind(data, farm, kind), [data, farm, kind]);
  const [selectedIds, setSelectedIds] = React.useState<string[]>(targets.slice(0, 12).map((target) => target.id));
  const [codes, setCodes] = React.useState<Record<string, string>>({});
  const selectedTargets = React.useMemo(() => targets.filter((target) => selectedIds.includes(target.id)), [targets, selectedIds]);

  React.useEffect(() => {
    setSelectedIds(targets.slice(0, 12).map((target) => target.id));
  }, [kind]);

  React.useEffect(() => {
    let cancelled = false;
    Promise.all(selectedTargets.map(async (target) => [target.id, await QRCode.toDataURL(target.text, { margin: 1, width: 180 })] as const))
      .then((entries) => {
        if (!cancelled) setCodes(Object.fromEntries(entries));
      })
      .catch(() => {
        if (!cancelled) setCodes({});
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTargets]);

  function printLabels() {
    const html = `
      <html><head><title>GrowOps Labels</title><style>
        body{font-family:Arial,sans-serif;margin:24px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
        .label{border:1px solid #222;padding:10px;min-height:180px;break-inside:avoid}.label img{width:96px;height:96px;float:right}
        h2{font-size:14px;margin:0 0 6px}.meta{font-size:11px;line-height:1.35}
      </style></head><body><div class="grid">
        ${selectedTargets.map((target) => `<div class="label"><img src="${codes[target.id] ?? ""}"/><h2>${escapeHtml(target.label)}</h2><div class="meta"><b>${escapeHtml(labelKindLabel(kind))}</b><br/>${escapeHtml(target.detail)}<br/>ID: ${escapeHtml(target.id)}</div></div>`).join("")}
      </div><script>window.print()</script></body></html>`;
    printReport("GrowOps Labels", html);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <Panel title="Barcode / QR Label Selection" description="QR labels encode plain text that generic barcode apps can read without GrowOps installed.">
        <div className="mb-3 grid gap-3 md:grid-cols-[1fr_auto]">
          <Field label="Label type">
            <Select value={kind} onChange={(event) => setKind(event.target.value as LabelKind)}>
              <option value="plantings">Plantings</option>
              <option value="environments">Environments</option>
              <option value="units">Beds / units</option>
              <option value="inventory">Inventory lots</option>
              <option value="supplies">Supply items</option>
              <option value="harvests">Harvest lots</option>
              <option value="diagnostics">Diagnostic cases</option>
            </Select>
          </Field>
          <div className="flex flex-wrap items-end gap-2">
          <Button size="sm" variant="secondary" onClick={() => setSelectedIds(targets.map((target) => target.id))}>Select all</Button>
          <Button size="sm" variant="secondary" onClick={() => setSelectedIds([])}>Clear</Button>
          <Button size="sm" onClick={printLabels} disabled={!selectedTargets.length}><Printer className="h-4 w-4" />Print labels</Button>
          </div>
        </div>
        <div className="max-h-[65vh] overflow-auto rounded-md border">
          <table className="table-grid">
            <thead><tr><th className="w-10"></th><th>Label</th><th>Details</th></tr></thead>
            <tbody>{targets.map((target) => <tr key={target.id}><td><input type="checkbox" checked={selectedIds.includes(target.id)} onChange={() => setSelectedIds((current) => current.includes(target.id) ? current.filter((idValue) => idValue !== target.id) : [...current, target.id])} /></td><td>{target.label}</td><td>{target.detail}</td></tr>)}</tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Label Preview">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {selectedTargets.map((target) => (
            <div key={target.id} className="rounded-md border bg-card p-3">
              {codes[target.id] ? <img alt={`${target.label} barcode`} className="h-28 w-28" src={codes[target.id]} /> : <div className="h-28 w-28 rounded bg-muted" />}
              <p className="mt-2 text-sm font-semibold">{target.label}</p>
              <p className="text-xs text-muted-foreground">{target.detail}</p>
              <pre className="mt-2 whitespace-pre-wrap rounded bg-muted p-2 text-[10px]">{target.text}</pre>
            </div>
          ))}
          {!selectedTargets.length ? <EmptyState title="No labels selected" body="Choose one or more records to preview and print their QR labels." /> : null}
        </div>
      </Panel>
    </div>
  );
}

function RecommendationsPage({ data, farmId, updateData }: { data: AppData; farmId: string; updateData: (updater: (current: AppData) => AppData, message?: string) => void }) {
  const recs = data.recommendations.filter((rec) => rec.farmId === farmId);
  return (
    <Panel
      title="Local Recommendations"
      action={<Button size="sm" onClick={() => updateData((current) => ({ ...current, recommendations: generateRecommendations(current, farmId) }), "Recommendations refreshed")}><RefreshCcw className="h-4 w-4" />Refresh</Button>}
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {recs.map((rec) => (
          <div key={rec.id} className="rounded-md border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <Badge tone="muted">{titleCase(rec.category)}</Badge>
              <PriorityBadge priority={rec.priority} />
            </div>
            <h3 className="mt-3 font-semibold">{rec.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{rec.explanation}</p>
            <p className="mt-3 text-sm">{rec.suggestedAction}</p>
          </div>
        ))}
        {!recs.length ? <EmptyState title="No recommendations yet" body="Refresh after adding seed inventory, spaces, tasks, diagnostics, or crop plans." /> : null}
      </div>
    </Panel>
  );
}

function DataPage({ data, status, farm, updateData, setData, setError }: { data: AppData; status: AppStatus | null; farm: Farm; updateData: (updater: (current: AppData) => AppData, message?: string) => void; setData: React.Dispatch<React.SetStateAction<AppData | null>>; setError: (message: string | null) => void }) {
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const farmId = farm.id;
  function backupRecord(path: string, statusValue: BackupRecord["status"]): BackupRecord {
    return { id: id("backup"), farmId, createdAt: new Date().toISOString(), filePath: path, sizeBytes: JSON.stringify(data).length, status: statusValue, notes: "" };
  }
  return (
    <div className="space-y-5">
      <Panel title="Local Data Location">
        <div className="grid gap-3 md:grid-cols-2">
          <PathRow label="SQLite database" value={status?.dbPath ?? "Loading"} />
          <PathRow label="App data folder" value={status?.appDataDir ?? "Loading"} />
          <PathRow label="Photo folder" value={status?.photoDir ?? "Loading"} />
          <PathRow label="Backup folder" value={status?.backupDir ?? "Loading"} />
          <PathRow label="Export folder" value={status?.exportDir ?? "Loading"} />
          <PathRow label="Storage mode" value={status?.sqliteAvailable ? "SQLite via Tauri" : "Browser fallback localStorage"} />
        </div>
      </Panel>
      <Panel title="Backup, Restore, and Export">
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              exportBackup(data)
                .then((path) => updateData((current) => ({ ...current, backupRecords: [...current.backupRecords, backupRecord(path, "created")], appSettings: { ...current.appSettings, lastBackupAt: new Date().toISOString() } }), "Backup exported"))
                .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
            }
          >
            <Download className="h-4 w-4" />Export full JSON backup
          </Button>
          <input
            ref={fileRef}
            className="hidden"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              file.text()
                .then(importBackupText)
                .then((imported) => {
                  const record = backupRecord(file.name, "imported");
                  const restorePoint = createRestorePoint(data, `Before importing ${file.name}`);
                  setData({
                    ...imported,
                    appSettings: {
                      ...imported.appSettings,
                      restorePoints: [restorePoint, ...(data.appSettings.restorePoints ?? [])].slice(0, 24)
                    },
                    backupRecords: [...imported.backupRecords, record]
                  });
                })
                .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
            }}
          />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" />Import backup JSON</Button>
          <Button variant="secondary" onClick={() => exportCsvFile("growops-crop-plan.csv", toCsv(data.plantings.filter((item) => item.farmId === farmId).map((item) => ({ name: item.name, crop: cropName(data, item.cropId), seedDate: item.seedDate, firstHarvestDate: item.firstHarvestDate, terminationDate: item.terminationDate, expectedYield: item.expectedYield, expectedRevenue: item.expectedRevenue })), ["name", "crop", "seedDate", "firstHarvestDate", "terminationDate", "expectedYield", "expectedRevenue"]))}><Download className="h-4 w-4" />Crop plan CSV</Button>
          <Button variant="secondary" onClick={() => exportCsvFile("growops-tasks.csv", toCsv(data.tasks.filter((item) => item.farmId === farmId), ["title", "category", "dueDate", "status", "priority", "estimatedMinutes", "notes"]))}><Download className="h-4 w-4" />Tasks CSV</Button>
          <Button variant="secondary" onClick={() => exportCsvFile("growops-harvests.csv", toCsv(data.harvestLogs.filter((item) => item.farmId === farmId).map((item) => ({ ...item, crop: cropName(data, item.cropId) })), ["harvestDate", "crop", "quantity", "unit", "grade", "destination", "salePrice", "revenue", "wasteLoss", "notes"]))}><Download className="h-4 w-4" />Harvest CSV</Button>
          <Button variant="secondary" onClick={() => exportCsvFile("growops-diagnostics.csv", toCsv(data.diagnosticCases.filter((item) => item.farmId === farmId).map((item) => ({ crop: cropName(data, item.cropId), stage: item.growthStage, symptoms: item.symptoms, status: item.status, createdAt: item.createdAt })), ["crop", "stage", "symptoms", "status", "createdAt"]))}><Download className="h-4 w-4" />Diagnostics CSV</Button>
          <Button variant="destructive" onClick={() => updateData(() => createSeedData(), "Demo data reset")}><RefreshCcw className="h-4 w-4" />Reset demo data</Button>
        </div>
      </Panel>
      <ReportsAndCalendarPanel data={data} farm={farm} />
      <BulkImportPanel data={data} farm={farm} updateData={updateData} setError={setError} />
      <Panel title="Fresh Start And Quick Delete" description="Clear clutter without hunting through every screen. Built-in libraries are kept unless you archive them.">
        <div className="mb-5 flex flex-wrap gap-2">
          <Button variant="destructive" onClick={() => updateData(() => createFreshData(), "Fresh start created")}>
            <RefreshCcw className="h-4 w-4" />
            Fresh start
          </Button>
          <Button variant="secondary" onClick={() => updateData(() => createSeedData(), "Demo data loaded")}>
            <Sprout className="h-4 w-4" />
            Load demo data
          </Button>
        </div>
        <QuickDeletePanel data={data} farmId={farmId} updateData={updateData} />
      </Panel>
      <RestoreCenterPanel data={data} updateData={updateData} setError={setError} />
      <Panel title="Backup History">
        <div className="rounded-md border">
          <table className="table-grid"><thead><tr><th>Date</th><th>Status</th><th>Path</th><th>Size</th></tr></thead><tbody>{data.backupRecords.map((record) => <tr key={record.id}><td>{record.createdAt.slice(0, 19).replace("T", " ")}</td><td>{titleCase(record.status)}</td><td>{record.filePath}</td><td>{formatNumber(record.sizeBytes / 1024)} KB</td></tr>)}</tbody></table>
        </div>
      </Panel>
    </div>
  );
}

function ReportsAndCalendarPanel({ data, farm }: { data: AppData; farm: Farm }) {
  return (
    <Panel title="Reports and Calendar" description="Reports open as printable pages. Use the system print dialog to save PDF locally.">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => printReport("GrowOps Crop Plan", buildCropPlanReportHtml(data, farm))}><FileText className="h-4 w-4" />Crop plan report</Button>
        <Button variant="secondary" onClick={() => printReport("GrowOps Weekly Work Plan", buildWeeklyWorkPlanReportHtml(data, farm))}><Printer className="h-4 w-4" />Weekly work plan</Button>
        <Button variant="secondary" onClick={() => printReport("GrowOps Task Sheet", buildTaskReportHtml(data, farm))}><Printer className="h-4 w-4" />Task sheet</Button>
        <Button variant="secondary" onClick={() => printReport("GrowOps Harvest Report", buildHarvestReportHtml(data, farm))}><FileText className="h-4 w-4" />Harvest report</Button>
        <Button variant="secondary" onClick={() => printReport("GrowOps Profitability Report", buildProfitabilityReportHtml(data, farm))}><FileText className="h-4 w-4" />Profitability report</Button>
        <Button variant="secondary" onClick={() => printReport("GrowOps Diagnostic Report", buildDiagnosticReportHtml(data, farm))}><FileText className="h-4 w-4" />Diagnostic report</Button>
        <Button variant="secondary" onClick={() => printReport("GrowOps Traceability Packet", buildTraceabilitySummaryReportHtml(data, farm))}><FileText className="h-4 w-4" />Traceability packet</Button>
        <Button variant="secondary" onClick={() => printReport("GrowOps Inventory Report", buildInventoryReportHtml(data, farm))}><FileText className="h-4 w-4" />Inventory report</Button>
        <Button variant="secondary" onClick={() => printReport("GrowOps Seed Reservation Report", buildSeedReservationReportHtml(data, farm))}><FileText className="h-4 w-4" />Seed reservations</Button>
        <Button variant="secondary" onClick={() => exportIcs(data, farm.id)}><CalendarDays className="h-4 w-4" />Calendar .ics</Button>
      </div>
    </Panel>
  );
}

function RestoreCenterPanel({
  data,
  updateData,
  setError
}: {
  data: AppData;
  updateData: (updater: (current: AppData) => AppData, message?: string) => void;
  setError: (message: string | null) => void;
}) {
  const restorePoints = data.appSettings.restorePoints ?? [];

  function restore(point: RestorePoint) {
    try {
      const restored = safeParseJsonBackup(point.snapshotJson);
      updateData((current) => ({
        ...restored,
        appSettings: {
          ...restored.appSettings,
          restorePoints: current.appSettings.restorePoints ?? []
        }
      }), "Restore point restored");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Panel title="Restore Center" description="Destructive actions save compact local restore points. Restore points are included in local app storage and capped automatically.">
      {restorePoints.length ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => updateData((current) => ({ ...current, appSettings: { ...current.appSettings, restorePoints: [] } }), "Restore history cleared")}>Clear restore history</Button>
          </div>
          <div className="max-h-80 overflow-auto rounded-md border">
            <table className="table-grid">
              <thead><tr><th>Date</th><th>Action</th><th>Snapshot</th><th></th></tr></thead>
              <tbody>
                {restorePoints.map((point) => (
                  <tr key={point.id}>
                    <td>{point.createdAt.slice(0, 19).replace("T", " ")}</td>
                    <td>{point.message}</td>
                    <td className="text-muted-foreground">{point.summary}</td>
                    <td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="secondary" onClick={() => restore(point)}><Undo2 className="h-4 w-4" />Restore</Button>
                        <Button size="icon" variant="ghost" title="Remove restore point" onClick={() => updateData((current) => ({ ...current, appSettings: { ...current.appSettings, restorePoints: (current.appSettings.restorePoints ?? []).filter((item) => item.id !== point.id) } }), "Restore point cleared")}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState title="No restore points yet" body="Delete, reset, import, or fresh-start actions will appear here so you can restore an earlier local state." />
      )}
    </Panel>
  );
}

function BulkImportPanel({ data, farm, updateData, setError }: { data: AppData; farm: Farm; updateData: (updater: (current: AppData) => AppData, message?: string) => void; setError: (message: string | null) => void }) {
  const [kind, setKind] = React.useState<"tasks" | "harvests" | "inventory" | "expenses">("tasks");
  const [text, setText] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  function runImport(csvText = text) {
    try {
      const rows = parseCsv(csvText);
      const timestamp = new Date().toISOString();
      if (kind === "tasks") {
        const tasks = rows.map((row) => taskSchema.parse({ title: row.title, dueDate: row.dueDate || todayIso(), status: row.status || "todo", priority: row.priority || "normal", estimatedMinutes: row.estimatedMinutes || 30, notes: row.notes || "" }))
          .map((task): Task => ({ id: id("task"), farmId: farm.id, category: "bulk import", ...task, createdAt: timestamp, updatedAt: timestamp }));
        updateData((current) => ({ ...current, tasks: [...tasks, ...current.tasks] }), `${tasks.length} tasks imported`);
      }
      if (kind === "harvests") {
        const harvests = rows.map((row) => {
          const crop = data.crops.find((item) => item.name.toLowerCase() === (row.crop || "").toLowerCase()) ?? data.crops[0];
          const parsed = harvestSchema.parse({ cropId: crop.id, plantingId: "", harvestDate: row.harvestDate || row.date || todayIso(), quantity: row.quantity || 1, unit: row.unit || crop.harvestUnit, grade: row.grade || "standard", destination: row.destination || "", salePrice: row.salePrice || 0, wasteLoss: row.wasteLoss || 0, notes: row.notes || "" });
          return { id: id("harvest"), farmId: farm.id, ...parsed, plantingId: undefined, revenue: parsed.quantity * parsed.salePrice, createdAt: timestamp, updatedAt: timestamp } as HarvestLog;
        });
        updateData((current) => ({ ...current, harvestLogs: [...harvests, ...current.harvestLogs] }), `${harvests.length} harvest rows imported`);
      }
      if (kind === "inventory") {
        const lots = rows.map((row) => {
          const crop = findCropForImport(data, row.cropId || row.crop || row.cropName || "");
          return inventoryLotSchema.parse({ itemType: row.itemType || "supply", cropId: crop?.id ?? "", name: row.name, lotCode: row.lotCode || "", vendor: row.vendor || "", quantityOnHand: row.quantityOnHand || row.quantity || 0, reservedQuantity: row.reservedQuantity || 0, unit: row.unit || "each", seedsPerUnit: row.seedsPerUnit || "", germinationRatePercent: row.germinationRatePercent || row.germination || "", unitCost: row.unitCost || 0, storageLocation: row.storageLocation || "", receivedDate: row.receivedDate || todayIso(), expirationDate: row.expirationDate || "", notes: row.notes || "" });
        })
          .map((lot): InventoryLot => ({ id: id("lot"), farmId: farm.id, ...lot, cropId: lot.cropId || undefined, expirationDate: lot.expirationDate || undefined, createdAt: timestamp, updatedAt: timestamp }));
        updateData((current) => ({ ...current, inventoryLots: [...lots, ...current.inventoryLots] }), `${lots.length} inventory lots imported`);
      }
      if (kind === "expenses") {
        const expenses = rows.map((row) => expenseSchema.parse({ date: row.date || todayIso(), category: row.category || "other", vendor: row.vendor || "", description: row.description || row.name, amount: row.amount || 0, notes: row.notes || "" }))
          .map((expense): ExpenseLog => ({ id: id("expense"), farmId: farm.id, ...expense, createdAt: timestamp, updatedAt: timestamp }));
        updateData((current) => ({ ...current, expenseLogs: [...expenses, ...current.expenseLogs] }), `${expenses.length} expenses imported`);
      }
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const sample = kind === "tasks"
    ? "title,dueDate,status,priority,estimatedMinutes,notes\nScout greenhouse,2026-05-04,todo,high,20,Check airflow"
    : kind === "harvests"
      ? "crop,harvestDate,quantity,unit,grade,destination,salePrice,wasteLoss,notes\nLettuce,2026-05-04,12,head,premium,Farm stand,3,0,"
      : kind === "inventory"
      ? "itemType,crop,name,lotCode,vendor,quantityOnHand,reservedQuantity,unit,seedsPerUnit,germinationRatePercent,unitCost,storageLocation,receivedDate,expirationDate,notes\nseed,Lettuce,Lettuce mix,LOT-1,Seed vendor,1,0,oz,25000,88,22,Seed freezer,2026-05-04,2028-01-01,"
        : "date,category,vendor,description,amount,notes\n2026-05-04,media,Farm supply,Potting mix,42,";

  return (
    <Panel title="Bulk Information Import" description="Paste CSV or load a local CSV. Rows are validated before they are added.">
      <div className="grid gap-3 lg:grid-cols-[240px_1fr]">
        <div className="space-y-3">
          <Field label="Import type">
            <Select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
              <option value="tasks">Tasks</option>
              <option value="harvests">Harvest logs</option>
              <option value="inventory">Inventory lots</option>
              <option value="expenses">Expenses</option>
            </Select>
          </Field>
          <input ref={fileRef} className="hidden" type="file" accept=".csv,text/csv" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) file.text().then((csvText) => { setText(csvText); runImport(csvText); }).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
          }} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" />Load CSV</Button>
          <Button onClick={() => runImport()}><Upload className="h-4 w-4" />Import pasted CSV</Button>
          <Button variant="ghost" onClick={() => setText(sample)}>Use sample</Button>
        </div>
        <Textarea className="min-h-44 font-mono text-xs" value={text} onChange={(event) => setText(event.target.value)} placeholder={sample} />
      </div>
    </Panel>
  );
}

function SettingsPage({ data, status, activeFarm, updateData }: { data: AppData; status: AppStatus | null; activeFarm: Farm; updateData: (updater: (current: AppData) => AppData, message?: string) => void }) {
  const [manifestUrl, setManifestUrl] = React.useState(data.appSettings.updateManifestUrl ?? "");
  const [updateResult, setUpdateResult] = React.useState<UpdateCheckResult | null>(null);
  const [checking, setChecking] = React.useState(false);

  function runUpdateCheck() {
    setChecking(true);
    checkUpdateManifest(manifestUrl, status?.version ?? data.appSettings.appVersion)
      .then((result) => {
        setUpdateResult(result);
        updateData((current) => ({ ...current, appSettings: { ...current.appSettings, updateManifestUrl: manifestUrl } }), "Update check settings saved");
      })
      .catch((err: unknown) => setUpdateResult({ version: "", notes: err instanceof Error ? err.message : String(err), url: "", signaturePresent: false, updateAvailable: false }))
      .finally(() => setChecking(false));
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Local Settings">
        <div className="space-y-4">
          <Field label="Theme">
            <Select value={data.appSettings.theme} onChange={(event) => updateData((current) => ({ ...current, appSettings: { ...current.appSettings, theme: event.target.value as "light" | "dark" } }), "Theme updated")}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </Select>
          </Field>
          <Field label="Profile name">
            <Input
              value={data.localProfiles.find((profile) => profile.id === data.appSettings.profileId)?.displayName ?? ""}
              onChange={(event) => updateData((current) => ({ ...current, localProfiles: current.localProfiles.map((profile) => profile.id === current.appSettings.profileId ? { ...profile, displayName: event.target.value, updatedAt: new Date().toISOString() } : profile) }))}
            />
          </Field>
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <p className="font-medium">Active workspace</p>
            <p className="text-muted-foreground">{activeFarm.name} · {activeFarm.climateZone} · {activeFarm.measurementUnits}</p>
          </div>
        </div>
      </Panel>
      <Panel title="About">
        <div className="space-y-3 text-sm">
          <p><b>GrowOps Planner</b> is an offline-first desktop crop planning, grow management, plant diagnostics, and harvest tracking app.</p>
          <p className="text-muted-foreground">Version {status?.version ?? data.appSettings.appVersion}. Local data version {data.appSettings.dataVersion}.</p>
          <p className="text-muted-foreground">No login, cloud database, paid API, or internet connection is required for normal use.</p>
          <p className="text-muted-foreground">The backend stores structured data in SQLite and stores images, backups, and exports in local app folders when running inside Tauri.</p>
        </div>
      </Panel>
      <Panel title="Offline Help">
        <div className="space-y-3 text-sm">
          <p><b>Fast setup:</b> create or review the workspace, add linked seed inventory, map environments and units, then run the Guided Plan Builder from Crop Planning.</p>
          <p><b>Seed math:</b> enter seeds per unit and germination percent when you know them. GrowOps uses those values to estimate available seed and reserve inventory for generated plans.</p>
          <p><b>Environment maps:</b> use Snap for clean drag/resize work, Fit by dimensions for scaled layouts, and precision fields when exact sizes matter.</p>
          <p><b>Release practice:</b> export a JSON backup before imports, fresh starts, or installer updates. Unsigned Windows installers can still trigger SmartScreen until a signing certificate is added.</p>
        </div>
      </Panel>
      <Panel title="Updates and Signing" description="Optional update checks use a static Tauri-compatible JSON manifest. Installer signing still requires your private release key or certificate outside the app.">
        <div className="space-y-3">
          <Field label="Update manifest URL">
            <Input value={manifestUrl} onChange={(event) => setManifestUrl(event.target.value)} placeholder="updates.example.com/growops/latest.json" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button onClick={runUpdateCheck} disabled={checking || !manifestUrl.trim()}>
              <RefreshCcw className="h-4 w-4" />
              {checking ? "Checking..." : "Check for update"}
            </Button>
          </div>
          {updateResult ? (
            <div className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge tone={updateResult.updateAvailable ? "warning" : "success"}>{updateResult.updateAvailable ? "Update available" : "Current or no newer version"}</Badge>
                <Badge tone={updateResult.signaturePresent ? "success" : "warning"}>{updateResult.signaturePresent ? "Signature present" : "No signature in manifest"}</Badge>
              </div>
              <p className="mt-2 font-medium">{updateResult.version || "No version returned"}</p>
              <p className="mt-1 text-muted-foreground">{updateResult.notes}</p>
              {updateResult.url ? <p className="mt-1 break-all text-xs text-muted-foreground">{updateResult.url}</p> : null}
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">Release signing is configured during packaging, not inside the installed app. Keep the private update signing key and Windows code-signing certificate out of the repository.</p>
        </div>
      </Panel>
    </div>
  );
}

function Metric({ title, value, detail, tone = "default" }: { title: string; value: React.ReactNode; detail: string; tone?: "default" | "success" | "warning" | "danger" }) {
  return (
    <div className="rounded-lg border border-border/80 bg-card/95 p-4 shadow-panel transition-transform hover:-translate-y-0.5">
      <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{title}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className={`mt-1 text-sm ${tone === "danger" ? "text-destructive" : tone === "warning" ? "text-amber-700 dark:text-amber-300" : tone === "success" ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}>{detail}</p>
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-0 last:pb-0">
      <span className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

function MiniStat({ label, value, detail }: { label: string; value: React.ReactNode; detail?: string }) {
  return (
    <div className="rounded-md border border-border/80 bg-muted/20 p-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function TaskMiniList({ tasks, data }: { tasks: Task[]; data: AppData }) {
  if (!tasks.length) return <EmptyState title="No urgent tasks" body="Nothing is overdue or due today." />;
  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <div key={task.id} className="flex items-center justify-between gap-3 rounded-md border p-2">
          <div>
            <p className="text-sm font-medium">{task.title}</p>
            <p className="text-xs text-muted-foreground">{task.dueDate} · {plantingName(data, task.plantingId)}</p>
          </div>
          <PriorityBadge priority={task.priority} />
        </div>
      ))}
    </div>
  );
}

function TaskTable({ tasks, data, updateTask, selectedIds = [], setSelectedIds, visibleColumns = ["task", "due", "status", "priority", "crop", "minutes"] }: { tasks: Task[]; data: AppData; updateTask: (task: Task, patch: Partial<Task>) => void; selectedIds?: string[]; setSelectedIds?: React.Dispatch<React.SetStateAction<string[]>>; visibleColumns?: string[] }) {
  const show = (column: string) => visibleColumns.includes(column);
  const toggle = (taskId: string) => setSelectedIds?.((current) => current.includes(taskId) ? current.filter((idValue) => idValue !== taskId) : [...current, taskId]);
  return (
    <div className="max-h-[62vh] overflow-auto rounded-md border">
      <table className="table-grid">
        <thead><tr>{setSelectedIds && <th className="w-10"></th>}{show("task") && <th>Task</th>}{show("due") && <th>Due</th>}{show("status") && <th>Status</th>}{show("priority") && <th>Priority</th>}{show("crop") && <th>Linked crop</th>}{show("minutes") && <th>Minutes</th>}</tr></thead>
        <tbody>{tasks.map((task) => <tr key={task.id} className={selectedIds.includes(task.id) ? "bg-accent/30" : ""}>{setSelectedIds && <td><input type="checkbox" checked={selectedIds.includes(task.id)} onChange={() => toggle(task.id)} /></td>}{show("task") && <td><b>{task.title}</b><div className="text-xs text-muted-foreground">{task.category} {task.repeatRule ? `· ${task.repeatRule}` : ""}</div></td>}{show("due") && <td>{task.dueDate}</td>}{show("status") && <td><Select value={task.status} onChange={(event) => updateTask(task, { status: event.target.value as Task["status"] })}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option><option value="skipped">Skipped</option></Select></td>}{show("priority") && <td><PriorityBadge priority={task.priority} /></td>}{show("crop") && <td>{task.cropId ? cropName(data, task.cropId) : plantingName(data, task.plantingId)}</td>}{show("minutes") && <td>{task.estimatedMinutes}</td>}</tr>)}</tbody>
      </table>
    </div>
  );
}

function KanbanTasks({ tasks, data, updateTask }: { tasks: Task[]; data: AppData; updateTask: (task: Task, patch: Partial<Task>) => void }) {
  const columns: Task["status"][] = ["todo", "in_progress", "done", "skipped"];
  return (
    <div className="grid gap-3 md:grid-cols-4">
      {columns.map((status) => (
        <div key={status} className="rounded-md border bg-muted/30 p-3">
          <h3 className="mb-3 text-sm font-semibold">{titleCase(status)}</h3>
          <div className="space-y-2">
            {tasks.filter((task) => task.status === status).map((task) => (
              <div key={task.id} className="rounded-md border bg-card p-3">
                <p className="text-sm font-medium">{task.title}</p>
                <p className="text-xs text-muted-foreground">{task.dueDate} · {cropName(data, task.cropId)}</p>
                <Select className="mt-2" value={task.status} onChange={(event) => updateTask(task, { status: event.target.value as Task["status"] })}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option><option value="skipped">Skipped</option></Select>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PlantingTable({ plantings, data, compact, onDuplicate, onDelete, selectedIds = [], setSelectedIds }: { plantings: Planting[]; data: AppData; compact?: boolean; onDuplicate?: (planting: Planting) => void; onDelete?: (planting: Planting) => void; selectedIds?: string[]; setSelectedIds?: React.Dispatch<React.SetStateAction<string[]>> }) {
  const toggle = (plantingId: string) => setSelectedIds?.((current) => current.includes(plantingId) ? current.filter((idValue) => idValue !== plantingId) : [...current, plantingId]);
  return (
    <div className="max-h-[62vh] overflow-auto rounded-md border">
      <table className="table-grid">
        <thead><tr>{setSelectedIds && <th className="w-10"></th>}<th>Planting</th><th>Location</th><th>Dates</th><th>Yield</th><th>Revenue</th>{!compact && <th>Compatibility</th>}{!compact && <th></th>}</tr></thead>
        <tbody>{plantings.map((planting) => {
          const crop = data.crops.find((item) => item.id === planting.cropId);
          const report = compatibilityForPlanting(data, planting);
          return <tr key={planting.id} className={selectedIds.includes(planting.id) ? "bg-accent/30" : ""}>{setSelectedIds && <td><input type="checkbox" checked={selectedIds.includes(planting.id)} onChange={() => toggle(planting.id)} /></td>}<td><b>{planting.name}</b><div className="text-xs text-muted-foreground">{crop?.name} · {titleCase(planting.startMethod)} · {titleCase(planting.status)}</div></td><td>{environmentName(data, planting.environmentId)}<div className="text-xs text-muted-foreground">{unitName(data, planting.bedOrUnitId)}</div></td><td><div>{planting.seedDate} seed</div><div className="text-xs text-muted-foreground">{planting.firstHarvestDate} harvest · {planting.terminationDate} end</div></td><td>{formatNumber(planting.expectedYield)} {crop?.harvestUnit}</td><td>{formatCurrency(planting.expectedRevenue)}</td>{!compact && <td><Badge tone={report.status === "compatible" ? "success" : report.status === "incompatible" ? "danger" : "warning"}>{titleCase(report.status)}</Badge></td>}{!compact && <td><div className="flex justify-end gap-1">{onDuplicate && <Button size="icon" variant="ghost" onClick={() => onDuplicate(planting)}><Copy className="h-4 w-4" /></Button>}{onDelete && <Button size="icon" variant="ghost" onClick={() => onDelete(planting)}><Trash2 className="h-4 w-4" /></Button>}</div></td>}</tr>;
        })}</tbody>
      </table>
    </div>
  );
}

function TimelineView({ plantings, data }: { plantings: Planting[]; data: AppData }) {
  const seasonStart = plantings.map((p) => p.seedDate).sort()[0] ?? todayIso();
  const seasonEnd = plantings.map((p) => p.terminationDate).sort().at(-1) ?? addDaysIso(todayIso(), 120);
  const spanDays = Math.max(1, (new Date(`${seasonEnd}T00:00:00`).getTime() - new Date(`${seasonStart}T00:00:00`).getTime()) / 86_400_000);
  const offset = (date: string) => Math.max(0, ((new Date(`${date}T00:00:00`).getTime() - new Date(`${seasonStart}T00:00:00`).getTime()) / 86_400_000 / spanDays) * 100);
  return (
    <div className="space-y-3">
      {plantings.map((planting) => (
        <div key={planting.id}>
          <div className="mb-1 flex justify-between text-xs"><span>{planting.name}</span><span>{cropName(data, planting.cropId)}</span></div>
          <div className="relative h-8 rounded bg-muted">
            <div className="absolute top-1 h-6 rounded" style={{ left: `${offset(planting.seedDate)}%`, width: `${Math.max(3, offset(planting.terminationDate) - offset(planting.seedDate))}%`, backgroundColor: cropColor(planting.cropId) }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CalendarList({ plantings, data }: { plantings: Planting[]; data: AppData }) {
  const events = plantings.flatMap((planting) => [
    { date: planting.seedDate, label: `Seed ${planting.name}`, cropId: planting.cropId },
    ...(planting.transplantDate ? [{ date: planting.transplantDate, label: `Transplant ${planting.name}`, cropId: planting.cropId }] : []),
    { date: planting.firstHarvestDate, label: `Start harvest ${planting.name}`, cropId: planting.cropId },
    { date: planting.terminationDate, label: `Terminate ${planting.name}`, cropId: planting.cropId }
  ]).sort((a, b) => a.date.localeCompare(b.date));
  return <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{events.map((event, index) => <div key={`${event.date}-${index}`} className="rounded-md border p-3"><Badge style={{ backgroundColor: `${cropColor(event.cropId)}22`, color: cropColor(event.cropId) }}>{cropName(data, event.cropId)}</Badge><p className="mt-2 text-sm font-medium">{event.label}</p><p className="text-xs text-muted-foreground">{event.date}</p></div>)}</div>;
}

function HarvestSummary({ data, farm }: { data: AppData; farm: Farm }) {
  const harvests = data.harvestLogs.filter((harvest) => harvest.farmId === farm.id);
  const expenses = data.expenseLogs.filter((expense) => expense.farmId === farm.id);
  const totalRevenue = harvests.reduce((sum, harvest) => sum + harvest.revenue, 0);
  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const totalQty = harvests.reduce((sum, harvest) => sum + harvest.quantity, 0);
  const byCrop = Object.entries(harvests.reduce<Record<string, number>>((acc, harvest) => {
    acc[harvest.cropId] = (acc[harvest.cropId] ?? 0) + harvest.revenue;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Metric title="Total harvest" value={formatNumber(totalQty)} detail="all units combined" />
      <Metric title="Actual revenue" value={formatCurrency(totalRevenue, farm.currency)} detail={`${harvests.length} logs`} />
      <Metric title="Net after expenses" value={formatCurrency(totalRevenue - totalExpenses, farm.currency)} detail={`${formatCurrency(totalExpenses, farm.currency)} costs`} tone={totalRevenue >= totalExpenses ? "success" : "warning"} />
      <Metric title="Best crop" value={byCrop[0] ? cropName(data, byCrop[0][0]) : "None"} detail={byCrop[0] ? formatCurrency(byCrop[0][1], farm.currency) : "No harvests"} />
    </div>
  );
}

function CheckboxGroup({ name, items, limitHeight, controlled, values, onChange }: { name?: string; items: Array<{ value: string; label: string }>; limitHeight?: boolean; controlled?: boolean; values?: string[]; onChange?: (values: string[]) => void }) {
  const currentValues = values ?? [];
  return (
    <div className={`grid gap-2 rounded-md border p-2 ${limitHeight ? "max-h-36 overflow-auto" : ""}`}>
      {items.map((item) => (
        <label key={item.value} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name={controlled ? undefined : name}
            value={item.value}
            checked={controlled ? currentValues.includes(item.value) : undefined}
            onChange={(event) => {
              if (!controlled || !onChange) return;
              onChange(event.target.checked ? [...currentValues, item.value] : currentValues.filter((value) => value !== item.value));
            }}
          />
          <span>{item.label}</span>
        </label>
      ))}
    </div>
  );
}

function findCropForImport(data: AppData, value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return data.crops.find((crop) => crop.id.toLowerCase() === normalized || crop.name.toLowerCase() === normalized);
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{title}</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: Task["priority"] }) {
  return <Badge tone={priority === "urgent" ? "danger" : priority === "high" ? "warning" : priority === "low" ? "muted" : "default"}>{titleCase(priority)}</Badge>;
}

function PathRow({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border p-3"><p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</p><p className="mt-1 break-all text-sm">{value}</p></div>;
}

type DeleteKind = "plantings" | "tasks" | "harvests" | "diagnostics" | "environments" | "areas" | "units" | "supplies" | "seeds" | "recommendations" | "customCrops";

function QuickDeletePanel({ data, farmId, updateData }: { data: AppData; farmId: string; updateData: (updater: (current: AppData) => AppData, message?: string) => void }) {
  const [kind, setKind] = React.useState<DeleteKind>("tasks");
  const [selected, setSelected] = React.useState<string[]>([]);
  const items = getDeleteItems(data, farmId, kind);
  React.useEffect(() => setSelected([]), [kind]);
  const allSelected = items.length > 0 && selected.length === items.length;

  function toggle(idValue: string) {
    setSelected((current) => (current.includes(idValue) ? current.filter((item) => item !== idValue) : [...current, idValue]));
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
      <div className="space-y-3">
        <Field label="Delete category">
          <Select value={kind} onChange={(event) => setKind(event.target.value as DeleteKind)}>
            <option value="tasks">Tasks</option>
            <option value="plantings">Plantings</option>
            <option value="harvests">Harvest logs</option>
            <option value="diagnostics">Diagnostic cases</option>
            <option value="environments">Environments</option>
            <option value="areas">Growing areas / zones</option>
            <option value="units">Beds / units</option>
            <option value="supplies">Supply items</option>
            <option value="seeds">Seed order items</option>
            <option value="recommendations">Recommendations</option>
            <option value="customCrops">Custom crops</option>
          </Select>
        </Field>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setSelected(allSelected ? [] : items.map((item) => item.id))}>
            {allSelected ? "Clear" : "Select all"}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={!selected.length}
            onClick={() => {
              const count = selected.length;
              updateData((current) => applyQuickDelete(current, farmId, kind, selected), `${count} item${count === 1 ? "" : "s"} removed`);
              setSelected([]);
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete selected
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{deleteKindHelp(kind)}</p>
      </div>
      <div className="max-h-80 overflow-auto rounded-md border">
        {items.length ? (
          <table className="table-grid">
            <thead><tr><th className="w-10"></th><th>Name</th><th>Detail</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /></td>
                  <td className="font-medium">{item.label}</td>
                  <td className="text-muted-foreground">{item.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState title="Nothing to delete" body="This category has no matching items in the active workspace." />
        )}
      </div>
    </div>
  );
}

function PhotoPreview({ asset }: { asset: { fileName: string; localPath: string } }) {
  const [src, setSrc] = React.useState(asset.localPath);
  React.useEffect(() => {
    if (asset.localPath.startsWith("data:") || !window.__TAURI_INTERNALS__) {
      setSrc(asset.localPath);
      return;
    }
    import("@tauri-apps/api/core")
      .then((api) => setSrc(api.convertFileSrc(asset.localPath)))
      .catch(() => setSrc(asset.localPath));
  }, [asset.localPath]);
  return <img className="aspect-square rounded-md border object-cover" src={src} alt={asset.fileName} />;
}

function getDeleteItems(data: AppData, farmId: string, kind: DeleteKind) {
  switch (kind) {
    case "tasks":
      return data.tasks.filter((item) => item.farmId === farmId).map((item) => ({ id: item.id, label: item.title, detail: `${item.dueDate} - ${titleCase(item.status)}` }));
    case "plantings":
      return data.plantings.filter((item) => item.farmId === farmId).map((item) => ({ id: item.id, label: item.name, detail: `${cropName(data, item.cropId)} - ${item.seedDate}` }));
    case "harvests":
      return data.harvestLogs.filter((item) => item.farmId === farmId).map((item) => ({ id: item.id, label: `${cropName(data, item.cropId)} harvest`, detail: `${item.harvestDate} - ${item.quantity} ${item.unit}` }));
    case "diagnostics":
      return data.diagnosticCases.filter((item) => item.farmId === farmId).map((item) => ({ id: item.id, label: `${cropName(data, item.cropId)} diagnostic`, detail: `${item.createdAt.slice(0, 10)} - ${titleCase(item.status)}` }));
    case "environments":
      return data.environments.filter((item) => item.farmId === farmId).map((item) => ({ id: item.id, label: item.name, detail: titleCase(item.type) }));
    case "areas":
      return data.growingAreas.filter((item) => item.farmId === farmId).map((item) => ({ id: item.id, label: item.name, detail: `${environmentName(data, item.environmentId)} - ${titleCase(item.kind)}` }));
    case "units":
      return data.bedOrUnits.filter((item) => item.farmId === farmId).map((item) => ({ id: item.id, label: item.name, detail: `${environmentName(data, item.environmentId)} - ${titleCase(item.unitType)}` }));
    case "supplies":
      return data.supplyItems.filter((item) => item.farmId === farmId).map((item) => ({ id: item.id, label: item.name, detail: `${item.quantity} ${item.unit}` }));
    case "seeds":
      return data.seedOrderItems.filter((item) => item.farmId === farmId).map((item) => ({ id: item.id, label: item.seedName, detail: `${item.quantityNeeded} ${item.unit}` }));
    case "recommendations":
      return data.recommendations.filter((item) => item.farmId === farmId).map((item) => ({ id: item.id, label: item.title, detail: `${titleCase(item.category)} - ${titleCase(item.priority)}` }));
    case "customCrops":
      return data.crops.filter((item) => item.farmId === farmId && !item.builtin).map((item) => ({ id: item.id, label: item.name, detail: titleCase(item.cropType) }));
  }
}

function deleteKindHelp(kind: DeleteKind) {
  if (kind === "environments") return "Deleting an environment also removes its areas, units, plantings, and linked operational records.";
  if (kind === "areas") return "Deleting a growing area also removes units inside it, assigned plantings, and linked operational records.";
  if (kind === "units") return "Deleting a bed or unit also removes plantings assigned to it and linked operational records.";
  if (kind === "plantings") return "Deleting plantings also removes generated tasks, supplies, seed orders, planting events, and linked harvest logs.";
  if (kind === "customCrops") return "Only custom crops are shown here. Built-in library crops can be archived from Crop Library.";
  return "Deletes only the selected records and directly linked records where applicable.";
}

function applyQuickDelete(data: AppData, farmId: string, kind: DeleteKind, ids: string[]): AppData {
  const idSet = new Set(ids);
  if (kind === "plantings") return deletePlantingIds(data, idSet);
  if (kind === "tasks") return { ...data, tasks: data.tasks.filter((item) => !idSet.has(item.id)) };
  if (kind === "harvests") return deleteHarvestIds(data, idSet);
  if (kind === "diagnostics") return deleteDiagnosticIds(data, idSet);
  if (kind === "supplies") return { ...data, supplyItems: data.supplyItems.filter((item) => !idSet.has(item.id)) };
  if (kind === "seeds") return { ...data, seedOrderItems: data.seedOrderItems.filter((item) => !idSet.has(item.id)) };
  if (kind === "recommendations") return { ...data, recommendations: data.recommendations.filter((item) => !idSet.has(item.id)) };
  if (kind === "customCrops") {
    return {
      ...data,
      crops: data.crops.filter((item) => !(idSet.has(item.id) && item.farmId === farmId && !item.builtin)),
      cultivars: data.cultivars.filter((item) => !idSet.has(item.cropId))
    };
  }
  if (kind === "areas") return deleteAreaIds(data, idSet);
  if (kind === "units") return deleteUnitIds(data, idSet);
  if (kind === "environments") return deleteEnvironmentIds(data, idSet);
  return data;
}

function deleteEnvironmentIds(data: AppData, environmentIds: Set<string>): AppData {
  const plantingIds = new Set(data.plantings.filter((item) => environmentIds.has(item.environmentId)).map((item) => item.id));
  const areaIds = new Set(data.growingAreas.filter((item) => environmentIds.has(item.environmentId)).map((item) => item.id));
  const unitIds = new Set(data.bedOrUnits.filter((item) => environmentIds.has(item.environmentId)).map((item) => item.id));
  const next = deleteUnitIds(deleteAreaIds(deletePlantingIds(data, plantingIds), areaIds), unitIds);
  return {
    ...next,
    environments: next.environments.filter((item) => !environmentIds.has(item.id)),
    sensorReadings: next.sensorReadings.filter((item) => !environmentIds.has(item.environmentId)),
    tasks: next.tasks.filter((item) => !item.environmentId || !environmentIds.has(item.environmentId)),
    recommendations: next.recommendations.filter((item) => !item.relatedEntityId || !environmentIds.has(item.relatedEntityId))
  };
}

function deleteAreaIds(data: AppData, areaIds: Set<string>): AppData {
  const unitIds = new Set(data.bedOrUnits.filter((item) => areaIds.has(item.growingAreaId)).map((item) => item.id));
  const next = deleteUnitIds(data, unitIds);
  return {
    ...next,
    growingAreas: next.growingAreas.filter((item) => !areaIds.has(item.id))
  };
}

function deleteUnitIds(data: AppData, unitIds: Set<string>): AppData {
  const plantingIds = new Set(data.plantings.filter((item) => unitIds.has(item.bedOrUnitId)).map((item) => item.id));
  const next = deletePlantingIds(data, plantingIds);
  return {
    ...next,
    bedOrUnits: next.bedOrUnits.filter((item) => !unitIds.has(item.id)),
    tasks: next.tasks.filter((item) => !item.bedOrUnitId || !unitIds.has(item.bedOrUnitId))
  };
}

function deletePlantingIds(data: AppData, plantingIds: Set<string>): AppData {
  const harvestIds = new Set(data.harvestLogs.filter((item) => item.plantingId && plantingIds.has(item.plantingId)).map((item) => item.id));
  return {
    ...data,
    plantings: data.plantings.filter((item) => !plantingIds.has(item.id)),
    plantingEvents: data.plantingEvents.filter((item) => !plantingIds.has(item.plantingId)),
    tasks: data.tasks.filter((item) => !item.plantingId || !plantingIds.has(item.plantingId)),
    supplyItems: data.supplyItems.filter((item) => !item.plantingId || !plantingIds.has(item.plantingId)),
    seedOrderItems: data.seedOrderItems.filter((item) => !item.plantingId || !plantingIds.has(item.plantingId)),
    harvestLogs: data.harvestLogs.filter((item) => !item.plantingId || !plantingIds.has(item.plantingId)),
    revenueLogs: data.revenueLogs.filter((item) => !item.harvestLogId || !harvestIds.has(item.harvestLogId))
  };
}

function deleteHarvestIds(data: AppData, harvestIds: Set<string>): AppData {
  return {
    ...data,
    harvestLogs: data.harvestLogs.filter((item) => !harvestIds.has(item.id)),
    revenueLogs: data.revenueLogs.filter((item) => !item.harvestLogId || !harvestIds.has(item.harvestLogId))
  };
}

function deleteDiagnosticIds(data: AppData, diagnosticIds: Set<string>): AppData {
  return {
    ...data,
    diagnosticCases: data.diagnosticCases.filter((item) => !diagnosticIds.has(item.id)),
    diagnosticObservations: data.diagnosticObservations.filter((item) => !diagnosticIds.has(item.diagnosticCaseId)),
    diagnosticResults: data.diagnosticResults.filter((item) => !diagnosticIds.has(item.diagnosticCaseId))
  };
}

function mergeSnapshots(local: AppData, incoming: AppData): AppData {
  const mergeById = <T extends { id: string; updatedAt?: string; createdAt?: string }>(left: T[], right: T[]) => {
    const map = new Map<string, T>();
    [...left, ...right].forEach((item) => {
      const existing = map.get(item.id);
      const itemDate = item.updatedAt ?? item.createdAt ?? "";
      const existingDate = existing?.updatedAt ?? existing?.createdAt ?? "";
      if (!existing || itemDate >= existingDate) map.set(item.id, item);
    });
    return Array.from(map.values());
  };
  return {
    ...local,
    farms: mergeById(local.farms, incoming.farms),
    environments: mergeById(local.environments, incoming.environments),
    growingAreas: mergeById(local.growingAreas, incoming.growingAreas),
    bedOrUnits: mergeById(local.bedOrUnits, incoming.bedOrUnits),
    crops: mergeById(local.crops, incoming.crops),
    cultivars: mergeById(local.cultivars, incoming.cultivars),
    plantings: mergeById(local.plantings, incoming.plantings),
    plantingEvents: mergeById(local.plantingEvents, incoming.plantingEvents),
    tasks: mergeById(local.tasks, incoming.tasks),
    harvestLogs: mergeById(local.harvestLogs, incoming.harvestLogs),
    revenueLogs: mergeById(local.revenueLogs, incoming.revenueLogs),
    expenseLogs: mergeById(local.expenseLogs ?? [], incoming.expenseLogs ?? []),
    supplyItems: mergeById(local.supplyItems, incoming.supplyItems),
    inventoryLots: mergeById(local.inventoryLots ?? [], incoming.inventoryLots ?? []),
    seedOrderItems: mergeById(local.seedOrderItems, incoming.seedOrderItems),
    diagnosticCases: mergeById(local.diagnosticCases, incoming.diagnosticCases),
    diagnosticObservations: mergeById(local.diagnosticObservations, incoming.diagnosticObservations),
    diagnosticResults: mergeById(local.diagnosticResults, incoming.diagnosticResults),
    recommendations: mergeById(local.recommendations, incoming.recommendations),
    sensorReadings: mergeById(local.sensorReadings, incoming.sensorReadings),
    photoAssets: mergeById(local.photoAssets, incoming.photoAssets),
    backupRecords: mergeById(local.backupRecords, incoming.backupRecords),
    collaborationEvents: mergeById(local.collaborationEvents ?? [], incoming.collaborationEvents ?? [])
  };
}

function isUndoableMessage(message: string) {
  return /delete|deleted|removed|archived|fresh start|reset|imported|load demo/i.test(message);
}

function clampPercent(value: number, min: number, max: number) {
  return Math.round(Math.min(max, Math.max(min, value)) * 10) / 10;
}

function snapPercent(value: number, enabled: boolean, step: number) {
  if (!enabled || step <= 0) return value;
  return Math.round(value / step) * step;
}

function MapRulers({ step, snapToGrid }: { step: number; snapToGrid: boolean }) {
  return (
    <>
      <div className="pointer-events-none absolute left-2 top-2 z-30 rounded bg-card/80 px-2 py-1 text-[10px] font-medium text-muted-foreground shadow-sm">
        0,0 - {snapToGrid ? `snap ${step}%` : "free drag"}
      </div>
      <div className="pointer-events-none absolute right-2 top-2 z-30 rounded bg-card/80 px-2 py-1 text-[10px] text-muted-foreground shadow-sm">100% W</div>
      <div className="pointer-events-none absolute bottom-2 left-2 z-30 rounded bg-card/80 px-2 py-1 text-[10px] text-muted-foreground shadow-sm">100% H</div>
    </>
  );
}

function plantingsForFarm(data: AppData, farmId: string) {
  return data.plantings.filter((planting) => planting.farmId === farmId);
}

function buildCropPlanReportHtml(data: AppData, farm: Farm) {
  const rows = plantingsForFarm(data, farm.id).map((planting) => `<tr><td>${escapeHtml(planting.name)}</td><td>${escapeHtml(cropName(data, planting.cropId))}</td><td>${planting.seedDate}</td><td>${planting.firstHarvestDate}</td><td>${escapeHtml(unitName(data, planting.bedOrUnitId))}</td><td>${formatCurrency(planting.expectedRevenue, farm.currency)}</td></tr>`).join("");
  return reportShell("Crop Plan", farm, `<table><thead><tr><th>Planting</th><th>Crop</th><th>Seed</th><th>Harvest</th><th>Unit</th><th>Projected revenue</th></tr></thead><tbody>${rows}</tbody></table>`);
}

function buildTaskReportHtml(data: AppData, farm: Farm) {
  const rows = data.tasks.filter((task) => task.farmId === farm.id && task.status !== "done").sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((task) => `<tr><td>${task.dueDate}</td><td>${escapeHtml(task.title)}</td><td>${escapeHtml(titleCase(task.priority))}</td><td>${task.estimatedMinutes}</td><td>${escapeHtml(task.notes)}</td></tr>`).join("");
  return reportShell("Task Sheet", farm, `<table><thead><tr><th>Due</th><th>Task</th><th>Priority</th><th>Minutes</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>`);
}

function buildWeeklyWorkPlanReportHtml(data: AppData, farm: Farm) {
  const start = todayIso();
  const end = addDaysIso(start, 7);
  const tasks = data.tasks.filter((task) => task.farmId === farm.id && task.status !== "done" && task.dueDate >= start && task.dueDate <= end).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const plantings = data.plantings.filter((planting) => planting.farmId === farm.id && planting.seedDate >= start && planting.seedDate <= end);
  const taskRows = tasks.map((task) => `<tr><td>${task.dueDate}</td><td>${escapeHtml(task.title)}</td><td>${escapeHtml(titleCase(task.priority))}</td><td>${task.estimatedMinutes}</td><td>${escapeHtml(cropName(data, task.cropId))}</td></tr>`).join("");
  const plantingRows = plantings.map((planting) => `<tr><td>${planting.seedDate}</td><td>${escapeHtml(planting.name)}</td><td>${escapeHtml(cropName(data, planting.cropId))}</td><td>${escapeHtml(unitName(data, planting.bedOrUnitId))}</td><td>${planting.plantCount}</td></tr>`).join("");
  return reportShell("Weekly Work Plan", farm, `<p>${start} through ${end}</p><h2>Open Tasks</h2><table><thead><tr><th>Due</th><th>Task</th><th>Priority</th><th>Minutes</th><th>Crop</th></tr></thead><tbody>${taskRows}</tbody></table><h2>Plantings This Week</h2><table><thead><tr><th>Date</th><th>Planting</th><th>Crop</th><th>Unit</th><th>Plants</th></tr></thead><tbody>${plantingRows}</tbody></table>`);
}

function buildHarvestReportHtml(data: AppData, farm: Farm) {
  const totalRevenue = data.harvestLogs.filter((harvest) => harvest.farmId === farm.id).reduce((sum, harvest) => sum + harvest.revenue, 0);
  const totalExpenses = data.expenseLogs.filter((expense) => expense.farmId === farm.id).reduce((sum, expense) => sum + expense.amount, 0);
  const rows = data.harvestLogs.filter((harvest) => harvest.farmId === farm.id).map((harvest) => `<tr><td>${harvest.harvestDate}</td><td>${escapeHtml(cropName(data, harvest.cropId))}</td><td>${harvest.quantity} ${escapeHtml(harvest.unit)}</td><td>${escapeHtml(titleCase(harvest.grade))}</td><td>${escapeHtml(harvest.destination)}</td><td>${formatCurrency(harvest.revenue, farm.currency)}</td></tr>`).join("");
  return reportShell("Harvest and Profitability", farm, `<p><b>Revenue:</b> ${formatCurrency(totalRevenue, farm.currency)} &nbsp; <b>Expenses:</b> ${formatCurrency(totalExpenses, farm.currency)} &nbsp; <b>Net:</b> ${formatCurrency(totalRevenue - totalExpenses, farm.currency)}</p><table><thead><tr><th>Date</th><th>Crop</th><th>Qty</th><th>Grade</th><th>Destination</th><th>Revenue</th></tr></thead><tbody>${rows}</tbody></table>`);
}

function buildProfitabilityReportHtml(data: AppData, farm: Farm) {
  const harvests = data.harvestLogs.filter((harvest) => harvest.farmId === farm.id);
  const expenses = data.expenseLogs.filter((expense) => expense.farmId === farm.id);
  const byCrop = data.crops
    .map((crop) => {
      const cropHarvests = harvests.filter((harvest) => harvest.cropId === crop.id);
      const cropPlantingIds = new Set(data.plantings.filter((planting) => planting.cropId === crop.id).map((planting) => planting.id));
      const cropExpenses = expenses.filter((expense) => expense.linkedEntityId === crop.id || (expense.linkedEntityId ? cropPlantingIds.has(expense.linkedEntityId) : false));
      const revenue = cropHarvests.reduce((sum, harvest) => sum + harvest.revenue, 0);
      const cost = cropExpenses.reduce((sum, expense) => sum + expense.amount, 0);
      return { crop, revenue, cost, net: revenue - cost };
    })
    .filter((row) => row.revenue || row.cost)
    .sort((a, b) => b.net - a.net);
  const byEnvironment = data.environments
    .filter((environment) => environment.farmId === farm.id)
    .map((environment) => {
      const plantingIds = new Set(data.plantings.filter((planting) => planting.environmentId === environment.id).map((planting) => planting.id));
      const revenue = harvests.filter((harvest) => harvest.plantingId && plantingIds.has(harvest.plantingId)).reduce((sum, harvest) => sum + harvest.revenue, 0);
      const cost = expenses.filter((expense) => expense.linkedEntityId && plantingIds.has(expense.linkedEntityId)).reduce((sum, expense) => sum + expense.amount, 0);
      return { environment, revenue, cost, net: revenue - cost };
    })
    .filter((row) => row.revenue || row.cost)
    .sort((a, b) => b.net - a.net);
  const cropRows = byCrop.map((row) => `<tr><td>${escapeHtml(row.crop.name)}</td><td>${formatCurrency(row.revenue, farm.currency)}</td><td>${formatCurrency(row.cost, farm.currency)}</td><td>${formatCurrency(row.net, farm.currency)}</td></tr>`).join("");
  const envRows = byEnvironment.map((row) => `<tr><td>${escapeHtml(row.environment.name)}</td><td>${formatCurrency(row.revenue, farm.currency)}</td><td>${formatCurrency(row.cost, farm.currency)}</td><td>${formatCurrency(row.net, farm.currency)}</td></tr>`).join("");
  return reportShell("Profitability Report", farm, `<h2>By crop</h2><table><thead><tr><th>Crop</th><th>Revenue</th><th>Linked cost</th><th>Net</th></tr></thead><tbody>${cropRows}</tbody></table><h2>By environment</h2><table><thead><tr><th>Environment</th><th>Revenue</th><th>Linked cost</th><th>Net</th></tr></thead><tbody>${envRows}</tbody></table>`);
}

function buildDiagnosticReportHtml(data: AppData, farm: Farm) {
  const cases = data.diagnosticCases.filter((diagnostic) => diagnostic.farmId === farm.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const rows = cases.map((diagnostic) => {
    const top = data.diagnosticResults.filter((result) => result.diagnosticCaseId === diagnostic.id).sort((a, b) => b.confidence - a.confidence)[0];
    return `<tr><td>${diagnostic.createdAt.slice(0, 10)}</td><td>${escapeHtml(cropName(data, diagnostic.cropId))}</td><td>${escapeHtml(environmentName(data, diagnostic.environmentId))}</td><td>${escapeHtml(titleCase(diagnostic.status))}</td><td>${escapeHtml(diagnostic.symptoms)}</td><td>${top ? `${escapeHtml(top.cause)} (${Math.round(top.confidence * 100)}%)` : "Not scored"}</td></tr>`;
  }).join("");
  return reportShell("Diagnostic Case Report", farm, `<p>Advisory report. Diagnosis is not guaranteed and chemical actions must follow labels and local law.</p><table><thead><tr><th>Date</th><th>Crop</th><th>Environment</th><th>Status</th><th>Symptoms</th><th>Top cause</th></tr></thead><tbody>${rows}</tbody></table>`);
}

function buildTraceabilitySummaryReportHtml(data: AppData, farm: Farm) {
  const rows = data.plantings
    .filter((planting) => planting.farmId === farm.id)
    .map((planting) => {
      const harvests = data.harvestLogs.filter((harvest) => harvest.plantingId === planting.id);
      const tasks = data.tasks.filter((task) => task.plantingId === planting.id);
      const supplies = data.supplyItems.filter((item) => item.plantingId === planting.id);
      const revenue = harvests.reduce((sum, harvest) => sum + harvest.revenue, 0);
      return `<tr><td>${escapeHtml(planting.name)}</td><td>${escapeHtml(cropName(data, planting.cropId))}</td><td>${escapeHtml(environmentName(data, planting.environmentId))} / ${escapeHtml(unitName(data, planting.bedOrUnitId))}</td><td>${tasks.length}</td><td>${supplies.length}</td><td>${harvests.length}</td><td>${formatCurrency(revenue, farm.currency)}</td></tr>`;
    }).join("");
  return reportShell("Traceability Packet", farm, `<table><thead><tr><th>Planting</th><th>Crop</th><th>Location</th><th>Tasks</th><th>Supplies</th><th>Harvest lots</th><th>Revenue</th></tr></thead><tbody>${rows}</tbody></table>`);
}

function buildTraceabilityReportHtml(data: AppData, farm: Farm, planting: Planting) {
  const harvestRows = data.harvestLogs.filter((harvest) => harvest.plantingId === planting.id).map((harvest) => `<tr><td>${harvest.harvestDate}</td><td>${harvest.quantity} ${escapeHtml(harvest.unit)}</td><td>${escapeHtml(titleCase(harvest.grade))}</td><td>${escapeHtml(harvest.destination)}</td><td>${formatCurrency(harvest.revenue, farm.currency)}</td></tr>`).join("");
  const taskRows = data.tasks.filter((task) => task.plantingId === planting.id).map((task) => `<tr><td>${task.dueDate}</td><td>${escapeHtml(task.title)}</td><td>${escapeHtml(titleCase(task.status))}</td><td>${escapeHtml(titleCase(task.priority))}</td></tr>`).join("");
  const supplyRows = data.supplyItems.filter((item) => item.plantingId === planting.id).map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(titleCase(item.itemType))}</td><td>${item.quantity} ${escapeHtml(item.unit)}</td><td>${formatCurrency(item.estimatedCost, farm.currency)}</td></tr>`).join("");
  return reportShell(`Traceability: ${planting.name}`, farm, `<p><b>Crop:</b> ${escapeHtml(cropName(data, planting.cropId))} &nbsp; <b>Location:</b> ${escapeHtml(environmentName(data, planting.environmentId))} / ${escapeHtml(unitName(data, planting.bedOrUnitId))}</p><h2>Supplies</h2><table><tbody>${supplyRows}</tbody></table><h2>Tasks</h2><table><tbody>${taskRows}</tbody></table><h2>Harvest Lots</h2><table><tbody>${harvestRows}</tbody></table>`);
}

function buildInventoryReportHtml(data: AppData, farm: Farm) {
  const rows = data.inventoryLots.filter((lot) => lot.farmId === farm.id).map((lot) => `<tr><td>${escapeHtml(lot.name)}</td><td>${escapeHtml(titleCase(lot.itemType))}</td><td>${escapeHtml(cropName(data, lot.cropId))}</td><td>${escapeHtml(lot.lotCode)}</td><td>${lot.quantityOnHand} ${escapeHtml(lot.unit)}</td><td>${lot.reservedQuantity ?? 0} ${escapeHtml(lot.unit)}</td><td>${Math.max(0, lot.quantityOnHand - (lot.reservedQuantity ?? 0))} ${escapeHtml(lot.unit)}</td><td>${lot.seedsPerUnit ? `${lot.seedsPerUnit} seeds/${escapeHtml(lot.unit)}` : ""}</td><td>${formatCurrency(lot.unitCost * lot.quantityOnHand, farm.currency)}</td><td>${escapeHtml(lot.storageLocation)}</td><td>${lot.expirationDate ?? ""}</td></tr>`).join("");
  return reportShell("Inventory Lot Report", farm, `<table><thead><tr><th>Item</th><th>Type</th><th>Crop</th><th>Lot</th><th>On hand</th><th>Reserved</th><th>Available</th><th>Seed math</th><th>Value</th><th>Storage</th><th>Expires</th></tr></thead><tbody>${rows}</tbody></table>`);
}

function buildSeedReservationReportHtml(data: AppData, farm: Farm) {
  const seedLots = data.inventoryLots.filter((lot) => lot.farmId === farm.id && lot.itemType === "seed");
  const rows = seedLots.map((lot) => {
    const available = Math.max(0, lot.quantityOnHand - (lot.reservedQuantity ?? 0));
    return `<tr><td>${escapeHtml(lot.name)}</td><td>${escapeHtml(cropName(data, lot.cropId))}</td><td>${escapeHtml(lot.lotCode || "Unlotted")}</td><td>${lot.quantityOnHand} ${escapeHtml(lot.unit)}</td><td>${lot.reservedQuantity ?? 0} ${escapeHtml(lot.unit)}</td><td>${available} ${escapeHtml(lot.unit)}</td><td>${lot.germinationRatePercent ?? ""}</td><td>${lot.seedsPerUnit ?? ""}</td><td>${lot.expirationDate ?? ""}</td></tr>`;
  }).join("");
  return reportShell("Seed Reservation Report", farm, `<table><thead><tr><th>Seed lot</th><th>Crop</th><th>Lot code</th><th>On hand</th><th>Reserved</th><th>Available</th><th>Germ %</th><th>Seeds/unit</th><th>Expires</th></tr></thead><tbody>${rows}</tbody></table>`);
}

function reportShell(title: string, farm: Farm, body: string) {
  return `<html><head><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;margin:28px;color:#111}h1{font-size:22px;margin:0}h2{font-size:15px;margin:22px 0 6px}p{font-size:12px}table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}th,td{border:1px solid #bbb;padding:6px;text-align:left;vertical-align:top}th{background:#eee}.bar{height:8px;background:#2563eb}@media print{button{display:none}}</style></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(farm.name)} - Generated ${new Date().toLocaleString()}</p>${body}<script>window.print()</script></body></html>`;
}

function printReport(title: string, html: string) {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html.includes("<html") ? html : reportShell(title, { name: "GrowOps", id: "", location: "", climateZone: "", firstFrostDate: "", lastFrostDate: "", seasonStart: "", seasonEnd: "", currency: "USD", measurementUnits: "imperial", productionStyleTags: [], notes: "", createdAt: "", updatedAt: "" }, html));
  win.document.close();
}

function exportIcs(data: AppData, farmId: string) {
  const events = [
    ...data.tasks.filter((task) => task.farmId === farmId).map((task) => ({ date: task.dueDate, title: task.title, notes: task.notes })),
    ...data.plantings.filter((planting) => planting.farmId === farmId).flatMap((planting) => [
      { date: planting.seedDate, title: `Seed ${planting.name}`, notes: planting.notes },
      { date: planting.firstHarvestDate, title: `Harvest ${planting.name}`, notes: planting.notes },
      { date: planting.terminationDate, title: `Terminate ${planting.name}`, notes: planting.notes }
    ])
  ];
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GrowOps Planner//EN", ...events.map((event) => ["BEGIN:VEVENT", `UID:${id("ics")}@growops`, `DTSTAMP:${icsDate(todayIso())}`, `DTSTART;VALUE=DATE:${icsDate(event.date)}`, `SUMMARY:${escapeIcs(event.title)}`, `DESCRIPTION:${escapeIcs(event.notes)}`, "END:VEVENT"].join("\r\n")), "END:VCALENDAR"].join("\r\n");
  downloadTextFile(`growops-calendar-${todayIso()}.ics`, body, "text/calendar");
}

function icsDate(dateIso: string) {
  return dateIso.replace(/-/g, "");
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

function labelTargetsForKind(data: AppData, farm: Farm, kind: LabelKind): LabelTarget[] {
  if (kind === "plantings") {
    return data.plantings
      .filter((planting) => planting.farmId === farm.id && planting.status !== "finished")
      .map((planting) => ({ id: planting.id, label: planting.name, detail: `${cropName(data, planting.cropId)} - ${unitName(data, planting.bedOrUnitId)}`, text: plantingBarcodeText(data, planting) }));
  }
  if (kind === "environments") {
    return data.environments
      .filter((environment) => environment.farmId === farm.id)
      .map((environment) => ({ id: environment.id, label: environment.name, detail: `${titleCase(environment.type)} - ${formatNumber(environment.usableAreaSqFt || environment.lengthFt * environment.widthFt, 0)} sq ft`, text: environmentBarcodeText(environment) }));
  }
  if (kind === "units") {
    return data.bedOrUnits
      .filter((unit) => unit.farmId === farm.id)
      .map((unit) => ({ id: unit.id, label: unit.name, detail: `${environmentName(data, unit.environmentId)} - ${titleCase(unit.unitType)} - ${unit.capacityPlants} plant slots`, text: unitBarcodeText(data, unit) }));
  }
  if (kind === "inventory") {
    return data.inventoryLots
      .filter((lot) => lot.farmId === farm.id)
      .map((lot) => ({ id: lot.id, label: lot.name, detail: `${cropName(data, lot.cropId)} - ${lot.lotCode || "No lot code"} - ${formatNumber(lot.quantityOnHand)} ${lot.unit}`, text: inventoryBarcodeText(data, lot) }));
  }
  if (kind === "supplies") {
    return data.supplyItems
      .filter((item) => item.farmId === farm.id)
      .map((item) => ({ id: item.id, label: item.name, detail: `${titleCase(item.itemType)} - ${formatNumber(item.quantity)} ${item.unit} - ${plantingName(data, item.plantingId) || "farm supply"}`, text: supplyBarcodeText(data, item) }));
  }
  if (kind === "harvests") {
    return data.harvestLogs
    .filter((harvest) => harvest.farmId === farm.id)
    .sort((a, b) => b.harvestDate.localeCompare(a.harvestDate))
    .map((harvest) => ({ id: harvest.id, label: `${cropName(data, harvest.cropId)} harvest`, detail: `${harvest.harvestDate} - ${formatNumber(harvest.quantity)} ${harvest.unit} - ${titleCase(harvest.grade)}`, text: harvestBarcodeText(data, harvest) }));
  }
  return data.diagnosticCases
    .filter((diagnostic) => diagnostic.farmId === farm.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((diagnostic) => ({ id: diagnostic.id, label: `${cropName(data, diagnostic.cropId)} diagnostic`, detail: `${diagnostic.createdAt.slice(0, 10)} - ${titleCase(diagnostic.status)} - ${environmentName(data, diagnostic.environmentId)}`, text: diagnosticBarcodeText(data, diagnostic) }));
}

function labelKindLabel(kind: LabelKind) {
  if (kind === "units") return "Bed / Unit";
  if (kind === "inventory") return "Inventory Lot";
  if (kind === "supplies") return "Supply Item";
  if (kind === "harvests") return "Harvest Lot";
  if (kind === "diagnostics") return "Diagnostic Case";
  return titleCase(kind);
}

function plantingBarcodeText(data: AppData, planting: Planting) {
  return [
    "GROWOPS PLANTING",
    `ID: ${planting.id}`,
    `Name: ${planting.name}`,
    `Crop: ${cropName(data, planting.cropId)}`,
    `Status: ${titleCase(planting.status)}`,
    `Seed: ${planting.seedDate}`,
    `Harvest: ${planting.firstHarvestDate}`,
    `End: ${planting.terminationDate}`,
    `Location: ${environmentName(data, planting.environmentId)} / ${unitName(data, planting.bedOrUnitId)}`,
    `Plants: ${planting.plantCount}`,
    `Area: ${planting.areaSqFt} sq ft`
  ].join("\n");
}

function environmentBarcodeText(environment: Environment) {
  return [
    "GROWOPS ENVIRONMENT",
    `ID: ${environment.id}`,
    `Name: ${environment.name}`,
    `Type: ${titleCase(environment.type)}`,
    `Dimensions: ${environment.lengthFt} x ${environment.widthFt} ft`,
    `Usable area: ${environment.usableAreaSqFt || environment.lengthFt * environment.widthFt} sq ft`,
    `Airflow: ${titleCase(environment.assumptions.airflow)}`,
    `Notes: ${environment.notes}`
  ].join("\n");
}

function unitBarcodeText(data: AppData, unit: BedOrUnit) {
  return [
    "GROWOPS BED OR UNIT",
    `ID: ${unit.id}`,
    `Name: ${unit.name}`,
    `Type: ${titleCase(unit.unitType)}`,
    `Environment: ${environmentName(data, unit.environmentId)}`,
    `Plant slots: ${unit.capacityPlants}`,
    `Root depth: ${unit.rootDepthIn} in`,
    `Area: ${unit.lengthFt * unit.widthFt} sq ft`,
    `Notes: ${unit.notes}`
  ].join("\n");
}

function inventoryBarcodeText(data: AppData, lot: InventoryLot) {
  return [
    "GROWOPS INVENTORY LOT",
    `ID: ${lot.id}`,
    `Item: ${lot.name}`,
    `Type: ${titleCase(lot.itemType)}`,
    `Crop: ${cropName(data, lot.cropId)}`,
    `Lot code: ${lot.lotCode || "None"}`,
    `Vendor: ${lot.vendor || "None"}`,
    `Quantity: ${lot.quantityOnHand} ${lot.unit}`,
    `Storage: ${lot.storageLocation || "Unassigned"}`
  ].join("\n");
}

function supplyBarcodeText(data: AppData, item: SupplyItem) {
  return [
    "GROWOPS SUPPLY ITEM",
    `ID: ${item.id}`,
    `Item: ${item.name}`,
    `Type: ${titleCase(item.itemType)}`,
    `Quantity: ${item.quantity} ${item.unit}`,
    `Estimated cost: ${item.estimatedCost}`,
    `Planting: ${plantingName(data, item.plantingId) || "Farm supply"}`,
    `Notes: ${item.notes}`
  ].join("\n");
}

function harvestBarcodeText(data: AppData, harvest: HarvestLog) {
  return [
    "GROWOPS HARVEST LOT",
    `ID: ${harvest.id}`,
    `Crop: ${cropName(data, harvest.cropId)}`,
    `Planting: ${plantingName(data, harvest.plantingId) || "Unassigned"}`,
    `Date: ${harvest.harvestDate}`,
    `Quantity: ${harvest.quantity} ${harvest.unit}`,
    `Grade: ${titleCase(harvest.grade)}`,
    `Destination: ${harvest.destination || "Unassigned"}`
  ].join("\n");
}

function diagnosticBarcodeText(data: AppData, diagnostic: DiagnosticCase) {
  const results = data.diagnosticResults.filter((result) => result.diagnosticCaseId === diagnostic.id).slice(0, 3);
  return [
    "GROWOPS DIAGNOSTIC CASE",
    `ID: ${diagnostic.id}`,
    `Crop: ${cropName(data, diagnostic.cropId)}`,
    `Environment: ${environmentName(data, diagnostic.environmentId)}`,
    `Stage: ${titleCase(diagnostic.growthStage)}`,
    `Status: ${titleCase(diagnostic.status)}`,
    `Created: ${diagnostic.createdAt.slice(0, 10)}`,
    `Symptoms: ${diagnostic.symptoms}`,
    `Top causes: ${results.map((result) => `${result.cause} ${Math.round(result.confidence * 100)}%`).join("; ") || "Not scored"}`
  ].join("\n");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char] ?? char));
}

function matches(source: string, search: string) {
  return !search.trim() || source.toLowerCase().includes(search.trim().toLowerCase());
}

function cropName(data: AppData, cropId?: string) {
  return data.crops.find((crop) => crop.id === cropId)?.name ?? "Unassigned";
}

function plantingName(data: AppData, plantingId?: string) {
  return data.plantings.find((planting) => planting.id === plantingId)?.name ?? "";
}

function environmentName(data: AppData, environmentId?: string) {
  return data.environments.find((environment) => environment.id === environmentId)?.name ?? "Unassigned";
}

function unitName(data: AppData, unitId?: string) {
  return data.bedOrUnits.find((unit) => unit.id === unitId)?.name ?? "Unassigned";
}

function compatibilityForPlanting(data: AppData, planting: Planting) {
  return checkCompatibility({
    farm: data.farms.find((farm) => farm.id === planting.farmId),
    crop: data.crops.find((crop) => crop.id === planting.cropId),
    environment: data.environments.find((environment) => environment.id === planting.environmentId),
    bedOrUnit: data.bedOrUnits.find((unit) => unit.id === planting.bedOrUnitId),
    methods: data.growingMethods.filter((method) => planting.growingMethodIds.includes(method.id)),
    media: data.growingMedia.filter((medium) => planting.mediumIds.includes(medium.id)),
    planting
  });
}

function diagnosticContext(data: AppData, diagnosticCase: DiagnosticCase) {
  return {
    diagnosticCase,
    crop: data.crops.find((crop) => crop.id === diagnosticCase.cropId),
    environment: data.environments.find((environment) => environment.id === diagnosticCase.environmentId),
    methods: data.growingMethods.filter((method) => diagnosticCase.growingMethodIds.includes(method.id)),
    media: data.growingMedia.filter((medium) => diagnosticCase.mediumIds.includes(medium.id))
  };
}

function cropColor(cropId: string) {
  const palette = ["#2f855a", "#2b6cb0", "#b7791f", "#805ad5", "#c05621", "#319795", "#9f7aea", "#718096"];
  let hash = 0;
  for (const char of cropId) hash = (hash + char.charCodeAt(0)) % palette.length;
  return palette[hash];
}
