import { AmbientLight } from "three/src/lights/AmbientLight.js";
import { BoxGeometry } from "three/src/geometries/BoxGeometry.js";
import { ConeGeometry } from "three/src/geometries/ConeGeometry.js";
import { CylinderGeometry } from "three/src/geometries/CylinderGeometry.js";
import { DirectionalLight } from "three/src/lights/DirectionalLight.js";
import { Group } from "three/src/objects/Group.js";
import { Mesh } from "three/src/objects/Mesh.js";
import { MeshBasicMaterial } from "three/src/materials/MeshBasicMaterial.js";
import { MeshLambertMaterial } from "three/src/materials/MeshLambertMaterial.js";
import { PerspectiveCamera } from "three/src/cameras/PerspectiveCamera.js";
import { PlaneGeometry } from "three/src/geometries/PlaneGeometry.js";
import { Scene } from "three/src/scenes/Scene.js";
import { SphereGeometry } from "three/src/geometries/SphereGeometry.js";
import { WebGLRenderer } from "three/src/renderers/WebGLRenderer.js";

const THREE_RUNTIME = Object.freeze({
  AmbientLight,
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  WebGLRenderer,
});

export async function loadThreeRuntime() {
  return THREE_RUNTIME;
}
