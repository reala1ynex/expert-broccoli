import test from "node:test";
import assert from "node:assert/strict";

function checkCompatibility({ crop, environment, methods, media, planting }) {
  const issues = [];
  const add = (status, field, message) => issues.push({ status, field, message });
  if (!crop.compatibleEnvironmentTypes.includes(environment.type)) add("caution", "environment", "environment mismatch");
  for (const method of methods) {
    if (!crop.compatibleMethodTypes.includes(method.type)) add("caution", "method", "method mismatch");
    for (const medium of media) {
      if (!method.compatibleMediaIds.includes(medium.id) || !medium.compatibleMethodIds.includes(method.id)) add("incompatible", "method_medium", "method and medium mismatch");
    }
  }
  if (planting.spacingIn < crop.spacingIn * 0.8) add("caution", "spacing", "spacing too dense");
  if (planting.irrigationProfile.targetPh[1] < crop.preferredPhRange[0] || planting.irrigationProfile.targetPh[0] > crop.preferredPhRange[1]) add("incompatible", "ph", "pH range mismatch");
  const status = issues.some((issue) => issue.status === "incompatible") ? "incompatible" : issues.some((issue) => issue.status === "caution") ? "caution" : "compatible";
  return { status, issues };
}

test("compatibility flags method and medium incompatibility", () => {
  const crop = {
    compatibleEnvironmentTypes: ["greenhouse"],
    compatibleMethodTypes: ["nft"],
    preferredPhRange: [5.8, 6.5],
    spacingIn: 8
  };
  const environment = { type: "greenhouse" };
  const methods = [{ id: "method_nft", type: "nft", compatibleMediaIds: ["medium_water"] }];
  const media = [{ id: "medium_clay_soil", compatibleMethodIds: ["method_soil"] }];
  const planting = { spacingIn: 8, irrigationProfile: { targetPh: [5.9, 6.2] } };
  const report = checkCompatibility({ crop, environment, methods, media, planting });
  assert.equal(report.status, "incompatible");
  assert.equal(report.issues[0].field, "method_medium");
});

test("compatibility flags pH lockout and dense spacing", () => {
  const crop = {
    compatibleEnvironmentTypes: ["outdoor_field"],
    compatibleMethodTypes: ["raised_beds"],
    preferredPhRange: [6.2, 7.0],
    spacingIn: 12
  };
  const environment = { type: "outdoor_field" };
  const methods = [{ id: "method_bed", type: "raised_beds", compatibleMediaIds: ["medium_loam"] }];
  const media = [{ id: "medium_loam", compatibleMethodIds: ["method_bed"] }];
  const planting = { spacingIn: 7, irrigationProfile: { targetPh: [5.2, 5.6] } };
  const report = checkCompatibility({ crop, environment, methods, media, planting });
  assert.equal(report.status, "incompatible");
  assert.ok(report.issues.some((issue) => issue.field === "spacing"));
  assert.ok(report.issues.some((issue) => issue.field === "ph"));
});
