import { id } from "../lib/utils";
import type { Crop, DiagnosticCase, DiagnosticResult, Environment, GrowingMedium, GrowingMethod } from "./types";

export interface DiagnosticContext {
  diagnosticCase: DiagnosticCase;
  crop?: Crop;
  environment?: Environment;
  methods: GrowingMethod[];
  media: GrowingMedium[];
}

interface Rule {
  cause: string;
  severity: DiagnosticResult["severity"];
  urgency: DiagnosticResult["urgency"];
  extensionRecommended?: boolean;
  score: (context: DiagnosticContext) => { points: number; evidence: string[] };
  checks: string[];
  immediateActions: string[];
  correctionPlan: string[];
  prevention: string[];
}

const has = (values: string[], term: string) => values.some((value) => value.toLowerCase().includes(term));
const textHas = (text: string, term: string) => text.toLowerCase().includes(term);

export function runDiagnostic(context: DiagnosticContext): DiagnosticResult[] {
  const createdAt = new Date().toISOString();
  const scored = diagnosticRules.map((rule) => {
    const result = rule.score(context);
    return { rule, points: result.points, evidence: result.evidence };
  });

  const maxPoints = Math.max(12, ...scored.map((item) => item.points));
  return scored
    .filter((item) => item.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 6)
    .map((item) => ({
      id: id("diag_result"),
      farmId: context.diagnosticCase.farmId,
      diagnosticCaseId: context.diagnosticCase.id,
      cause: item.rule.cause,
      confidence: Math.min(0.95, Math.max(0.08, item.points / maxPoints)),
      severity: item.rule.severity,
      urgency: item.rule.urgency,
      evidence: item.evidence,
      checks: item.rule.checks,
      immediateActions: item.rule.immediateActions,
      correctionPlan: item.rule.correctionPlan,
      prevention: item.rule.prevention,
      extensionRecommended: Boolean(item.rule.extensionRecommended),
      createdAt
    }));
}

const diagnosticRules: Rule[] = [
  {
    cause: "Nitrogen deficiency",
    severity: "moderate",
    urgency: "soon",
    score: ({ diagnosticCase }) => {
      let points = 0;
      const evidence: string[] = [];
      if (has(diagnosticCase.affectedParts, "older") || diagnosticCase.distribution === "older_growth") {
        points += 3;
        evidence.push("Symptoms are concentrated on older growth.");
      }
      if (has(diagnosticCase.symptomTypes, "yellow") || textHas(diagnosticCase.symptoms, "yellow")) {
        points += 3;
        evidence.push("Yellowing is reported.");
      }
      if (diagnosticCase.ec != null && diagnosticCase.ec < 1.0) {
        points += 2;
        evidence.push(`EC is low at ${diagnosticCase.ec}.`);
      }
      return { points, evidence };
    },
    checks: ["Compare older and newer leaves.", "Check recent fertilizer records.", "Confirm EC or soil nitrate if available."],
    immediateActions: ["Avoid large corrective doses until pH and moisture are acceptable.", "Apply a modest balanced nitrogen source if other readings are normal."],
    correctionPlan: ["Tune fertility to crop stage.", "Add weekly vigor notes for affected blocks."],
    prevention: ["Use crop-specific fertility schedules.", "Track harvest removal and leaching risk."]
  },
  {
    cause: "Potassium deficiency",
    severity: "moderate",
    urgency: "soon",
    score: ({ diagnosticCase, crop }) => {
      let points = 0;
      const evidence: string[] = [];
      if (textHas(diagnosticCase.symptoms, "edge") || textHas(diagnosticCase.symptoms, "margin") || has(diagnosticCase.symptomTypes, "marginal scorch")) {
        points += 4;
        evidence.push("Leaf edge symptoms or marginal scorch are reported.");
      }
      if (crop?.cropType === "fruiting") {
        points += 2;
        evidence.push("Fruiting crops have high potassium demand.");
      }
      if (diagnosticCase.ec != null && diagnosticCase.ec < 1.4) {
        points += 2;
        evidence.push("EC is low for a fruiting or heavy-feeding crop.");
      }
      return { points, evidence };
    },
    checks: ["Inspect older leaves for marginal chlorosis or scorch.", "Review fertigation potassium levels."],
    immediateActions: ["Keep moisture even before changing nutrient strength."],
    correctionPlan: ["Adjust feed to crop stage and verify EC response."],
    prevention: ["Use stage-based fertigation profiles for fruiting crops."]
  },
  {
    cause: "Magnesium deficiency",
    severity: "moderate",
    urgency: "soon",
    score: ({ diagnosticCase, media }) => {
      let points = 0;
      const evidence: string[] = [];
      if (textHas(diagnosticCase.symptoms, "interveinal") || has(diagnosticCase.symptomTypes, "interveinal chlorosis")) {
        points += 5;
        evidence.push("Interveinal chlorosis is reported.");
      }
      if (media.some((medium) => medium.id === "medium_coco")) {
        points += 2;
        evidence.push("Coco coir can contribute to calcium or magnesium imbalance if not buffered.");
      }
      return { points, evidence };
    },
    checks: ["Confirm the pattern appears between veins on older leaves.", "Check nutrient recipe magnesium level."],
    immediateActions: ["Do not overcorrect until pH is within range."],
    correctionPlan: ["Correct with a crop-appropriate magnesium source after pH verification."],
    prevention: ["Buffer coco and track Ca/Mg additions."]
  },
  {
    cause: "Iron deficiency",
    severity: "moderate",
    urgency: "soon",
    score: ({ diagnosticCase }) => {
      let points = 0;
      const evidence: string[] = [];
      if (diagnosticCase.distribution === "new_growth") {
        points += 3;
        evidence.push("Symptoms are concentrated on new growth.");
      }
      if (textHas(diagnosticCase.symptoms, "interveinal") || textHas(diagnosticCase.symptoms, "pale")) {
        points += 3;
        evidence.push("Pale or interveinal symptoms are reported.");
      }
      if (diagnosticCase.ph != null && diagnosticCase.ph > 6.8) {
        points += 3;
        evidence.push(`pH is high at ${diagnosticCase.ph}.`);
      }
      return { points, evidence };
    },
    checks: ["Look for yellow new leaves with green veins.", "Check pH in the root zone, not only source water."],
    immediateActions: ["Bring pH into crop range before adding more nutrients."],
    correctionPlan: ["Use iron source appropriate to pH and production method."],
    prevention: ["Add pH check tasks for sensitive crops."]
  },
  {
    cause: "Calcium transport issue",
    severity: "high",
    urgency: "prompt",
    score: ({ diagnosticCase, crop }) => {
      let points = 0;
      const evidence: string[] = [];
      if (has(diagnosticCase.affectedParts, "fruit") || textHas(diagnosticCase.symptoms, "blossom")) {
        points += 4;
        evidence.push("Fruit symptoms are reported.");
      }
      if (diagnosticCase.moisture === "dry" || diagnosticCase.moisture === "saturated") {
        points += 3;
        evidence.push(`Moisture is ${diagnosticCase.moisture}, which can disrupt calcium movement.`);
      }
      if (crop?.name.toLowerCase().includes("tomato") || crop?.name.toLowerCase().includes("pepper")) {
        points += 2;
        evidence.push(`${crop.name} is susceptible to blossom end rot-like calcium transport problems.`);
      }
      return { points, evidence };
    },
    checks: ["Inspect young fruit ends.", "Check irrigation consistency and root health.", "Verify EC is not excessive."],
    immediateActions: ["Stabilize irrigation and avoid aggressive pruning or high-salt corrections.", "Remove severely affected fruit if useful for crop load management."],
    correctionPlan: ["Tune irrigation frequency and maintain crop-appropriate EC.", "Review calcium availability after pH is confirmed."],
    prevention: ["Use steady moisture, avoid wide dry-back swings, and monitor fruiting crops closely."]
  },
  {
    cause: "Nutrient toxicity",
    severity: "high",
    urgency: "prompt",
    score: ({ diagnosticCase, crop }) => {
      let points = 0;
      const evidence: string[] = [];
      if (diagnosticCase.ec != null && diagnosticCase.ec > (crop?.preferredEcRange?.[1] ?? 2.5) + 0.7) {
        points += 5;
        evidence.push(`EC ${diagnosticCase.ec} is high for the selected crop.`);
      }
      if (textHas(diagnosticCase.symptoms, "burn") || textHas(diagnosticCase.symptoms, "scorch")) {
        points += 3;
        evidence.push("Burn or scorch symptoms are reported.");
      }
      return { points, evidence };
    },
    checks: ["Measure runoff or reservoir EC.", "Review recent feed changes."],
    immediateActions: ["Pause feed increases and correct with clean water or diluted solution as method-appropriate."],
    correctionPlan: ["Return to crop-stage EC targets gradually."],
    prevention: ["Log feed strength and export EC trends weekly."]
  },
  {
    cause: "pH lockout",
    severity: "high",
    urgency: "prompt",
    score: ({ diagnosticCase, crop }) => {
      let points = 0;
      const evidence: string[] = [];
      if (diagnosticCase.ph != null && crop && (diagnosticCase.ph < crop.preferredPhRange[0] || diagnosticCase.ph > crop.preferredPhRange[1])) {
        points += 6;
        evidence.push(`pH ${diagnosticCase.ph} is outside ${crop.name}'s preferred range ${crop.preferredPhRange.join("-")}.`);
      }
      if (textHas(diagnosticCase.symptoms, "deficiency") || has(diagnosticCase.symptomTypes, "chlorosis")) {
        points += 2;
        evidence.push("Deficiency-like symptoms are reported.");
      }
      return { points, evidence };
    },
    checks: ["Calibrate meter if readings are surprising.", "Measure root-zone pH."],
    immediateActions: ["Correct pH gradually according to crop and medium."],
    correctionPlan: ["Recheck pH after irrigation cycles and record response."],
    prevention: ["Add recurring pH checks for hydroponic and container crops."]
  },
  {
    cause: "Overwatering",
    severity: "moderate",
    urgency: "soon",
    score: ({ diagnosticCase, media }) => {
      let points = 0;
      const evidence: string[] = [];
      if (diagnosticCase.moisture === "wet" || diagnosticCase.moisture === "saturated") {
        points += 5;
        evidence.push(`Media is reported as ${diagnosticCase.moisture}.`);
      }
      if (media.some((medium) => medium.drainage <= 2)) {
        points += 2;
        evidence.push("Selected medium has low drainage.");
      }
      if (textHas(diagnosticCase.symptoms, "wilting")) {
        points += 1;
        evidence.push("Wilting can occur when saturated roots lack oxygen.");
      }
      return { points, evidence };
    },
    checks: ["Check root smell and color.", "Confirm drainage holes or bed drainage."],
    immediateActions: ["Pause irrigation until the root zone returns to normal moisture."],
    correctionPlan: ["Improve drainage, irrigation timing, and media structure."],
    prevention: ["Use moisture checks before watering."]
  },
  {
    cause: "Underwatering",
    severity: "moderate",
    urgency: "prompt",
    score: ({ diagnosticCase, media }) => {
      let points = 0;
      const evidence: string[] = [];
      if (diagnosticCase.moisture === "dry") {
        points += 5;
        evidence.push("Media is reported dry.");
      }
      if (media.some((medium) => medium.waterRetention <= 2)) {
        points += 2;
        evidence.push("Selected medium has low water retention.");
      }
      if (textHas(diagnosticCase.symptoms, "wilt")) {
        points += 2;
        evidence.push("Wilting is reported.");
      }
      return { points, evidence };
    },
    checks: ["Inspect dry pockets in containers or beds.", "Check emitter function and irrigation uniformity."],
    immediateActions: ["Rehydrate gradually and confirm drainage."],
    correctionPlan: ["Adjust frequency, emitter layout, or mulch/media blend."],
    prevention: ["Add irrigation checks during hot or windy periods."]
  },
  {
    cause: "Heat stress",
    severity: "moderate",
    urgency: "soon",
    score: ({ diagnosticCase, crop }) => {
      let points = 0;
      const evidence: string[] = [];
      if (diagnosticCase.airTempF != null && crop && diagnosticCase.airTempF > crop.temperatureRangeF[1] + 5) {
        points += 5;
        evidence.push(`Air temperature ${diagnosticCase.airTempF}F is high for ${crop.name}.`);
      }
      if (textHas(diagnosticCase.symptoms, "curl") || textHas(diagnosticCase.symptoms, "wilt")) {
        points += 2;
        evidence.push("Curling or wilting is reported.");
      }
      return { points, evidence };
    },
    checks: ["Compare symptoms at hottest time of day and morning recovery.", "Check canopy temperature if available."],
    immediateActions: ["Ventilate, shade, and water consistently."],
    correctionPlan: ["Move dates or add heat mitigation for sensitive crops."],
    prevention: ["Add hot-day irrigation and ventilation tasks."]
  },
  {
    cause: "Cold stress",
    severity: "moderate",
    urgency: "soon",
    score: ({ diagnosticCase, crop }) => {
      let points = 0;
      const evidence: string[] = [];
      if (diagnosticCase.airTempF != null && crop && diagnosticCase.airTempF < crop.temperatureRangeF[0] - 5) {
        points += 5;
        evidence.push(`Air temperature ${diagnosticCase.airTempF}F is low for ${crop.name}.`);
      }
      if (textHas(diagnosticCase.symptoms, "purple") || textHas(diagnosticCase.symptoms, "stunted")) {
        points += 2;
        evidence.push("Purple coloration or stunting is reported.");
      }
      return { points, evidence };
    },
    checks: ["Review night temperatures.", "Inspect new growth after warm days."],
    immediateActions: ["Add row cover, heat, or delay transplanting."],
    correctionPlan: ["Shift planting dates or environment assignment."],
    prevention: ["Use last frost and soil temperature checks."]
  },
  {
    cause: "Humidity/VPD stress",
    severity: "moderate",
    urgency: "soon",
    score: ({ diagnosticCase }) => {
      let points = 0;
      const evidence: string[] = [];
      if (diagnosticCase.humidityPercent != null && diagnosticCase.humidityPercent > 80) {
        points += 4;
        evidence.push(`Humidity is high at ${diagnosticCase.humidityPercent}%.`);
      }
      if (diagnosticCase.vpdKpa != null && (diagnosticCase.vpdKpa < 0.4 || diagnosticCase.vpdKpa > 1.6)) {
        points += 3;
        evidence.push(`VPD ${diagnosticCase.vpdKpa} kPa is outside a typical comfortable range.`);
      }
      return { points, evidence };
    },
    checks: ["Check morning condensation and leaf wetness duration.", "Compare humidity with temperature."],
    immediateActions: ["Ventilate and avoid evening overhead irrigation."],
    correctionPlan: ["Use airflow and irrigation timing to manage leaf wetness."],
    prevention: ["Track VPD or humidity in protected environments."]
  },
  {
    cause: "Poor airflow",
    severity: "moderate",
    urgency: "soon",
    score: ({ environment, diagnosticCase }) => {
      let points = 0;
      const evidence: string[] = [];
      if (environment?.assumptions.airflow === "low") {
        points += 4;
        evidence.push("Environment airflow is set to low.");
      }
      if (diagnosticCase.humidityPercent != null && diagnosticCase.humidityPercent > 75) {
        points += 2;
        evidence.push("Humidity is high enough to amplify airflow issues.");
      }
      return { points, evidence };
    },
    checks: ["Check dense canopy zones and dead air pockets."],
    immediateActions: ["Open vents, space plants, or add circulation fans where appropriate."],
    correctionPlan: ["Prune and trellis for airflow."],
    prevention: ["Add weekly airflow and canopy density checks."]
  },
  {
    cause: "Transplant shock",
    severity: "low",
    urgency: "monitor",
    score: ({ diagnosticCase }) => {
      let points = 0;
      const evidence: string[] = [];
      if (diagnosticCase.recentActions.some((action) => action.includes("transplant"))) {
        points += 4;
        evidence.push("Recent transplanting is reported.");
      }
      if (textHas(diagnosticCase.symptoms, "wilt") || textHas(diagnosticCase.symptoms, "stunted")) {
        points += 2;
        evidence.push("Wilting or stunting is reported.");
      }
      return { points, evidence };
    },
    checks: ["Check root ball moisture and planting depth."],
    immediateActions: ["Reduce stress with even moisture and moderate light if possible."],
    correctionPlan: ["Monitor new growth over the next several days."],
    prevention: ["Harden off starts and transplant during mild conditions."]
  },
  {
    cause: "Root rot",
    severity: "high",
    urgency: "prompt",
    extensionRecommended: true,
    score: ({ diagnosticCase, media }) => {
      let points = 0;
      const evidence: string[] = [];
      if (diagnosticCase.moisture === "saturated") {
        points += 4;
        evidence.push("Root zone is saturated.");
      }
      if (textHas(diagnosticCase.symptoms, "brown roots") || textHas(diagnosticCase.symptoms, "smell")) {
        points += 5;
        evidence.push("Brown roots or odor are reported.");
      }
      if (media.some((medium) => medium.diagnosticRiskFactors.includes("root rot"))) {
        points += 2;
        evidence.push("Selected medium has root rot risk factors.");
      }
      return { points, evidence };
    },
    checks: ["Inspect root color, smell, and sloughing.", "Check dissolved oxygen in hydroponic systems."],
    immediateActions: ["Improve oxygen and drainage immediately.", "Remove collapsed plants if disease spread is suspected."],
    correctionPlan: ["Sanitize affected systems and correct irrigation/root-zone conditions."],
    prevention: ["Avoid saturated media and maintain sanitation."]
  },
  {
    cause: "Fungal disease risk",
    severity: "high",
    urgency: "prompt",
    extensionRecommended: true,
    score: ({ diagnosticCase, environment }) => {
      let points = 0;
      const evidence: string[] = [];
      if (diagnosticCase.humidityPercent != null && diagnosticCase.humidityPercent > 78) {
        points += 3;
        evidence.push("High humidity is reported.");
      }
      if (textHas(diagnosticCase.symptoms, "spots") || textHas(diagnosticCase.symptoms, "mildew") || has(diagnosticCase.symptomTypes, "spots")) {
        points += 4;
        evidence.push("Spots or mildew-like symptoms are reported.");
      }
      if (environment?.type === "greenhouse" || environment?.type === "high_tunnel") {
        points += 1;
        evidence.push("Protected culture can increase humidity disease pressure.");
      }
      return { points, evidence };
    },
    checks: ["Inspect leaf undersides and pattern of spread.", "Check if symptoms start in humid or shaded zones."],
    immediateActions: ["Increase airflow, remove heavily affected plant material, and avoid wet foliage."],
    correctionPlan: ["Use IPM and only apply label-compliant products legal in the location."],
    prevention: ["Widen spacing, prune, and schedule morning irrigation."]
  },
  {
    cause: "Bacterial disease warning",
    severity: "high",
    urgency: "prompt",
    extensionRecommended: true,
    score: ({ diagnosticCase }) => {
      let points = 0;
      const evidence: string[] = [];
      if (textHas(diagnosticCase.symptoms, "water-soaked") || textHas(diagnosticCase.symptoms, "ooze")) {
        points += 6;
        evidence.push("Water-soaked lesions or ooze are reported.");
      }
      if (diagnosticCase.humidityPercent != null && diagnosticCase.humidityPercent > 80) {
        points += 2;
        evidence.push("High humidity can favor bacterial spread.");
      }
      return { points, evidence };
    },
    checks: ["Inspect for water-soaked lesions and rapid spread.", "Consider local extension confirmation."],
    immediateActions: ["Avoid working wet plants and isolate affected material."],
    correctionPlan: ["Sanitize tools and follow crop-specific IPM guidance."],
    prevention: ["Use sanitation, spacing, resistant cultivars, and dry foliage management."]
  },
  {
    cause: "Viral symptoms warning",
    severity: "high",
    urgency: "prompt",
    extensionRecommended: true,
    score: ({ diagnosticCase }) => {
      let points = 0;
      const evidence: string[] = [];
      if (textHas(diagnosticCase.symptoms, "mosaic") || textHas(diagnosticCase.symptoms, "ring") || textHas(diagnosticCase.symptoms, "distorted")) {
        points += 6;
        evidence.push("Mosaic, rings, or distorted growth are reported.");
      }
      if (has(diagnosticCase.symptomTypes, "distortion")) {
        points += 2;
        evidence.push("Distortion is selected as a symptom type.");
      }
      return { points, evidence };
    },
    checks: ["Check for vector pests and cultivar susceptibility.", "Seek lab or extension confirmation before acting broadly."],
    immediateActions: ["Flag affected plants and control vector pests using IPM."],
    correctionPlan: ["Remove confirmed infected plants according to local guidance."],
    prevention: ["Use clean seed/transplants and pest exclusion where practical."]
  },
  {
    cause: "Pest damage",
    severity: "moderate",
    urgency: "soon",
    score: ({ diagnosticCase }) => {
      let points = 0;
      const evidence: string[] = [];
      if (textHas(diagnosticCase.symptoms, "holes") || textHas(diagnosticCase.symptoms, "webbing") || textHas(diagnosticCase.symptoms, "stippling")) {
        points += 5;
        evidence.push("Feeding damage, webbing, or stippling is reported.");
      }
      if (has(diagnosticCase.affectedParts, "leaf")) {
        points += 1;
        evidence.push("Leaves are affected.");
      }
      return { points, evidence };
    },
    checks: ["Inspect undersides of leaves with a hand lens.", "Use sticky cards or beating tray if appropriate."],
    immediateActions: ["Identify the pest before treatment and use IPM first."],
    correctionPlan: ["Remove hotspots and choose label-compliant controls only if needed."],
    prevention: ["Scout weekly and manage weeds/reservoir hosts."]
  },
  {
    cause: "Light burn",
    severity: "moderate",
    urgency: "soon",
    score: ({ diagnosticCase }) => {
      let points = 0;
      const evidence: string[] = [];
      if (textHas(diagnosticCase.symptoms, "bleached") || textHas(diagnosticCase.symptoms, "burn")) {
        points += 3;
        evidence.push("Bleaching or burn is reported.");
      }
      if (diagnosticCase.lightIntensity != null && diagnosticCase.lightIntensity > 900) {
        points += 4;
        evidence.push(`Light intensity ${diagnosticCase.lightIntensity} is high.`);
      }
      if (diagnosticCase.lightHours != null && diagnosticCase.lightHours > 18) {
        points += 2;
        evidence.push("Long light duration is reported.");
      }
      return { points, evidence };
    },
    checks: ["Measure light at canopy height.", "Check if top leaves nearest fixtures are worst."],
    immediateActions: ["Raise or dim fixtures and monitor new growth."],
    correctionPlan: ["Set crop-specific DLI targets."],
    prevention: ["Record fixture height and photoperiod by crop stage."]
  },
  {
    cause: "Low light",
    severity: "low",
    urgency: "soon",
    score: ({ diagnosticCase }) => {
      let points = 0;
      const evidence: string[] = [];
      if (textHas(diagnosticCase.symptoms, "leggy") || textHas(diagnosticCase.symptoms, "stretched")) {
        points += 5;
        evidence.push("Leggy or stretched growth is reported.");
      }
      if (diagnosticCase.lightHours != null && diagnosticCase.lightHours < 8) {
        points += 3;
        evidence.push("Light duration is low.");
      }
      return { points, evidence };
    },
    checks: ["Compare spacing between nodes and canopy density.", "Measure light level at canopy height."],
    immediateActions: ["Increase light duration or intensity gradually."],
    correctionPlan: ["Improve fixture spacing or move crop to a brighter zone."],
    prevention: ["Set crop-specific light schedules."]
  },
  {
    cause: "Salinity/EC stress",
    severity: "high",
    urgency: "prompt",
    score: ({ diagnosticCase, media }) => {
      let points = 0;
      const evidence: string[] = [];
      if (diagnosticCase.ec != null && diagnosticCase.ec > 3) {
        points += 5;
        evidence.push(`EC is high at ${diagnosticCase.ec}.`);
      }
      if (media.some((medium) => medium.diagnosticRiskFactors.includes("salinity") || medium.diagnosticRiskFactors.includes("salt buildup"))) {
        points += 2;
        evidence.push("Selected medium has salt buildup risk.");
      }
      return { points, evidence };
    },
    checks: ["Check runoff EC or reservoir EC trend.", "Review fertilizer and water alkalinity."],
    immediateActions: ["Dilute or leach as appropriate for the method without waterlogging roots."],
    correctionPlan: ["Reset feed targets and monitor response."],
    prevention: ["Schedule EC checks and avoid unmanaged dry-down in containers."]
  },
  {
    cause: "Blossom end rot",
    severity: "high",
    urgency: "prompt",
    score: ({ diagnosticCase, crop }) => {
      let points = 0;
      const evidence: string[] = [];
      if (textHas(diagnosticCase.symptoms, "blossom end") || textHas(diagnosticCase.symptoms, "sunken end")) {
        points += 6;
        evidence.push("Blossom-end or sunken fruit symptoms are reported.");
      }
      if (crop && ["tomato", "pepper", "eggplant"].some((name) => crop.name.toLowerCase().includes(name))) {
        points += 2;
        evidence.push(`${crop.name} is susceptible to blossom end rot.`);
      }
      if (diagnosticCase.moisture === "dry" || diagnosticCase.moisture === "saturated") {
        points += 2;
        evidence.push("Moisture instability is reported.");
      }
      return { points, evidence };
    },
    checks: ["Inspect first fruit clusters.", "Check moisture consistency and EC."],
    immediateActions: ["Stabilize irrigation and remove badly affected fruit."],
    correctionPlan: ["Reduce moisture swings and verify calcium availability."],
    prevention: ["Use steady irrigation, healthy roots, and moderate EC."]
  },
  {
    cause: "Pollination issue",
    severity: "moderate",
    urgency: "soon",
    score: ({ diagnosticCase, crop }) => {
      let points = 0;
      const evidence: string[] = [];
      if (textHas(diagnosticCase.symptoms, "misshapen") || textHas(diagnosticCase.symptoms, "poor fruit set")) {
        points += 4;
        evidence.push("Misshapen fruit or poor fruit set is reported.");
      }
      if (crop?.cropType === "fruiting") {
        points += 2;
        evidence.push("Fruiting crops depend on pollination conditions.");
      }
      if (diagnosticCase.airTempF != null && diagnosticCase.airTempF > 90) {
        points += 2;
        evidence.push("High temperatures can reduce pollen viability.");
      }
      return { points, evidence };
    },
    checks: ["Check flowers, pollinator activity, and tunnel airflow.", "Compare fruit set by bed location."],
    immediateActions: ["Improve ventilation and hand-assist pollination where practical."],
    correctionPlan: ["Manage temperature and humidity during flowering."],
    prevention: ["Use pollination checks during flowering windows."]
  },
  {
    cause: "Media compaction",
    severity: "moderate",
    urgency: "soon",
    score: ({ diagnosticCase, media }) => {
      let points = 0;
      const evidence: string[] = [];
      if (textHas(diagnosticCase.symptoms, "stunted") || textHas(diagnosticCase.symptoms, "poor roots")) {
        points += 2;
        evidence.push("Stunting or poor roots are reported.");
      }
      if (media.some((medium) => medium.name.toLowerCase().includes("clay") || medium.drainage <= 2)) {
        points += 4;
        evidence.push("Selected medium has compaction or poor drainage risk.");
      }
      return { points, evidence };
    },
    checks: ["Probe soil/media resistance and root depth.", "Check infiltration after irrigation."],
    immediateActions: ["Avoid working wet soil and correct irrigation first."],
    correctionPlan: ["Improve structure with appropriate amendments or choose raised/container culture."],
    prevention: ["Protect bed structure and avoid compaction traffic."]
  },
  {
    cause: "Hydroponic oxygen deficiency",
    severity: "high",
    urgency: "immediate",
    score: ({ diagnosticCase, methods }) => {
      let points = 0;
      const evidence: string[] = [];
      if (methods.some((method) => method.category === "hydroponic")) {
        points += 2;
        evidence.push("Hydroponic method is selected.");
      }
      if (diagnosticCase.dissolvedOxygen != null && diagnosticCase.dissolvedOxygen < 5) {
        points += 5;
        evidence.push(`Dissolved oxygen ${diagnosticCase.dissolvedOxygen} mg/L is low.`);
      }
      if (diagnosticCase.reservoirTempF != null && diagnosticCase.reservoirTempF > 72) {
        points += 2;
        evidence.push(`Reservoir temperature ${diagnosticCase.reservoirTempF}F can reduce oxygen.`);
      }
      return { points, evidence };
    },
    checks: ["Check air pump, stones, flow, and root color.", "Measure reservoir temperature and dissolved oxygen."],
    immediateActions: ["Restore aeration and circulation immediately."],
    correctionPlan: ["Keep reservoir temperature in range and maintain redundant aeration for sensitive crops."],
    prevention: ["Schedule reservoir and oxygen checks."]
  },
  {
    cause: "Aquaponic nutrient imbalance",
    severity: "moderate",
    urgency: "soon",
    score: ({ methods, diagnosticCase }) => {
      let points = 0;
      const evidence: string[] = [];
      if (methods.some((method) => method.category === "aquaponic")) {
        points += 4;
        evidence.push("Aquaponic method is selected.");
      }
      if (textHas(diagnosticCase.symptoms, "yellow") || textHas(diagnosticCase.symptoms, "pale")) {
        points += 2;
        evidence.push("Yellowing or pale growth is reported.");
      }
      return { points, evidence };
    },
    checks: ["Check pH, fish feed rate, iron availability, and biofilter stability."],
    immediateActions: ["Avoid abrupt nutrient additions that could harm fish or biofilter."],
    correctionPlan: ["Balance crop demand with aquaponic system biology and locally appropriate supplements."],
    prevention: ["Log water quality and crop symptoms together."]
  }
];

export const diagnosticDisclaimer =
  "Diagnosis is advisory and form-based. The app does not guarantee disease identification. Chemical or pesticide actions must follow the product label and local law. Prefer integrated pest management and seek local extension, lab, or crop advisor confirmation for severe, spreading, or uncertain issues.";
