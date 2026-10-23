import './style.css';
import { Game } from './game';

const game = new Game(document.getElementById('app')!);
// Exposed for debugging from the browser console.
(window as unknown as { racerist: Game }).racerist = game;
