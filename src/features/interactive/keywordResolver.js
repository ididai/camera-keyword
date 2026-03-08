function withDirectionSign(direction, theta) {
  if (!direction) return direction;

  const signed = Math.max(-180, Math.min(180, theta));
  const absTheta = Math.abs(signed);
  const isLeft = signed < 0;

  // Frontal and rear view remain sign-agnostic.
  if (absTheta < 18 || absTheta >= 165) return direction;

  const krText = String(direction.kr || "");
  const enText = String(direction.en || "");

  const kr =
    absTheta < 45
      ? `${isLeft ? "좌측" : "우측"}으로 살짝 턴`
      : absTheta < 80
        ? `${isLeft ? "좌향" : "우향"} 3/4 앞 — 대각선 45°`
        : absTheta < 100
          ? `${isLeft ? "좌측면" : "우측면"} 프로필 — 90°`
          : absTheta < 135
            ? `${isLeft ? "좌향" : "우향"} 3/4 뒤 — 135°`
            : `${isLeft ? "좌측" : "우측"} 어깨 너머 시점`;

  const en =
    absTheta < 45
      ? `slightly turned ${isLeft ? "left" : "right"}`
      : absTheta < 80
        ? `${isLeft ? "left-facing" : "right-facing"} 45-degree oblique view`
        : absTheta < 100
          ? `${isLeft ? "left" : "right"} side profile`
          : absTheta < 135
            ? `${isLeft ? "left-facing" : "right-facing"} rear 45-degree oblique view`
            : `over-the-shoulder (${isLeft ? "left" : "right"} shoulder)`;

  return {
    ...direction,
    kr: kr || krText,
    en: en || enText,
  };
}

export function resolveKeywords(phi, theta, r, subjectType) {
  const kw = subjectType.keywords;
  const absTheta = Math.abs(theta);
  const shotRatio = Math.min(1, Math.max(0, 1 - r));

  const hItem = kw.height.find((k) => phi >= k.phi[0] && phi < k.phi[1]) || kw.height[kw.height.length - 1];
  const dRaw = kw.direction.find((k) => absTheta >= k.theta[0] && absTheta < k.theta[1]) || kw.direction[kw.direction.length - 1];
  const dItem = withDirectionSign(dRaw, theta);
  // Camera distance uses inverse-r semantics in the renderer.
  // Convert to a user-facing shot ratio so prompt shot keywords stay aligned with the actual framing.
  const sItem = kw.shot.find((k) => shotRatio >= k.r[0] && shotRatio < k.r[1]) || kw.shot[kw.shot.length - 1];

  return { height: hItem, direction: dItem, shot: sItem };
}
