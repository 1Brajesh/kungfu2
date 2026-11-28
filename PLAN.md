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
| `stage.js` | The list of stages |
| `stages/temple.js`, `bamboo.js`, `rooftop.js` | One stage each: background, foreground, moving scenery, reactions to big hits, the light on the fighters |
| `stages/common.js` | Helpers the stages share (seeded random, hills, clouds, springs, falling leaves) |
| `fx.js` | Hit stars and words, flying bits, speed-line bursts, shock rings, dust, screen flash, strike streaks |
| `input.js` | Keyboard |
| `hud.js` | Health bars, guard meters, banners, the controls line |
| `menu.js` | Title, pause and match-over menus (keys, mouse and touch), the logo, the controls card |
| `touch.js` | On-screen controls for phones: floating stick, five buttons, pause; they press the same keys as the keyboard |
| `audio.js` | Sound and music: Web Audio, variation, panning, music muffle and dips, K.O. slow-motion sound |
| `ai.js` | The computer opponent: sees you a moment late, spaces, attacks, blocks, ducks, jumps and punishes misses |
| `main.js` | The game loop, the screens (title, match, practice), rounds and timer, hit-freeze, shake and zoom, K.O. |

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
| Pause menu (resume, restart, sound, main menu) | Esc or P |
| Sound on/off (title and menus only: in a fight M is too close to J and K) | M |
| *Practice only:* change what the opponent does (stand, block, crouch, jump, CPU) | T |
| *Practice only:* CPU level Easy / Normal / Hard | 1 / 2 / 3 |
| *Practice only:* change stage | B |
| Skeleton view | ` (backquote) |
| Slow motion | O |

URL options for testing: `?soundlog` (records every sound played in `window.__sounds`), `?touch` (show the touch controls on a computer), `?rig` (skeleton on), `?slow`, `?fight` (skip the title, straight into a match), `?mode=Block` (straight into practice; Stand, Block, Crouch, Jump or CPU), `?level=Hard`, `?demo` or `?demo=Hard` (the computer plays both sides), `?stage=bamboo` or `?stage=rooftop`.

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

### Effects (step 3)
- **Streaks:** punches leave comic speed lines above and below the arm; kicks leave a white crescent smear along the arc of the foot. They are drawn only while the strike goes out (from the chamber to the end of the strike window).
- **Hits:** the freeze grows with the blow (0.05 s plus more for heavier hits; 0.14 s for knockdowns and guard breaks; 0.3 s for the K.O.). Big hits add radiating speed lines, a shock ring, a bigger word, a brief zoom toward the hit and a short white flash. Flying bits go the way the blow travelled.
- **Dust:** fast footsteps, jump landings (more for higher falls), skidding back from a hit, rolls, and a big cloud when a knocked-down body hits the floor (with a small shake).
- **K.O.:** after the impact freeze the game drops to about a fifth of normal speed and eases back over 1.8 s while the camera closes in on the falling fighter.
- Fighters report events (step, land, skid, roll, slam) in `f.events`; the game loop turns them into dust, so `fighter.js` draws nothing itself.

### Stages (step 4)
Each stage draws a background and a foreground, moves its own scenery, reacts to big hits, and sets the light on the fighters (a colour multiplier on their palettes), their shadow and the dust colour. B switches stage.
- **Temple courtyard** (sunny): drifting clouds, swaying cherry trees and lanterns, falling petals. Birds sit on the top roof, peck now and then, fly off at a big hit and come back about five seconds later. Big hits also shake petals loose and swing the lanterns.
- **Bamboo forest** (misty morning): three depths of bamboo sway in the wind, with a gust every 5–11 s that bends them all and blows the falling leaves sideways. Sunbeams pulse, mist drifts, grass tufts move, and two dark stalks frame the screen in front of the fighters. Big hits shake the stalks and drop a shower of leaves.
- **Rooftop at night**: twinkling stars, a shooting star now and then, clouds crossing the moon, city windows switching on and off, fireworks going up behind the city, a string of glowing lanterns across the top that swings on big hits, and fireflies. The fighters are lit moonlight blue.

### Screens, rounds and menus
- **Title:** the logo over two computer fighters sparring on the chosen stage. Menu: Fight, Practice, CPU level, Stage (or Random), Controls. Arrow keys or W/S to move, A/D or ←/→ to change, Enter/Space/J to pick; mouse clicks and taps work too (left or right half of a choice goes back or forward). The level and stage are remembered in the browser.
- **Match:** best of 3 rounds against the computer. Each round opens with ROUND 1 (or FINAL ROUND at one win each) and FIGHT!, and lasts 60 s. A K.O. wins the round; at time up the fighter with more health wins, and equal health is a draw that counts for neither. The round winner strikes a victory pose. Round wins show as dots by the health bars. After the match: YOU WIN! or YOU LOSE with Rematch and Main menu.
- **Practice:** no timer or rounds; a K.O. starts again. T, 1/2/3 and B work here only.
- **Pause** (Esc or P in a match or practice): Resume, Restart, Main menu.

### Touch controls (phones and tablets)
- They appear the first time the screen is touched, and go away again if a real keyboard is used. A mouse never turns them on.
- **Left half of the screen** (including the dark bars beside the game): a floating stick that starts wherever the thumb lands. Left/right walk, up jumps (up-left/up-right jump that way), down crouches. Down + KICK is the sweep.
- **Bottom right:** PUNCH (tap again for the combo), KICK, HEAVY, BLOCK (hold) and ROLL. A finger can slide from one button to another. In the air PUNCH and KICK do the down smash and flying kick. Android phones give a tiny buzz on each press.
- **Pause** button under the timer. In practice, the pause menu also has Opponent, CPU level and Stage, since there are no T, 1/2/3 or B keys.
- Held upright, the phone shows "Turn your phone sideways to play" and a match pauses. On Android the game goes full screen and locks to landscape on the first touch; on iPhone, Add to Home Screen gives full screen.
- Touches become the same key presses as the keyboard (`touchPress`/`touchHold` in `input.js`), so the fighting code and menus don't know the difference.

## Steps
1. **Rig and first moves** (done): one fighter you control, plus a practice opponent who stands, reacts to hits and walks back to their spot. Idle with breathing, walking forward and back, a punch with hit-freeze, a POW star and shake.
2. **All the moves** (done), with limbs as the hit points: two punches, kick, heavy kick, low kick, crouch, block, dodge roll, jump and flying kick, combo, down smash. Health bars and the guard meter (blocking wears it down until it breaks), knockdown and getting up.
3. **Effects** (done): streaks on every strike, a bigger freeze, zoom and shake on heavies, dust from steps and landings, slow motion on the final hit.
4. **Living backgrounds** (done): temple courtyard, bamboo forest, rooftop at night, each with moving parts.
5. **The computer opponent**, **rounds and menus** and **touch controls for phones** (all done).
   *Next: step 6, more fighters.*
6. **More fighters** (2–4): their own outfits, hair, faces, sizes and a signature move each.
7. **Online play** through the original game's relay design.

### Sound (pass 1 of 3 done)
The sounds (ElevenLabs) and the music, "Bamboo Grove Duel" (Suno), come from the original game, in `public/sounds/`. The music is the 1.5 MB m4a, with the mp3 as a fallback.
- Every sound plays with a little random pitch and volume, panned left or right to where it happens.
- **Strikes:** a whoosh as each strike goes out (high for jabs, low for the heavy kick); air attacks use the spin sound.
- **Hits:** light or heavy by the blow's weight; knockdowns and the K.O. stack a low, slowed copy underneath for a thump; blocks, guard breaks (a deeper block plus a crack), the body hitting the floor (knockdown sound), the victory sting when a round is won.
- **Movement:** footsteps (at most about six a second per fighter), jump, landing (louder from higher), roll, crouch.
- **Music:** soft and muffled on the title, full in a fight, muffled further when paused, and dipped for a moment under big hits.
- **K.O. slow motion:** after the impact freeze, every sound and the music drop in pitch and lose their top end, then come back as the game speeds up.
- **Menus:** a tick when the selection or a setting changes and a thump when something is chosen.
- **Settings:** SOUND in the title and pause menus has Music and Sound effects volume (0–10, remembered); M mutes everything (on the title and in menus only), with a big SOUND ON / SOUND OFF banner. Browsers stay silent until the first click, tap or key press, which is when the audio starts. If the computer or phone suspends web audio later (headphones, another app, sleep), the game restarts it within a second, and on any click or key press.
- *Pass 2:* stage ambience tied to the scenery (birds, bamboo wind, crickets, firework pops) and round sounds (gong, drum). *Pass 3:* music that changes with the fight, a track per stage, and maybe an announcer and fighter shouts.

## Risks
- Hand-posed animation can look stiff. The user judges the motion; Claude checks poses with screenshot strips taken by Playwright.
