import type { CourseDef } from './course';
import { HAUNTED } from './haunted';
import { MEDIEVAL } from './medieval';
import { RAINBOW } from './rainbow';

/** Every course in select-screen order. Add a course by importing it and listing it here. */
export const COURSES: CourseDef[] = [MEDIEVAL, HAUNTED, RAINBOW];
