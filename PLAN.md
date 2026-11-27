# KungFu 2 — plan

A new 2D kung fu fighting game in which every fighter and every scene is drawn by code while it runs. There are no image files.
It is separate from the original KungFu (kungfu.brajesh.com, sprite sheets) and borrows that game's ideas, not its art.

## Choices made
- **Look:** clean cartoon. Dark outlines, flat colour with one hard shadow edge, faces and outfits, and comic hit stars and words (POW!). Option B in `mocks/look-styles.html`.
- **Where it runs:** in the browser, on Cloudflare like Starwake (`kungfu2.brajesh.com`).
- **Fighters:** one fighter body first, in two outfits (white gi and blue gi). More fighters come once the motion feels right.

## How it's built
- Plain HTML and JavaScript (ES modules), drawn on a `<canvas>`. No libraries and no build step, the same as Starwake.
- The game is drawn at 960×540 and scaled to fit any window, keeping its shape and staying sharp on Retina screens.
- The game updates at a steady 60 times a second, so it plays the same on every screen. This is also what online play will need later.
- To run it locally: `python3 -m http.server -d public 8000`, then open http://localhost:8000. ES modules don't load from a plain `file://` page.
- To deploy: `npx wrangler deploy`, which serves `public/` as static files.

### Files (`public/src/`)
| File | What's in it |
|---|---|
| `config.js` | Screen size, bone lengths, colours, speeds |
| `rig.js` | Poses, moves (keyframes over time), the skeleton maths, leg bending |
| `fighter.js` | One fighter: actions, combos, jumping, rolling, footsteps, ribbons, health, guard, hit checks |
| `draw.js` | Draws a fighter from its skeleton, plus the skeleton view |
| `stage.js` | The temple courtyard, clouds, cherry trees, lanterns, petals |
| `fx.js` | Hit stars, words, bits and motion streaks |
| `input.js` | Keyboard |
| `hud.js` | Health bars, guard meters, banners, the controls line |
| `main.js` | The game loop, hit-freeze, shake and zoom, K.O. and reset, the practice opponent |

### How the fighters move
- Each fighter is a **jointed skeleton**: hip, torso, head, two arms and two legs. Angles are measured from straight down, and + means toward the opponent.
- **The upper body is keyframed.** A move is a short list of poses with times (wind-up, strike, hold, recover), blended smoothly. A move starts from wherever the body happens to be, so moves flow into each other.
- **The legs work out their own angles from where the feet are** (two-bone IK). The feet are planted on the ground and only move when they take a step. A small step planner decides when a foot is too far from where it should be, then lifts it and puts it down in an arc. Walking, being knocked back and stepping into a punch all come from this one rule, so the feet never slide.
- **The fist or foot is the hit point.** A hit lands when it touches the opponent's body capsule (shown in the skeleton view).
- Kicks drive the kicking leg by keyframe while the standing leg keeps using IK; each leg blends between the two. Keyframed feet slide along the floor instead of going through it.
- Rolls and falls rotate the whole body, and the body drops until its lowest point touches the ground, so lying down and getting up need no hand-placed heights.

## Controls
| Action | Keys |
|---|---|
| Walk | A / D or ← / → |
| Jump | W or ↑ |
| Crouch (ducks under punches) | S or ↓ (hold) |
| Punch, press again for a 3-hit combo (jab, cross, uppercut) | J |
| Kick | K |
| Heavy kick (knocks down) | L |
| Sweep (low: gets past a standing block) | S + K (or S + J) |
| Block (hold; wears the guard meter down) | I |
| Roll (through the opponent if you hold toward them, otherwise away) | U |
| Flying kick / down smash (in the air) | K / J |
| Change what the practice opponent does (stand, block, crouch, jump) | T |
| Skeleton view | ` (backquote) |
| Slow motion | O |
| Pause | P or Esc |

URL options for testing: `?rig` (skeleton on), `?slow`, `?mode=Block` (practice opponent's behaviour).

### Fighting rules (step 2)
- Health 100. Jab 6, cross 8, uppercut 12, kick 10, sweep 8, flying kick 14, down smash 16, heavy kick 20.
- The uppercut, heavy kick and down smash knock the opponent down; any hit in the air does too. A knocked-down fighter can't be hit until they're back up.
- **Guard meter:** each blocked hit costs 3× its damage in guard and still lets 20% of the damage through. Guard comes back after 0.6 s without blocking. At zero the guard breaks: the fighter staggers with dizzy stars and is open to a hit. Blocking needs at least 25 guard.
- The sweep is low, so a standing block doesn't stop it; jump over it instead. Crouching ducks under punches.
- The first part of a roll can't be hit. A roll can be used once a second.
- Hits are checked along the whole path the fist or foot moved in each update, so fast strikes can't skip through a limb.
- K.O.: slow motion, a banner, and the round resets after 3 seconds.

## Steps
1. **Rig and first moves** (done): one fighter you control, plus a practice opponent who stands, reacts to hits and walks back to their spot. Idle with breathing, walking forward and back, a punch with hit-freeze, a POW star and shake.
2. **All the moves** (done), with limbs as the hit points: two punches, kick, heavy kick, low kick, crouch, block, dodge roll, jump and flying kick, combo, down smash. Health bars and the guard meter (blocking wears it down until it breaks), knockdown and getting up.
3. **Effects** ← *next*: motion streaks on every strike, a bigger freeze, zoom and shake on heavies, dust from steps and landings, slow motion on the final hit.
4. **Living backgrounds**: two or three stages (temple courtyard, bamboo forest, rooftop at night) with moving parts.
5. **The computer opponent, rounds and menus**, ported from the original's ideas, along with touch controls for phones.
6. **More fighters** (2–4): their own outfits, hair, faces, sizes and a signature move each.
7. **Online play** through the original game's relay design.

Sound: use recorded hit sounds and music, as in the original (they sound better than synthesised hits).

## Risks
- Hand-posed animation can look stiff. The user judges the motion; Claude checks poses with screenshot strips taken by Playwright.
