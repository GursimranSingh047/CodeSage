import type { ThreeElements } from "@react-three/fiber";

// R3F v8: expose three.js elements (mesh, group, sphereGeometry, …) to JSX
declare global {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}
