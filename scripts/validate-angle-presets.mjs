import { ANGLE_PRESETS, SUBJECT_TYPES } from "../src/features/interactive/constants.js";
import { resolveKeywords } from "../src/features/interactive/keywordResolver.js";

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`OK: ${message}`);
}

const person = SUBJECT_TYPES.find((item) => item.id === "person");
if (!person) {
  fail("person subject type not found");
  process.exit(1);
}

for (const preset of ANGLE_PRESETS) {
  const expectedShot = String(preset.shotTargetKr || "").trim();
  if (!expectedShot) {
    fail(`ANGLE_PRESET ${preset.id} is missing shotTargetKr`);
    continue;
  }

  const resolved = resolveKeywords(preset.phi, preset.theta, preset.r, person);
  const actualShot = String(resolved?.shot?.kr || "");
  if (!actualShot.includes(expectedShot)) {
    fail(
      `preset ${preset.id}: expected shot "${expectedShot}", got "${actualShot}" (phi=${preset.phi}, theta=${preset.theta}, r=${preset.r})`,
    );
  } else {
    ok(`preset ${preset.id}: ${actualShot}`);
  }
}

for (const subject of SUBJECT_TYPES) {
  const shotRanges = subject?.keywords?.shot || [];
  if (!shotRanges.length) {
    fail(`subject ${subject.id}: missing shot ranges`);
    continue;
  }

  const firstShot = shotRanges[0]?.kr || "";
  const lastShot = shotRanges[shotRanges.length - 1]?.kr || "";
  const midHeightRange = subject?.keywords?.height?.[Math.floor((subject?.keywords?.height?.length || 1) / 2)];
  const phiSample = midHeightRange?.phi ? (midHeightRange.phi[0] + midHeightRange.phi[1]) / 2 : 60;

  const nearShot = String(resolveKeywords(phiSample, 0, 1, subject)?.shot?.kr || "");
  const farShot = String(resolveKeywords(phiSample, 0, 0, subject)?.shot?.kr || "");

  if (nearShot !== firstShot || farShot !== lastShot) {
    fail(
      `subject ${subject.id}: distance mapping mismatch (near="${nearShot}", far="${farShot}", expectedNear="${firstShot}", expectedFar="${lastShot}")`,
    );
  } else {
    ok(`subject ${subject.id}: near/far shot mapping is consistent`);
  }

  // Shot should not change when only angle(phi) changes.
  const shotAtLowPhi = String(resolveKeywords(20, 0, 0.5, subject)?.shot?.kr || "");
  const shotAtHighPhi = String(resolveKeywords(150, 0, 0.5, subject)?.shot?.kr || "");
  if (shotAtLowPhi !== shotAtHighPhi) {
    fail(
      `subject ${subject.id}: shot depends on phi unexpectedly (phi20="${shotAtLowPhi}", phi150="${shotAtHighPhi}")`,
    );
  } else {
    ok(`subject ${subject.id}: shot is independent from angle(phi)`);
  }

  // Height should not change when only distance(r) changes.
  const heightNear = String(resolveKeywords(phiSample, 0, 0.85, subject)?.height?.kr || "");
  const heightFar = String(resolveKeywords(phiSample, 0, 0.15, subject)?.height?.kr || "");
  if (heightNear !== heightFar) {
    fail(
      `subject ${subject.id}: height depends on shot distance unexpectedly (near="${heightNear}", far="${heightFar}")`,
    );
  } else {
    ok(`subject ${subject.id}: angle(height) is independent from shot distance`);
  }

  // Direction should preserve left/right sign.
  const directionRight = String(resolveKeywords(phiSample, 35, 0.5, subject)?.direction?.kr || "");
  const directionLeft = String(resolveKeywords(phiSample, -35, 0.5, subject)?.direction?.kr || "");
  if (!directionRight || !directionLeft || directionRight === directionLeft) {
    fail(
      `subject ${subject.id}: direction sign collapsed (theta+="${directionRight}", theta-="${directionLeft}")`,
    );
  } else {
    ok(`subject ${subject.id}: direction keeps left/right sign`);
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("All preset mapping checks passed.");
