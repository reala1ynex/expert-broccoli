import { daysBetween } from "../lib/utils";
import type {
  BedOrUnit,
  CompatibilityIssue,
  CompatibilityReport,
  CompatibilityStatus,
  Crop,
  Environment,
  Farm,
  GrowingMedium,
  GrowingMethod,
  Planting
} from "./types";

export interface CompatibilityInput {
  farm?: Farm;
  crop?: Crop;
  environment?: Environment;
  methods: GrowingMethod[];
  media: GrowingMedium[];
  planting?: Planting;
  bedOrUnit?: BedOrUnit;
}

const severityScore: Record<CompatibilityStatus, number> = {
  compatible: 0,
  unknown: 6,
  caution: 18,
  incompatible: 38
};

export function checkCompatibility(input: CompatibilityInput): CompatibilityReport {
  const issues: CompatibilityIssue[] = [];
  const add = (status: CompatibilityStatus, field: string, message: string, suggestedFix: string) => {
    issues.push({ status, field, message, suggestedFix });
  };

  const { crop, environment, methods, media, planting, bedOrUnit, farm } = input;
  if (!crop) {
    add("unknown", "crop", "No crop is selected, so compatibility cannot be evaluated.", "Select a crop from the library.");
  }
  if (!environment) {
    add("unknown", "environment", "No growing environment is selected.", "Assign an environment before planting.");
  }
  if (methods.length === 0) {
    add("unknown", "method", "No growing method is selected.", "Choose at least one growing method.");
  }
  if (media.length === 0) {
    add("unknown", "medium", "No growing medium is selected.", "Choose at least one growing medium.");
  }

  if (crop && environment && !crop.compatibleEnvironmentTypes.includes(environment.type)) {
    add(
      "caution",
      "environment",
      `${crop.name} is not listed as a strong fit for ${environment.name}.`,
      "Choose a listed environment or document the controls that make this environment suitable."
    );
  }

  if (crop && methods.length > 0) {
    const incompatibleMethods = methods.filter((method) => !crop.compatibleMethodTypes.includes(method.type));
    incompatibleMethods.forEach((method) =>
      add(
        "caution",
        "method",
        `${crop.name} is not commonly recommended for ${method.name}.`,
        "Switch to a compatible method or lower the expected yield until proven locally."
      )
    );
  }

  methods.forEach((method) => {
    media.forEach((medium) => {
      if (!method.compatibleMediaIds.includes(medium.id) || !medium.compatibleMethodIds.includes(method.id)) {
        add(
          "incompatible",
          "method_medium",
          `${medium.name} is not compatible with ${method.name}.`,
          "Use a medium explicitly compatible with the selected method."
        );
      }
    });
  });

  if (crop) {
    media
      .filter((medium) => !crop.compatibleMediumIds.includes(medium.id))
      .forEach((medium) =>
        add(
          "caution",
          "crop_medium",
          `${medium.name} is not in the preferred media list for ${crop.name}.`,
          "Use a preferred medium or add monitoring tasks for water, pH, and EC."
        )
      );
  }

  if (crop && planting) {
    if (planting.spacingIn < crop.spacingIn * 0.8) {
      add(
        "caution",
        "spacing",
        `Spacing is ${planting.spacingIn}" while the crop profile recommends about ${crop.spacingIn}".`,
        "Increase spacing, improve pruning/airflow, or reduce expected yield."
      );
    }
    const phTarget = planting.irrigationProfile.targetPh;
    if (phTarget && (phTarget[1] < crop.preferredPhRange[0] || phTarget[0] > crop.preferredPhRange[1])) {
      add(
        "incompatible",
        "ph",
        `Target pH ${phTarget.join("-")} does not overlap ${crop.name}'s preferred range ${crop.preferredPhRange.join("-")}.`,
        "Adjust pH targets to overlap the crop range."
      );
    }
    if (crop.preferredEcRange && planting.irrigationProfile.targetEc) {
      const targetEc = planting.irrigationProfile.targetEc;
      if (targetEc[1] < crop.preferredEcRange[0] || targetEc[0] > crop.preferredEcRange[1]) {
        add(
          "caution",
          "ec",
          `Target EC ${targetEc.join("-")} does not overlap ${crop.name}'s preferred range ${crop.preferredEcRange.join("-")}.`,
          "Use crop-specific fertigation targets and verify runoff or reservoir readings."
        );
      }
    }
  }

  if (crop && bedOrUnit) {
    if (bedOrUnit.rootDepthIn < crop.rootDepthIn) {
      add(
        "caution",
        "root_depth",
        `${bedOrUnit.name} has ${bedOrUnit.rootDepthIn}" root depth; ${crop.name} prefers about ${crop.rootDepthIn}".`,
        "Select a deeper unit, reduce plant size expectations, or choose a shallower-rooted crop."
      );
    }
    if (planting && planting.plantCount > bedOrUnit.capacityPlants) {
      add(
        "incompatible",
        "capacity",
        `${planting.plantCount} plants exceed ${bedOrUnit.name}'s capacity of ${bedOrUnit.capacityPlants}.`,
        "Reduce plant count or assign additional space."
      );
    }
  }

  if (crop && environment) {
    const lowTemp = environment.assumptions.lowTempF;
    const highTemp = environment.assumptions.highTempF;
    if (lowTemp != null && lowTemp < crop.temperatureRangeF[0] - 5) {
      add("caution", "temperature", `${environment.name} can run colder than ${crop.name}'s preferred range.`, "Add season protection, heat, or shift dates.");
    }
    if (highTemp != null && highTemp > crop.temperatureRangeF[1] + 5) {
      add("caution", "temperature", `${environment.name} can run hotter than ${crop.name}'s preferred range.`, "Improve ventilation, shade, or schedule the crop in a cooler window.");
    }
    if (environment.assumptions.humidityPercent && environment.assumptions.humidityPercent > 75 && crop.humidityPreference !== "high") {
      add(
        "caution",
        "humidity",
        `${environment.name} humidity is high for ${crop.name}, raising disease pressure.`,
        "Add airflow, wider spacing, morning irrigation, and scouting tasks."
      );
    }
  }

  if (crop && farm && planting) {
    const effectiveSeasonEnd = environment?.assumptions.seasonExtensionDays ? shiftDate(farm.seasonEnd, environment.assumptions.seasonExtensionDays) : farm.seasonEnd;
    if (planting.terminationDate > effectiveSeasonEnd) {
      add(
        "caution",
        "season_length",
        `${crop.name} terminates after the planned season end (${effectiveSeasonEnd}).`,
        "Start earlier, use a shorter cultivar, or choose a protected environment."
      );
    }
    if (daysBetween(planting.seedDate, planting.firstHarvestDate) < crop.daysToMaturity * 0.7) {
      add("unknown", "date_plan", "The planting date plan appears shorter than the crop maturity profile.", "Regenerate dates from the crop profile.");
    }
  }

  if (methods.some((method) => method.category === "hydroponic") && media.some((medium) => medium.biologicalActivity === "high")) {
    add("incompatible", "hydroponic_medium", "Hydroponic methods should not use biologically active soil media.", "Use inert media or water culture appropriate for hydroponics.");
  }

  if (issues.length === 0) {
    add("compatible", "summary", "This crop, method, medium, and environment combination is compatible.", "Keep routine monitoring tasks active.");
  }

  const penalty = issues.reduce((sum, issue) => sum + severityScore[issue.status], 0);
  const score = Math.max(0, 100 - penalty);
  const status: CompatibilityStatus =
    issues.some((issue) => issue.status === "incompatible") ? "incompatible" : issues.some((issue) => issue.status === "caution") ? "caution" : issues.some((issue) => issue.status === "unknown") ? "unknown" : "compatible";

  return { status, score, issues };
}

function shiftDate(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
