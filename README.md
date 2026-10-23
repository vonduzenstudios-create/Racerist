# Racerist

A browser kart racer tech demo across the fantasy realms. Every model, texture, sound effect and song is generated in code at startup. There are no image, model or audio files in the repo.

**Play:** https://vonduzenstudios-create.github.io/Racerist/ (after the Pages deploy runs)

## What's in the demo

- **Courses**, picked on the select screen (Up/Down or the d-pad), three laps each:
  - **Castle Town:** a half-timbered medieval town, under a castle gatehouse, over a wooden jump ramp, past market stalls, with the castle on the hill and the city walls on the horizon.
  - **Whispering Woods:** a dirt road over rolling hills through pine, oak and birch forest, across a plank bridge over a stream, through a glade of giant glowing toadstools, past an ancient tree, with two log jumps.
  - **Sunset Shore:** a sandy loop round a palm-covered island between the dunes and the surf, past parasols, beach huts and sandcastles, with a lighthouse and a tall ship offshore and two jumps.
  - **Gloomhollow Manor:** a moonlit graveyard lap that runs in the front door of a haunted manor, up the grand staircase, along the gallery, off a jump down the back stairs and out the back door.
  - **Prism Skyway:** a glowing rainbow road across the night sky, climbing and diving between floating crystal islands, with dash panels and long stretches with no rails. Drive off the edge and you fall, then get put back where you went over.
- **Eight racers** (all eight start every race), each with different stats and a special power that charges over time:
  - **Dark Orc:** heavy and fast. *Rampage* makes it faster, immune to hazards, and spins out anyone it rams.
  - **Light Elf:** light, with the best handling. *Blink* teleports it 35 metres up the road.
  - **Robot:** balanced. *Overclock* gives a long boost that ignores rough ground.
  - **Dirty Dwarf:** the best acceleration. *Mud Bomb* lobs mud ahead that leaves a slowing puddle.
  - **Ember Drake:** heavy hitter with weak handling. *Dragon Breath* spins out every racer in a cone of fire ahead.
  - **Frost Troll:** top speed but the slowest start. *Frost Nova* freezes nearby racers to half speed.
  - **Bone Knight:** quick and light. *Phantom Ride* turns it ghostly, passing through racers, hazards and attacks.
  - **Pixie:** tiny, with the best acceleration and handling. *Hex Swap* trades places with the racer just ahead (within 90 m).
- **Items** from the ? boxes, weighted by your place: Haste Potion (boost), Rotten Cabbage (dropped trap), Fireball (homes in on the racer ahead), Magic Ward (blocks one hit).
- **Driving:** hop-drift with two boost tiers (blue then orange sparks), a start boost, jumps, wall glancing, and slow cobbled verges.
- **Hazards:** each course sends something across the road: peasants and pigs in Castle Town, deer and boar in the woods, crabs and a turtle on the shore, ghosts at the manor.
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
| `src/track.ts` | Spline track (with elevation and ramps), queries, road, verges and walls |
| `src/courses/` | One module per course (`CourseDef`: layout, sky, surfaces, hazards, scenery), the `COURSES` registry, and shared terrain/prop helpers |
| `src/kart.ts` | Arcade kart physics and drift/boost logic |
| `src/characters.ts` | Racer stats, powers and procedural models |
| `src/ai.ts` | AI driver |
| `src/items.ts` | Item boxes, items, mud puddles |
| `src/hazards.ts` | Walkers that cross the road, built by each course |
| `src/audio.ts` | Synth sound effects and music sequencer |
| `src/textures.ts` | Canvas-painted textures |
| `src/ui.ts`, `src/style.css` | Menus, HUD, minimap, results |
| `src/input.ts` | Keyboard and gamepad input |

Every kart is driven through the same `KartInput` structure, whether the source is a player, the AI, or (later) a network peer, so online multiplayer can plug in at that seam.

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`. In the repository's **Settings → Pages**, set **Source** to **GitHub Actions** once.
