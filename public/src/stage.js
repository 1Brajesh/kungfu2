// The stages. Each one draws a background (behind the fighters) and a foreground (in front),
// moves its own scenery, reacts to big hits, and sets the light on the fighters, their shadows and the dust.
//   { id, name, tint: [r, g, b] multiplier for the fighters' colours or null, shadow, dust: [fill, edge],
//     update(dt), back(g), front(g), impact(x, y, pow) }
import { temple } from "./stages/temple.js";
import { bamboo } from "./stages/bamboo.js";
import { rooftop } from "./stages/rooftop.js";

export const STAGES = [temple, bamboo, rooftop];
