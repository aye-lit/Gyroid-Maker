# Gyroid Maker

A browser tool by **Aye! Lit Innovations!** that makes gyroid geometry you can print or open in CAD.

- **Patch**: one sixth of the cube around a gyroid's center point, thickened into a wall.
- **Cube**: six patches joined at the center point.
- **Cell**: one full repeat of the pattern, in 1 to 6 copies along each axis.
- **Upload**: drop in an STL or OBJ and get that shape filled with a gyroid (a snowman in, a snowman gyroid out).

Settings are size and wall thickness (plus cell size and cell counts where they apply). Output is STL, 3MF or OBJ, all in millimetres.

The surface is `cos x · sin y + cos y · sin z + cos z · sin x = 0`.

## Run it

Open `docs/index.html` in a browser. It is one self-contained page with no server and no dependencies.

## Develop

```
node build.js      # builds docs/index.html from src/
npm test           # checks that every mesh is closed and manifold
```

Source lives in `src/`:

| File | What it is |
| --- | --- |
| `src/mesher.js` | The geometry engine, one pure function `meshGyroid(params)`. No browser APIs, so it runs in Node, a web worker, or the page. |
| `src/template.html` | The page: styles, controls, preview, file loading and export (STL, 3MF, OBJ). `build.js` inlines the mesher into it. |

`docs/index.html` is generated, but it is committed so GitHub Pages can serve it without a build step.

### How the mesher works

- **Patch**: the exact boundary curves are known in closed form. A surface is stretched across them, snapped onto the gyroid with Newton steps, then offset both ways along the surface normal and closed with a rim wall.
- **Cube and Cell**: the wall is the set of points where `|F| / |∇F| < t/2`, sampled on a grid and meshed with marching tetrahedra. Cut planes are snapped exactly so cubes and cells tile with no gaps.
- **Upload**: the field is the minimum of the gyroid wall and the signed distance to the uploaded surface. Inside or outside comes from counting ray crossings through the mesh, and distance comes from exact point to triangle tests near the surface.
- If a request would need a grid finer than the point budget allows, the mesher returns `{ tooBig: true, ... }` with the largest size that fits instead of building a broken wall.

## Put it on the Shopify store

1. In the repo settings, go to **Pages**, choose **Deploy from a branch**, branch `main`, folder `/docs`.
2. The page will be at `https://aye-lit.github.io/Gyroid-Maker/`.
3. In Shopify, add a **Custom Liquid** section to a page and paste:

```html
<iframe src="https://aye-lit.github.io/Gyroid-Maker/" title="Gyroid Maker"
  style="width:100%;height:1100px;border:0" loading="lazy"></iframe>
```

## Fusion 360

`fusion/` holds the Fusion 360 Python scripts: one draws the six exact boundary curves, the other builds the fundamental patch.

## Limits

- STEP is not produced. Real STEP needs CAD surfaces, which a browser mesh tool does not have. For editable CAD, the Fusion scripts are the route.
- Uploaded models work best as one closed shell under 1.5 million triangles. Overlapping parts inside one file can leave stray walls.
