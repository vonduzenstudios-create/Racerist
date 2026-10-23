import type { CourseDef } from './course';
import { BEACH } from './beach';
import { FOREST } from './forest';
import { MEDIEVAL } from './medieval';

/** Every course in select-screen order. Add a course by importing it and listing it here. */
export const COURSES: CourseDef[] = [MEDIEVAL, FOREST, BEACH];
