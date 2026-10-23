import type * as THREE from 'three';
import type { Track } from '../track';

/** A creature or person that wanders across a hazard crossing. */
export interface WalkerModel {
  root: THREE.Group;
  /** Pivots swung back and forth while walking. */
  legs: THREE.Object3D[];
  /** Walking speed across the road, metres per second. */
  speed: number;
  /** Sound played at the kart when it knocks this over. */
  sound: string;
  /** Optional cry from the walker itself, such as a peasant's "ouch". */
  cry?: string;
  /** Particle colour for the knock-over burst. */
  color: number;
}

export interface RampDef {
  /** Where the ramp starts, as a fraction of the lap. */
  at: number;
  length: number;
  height: number;
}

export interface CourseEnv {
  /** Sky gradient stops from the zenith down to the horizon. */
  sky: string[];
  fog: number;
  fogNear: number;
  fogFar: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  sun: number;
  sunIntensity: number;
  /** Colour of the dust kicked up off the road. */
  dust: number;
}

export interface CourseSurfaces {
  road: () => THREE.Texture;
  verge: () => THREE.Texture;
  /** Material for the low barrier along both sides, and its height. */
  wall: () => THREE.Material;
  wallHeight: number;
}

export interface CourseDef {
  id: string;
  name: string;
  tagline: string;
  /** Spline control points as [x, z] or [x, z, elevation]. Driven anticlockwise from the first. */
  controlPoints: ([number, number] | [number, number, number])[];
  ramps: RampDef[];
  /** Rows of item boxes, as fractions of the lap. */
  itemRows: number[];
  /** Hazard crossings, as fractions of the lap. Leave empty for none. */
  crossings: number[];
  /** Builds the hazard for slot `i` of crossing `crossing`. */
  walker?: (rand: () => number, crossing: number, i: number, count: number) => WalkerModel;
  env: CourseEnv;
  surfaces: CourseSurfaces;
  music: { seed: number; tempo: number };
  /** Background sound bed, an id from AMBIENCES in sfx.ts. */
  ambience: string;
  /** Builds everything off the road: ground, start gate, buildings, trees, landmarks. */
  decorate: (track: Track, group: THREE.Group, rand: () => number) => void;
}
