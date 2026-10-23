# Racerist

A browser kart racer tech demo set in a medieval city. Every model, texture, sound effect and song is generated in code at startup. There are no image, model or audio files in the repo.

**Play:** https://vonduzenstudios-create.github.io/Racerist/ (after the Pages deploy runs)

## What's in the demo

- **One course:** a three-lap circuit through a half-timbered medieval town, under a castle gatehouse, over a wooden jump ramp, past market stalls, with the castle on the hill and the city walls on the horizon.
- **Four racers**, each with different stats and a special power that charges over time:
  - **Dark Orc:** heavy and fast. *Rampage* makes it faster, immune to hazards, and spins out anyone it rams.
  - **Light Elf:** light, with the best handling. *Blink* teleports it 35 metres up the road.
  - **Robot:** balanced. *Overclock* gives a long boost that ignores rough ground.
  - **Dirty Dwarf:** the best acceleration. *Mud Bomb* lobs mud ahead that leaves a slowing puddle.
- **Items** from the ? boxes, weighted by your place: Haste Potion (boost), Rotten Cabbage (dropped trap), Fireball (homes in on the racer ahead), Magic Ward (blocks one hit).
- **Driving:** hop-drift with two boost tiers (blue then orange sparks), a start boost, jumps, wall glancing, and slow cobbled verges.
- **Hazards:** peasants carrying hay, bread and kegs, plus pigs, wander across the market crossings.
- **AI rivals** with three difficulties (Squire, Knight, King) that take racing lines, drift, dodge traps, and use items and powers.
- **Audio:** Web Audio synthesis for the engine, effects, and a seeded saltarello-style tune (drone, lute, recorder and tabor) that speeds up on the final lap.

## Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Accelerate | W / Up | A |
| Brake / reverse | S / Down | Left stick back or d-pad down |
| Steer | A D / Left Right | Left stick or d-pad |
| Hop and drift (hold while steering) | Space or Shift | Any bumper or trigger (LB, RB, LT, RT) |
| Use item | J, X or Ctrl | B or X |
| Use power | K or E | Y |
| Look back | R or Q | Stick click or Back/View |
| Pause | Esc or P | Start |
| Mute | M | |

Items can be fired while holding accelerate (A sits next to B and X; on keyboard J, X and Ctrl are away from the arrow keys).

For a start boost, press accelerate as the "2" fades. Press it too early and the engine floods.

## Development

```sh
npm install
npm run dev      # local dev server
npm run build    # typecheck and production build into dist/
```

Add `?autopilot` to the URL to let the AI drive your kart, which is handy for testing.

## Code layout

| File | Purpose |
| --- | --- |
| `src/game.ts` | Scene, race flow, powers, collisions, camera |
| `src/track.ts` | Spline track, queries, and all course scenery |
| `src/kart.ts` | Arcade kart physics and drift/boost logic |
| `src/characters.ts` | Racer stats, powers and procedural models |
| `src/ai.ts` | AI driver |
| `src/items.ts` | Item boxes, items, mud puddles |
| `src/hazards.ts` | Peasants and pigs |
| `src/audio.ts` | Synth sound effects and music sequencer |
| `src/textures.ts` | Canvas-painted textures |
| `src/ui.ts`, `src/style.css` | Menus, HUD, minimap, results |
| `src/input.ts` | Keyboard and gamepad input |

Every kart is driven through the same `KartInput` structure, whether the source is a player, the AI, or (later) a network peer, so online multiplayer can plug in at that seam.

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`. In the repository's **Settings → Pages**, set **Source** to **GitHub Actions** once.
