export function resolveKeywords(phi, theta, r, subjectType) {
  const kw = subjectType.keywords;
  const absTheta = Math.abs(theta);

  const hItem = kw.height.find(k => phi >= k.phi[0] && phi < k.phi[1]) || kw.height[kw.height.length-1];
  const dItem = kw.direction.find(k => absTheta >= k.theta[0] && absTheta < k.theta[1]) || kw.direction[kw.direction.length-1];
  const sItem = kw.shot.find(k => r >= k.r[0] && r < k.r[1]) || kw.shot[kw.shot.length-1];

  return { height: hItem, direction: dItem, shot: sItem };
}
