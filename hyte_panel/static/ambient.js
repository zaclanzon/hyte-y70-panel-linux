/* Continuous ambient ground behind the glass. A small WebGL surface is
   upscaled by the compositor: no CPU pixel uploads or full-screen CSS blur.
   DESIGNS holds every selectable background (theme.background in the config;
   ids also listed in config.py BACKGROUNDS). Colors follow the case lighting
   through HyteAmbient.setPalette(); the settings page draws live previews
   with HyteAmbient.preview(). Every design is a function of trig terms in
   `time` with rates in integer thousandths (or of saw(), a sawtooth with a
   whole number of cycles per period), so the clock can wrap at 2000*pi
   seconds without a visible cut and floats stay precise on multi-day runs. */
(function () {
  "use strict";

  const PERIOD = Math.PI * 2000;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const probe = document.createElement("span");

  function rgb(value) {
    probe.style.color = value;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    const channels = resolved.match(/[\d.]+/g) || [0, 0, 0];
    const divisor = resolved.startsWith("color(") ? 1 : 255;
    return channels.slice(0, 3).map((c) => Number(c) / divisor);
  }

  const PRELUDE = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    uniform vec2 resolution;
    uniform float time;
    uniform vec3 primary;
    uniform vec3 secondary;
    uniform vec3 page;
    float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    vec2 hash2(vec2 p) { return vec2(hash(p), hash(p + 7.31)); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
      for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
      return v;
    }
    // Width-normalized coordinates: x spans [-0.5, 0.5], so a design looks
    // the same on the panel and in a preview of any height.
    vec2 coords() { return (gl_FragCoord.xy - 0.5 * resolution) / resolution.x; }
    float aspect() { return resolution.y / resolution.x; }
    // Sawtooth with k whole cycles per clock period, so it wraps when the
    // clock does. For anything that has to scroll rather than oscillate.
    float saw(float k) { return fract(time * (k / 6283.1853)); }
  `;

  const DESIGNS = [
    {
      id: "liquid", name: "Liquid metal",
      blurb: "Folded chrome in the two accents, lit from the top left, flowing upward.",
      frag: `
        // Nested waves advect the surface continuously; there are no discrete
        // states to crossfade, births/deaths, or easing stops between ticks.
        float surface(vec2 p) {
          vec2 q = p + vec2(
            0.72 * sin(p.y * 1.6 + time * 0.31) + 0.30 * cos(p.x * 2.1 - time * 0.23),
            0.62 * sin(p.x * 1.8 - time * 0.27) + 0.28 * cos(p.y * 1.3 + time * 0.19)
          );
          return sin(q.x * 2.6 + q.y * 1.1 + time * 0.22)
               + 0.55 * sin(q.y * 2.7 - q.x * 0.8 - time * 0.18)
               + 0.22 * cos(q.x * 4.1 + q.y * 2.3 + time * 0.13);
        }
        void main() {
          vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y) * 2.5;
          // Steady advection keeps the metal moving forward while folds evolve.
          // 0.20 preserves the shared period of the rational wave frequencies.
          p.y += time * 0.20;
          float h = surface(p);
          float dx = (surface(p + vec2(0.018, 0.0)) - h) / 0.018;
          float dy = (surface(p + vec2(0.0, 0.018)) - h) / 0.018;
          vec3 normal = normalize(vec3(-dx * 0.48, -dy * 0.48, 1.0));
          vec3 light = normalize(vec3(-0.5, 0.65, 1.0));
          float diffuse = max(dot(normal, light), 0.0);
          float blend = smoothstep(-0.65, 0.65, h);
          vec3 base = mix(primary, secondary, blend);
          // Broad reflected light with a narrower silver sheen on curved folds.
          float reflection = pow(max(dot(normal, normalize(vec3(-0.35, 0.3, 1.0))), 0.0), 18.0);
          float ribbon = exp(-pow((h + 0.10) * 7.0, 2.0));
          vec3 color = base * (0.30 + 0.30 * diffuse);
          color += mix(base, vec3(0.78, 0.84, 0.95), 0.65) * (0.30 * reflection + 0.16 * ribbon);
          gl_FragColor = vec4(color, 1.0);
        }`,
    },
    {
      id: "ribbons", name: "Aero ribbons",
      blurb: "Slanted light ribbons with white cores, alternating accents.",
      frag: `
        void main() {
          vec2 p = coords(); float t = time;
          vec3 col = page * 0.9 + mix(primary, secondary, 0.5) * 0.06 * fbm(p * 2.5 + vec2(0.3 * sin(t * 0.013), 0.5 * sin(t * 0.009)));
          float period = 1.25;
          for (int i = 0; i < 4; i++) {
            float fi = float(i);
            float off = fi * period / 4.0 + 0.2 * sin(t * 0.011 + fi);
            float xc = off + 0.42 * p.y + 0.16 * sin(p.y * 1.9 + t * 0.19 + fi * 1.7) + 0.07 * sin(p.y * 4.3 - t * 0.14 + fi * 0.8);
            float w = 0.05 + 0.03 * sin(p.y * 1.3 + t * 0.11 + fi * 2.0);
            float d = p.x - xc; d = mod(d + 0.5 * period, period) - 0.5 * period;
            float band = exp(-d * d / (w * w));
            float core = exp(-d * d / (w * w * 0.05));
            vec3 tint = mod(fi, 2.0) < 1.0 ? primary : secondary;
            float pulse = 0.55 + 0.45 * sin(t * 0.27 + fi * 2.1 + p.y * 1.4);
            col += tint * band * 0.42 * pulse + mix(tint, vec3(1.0), 0.7) * core * 0.30 * pulse;
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "bokeh", name: "Bokeh glass",
      blurb: "Out-of-focus discs in three depths, drifting and breathing.",
      frag: `
        vec3 layer(vec2 p, float scale, float r1, float r2, float blur, float seed) {
          vec2 g = p * scale + vec2(seed + 0.5 * sin(time * r2), -(1.2 * sin(time * r1) + 0.8 * sin(time * r2 + 1.0)));
          vec2 id = floor(g), f = fract(g) - 0.5; vec3 acc = vec3(0.0);
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 o = vec2(float(i), float(j)); vec2 cell = id + o;
            vec2 h = hash2(cell);
            vec2 c = o + (h - 0.5) * 0.9 + 0.08 * vec2(sin(time * 0.4 + h.x * 6.28), cos(time * 0.3 + h.y * 6.28));
            float r = 0.16 + 0.24 * hash(cell + 3.1);
            float d = length(f - c);
            float disc = smoothstep(r, r - blur, d);
            float rim = disc * smoothstep(r - blur * 1.8, r - blur * 0.6, d);
            float tw = 0.5 + 0.5 * sin(time * 0.6 + hash(cell + 9.0) * 6.28);
            vec3 tint = mix(primary, secondary, hash(cell + 5.7));
            acc += tint * (disc * 0.26 + rim * 0.34) * (0.4 + 0.6 * tw);
          }
          return acc;
        }
        void main() {
          vec2 p = coords();
          float g = smoothstep(-0.5 * aspect(), 0.5 * aspect(), p.y);
          vec3 col = page * 0.85 + mix(primary, secondary, g) * 0.07;
          col += layer(p, 2.2, 0.021, 0.013, 0.10, 1.0);
          col += layer(p, 4.5, 0.029, 0.017, 0.05, 2.0) * 0.7;
          col += layer(p, 9.0, 0.041, 0.023, 0.03, 3.0) * 0.45;
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "caustics", name: "Pool caustics",
      blurb: "Sunlight refracted through a water surface, accents in the water between.",
      frag: `
        float caustic(vec2 p, vec4 rates) {
          vec2 i = p; float c = 0.0; float inten = 0.005;
          for (int n = 0; n < 4; n++) {
            float rate = n == 0 ? rates.x : n == 1 ? rates.y : n == 2 ? rates.z : rates.w;
            float tt = 23.0 + time * rate;
            i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
            c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
          }
          c /= 4.0; c = 1.17 - pow(c, 1.4);
          return min(pow(abs(c), 8.0), 1.0);
        }
        void main() {
          vec2 p = coords();
          vec2 q = p * 7.0;
          // Mirror-tile the field: the classic caustic sum only behaves in a
          // bounded window, and the large offset keeps its terms small.
          vec2 m = abs(mod(q, 12.566) - 6.283) + 250.0;
          float c = caustic(m, vec4(-0.875, -0.26, -0.06, 0.045));
          float c2 = caustic(abs(mod(q * 0.7 + 1.3, 12.566) - 6.283) + 250.0, vec4(-0.7, -0.21, -0.048, 0.036));
          float g = smoothstep(-0.5 * aspect(), 0.5 * aspect(), p.y);
          vec3 water = mix(primary, secondary, g);
          vec3 col = water * 0.30 + page * 0.55;
          col += water * c * 0.5 + vec3(0.85, 0.92, 1.0) * (c * 0.22 + c2 * 0.12);
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "ink", name: "Ink marble",
      blurb: "Two inks folded by a slow current. Pigment, no lighting.",
      frag: `
        void main() {
          vec2 p = coords() * 3.2;
          p.y += 1.2 * sin(time * 0.011) + 0.7 * sin(time * 0.007);
          vec2 d1 = 0.8 * vec2(sin(time * 0.021), cos(time * 0.017));
          vec2 d2 = 0.6 * vec2(sin(time * 0.013 + 2.0), cos(time * 0.019 + 1.0));
          vec2 q = vec2(fbm(p + d1), fbm(p + vec2(5.2, 1.3) - d2));
          vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) + d2), fbm(p + 4.0 * q + vec2(8.3, 2.8) - d1));
          float f = fbm(p + 4.0 * r);
          vec3 base = mix(primary, secondary, clamp(f * f * 4.0, 0.0, 1.0));
          vec3 col = mix(base, page * 0.9, clamp(length(q), 0.0, 1.0));
          col = mix(col, vec3(0.82, 0.86, 1.0), clamp(r.x, 0.0, 1.0) * 0.45);
          col *= (f * f * f + 0.6 * f * f + 0.5 * f) * 1.35;
          col = max(col, page * 0.6);
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "satin", name: "Satin curtain",
      blurb: "Vertical folds with a sheen that runs across the threads.",
      frag: `
        float cloth(vec2 q) {
          return sin(q.x * 5.0 + 1.6 * sin(q.y * 0.7 + time * 0.17) + 0.8 * sin(q.y * 1.9 - time * 0.11))
               + 0.35 * sin(q.x * 11.0 - q.y * 0.6 + time * 0.13);
        }
        void main() {
          vec2 p = coords(); vec2 q = p * 2.0;
          q.y += 1.5 * sin(time * 0.023) + 0.8 * sin(time * 0.014);
          q.x += 0.12 * fbm(q * 0.8 + vec2(0.6 * sin(time * 0.03), 0.6 * cos(time * 0.021)));
          float h = cloth(q); float e = 0.01;
          float dx = (cloth(q + vec2(e, 0.0)) - h) / e, dy = (cloth(q + vec2(0.0, e)) - h) / e;
          vec3 n = normalize(vec3(-dx * 0.22, -dy * 0.22, 1.0));
          vec3 L = normalize(vec3(-0.4, 0.5, 0.75));
          float diff = max(dot(n, L), 0.0);
          vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
          vec3 T = normalize(vec3(0.0, 1.0, 0.0) - n * n.y);
          float th = dot(T, H);
          float spec = pow(sqrt(max(1.0 - th * th, 0.0)), 90.0);
          float fiber = 0.85 + 0.15 * noise(vec2(q.x * 90.0, q.y * 4.0));
          float band = 0.5 + 0.5 * sin(q.x * 0.9 + q.y * 0.4 + time * 0.05);
          vec3 base = mix(primary, secondary, band) * 0.6;
          vec3 col = base * (0.22 + 0.6 * diff) * fiber + mix(base, vec3(0.95, 0.95, 1.0), 0.6) * spec * 0.55;
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "coral", name: "Turing coral",
      blurb: "A reaction-diffusion field that grows, splits and dies. The automaton's heir.",
      sim: true,
    },
    {
      id: "lava", name: "Lava lamp",
      blurb: "Glossy blobs in the two accents rising, sinking and merging.",
      frag: `
        void balls(vec2 p, out float fa, out float fb) {
          fa = 0.0; fb = 0.0; float span = aspect() * 0.5 + 0.35;
          for (int i = 0; i < 7; i++) {
            float fi = float(i);
            float r = 0.06 + 0.07 * hash(vec2(fi, 1.1));
            float speed = 0.001 * (45.0 + floor(hash(vec2(fi, 2.2)) * 40.0));
            float y = span * sin(time * speed + hash(vec2(fi, 3.7)) * 6.28);
            float x = (hash(vec2(fi, 4.4)) - 0.5) * 0.72 + 0.12 * sin(time * 0.23 + fi * 1.9);
            vec2 d = p - vec2(x, y);
            float f = r * r / (dot(d, d) + 0.0005);
            if (mod(fi, 2.0) < 1.0) fa += f; else fb += f;
          }
        }
        float dome(float f) { return sqrt(max(1.0 - 1.0 / max(f, 0.0001), 0.0)); }
        void main() {
          vec2 p = coords(); float fa, fb, fa1, fb1, fa2, fb2; float e = 0.004;
          balls(p, fa, fb); balls(p + vec2(e, 0.0), fa1, fb1); balls(p + vec2(0.0, e), fa2, fb2);
          float f = fa + fb; float z = dome(f);
          float gx = (dome(fa1 + fb1) - z) / e, gy = (dome(fa2 + fb2) - z) / e;
          vec3 n = normalize(vec3(-gx * 0.08, -gy * 0.08, 1.0));
          float inside = smoothstep(0.92, 1.08, f);
          vec3 tint = mix(primary, secondary, fb / (fa + fb + 0.0001));
          vec3 L = normalize(vec3(-0.45, 0.6, 0.75));
          float diff = max(dot(n, L), 0.0);
          float spec = pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 48.0);
          float fres = pow(1.0 - n.z, 2.0);
          vec3 blob = tint * (0.4 + 0.5 * diff) + vec3(1.0) * spec * 0.55 + mix(tint, vec3(1.0), 0.5) * fres * 0.5;
          vec3 ground = page * 0.85 + tint * min(f, 1.0) * 0.22;
          gl_FragColor = vec4(mix(ground, blob, inside), 1.0);
        }`,
    },
    {
      id: "shafts", name: "Light shafts",
      blurb: "Beams raking down from the top left, accents split at their edges, dust in the light.",
      frag: `
        float shaft(float ang) {
          float v = fbm(vec2(ang * 6.0 + 0.9 * sin(time * 0.03), 0.7 * sin(time * 0.02)));
          v = smoothstep(0.30, 0.70, v);
          float w = noise(vec2(ang * 30.0 - 0.8 * sin(time * 0.02), 3.3));
          return v * (0.55 + 0.45 * w);
        }
        float dust(vec2 p) {
          vec2 g = p * 14.0 + vec2(0.4 * sin(time * 0.017), -(1.1 * sin(time * 0.019) + 0.7 * sin(time * 0.011)));
          vec2 id = floor(g), f = fract(g) - 0.5; vec2 h = hash2(id);
          vec2 c = (h - 0.5) * 0.8 + 0.1 * vec2(sin(time * 0.5 + h.x * 6.28), cos(time * 0.4 + h.y * 6.28));
          float d = length(f - c);
          float tw = 0.5 + 0.5 * sin(time * 0.8 + h.y * 6.28);
          return smoothstep(0.05, 0.0, d) * tw * step(0.55, hash(id + 2.2));
        }
        void main() {
          vec2 p = coords(); float a = aspect();
          vec2 src = vec2(-0.6, a * 0.5 + 0.4);
          vec2 d = p - src; float ang = atan(d.x, -d.y); float dist = length(d);
          float fall = exp(-dist * 0.5) * smoothstep(0.0, 0.5, dist);
          float sP = shaft(ang + 0.03), sS = shaft(ang - 0.03), sM = shaft(ang);
          vec3 col = page * 0.85;
          col += primary * sP * fall * 0.8 + secondary * sS * fall * 0.8 + vec3(0.9, 0.92, 1.0) * sM * fall * 0.35;
          col += mix(primary, secondary, 0.5) * 0.22 * exp(-dist * 0.9);
          col += vec3(0.95, 0.96, 1.0) * dust(p) * (0.25 + 0.6 * sM * fall);
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "contours", name: "Contour drift",
      blurb: "A topographic map that never holds still; every fourth line is an index contour.",
      frag: `
        void main() {
          vec2 p = coords() * 2.4;
          p.y += 0.9 * sin(time * 0.011) + 0.5 * sin(time * 0.007);
          vec2 warp = 0.35 * vec2(fbm(p * 0.7 + vec2(0.8 * sin(time * 0.04), 0.8 * cos(time * 0.031))),
                                  fbm(p * 0.7 - vec2(0.8 * cos(time * 0.03), 0.8 * sin(time * 0.023))));
          float h = fbm(p + warp);
          float levels = 14.0; float v = h * levels;
          float band = floor(v); float fr = fract(v);
          float line = 1.0 - smoothstep(0.0, 0.11, min(fr, 1.0 - fr));
          float index = step(mod(band, 4.0), 0.5);
          vec3 tint = mix(primary, secondary, smoothstep(0.3, 0.7, h));
          vec3 col = page * 0.9 + tint * 0.14 * (0.3 + 0.7 * smoothstep(0.2, 0.8, h)) * (0.6 + 0.4 * fr);
          col += tint * line * (0.55 + 0.6 * index) + vec3(1.0) * line * index * 0.22;
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "hex", name: "Hex pulse",
      blurb: "A hexagonal lattice lit by a slow tide, with rings spreading from wandering points.",
      frag: `
        const vec2 S = vec2(1.0, 1.7320508);
        vec4 hexCoords(vec2 uv) {
          vec2 a = mod(uv, S) - S * 0.5; vec2 b = mod(uv - S * 0.5, S) - S * 0.5;
          vec2 g = dot(a, a) < dot(b, b) ? a : b;
          return vec4(g, uv - g);
        }
        float hexDist(vec2 p) { p = abs(p); return max(dot(p, S * 0.5), p.x); }
        void main() {
          vec2 p = coords(); float scale = 11.0;
          vec4 hc = hexCoords(p * scale);
          vec2 c = hc.zw / scale; float d = hexDist(hc.xy);
          float v = fbm(c * 1.6 + vec2(0.5 * sin(time * 0.017), 1.2 * sin(time * 0.023) + 0.8 * sin(time * 0.013)));
          float ring = 0.0;
          for (int i = 0; i < 3; i++) {
            float fi = float(i);
            float rate = i == 0 ? 0.3 : i == 1 ? 0.24 : 0.19;
            vec2 o = vec2((hash(vec2(fi, 8.0)) - 0.5) * 0.8 + 0.1 * sin(time * 0.07 + fi),
                          (hash(vec2(fi, 2.0)) - 0.5) * aspect() + 0.15 * cos(time * 0.05 + fi * 2.0));
            // Rings only show while growing: the cosine's return half is dark.
            float ph = 0.5 - 0.5 * cos(time * rate + fi * 2.3);
            float growing = step(0.0, sin(time * rate + fi * 2.3));
            float dd = length(c - o);
            ring += exp(-pow((dd - ph * 1.7) * 14.0, 2.0)) * (1.0 - ph) * growing;
          }
          float lit = smoothstep(0.35, 0.75, v);
          float cell = 1.0 - smoothstep(0.42, 0.5, d);
          vec3 tint = mix(primary, secondary, smoothstep(0.3, 0.7, v + 0.3 * ring));
          vec3 col = page * 0.85 + tint * 0.10;
          col += tint * (lit * 0.85 + ring * 1.1) * cell * (0.5 + 0.5 * (1.0 - d * 1.6));
          col += vec3(1.0) * ring * cell * 0.2;
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "aurora", name: "Aurora curtains",
      blurb: "Curtains of light hanging from the top, rippling sideways, rayed like the real thing.",
      frag: `
        float curtain(vec2 p, float seed) {
          float w = p.y * 0.9 + seed;
          float xc = 0.30 * sin(w * 1.1 + time * 0.041 + seed) + 0.18 * sin(w * 2.7 - time * 0.029)
                   + 0.35 * (fbm(vec2(w * 0.6, seed + 0.4 * sin(time * 0.017))) - 0.5);
          float d = p.x - xc;
          float width = 0.05 + 0.03 * sin(w * 1.7 + time * 0.023);
          float band = exp(-d * d / (width * width));
          float rays = 0.6 + 0.4 * noise(vec2(p.x * 40.0 + 2.0 * sin(time * 0.05), p.y * 2.0));
          return band * rays;
        }
        void main() {
          vec2 p = coords(); float a = aspect();
          float up = smoothstep(-0.5 * a, 0.5 * a, p.y);
          vec3 col = page * 0.85 + mix(primary, secondary, up) * 0.05;
          float c1 = curtain(p, 0.0), c2 = curtain(p + vec2(0.28, 0.0), 3.7), c3 = curtain(p - vec2(0.3, 0.0), 7.9);
          float tide = 0.5 + 0.5 * sin(p.y * 1.5 + time * 0.03);
          vec3 t1 = mix(primary, secondary, tide), t2 = mix(secondary, primary, tide);
          col += t1 * c1 * 0.7 + t2 * c2 * 0.55 + mix(t1, t2, 0.5) * c3 * 0.45;
          col += vec3(0.9, 0.95, 1.0) * (c1 * c1 + c2 * c2 + c3 * c3) * 0.12 * (0.4 + 0.6 * up);
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "nebula", name: "Nebula",
      blurb: "Gas clouds in the two accents behind dust lanes, with a field of slow-twinkling stars.",
      frag: `
        void main() {
          vec2 p = coords() * 2.0;
          vec2 drift = vec2(0.6 * sin(time * 0.009), 0.6 * sin(time * 0.013 + 1.0));
          float n1 = fbm(p * 1.3 + drift);
          float n2 = fbm(p * 2.1 - drift.yx + vec2(4.0, 2.0) + 0.3 * n1);
          float n3 = fbm(p * 0.8 + vec2(0.4 * sin(time * 0.007), 0.4 * cos(time * 0.011)) + 9.0);
          float density = smoothstep(0.28, 0.75, n1 * 0.6 + n2 * 0.4);
          float dark = smoothstep(0.55, 0.8, n3);
          vec3 cloud = mix(primary, secondary, smoothstep(0.3, 0.7, n2));
          vec3 col = page * 0.8 + cloud * 0.06 + cloud * density * 0.85 * (1.0 - 0.7 * dark);
          col += vec3(1.0, 0.95, 0.9) * pow(density, 3.0) * 0.25 * (1.0 - dark);
          vec2 g = coords() * 40.0; vec2 id = floor(g), f = fract(g) - 0.5; vec2 h = hash2(id);
          float d = length(f - (h - 0.5) * 0.8);
          float tw = 0.6 + 0.4 * sin(time * (0.3 + 0.001 * floor(h.x * 700.0)) + h.y * 6.28);
          float star = smoothstep(0.06, 0.0, d) * step(0.75, hash(id + 4.4)) * tw;
          col += vec3(1.0) * star * (0.5 + 0.5 * (1.0 - density));
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "plasma", name: "Plasma",
      blurb: "The old demo-scene plasma: summed sine fields cycling through the two accents.",
      frag: `
        void main() {
          vec2 p = coords() * 6.0; float t = time;
          float v = sin(p.x + t * 0.21)
                  + sin((p.y + t * 0.17) * 1.3)
                  + sin((p.x * sin(t * 0.05) + p.y * cos(t * 0.041)) * 1.5)
                  + sin(length(p + vec2(3.0 * sin(t * 0.031), 3.0 * cos(t * 0.027))) * 1.4 - t * 0.13);
          v *= 0.25;
          vec3 tint = mix(primary, secondary, 0.5 + 0.5 * sin(v * 3.14159 + t * 0.09));
          float glow = 0.5 + 0.5 * sin(v * 6.28318 + 1.0);
          vec3 col = page * 0.7 + tint * (0.15 + 0.45 * glow) + vec3(1.0) * pow(glow, 8.0) * 0.15;
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "cells", name: "Stained cells",
      blurb: "Voronoi cells of coloured glass, seams lit, each pane breathing at its own pace.",
      frag: `
        vec3 vor(vec2 g) {
          vec2 id = floor(g), f = fract(g); float d1 = 8.0, d2 = 8.0, hid = 0.0;
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 o = vec2(float(i), float(j)); vec2 cell = id + o; vec2 h = hash2(cell);
            vec2 c = o + 0.5 + 0.4 * sin(time * (0.05 + 0.001 * floor(h.x * 80.0)) + h * 6.28);
            float d = length(f - c);
            if (d < d1) { d2 = d1; d1 = d; hid = hash(cell + 1.7); } else if (d < d2) d2 = d;
          }
          return vec3(d1, d2, hid);
        }
        void main() {
          vec2 p = coords();
          vec3 v = vor(p * 6.0 + vec2(0.0, 0.6 * sin(time * 0.013)));
          float edge = 1.0 - smoothstep(0.0, 0.08, v.y - v.x);
          float inner = smoothstep(0.0, 0.5, v.x);
          vec3 tint = mix(primary, secondary, v.z);
          float pulse = 0.5 + 0.5 * sin(time * 0.3 + v.z * 6.28);
          vec3 col = page * 0.85 + tint * (0.06 + 0.10 * pulse) * (1.0 - 0.6 * inner);
          col += tint * edge * 0.55 + vec3(1.0) * edge * edge * 0.12;
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "rain", name: "Rain on glass",
      blurb: "Drops running down the pane in three depths, each trailing a wet streak.",
      frag: `
        float layer(vec2 p, float cols, float k, float seed, float rad) {
          float span = aspect() + 0.3;
          float gx = p.x * cols + seed;
          float cx = floor(gx), fx = (fract(gx) - 0.5) / cols;
          float hx = hash(vec2(cx, seed));
          float s = saw(k * (1.0 + floor(hx * 3.0)));
          float acc = 0.0;
          for (int i = 0; i < 3; i++) {
            float fi = float(i);
            float h = hash(vec2(cx, seed + 3.0 + fi));
            float y = (0.5 - fract(h + s)) * span;
            float x = (hash(vec2(cx, seed + 9.0 + fi)) - 0.5) * 0.6 / cols;
            vec2 d = vec2(fx - x, p.y - y);
            float r = rad * (0.7 + 0.6 * h);
            float head = smoothstep(r, r * 0.5, length(d * vec2(1.0, 0.7)));
            float trail = smoothstep(r * 0.5, 0.0, abs(d.x)) * smoothstep(0.0, r * 0.5, d.y) * exp(-d.y / (r * 8.0));
            acc += head + trail * 0.5;
          }
          return acc;
        }
        void main() {
          vec2 p = coords(); float a = aspect();
          float g = smoothstep(-0.5 * a, 0.5 * a, p.y);
          vec3 tint = mix(primary, secondary, g);
          vec3 col = page * 0.85 + tint * 0.07 * fbm(p * 3.0 + vec2(0.3 * sin(time * 0.011), 0.5 * sin(time * 0.007)));
          float near = layer(p, 6.0, 60.0, 0.0, 0.03);
          float mid = layer(p, 10.0, 40.0, 4.0, 0.018);
          float far = layer(p, 16.0, 25.0, 8.0, 0.010);
          col += mix(tint, vec3(1.0), 0.6) * near * 0.55 + tint * mid * 0.5 + tint * far * 0.35;
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "horizon", name: "Neon horizon",
      blurb: "A perspective grid rolling toward you under a banded sun.",
      frag: `
        void main() {
          vec2 p = coords(); float a = aspect();
          float hy = -0.22 * a;
          vec3 col = page * 0.85;
          if (p.y > hy) {
            float g = (p.y - hy) / (0.5 * a - hy);
            col += mix(primary, secondary, g) * 0.08 * (1.0 - g);
            vec2 sd = p - vec2(0.0, hy + 0.2); float sr = 0.16;
            float sun = smoothstep(sr, sr - 0.008, length(sd));
            float bands = smoothstep(0.35, 0.65, 0.5 + 0.5 * sin(sd.y * 90.0 - time * 0.9));
            bands = mix(1.0, bands, smoothstep(0.03, -0.08, sd.y));
            col += mix(primary, secondary, smoothstep(-sr, sr, sd.y)) * sun * bands;
            col += primary * 0.3 * exp(-length(sd) * 4.0);
            vec2 sg = p * 30.0; vec2 id = floor(sg), f = fract(sg) - 0.5; vec2 h = hash2(id);
            float star = smoothstep(0.08, 0.0, length(f - (h - 0.5) * 0.8)) * step(0.8, hash(id + 2.2))
                       * (0.5 + 0.5 * sin(time * 0.7 + h.y * 6.28));
            col += vec3(1.0) * star * smoothstep(0.1, 0.5, g);
          } else {
            float z = hy - p.y;
            float depth = 0.06 / (z + 0.003);
            float u = p.x * depth * 3.0;
            float v = depth * 2.0 + saw(240.0);
            float lw = 0.03 * depth;
            float lx = 1.0 - smoothstep(0.0, lw, min(fract(u), 1.0 - fract(u)));
            float ly = 1.0 - smoothstep(0.0, lw * 0.6, min(fract(v), 1.0 - fract(v)));
            float fade = smoothstep(0.0, 0.06, z) * exp(-z * 0.5);
            vec3 tint = mix(secondary, primary, smoothstep(0.0, 0.5, z));
            col += tint * max(lx, ly) * fade * 1.3 + vec3(1.0) * max(lx, ly) * fade * 0.25 + tint * 0.08 * fade;
          }
          col += mix(primary, secondary, 0.5) * 0.35 * exp(-abs(p.y - hy) * 30.0);
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "smoke", name: "Smoke",
      blurb: "Wisps rising from the bottom edge, lit by the accents, thinning as they climb.",
      frag: `
        float wisp(vec2 p) {
          vec2 q = p + vec2(0.5 * sin(p.y * 1.3 + time * 0.11) + 0.3 * sin(p.y * 2.9 - time * 0.07), 0.0);
          float s = sin(q.x * 3.0 + q.y * 0.5 + time * 0.13) * sin(q.y * 1.7 - time * 0.21 + q.x * 0.6);
          s += 0.5 * sin(q.x * 6.1 - q.y * 1.1 - time * 0.17) * sin(q.y * 3.3 - time * 0.29);
          return s;
        }
        void main() {
          vec2 p = coords(); float a = aspect();
          vec2 q = p * 2.2; q.y -= time * 0.15;
          float s = wisp(q) + 0.6 * wisp(q * 1.7 + vec2(3.1, 0.0));
          float grain = fbm(p * 5.0 + vec2(0.7 * sin(time * 0.019), 0.9 * sin(time * 0.023)));
          float ridge = 1.0 - abs(2.0 * grain - 1.0);
          float density = smoothstep(-0.1, 1.3, s) * (0.25 + 1.1 * ridge * ridge);
          float up = smoothstep(-0.5 * a, 0.5 * a, p.y);
          density *= 1.0 - 0.75 * up;
          vec3 tint = mix(primary, secondary, up);
          vec3 col = page * 0.85 + tint * 0.12 * (1.0 - up);
          col += mix(tint, vec3(0.8, 0.82, 0.9), 0.45) * density * 0.85;
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "circuit", name: "Circuit traces",
      blurb: "A diagonal trace maze with pulses of signal running along it, drifting slowly upward.",
      frag: `
        void main() {
          vec2 p = coords(); float N = 32.0;
          vec2 g = p * 12.0 + vec2(0.0, saw(6.0) * N);
          vec2 id = mod(floor(g), N); vec2 f = fract(g);
          float dir = step(0.5, hash(id));
          float d = dir < 0.5 ? abs(f.x - f.y) : abs(f.x + f.y - 1.0);
          d *= 0.7071;
          float trace = 1.0 - smoothstep(0.02, 0.05, d);
          vec2 fc = f - 0.5; float pad = 1.0 - smoothstep(0.07, 0.10, length(abs(fc) - 0.5));
          pad *= step(0.35, hash(id + 5.5));
          float along = dir < 0.5 ? (g.x + g.y) : (g.x - g.y);
          float perp = dir < 0.5 ? (g.y - g.x) : (g.x + g.y);
          float ph = hash(vec2(mod(floor(perp), N), 3.3));
          float pulse = smoothstep(0.12, 0.0, abs(fract(along / 8.0 - saw(300.0) + ph) - 0.5));
          vec3 tint = mix(primary, secondary, hash(id + 9.1));
          vec3 col = page * 0.85 + tint * 0.05;
          col += tint * trace * 0.28 + tint * pad * 0.35;
          col += mix(tint, vec3(1.0), 0.5) * trace * pulse * 0.9;
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "warp", name: "Star warp",
      blurb: "Streaks racing outward from the centre and stretching as they go.",
      frag: `
        float streaks(vec2 p, float M, float seed, float k, out float hue) {
          float ang = atan(p.y, p.x) / 6.28318 + 0.5;
          float sec = floor(ang * M + seed), fa = fract(ang * M + seed) - 0.5;
          float h = hash(vec2(sec, seed)), h2 = hash(vec2(sec, seed + 5.0));
          hue = hash(vec2(sec, seed + 11.0));
          float r = length(p);
          float phase = fract(h + saw(k * (1.0 + floor(h2 * 2.0))));
          float rs = phase * phase * 2.2;
          float len = 0.04 + 0.6 * phase * phase;
          float along = r - rs;
          float tail = smoothstep(-len, 0.0, along) * (1.0 - smoothstep(0.0, 0.01, along));
          float side = abs(fa) * (6.28318 / M) * r;
          float line = smoothstep(0.005 + 0.007 * phase, 0.0, side);
          return line * tail * (0.35 + 0.9 * phase);
        }
        void main() {
          vec2 p = coords(); float h1, h2, h3;
          float s1 = streaks(p, 26.0, 0.0, 30.0, h1);
          float s2 = streaks(p, 42.0, 0.37, 45.0, h2);
          float s3 = streaks(p, 70.0, 0.71, 60.0, h3);
          float r = length(p);
          vec3 col = page * 0.85 + mix(primary, secondary, 0.5) * 0.18 * exp(-r * 2.5);
          col += mix(primary, secondary, h1) * s1 * 1.3 + mix(primary, secondary, h2) * s2 + mix(primary, secondary, h3) * s3 * 0.8;
          col += vec3(1.0) * (s1 * s1 + s2 * s2) * 0.5;
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "swell", name: "Ocean swell",
      blurb: "Stacked wave silhouettes rolling across, near ones in the primary, far ones in the secondary.",
      frag: `
        void main() {
          vec2 p = coords(); float a = aspect();
          vec3 col = page * 0.85 + secondary * 0.05;
          float rows = 8.0;
          for (int i = 0; i < 8; i++) {
            float fi = float(i);
            float depth = fi / (rows - 1.0);
            float base = 0.5 * a - (fi + 0.6) * a / rows;
            float amp = 0.25 * a / rows * (0.5 + depth);
            float h = base + amp * (sin(p.x * 6.0 + time * 0.31 + fi * 1.3)
                                    + 0.5 * sin(p.x * 11.0 - time * 0.23 + fi * 2.1)
                                    + 0.3 * sin(p.x * 19.0 + time * 0.47 + fi));
            float below = smoothstep(0.004, -0.004, p.y - h);
            float crest = exp(-pow((p.y - h) * 120.0, 2.0));
            vec3 tint = mix(secondary, primary, depth);
            float shade = 0.6 + 0.4 * smoothstep(-0.25 * a / rows, 0.0, p.y - h);
            vec3 body = page * 0.85 + tint * (0.10 + 0.22 * depth) * shade;
            col = mix(col, body, below);
            col += mix(tint, vec3(1.0), 0.6) * crest * (0.3 + 0.5 * depth);
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "tunnel", name: "Wormhole",
      blurb: "A ribbed tunnel rushing past, the far end glowing, the eye drifting off centre.",
      frag: `
        void main() {
          vec2 p = coords(); float a = aspect();
          vec2 c = vec2(0.12 * sin(time * 0.07), 0.1 * a * sin(time * 0.053));
          vec2 d = p - c; float r = length(d); float ang = atan(d.y, d.x) / 6.28318;
          float depth = 0.15 / (r + 0.02);
          float z = depth + saw(120.0) * 8.0;
          float ring = 1.0 - smoothstep(0.0, 0.05, min(fract(z), 1.0 - fract(z)));
          float seg = fract(ang * 16.0 + 0.5 * sin(time * 0.05));
          float spoke = 1.0 - smoothstep(0.0, 0.05, min(seg, 1.0 - seg));
          float tile = hash(vec2(mod(floor(z), 8.0), floor(ang * 16.0 + 0.5 * sin(time * 0.05))));
          tile = smoothstep(0.55, 0.95, tile);
          float fog = exp(-depth * 0.22) * smoothstep(1.3, 0.35, r);
          vec3 tint = mix(primary, secondary, 0.5 + 0.5 * sin(z * 0.7854));
          vec3 col = page * 0.85 + tint * tile * fog * 0.35;
          col += tint * ring * fog * 0.55 + mix(tint, vec3(1.0), 0.4) * spoke * fog * 0.25;
          col += mix(primary, secondary, 0.5) * exp(-r * 9.0) * 0.9 + vec3(1.0) * exp(-r * 30.0) * 0.6;
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "skyline", name: "Night skyline",
      blurb: "Three parallax rows of towers with flickering windows under a moon.",
      frag: `
        float towers(vec2 p, float cols, float k, float base, float amp, float seed, out float win) {
          float N = 64.0;
          float g = p.x * cols + saw(k) * N + seed;
          float id = mod(floor(g), N);
          float h = base + amp * hash(vec2(id, seed));
          float inside = step(p.y, h);
          vec2 w = vec2(fract(g) * 3.0, (p.y - base) * 34.0);
          vec2 wid = vec2(mod(floor(g) * 3.0 + floor(w.x), N * 3.0), floor(w.y));
          float lit = step(0.55, hash(wid + seed));
          float flick = 0.7 + 0.3 * sin(time * (0.2 + 0.001 * floor(hash(wid + 2.0) * 900.0)) + hash(wid) * 6.28);
          float pane = step(0.25, fract(w.x)) * step(fract(w.x), 0.75) * step(0.3, fract(w.y)) * step(fract(w.y), 0.7);
          win = inside * lit * pane * flick * step(p.y, h - 0.02);
          return inside;
        }
        void main() {
          vec2 p = coords(); float a = aspect();
          float hy = -0.2 * a;
          float up = smoothstep(hy, 0.5 * a, p.y);
          vec3 col = page * 0.85 + mix(primary, secondary, 0.5) * 0.08 * (1.0 - up);
          vec2 sg = p * 36.0; vec2 id = floor(sg), f = fract(sg) - 0.5; vec2 h = hash2(id);
          col += vec3(1.0) * smoothstep(0.07, 0.0, length(f - (h - 0.5) * 0.8)) * step(0.85, hash(id + 2.2))
               * (0.4 + 0.6 * sin(time * 0.6 + h.y * 6.28)) * up;
          vec2 md = p - vec2(0.28, hy + 0.55 * (0.5 * a - hy));
          col += mix(secondary, vec3(1.0), 0.7) * smoothstep(0.06, 0.055, length(md)) * 0.9 + secondary * 0.25 * exp(-length(md) * 8.0);
          float w1, w2, w3;
          float t1 = towers(p, 14.0, 4.0, hy + 0.05, 0.42, 1.0, w1);
          float t2 = towers(p, 9.0, 8.0, hy + 0.02, 0.30, 2.0, w2);
          float t3 = towers(p, 6.0, 14.0, hy, 0.18, 3.0, w3);
          col = mix(col, page * 0.6 + secondary * 0.12, t1); col += secondary * w1 * 0.5;
          col = mix(col, page * 0.45 + mix(primary, secondary, 0.5) * 0.06, t2); col += mix(primary, secondary, 0.5) * w2 * 0.7;
          col = mix(col, page * 0.3, t3); col += mix(primary, vec3(1.0), 0.3) * w3 * 0.9;
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "sonar", name: "Sonar sweep",
      blurb: "A radar sweep circling a ringed scope; contacts light up as the beam passes and fade.",
      frag: `
        void main() {
          vec2 p = coords(); float a = aspect();
          vec2 d = p - vec2(0.0, -0.05 * a); float r = length(d); float ang = atan(d.y, d.x);
          float sweep = saw(90.0) * 6.28318 - 3.14159;
          float behind = mod(sweep - ang, 6.28318);
          float beam = exp(-behind * 1.6) * smoothstep(1.4, 0.6, r);
          float rings = 1.0 - smoothstep(0.0, 0.006, abs(fract(r * 6.0) - 0.5) / 6.0);
          float cross = max(1.0 - smoothstep(0.0, 0.004, abs(d.x)), 1.0 - smoothstep(0.0, 0.004, abs(d.y)));
          vec3 tint = mix(primary, secondary, 0.5);
          vec3 col = page * 0.85 + secondary * 0.05 * smoothstep(1.2, 0.0, r);
          col += secondary * (rings * 0.22 + cross * 0.12) * smoothstep(1.2, 0.3, r);
          col += tint * beam * 0.6;
          for (int i = 0; i < 12; i++) {
            float fi = float(i); vec2 h = hash2(vec2(fi, 4.2));
            vec2 c = vec2((h.x - 0.5) * 0.85, (h.y - 0.5) * 0.85 * min(a, 1.6)) + 0.03 * vec2(sin(time * 0.05 + fi), cos(time * 0.041 + fi));
            float ca = atan(c.y - d.y + p.y + 0.05 * a - p.y, c.x - 0.0);
            ca = atan(c.y, c.x);
            float since = mod(sweep - ca, 6.28318);
            float blip = exp(-since * 0.9) * smoothstep(0.02, 0.0, length(d - c) - 0.004);
            float halo = exp(-since * 0.9) * exp(-length(d - c) * 60.0) * 0.5;
            col += mix(primary, vec3(1.0), 0.4) * (blip + halo) * 1.4;
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "code", name: "Code rain",
      blurb: "Columns of blocky glyphs lit by falling heads, the trail fading above each one.",
      frag: `
        void main() {
          vec2 p = coords(); float a = aspect();
          float cols = 16.0, rows = 16.0 * 1.6;
          float gx = p.x * cols; float cx = floor(gx); float fx = fract(gx);
          float gy = p.y * rows; float cy = floor(gy); float fy = fract(gy);
          float glyph = step(0.5, hash(vec2(cx, cy) + vec2(floor(fx * 3.0), floor(fy * 3.0)) * 0.37 + 11.0));
          glyph *= step(0.12, fx) * step(fx, 0.88) * step(0.1, fy) * step(fy, 0.9);
          vec3 col = page * 0.85;
          for (int i = 0; i < 2; i++) {
            float fi = float(i);
            float h = hash(vec2(cx, 7.0 + fi));
            float s = saw(20.0 * (1.0 + floor(hash(vec2(cx, 3.0)) * 3.0)));
            float head = (0.5 - fract(h + s)) * (a + 0.6);
            float above = (p.y - head) * rows;
            float trail = smoothstep(-1.0, 0.0, above) * exp(-above * 0.25) * step(0.0, above + 1.0);
            float isHead = step(abs(above), 1.0) * smoothstep(0.2, 0.0, abs(fy - 0.5) - 0.3);
            vec3 tint = mix(primary, secondary, hash(vec2(cx, 9.0 + fi)));
            col += tint * glyph * trail * 0.6 + vec3(1.0) * glyph * isHead * 0.7;
          }
          col += mix(primary, secondary, 0.5) * glyph * 0.04;
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "blackhole", name: "Event horizon",
      blurb: "An accretion disc swirling round a black hole, one side Doppler-bright, a thin photon ring.",
      frag: `
        void main() {
          vec2 p = coords(); float a = aspect();
          vec2 d = p - vec2(0.0, -0.02 * a);
          float rin = 0.13;
          vec2 q = vec2(d.x, d.y * 2.8); float r = length(q); float ang = atan(q.y, q.x);
          float disc = smoothstep(rin, rin + 0.02, r) * exp(-(r - rin) * 3.2);
          float swirl = 0.55 + 0.45 * sin(ang * 3.0 + r * 26.0 - time * 0.45);
          swirl *= 0.7 + 0.3 * sin(ang * 7.0 - r * 40.0 + time * 0.31);
          float doppler = 1.0 + 0.7 * cos(ang);
          float hole = smoothstep(rin + 0.005, rin - 0.005, length(d));
          float photon = exp(-pow((length(d) - rin - 0.006) * 140.0, 2.0));
          float top = smoothstep(0.0, 0.05, d.y);
          vec3 tint = mix(primary, secondary, smoothstep(rin, 0.6, r));
          vec3 col = page * 0.85 + mix(primary, secondary, 0.5) * 0.06 * exp(-length(d) * 2.0);
          vec3 discCol = tint * disc * swirl * doppler * 1.1 + vec3(1.0, 0.95, 0.9) * pow(disc * swirl * doppler, 3.0) * 0.5;
          col += discCol * (1.0 - 0.75 * top * hole);
          col = mix(col, vec3(0.0), hole * (1.0 - 0.4 * top));
          col += mix(vec3(1.0), tint, 0.3) * photon * 0.9;
          vec2 sg = p * 34.0; vec2 id = floor(sg), f = fract(sg) - 0.5; vec2 h = hash2(id);
          col += vec3(1.0) * smoothstep(0.07, 0.0, length(f - (h - 0.5) * 0.8)) * step(0.86, hash(id + 2.2)) * (0.3 + 0.5 * sin(time * 0.5 + h.y * 6.28)) * (1.0 - disc) * (1.0 - hole);
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "fireflies", name: "Fireflies",
      blurb: "A dark meadow at night with two dozen fireflies wandering and pulsing.",
      frag: `
        void main() {
          vec2 p = coords(); float a = aspect();
          float up = smoothstep(-0.5 * a, 0.5 * a, p.y);
          float grass = fbm(vec2(p.x * 6.0, p.y * 1.5 + 0.3 * sin(time * 0.017)));
          vec3 col = page * 0.85 + secondary * 0.06 * (1.0 - up) * grass + secondary * 0.03 * up;
          for (int i = 0; i < 24; i++) {
            float fi = float(i); vec2 h = hash2(vec2(fi, 6.6));
            vec2 c = vec2((h.x - 0.5) * 0.95, (h.y - 0.6) * a * 0.9);
            c += 0.06 * vec2(sin(time * (0.05 + 0.001 * floor(h.x * 90.0)) + fi), sin(time * (0.04 + 0.001 * floor(h.y * 70.0)) + fi * 2.0));
            float pulse = pow(0.5 + 0.5 * sin(time * (0.3 + 0.001 * floor(h.x * 400.0)) + h.y * 6.28), 5.0);
            float dd = length(p - c);
            float glow = pulse * (exp(-dd * dd * 9000.0) + 0.25 * exp(-dd * 40.0));
            col += mix(primary, vec3(1.0, 0.95, 0.7), 0.5) * glow * 1.3;
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "helix", name: "Helix",
      blurb: "A double helix turning on the vertical axis, rungs between the strands, near side brighter.",
      frag: `
        void main() {
          vec2 p = coords(); float a = aspect();
          float k = 4.5, R = 0.24;
          float ph = p.y * k + time * 0.4;
          float x1 = R * sin(ph), z1 = cos(ph), x2 = -x1, z2 = -z1;
          float w1 = 0.010 + 0.006 * z1, w2 = 0.010 + 0.006 * z2;
          float s1 = smoothstep(w1, w1 * 0.4, abs(p.x - x1)), s2 = smoothstep(w2, w2 * 0.4, abs(p.x - x2));
          float spacing = 0.09;
          float yr = (floor(p.y / spacing) + 0.5) * spacing;
          float phr = yr * k + time * 0.4;
          float xa = R * sin(phr), xb = -xa;
          float rung = smoothstep(0.004, 0.0, abs(p.y - yr) - 0.003) * step(min(xa, xb), p.x) * step(p.x, max(xa, xb));
          float rz = 0.5 + 0.5 * cos(phr) * sign(p.x);
          vec3 c1 = primary * (0.55 + 0.45 * z1) + vec3(1.0) * max(z1, 0.0) * 0.25;
          vec3 c2 = secondary * (0.55 + 0.45 * z2) + vec3(1.0) * max(z2, 0.0) * 0.25;
          vec3 col = page * 0.85 + mix(primary, secondary, 0.5) * 0.05 * exp(-abs(p.x) * 5.0);
          col += mix(primary, secondary, 0.5) * rung * (0.35 + 0.35 * rz);
          if (z1 < z2) { col = mix(col, c1, s1); col = mix(col, c2, s2); } else { col = mix(col, c2, s2); col = mix(col, c1, s1); }
          col += primary * exp(-abs(p.x - x1) * 40.0) * 0.12 * (0.5 + 0.5 * z1) + secondary * exp(-abs(p.x - x2) * 40.0) * 0.12 * (0.5 + 0.5 * z2);
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "crt", name: "Lost signal",
      blurb: "Colour bars on a failing tube: scanlines, a rolling bar, tearing and snow.",
      frag: `
        void main() {
          vec2 p = coords(); float a = aspect();
          float tear = 0.012 * sin(p.y * 40.0 + time * 3.0) * smoothstep(0.7, 1.0, sin(p.y * 7.0 - time * 1.3));
          float roll = fract(p.y / a + 0.5 - saw(200.0));
          vec2 q = p + vec2(tear + 0.03 * smoothstep(0.02, 0.0, abs(roll - 0.5) - 0.03), 0.0);
          float bar = floor((q.x + 0.5) * 7.0);
          vec3 bars = mix(primary, secondary, fract(bar * 0.38 + 0.2));
          bars *= 0.35 + 0.25 * step(0.5, fract(bar * 0.5));
          float snow = hash(floor(q * vec2(220.0, 220.0 * a)) + vec2(floor(sin(time * 9.0) * 50.0), floor(cos(time * 7.0) * 50.0)));
          float scan = 0.82 + 0.18 * sin(q.y * 900.0);
          float rollGlow = exp(-pow((roll - 0.5) * 6.0, 2.0));
          vec3 col = page * 0.85 + bars * 0.32;
          col = mix(col, vec3(snow), 0.05 + 0.2 * smoothstep(0.6, 1.0, sin(time * 0.9)));
          col += vec3(0.9, 0.95, 1.0) * rollGlow * 0.18;
          col *= scan;
          float vig = smoothstep(0.85, 0.35, length(p * vec2(1.0, 1.0 / a)) * 1.2);
          col *= 0.4 + 0.6 * vig;
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "flames", name: "Flames",
      blurb: "A fire burning up from the bottom edge, primary in the body, secondary at the tips.",
      frag: `
        float tongue(vec2 q) {
          float s = sin(q.x * 3.0 + q.y * 0.5 + time * 0.13) * sin(q.y * 1.7 - time * 0.21 + q.x * 0.6);
          s += 0.5 * sin(q.x * 6.1 - q.y * 1.1 - time * 0.17) * sin(q.y * 3.3 - time * 0.29);
          s += 0.35 * sin(q.x * 9.3 + q.y * 2.1 + time * 0.23) * sin(q.y * 5.1 - time * 0.41);
          return s;
        }
        void main() {
          vec2 p = coords(); float a = aspect();
          vec2 q = p * 2.4; q.y -= time * 0.5;
          q.x += 0.25 * sin(p.y * 3.0 + time * 0.31) + 0.12 * sin(p.y * 7.0 - time * 0.47);
          float s = tongue(q) + 0.5 * tongue(q * 1.9 + vec2(2.0, 0.0));
          float grain = fbm(p * 6.0 + vec2(0.0, -0.9 * sin(time * 0.05)));
          float h = (p.y + 0.5 * a) / a;
          float body = smoothstep(0.2 + 1.9 * h, 1.6 + 1.9 * h, s + 0.8 + 0.6 * grain);
          float heat = smoothstep(0.0, 0.55, body);
          vec3 tint = mix(primary, secondary, smoothstep(0.1, 0.5, h));
          vec3 col = page * 0.85 + primary * 0.14 * (1.0 - h) * (1.0 - h);
          col += tint * heat * 0.9 + mix(tint, vec3(1.0, 0.95, 0.8), 0.7) * pow(body, 3.0) * (1.0 - h) * 0.7;
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "storm", name: "Storm",
      blurb: "Low cloud, sheets of rain, and forked lightning that lights the whole sky when it strikes.",
      frag: `
        float bolt(vec2 p, float seed, float flash, float top) {
          float x = 0.3 * (fbm(vec2(p.y * 4.0 + seed * 7.0, seed)) - 0.5) + 0.08 * (noise(vec2(p.y * 30.0 + seed * 3.0, seed + 1.0)) - 0.5);
          float on = step(p.y, top) * step(-0.5 * aspect(), p.y);
          float core = exp(-abs(p.x - x) * 260.0) * on;
          float glow = exp(-abs(p.x - x) * 30.0) * on;
          return (core * 1.2 + glow * 0.35) * flash;
        }
        void main() {
          vec2 p = coords(); float a = aspect();
          float f1 = sin(time * 0.37) + sin(time * 0.61) + 0.5 * sin(time * 1.3);
          float flash1 = smoothstep(1.6, 2.1, f1);
          float f2 = sin(time * 0.29 + 1.0) + sin(time * 0.53 + 2.0) + 0.5 * sin(time * 1.7);
          float flash2 = smoothstep(1.6, 2.1, f2);
          float seed1 = floor(sin(time * 0.037) * 5.0), seed2 = floor(sin(time * 0.029 + 1.0) * 5.0) + 20.0;
          float lit = flash1 + flash2;
          float cloud = fbm(vec2(p.x * 3.0 + 0.6 * sin(time * 0.013), p.y * 2.0 + 0.3 * sin(time * 0.011)));
          float up = smoothstep(-0.5 * a, 0.5 * a, p.y);
          vec3 tint = mix(primary, secondary, 0.5);
          vec3 col = page * 0.85 + tint * 0.26 * cloud * (0.3 + 0.7 * up) + secondary * 0.04;
          col += vec3(0.85, 0.9, 1.0) * lit * (0.15 + 0.35 * cloud) * (0.4 + 0.6 * up);
          float rain = smoothstep(0.75, 1.0, noise(vec2(p.x * 160.0 + p.y * 12.0, p.y * 4.0 + saw(400.0) * 16.0)));
          col += mix(secondary, vec3(1.0), 0.5) * rain * (0.06 + 0.3 * lit);
          col += mix(secondary, vec3(1.0), 0.7) * (bolt(p - vec2(-0.18, 0.0), seed1, flash1, 0.35 * a) + bolt(p - vec2(0.22, 0.0), seed2, flash2, 0.25 * a));
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "galaxy", name: "Spiral galaxy",
      blurb: "A barred spiral seen at a tilt, arms turning slowly around a bright core.",
      frag: `
        void main() {
          vec2 p = coords(); float a = aspect();
          vec2 d = p - vec2(0.0, -0.03 * a);
          float rot = time * 0.02; mat2 m = mat2(cos(rot), -sin(rot), sin(rot), cos(rot));
          vec2 q = m * d; q.y *= 1.7;
          float r = length(q); float ang = atan(q.y, q.x);
          float arms = 0.5 + 0.5 * sin(ang * 2.0 - log(r + 0.02) * 5.0 + time * 0.04);
          arms = pow(arms, 2.5);
          float dust = fbm(m * d * 9.0 + 5.0);
          float density = arms * exp(-r * 4.5) * (0.5 + 0.8 * dust) + exp(-r * 14.0) * 0.8;
          vec3 tint = mix(primary, secondary, smoothstep(0.05, 0.45, r));
          vec3 col = page * 0.85 + secondary * 0.04;
          col += tint * density * 0.9 + vec3(1.0, 0.95, 0.85) * exp(-r * 22.0) * 0.7;
          col += mix(secondary, vec3(1.0), 0.6) * smoothstep(0.55, 0.8, dust) * arms * exp(-r * 4.0) * 0.35;
          vec2 sg = p * 40.0; vec2 id = floor(sg), f = fract(sg) - 0.5; vec2 h = hash2(id);
          col += vec3(1.0) * smoothstep(0.07, 0.0, length(f - (h - 0.5) * 0.8)) * step(0.82, hash(id + 2.2)) * (0.3 + 0.5 * sin(time * 0.5 + h.y * 6.28));
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "terrain", name: "Wire terrain",
      blurb: "Ridge lines of a wireframe landscape scrolling toward you under a glowing horizon.",
      frag: `
        float land(float x, float z) {
          return sin(x * 1.3 + z * 0.3927) * 0.6 + sin(x * 2.7 - z * 0.7854 + 1.0) * 0.3
               + sin(x * 0.7 + z * 0.19635 + 2.0) * 0.8 + sin(x * 5.1 + z * 1.1781) * 0.12;
        }
        void main() {
          vec2 p = coords(); float a = aspect();
          float hy = 0.05 * a;
          float s = saw(60.0);
          vec3 tint = mix(primary, secondary, 0.5);
          vec3 col = page * 0.85 + secondary * 0.12 * exp(-abs(p.y - hy) * 6.0) * step(hy, p.y);
          col += tint * 0.5 * exp(-abs(p.y - hy) * 60.0);
          vec2 sg = p * 34.0; vec2 id = floor(sg), f = fract(sg) - 0.5; vec2 h = hash2(id);
          col += vec3(1.0) * smoothstep(0.07, 0.0, length(f - (h - 0.5) * 0.8)) * step(0.85, hash(id + 2.2)) * (0.3 + 0.5 * sin(time * 0.5 + h.y * 6.28)) * step(hy, p.y);
          float prev = -10.0;
          for (int i = 0; i < 16; i++) {
            float z = float(15 - i) - s;
            float zz = z + 1.2;
            float xw = p.x * zz * 2.2;
            float y = hy - 0.6 / zz + 0.16 * land(xw, z) / zz;
            float depth = zz / 16.0;
            vec3 lc = mix(primary, secondary, depth);
            float below = step(p.y, y);
            col = mix(col, page * 0.85 + lc * 0.05, below);
            float line = exp(-abs(p.y - y) * (260.0 + 500.0 * depth));
            col += lc * line * (1.1 - 0.7 * depth) + vec3(1.0) * line * 0.15 * (1.0 - depth);
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "orbits", name: "Orbits",
      blurb: "A ringed planet with three moons circling it, passing behind and in front.",
      frag: `
        void main() {
          vec2 p = coords(); float a = aspect();
          vec2 c = vec2(0.0, -0.08 * a); vec2 d = p - c;
          float R = 0.17;
          float r = length(d);
          float sphere = smoothstep(R, R - 0.004, r);
          float z = sqrt(max(R * R - dot(d, d), 0.0)) / R;
          vec3 n = vec3(d / R, z);
          vec3 L = normalize(vec3(-0.6, 0.5, 0.6));
          float diff = max(dot(n, L), 0.0);
          float band = 0.5 + 0.5 * sin(d.y * 60.0 + 0.6 * sin(d.x * 30.0 + time * 0.05));
          vec3 pc = mix(primary, secondary, band * 0.5) * (0.12 + 0.8 * diff);
          vec3 col = page * 0.85 + mix(primary, secondary, 0.5) * 0.05;
          vec2 sg = p * 34.0; vec2 id = floor(sg), f = fract(sg) - 0.5; vec2 h = hash2(id);
          col += vec3(1.0) * smoothstep(0.07, 0.0, length(f - (h - 0.5) * 0.8)) * step(0.84, hash(id + 2.2)) * (0.3 + 0.5 * sin(time * 0.5 + h.y * 6.28));
          vec2 q = vec2(d.x, d.y * 3.2); float rr = length(q);
          float ring = smoothstep(0.22, 0.24, rr) * smoothstep(0.42, 0.40, rr) * (0.5 + 0.5 * sin(rr * 90.0));
          ring *= 0.6 + 0.4 * smoothstep(0.30, 0.31, rr);
          vec3 ringCol = mix(secondary, vec3(1.0), 0.4) * ring * 0.55;
          float front = step(0.0, -d.y);
          col += ringCol * (1.0 - sphere) + ringCol * sphere * front * 0.0;
          col = mix(col, pc, sphere * (1.0 - front * ring * 0.0));
          col += ringCol * front * sphere * 0.0;
          col += ringCol * front;
          for (int i = 0; i < 3; i++) {
            float fi = float(i);
            float rate = 0.3 - 0.08 * fi; float orb = 0.28 + 0.1 * fi;
            float ph = time * rate + fi * 2.1;
            vec2 mp = c + vec2(cos(ph) * orb, sin(ph) * orb * 0.32);
            float mz = sin(ph);
            float mr = 0.014 + 0.006 * fi;
            float moon = smoothstep(mr, mr - 0.003, length(p - mp));
            float hidden = step(mz, 0.0) * sphere;
            vec3 mc = mix(primary, secondary, fi * 0.5) * (0.5 + 0.5 * max(dot(normalize(vec3((p - mp) / mr, sqrt(max(1.0 - dot((p - mp) / mr, (p - mp) / mr), 0.0)))), L), 0.0)) + vec3(0.3);
            col = mix(col, mc, moon * (1.0 - hidden));
          }
          col += mix(primary, secondary, 0.5) * exp(-max(r - R, 0.0) * 25.0) * 0.18 * (1.0 - sphere);
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "ripples", name: "Ripples",
      blurb: "Rain on a still pond from above: rings spreading from each drop and fading out.",
      frag: `
        void main() {
          vec2 p = coords(); float a = aspect();
          vec3 tint = mix(primary, secondary, smoothstep(-0.5 * a, 0.5 * a, p.y));
          float shimmer = fbm(p * 5.0 + vec2(0.4 * sin(time * 0.021), 0.4 * sin(time * 0.017)));
          vec3 col = page * 0.85 + tint * 0.08 * shimmer + secondary * 0.03;
          float height = 0.0;
          for (int i = 0; i < 9; i++) {
            float fi = float(i); vec2 h = hash2(vec2(fi, 3.3));
            vec2 c = vec2((h.x - 0.5) * 0.95, (h.y - 0.5) * a * 0.95) + 0.05 * vec2(sin(time * 0.031 + fi), cos(time * 0.023 + fi));
            float k = 30.0 + 10.0 * floor(hash(vec2(fi, 8.8)) * 3.0);
            float ph = fract(h.x + saw(k));
            float rad = ph * 0.55;
            float dd = length(p - c);
            float env = (1.0 - ph) * smoothstep(0.0, 0.1, ph);
            height += sin((dd - rad) * 90.0) * exp(-pow((dd - rad) * 18.0, 2.0)) * env;
          }
          float light = height * 0.5;
          col += tint * max(light, 0.0) * 1.2 + vec3(1.0) * max(light, 0.0) * 0.5;
          col -= tint * max(-light, 0.0) * 0.6;
          gl_FragColor = vec4(max(col, page * 0.5), 1.0);
        }`,
    },
    {
      id: "globe", name: "Hologram globe",
      blurb: "A wireframe earth turning on a tilted axis, the far side ghosted, a scan band climbing it.",
      frag: `
        float grid(vec2 ll) {
          vec2 g = abs(fract(ll * 12.0 / 3.14159) - 0.5);
          return 1.0 - smoothstep(0.0, 0.06, min(g.x, g.y));
        }
        void main() {
          vec2 p = coords(); float a = aspect();
          vec2 c = vec2(0.0, -0.06 * a); vec2 d = p - c; float R = 0.3;
          float r = length(d);
          float tilt = 0.4; mat2 T = mat2(cos(tilt), -sin(tilt), sin(tilt), cos(tilt));
          vec2 e = T * d;
          vec3 col = page * 0.85 + secondary * 0.04;
          vec3 tint = mix(primary, secondary, 0.5);
          float spin = time * 0.12;
          if (r < R) {
            float z = sqrt(R * R - dot(e, e));
            float lat = asin(e.y / R);
            float lonF = atan(e.x, z) + spin;
            float lonB = atan(e.x, -z) + spin;
            float front = grid(vec2(lonF, lat));
            float back = grid(vec2(lonB, lat));
            float fade = smoothstep(R, R * 0.5, r);
            col += secondary * back * 0.18;
            col += mix(secondary, vec3(1.0), 0.3) * front * (0.35 + 0.45 * fade);
            float land = smoothstep(0.55, 0.62, fbm(vec2(lonF * 1.5, lat * 2.0) + 3.0));
            col += primary * land * 0.35 * fade;
            float scan = exp(-pow((e.y - (saw(80.0) - 0.5) * 2.4 * R) * 20.0, 2.0));
            col += vec3(1.0) * scan * 0.25 * (0.4 + front);
            col += tint * 0.06;
          }
          float rim = exp(-abs(r - R) * 60.0);
          col += mix(secondary, vec3(1.0), 0.5) * rim * 0.6;
          col += secondary * exp(-max(r - R, 0.0) * 6.0) * 0.12;
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "lasers", name: "Laser show",
      blurb: "Beams fanning from the two bottom corners through haze, crossing in white.",
      frag: `
        float beam(vec2 p, vec2 o, float ang) {
          vec2 dir = vec2(cos(ang), sin(ang));
          vec2 d = p - o; float along = dot(d, dir); float side = abs(d.x * dir.y - d.y * dir.x);
          return exp(-side * 160.0) * step(0.0, along) * exp(-along * 0.6);
        }
        void main() {
          vec2 p = coords(); float a = aspect();
          float haze = fbm(p * 3.0 + vec2(0.5 * sin(time * 0.017), 0.3 * sin(time * 0.013) + 0.5 * sin(time * 0.009)));
          vec3 col = page * 0.85 + mix(primary, secondary, 0.5) * 0.05 * haze;
          vec2 L = vec2(-0.55, -0.52 * a), Rr = vec2(0.55, -0.52 * a);
          float bl = 0.0, br = 0.0;
          for (int i = 0; i < 4; i++) {
            float fi = float(i);
            bl += beam(p, L, 0.35 + 0.28 * fi + 0.22 * sin(time * (0.23 + 0.03 * fi) + fi));
            br += beam(p, Rr, 3.14159 - 0.35 - 0.28 * fi - 0.22 * sin(time * (0.19 + 0.03 * fi) + fi * 1.7));
          }
          float vol = 0.6 + 0.8 * haze;
          col += primary * bl * vol * 0.9 + secondary * br * vol * 0.9;
          col += vec3(1.0) * bl * br * 6.0;
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "dunes", name: "Moonlit dunes",
      blurb: "Sand ridges lit from one side under a starry sky, sharp crests, deep shadow behind them.",
      frag: `
        float sand(vec2 q) {
          float h = sin(q.x * 3.0 + q.y * 1.2) * 0.5 + sin(q.x * 6.3 - q.y * 0.7 + 1.0) * 0.25 + sin(q.x * 1.4 + q.y * 2.6 + 2.0) * 0.7;
          return h - 0.6 * abs(sin(q.x * 2.1 + q.y * 0.9));
        }
        void main() {
          vec2 p = coords(); float a = aspect();
          float hy = 0.22 * a;
          vec3 sky = page * 0.85 + secondary * 0.1 * smoothstep(0.5 * a, hy, p.y);
          vec2 sg = p * 34.0; vec2 id = floor(sg), f = fract(sg) - 0.5; vec2 h = hash2(id);
          sky += vec3(1.0) * smoothstep(0.07, 0.0, length(f - (h - 0.5) * 0.8)) * step(0.85, hash(id + 2.2)) * (0.3 + 0.5 * sin(time * 0.5 + h.y * 6.28));
          vec2 md = p - vec2(-0.3, hy + 0.6 * (0.5 * a - hy));
          sky += mix(secondary, vec3(1.0), 0.75) * smoothstep(0.05, 0.046, length(md)) + secondary * 0.2 * exp(-length(md) * 9.0);
          float depth = (hy - p.y) / (hy + 0.5 * a);
          vec2 q = vec2(p.x * (1.0 + 3.0 * depth), depth * 4.0) + vec2(0.05 * sin(time * 0.011), 0.0);
          float hgt = sand(q); float e = 0.01;
          vec2 g = vec2(sand(q + vec2(e, 0.0)) - hgt, sand(q + vec2(0.0, e)) - hgt) / e;
          vec3 n = normalize(vec3(-g.x * 0.25, -g.y * 0.25, 1.0));
          vec3 Ld = normalize(vec3(-0.7, 0.4, 0.5));
          float diff = max(dot(n, Ld), 0.0);
          float ridge = exp(-abs(hgt + 0.3) * 6.0);
          float grain = 0.9 + 0.1 * noise(q * 60.0 + 0.5 * sin(time * 0.03));
          vec3 sandCol = mix(primary, secondary, 0.45) * (0.1 + 0.55 * diff) * grain + vec3(1.0) * ridge * diff * 0.1;
          sandCol = mix(sandCol, sky, smoothstep(0.0, 0.03, -depth));
          vec3 col = mix(sky, sandCol, step(0.0, depth));
          col += mix(secondary, vec3(1.0), 0.5) * exp(-abs(p.y - hy) * 40.0) * 0.12;
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "meteors", name: "Meteor shower",
      blurb: "Bright heads streaking diagonally through a starfield, tails in the accents.",
      frag: `
        float streaks(vec2 p, float lanes, float k, float seed, float len, float wid) {
          float ang = -0.9;
          vec2 dir = vec2(cos(ang), sin(ang)), perp = vec2(-dir.y, dir.x);
          float u = dot(p, dir), v = dot(p, perp);
          float lane = floor(v * lanes + seed); float fv = (fract(v * lanes + seed) - 0.5) / lanes;
          float h = hash(vec2(lane, seed)), h2 = hash(vec2(lane, seed + 4.0));
          float s = saw(k * (1.0 + floor(h2 * 3.0)));
          float head = (fract(h + s) - 0.5) * 3.0;
          float along = u - head;
          float tail = smoothstep(-len, 0.0, along) * (1.0 - smoothstep(0.0, 0.006, along));
          float line = exp(-abs(fv - (h2 - 0.5) * 0.3 / lanes) * (1.0 / wid));
          return tail * line * step(0.35, hash(vec2(lane, seed + 9.0)));
        }
        void main() {
          vec2 p = coords(); float a = aspect();
          vec3 col = page * 0.85 + secondary * 0.04 * smoothstep(-0.5 * a, 0.5 * a, p.y);
          vec2 sg = p * 40.0; vec2 id = floor(sg), f = fract(sg) - 0.5; vec2 h = hash2(id);
          col += vec3(1.0) * smoothstep(0.07, 0.0, length(f - (h - 0.5) * 0.8)) * step(0.8, hash(id + 2.2)) * (0.3 + 0.5 * sin(time * 0.5 + h.y * 6.28));
          float s1 = streaks(p, 9.0, 40.0, 0.0, 0.35, 0.004);
          float s2 = streaks(p, 15.0, 60.0, 3.0, 0.22, 0.0025);
          float s3 = streaks(p, 24.0, 80.0, 7.0, 0.12, 0.0015);
          col += mix(primary, vec3(1.0), 0.5) * s1 * 1.2 + mix(secondary, vec3(1.0), 0.4) * s2 * 0.9 + mix(primary, secondary, 0.5) * s3 * 0.7;
          col += vec3(1.0) * (s1 * s1 + s2 * s2) * 0.6;
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "glitch", name: "Glitch",
      blurb: "Chevrons in the two accents that hold still, then slip sideways in torn bands with colour split.",
      frag: `
        vec3 image(vec2 q) {
          float v = sin((q.x * 2.0 + abs(q.y) * 1.5) * 12.0 + time * 0.3);
          vec3 c = mix(primary, secondary, smoothstep(-0.3, 0.3, v));
          return page * 0.85 + c * (0.06 + 0.11 * smoothstep(0.6, 0.9, abs(v)));
        }
        void main() {
          vec2 p = coords(); float a = aspect();
          float band = floor(p.y * 28.0);
          float hb = hash(vec2(band, 1.0));
          float burst = smoothstep(0.86, 0.94, sin(time * 0.7 + hb * 6.28) + 0.35 * sin(time * 1.9 + hb * 3.0));
          float shift = (hb - 0.5) * 0.25 * burst;
          float thick = step(0.7, hash(vec2(floor(p.y * 7.0), 2.0))) * smoothstep(0.9, 0.97, sin(time * 0.41 + floor(p.y * 7.0)));
          shift += thick * 0.08;
          vec2 q = p + vec2(shift, 0.0);
          float split = 0.012 * (burst + thick);
          vec3 col = vec3(image(q + vec2(split, 0.0)).r, image(q).g, image(q - vec2(split, 0.0)).b);
          float lines = step(0.8, hash(vec2(band, floor(sin(time * 3.0) * 4.0)))) * burst;
          col = mix(col, vec3(0.85, 0.9, 1.0), lines * 0.5);
          col *= 0.9 + 0.1 * sin(p.y * 700.0);
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "scope", name: "Oscilloscope",
      blurb: "Glowing traces on a graticule, each one a different mix of harmonics sliding past.",
      frag: `
        float trace(vec2 p, float y0, float f, float r, float seed) {
          float y = y0 + 0.05 * sin(p.x * f + time * r + seed) + 0.025 * sin(p.x * f * 2.3 - time * r * 1.7 + seed)
                  + 0.012 * sin(p.x * f * 5.1 + time * r * 0.6);
          float env = 0.6 + 0.4 * sin(p.x * 3.0 + time * 0.1 + seed);
          float d = abs(p.y - y) * (1.0 / (0.4 + env));
          return exp(-d * 260.0) + 0.3 * exp(-d * 40.0);
        }
        void main() {
          vec2 p = coords(); float a = aspect();
          vec2 g = abs(fract(p * 8.0) - 0.5);
          float grid = 1.0 - smoothstep(0.0, 0.05, min(g.x, g.y));
          vec2 g2 = abs(fract(p * 40.0) - 0.5);
          float tick = (1.0 - smoothstep(0.0, 0.2, min(g2.x, g2.y))) * step(0.44, max(g.x, g.y));
          vec3 col = page * 0.85 + secondary * 0.05;
          col += secondary * grid * 0.12 + secondary * tick * 0.06;
          float rows = floor(a * 3.0) + 1.0;
          for (int i = 0; i < 6; i++) {
            float fi = float(i);
            if (fi >= rows) break;
            float y0 = -0.5 * a + (fi + 0.5) * a / rows;
            vec3 tint = mix(primary, secondary, fract(fi * 0.37));
            float t = trace(p, y0, 14.0 + 4.0 * fi, 0.5 + 0.11 * fi, fi * 1.7);
            col += tint * t * 0.9 + vec3(1.0) * t * t * 0.3;
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "comet", name: "Comet passage",
      blurb: "An icy nucleus drifting through distant stars, with a curved blue dust tail.",
      frag: `
        void main() {
          vec2 p = coords();
          vec2 stars = p * 55.0, cell = floor(stars);
          float star = 1.0 - smoothstep(0.015, 0.06, length(fract(stars) - hash2(cell)));
          vec3 col = page * 0.65 + vec3(star * step(0.82, hash(cell + 9.0)) * 0.6);
          vec2 q = p - vec2(0.16 * sin(time * 0.013), 0.18 * sin(time * 0.017));
          q = mat2(0.8, -0.6, 0.6, 0.8) * q;
          float behind = max(0.0, -q.x);
          float width = 0.008 + behind * 0.11;
          float tail = exp(-pow((q.y - behind * behind * 0.32) / width, 2.0));
          tail *= exp(-behind * 4.0) * (1.0 - smoothstep(-0.015, 0.025, q.x));
          float dust = 0.75 + 0.25 * sin(behind * 65.0 + time * 0.4);
          col += mix(primary, secondary, min(1.0, behind * 2.0)) * tail * dust;
          col += mix(primary, vec3(1.0), 0.85) * exp(-length(q) * 100.0);
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "pulsar", name: "Pulsar",
      blurb: "Twin lighthouse beams sweeping from a bright neutron star through a quiet starfield.",
      frag: `
        void main() {
          vec2 p = coords(); float r = length(p);
          float angle = time * 0.12;
          vec2 q = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p;
          float beam = exp(-abs(q.x) / (0.006 + abs(q.y) * 0.08)) * exp(-r * 1.8);
          float halo = exp(-r * 16.0) * (0.8 + 0.2 * sin(time * 0.6));
          vec2 sg = p * 48.0, cell = floor(sg);
          float stars = (1.0 - smoothstep(0.02, 0.065, length(fract(sg) - hash2(cell)))) * step(0.85, hash(cell + 2.0));
          vec3 col = page * 0.7 + vec3(stars * 0.55);
          col += mix(primary, secondary, smoothstep(-0.1, 0.1, q.y)) * beam * 0.8;
          col += primary * halo * 0.6 + vec3(0.9, 0.95, 1.0) * exp(-r * 120.0);
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
    {
      id: "eclipse", name: "Solar eclipse",
      blurb: "A dark lunar disc edged by a breathing corona and slowly curling solar rays.",
      frag: `
        void main() {
          vec2 p = coords(); float r = length(p);
          float angle = atan(p.y, p.x);
          float rays = 0.65 + 0.2 * sin(angle * 9.0 + time * 0.08)
                     + 0.15 * sin(angle * 17.0 - time * 0.06);
          float edge = r - 0.19;
          float corona = exp(-max(0.0, edge) * (19.0 - 7.0 * rays));
          float outside = smoothstep(-0.003, 0.003, edge);
          vec3 col = page * 0.55;
          col += outside * mix(primary, secondary, rays) * corona * (0.3 + 0.7 * rays);
          col += outside * vec3(1.0, 0.9, 0.75) * exp(-abs(edge) * 230.0);
          col = mix(page * 0.12, col, outside);
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
  ];
  const byId = (id) => DESIGNS.find((d) => d.id === id) || DESIGNS[0];

  // Gray-Scott reaction-diffusion for "coral": two ping-pong textures hold
  // (a, b); the display pass colors b and its gradient.
  const RD_INIT = `
    precision highp float;
    uniform vec2 grid;
    float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    void main() {
      vec2 uv = gl_FragCoord.xy / grid;
      float b = smoothstep(0.58, 0.7, noise(uv * vec2(12.0, 12.0 * grid.y / grid.x) + 3.1));
      gl_FragColor = vec4(1.0, b, 0.0, 1.0);
    }`;
  const RD_SIM = `
    precision highp float;
    uniform sampler2D state; uniform vec2 texel; uniform float time; uniform vec2 seed; uniform float seedOn;
    void main() {
      vec2 uv = gl_FragCoord.xy * texel;
      vec2 c = texture2D(state, uv).xy;
      vec2 lap = -c;
      lap += 0.2 * (texture2D(state, uv + vec2(texel.x, 0.0)).xy + texture2D(state, uv - vec2(texel.x, 0.0)).xy
                  + texture2D(state, uv + vec2(0.0, texel.y)).xy + texture2D(state, uv - vec2(0.0, texel.y)).xy);
      lap += 0.05 * (texture2D(state, uv + texel).xy + texture2D(state, uv - texel).xy
                   + texture2D(state, uv + vec2(texel.x, -texel.y)).xy + texture2D(state, uv - vec2(texel.x, -texel.y)).xy);
      // Feed and kill rates drift across the field so no region settles.
      float fy = 0.5 + 0.5 * sin(uv.y * 5.0 + time * 0.05 + sin(uv.x * 3.0 + time * 0.03));
      float fx = 0.5 + 0.5 * sin(uv.x * 4.0 - time * 0.04 + uv.y * 2.0);
      float feed = 0.028 + 0.034 * fy;
      float kill = 0.055 + 0.010 * fx;
      float abb = c.x * c.y * c.y;
      float a = c.x + (1.0 * lap.x - abb + feed * (1.0 - c.x));
      float b = c.y + (0.5 * lap.y + abb - (kill + feed) * c.y);
      vec2 asp = vec2(1.0, texel.x / texel.y);
      if (seedOn > 0.5 && distance(uv * asp, seed * asp) < 0.03) b = 1.0;
      gl_FragColor = vec4(clamp(a, 0.0, 1.0), clamp(b, 0.0, 1.0), 0.0, 1.0);
    }`;
  const RD_SHOW = `
    precision highp float;
    uniform sampler2D state; uniform vec2 texel; uniform vec2 resolution;
    uniform vec3 primary; uniform vec3 secondary; uniform vec3 page;
    void main() {
      vec2 uv = gl_FragCoord.xy / resolution;
      float b = texture2D(state, uv).y;
      float bx = texture2D(state, uv + vec2(texel.x, 0.0)).y - texture2D(state, uv - vec2(texel.x, 0.0)).y;
      float by = texture2D(state, uv + vec2(0.0, texel.y)).y - texture2D(state, uv - vec2(0.0, texel.y)).y;
      float edge = clamp(length(vec2(bx, by)) * 3.0, 0.0, 1.0);
      vec3 col = mix(page * 0.85, primary * 0.8, smoothstep(0.05, 0.25, b));
      col = mix(col, secondary, smoothstep(0.2, 0.5, b) * 0.65);
      col += vec3(0.9, 0.93, 1.0) * edge * 0.35;
      gl_FragColor = vec4(col, 1.0);
    }`;
  const VERTEX = `attribute vec2 position; void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

  // A scene owns one canvas and GL context and renders one design at a time.
  // budget caps the pixel count: this soft surface needs far fewer pixels than
  // the text above it.
  function createScene(canvas, budget, designId, cacheDesigns = false) {
    let gl = null;
    try {
      gl = canvas.getContext("webgl", {
        alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false,
      });
    } catch (error) { /* Keep the CSS color field if GPU access is disabled. */ }
    if (!gl) { canvas.style.visibility = "hidden"; return null; }

    const scene = { canvas, design: byId(designId), ready: false, time: Math.random() * 100, palette: null, target: null, paused: false };
    const programs = new Map();
    let lost = false, buffer = null, show = null, sim = null, init = null, rd = null;

    function compile(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Ambient shader compilation failed: ${log}`);
      }
      return shader;
    }
    function link(fragment, names) {
      const shaders = [];
      const program = gl.createProgram();
      try {
        shaders.push(compile(gl.VERTEX_SHADER, VERTEX));
        shaders.push(compile(gl.FRAGMENT_SHADER, fragment));
        shaders.forEach((shader) => gl.attachShader(program, shader));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Ambient shader link failed");
      } catch (error) {
        gl.deleteProgram(program);
        throw error;
      } finally {
        shaders.forEach((shader) => gl.deleteShader(shader));
      }
      const uniforms = Object.fromEntries(names.map((key) => [key, gl.getUniformLocation(program, key)]));
      return { program, uniforms, position: gl.getAttribLocation(program, "position") };
    }
    function use({ program, position }) {
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    }
    function dropTargets() {
      if (!rd) return;
      [rd.ping, rd.pong].forEach((t) => { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); });
      rd = null;
    }
    function teardown() {
      [show, sim, init].forEach((p) => { if (p) gl.deleteProgram(p.program); });
      show = sim = init = null;
      dropTargets();
      if (buffer) gl.deleteBuffer(buffer);
      buffer = null;
      scene.ready = false;
    }
    function build(design) {
      teardown();
      try {
        buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        if (design.sim) {
          show = link(RD_SHOW, ["state", "texel", "resolution", "primary", "secondary", "page"]);
          sim = link(RD_SIM, ["state", "texel", "time", "seed", "seedOn"]);
          init = link(RD_INIT, ["grid"]);
        } else {
          show = link(PRELUDE + design.frag, ["resolution", "time", "primary", "secondary", "page"]);
        }
        scene.ready = true;
        canvas.style.visibility = "visible";
      } catch (error) {
        console.warn(`ambient: ${design.id} unavailable`, error.message);
        teardown();
        if (design !== DESIGNS[0]) { scene.design = DESIGNS[0]; build(DESIGNS[0]); return; }
        canvas.style.visibility = "hidden";
      }
    }

    function makeTarget(w, h, type, linear) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (ok) return { tex, fbo };
      gl.deleteTexture(tex);
      gl.deleteFramebuffer(fbo);
      return null;
    }
    function setupTargets() {
      const w = 144, h = Math.max(16, Math.min(720, Math.round(w * canvas.height / canvas.width)));
      if (rd && rd.w === w && rd.h === h) return;
      dropTargets();
      const half = gl.getExtension("OES_texture_half_float");
      const halfLinear = !!gl.getExtension("OES_texture_half_float_linear");
      const floatExt = gl.getExtension("OES_texture_float");
      const floatLinear = !!gl.getExtension("OES_texture_float_linear");
      const candidates = [];
      if (half) candidates.push({ type: half.HALF_FLOAT_OES, linear: halfLinear });
      if (floatExt) candidates.push({ type: gl.FLOAT, linear: floatLinear });
      candidates.push({ type: gl.UNSIGNED_BYTE, linear: true });
      for (const c of candidates) {
        const ping = makeTarget(w, h, c.type, c.linear);
        if (!ping) continue;
        const pong = makeTarget(w, h, c.type, c.linear);
        if (!pong) { gl.deleteTexture(ping.tex); gl.deleteFramebuffer(ping.fbo); continue; }
        rd = { w, h, ping, pong, seedIn: 2 };
        use(init);
        gl.uniform2f(init.uniforms.grid, w, h);
        gl.bindFramebuffer(gl.FRAMEBUFFER, ping.fbo);
        gl.viewport(0, 0, w, h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return;
      }
    }

    scene.resize = function (width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight)) {
      const scale = Math.min(1, 960 / Math.max(width, height), Math.sqrt(budget / (width * height)));
      const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      if (scene.ready && scene.design.sim) setupTargets();
    };
    scene.setDesign = function (id) {
      const design = byId(id);
      if (design === scene.design && scene.ready) return;
      if (cacheDesigns && scene.ready) {
        programs.set(scene.design.id, { show, sim, init, rd, buffer });
        show = sim = init = rd = buffer = null;
        scene.ready = false;
      }
      scene.design = design;
      if (lost) return;
      const cached = programs.get(design.id);
      if (cached) {
        ({ show, sim, init, rd, buffer } = cached);
        programs.delete(design.id);
        scene.ready = true;
      } else build(design);
      if (scene.ready && design.sim && !cacheDesigns) setupTargets();
    };
    // dt = 0 redraws the current state without advancing.
    scene.draw = function (dt) {
      if (!scene.ready || !scene.palette) return;
      scene.time = (scene.time + dt) % PERIOD;
      const blend = 1 - Math.exp(-dt * 3);
      for (let c = 0; c < 2; c++)
        for (let i = 0; i < 3; i++) scene.palette[c][i] += (scene.target[c][i] - scene.palette[c][i]) * blend;
      const W = canvas.width, H = canvas.height;
      if (scene.design.sim) {
        if (!rd) return;
        use(sim);
        gl.uniform2f(sim.uniforms.texel, 1 / rd.w, 1 / rd.h);
        gl.uniform1f(sim.uniforms.time, scene.time);
        gl.viewport(0, 0, rd.w, rd.h);
        // A fixed number of steps per frame keeps the growth rate readable;
        // an expensive frame does not fast-forward the chemistry.
        const steps = dt > 0 ? 6 : 0;
        for (let s = 0; s < steps; s++) {
          let seedOn = 0;
          rd.seedIn -= dt / steps;
          if (rd.seedIn <= 0) {
            seedOn = 1;
            rd.seedIn = 1.2 + Math.random() * 2.5;
            gl.uniform2f(sim.uniforms.seed, Math.random(), Math.random());
          }
          gl.uniform1f(sim.uniforms.seedOn, seedOn);
          gl.bindFramebuffer(gl.FRAMEBUFFER, rd.pong.fbo);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, rd.ping.tex);
          gl.uniform1i(sim.uniforms.state, 0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          const t = rd.ping; rd.ping = rd.pong; rd.pong = t;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        use(show);
        gl.viewport(0, 0, W, H);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, rd.ping.tex);
        gl.uniform1i(show.uniforms.state, 0);
        gl.uniform2f(show.uniforms.texel, 1 / rd.w, 1 / rd.h);
        gl.uniform2f(show.uniforms.resolution, W, H);
      } else {
        use(show);
        gl.viewport(0, 0, W, H);
        gl.uniform2f(show.uniforms.resolution, W, H);
        gl.uniform1f(show.uniforms.time, scene.time);
      }
      gl.uniform3fv(show.uniforms.primary, scene.palette[0]);
      gl.uniform3fv(show.uniforms.secondary, scene.palette[1]);
      gl.uniform3fv(show.uniforms.page, scene.page);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    scene.setPalette = function (primary, secondary) {
      scene.target = [primary, secondary];
      if (!scene.palette || motion.matches) scene.palette = scene.target.map((c) => c.slice());
    };
    scene.destroy = function () {
      teardown();
      for (const cached of programs.values()) {
        ({ show, sim, init, rd, buffer } = cached);
        teardown();
      }
      programs.clear();
      scenes.delete(scene);
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    };
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      lost = true;
      programs.clear();
      scene.ready = false;
      rd = null; show = sim = init = null; buffer = null;
      canvas.style.visibility = "hidden";
    });
    canvas.addEventListener("webglcontextrestored", () => {
      lost = false;
      build(scene.design);
      scene.resize();
      scene.draw(0);
    });
    scene.page = rgb("var(--bg-1, #120a22)");
    build(scene.design);
    scene.resize();
    if (scene.ready && scene.design.sim) setupTargets();
    scenes.add(scene);
    return scene;
  }

  // One clock drives every scene on the page (the ground plus any previews).
  const scenes = new Set();
  let raf = 0, last = null;
  function frame(now) {
    raf = 0;
    if (document.hidden || motion.matches) { last = null; return; }
    // Follow elapsed time rather than slowing the flow on expensive frames.
    // Visibility changes reset last, so resuming never catches up hidden time.
    const dt = last === null ? 0 : Math.max(0, (now - last) / 1000);
    if (last !== null && now - last < 1000 / 30 - 0.5) {
      raf = requestAnimationFrame(frame);
      return;
    }
    last = now;
    let live = false;
    scenes.forEach((s) => {
      if (s.paused) return;
      live = true;
      s.elapsed = (s.elapsed || 0) + dt;
      if (!s.interval || s.elapsed >= s.interval - 0.0005) {
        s.draw(s.elapsed);
        s.elapsed = 0;
      }
    });
    if (live) raf = requestAnimationFrame(frame);
  }
  const anyLive = () => { let live = false; scenes.forEach((s) => { if (!s.paused) live = true; }); return live; };
  // Start the loop if it is not running; a paused scene coming back to life
  // must not redraw every other scene the way sync() does.
  function wake() {
    if (!raf && !document.hidden && !motion.matches && anyLive()) { last = null; raf = requestAnimationFrame(frame); }
  }
  function sync() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    last = null;
    if (motion.matches) scenes.forEach((s) => { if (s.target) s.palette = s.target.map((c) => c.slice()); });
    if (!document.hidden) {
      scenes.forEach((s) => { s.elapsed = 0; if (!s.paused) s.draw(0); });
      if (anyLive() && !motion.matches) raf = requestAnimationFrame(frame);
    }
  }
  document.addEventListener("visibilitychange", sync);
  motion.addEventListener("change", sync);

  // ---- the page ground -----------------------------------------------------------
  const canvas = document.querySelector(".ambient-glow canvas");
  const host = canvas && canvas.parentElement;
  const ground = canvas ? createScene(canvas, 240000) : null;
  function setPalette(primary, secondary) {
    const target = [rgb(primary), rgb(secondary)];
    if (host) {
      // Keep an opaque color field available if WebGL is unavailable or lost.
      const css = target.map((c) => `rgb(${c.map((v) => Math.round(v * 255)).join(",")})`);
      host.style.background = `linear-gradient(155deg, ${css[0]}, ${css[1]} 48%, ${css[0]})`;
    }
    if (ground) ground.setPalette(target[0], target[1]);
  }
  if (canvas) {
    const styles = getComputedStyle(document.documentElement);
    setPalette(styles.getPropertyValue("--accent").trim() || "#ff2d3f",
               styles.getPropertyValue("--accent-2").trim() || "#3d7bff");
    window.addEventListener("resize", () => { if (ground) { ground.resize(); ground.draw(0); } });
  }

  let previewRenderer = null;
  const previewTiles = new Set();

  window.HyteAmbient = {
    DESIGNS: DESIGNS.map(({ id, name, blurb }) => ({ id, name, blurb })),
    setPalette(primary, secondary) {
      setPalette(primary, secondary);
      if (motion.matches) sync();
    },
    setDesign(id) {
      if (!ground) return;
      ground.setDesign(id);
      ground.resize();
      sync();
    },
    // Visible tiles share one WebGL context and copy small frames to 2D
    // canvases. Compiled programs stay cached while browsing the gallery.
    preview(target, { design, primary, secondary }) {
      const ctx = target.getContext("2d", { alpha: false });
      if (!ctx) return null;
      if (!previewRenderer) {
        previewRenderer = createScene(document.createElement("canvas"), 12000, design, true);
        if (!previewRenderer) return null;
        scenes.delete(previewRenderer);
      }
      const tile = {
        paused: false, interval: 1 / 15, time: Math.random() * 100,
        palette: [rgb(primary), rgb(secondary)],
        draw(dt) {
          if (!previewRenderer || document.hidden) return;
          tile.time = (tile.time + dt) % PERIOD;
          // A fixed total pixel budget also bounds work on very large windows.
          const w = Math.max(1, target.clientWidth), h = Math.max(1, target.clientHeight);
          const scale = Math.min(1, Math.sqrt(Math.min(12000, 96000 / Math.max(1, previewTiles.size)) / (w * h)));
          const width = Math.max(1, Math.floor(w * scale)), height = Math.max(1, Math.floor(h * scale));
          if (target.width !== width) target.width = width;
          if (target.height !== height) target.height = height;
          previewRenderer.setDesign(design);
          previewRenderer.resize(width, height);
          previewRenderer.palette = tile.palette;
          previewRenderer.target = tile.palette;
          previewRenderer.time = (tile.time - dt + PERIOD) % PERIOD;
          previewRenderer.draw(dt);
          ctx.drawImage(previewRenderer.canvas, 0, 0, width, height);
        },
      };
      previewTiles.add(tile);
      scenes.add(tile);
      const observer = typeof ResizeObserver === "function"
        ? new ResizeObserver(() => tile.draw(0)) : null;
      if (observer) observer.observe(target);
      tile.draw(0);
      wake();
      return {
        setPalette(p, s) {
          if (p === primary && s === secondary) return;
          primary = p; secondary = s;
          tile.palette = [rgb(p), rgb(s)];
          tile.draw(0);
        },
        destroy() {
          if (observer) observer.disconnect();
          scenes.delete(tile);
          previewTiles.delete(tile);
          if (!previewTiles.size && previewRenderer) {
            previewRenderer.destroy();
            previewRenderer = null;
          }
        },
      };
    },
  };
  sync();
})();
