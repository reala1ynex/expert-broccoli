export type GrowOpsStatus = "compatible" | "caution" | "incompatible" | "unknown";

export interface GrowOpsCompatibilityInput {
  crop?: {
    name: string;
    daysToMaturity: number;
    spacingIn: number;
    rootDepthIn: number;
    humidityPreference: "low" | "moderate" | "high";
    compatibleEnvironmentTypes: string[];
    compatibleMethodTypes: string[];
    compatibleMediumIds: string[];
    preferredPhRange: [number, number];
    preferredEcRange?: [number, number];
  };
  environment?: {
    name: string;
    type: string;
    assumptions?: {
      humidityPercent?: number;
      airflow?: "low" | "moderate" | "high";
    };
  };
  methods: Array<{ id: string; name: string; type: string; category: string; compatibleMediaIds: string[] }>;
  media: Array<{ id: string; name: string; compatibleMethodIds: string[]; biologicalActivity?: string }>;
  planting?: {
    seedDate: string;
    terminationDate: string;
    spacingIn: number;
    plantCount: number;
    irrigationProfile?: {
      targetPh?: [number, number];
      targetEc?: [number, number];
    };
  };
  unit?: {
    name: string;
    capacityPlants: number;
    rootDepthIn: number;
  };
  seasonEnd?: string;
}

export interface GrowOpsCompatibilityIssue {
  status: GrowOpsStatus;
  field: string;
  reason: string;
  suggestedFix: string;
}

export interface GrowOpsCompatibilityReport {
  status: GrowOpsStatus;
  score: number;
  issues: GrowOpsCompatibilityIssue[];
}

export function evaluateGrowOpsCompatibility(input: GrowOpsCompatibilityInput): GrowOpsCompatibilityReport {
  const issues: GrowOpsCompatibilityIssue[] = [];
  const add = (status: GrowOpsStatus, field: string, reason: string, suggestedFix: string) => {
    issues.push({ status, field, reason, suggestedFix });
  };

  const { crop, environment, methods, media, planting, unit } = input;

  if (!crop) add("unknown", "crop", "No crop profile is selected.", "Select or create a crop profile before checking fit.");
  if (!environment) add("unknown", "environment", "No environment is selected.", "Assign a field, greenhouse, tunnel, room, rack, or patio environment.");
  if (!methods.length) add("unknown", "method", "No growing method is selected.", "Choose at least one growing method.");
  if (!media.length) add("unknown", "medium", "No growing medium is selected.", "Choose at least one growing medium.");

  if (crop && environment && !crop.compatibleEnvironmentTypes.includes(environment.type)) {
    add("caution", "crop_environment", `${crop.name} is not listed as a strong fit for ${environment.name}.`, "Choose a listed environment or document the controls that make this environment suitable.");
  }

  if (crop) {
    methods
      .filter((method) => !crop.compatibleMethodTypes.includes(method.type))
      .forEach((method) => add("caution", "crop_method", `${crop.name} is not commonly matched with ${method.name}.`, "Use a compatible method or lower projections until this combination is proven locally."));

    media
      .filter((medium) => !crop.compatibleMediumIds.includes(medium.id))
      .forEach((medium) => add("caution", "crop_medium", `${medium.name} is not in ${crop.name}'s preferred media list.`, "Use a preferred medium or schedule extra pH, EC, and moisture checks."));
  }

  methods.forEach((method) => {
    media.forEach((medium) => {
      if (!method.compatibleMediaIds.includes(medium.id) || !medium.compatibleMethodIds.includes(method.id)) {
        add("incompatible", "method_medium", `${medium.name} is not compatible with ${method.name}.`, "Switch the method or medium so both catalog records explicitly match.");
      }
    });
  });

  if (crop && planting) {
    if (planting.spacingIn < crop.spacingIn * 0.8) {
      add("caution", "spacing", `Spacing is ${planting.spacingIn} in, below the crop profile target of ${crop.spacingIn} in.`, "Increase spacing, reduce plant count, or add airflow and pruning tasks.");
    }
    const targetPh = planting.irrigationProfile?.targetPh;
    if (targetPh && (targetPh[1] < crop.preferredPhRange[0] || targetPh[0] > crop.preferredPhRange[1])) {
      add("incompatible", "ph", `Target pH ${targetPh.join("-")} does not overlap the crop range ${crop.preferredPhRange.join("-")}.`, "Adjust pH targets before planting.");
    }
    const targetEc = planting.irrigationProfile?.targetEc;
    if (crop.preferredEcRange && targetEc && (targetEc[1] < crop.preferredEcRange[0] || targetEc[0] > crop.preferredEcRange[1])) {
      add("caution", "ec", `Target EC ${targetEc.join("-")} does not overlap the crop range ${crop.preferredEcRange.join("-")}.`, "Use crop-stage fertigation targets and verify runoff or reservoir readings.");
    }
  }

  if (crop && unit) {
    if (unit.rootDepthIn < crop.rootDepthIn) add("caution", "root_depth", `${unit.name} has ${unit.rootDepthIn} in root depth; ${crop.name} prefers about ${crop.rootDepthIn} in.`, "Use a deeper unit or switch to a shallower-rooted crop.");
    if (planting && planting.plantCount > unit.capacityPlants) add("incompatible", "space_capacity", `${planting.plantCount} plants exceed ${unit.name}'s plant-slot capacity of ${unit.capacityPlants}.`, "Reduce quantity or split the planting across more units.");
  }

  if (crop && planting && input.seasonEnd && planting.terminationDate > input.seasonEnd) {
    add("caution", "season_length", `${crop.name} terminates after the farm season end date.`, "Start earlier, choose a faster crop, or move it to protected production.");
  }

  if (crop && environment?.assumptions?.humidityPercent && environment.assumptions.humidityPercent > 75 && crop.humidityPreference !== "high") {
    add("caution", "humidity", `${environment.name} is high humidity for ${crop.name}, increasing disease pressure.`, "Improve airflow, widen spacing, avoid wet foliage, and schedule scouting.");
  }

  if (environment?.type.includes("greenhouse") && environment.assumptions?.airflow === "low") {
    add("caution", "airflow", "Greenhouse airflow is marked low.", "Add circulation, venting, and disease scouting tasks.");
  }

  const hydroponic = methods.some((method) => method.category === "hydroponic" || method.type.includes("hydroponic") || method.type === "nft");
  if (hydroponic && media.some((medium) => medium.biologicalActivity === "high")) {
    add("incompatible", "hydroponic_suitability", "Hydroponic systems should not use biologically active soil media.", "Use water culture, rockwool, clay pebbles, perlite, or another compatible inert medium.");
  }

  if (!issues.length) add("compatible", "summary", "This crop, environment, method, and medium combination is compatible.", "Keep routine monitoring and scouting tasks active.");

  const penalty = issues.reduce((sum, issue) => sum + (issue.status === "incompatible" ? 38 : issue.status === "caution" ? 16 : issue.status === "unknown" ? 6 : 0), 0);
  const status: GrowOpsStatus = issues.some((issue) => issue.status === "incompatible") ? "incompatible" : issues.some((issue) => issue.status === "caution") ? "caution" : issues.some((issue) => issue.status === "unknown") ? "unknown" : "compatible";
  return { status, score: Math.max(0, 100 - penalty), issues };
}

export interface GrowOpsDiagnosticInput {
  symptoms: string[];
  affectedParts: string[];
  distribution: string;
  recentActions: string[];
  moisture: "dry" | "normal" | "wet" | "saturated";
  ph?: number;
  ec?: number;
  airTempF?: number;
  humidityPercent?: number;
  lightHours?: number;
  reservoirTempF?: number;
  dissolvedOxygen?: number;
  methodCategories: string[];
  mediumRiskFactors: string[];
  cropName?: string;
  cropType?: string;
  preferredPhRange?: [number, number];
  preferredEcRange?: [number, number];
}

export interface GrowOpsDiagnosticResult {
  cause: string;
  confidence: number;
  severity: "low" | "moderate" | "high" | "critical";
  urgency: "monitor" | "soon" | "prompt" | "immediate";
  evidence: string[];
  checks: string[];
  immediateActions: string[];
  correctionPlan: string[];
  prevention: string[];
  extensionRecommended: boolean;
}

interface DiagnosticRule {
  cause: string;
  severity: GrowOpsDiagnosticResult["severity"];
  urgency: GrowOpsDiagnosticResult["urgency"];
  extensionRecommended?: boolean;
  checks: string[];
  immediateActions: string[];
  correctionPlan: string[];
  prevention: string[];
  score: (input: GrowOpsDiagnosticInput) => { points: number; evidence: string[] };
}

const includes = (values: string[], term: string) => values.some((value) => value.toLowerCase().includes(term));
const anyText = (input: GrowOpsDiagnosticInput, term: string) => includes(input.symptoms, term) || includes(input.affectedParts, term) || includes(input.recentActions, term) || input.distribution.toLowerCase().includes(term);

export function scoreGrowOpsDiagnostic(input: GrowOpsDiagnosticInput): GrowOpsDiagnosticResult[] {
  const scored = growOpsDiagnosticRules.map((rule) => ({ rule, ...rule.score(input) })).filter((item) => item.points > 0);
  const maxPoints = Math.max(10, ...scored.map((item) => item.points));
  return scored
    .sort((a, b) => b.points - a.points)
    .slice(0, 6)
    .map((item) => ({
      cause: item.rule.cause,
      confidence: Math.min(0.95, Math.max(0.08, item.points / maxPoints)),
      severity: item.rule.severity,
      urgency: item.rule.urgency,
      evidence: item.evidence,
      checks: item.rule.checks,
      immediateActions: item.rule.immediateActions,
      correctionPlan: item.rule.correctionPlan,
      prevention: item.rule.prevention,
      extensionRecommended: Boolean(item.rule.extensionRecommended)
    }));
}

const growOpsDiagnosticRules: DiagnosticRule[] = [
  {
    cause: "Nitrogen deficiency",
    severity: "moderate",
    urgency: "soon",
    score: (input) => {
      let points = 0;
      const evidence: string[] = [];
      if (anyText(input, "yellow") || anyText(input, "chlorosis")) { points += 3; evidence.push("Yellowing or chlorosis was reported."); }
      if (anyText(input, "old") || anyText(input, "lower")) { points += 3; evidence.push("Symptoms are on lower or older growth."); }
      if (input.ec != null && input.ec < 1) { points += 2; evidence.push(`EC is low at ${input.ec}.`); }
      return { points, evidence };
    },
    checks: ["Compare old and new leaves.", "Check fertilizer and EC records."],
    immediateActions: ["Confirm pH and moisture before increasing fertility."],
    correctionPlan: ["Apply a crop-appropriate nitrogen correction if readings support it."],
    prevention: ["Track fertility schedule and leaching risk."]
  },
  {
    cause: "pH lockout",
    severity: "high",
    urgency: "prompt",
    score: (input) => {
      let points = 0;
      const evidence: string[] = [];
      if (input.ph != null && input.preferredPhRange && (input.ph < input.preferredPhRange[0] || input.ph > input.preferredPhRange[1])) { points += 6; evidence.push(`pH ${input.ph} is outside the crop range ${input.preferredPhRange.join("-")}.`); }
      if (anyText(input, "chlorosis") || anyText(input, "yellow")) { points += 2; evidence.push("Deficiency-like symptoms are present."); }
      return { points, evidence };
    },
    checks: ["Measure root-zone pH, not only source water.", "Recheck pH meter calibration."],
    immediateActions: ["Bring pH into range gradually before adding more nutrients."],
    correctionPlan: ["Tune irrigation or nutrient solution pH and retest within 24-48 hours."],
    prevention: ["Schedule pH checks for sensitive crops."]
  },
  {
    cause: "Overwatering / root stress",
    severity: "high",
    urgency: "prompt",
    score: (input) => {
      let points = 0;
      const evidence: string[] = [];
      if (input.moisture === "wet" || input.moisture === "saturated") { points += 4; evidence.push(`Media moisture is ${input.moisture}.`); }
      if (anyText(input, "wilting") || anyText(input, "root rot")) { points += 3; evidence.push("Wilting or root rot signs are reported."); }
      if (input.mediumRiskFactors.some((risk) => risk.includes("overwatering") || risk.includes("poor aeration"))) { points += 2; evidence.push("Selected media has poor aeration or overwatering risk."); }
      return { points, evidence };
    },
    checks: ["Inspect roots for color, smell, and firmness.", "Check drainage and irrigation frequency."],
    immediateActions: ["Pause irrigation until media returns to target moisture.", "Improve drainage and airflow around the root zone."],
    correctionPlan: ["Reset irrigation interval and remove plants with severe root decay."],
    prevention: ["Log moisture checks and avoid fixed irrigation when weather changes."]
  },
  {
    cause: "Underwatering / drought stress",
    severity: "moderate",
    urgency: "soon",
    score: (input) => {
      let points = 0;
      const evidence: string[] = [];
      if (input.moisture === "dry") { points += 4; evidence.push("Media is dry."); }
      if (anyText(input, "wilting") || anyText(input, "leaf edge burn")) { points += 2; evidence.push("Wilting or leaf-edge burn is reported."); }
      return { points, evidence };
    },
    checks: ["Check media moisture at root depth.", "Review recent irrigation volume."],
    immediateActions: ["Rehydrate evenly and avoid sudden high-EC feed."],
    correctionPlan: ["Adjust irrigation volume or frequency."],
    prevention: ["Use moisture checks during heat and wind events."]
  },
  {
    cause: "Heat stress",
    severity: "moderate",
    urgency: "soon",
    score: (input) => {
      let points = 0;
      const evidence: string[] = [];
      if (input.airTempF != null && input.airTempF >= 90) { points += 4; evidence.push(`Air temperature is ${input.airTempF}F.`); }
      if (anyText(input, "curling") || anyText(input, "wilting") || anyText(input, "fruit cracking")) { points += 2; evidence.push("Curling, wilting, or fruit cracking can match heat stress."); }
      return { points, evidence };
    },
    checks: ["Compare symptoms after hot periods.", "Check leaf temperature and ventilation."],
    immediateActions: ["Increase ventilation or shade and stabilize irrigation."],
    correctionPlan: ["Shift heat-sensitive crops or install shade/airflow controls."],
    prevention: ["Set heat-triggered scouting and irrigation checks."]
  },
  {
    cause: "Humidity / VPD stress and fungal disease risk",
    severity: "high",
    urgency: "prompt",
    extensionRecommended: true,
    score: (input) => {
      let points = 0;
      const evidence: string[] = [];
      if (input.humidityPercent != null && input.humidityPercent >= 80) { points += 4; evidence.push(`Humidity is high at ${input.humidityPercent}%.`); }
      if (anyText(input, "mold") || anyText(input, "mildew") || anyText(input, "spots")) { points += 4; evidence.push("Mold, mildew, or spots were reported."); }
      return { points, evidence };
    },
    checks: ["Inspect leaf undersides and dense canopy zones.", "Check airflow and overnight humidity."],
    immediateActions: ["Increase airflow, remove severely diseased tissue where appropriate, and avoid wet foliage."],
    correctionPlan: ["Improve spacing, ventilation, sanitation, and scouting cadence."],
    prevention: ["Use IPM monitoring and local extension confirmation for disease identification."]
  },
  {
    cause: "Pest damage",
    severity: "moderate",
    urgency: "soon",
    extensionRecommended: true,
    score: (input) => {
      let points = 0;
      const evidence: string[] = [];
      if (anyText(input, "holes") || anyText(input, "pest")) { points += 5; evidence.push("Holes or pest presence are reported."); }
      if (anyText(input, "spots") || anyText(input, "curling")) { points += 1; evidence.push("Spots or curling can occur with pest feeding."); }
      return { points, evidence };
    },
    checks: ["Inspect leaf undersides, sticky cards, and growing tips.", "Record pest counts before action."],
    immediateActions: ["Use non-destructive checks and sanitation first."],
    correctionPlan: ["Apply integrated pest management actions that match confirmed pest identity."],
    prevention: ["Schedule scouting routes and maintain pest-pressure history."]
  },
  {
    cause: "Salinity / EC stress",
    severity: "high",
    urgency: "prompt",
    score: (input) => {
      let points = 0;
      const evidence: string[] = [];
      if (input.ec != null && input.preferredEcRange && input.ec > input.preferredEcRange[1] + 0.5) { points += 5; evidence.push(`EC ${input.ec} is above the preferred range.`); }
      if (anyText(input, "burn") || anyText(input, "necrosis")) { points += 3; evidence.push("Burn or necrosis symptoms were reported."); }
      return { points, evidence };
    },
    checks: ["Measure runoff or reservoir EC.", "Review recent feed concentration changes."],
    immediateActions: ["Dilute or flush as appropriate for the method and crop."],
    correctionPlan: ["Return to target EC gradually and monitor new growth."],
    prevention: ["Track EC trends by environment."]
  },
  {
    cause: "Hydroponic oxygen deficiency",
    severity: "critical",
    urgency: "immediate",
    score: (input) => {
      let points = 0;
      const evidence: string[] = [];
      if (input.methodCategories.includes("hydroponic")) { points += 2; evidence.push("Hydroponic method is selected."); }
      if (input.dissolvedOxygen != null && input.dissolvedOxygen < 5) { points += 5; evidence.push(`Dissolved oxygen is low at ${input.dissolvedOxygen}.`); }
      if (input.reservoirTempF != null && input.reservoirTempF > 75) { points += 3; evidence.push(`Reservoir temperature is high at ${input.reservoirTempF}F.`); }
      return { points, evidence };
    },
    checks: ["Check pump, air stones, flow, and root color.", "Measure reservoir temperature and dissolved oxygen."],
    immediateActions: ["Restore aeration or flow immediately and cool solution if needed."],
    correctionPlan: ["Replace failing pumps/stones and sanitize affected systems."],
    prevention: ["Add reservoir checks and backup aeration planning."]
  },
  {
    cause: "Blossom end rot / calcium transport issue",
    severity: "high",
    urgency: "prompt",
    score: (input) => {
      let points = 0;
      const evidence: string[] = [];
      if (anyText(input, "blossom end rot") || anyText(input, "fruit")) { points += 4; evidence.push("Fruit or blossom-end symptoms were reported."); }
      if (input.moisture === "dry" || input.moisture === "saturated") { points += 3; evidence.push("Moisture swings can disrupt calcium movement."); }
      if (input.cropType === "fruiting") { points += 2; evidence.push("Fruiting crops are susceptible to calcium transport disorders."); }
      return { points, evidence };
    },
    checks: ["Inspect young fruit ends.", "Check irrigation consistency and EC."],
    immediateActions: ["Stabilize irrigation and avoid high-salt corrections."],
    correctionPlan: ["Tune irrigation and calcium availability after pH is confirmed."],
    prevention: ["Avoid moisture swings and monitor fruiting crops closely."]
  }
];

export interface GrowOpsWeatherEntry {
  date: string;
  minF: number;
  maxF: number;
}

export function calculateGrowingDegreeDays(entries: GrowOpsWeatherEntry[], baseF = 50, upperF = 86) {
  return entries.map((entry) => {
    const cappedMin = Math.min(Math.max(entry.minF, baseF), upperF);
    const cappedMax = Math.min(Math.max(entry.maxF, baseF), upperF);
    return { date: entry.date, gdd: Math.max(0, (cappedMin + cappedMax) / 2 - baseF) };
  });
}

export function calculateVpdKpa(tempF: number, relativeHumidityPercent: number) {
  const tempC = (tempF - 32) * (5 / 9);
  const saturation = 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  return Math.max(0, saturation * (1 - relativeHumidityPercent / 100));
}

export function summarizeTrial(controlValues: number[], treatmentValues: number[]) {
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const controlAverage = average(controlValues);
  const treatmentAverage = average(treatmentValues);
  const liftPercent = controlAverage ? ((treatmentAverage - controlAverage) / controlAverage) * 100 : 0;
  return {
    controlAverage,
    treatmentAverage,
    liftPercent,
    sampleSize: Math.min(controlValues.length, treatmentValues.length),
    confidenceNote: Math.min(controlValues.length, treatmentValues.length) >= 4 ? "Enough replicates for a useful farm-level signal." : "Treat as directional only; add more replicated observations."
  };
}
