import * as React from "react";
import {
  AlertTriangle,
  BookOpen,
  Database,
  Download,
  FlaskConical,
  Gauge,
  LineChart,
  Save,
  Search,
  Trash2,
  Upload
} from "lucide-react";
import { planDates } from "../../domain/datePlanning";
import { parseCsv, toCsv } from "../../domain/csv";
import { downloadTextFile, formatCurrency, formatNumber, id, titleCase, todayIso } from "../../lib/utils";
import { Badge, Button, EmptyState, Field, Input, Panel, Select, Tabs, Textarea } from "../../components/ui";
import type {
  AppData,
  AppStatus,
  Crop,
  Farm,
  GrowOpsIpmScout,
  GrowOpsResearchNote,
  GrowOpsSensorImport,
  GrowOpsTrial,
  Planting
} from "../../domain/types";
import {
  calculateGrowingDegreeDays,
  calculateVpdKpa,
  evaluateGrowOpsCompatibility,
  summarizeTrial,
  type GrowOpsWeatherEntry
} from "./engines/growOpsEngines";

type GrowOpsLabTab = "dashboard" | "trials" | "phenology" | "climate" | "irrigation" | "ipm" | "sensors" | "scenario" | "library";

const labTabs: Array<{ value: GrowOpsLabTab; label: string }> = [
  { value: "dashboard", label: "Lab Dashboard" },
  { value: "trials", label: "Trial Designer" },
  { value: "phenology", label: "GDD / Phenology" },
  { value: "climate", label: "VPD / Climate" },
  { value: "irrigation", label: "Water & Nutrients" },
  { value: "ipm", label: "IPM Scouting" },
  { value: "sensors", label: "Sensor Imports" },
  { value: "scenario", label: "Scenario Simulator" },
  { value: "library", label: "Research Library" }
];

type UpdateData = (updater: (current: AppData) => AppData, message?: string) => void;

export function GrowOpsModule({
  data,
  farm,
  status,
  updateData,
  setError
}: {
  data: AppData;
  farm: Farm;
  status: AppStatus | null;
  updateData: UpdateData;
  setError: (message: string | null) => void;
}) {
  const [tab, setTab] = React.useState<GrowOpsLabTab>("dashboard");
  const lab = getLab(data);

  return (
    <div className="space-y-5">
      <Panel
        title="GrowOps Lab"
        description="Research-only tools for trials, phenology, VPD, irrigation, nutrition, scouting, sensor analysis, simulations, and local references."
        action={<Badge tone="muted">Lab v0.2.0</Badge>}
      >
        <div className="overflow-auto">
          <Tabs value={tab} onChange={setTab} items={labTabs} />
        </div>
      </Panel>
      {tab === "dashboard" && <LabDashboard data={data} farm={farm} status={status} lab={lab} setTab={setTab} />}
      {tab === "trials" && <TrialDesigner data={data} farm={farm} trials={lab.trials ?? []} updateData={updateData} />}
      {tab === "phenology" && <PhenologyLab data={data} farm={farm} />}
      {tab === "climate" && <ClimateLab data={data} farm={farm} />}
      {tab === "irrigation" && <WaterNutrientLab data={data} farm={farm} />}
      {tab === "ipm" && <IpmScoutingLab data={data} farm={farm} scouts={lab.ipmScouts ?? []} updateData={updateData} />}
      {tab === "sensors" && <SensorImportLab data={data} farm={farm} sensorImports={lab.sensorImports ?? []} updateData={updateData} setError={setError} />}
      {tab === "scenario" && <ScenarioSimulator data={data} farm={farm} />}
      {tab === "library" && <ResearchLibrary farm={farm} notes={lab.researchNotes ?? []} updateData={updateData} />}
    </div>
  );
}

function LabDashboard({
  data,
  farm,
  status,
  lab,
  setTab
}: {
  data: AppData;
  farm: Farm;
  status: AppStatus | null;
  lab: NonNullable<AppData["appSettings"]["growOps"]>;
  setTab: (tab: GrowOpsLabTab) => void;
}) {
  const trials = lab.trials ?? [];
  const sensorImports = lab.sensorImports ?? [];
  const scouts = lab.ipmScouts ?? [];
  const notes = lab.researchNotes ?? [];
  const activeTrials = trials.filter((trial) => trial.status !== "completed");
  const highPressureScouts = scouts.filter((scout) => scout.pressure === "high" || scout.pressure === "severe");
  const latestSensor = [...sensorImports].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <LabMetric icon={FlaskConical} label="Active trials" value={activeTrials.length} detail={`${trials.length} local trial records`} />
        <LabMetric icon={Database} label="Sensor datasets" value={sensorImports.length} detail={latestSensor ? latestSensor.name : "CSV imports stay local"} />
        <LabMetric icon={AlertTriangle} label="IPM pressure" value={highPressureScouts.length} detail={`${scouts.length} scouting observations`} />
        <LabMetric icon={BookOpen} label="Research notes" value={notes.length} detail="Tagged local reference library" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Lab Focus" description="This tab intentionally does not duplicate the production planning screens. It reads current farm data for analysis and stores only lab records.">
          <div className="grid gap-3 md:grid-cols-2">
            <LabList title="Trials" empty="No active trials yet." items={activeTrials.slice(0, 5).map((trial) => `${trial.name} - ${trial.metric}`)} />
            <LabList title="Recent scouting" empty="No scouting observations yet." items={scouts.slice(0, 5).map((scout) => `${scout.date} - ${scout.target} - ${titleCase(scout.pressure)}`)} />
            <LabList title="Sensor imports" empty="No sensor datasets imported." items={sensorImports.slice(0, 5).map((item) => `${item.name} - ${item.rows.length} rows`)} />
            <LabList title="References" empty="No research notes saved." items={notes.slice(0, 5).map((note) => `${note.title} - ${note.tags.join(", ") || "untagged"}`)} />
          </div>
        </Panel>
        <Panel title="Open Lab Tool">
          <div className="grid gap-2">
            <Button onClick={() => setTab("trials")}><FlaskConical className="h-4 w-4" />Design trial</Button>
            <Button variant="secondary" onClick={() => setTab("phenology")}><LineChart className="h-4 w-4" />Calculate GDD</Button>
            <Button variant="secondary" onClick={() => setTab("climate")}><Gauge className="h-4 w-4" />Check VPD</Button>
            <Button variant="secondary" onClick={() => setTab("sensors")}><Upload className="h-4 w-4" />Import sensor CSV</Button>
          </div>
          <div className="mt-4 rounded-md border p-3">
            <p className="text-sm font-semibold">{farm.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">Storage: {status?.sqliteAvailable ? "SQLite desktop database" : "Browser fallback localStorage"}</p>
            <p className="mt-1 text-xs text-muted-foreground">Lab records are saved under local app settings and included in JSON backups.</p>
          </div>
        </Panel>
      </div>
      <Panel title="Current Farm Signals" description="Read-only context from the main app used by lab tools.">
        <div className="grid gap-3 md:grid-cols-4">
          <PathValue label="Crops" value={`${data.crops.filter((crop) => !crop.archived).length} crop profiles`} />
          <PathValue label="Plantings" value={`${data.plantings.filter((planting) => planting.farmId === farm.id).length} planting records`} />
          <PathValue label="Environments" value={`${data.environments.filter((environment) => environment.farmId === farm.id).length} growing environments`} />
          <PathValue label="Season" value={`${farm.seasonStart} to ${farm.seasonEnd}`} />
        </div>
      </Panel>
    </div>
  );
}

function TrialDesigner({ data, farm, trials, updateData }: { data: AppData; farm: Farm; trials: GrowOpsTrial[]; updateData: UpdateData }) {
  function submitTrial(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const timestamp = new Date().toISOString();
    const trial: GrowOpsTrial = {
      id: id("lab_trial"),
      farmId: farm.id,
      name: String(form.get("name") ?? ""),
      cropId: String(form.get("cropId") || ""),
      environmentId: String(form.get("environmentId") || ""),
      hypothesis: String(form.get("hypothesis") ?? ""),
      controlLabel: String(form.get("controlLabel") || "Control"),
      treatmentLabel: String(form.get("treatmentLabel") || "Treatment"),
      metric: String(form.get("metric") || "Yield"),
      controlValues: parseNumberList(String(form.get("controlValues") ?? "")),
      treatmentValues: parseNumberList(String(form.get("treatmentValues") ?? "")),
      startDate: String(form.get("startDate") || todayIso()),
      endDate: String(form.get("endDate") || ""),
      status: String(form.get("status") || "planned") as GrowOpsTrial["status"],
      notes: String(form.get("notes") ?? ""),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    updateLab(updateData, (lab) => ({ ...lab, trials: [trial, ...(lab.trials ?? [])] }), "GrowOps lab trial saved");
    event.currentTarget.reset();
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <Panel title="Trial Designer" description="Create control-vs-treatment experiments for cultivars, media, fertility, irrigation, spacing, lighting, pruning, or other farm questions.">
        <form className="grid gap-3" onSubmit={submitTrial}>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Trial name"><Input name="name" required /></Field>
            <Field label="Metric"><Input name="metric" defaultValue="Yield lb" /></Field>
            <Field label="Crop"><Select name="cropId"><option value="">No crop</option>{data.crops.filter((crop) => !crop.archived).map((crop) => <option key={crop.id} value={crop.id}>{crop.name}</option>)}</Select></Field>
            <Field label="Environment"><Select name="environmentId"><option value="">No environment</option>{data.environments.filter((environment) => environment.farmId === farm.id).map((environment) => <option key={environment.id} value={environment.id}>{environment.name}</option>)}</Select></Field>
            <Field label="Start date"><Input name="startDate" type="date" defaultValue={todayIso()} /></Field>
            <Field label="End date"><Input name="endDate" type="date" /></Field>
            <Field label="Status"><Select name="status"><option value="planned">Planned</option><option value="active">Active</option><option value="completed">Completed</option></Select></Field>
            <Field label="Control label"><Input name="controlLabel" defaultValue="Current practice" /></Field>
            <Field label="Treatment label"><Input name="treatmentLabel" defaultValue="Treatment A" /></Field>
          </div>
          <Field label="Hypothesis"><Textarea name="hypothesis" placeholder="Example: Coco coir plus lower EC will improve basil yield without increasing tip burn." /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Control values"><Input name="controlValues" placeholder="12, 14, 13, 15" /></Field>
            <Field label="Treatment values"><Input name="treatmentValues" placeholder="15, 16, 17, 16" /></Field>
          </div>
          <Field label="Notes"><Textarea name="notes" /></Field>
          <Button type="submit"><Save className="h-4 w-4" />Save trial</Button>
        </form>
      </Panel>
      <Panel title="Trial Records">
        {trials.length ? (
          <div className="space-y-3">
            {trials.map((trial) => {
              const summary = summarizeTrial(trial.controlValues, trial.treatmentValues);
              return (
                <div key={trial.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{trial.name}</p>
                      <p className="text-xs text-muted-foreground">{cropName(data, trial.cropId)} - {environmentName(data, trial.environmentId)} - {trial.metric}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={trial.status === "completed" ? "success" : trial.status === "active" ? "warning" : "muted"}>{titleCase(trial.status)}</Badge>
                      <Button size="icon" variant="ghost" title="Delete trial" onClick={() => updateLab(updateData, (lab) => ({ ...lab, trials: (lab.trials ?? []).filter((item) => item.id !== trial.id) }), "GrowOps lab trial deleted")}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{trial.hypothesis}</p>
                  <div className="mt-3 grid gap-2 md:grid-cols-4">
                    <PathValue label={trial.controlLabel} value={formatNumber(summary.controlAverage)} />
                    <PathValue label={trial.treatmentLabel} value={formatNumber(summary.treatmentAverage)} />
                    <PathValue label="Lift" value={`${formatNumber(summary.liftPercent, 1)}%`} />
                    <PathValue label="Signal" value={summary.confidenceNote} />
                  </div>
                  <MiniBarChart
                    values={[
                      { label: trial.controlLabel, value: summary.controlAverage },
                      { label: trial.treatmentLabel, value: summary.treatmentAverage }
                    ]}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No trials yet" body="Add a trial to compare a treatment against your current practice." />
        )}
      </Panel>
    </div>
  );
}

function PhenologyLab({ data, farm }: { data: AppData; farm: Farm }) {
  const [cropId, setCropId] = React.useState(data.crops.find((crop) => !crop.archived)?.id ?? "");
  const [baseF, setBaseF] = React.useState(50);
  const [upperF, setUpperF] = React.useState(86);
  const [rowsText, setRowsText] = React.useState(`date,minF,maxF
${todayIso()},55,82
${addDay(todayIso(), 1)},58,84
${addDay(todayIso(), 2)},60,86`);
  const crop = data.crops.find((item) => item.id === cropId);
  const entries = parseWeatherEntries(rowsText);
  const gddRows = calculateGrowingDegreeDays(entries, baseF, upperF);
  const cumulative = gddRows.reduce((sum, item) => sum + item.gdd, 0);
  const maturityTarget = crop ? crop.daysToMaturity * 10 : 650;
  const progress = Math.min(100, maturityTarget ? (cumulative / maturityTarget) * 100 : 0);

  return (
    <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
      <Panel title="GDD / Phenology Calculator" description="Paste weather rows manually or from a local logger export. No web weather service is required.">
        <div className="grid gap-3">
          <Field label="Crop"><Select value={cropId} onChange={(event) => setCropId(event.target.value)}>{data.crops.filter((item) => !item.archived).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Base F"><Input type="number" value={baseF} onChange={(event) => setBaseF(Number(event.target.value))} /></Field>
            <Field label="Upper F"><Input type="number" value={upperF} onChange={(event) => setUpperF(Number(event.target.value))} /></Field>
          </div>
          <Field label="Weather CSV"><Textarea className="min-h-48 font-mono text-xs" value={rowsText} onChange={(event) => setRowsText(event.target.value)} /></Field>
          <Button variant="secondary" onClick={() => downloadTextFile(`growops-gdd-${todayIso()}.csv`, toCsv(gddRows.map((row) => ({ ...row, gdd: Number(row.gdd.toFixed(2)) })), ["date", "gdd"]), "text/csv")}><Download className="h-4 w-4" />Export GDD CSV</Button>
        </div>
      </Panel>
      <Panel title="Phenology Output" action={<Badge tone={progress > 90 ? "success" : progress > 60 ? "warning" : "muted"}>{formatNumber(progress, 0)}% estimate</Badge>}>
        <div className="grid gap-3 md:grid-cols-3">
          <PathValue label="Cumulative GDD" value={formatNumber(cumulative, 1)} />
          <PathValue label="Maturity target" value={formatNumber(maturityTarget, 0)} />
          <PathValue label="Season" value={`${farm.seasonStart} to ${farm.seasonEnd}`} />
        </div>
        <SparklineChart
          className="mt-4"
          label="Cumulative GDD trend"
          points={gddRows.reduce<Array<{ label: string; value: number }>>((rows, row) => {
            const previous = rows[rows.length - 1]?.value ?? 0;
            rows.push({ label: row.date, value: previous + row.gdd });
            return rows;
          }, [])}
        />
        <div className="mt-4 max-h-72 overflow-auto rounded-md border">
          <table className="table-grid">
            <thead><tr><th>Date</th><th>GDD</th></tr></thead>
            <tbody>{gddRows.map((row) => <tr key={row.date}><td>{row.date}</td><td>{formatNumber(row.gdd, 2)}</td></tr>)}</tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function ClimateLab({ data, farm }: { data: AppData; farm: Farm }) {
  const [environmentId, setEnvironmentId] = React.useState(data.environments.find((env) => env.farmId === farm.id)?.id ?? "");
  const [tempF, setTempF] = React.useState(76);
  const [humidity, setHumidity] = React.useState(65);
  const environment = data.environments.find((item) => item.id === environmentId);
  const vpd = calculateVpdKpa(tempF, humidity);
  const status = vpd < 0.6 ? "low" : vpd > 1.6 ? "high" : "target";
  const diseaseRisk = humidity >= 80 || (environment?.assumptions.airflow === "low" && humidity >= 70);

  return (
    <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <Panel title="VPD / Climate Lab" description="Analyze greenhouse, tunnel, nursery, indoor, or rack climate readings offline.">
        <div className="grid gap-3">
          <Field label="Environment"><Select value={environmentId} onChange={(event) => setEnvironmentId(event.target.value)}>{data.environments.filter((item) => item.farmId === farm.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Air temp F"><Input type="number" value={tempF} onChange={(event) => setTempF(Number(event.target.value))} /></Field>
            <Field label="Relative humidity %"><Input type="number" value={humidity} onChange={(event) => setHumidity(Number(event.target.value))} /></Field>
          </div>
        </div>
      </Panel>
      <Panel title="Climate Interpretation" action={<Badge tone={status === "target" ? "success" : "warning"}>{titleCase(status)}</Badge>}>
        <div className="grid gap-3 md:grid-cols-3">
          <PathValue label="VPD" value={`${formatNumber(vpd, 2)} kPa`} />
          <PathValue label="Disease risk" value={diseaseRisk ? "Elevated" : "Normal"} />
          <PathValue label="Airflow" value={environment?.assumptions.airflow ?? "unknown"} />
        </div>
        <div className="mt-4 rounded-md border p-3 text-sm text-muted-foreground">
          {status === "low" ? "Low VPD can slow transpiration and increase fungal pressure. Increase airflow or reduce humidity if crop stage allows." : null}
          {status === "target" ? "VPD is in a broadly useful range for many vegetative crops. Validate against crop stage and cultivar behavior." : null}
          {status === "high" ? "High VPD can drive drought stress and calcium transport problems. Reduce heat load, increase humidity, or adjust irrigation." : null}
        </div>
      </Panel>
    </div>
  );
}

function WaterNutrientLab({ data, farm }: { data: AppData; farm: Farm }) {
  const [plantingId, setPlantingId] = React.useState(data.plantings.find((planting) => planting.farmId === farm.id)?.id ?? "");
  const [eto, setEto] = React.useState(0.18);
  const [cropCoefficient, setCropCoefficient] = React.useState(0.9);
  const [efficiency, setEfficiency] = React.useState(0.85);
  const [stockEc, setStockEc] = React.useState(8);
  const [targetEc, setTargetEc] = React.useState(1.8);
  const planting = data.plantings.find((item) => item.id === plantingId);
  const waterGallons = planting ? (eto * cropCoefficient * planting.areaSqFt * 0.623) / Math.max(0.1, efficiency) : 0;
  const dilution = stockEc ? Math.max(0, targetEc / stockEc) : 0;
  const nutrientGallons = waterGallons * dilution;

  return (
    <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <Panel title="Water & Nutrient Calculator" description="Offline estimates for irrigation demand and fertigation dilution. Use field judgement and actual sensor readings.">
        <div className="grid gap-3">
          <Field label="Planting"><Select value={plantingId} onChange={(event) => setPlantingId(event.target.value)}>{data.plantings.filter((item) => item.farmId === farm.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="ET estimate in/day"><Input type="number" step="0.01" value={eto} onChange={(event) => setEto(Number(event.target.value))} /></Field>
            <Field label="Crop coefficient"><Input type="number" step="0.05" value={cropCoefficient} onChange={(event) => setCropCoefficient(Number(event.target.value))} /></Field>
            <Field label="Irrigation efficiency"><Input type="number" step="0.05" value={efficiency} onChange={(event) => setEfficiency(Number(event.target.value))} /></Field>
            <Field label="Target EC"><Input type="number" step="0.1" value={targetEc} onChange={(event) => setTargetEc(Number(event.target.value))} /></Field>
            <Field label="Stock solution EC"><Input type="number" step="0.1" value={stockEc} onChange={(event) => setStockEc(Number(event.target.value))} /></Field>
          </div>
        </div>
      </Panel>
      <Panel title="Water / Fertigation Output">
        <div className="grid gap-3 md:grid-cols-3">
          <PathValue label="Daily water" value={`${formatNumber(waterGallons, 1)} gal`} />
          <PathValue label="Stock dilution" value={`${formatNumber(dilution * 100, 1)}%`} />
          <PathValue label="Stock needed" value={`${formatNumber(nutrientGallons, 2)} gal`} />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">This is a planning estimate. Check soil/media moisture, runoff, reservoir EC, and crop response before making large changes.</p>
      </Panel>
    </div>
  );
}

function IpmScoutingLab({ data, farm, scouts, updateData }: { data: AppData; farm: Farm; scouts: GrowOpsIpmScout[]; updateData: UpdateData }) {
  function submitScout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const timestamp = new Date().toISOString();
    const scout: GrowOpsIpmScout = {
      id: id("ipm"),
      farmId: farm.id,
      date: String(form.get("date") || todayIso()),
      cropId: String(form.get("cropId") || ""),
      environmentId: String(form.get("environmentId") || ""),
      target: String(form.get("target") ?? ""),
      count: Number(form.get("count") || 0),
      pressure: String(form.get("pressure") || "low") as GrowOpsIpmScout["pressure"],
      notes: String(form.get("notes") ?? ""),
      createdAt: timestamp
    };
    updateLab(updateData, (lab) => ({ ...lab, ipmScouts: [scout, ...(lab.ipmScouts ?? [])] }), "GrowOps IPM scout saved");
    event.currentTarget.reset();
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <Panel title="IPM Scouting Log" description="Track local pest and disease pressure without prescribing chemical action.">
        <form className="grid gap-3" onSubmit={submitScout}>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Date"><Input name="date" type="date" defaultValue={todayIso()} /></Field>
            <Field label="Target pest/disease"><Input name="target" required placeholder="aphids, powdery mildew, thrips" /></Field>
            <Field label="Crop"><Select name="cropId"><option value="">None</option>{data.crops.filter((crop) => !crop.archived).map((crop) => <option key={crop.id} value={crop.id}>{crop.name}</option>)}</Select></Field>
            <Field label="Environment"><Select name="environmentId"><option value="">None</option>{data.environments.filter((environment) => environment.farmId === farm.id).map((environment) => <option key={environment.id} value={environment.id}>{environment.name}</option>)}</Select></Field>
            <Field label="Count"><Input name="count" type="number" defaultValue="0" /></Field>
            <Field label="Pressure"><Select name="pressure"><option value="none">None</option><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option><option value="severe">Severe</option></Select></Field>
          </div>
          <Field label="Notes"><Textarea name="notes" placeholder="Counts, locations, sticky-card notes, crop stage, action threshold notes." /></Field>
          <Button type="submit"><Save className="h-4 w-4" />Save scout</Button>
        </form>
      </Panel>
      <Panel title="Scouting History">
        {scouts.length ? (
          <div className="max-h-[65vh] overflow-auto rounded-md border">
            <table className="table-grid">
              <thead><tr><th>Date</th><th>Target</th><th>Crop</th><th>Environment</th><th>Count</th><th>Pressure</th><th></th></tr></thead>
              <tbody>{scouts.map((scout) => <tr key={scout.id}><td>{scout.date}</td><td>{scout.target}</td><td>{cropName(data, scout.cropId)}</td><td>{environmentName(data, scout.environmentId)}</td><td>{scout.count}</td><td><Badge tone={scout.pressure === "high" || scout.pressure === "severe" ? "danger" : scout.pressure === "moderate" ? "warning" : "muted"}>{titleCase(scout.pressure)}</Badge></td><td><Button size="icon" variant="ghost" onClick={() => updateLab(updateData, (lab) => ({ ...lab, ipmScouts: (lab.ipmScouts ?? []).filter((item) => item.id !== scout.id) }), "GrowOps IPM scout deleted")}><Trash2 className="h-4 w-4" /></Button></td></tr>)}</tbody>
            </table>
          </div>
        ) : <EmptyState title="No scouting records" body="Add scouting observations to build local pest and disease pressure history." />}
      </Panel>
    </div>
  );
}

function SensorImportLab({ farm, sensorImports, updateData, setError }: { data: AppData; farm: Farm; sensorImports: GrowOpsSensorImport[]; updateData: UpdateData; setError: (message: string | null) => void }) {
  const [text, setText] = React.useState("date,tempF,humidityPercent,ph,ec,moisture\n2026-05-01,74,68,6.2,1.7,normal\n2026-05-02,77,72,6.1,1.8,normal");

  function importSensorRows() {
    try {
      const rows = parseCsv(text).map((row) => ({
        date: row.date || todayIso(),
        tempF: Number(row.tempF || 0),
        humidityPercent: Number(row.humidityPercent || 0),
        ph: row.ph ? Number(row.ph) : undefined,
        ec: row.ec ? Number(row.ec) : undefined,
        moisture: row.moisture || ""
      }));
      const timestamp = new Date().toISOString();
      const dataset: GrowOpsSensorImport = {
        id: id("sensor"),
        farmId: farm.id,
        name: `Sensor import ${timestamp.slice(0, 10)}`,
        source: "Pasted CSV",
        rows,
        createdAt: timestamp
      };
      updateLab(updateData, (lab) => ({ ...lab, sensorImports: [dataset, ...(lab.sensorImports ?? [])] }), "GrowOps sensor CSV imported");
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <Panel title="Sensor CSV Import" description="Paste local logger exports. Expected headers: date,tempF,humidityPercent,ph,ec,moisture.">
        <div className="space-y-3">
          <Textarea className="min-h-60 font-mono text-xs" value={text} onChange={(event) => setText(event.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={importSensorRows}><Upload className="h-4 w-4" />Import pasted CSV</Button>
            <Button variant="secondary" onClick={() => downloadTextFile(`growops-sensor-template.csv`, "date,tempF,humidityPercent,ph,ec,moisture\n2026-05-01,74,68,6.2,1.7,normal", "text/csv")}><Download className="h-4 w-4" />Template</Button>
          </div>
        </div>
      </Panel>
      <Panel title="Imported Sensor Datasets">
        {sensorImports.length ? (
          <div className="space-y-3">
            {sensorImports.map((dataset) => {
              const avgTemp = average(dataset.rows.map((row) => row.tempF).filter(isNumber));
              const avgRh = average(dataset.rows.map((row) => row.humidityPercent).filter(isNumber));
              const avgVpd = avgTemp && avgRh ? calculateVpdKpa(avgTemp, avgRh) : 0;
              return (
                <div key={dataset.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div><p className="font-medium">{dataset.name}</p><p className="text-xs text-muted-foreground">{dataset.source} - {dataset.rows.length} rows</p></div>
                    <Button size="icon" variant="ghost" onClick={() => updateLab(updateData, (lab) => ({ ...lab, sensorImports: (lab.sensorImports ?? []).filter((item) => item.id !== dataset.id) }), "GrowOps sensor import deleted")}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <PathValue label="Avg temp" value={`${formatNumber(avgTemp, 1)} F`} />
                    <PathValue label="Avg RH" value={`${formatNumber(avgRh, 1)}%`} />
                    <PathValue label="Avg VPD" value={`${formatNumber(avgVpd, 2)} kPa`} />
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <SparklineChart label="Temperature trend" points={dataset.rows.map((row) => ({ label: row.date, value: row.tempF ?? 0 }))} />
                    <SparklineChart label="Humidity trend" points={dataset.rows.map((row) => ({ label: row.date, value: row.humidityPercent ?? 0 }))} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : <EmptyState title="No sensor imports" body="Import CSV readings to analyze climate, pH, EC, and moisture trends offline." />}
      </Panel>
    </div>
  );
}

function ScenarioSimulator({ data, farm }: { data: AppData; farm: Farm }) {
  const [plantingId, setPlantingId] = React.useState(data.plantings.find((planting) => planting.farmId === farm.id)?.id ?? "");
  const [daysShift, setDaysShift] = React.useState(-7);
  const [plantCountMultiplier, setPlantCountMultiplier] = React.useState(1.1);
  const planting = data.plantings.find((item) => item.id === plantingId);
  const crop = data.crops.find((item) => item.id === planting?.cropId);
  const simulated = planting && crop ? buildScenarioPlanting(planting, crop, daysShift, plantCountMultiplier) : undefined;
  const unit = simulated ? data.bedOrUnits.find((item) => item.id === simulated.bedOrUnitId) : undefined;
  const environment = simulated ? data.environments.find((item) => item.id === simulated.environmentId) : undefined;
  const report = simulated ? evaluateGrowOpsCompatibility({
    crop,
    environment,
    methods: data.growingMethods.filter((method) => simulated.growingMethodIds.includes(method.id)),
    media: data.growingMedia.filter((medium) => simulated.mediumIds.includes(medium.id)),
    unit,
    planting: simulated,
    seasonEnd: farm.seasonEnd
  }) : undefined;

  return (
    <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <Panel title="Scenario Simulator" description="Analyze what-if changes without mutating the production crop plan.">
        <div className="grid gap-3">
          <Field label="Planting"><Select value={plantingId} onChange={(event) => setPlantingId(event.target.value)}>{data.plantings.filter((item) => item.farmId === farm.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
          <Field label="Shift seed date days"><Input type="number" value={daysShift} onChange={(event) => setDaysShift(Number(event.target.value))} /></Field>
          <Field label="Plant count multiplier"><Input type="number" step="0.05" value={plantCountMultiplier} onChange={(event) => setPlantCountMultiplier(Number(event.target.value))} /></Field>
        </div>
      </Panel>
      <Panel title="Scenario Output" action={report ? <Badge tone={report.status === "compatible" ? "success" : report.status === "incompatible" ? "danger" : "warning"}>{titleCase(report.status)} - {report.score}/100</Badge> : null}>
        {simulated ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <PathValue label="Seed date" value={simulated.seedDate} />
              <PathValue label="First harvest" value={simulated.firstHarvestDate} />
              <PathValue label="Expected revenue" value={formatCurrency(simulated.expectedRevenue, farm.currency)} />
            </div>
            <div className="space-y-2">{report?.issues.map((issue, index) => <div key={`${issue.field}-${index}`} className="rounded-md border p-3"><Badge tone={issue.status === "compatible" ? "success" : issue.status === "incompatible" ? "danger" : "warning"}>{titleCase(issue.status)}</Badge><p className="mt-2 text-sm text-muted-foreground">{issue.reason}</p><p className="mt-1 text-sm">{issue.suggestedFix}</p></div>)}</div>
          </div>
        ) : <EmptyState title="No planting selected" body="Create a planting in the main Crop Planning tab, then run what-if simulations here." />}
      </Panel>
    </div>
  );
}

function ResearchLibrary({ farm, notes, updateData }: { farm: Farm; notes: GrowOpsResearchNote[]; updateData: UpdateData }) {
  const [query, setQuery] = React.useState("");
  const filtered = notes.filter((note) => `${note.title} ${note.body} ${note.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase()));

  function submitNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const timestamp = new Date().toISOString();
    const note: GrowOpsResearchNote = {
      id: id("research"),
      farmId: farm.id,
      title: String(form.get("title") ?? ""),
      source: String(form.get("source") ?? ""),
      tags: String(form.get("tags") ?? "").split(",").map((item) => item.trim()).filter(Boolean),
      body: String(form.get("body") ?? ""),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    updateLab(updateData, (lab) => ({ ...lab, researchNotes: [note, ...(lab.researchNotes ?? [])] }), "GrowOps research note saved");
    event.currentTarget.reset();
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
      <Panel title="Local Research Note">
        <form className="grid gap-3" onSubmit={submitNote}>
          <Field label="Title"><Input name="title" required /></Field>
          <Field label="Source / citation"><Input name="source" placeholder="Extension PDF, grower trial, book, personal observation" /></Field>
          <Field label="Tags"><Input name="tags" placeholder="tomato, VPD, greenhouse" /></Field>
          <Field label="Note"><Textarea className="min-h-48" name="body" required /></Field>
          <Button type="submit"><Save className="h-4 w-4" />Save note</Button>
        </form>
      </Panel>
      <Panel title="Research Library" action={<Button variant="secondary" onClick={() => downloadTextFile(`growops-research-${todayIso()}.json`, JSON.stringify(notes, null, 2), "application/json")}><Download className="h-4 w-4" />Export</Button>}>
        <div className="mb-3">
          <Field label="Search"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" value={query} onChange={(event) => setQuery(event.target.value)} /></div></Field>
        </div>
        {filtered.length ? <div className="space-y-3">{filtered.map((note) => <div key={note.id} className="rounded-md border p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-medium">{note.title}</p><p className="text-xs text-muted-foreground">{note.source || "No source"} - {note.tags.join(", ") || "untagged"}</p></div><Button size="icon" variant="ghost" onClick={() => updateLab(updateData, (lab) => ({ ...lab, researchNotes: (lab.researchNotes ?? []).filter((item) => item.id !== note.id) }), "GrowOps research note deleted")}><Trash2 className="h-4 w-4" /></Button></div><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{note.body}</p></div>)}</div> : <EmptyState title="No research notes" body="Save local notes, citations, and observations for crop research and production experiments." />}
      </Panel>
    </div>
  );
}

function LabMetric({ icon: Icon, label, value, detail }: { icon: React.ElementType; label: string; value: React.ReactNode; detail: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-panel">
      <div className="flex items-center gap-2 text-muted-foreground"><Icon className="h-4 w-4" /><p className="text-xs font-medium uppercase tracking-normal">{label}</p></div>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function LabList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return <div className="rounded-md border p-3"><p className="text-sm font-semibold">{title}</p>{items.length ? <ul className="mt-2 space-y-1 text-sm text-muted-foreground">{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">{empty}</p>}</div>;
}

function PathValue({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border p-3"><p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm">{value}</p></div>;
}

function MiniBarChart({ values }: { values: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...values.map((item) => item.value));
  return (
    <div className="mt-3 rounded-md border bg-muted/20 p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-normal text-muted-foreground">Trial comparison</p>
      <div className="space-y-2">
        {values.map((item) => (
          <div key={item.label} className="grid grid-cols-[110px_1fr_56px] items-center gap-2 text-xs">
            <span className="truncate text-muted-foreground">{item.label}</span>
            <span className="h-2 rounded bg-muted"><span className="block h-2 rounded bg-primary" style={{ width: `${Math.max(3, (item.value / max) * 100)}%` }} /></span>
            <span className="text-right">{formatNumber(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SparklineChart({ points, label, className }: { points: Array<{ label: string; value: number }>; label: string; className?: string }) {
  const clean = points.filter((point) => Number.isFinite(point.value));
  const min = Math.min(0, ...clean.map((point) => point.value));
  const max = Math.max(1, ...clean.map((point) => point.value));
  const path = clean.map((point, index) => {
    const x = clean.length <= 1 ? 0 : (index / (clean.length - 1)) * 100;
    const y = 38 - ((point.value - min) / Math.max(1, max - min)) * 34;
    return `${x},${y}`;
  }).join(" ");
  return (
    <div className={`rounded-md border bg-muted/20 p-3 ${className ?? ""}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{clean.length ? `${formatNumber(clean[0].value)} to ${formatNumber(clean[clean.length - 1].value)}` : "No data"}</p>
      </div>
      <svg className="h-12 w-full overflow-visible" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={label}>
        <polyline points={path} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function getLab(data: AppData): NonNullable<AppData["appSettings"]["growOps"]> {
  return data.appSettings.growOps ?? {};
}

function updateLab(updateData: UpdateData, updater: (lab: NonNullable<AppData["appSettings"]["growOps"]>) => NonNullable<AppData["appSettings"]["growOps"]>, message: string) {
  updateData((current) => ({
    ...current,
    appSettings: {
      ...current.appSettings,
      growOps: updater(current.appSettings.growOps ?? {})
    }
  }), message);
}

function parseNumberList(value: string) {
  return value.split(",").map((item) => Number(item.trim())).filter((item) => Number.isFinite(item));
}

function parseWeatherEntries(text: string): GrowOpsWeatherEntry[] {
  return parseCsv(text)
    .map((row) => ({ date: row.date, minF: Number(row.minF), maxF: Number(row.maxF) }))
    .filter((row) => row.date && Number.isFinite(row.minF) && Number.isFinite(row.maxF));
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function isNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function addDay(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildScenarioPlanting(planting: Planting, crop: Crop, daysShift: number, plantCountMultiplier: number): Planting {
  const seedDate = addDay(planting.seedDate, daysShift);
  const dates = planDates(crop, seedDate, planting.startMethod);
  const plantCount = Math.max(1, Math.round(planting.plantCount * plantCountMultiplier));
  const expectedYield = crop.estimatedYieldBasis === "per_sqft" ? crop.estimatedYield * planting.areaSqFt : crop.estimatedYield * plantCount;
  return {
    ...planting,
    ...dates,
    plantCount,
    expectedYield,
    expectedRevenue: expectedYield * crop.estimatedPricePerUnit
  };
}

function cropName(data: AppData, cropId?: string) {
  return data.crops.find((crop) => crop.id === cropId)?.name ?? "Unassigned";
}

function environmentName(data: AppData, environmentId?: string) {
  return data.environments.find((environment) => environment.id === environmentId)?.name ?? "Unassigned";
}
