// Shared constants. World units are screen pixels at 960×540; skeleton units are scaled by SC.
export const W = 960, H = 540, GROUND = 448, SC = 1.6, PI = Math.PI;
export const DT = 1 / 60;

/** Bone lengths in skeleton units. */
export const L = { torso: 50, headR: 11, ua: 27, fa: 26, th: 38, sh: 37, ft: 13 };

export const OUT = "#1d1622";
/** Light comes from up and behind the fighter (in local coords, facing right). */
export const LIGHT = [-0.45, -0.89];
export const PAL = {
  white: { gi: "#f3efe6", pants: "#f3efe6", sleeve: "#f3efe6", skin: "#eab48c", hair: "#2a1a12", band: "#e23a3f", belt: "#1d1622" },
  blue: { gi: "#3361d1", pants: "#2a2f45", sleeve: "#3361d1", skin: "#b9794f", hair: "#151018", band: "#f4b733", belt: "#ece5d3" },
};

export const STAGE = { left: 70, right: 890 };
/** Closest the two fighters' hips can get, in px. */
export const MIN_GAP = 130;
export const WALK_FWD = 150, WALK_BACK = 120, ACCEL = 1400;

export const params = new URLSearchParams(location.search);
export const time = { wt: 0, gt: 0 }; // wt: wall time (scenery), gt: game time (stops during hit-freeze)

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
