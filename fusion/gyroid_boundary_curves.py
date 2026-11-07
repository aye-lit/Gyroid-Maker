"""
Gyroid exact boundary curves — Fusion 360 script

Generates the six mathematically exact curves where the gyroid surface
    sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x) = 0
crosses the six faces of a cube centered on the origin. These are drop-in
replacements for hand-sketched 3-point arcs on each face.

HOW TO RUN
  Fusion 360 -> Utilities tab -> Scripts and Add-ins -> Scripts -> "+" (Add)
  -> select this file (or paste its contents into a new Python script) -> Run.

BEFORE YOU RUN IT - CHECK YOUR UNITS
  Fusion's API always works in centimeters internally, no matter what your
  document's display units are set to. If your cube looks like it spans
  -1 to 1 on screen, set halfSize below to whatever "1" actually equals in cm:
    document units = cm    -> halfSize = 1.0
    document units = mm    -> halfSize = 0.1
    document units = inch  -> halfSize = 2.54
  Get this wrong and every point will be scaled incorrectly relative to
  your existing cube, even though the curve's shape will still look right.
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
            ui.messageBox('No active Fusion design. Open your gyroid design first, then run this script.')
            return
        rootComp = design.rootComponent

        # ---------------- Settings: edit these to match your model ----------------
        halfSize = 1.0     # cm. Half your cube's edge length -- see units note above.
        numPoints = 25      # points per curve. Higher = smoother spline, slower to build.
        # ----------------------------------------------------------------------------

        k = math.pi / halfSize  # scales the cube so one edge = one full gyroid period

        def freeCoord(t):
            # Closed-form solution: on any face where one axis is held fixed
            # at +/- halfSize, the other two axes are related by this formula.
            return (1.0 / k) * math.atan(math.sin(k * t))

        sketch = rootComp.sketches.add(rootComp.xYConstructionPlane)
        sketch.name = 'Gyroid exact boundary curves'
        sketch.is3D = True

        # axis index: 0 = x, 1 = y, 2 = z
        # For each face: (axis held fixed, its value, a label for naming the curve).
        # Which of the other two axes is the input (sin) vs. the output (arctan(sin))
        # follows the formula's cyclic pattern x->y->z->x, computed automatically below.
        faces = [
            (2,  halfSize, 'Top'),      # z = +halfSize
            (2, -halfSize, 'Bottom'),   # z = -halfSize
            (0,  halfSize, 'Right'),    # x = +halfSize
            (0, -halfSize, 'Left'),     # x = -halfSize
            (1,  halfSize, 'Front'),    # y = +halfSize
            (1, -halfSize, 'Back'),     # y = -halfSize
        ]

        createdNames = []

        for fixedAxis, fixedValue, label in faces:
            varyingAxis = (fixedAxis + 1) % 3   # goes into sin()
            computedAxis = (fixedAxis + 2) % 3  # comes out of arctan(sin())

            pts = adsk.core.ObjectCollection.create()
            for i in range(numPoints):
                t = -halfSize + (2.0 * halfSize) * i / (numPoints - 1)
                c = freeCoord(t)

                coord = [0.0, 0.0, 0.0]
                coord[fixedAxis] = fixedValue
                coord[varyingAxis] = t
                coord[computedAxis] = c

                pts.add(adsk.core.Point3D.create(coord[0], coord[1], coord[2]))

            curve = sketch.sketchCurves.sketchFittedSplines.add(pts)
            curve.name = 'Gyroid_' + label
            createdNames.append(curve.name)

        app.activeViewport.refresh()
        ui.messageBox(
            'Done. Created 6 exact gyroid boundary curves in a new sketch:\n"{}"\n\nCurves: {}'.format(
                sketch.name, ', '.join(createdNames)
            )
        )

    except:
        if ui:
            ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))
