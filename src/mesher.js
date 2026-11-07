/* Gyroid mesher: F(x,y,z) = cos x sin y + cos y sin z + cos z sin x.
   Cube and cell: a wall of thickness t is the set where |F| / |grad F| < t/2 (first-order distance
   to F = 0), clipped to a box. The field is sampled on a grid and meshed with marching tetrahedra,
   which gives a closed, consistently oriented triangle mesh with flat cut faces.
   Patch: the same 4 closed-form boundary curves as the Fusion 360 script, a Coons surface snapped onto
   F = 0 with Newton steps, then offset +/- t/2 along the exact normal (what Fusion's Thicken does)
   and closed with a rim wall. */
function meshGyroid(p) {
  var PI = Math.PI, L = PI / 2;
  var mode = p.mode, size = p.size, thick = p.thickness, q = p.quality || 'standard';
  var patch = mode === 'patch', modelMode = mode === 'model';
  var k, period, lo, hi, Mpos = null, mc0 = [0, 0, 0];
  if (patch) { k = size / L; period = 4 * size; }
  else if (mode === 'cube') { k = size / PI; period = 2 * size; lo = [-L, -L, -L]; hi = [L, L, L]; }
  else if (modelMode) {
    // an uploaded shape: scale its longest side to `size` mm, stand it on z = 0, centre it on x and y
    var src = p.model.positions, nS = src.length, bn = [Infinity, Infinity, Infinity], bx = [-Infinity, -Infinity, -Infinity], a0;
    for (a0 = 0; a0 < nS; a0 += 3) for (var c3 = 0; c3 < 3; c3++) { var vv = src[a0 + c3]; if (vv < bn[c3]) bn[c3] = vv; if (vv > bx[c3]) bx[c3] = vv; }
    var longest = Math.max(bx[0] - bn[0], bx[1] - bn[1], bx[2] - bn[2]) || 1, sc = size / longest;
    var cxm = (bn[0] + bx[0]) / 2, cym = (bn[1] + bx[1]) / 2;
    Mpos = new Float32Array(nS);
    for (a0 = 0; a0 < nS; a0 += 3) { Mpos[a0] = (src[a0] - cxm) * sc; Mpos[a0 + 1] = (src[a0 + 1] - cym) * sc; Mpos[a0 + 2] = (src[a0 + 2] - bn[2]) * sc; }
    var mmn = [-(bx[0] - bn[0]) * sc / 2, -(bx[1] - bn[1]) * sc / 2, 0], mmx = [(bx[0] - bn[0]) * sc / 2, (bx[1] - bn[1]) * sc / 2, (bx[2] - bn[2]) * sc];
    k = p.cellSize / (2 * PI); period = p.cellSize;
    mc0 = [0, 0, mmx[2] / 2];
    lo = [(mmn[0] - mc0[0]) / k, (mmn[1] - mc0[1]) / k, (mmn[2] - mc0[2]) / k];
    hi = [(mmx[0] - mc0[0]) / k, (mmx[1] - mc0[1]) / k, (mmx[2] - mc0[2]) / k];
  }
  else {
    k = size / (2 * PI); period = size;
    lo = [-PI, -PI, -PI];
    hi = [-PI + 2 * PI * p.nx, -PI + 2 * PI * p.ny, -PI + 2 * PI * p.nz];
  }
  var h = (thick / 2) / k; // half wall, in the formula's own units (radians)
  var rp = [], rt = [], isCap = null, vox, grid, thin = false, TOL = 1e-4, maxCells = 0;

  /* =============================== PATCH =============================== */
  if (patch) {
    var cuspX = -PI / 4;
    var F = function (x, y, z) { return Math.cos(x) * Math.sin(y) + Math.cos(y) * Math.sin(z) + Math.cos(z) * Math.sin(x); };
    var gradF = function (x, y, z) {
      return [-Math.sin(x) * Math.sin(y) + Math.cos(z) * Math.cos(x),
              Math.cos(x) * Math.cos(y) - Math.sin(y) * Math.sin(z),
              Math.cos(y) * Math.cos(z) - Math.sin(z) * Math.sin(x)];
    };
    var curveA = function (y) { return [-y, y, y - Math.asin(0.5 * Math.sin(2 * y))]; };
    var curveB = function (y) { return [Math.asin(0.5 * Math.sin(2 * y)) - y, y, -y]; };
    var acosArg = function (x) { return Math.max(-1, Math.min(1, -Math.cos(x) / Math.sin(x))); };
    var curveC = function (x) { return [x, L, Math.acos(acosArg(x))]; };
    var curveD = function (x) { return [x, L, -Math.acos(acosArg(x))]; };
    var P00 = [0, 0, 0], P10 = curveA(L), P11 = curveC(cuspX), P01 = curveD(-L);
    var coons = function (u, v) {
      var b = curveA(u * L), t = curveD(-L + u * (cuspX + L)), l = curveB(v * L), r = curveC(-L + v * (cuspX + L));
      var o = [0, 0, 0];
      for (var i = 0; i < 3; i++) {
        o[i] = (1 - v) * b[i] + v * t[i] + (1 - u) * l[i] + u * r[i]
          - ((1 - u) * (1 - v) * P00[i] + u * (1 - v) * P10[i] + (1 - u) * v * P01[i] + u * v * P11[i]);
      }
      return o;
    };
    var snap = function (pt) {
      var x = pt[0], y = pt[1], z = pt[2];
      for (var i = 0; i < 8; i++) {
        var fv = F(x, y, z), g = gradF(x, y, z), g2 = g[0] * g[0] + g[1] * g[1] + g[2] * g[2];
        if (g2 < 1e-14) break;
        var st = fv / g2; x -= st * g[0]; y -= st * g[1]; z -= st * g[2];
      }
      return [x, y, z];
    };
    var res = { draft: 40, standard: 72, fine: 128 }[q] || 72, W = res + 1, nOut = W * W, i, j;
    var ncols = W;
    for (i = 0; i < W; i++) for (j = 0; j < W; j++) {
      var b0 = snap(coons(i / res, j / res)), g0 = gradF(b0[0], b0[1], b0[2]);
      var gl = Math.sqrt(g0[0] * g0[0] + g0[1] * g0[1] + g0[2] * g0[2]) || 1;
      rp.push(b0[0] + g0[0] / gl * h, b0[1] + g0[1] / gl * h, b0[2] + g0[2] / gl * h); // outer wall
    }
    for (i = 0; i < W; i++) for (j = 0; j < W; j++) {
      var c0 = snap(coons(i / res, j / res)), g1 = gradF(c0[0], c0[1], c0[2]);
      var gm = Math.sqrt(g1[0] * g1[0] + g1[1] * g1[1] + g1[2] * g1[2]) || 1;
      rp.push(c0[0] - g1[0] / gm * h, c0[1] - g1[1] / gm * h, c0[2] - g1[2] / gm * h); // inner wall
    }
    var capList = [];
    var O = function (a, b) { return a * ncols + b; }, Iw = function (a, b) { return nOut + a * ncols + b; };
    for (i = 0; i < res; i++) for (j = 0; j < res; j++) {
      rt.push(O(i, j), O(i + 1, j), O(i + 1, j + 1), O(i, j), O(i + 1, j + 1), O(i, j + 1)); capList.push(0, 0);
      rt.push(Iw(i, j), Iw(i + 1, j + 1), Iw(i + 1, j), Iw(i, j), Iw(i, j + 1), Iw(i + 1, j + 1)); capList.push(0, 0);
    }
    var perim = [], e;
    for (e = 0; e < res; e++) perim.push([e, 0]);
    for (e = 0; e < res; e++) perim.push([res, e]);
    for (e = res; e > 0; e--) perim.push([e, res]);
    for (e = res; e > 0; e--) perim.push([0, e]);
    perim.push([0, 0]);
    for (e = 0; e < perim.length - 1; e++) {
      var a = perim[e], b = perim[e + 1];
      var oa = O(a[0], a[1]), ob = O(b[0], b[1]), ia = Iw(a[0], a[1]), ib = Iw(b[0], b[1]);
      rt.push(ob, oa, ia, ob, ia, ib); capList.push(1, 1);
    }
    isCap = Uint8Array.from(capList);
    // make the whole surface face outward: flip everything if the signed volume comes out negative
    var sv = 0, tt;
    for (tt = 0; tt < rt.length; tt += 3) {
      var A = rt[tt] * 3, B = rt[tt + 1] * 3, C = rt[tt + 2] * 3;
      sv += rp[A] * (rp[B + 1] * rp[C + 2] - rp[B + 2] * rp[C + 1]) - rp[A + 1] * (rp[B] * rp[C + 2] - rp[B + 2] * rp[C]) + rp[A + 2] * (rp[B] * rp[C + 1] - rp[B + 1] * rp[C]);
    }
    if (sv < 0) { for (tt = 0; tt < rt.length; tt += 3) { var sw = rt[tt + 1]; rt[tt + 1] = rt[tt + 2]; rt[tt + 2] = sw; } }
    vox = k * 2.0 / res; grid = [W, W, 2];
  } else {
  /* =========================== CUBE / CELL ============================ */
    var kq = { draft: 1.5, standard: 2.5, fine: 4 }[q] || 2.5;
    var nq = { draft: 20, standard: 36, fine: 56 }[q] || 36;
    var cap = p.maxPoints || ({ draft: 3e5, standard: 1.2e6, fine: 2.4e6 }[q] || 1.2e6);
    vox = Math.min(thick / kq, period / nq);
    var ext = [(hi[0] - lo[0]) * k, (hi[1] - lo[1]) * k, (hi[2] - lo[2]) * k];
    var gridDims = function (v) {
      return [Math.max(2, Math.round(ext[0] / v)), Math.max(2, Math.round(ext[1] / v)), Math.max(2, Math.round(ext[2] / v))];
    };
    var d = gridDims(vox), pts = (d[0] + 3) * (d[1] + 3) * (d[2] + 3), guard = 0;
    while (pts > cap && guard++ < 40) {
      vox *= Math.pow(pts / cap, 1 / 3) * 1.02;
      d = gridDims(vox); pts = (d[0] + 3) * (d[1] + 3) * (d[2] + 3);
    }
    // The wall must span at least 1.5 sample spacings or the mesh breaks up. If the point budget
    // forces a coarser spacing than that, say so instead of returning a broken mesh.
    var vLimit = thick / 1.5, perCell = Math.pow(period / vLimit, 3);
    var cellEq = (patch || modelMode) ? 1 : (mode === 'cube' ? 0.125 : p.nx * p.ny * p.nz);
    maxCells = Math.floor(cap / perCell);
    var maxSize = 0;
    if (modelMode) {
      var ptsLim = (ext[0] / vLimit + 3) * (ext[1] / vLimit + 3) * (ext[2] / vLimit + 3);
      maxSize = size * Math.cbrt(cap / ptsLim);
    }
    if (vox > vLimit * 1.001) {
      return {
        tooBig: true, maxCells: maxCells, maxSize: maxSize, requested: cellEq, triangles: 0, vertices: 0, volume: 0, voxel: vox, thin: false,
        positions: new Float32Array(0), normals: new Float32Array(0), indices: new Uint32Array(0), canon: new Uint32Array(0), size: [0, 0, 0], grid: [0, 0, 0]
      };
    }
    var Px = d[0] + 3, Py = d[1] + 3, Pz = d[2] + 3;
    grid = [Px, Py, Pz]; thin = false;
    var step = [(hi[0] - lo[0]) / d[0], (hi[1] - lo[1]) / d[1], (hi[2] - lo[2]) / d[2]];
    var axis = function (a, n) {
      var c = new Float64Array(n), s = new Float64Array(n), x = new Float64Array(n);
      for (var i = 0; i < n; i++) { x[i] = lo[a] + (i - 1) * step[a]; c[i] = Math.cos(x[i]); s[i] = Math.sin(x[i]); }
      return { x: x, c: c, s: s };
    };
    var AX = axis(0, Px), AY = axis(1, Py), AZ = axis(2, Pz);

    // sample: s > 0 inside the wall. Grid points on the cut planes keep their real value, and the
    // one-point padding layer outside the box is strongly negative, so cut faces land exactly on
    // the planes and the wall is not eroded near them.
    var field = new Float32Array(Px * Py * Pz), idx = 0, dField = null;
    if (modelMode) {
      // Uploaded shape: field = min(wall, signed distance to the shape), in radians.
      var NP = Px * Py * Pz, nTri = Mpos.length / 9;
      var gx0 = AX.x[0] * k + mc0[0], gy0 = AY.x[0] * k + mc0[1], gz0 = AZ.x[0] * k + mc0[2];
      var sxm = step[0] * k, sym = step[1] * k, szm = step[2] * k;
      var BAND = (thick / 2) + 2 * Math.max(sxm, sym, szm);
      var dmin = new Float32Array(NP).fill(BAND), tt, i2, j2, k2, ia, ja, ka;
      // (a) distance to the surface, exact near it
      var Q = [0, 0, 0];
      var closest2 = function (px, py, pz, ax, ay, az, bx2, by2, bz2, cx2, cy2, cz2) {
        var abx = bx2 - ax, aby = by2 - ay, abz = bz2 - az, acx = cx2 - ax, acy = cy2 - ay, acz = cz2 - az;
        var apx = px - ax, apy = py - ay, apz = pz - az;
        var d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz, qx, qy, qz, v, w;
        if (d1 <= 0 && d2 <= 0) { qx = ax; qy = ay; qz = az; }
        else {
          var bpx = px - bx2, bpy = py - by2, bpz = pz - bz2, d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
          if (d3 >= 0 && d4 <= d3) { qx = bx2; qy = by2; qz = bz2; }
          else {
            var vc = d1 * d4 - d3 * d2;
            if (vc <= 0 && d1 >= 0 && d3 <= 0) { v = d1 / (d1 - d3); qx = ax + v * abx; qy = ay + v * aby; qz = az + v * abz; }
            else {
              var cpx = px - cx2, cpy = py - cy2, cpz = pz - cz2, d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
              if (d6 >= 0 && d5 <= d6) { qx = cx2; qy = cy2; qz = cz2; }
              else {
                var vb = d5 * d2 - d1 * d6;
                if (vb <= 0 && d2 >= 0 && d6 <= 0) { w = d2 / (d2 - d6); qx = ax + w * acx; qy = ay + w * acy; qz = az + w * acz; }
                else {
                  var va = d3 * d6 - d5 * d4;
                  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) { w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); qx = bx2 + w * (cx2 - bx2); qy = by2 + w * (cy2 - by2); qz = bz2 + w * (cz2 - bz2); }
                  else { var den = 1 / (va + vb + vc); v = vb * den; w = vc * den; qx = ax + abx * v + acx * w; qy = ay + aby * v + acy * w; qz = az + abz * v + acz * w; }
                }
              }
            }
          }
        }
        var ex = px - qx, ey = py - qy, ez = pz - qz;
        return ex * ex + ey * ey + ez * ez;
      };
      for (tt = 0; tt < nTri; tt++) {
        var o9 = tt * 9, ax1 = Mpos[o9], ay1 = Mpos[o9+1], az1 = Mpos[o9+2], bx1 = Mpos[o9+3], by1 = Mpos[o9+4], bz1 = Mpos[o9+5], cx1 = Mpos[o9+6], cy1 = Mpos[o9+7], cz1 = Mpos[o9+8];
        var i0 = Math.max(0, Math.floor((Math.min(ax1, bx1, cx1) - BAND - gx0) / sxm)), i1 = Math.min(Px - 1, Math.ceil((Math.max(ax1, bx1, cx1) + BAND - gx0) / sxm));
        var j0 = Math.max(0, Math.floor((Math.min(ay1, by1, cy1) - BAND - gy0) / sym)), j1 = Math.min(Py - 1, Math.ceil((Math.max(ay1, by1, cy1) + BAND - gy0) / sym));
        var k0 = Math.max(0, Math.floor((Math.min(az1, bz1, cz1) - BAND - gz0) / szm)), k1 = Math.min(Pz - 1, Math.ceil((Math.max(az1, bz1, cz1) + BAND - gz0) / szm));
        for (i2 = i0; i2 <= i1; i2++) for (j2 = j0; j2 <= j1; j2++) {
          var rowBase = (i2 * Py + j2) * Pz;
          for (k2 = k0; k2 <= k1; k2++) {
            var dd = closest2(gx0 + i2 * sxm, gy0 + j2 * sym, gz0 + k2 * szm, ax1, ay1, az1, bx1, by1, bz1, cx1, cy1, cz1);
            if (dd < dmin[rowBase + k2] * dmin[rowBase + k2]) dmin[rowBase + k2] = Math.sqrt(dd);
          }
        }
      }
      // (b) inside or outside: signed crossings of a +x ray through every (y, z) column
      var cols = new Array(Py * Pz), e1 = 0.000731 * sym, e2 = 0.000517 * szm;
      for (tt = 0; tt < nTri; tt++) {
        var o = tt * 9, Ay = Mpos[o+1], Az = Mpos[o+2], By = Mpos[o+4], Bz = Mpos[o+5], Cy = Mpos[o+7], Cz = Mpos[o+8];
        var ux = Mpos[o+3] - Mpos[o], uy = By - Ay, uz = Bz - Az, vx = Mpos[o+6] - Mpos[o], vy = Cy - Ay, vz = Cz - Az;
        var nxx = uy * vz - uz * vy, nyy = uz * vx - ux * vz, nzz = ux * vy - uy * vx;
        if (Math.abs(nxx) < 1e-14) continue;
        var pd = nxx * Mpos[o] + nyy * Ay + nzz * Az;
        var jlo = Math.max(0, Math.ceil((Math.min(Ay, By, Cy) - gy0 - e1) / sym)), jhi = Math.min(Py - 1, Math.floor((Math.max(Ay, By, Cy) - gy0 - e1) / sym));
        var klo = Math.max(0, Math.ceil((Math.min(Az, Bz, Cz) - gz0 - e2) / szm)), khi = Math.min(Pz - 1, Math.floor((Math.max(Az, Bz, Cz) - gz0 - e2) / szm));
        var det = (By - Ay) * (Cz - Az) - (Bz - Az) * (Cy - Ay);
        if (Math.abs(det) < 1e-18) continue;
        for (ja = jlo; ja <= jhi; ja++) for (ka = klo; ka <= khi; ka++) {
          var py = gy0 + ja * sym + e1, pz = gz0 + ka * szm + e2;
          var l1 = ((py - Ay) * (Cz - Az) - (pz - Az) * (Cy - Ay)) / det, l2 = ((By - Ay) * (pz - Az) - (Bz - Az) * (py - Ay)) / det;
          if (l1 < 0 || l2 < 0 || l1 + l2 > 1) continue;
          var xhit = (pd - nyy * py - nzz * pz) / nxx, ci2 = ja * Pz + ka;
          if (!cols[ci2]) cols[ci2] = [];
          cols[ci2].push(xhit, nxx < 0 ? 1 : -1);
        }
      }
      dField = new Float32Array(NP);
      var jk;
      for (jk = 0; jk < Py * Pz; jk++) {
        var cl = cols[jk], jIdx = (jk / Pz) | 0, kIdx = jk - jIdx * Pz, nc = cl ? cl.length / 2 : 0, order = null, ptr = 0, wind = 0;
        if (nc) { order = []; for (var q0 = 0; q0 < nc; q0++) order.push(q0); order.sort(function (a, b) { return cl[a * 2] - cl[b * 2]; }); }
        for (var iIdx = 0; iIdx < Px; iIdx++) {
          var xg = gx0 + iIdx * sxm;
          while (ptr < nc && cl[order[ptr] * 2] < xg) { wind += cl[order[ptr] * 2 + 1]; ptr++; }
          var gi = (iIdx * Py + jIdx) * Pz + kIdx;
          var dsg = dmin[gi] / k; if (dsg < 1e-5) dsg = 1e-5; dField[gi] = wind !== 0 ? dsg : -dsg;
        }
      }
      // (c) combine with the gyroid wall
      for (var ii2 = 0, id2 = 0; ii2 < Px; ii2++) {
        var cxa = AX.c[ii2], sxa = AX.s[ii2];
        for (var jj2 = 0; jj2 < Py; jj2++) {
          var cya = AY.c[jj2], sya = AY.s[jj2];
          for (var kk2 = 0; kk2 < Pz; kk2++, id2++) {
            var cza = AZ.c[kk2], sza = AZ.s[kk2];
            var Fm = cxa * sya + cya * sza + cza * sxa;
            var gxm = -sxa * sya + cza * cxa, gym = cxa * cya - sya * sza, gzm = cya * cza - sza * sxa;
            var gm = Math.sqrt(Math.max(gxm * gxm + gym * gym + gzm * gzm, 1e-6));
            var sw = h - Math.abs(Fm) / gm, dv0 = dField[id2];
            field[id2] = sw < dv0 ? sw : dv0;
          }
        }
      }
      idx = field.length;
    }
    for (var ii = 0; !modelMode && ii < Px; ii++) {
      var x0 = AX.x[ii], cx = AX.c[ii], sx = AX.s[ii], inX = ii >= 1 && ii <= Px - 2;
      for (var jj = 0; jj < Py; jj++) {
        var y0 = AY.x[jj], cy = AY.c[jj], sy = AY.s[jj], inY = jj >= 1 && jj <= Py - 2;
        for (var kk = 0; kk < Pz; kk++, idx++) {
          if (!(inX && inY && kk >= 1 && kk <= Pz - 2)) { field[idx] = -1000; continue; }
          var z0 = AZ.x[kk], cz = AZ.c[kk], sz = AZ.s[kk];
          var F0 = cx * sy + cy * sz + cz * sx;
          var gx = -sx * sy + cz * cx, gy = cx * cy - sy * sz, gz = cy * cz - sz * sx;
          var g = Math.sqrt(Math.max(gx * gx + gy * gy + gz * gz, 1e-6));
          field[idx] = h - Math.abs(F0) / g;
        }
      }
    }

    // marching tetrahedra on the Kuhn subdivision (the same diagonals in every cell, so it stays closed)
    var CO = [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
    var TETS = [[0,1,3,7],[0,1,5,7],[0,2,3,7],[0,2,6,7],[0,4,5,7],[0,4,6,7]];
    var T0 = new Int32Array(Py * Pz * 7).fill(-1), T1 = new Int32Array(Py * Pz * 7).fill(-1);
    var pos = [], tri = [], cv = new Float64Array(8), cd = new Float64Array(8), dvert = [], ci = 0, cj = 0, ck = 0;
    var edgeVertex = function (a, b) {
      var oa = CO[a], ob = CO[b], tbl = oa[0] ? T1 : T0;
      var key = ((cj + oa[1]) * Pz + (ck + oa[2])) * 7 + (b - a - 1), id = tbl[key];
      if (id >= 0) return id;
      var fa = cv[a], fb = cv[b], t = fa / (fa - fb);
      if (t < 0) t = 0; else if (t > 1) t = 1;
      var xa = AX.x[ci + oa[0]], ya = AY.x[cj + oa[1]], za = AZ.x[ck + oa[2]];
      var xb = AX.x[ci + ob[0]], yb = AY.x[cj + ob[1]], zb = AZ.x[ck + ob[2]];
      id = pos.length / 3;
      pos.push(xa + (xb - xa) * t, ya + (yb - ya) * t, za + (zb - za) * t);
      if (modelMode) dvert.push(cd[a] + (cd[b] - cd[a]) * t);
      tbl[key] = id;
      return id;
    };
    var corner = function (c, out) { var o = CO[c]; out[0] = AX.x[ci + o[0]]; out[1] = AY.x[cj + o[1]]; out[2] = AZ.x[ck + o[2]]; };
    var ins = [0, 0, 0, 0], outs = [0, 0, 0, 0], pa = [0, 0, 0];
    var emit = function (e1, e2, e3, nI, nO) { // wind outward: from the inside corners toward the outside ones
      var r0 = 0, r1 = 0, r2 = 0, i;
      for (i = 0; i < nO; i++) { corner(outs[i], pa); r0 += pa[0] / nO; r1 += pa[1] / nO; r2 += pa[2] / nO; }
      for (i = 0; i < nI; i++) { corner(ins[i], pa); r0 -= pa[0] / nI; r1 -= pa[1] / nI; r2 -= pa[2] / nI; }
      var A = e1 * 3, B = e2 * 3, C = e3 * 3;
      var ux = pos[B] - pos[A], uy = pos[B+1] - pos[A+1], uz = pos[B+2] - pos[A+2];
      var vx = pos[C] - pos[A], vy = pos[C+1] - pos[A+1], vz = pos[C+2] - pos[A+2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * r0 + ny * r1 + nz * r2 >= 0) tri.push(e1, e2, e3); else tri.push(e1, e3, e2);
    };
    var slab = Py * Pz;
    for (ci = 0; ci < Px - 1; ci++) {
      for (cj = 0; cj < Py - 1; cj++) {
        for (ck = 0; ck < Pz - 1; ck++) {
          var base = ci * slab + cj * Pz + ck, mn = Infinity, mx = -Infinity;
          for (var c = 0; c < 8; c++) {
            var o = CO[c], v = field[base + o[0] * slab + o[1] * Pz + o[2]];
            cv[c] = v; if (v < mn) mn = v; if (v > mx) mx = v;
            if (modelMode) cd[c] = dField[base + o[0] * slab + o[1] * Pz + o[2]];
          }
          if (mn > 0 || mx <= 0) continue;
          for (var tt2 = 0; tt2 < 6; tt2++) {
            var T = TETS[tt2], nI = 0, nO = 0;
            for (var m = 0; m < 4; m++) { if (cv[T[m]] > 0) ins[nI++] = T[m]; else outs[nO++] = T[m]; }
            if (nI === 0 || nI === 4) continue;
            var a1, b1, f1, f2, f3, f4;
            if (nI === 1) {
              a1 = ins[0];
              f1 = edgeVertex(Math.min(a1, outs[0]), Math.max(a1, outs[0]));
              f2 = edgeVertex(Math.min(a1, outs[1]), Math.max(a1, outs[1]));
              f3 = edgeVertex(Math.min(a1, outs[2]), Math.max(a1, outs[2]));
              emit(f1, f2, f3, nI, nO);
            } else if (nI === 3) {
              a1 = outs[0];
              f1 = edgeVertex(Math.min(a1, ins[0]), Math.max(a1, ins[0]));
              f2 = edgeVertex(Math.min(a1, ins[1]), Math.max(a1, ins[1]));
              f3 = edgeVertex(Math.min(a1, ins[2]), Math.max(a1, ins[2]));
              emit(f1, f2, f3, nI, nO);
            } else {
              a1 = ins[0]; b1 = ins[1];
              var c0 = outs[0], d0 = outs[1];
              f1 = edgeVertex(Math.min(a1, c0), Math.max(a1, c0));
              f2 = edgeVertex(Math.min(a1, d0), Math.max(a1, d0));
              f3 = edgeVertex(Math.min(b1, d0), Math.max(b1, d0));
              f4 = edgeVertex(Math.min(b1, c0), Math.max(b1, c0));
              emit(f1, f2, f3, nI, nO);
              emit(f1, f3, f4, nI, nO);
            }
          }
        }
      }
      var swp = T0; T0 = T1; T1 = swp; T1.fill(-1);
    }

    // drop tiny disconnected specks (the surface can just clip a box corner)
    var nvAll = pos.length / 3, ntAll = tri.length / 3, par = new Int32Array(nvAll), i0;
    for (i0 = 0; i0 < nvAll; i0++) par[i0] = i0;
    var find = function (a) { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    for (var fa0 = 0; fa0 < ntAll; fa0++) {
      var q0 = find(tri[fa0*3]), q1 = find(tri[fa0*3+1]), q2 = find(tri[fa0*3+2]);
      par[q1] = q0; par[find(q2)] = q0;
    }
    var cnt = new Int32Array(nvAll), biggest = 0;
    for (var fa1 = 0; fa1 < ntAll; fa1++) cnt[find(tri[fa1*3])]++;
    for (i0 = 0; i0 < nvAll; i0++) if (cnt[i0] > biggest) biggest = cnt[i0];
    var thr = biggest * (modelMode ? 0.004 : 0.02), vmap = new Int32Array(nvAll).fill(-1), dkeep = [];
    for (var fa2 = 0; fa2 < ntAll; fa2++) {
      if (cnt[find(tri[fa2*3])] < thr) continue;
      for (var e3 = 0; e3 < 3; e3++) {
        var ov = tri[fa2*3+e3];
        if (vmap[ov] < 0) { vmap[ov] = rp.length / 3; rp.push(pos[ov*3], pos[ov*3+1], pos[ov*3+2]); if (modelMode) dkeep.push(dvert[ov]); }
        rt.push(vmap[ov]);
      }
    }
    // cut faces: triangles whose three corners all sit on one box plane. Snap them exactly onto it.
    var nv0 = rp.length / 3, pmask = new Uint8Array(nv0), n0;
    var capTol = 0.15 * Math.max(step[0], step[1], step[2]);
    for (n0 = 0; n0 < nv0; n0++) {
      if (modelMode) { pmask[n0] = Math.abs(dkeep[n0]) < capTol ? 1 : 0; continue; }
      var m2 = 0;
      for (var ax = 0; ax < 3; ax++) {
        var cval = rp[n0*3+ax];
        if (Math.abs(cval - lo[ax]) < TOL) { m2 |= 1 << (ax * 2); rp[n0*3+ax] = lo[ax]; }
        else if (Math.abs(cval - hi[ax]) < TOL) { m2 |= 2 << (ax * 2); rp[n0*3+ax] = hi[ax]; }
      }
      pmask[n0] = m2;
    }
    var nt0 = rt.length / 3;
    isCap = new Uint8Array(nt0);
    for (var f3 = 0; f3 < nt0; f3++) isCap[f3] = (pmask[rt[f3*3]] & pmask[rt[f3*3+1]] & pmask[rt[f3*3+2]]) !== 0 ? 1 : 0;
  }

  /* ===================== shared finishing steps ===================== */
  var nv = rp.length / 3, nt = rt.length / 3, f, e2;
  // vertices shared by a cut/rim face and the wall get a second copy, so shading keeps a crisp edge there
  var wallTouch = new Uint8Array(nv), capTouch = new Uint8Array(nv);
  for (f = 0; f < nt; f++) {
    var arr = isCap[f] ? capTouch : wallTouch;
    arr[rt[f*3]] = 1; arr[rt[f*3+1]] = 1; arr[rt[f*3+2]] = 1;
  }
  var dup = new Int32Array(nv).fill(-1), nvOut = nv, n1;
  for (n1 = 0; n1 < nv; n1++) {
    if (!p.noSplit && wallTouch[n1] && capTouch[n1]) { dup[n1] = nvOut++; rp.push(rp[n1*3], rp[n1*3+1], rp[n1*3+2]); }
  }
  var I = new Uint32Array(rt.length);
  for (f = 0; f < nt; f++) {
    for (e2 = 0; e2 < 3; e2++) {
      var vi = rt[f*3+e2];
      I[f*3+e2] = (isCap[f] && dup[vi] >= 0) ? dup[vi] : vi;
    }
  }

  // millimetres, print orientation (patch: base down, apex up), centred on the plate
  var P = new Float32Array(nvOut * 3), Hz = L * k, n;
  var bmin = [Infinity, Infinity, Infinity], bmax = [-Infinity, -Infinity, -Infinity];
  for (n = 0; n < nvOut; n++) {
    var X = rp[n*3] * k, Y = rp[n*3+1] * k, Z = rp[n*3+2] * k, ox, oy, oz;
    if (patch) { ox = X; oy = Z; oz = Hz - Y; } else { ox = X; oy = Y; oz = Z; }
    P[n*3] = ox; P[n*3+1] = oy; P[n*3+2] = oz;
    if (ox < bmin[0]) bmin[0] = ox; if (ox > bmax[0]) bmax[0] = ox;
    if (oy < bmin[1]) bmin[1] = oy; if (oy > bmax[1]) bmax[1] = oy;
    if (oz < bmin[2]) bmin[2] = oz; if (oz > bmax[2]) bmax[2] = oz;
  }
  if (nvOut === 0) { bmin = [0, 0, 0]; bmax = [0, 0, 0]; }
  var sx0 = (bmin[0] + bmax[0]) / 2, sy0 = (bmin[1] + bmax[1]) / 2, sz0 = bmin[2];
  for (n = 0; n < nvOut; n++) { P[n*3] -= sx0; P[n*3+1] -= sy0; P[n*3+2] -= sz0; }

  // smooth normals per vertex (cut and rim faces keep their own copies), and volume
  var N = new Float32Array(nvOut * 3), vol = 0;
  for (f = 0; f < nt; f++) {
    var ia = I[f*3] * 3, ib = I[f*3+1] * 3, ic = I[f*3+2] * 3;
    var ax2 = P[ia], ay2 = P[ia+1], az2 = P[ia+2];
    var bx2 = P[ib], by2 = P[ib+1], bz2 = P[ib+2];
    var cx2 = P[ic], cy2 = P[ic+1], cz2 = P[ic+2];
    var ex = bx2 - ax2, ey = by2 - ay2, ez = bz2 - az2, fx = cx2 - ax2, fy = cy2 - ay2, fz = cz2 - az2;
    var nx2 = ey * fz - ez * fy, ny2 = ez * fx - ex * fz, nz2 = ex * fy - ey * fx;
    N[ia] += nx2; N[ia+1] += ny2; N[ia+2] += nz2;
    N[ib] += nx2; N[ib+1] += ny2; N[ib+2] += nz2;
    N[ic] += nx2; N[ic+1] += ny2; N[ic+2] += nz2;
    vol += (ax2 * (by2 * cz2 - bz2 * cy2) - ay2 * (bx2 * cz2 - bz2 * cx2) + az2 * (bx2 * cy2 - by2 * cx2)) / 6;
  }
  for (n = 0; n < nvOut; n++) {
    var l = Math.sqrt(N[n*3] * N[n*3] + N[n*3+1] * N[n*3+1] + N[n*3+2] * N[n*3+2]) || 1;
    N[n*3] /= l; N[n*3+1] /= l; N[n*3+2] /= l;
  }
  var canon = new Uint32Array(nvOut);
  for (n = 0; n < nvOut; n++) canon[n] = n;
  for (n = 0; n < nv; n++) if (dup[n] >= 0) canon[dup[n]] = n;
  return {
    positions: P, normals: N, indices: I, canon: canon,
    size: [bmax[0] - bmin[0], bmax[1] - bmin[1], bmax[2] - bmin[2]],
    volume: vol, triangles: nt, vertices: nvOut, voxel: vox, grid: grid, thin: thin, maxCells: maxCells
  };
}
