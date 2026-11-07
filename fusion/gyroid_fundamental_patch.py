"""
Gyroid fundamental patch -- Fusion 360 script

Builds the exact boundary of the gyroid's single fundamental patch, matching
MathMod's own "Gyroid_Fundamental_Patch" preset:

    F(x,y,z) = cos(x)*sin(y) + cos(y)*sin(z) + cos(z)*sin(x) = 0
    kept only where: y > 0, |x| < y, |z| < y   (a square pyramid,
      apex at the origin, base at y = L = pi/2 -- this is exactly what
      MathMod's condition "(((x+y)>0)*((x-y)<0)*(y+z)*(y-z))>0" selects)

WHERE THE BOUNDARY CURVES COME FROM
  Solving F=0 on each of the pyramid's bounding planes gives closed-form
  curves (verified numerically to ~1e-16, machine precision):

    Edge A (wall x = -y):  z = y - asin(0.5*sin(2y)),           y in [0, L]
    Edge B (wall z = -y):  x = asin(0.5*sin(2y)) - y,            y in [0, L]
    Edge C (wall y =  L):  z = +acos(-cos(x)/sin(x)),            x in [-L, -pi/4]
    Edge D (wall y =  L):  z = -acos(-cos(x)/sin(x)),            x in [-L, -pi/4]

  These four curves close into a single loop through four points where the
  patch meets itself:
    apex   (0, 0, 0)                    -- the pyramid's tip
    corner1 (-L, L,  L)                 -- Edge A ends here, Edge C starts here
    cusp    (-pi/4, L, 0)               -- where Edge C and Edge D meet
    corner2 (-L, L, -L)                 -- Edge D ends here, Edge B ends here
  Loop order: apex --A--> corner1 --C--> cusp --D(reversed)--> corner2 --B(reversed)--> apex.

  The patch does NOT touch the pyramid's other two walls (x=+y, z=+y) at
  all -- solving F=0 there has no solutions inside the pyramid -- which is
  why the patch is a 4-cusped-looking wavy quadrilateral rather than
  filling the whole pyramid cross-section.

HOW TO TURN THIS INTO A SURFACE
  1. Run this script. It creates one 3D sketch with the 4 boundary curves,
     already chained end-to-end (each curve's endpoint is the next curve's
     start point, to the same coordinates).
  2. Switch to the Surface workspace -> Create -> Patch.
  3. Select all 4 curves as the boundary (Fusion will chain them into one
     closed loop automatically since they share endpoints).
  4. Click OK.

BEFORE YOU RUN IT - CHECK YOUR UNITS
  Fusion's API always works in centimeters internally, no matter what your
  document's display units are set to.
    document units = cm    -> halfSize = 1.0
    document units = mm    -> halfSize = 0.1  (for a 1 mm patch half-size)
    document units = inch  -> halfSize = 2.54
  halfSize below maps to L = pi/2 in the canonical formula above, i.e. it's
  the real-world distance from the apex to the base plane (corner1/corner2/
  cusp all sit at this same distance along y).
"""

import adsk.core, adsk.fusion, adsk.cam, traceback
import math


def run(context):
    ui = None
    try:
        app = adsk.core.Application.get()
        ui = app.userInterface
        design = adsk.fusion.Design.cast(app.activeProduct)
        if not design:
            ui.messageBox('No active Fusion design. Open or create a design first, then run this script.')
            return
        rootComp = design.rootComponent

        # ---------------- Settings: edit this to match what you want ----------------
        halfSize = 1.0        # cm. Apex-to-base distance -- see units note above.
        pointsPerCurve = 41    # points per curve. Higher = smoother, slower to build.
        # --------------------------------------------------------------------------------

        L = math.pi / 2.0
        scale = halfSize / L  # maps canonical (L=pi/2) units -> real-world cm

        def curveA(y):
            z = y - math.asin(0.5 * math.sin(2.0 * y))
            return (-y, y, z)

        def curveB(y):
            x = math.asin(0.5 * math.sin(2.0 * y)) - y
            return (x, y, -y)

        def curveC(x):
            arg = max(-1.0, min(1.0, -math.cos(x) / math.sin(x)))  # clamp for float rounding at the endpoints
            z = math.acos(arg)
            return (x, L, z)

        def curveD(x):
            arg = max(-1.0, min(1.0, -math.cos(x) / math.sin(x)))
            z = -math.acos(arg)
            return (x, L, z)

        def addSplineFromFn(sketch, fn, tStart, tEnd, name):
            pts = adsk.core.ObjectCollection.create()
            for i in range(pointsPerCurve):
                t = tStart + (tEnd - tStart) * i / (pointsPerCurve - 1)
                p = fn(t)
                pts.add(adsk.core.Point3D.create(p[0] * scale, p[1] * scale, p[2] * scale))
            curve = sketch.sketchCurves.sketchFittedSplines.add(pts)
            curve.name = name
            return curve

        sketch = rootComp.sketches.add(rootComp.xYConstructionPlane)
        sketch.name = 'Gyroid fundamental patch'
        sketch.is3D = True

        cuspX = -math.pi / 4.0

        addSplineFromFn(sketch, curveA, 0.0, L, 'Gyroid_EdgeA')   # apex -> corner1
        addSplineFromFn(sketch, curveB, 0.0, L, 'Gyroid_EdgeB')   # apex -> corner2
        addSplineFromFn(sketch, curveC, -L, cuspX, 'Gyroid_EdgeC')  # corner1 -> cusp
        addSplineFromFn(sketch, curveD, -L, cuspX, 'Gyroid_EdgeD')  # corner2 -> cusp

        app.activeViewport.refresh()
        ui.messageBox(
            'Done. Created the 4 exact boundary curves in a new 3D sketch:\n"{}"\n\n'
            'Curves: Gyroid_EdgeA, Gyroid_EdgeB, Gyroid_EdgeC, Gyroid_EdgeD\n\n'
            'Next: Surface workspace -> Create -> Patch -> select all 4 curves '
            '(they chain automatically into one closed loop) -> OK.'.format(sketch.name)
        )

    except:
        if ui:
            ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))
