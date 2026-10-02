import * as THREE from "three";
import design from "../design/sky-palettes.json";

const surfaces: Record<string, string> = {
  Frosted_Polymer: "#626b70", Ivory_Edges: "#687277", Optical_Diffuser: "#192226",
  Titanium_Fasteners: "#b1b9bb", Index_Inlay: "#c6a36b", Printed_Label: "#303a3e",
  Subsurface_Optics: "#939e9f", Optical_Edges: "#bbc3bc", Carbon_Ink: "#b6bdb8",
};
/** Extend existing optical shaders; one float per instance avoids new meshes or passes. */
export function themeMaterial(material: THREE.Material, name: string, instanced = false, subduedIndex = { value: 0 }) {
  const amount = { value: 0 };
  const before = material.onBeforeCompile;
  const cache = material.customProgramCacheKey.bind(material)();
  const color = new THREE.Color(surfaces[name] ?? (name.includes("Orange") ? "#bb8850" : "#969f9f"));
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    shader.uniforms.rhineTheme = amount;
    shader.uniforms.rhineDarkSurface = { value: color };
    shader.uniforms.rhineSubduedIndex = subduedIndex;
    if (instanced) {
      shader.vertexShader = "attribute float archiveTheme; varying float vRhineTheme;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvRhineTheme = archiveTheme;");
      shader.fragmentShader = "varying float vRhineTheme;\n" + shader.fragmentShader;
    }
    shader.fragmentShader = "uniform float rhineTheme; uniform vec3 rhineDarkSurface; uniform float rhineSubduedIndex;\n" + shader.fragmentShader;
    const mix = instanced ? "vRhineTheme" : "rhineTheme";
    const printed = name === "Printed_Canvas";
    const anchor = printed ? "#include <opaque_fragment>" : "#include <roughnessmap_fragment>";
    const dark = printed
      ? "mix(vec3(0.023, 0.032, 0.037), vec3(0.78, 0.78, 0.71), 1.0 - smoothstep(0.12, 0.65, dot(diffuseColor.rgb, vec3(.2126,.7152,.0722))))"
      : name === "Frosted_Polymer" && !instanced
        ? "mix(rhineDarkSurface, vec3(0.92, 0.96, 0.97), glassRevealAtHeight(archiveClarity, vArchiveHeight))"
        : name === "Index_Inlay" ? "mix(rhineDarkSurface, vec3(0.030, 0.042, 0.048), rhineSubduedIndex)" : "rhineDarkSurface";
    const output = printed ? "outgoingLight" : "diffuseColor.rgb";
    shader.fragmentShader = shader.fragmentShader.replace(anchor, `${output} = mix(${output}, ${dark}, ${mix});\n${anchor}`);
  };
  material.customProgramCacheKey = () => `${cache}-rhine-theme-${name}-${instanced}`;
  return amount;
}

/** New color literals belong to this palette, ready for author presets. */
export const skyPalette = design.palettes;
const skyHeight = 256, middleStop = .3, horizonStop = .55;
const skyLight = ["top", "middle", "horizon"].map(key => new THREE.Color(skyPalette.dawn.light[key as "top"]));
const skyDark = ["top", "middle", "horizon"].map(key => new THREE.Color(skyPalette.dawn.dark[key as "top"]));
const sample = new THREE.Color();
type Baseline = { sky: THREE.DataTexture; pixels: Uint16Array; viewport: { value: THREE.Vector4 }; materials: WeakSet<THREE.Material>; amount: number; intensity: number; exposure: number; lights: { light: THREE.Light; intensity: number }[]; floor?: { material: THREE.MeshStandardMaterial; color: THREE.Color } };
const scenes = new WeakMap<THREE.Scene, Baseline>();
const floorColor = new THREE.Color(skyPalette.dawn.dark.floor);
/** Fog resolves to the same screen-height sample as the opaque WebGL sky.
 * The existing distance factor preserves nearby models, shadows and optics.
 * This also works for the archive floor covering the camera's entire view. */
function skyFog(material: THREE.Material, baseline: Baseline) {
  if (baseline.materials.has(material) || !("fog" in material) || !material.fog) return;
  baseline.materials.add(material);
  const before = material.onBeforeCompile;
  const cache = material.customProgramCacheKey.bind(material)();
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    shader.uniforms.archiveSky = { value: baseline.sky };
    shader.uniforms.archiveSkyViewport = baseline.viewport;
    shader.uniforms.archiveSkyHaze = { value: baseline.floor ? .92 : 0 };
    shader.vertexShader = "varying vec4 vArchiveSkyClip;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\nvArchiveSkyClip = gl_Position;");
    shader.fragmentShader = "uniform sampler2D archiveSky; uniform float archiveSkyHaze; varying vec4 vArchiveSkyClip;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <fog_fragment>", `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  vec2 skyUV = vArchiveSkyClip.xy / vArchiveSkyClip.w * 0.5 + 0.5;
  // The long lens keeps most physical depths in a narrow range. An upper
  // atmospheric feather merges the far array into the same sky while leaving
  // the central selected archive and its extraction geometry intact.
  fogFactor = max(fogFactor, smoothstep(0.45, 1.0, skyUV.y) * archiveSkyHaze);
  vec3 skyFogColor = texture2D(archiveSky, clamp(skyUV, 0.0, 1.0)).rgb;
  #ifdef TONE_MAPPING
    skyFogColor = toneMapping(skyFogColor);
  #endif
  skyFogColor = linearToOutputTexel(vec4(skyFogColor, 1.0)).rgb;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, skyFogColor, fogFactor);
#endif`);
  };
  material.customProgramCacheKey = () => `${cache}-archive-sky-fog`;
  material.needsUpdate = true;
}
/** Owners release the per-scene texture together with their renderer. */
export function disposeThemeEnvironment(scene: THREE.Scene) {
  const baseline = scenes.get(scene);
  if (!baseline) return;
  baseline.sky.dispose();
  if (scene.background === baseline.sky) scene.background = null;
  scenes.delete(scene);
}
export function themeEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer, amount: number) {
  let baseline = scenes.get(scene);
  if (!baseline) {
    const lights: Baseline["lights"] = [];
    scene.traverse(object => { if (object instanceof THREE.Light) lights.push({ light: object, intensity: object.intensity }); });
    const floor = scene.getObjectByName("archive-floor") as THREE.Mesh | undefined;
    const material = floor?.material as THREE.MeshStandardMaterial | undefined;
    const pixels = new Uint16Array(skyHeight * 4);
    const sky = new THREE.DataTexture(pixels, 1, skyHeight, THREE.RGBAFormat, THREE.HalfFloatType);
    // Tone map the sky just like fogged geometry; sRGB backgrounds bypass tone mapping.
    sky.colorSpace = THREE.LinearSRGBColorSpace;
    sky.magFilter = sky.minFilter = THREE.LinearFilter;
    sky.generateMipmaps = false;
    baseline = { sky, pixels, viewport: { value: new THREE.Vector4() }, materials: new WeakSet(), amount: NaN, intensity: scene.environmentIntensity,
      exposure: renderer.toneMappingExposure, lights, floor: material ? { material, color: material.color.clone() } : undefined };
    scenes.set(scene, baseline);
  }
  const environment = baseline;
  scene.traverse(object => {
    if (object instanceof THREE.Mesh) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => skyFog(material, environment));
    }
  });
  scene.background = baseline.sky;
  if (amount !== baseline.amount) {
    const nodes = skyLight.map((color, i) => color.clone().lerp(skyDark[i], amount));
    for (let row = 0; row < skyHeight; row++) {
      // DataTexture starts at the bottom: convert to height measured from the top.
      const height = 1 - row / (skyHeight - 1);
      const segment = height < middleStop ? 0 : 1;
      const fraction = segment === 0 ? height / middleStop : (height - middleStop) / (horizonStop - middleStop);
      sample.copy(nodes[segment]).lerp(nodes[segment + 1], THREE.MathUtils.clamp(fraction, 0, 1));
      const offset = row * 4;
      baseline.pixels[offset] = THREE.DataUtils.toHalfFloat(sample.r);
      baseline.pixels[offset + 1] = THREE.DataUtils.toHalfFloat(sample.g);
      baseline.pixels[offset + 2] = THREE.DataUtils.toHalfFloat(sample.b);
      baseline.pixels[offset + 3] = THREE.DataUtils.toHalfFloat(1);
    }
    baseline.sky.needsUpdate = true;
    baseline.amount = amount;
    // Keep the semantic fog color for diagnostics; rendered fog samples each
    // pixel's sky height so upper cards cannot flatten the gradient to one color.
    if (scene.fog) scene.fog.color.copy(nodes[2]);
  }
  if (baseline.floor) baseline.floor.material.color.copy(baseline.floor.color).lerp(floorColor, amount);
  scene.environmentIntensity = THREE.MathUtils.lerp(baseline.intensity, .32, amount);
  renderer.toneMappingExposure = THREE.MathUtils.lerp(baseline.exposure, .98, amount);
  for (const { light, intensity } of baseline.lights) light.intensity = intensity * (1 - .35 * amount);
}
