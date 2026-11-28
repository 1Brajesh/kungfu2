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
| `ai.js` | The computer opponent: sees you a moment late, spaces, attacks, blocks, ducks, jumps and punishes misses |
| `main.js` | The game loop, hit-freeze, shake and zoom, K.O. and reset, the opponent (computer or practice dummy) |

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
| Computer opponent level: Easy / Normal / Hard | 1 / 2 / 3 |
| Switch to the practice dummy and change what it does (stand, block, crouch, jump; back to Fight) | T |
| Skeleton view | ` (backquote) |
| Slow motion | O |
| Pause | P or Esc |

URL options for testing: `?rig` (skeleton on), `?slow`, `?mode=Block` (practice dummy instead of the computer), `?level=Hard`, `?demo` or `?demo=Hard` (the computer plays both sides).

### Fighting rules (step 2)
- Health 100. Jab 6, cross 8, uppercut 12, kick 10, sweep 8, flying kick 14, down smash 16, heavy kick 20.
- The uppercut, heavy kick and down smash knock the opponent down; any hit in the air does too. A knocked-down fighter can't be hit until they're back up.
- **Guard meter:** each blocked hit costs 3× its damage in guard and still lets 20% of the damage through. Guard comes back after 0.6 s without blocking. At zero the guard breaks: the fighter staggers with dizzy stars and is open to a hit. Blocking needs at least 25 guard.
- The sweep is low, so a standing block doesn't stop it; jump over it instead. Crouching ducks under punches.
- The first part of a roll can't be hit. A roll can be used once a second.
- Hits are checked along the whole path the fist or foot moved in each update, so fast strikes can't skip through a limb.
- K.O.: slow motion, a banner, and the round resets after 3 seconds.

### The computer opponent
- It presses the same buttons a player does (it returns the same intent as the keyboard), so it follows every rule: button buffer, combo timing, roll cooldown, guard meter.
- It sees you a moment late (Easy 0.4 s, Normal 0.26 s, Hard 0.17 s). It can't react to a jab in time, so it guards ahead of time when you are close, and reacts to slower attacks (heavy kick, jump-ins).
- It knows the measured reach of every attack against a standing and a crouching fighter, and judges distance with some error (more on Easy), so it sometimes swings from too far.
- It walks to a spacing it picks, steps in with combos or kicks, sweeps a blocker, kicks or down-smashes a croucher, jumps in, backs off when its guard is low, and rolls out of a corner.
- It hits back when you miss, land from a jump or have your guard broken. On Hard it finishes combos only when the first hit lands, and links a kick into the heavy kick.
- It remembers what you use most: if you keep sweeping, it jumps in with the down smash more.
- Tested by script: every level beats a player who does nothing, holds block or spams jabs. Easy loses to sweep spam and jump-kick spam. Normal and Hard beat jump-kick spam most of the time and break even against sweep spam.

## Steps
1. **Rig and first moves** (done): one fighter you control, plus a practice opponent who stands, reacts to hits and walks back to their spot. Idle with breathing, walking forward and back, a punch with hit-freeze, a POW star and shake.
2. **All the moves** (done), with limbs as the hit points: two punches, kick, heavy kick, low kick, crouch, block, dodge roll, jump and flying kick, combo, down smash. Health bars and the guard meter (blocking wears it down until it breaks), knockdown and getting up.
3. **Effects** ← *next*: motion streaks on every strike, a bigger freeze, zoom and shake on heavies, dust from steps and landings, slow motion on the final hit.
4. **Living backgrounds**: two or three stages (temple courtyard, bamboo forest, rooftop at night) with moving parts.
5. **The computer opponent** (done, brought forward), then **rounds and menus** and touch controls for phones.
6. **More fighters** (2–4): their own outfits, hair, faces, sizes and a signature move each.
7. **Online play** through the original game's relay design.

Sound: use recorded hit sounds and music, as in the original (they sound better than synthesised hits).

## Risks
- Hand-posed animation can look stiff. The user judges the motion; Claude checks poses with screenshot strips taken by Playwright.
