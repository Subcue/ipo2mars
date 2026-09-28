# Builds the atlas 3D assets with Blender (headless) and exports GLBs.
#
#   /Applications/Blender.app/Contents/MacOS/Blender \
#     --background --factory-startup --python tools/blender/build_assets.py
#
# Then (optional, ~15% smaller) quantize normals and UVs. Positions stay
# float: the in-app shaders read object-space metres (weld seams, dust).
#
#   for f in public/models/*.glb; do
#     npx --yes @gltf-transform/cli@4 quantize "$f" "$f" --pattern NORMAL
#     npx --yes @gltf-transform/cli@4 quantize "$f" "$f" --pattern TEXCOORD_0
#   done
#
# Reproducible source of truth for public/models/*.glb. Every design here is an
# original stylized model (compliance: not official SpaceX geometry).
#
# UNITS: meters. The app scales each GLB into the stage (src/client/atlas).
#
# COORDINATES: Blender is Z-up. Vehicles stand along +Z with the tail at z=0
# (landed variants: the footpads at z=0). The glTF exporter (export_yup) turns
# that into three.js +Y-up. The windward/heat-shield side of every Starship is
# Blender -Y, which lands on three.js +Z.
#
# Everything is generated through one Builder per asset (a single bmesh with
# material slots), so each GLB is ONE mesh with one primitive per material:
# a handful of draw calls instead of hundreds, and all vertices share the
# asset's own space (the in-app shaders read object-space height for weld
# seams and surface dust).

import json
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
OUT_DIR = os.path.join(ROOT, 'public', 'models')
with open(os.path.join(ROOT, 'src', 'client', 'atlas', 'bases', 'layout.json')) as fh:
    LAYOUT = json.load(fh)

TAU = math.tau


# ------------------------------------------------------------------ basics ---

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _MATS.clear()


_MATS = {}


def mat(name, color=(0.8, 0.8, 0.8), metallic=0.0, roughness=0.5, emission=None, strength=0.0, alpha=1.0):
    """Factor-only Principled material, cached by name. No texture nodes on
    purpose: the look (brushed steel, hex tiles, cell grids, dust) is applied
    in-app by material NAME (src/client/atlas/materials.ts), where the glTF
    exporter cannot silently drop it."""
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if emission is not None:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1.0)
        bsdf.inputs['Emission Strength'].default_value = strength
    if alpha < 1.0:
        bsdf.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    _MATS[name] = m
    return m


def lcg(seed):
    """Deterministic PRNG (no `random`: every build is byte-stable)."""
    state = [seed & 0x7fffffff]

    def nxt():
        state[0] = (state[0] * 1103515245 + 12345) & 0x7fffffff
        return state[0] / 0x7fffffff
    return nxt


def T(x=0.0, y=0.0, z=0.0):
    return Matrix.Translation((x, y, z))


def Rz(a):
    return Matrix.Rotation(a, 4, 'Z')


def Rx(a):
    return Matrix.Rotation(a, 4, 'X')


def Ry(a):
    return Matrix.Rotation(a, 4, 'Y')


def S(x, y=None, z=None):
    y = x if y is None else y
    z = x if z is None else z
    return Matrix.Diagonal((x, y, z, 1.0))


def frame_between(p1, p2):
    """Matrix mapping local +Z (length 1 along z in [0, 1]) onto p1->p2."""
    a, b = Vector(p1), Vector(p2)
    d = b - a
    q = d.normalized().to_track_quat('Z', 'Y')
    return T(*a) @ q.to_matrix().to_4x4() @ S(1, 1, d.length)


class Builder:
    """Accumulates one asset into a single bmesh with material slots."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new('UVMap')
        self.mats = []

    def mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def v(self, co, M=None):
        p = Vector(co)
        if M is not None:
            p = M @ p
        return self.bm.verts.new(p)

    def f(self, verts, uvs, m, smooth=True):
        face = self.bm.faces.new(verts)
        face.material_index = self.mi(m)
        face.smooth = smooth
        for loop, uv in zip(face.loops, uvs):
            loop[self.uv].uv = uv
        return face

    def append_bm(self, src, m, M=None, smooth=None, uv_src=True):
        """Merge another bmesh (a temp primitive) into the asset."""
        vmap = {}
        for vert in src.verts:
            vmap[vert] = self.v(vert.co, M)
        src_uv = src.loops.layers.uv.active if uv_src else None
        for face in src.faces:
            uvs = [tuple(l[src_uv].uv) if src_uv else (0.0, 0.0) for l in face.loops]
            try:
                self.f([vmap[l.vert] for l in face.loops], uvs, m,
                       face.smooth if smooth is None else smooth)
            except ValueError:
                pass
        # carry sharp flags
        for e in src.edges:
            if not e.smooth:
                a, b = vmap[e.verts[0]], vmap[e.verts[1]]
                ne = self.bm.edges.get((a, b))
                if ne:
                    ne.smooth = False

    def append_object(self, ob, m, M=None, smooth=None):
        """Merge an evaluated Blender object (modifiers applied) and delete it."""
        dg = bpy.context.evaluated_depsgraph_get()
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        tmp = bmesh.new()
        tmp.from_mesh(me)
        tmp.transform(ob.matrix_world)
        if not tmp.loops.layers.uv.active:
            tmp.loops.layers.uv.new('UVMap')
        self.append_bm(tmp, m, M, smooth)
        tmp.free()
        ev.to_mesh_clear()
        bpy.data.objects.remove(ob, do_unlink=True)

    def finish(self, sharp_angle=math.radians(40)):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-6)
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.collection.objects.link(ob)
        # Hard creases on smooth faces only where the geometry folds sharply;
        # explicit sharp edges set by the primitives are kept.
        try:
            me.set_sharp_from_angle(angle=sharp_angle, keep_sharp_edges=True)
        except TypeError:
            me.set_sharp_from_angle(angle=sharp_angle)
        return ob


# ------------------------------------------------------------- primitives ---

def lathe(b, profile, segs, material, M=None, phase=0.0, u_repeat=1.0, v_scale=None,
          sharp=(), flip=False, smooth=True):
    """Surface of revolution around local +Z. `profile` is [(r, z)], and
    `material` is a material or fn(angle, z) -> material (per face). UVs: u
    wraps once around (x u_repeat), v is arc length scaled so texels are square
    on the widest ring. Returns the rings."""
    rmax = max(r for r, _ in profile) or 1.0
    vs = v_scale if v_scale is not None else 1.0 / (TAU * rmax)
    arc = [0.0]
    for i in range(1, len(profile)):
        (r0, z0), (r1, z1) = profile[i - 1], profile[i]
        arc.append(arc[-1] + math.hypot(r1 - r0, z1 - z0))
    rings = []
    for r, z in profile:
        if r < 1e-9:
            rings.append([b.v((0.0, 0.0, z), M)])
        else:
            rings.append([b.v((r * math.cos(phase + TAU * j / segs), r * math.sin(phase + TAU * j / segs), z), M)
                          for j in range(segs)])
    mfn = material if callable(material) else (lambda a, z, _m=material: _m)
    for i in range(len(profile) - 1):
        A, B = rings[i], rings[i + 1]
        if len(A) == 1 and len(B) == 1:
            continue
        v0, v1 = arc[i] * vs, arc[i + 1] * vs
        zc = (profile[i][1] + profile[i + 1][1]) / 2
        for j in range(segs):
            j2 = (j + 1) % segs
            u0, u1 = j / segs * u_repeat, (j + 1) / segs * u_repeat
            m = mfn(phase + TAU * (j + 0.5) / segs, zc)
            if len(A) == 1:
                # fan from a bottom pole (the quad [A, A, B[j2], B[j]] collapsed)
                vs_, uvs = [A[0], B[j2], B[j]], [((u0 + u1) / 2, v0), (u1, v1), (u0, v1)]
            elif len(B) == 1:
                vs_, uvs = [A[j], A[j2], B[0]], [(u0, v0), (u1, v0), ((u0 + u1) / 2, v1)]
            else:
                vs_, uvs = [A[j], A[j2], B[j2], B[j]], [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
            if flip:
                vs_, uvs = vs_[::-1], uvs[::-1]
            try:
                b.f(vs_, uvs, m, smooth)
            except ValueError:
                pass
    for i in sharp:
        ring = rings[i]
        if len(ring) > 1:
            for j in range(len(ring)):
                e = b.bm.edges.get((ring[j], ring[(j + 1) % len(ring)]))
                if e:
                    e.smooth = False
    return rings


def cylinder(b, r, z0, z1, segs, material, M=None, caps=True, phase=0.0, r_top=None):
    rt = r if r_top is None else r_top
    prof = [(r, z0), (rt, z1)]
    sharp = ()
    if caps:
        prof = [(0.0, z0)] + prof + [(0.0, z1)]
        sharp = (1, 2)
    lathe(b, prof, segs, material, M, phase=phase, sharp=sharp)


def sphere(b, r, segs, material, M=None, rings=None, z_cut=None, squash=1.0):
    """UV sphere (or a dome: z_cut=0 keeps only z >= 0, capped flat)."""
    n = rings or max(6, segs // 2)
    prof = []
    for i in range(n + 1):
        t = -math.pi / 2 + math.pi * i / n
        z = r * math.sin(t) * squash
        if z_cut is not None and z < z_cut:
            continue
        prof.append((r * math.cos(t), z))
    if z_cut is not None:
        # close the bottom of the dome
        rz = math.sqrt(max(r * r - (z_cut / squash) ** 2, 0.0))
        prof = [(0.0, z_cut), (rz, z_cut)] + [p for p in prof if p[1] > z_cut + 1e-9]
        lathe(b, prof, segs, material, M, sharp=(1,))
    else:
        prof[0] = (0.0, prof[0][1])
        prof[-1] = (0.0, prof[-1][1])
        lathe(b, prof, segs, material, M)


def box(b, sx, sy, sz, material, M=None, bevel=0.0, bevel_segs=1, uv='world', uv_scale=1.0):
    """Axis box centered at the origin (then M). uv='unit' maps every face
    to [0,1]^2 (solar panels); 'world' maps metres * uv_scale."""
    tmp = bmesh.new()
    uvl = tmp.loops.layers.uv.new('UVMap')
    bmesh.ops.create_cube(tmp, size=1.0)
    for vert in tmp.verts:
        vert.co.x *= sx
        vert.co.y *= sy
        vert.co.z *= sz
    if bevel > 0:
        bmesh.ops.bevel(tmp, geom=list(tmp.edges), offset=bevel, segments=bevel_segs,
                        affect='EDGES', profile=0.5, clamp_overlap=True)
    for face in tmp.faces:
        face.smooth = False
        n = face.normal
        ax = max(range(3), key=lambda k: abs(n[k]))
        i, j = [(1, 2), (0, 2), (0, 1)][ax]
        size = (sx, sy, sz)
        for loop in face.loops:
            c = loop.vert.co
            if uv == 'unit':
                loop[uvl].uv = (c[i] / size[i] + 0.5, c[j] / size[j] + 0.5)
            else:
                loop[uvl].uv = (c[i] * uv_scale, c[j] * uv_scale)
    b.append_bm(tmp, material, M)
    tmp.free()


def strut(b, p1, p2, r, material, segs=6, caps=False):
    cylinder(b, r, 0.0, 1.0, segs, material, frame_between(p1, p2) @ S(1, 1, 1), caps=caps)


def torus(b, R, r, material, M=None, segs=48, tsegs=10, arc=TAU):
    full = abs(arc - TAU) < 1e-6
    rings = []
    n_major = segs if full else segs + 1
    for i in range(n_major):
        a = arc * i / segs
        ring = []
        for j in range(tsegs):
            t = TAU * j / tsegs
            rr = R + r * math.cos(t)
            ring.append(b.v((rr * math.cos(a), rr * math.sin(a), r * math.sin(t)), M))
        rings.append(ring)
    for i in range(segs):
        A = rings[i]
        B = rings[(i + 1) % n_major] if full else rings[i + 1]
        for j in range(tsegs):
            j2 = (j + 1) % tsegs
            try:
                b.f([A[j], B[j], B[j2], A[j2]],
                    [(i / segs, j / tsegs), ((i + 1) / segs, j / tsegs), ((i + 1) / segs, (j + 1) / tsegs),
                     (i / segs, (j + 1) / tsegs)], material)
            except ValueError:
                pass


def fillet_polygon(pts, radius, steps=4):
    """Round every corner of a 2D polygon (CCW) with an arc of `radius`
    (clamped per corner)."""
    out = []
    n = len(pts)
    for i in range(n):
        p0 = Vector(pts[i - 1])
        p1 = Vector(pts[i])
        p2 = Vector(pts[(i + 1) % n])
        d0 = (p0 - p1)
        d2 = (p2 - p1)
        l0, l2 = d0.length, d2.length
        if l0 < 1e-9 or l2 < 1e-9:
            out.append(tuple(p1))
            continue
        d0.normalize()
        d2.normalize()
        ang = math.acos(max(-1.0, min(1.0, d0.dot(d2))))
        if ang < 1e-3 or ang > math.pi - 1e-3:
            out.append(tuple(p1))
            continue
        t = radius / math.tan(ang / 2)
        t = min(t, l0 * 0.45, l2 * 0.45)
        a = p1 + d0 * t
        c = p1 + d2 * t
        for k in range(steps + 1):
            s = k / steps
            # quadratic bezier a -> p1 -> c approximates the arc
            q = a * (1 - s) ** 2 + p1 * 2 * (1 - s) * s + c * s * s
            out.append((q.x, q.y))
    return out


def plate(b, outline, thickness, material, mapper, bevel=0.0, material_back=None, material_edge=None):
    """Extruded 2D outline (CCW, (s, t) coords) of `thickness`, placed by
    mapper(s, t, w) -> 3D point (w in [-1, 1] across the thickness)."""
    n = len(outline)
    front = [b.v(mapper(s, t, -1.0)) for s, t in outline]
    back = [b.v(mapper(s, t, 1.0)) for s, t in outline]
    mb = material_back or material
    me = material_edge or material
    uv_f = [(s * 0.1, t * 0.1) for s, t in outline]
    faces = [b.f(front[::-1], uv_f[::-1], material, smooth=False), b.f(back, uv_f, mb, smooth=False)]
    for i in range(n):
        j = (i + 1) % n
        faces.append(b.f([front[i], front[j], back[j], back[i]],
                         [(i / n, 0), ((i + 1) / n, 0), ((i + 1) / n, 1), (i / n, 1)], me, smooth=True))
    # Wind every face outward (the mapper may mirror the outline): three.js
    # culls back faces, so an inward face is simply missing in the app.
    centre = sum((v.co for v in front + back), Vector()) / (2 * n)
    for face in faces:
        face.normal_update()
        if face.normal.dot(face.calc_center_median() - centre) < 0:
            face.normal_flip()


def export_glb(name, ob):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f'{name}.glb')
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_vertex_color='NONE',
        export_materials='EXPORT',
    )
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    print(f'[build_assets] wrote {path}  ({tris} tris, {len(ob.data.materials)} materials)')


# ---------------------------------------------------------------- Starship ---
# ~52 m tall, 9 m diameter. Heat-shield tiles cover the windward (-Y) half,
# flush from the skirt to the nose tip; the lee half is bare stainless.

SHIP_R = 4.5
SHIP_BARREL_TOP = 33.4
SHIP_NOSE_L = 18.6
SHIP_H = SHIP_BARREL_TOP + SHIP_NOSE_L


def nose_profile(R=SHIP_R, L=SHIP_NOSE_L, rn=1.15, z0=SHIP_BARREL_TOP, n_ogive=24, n_cap=7):
    """Spherically blunted tangent ogive, bottom -> tip, as [(r, z)]."""
    rho = (R * R + L * L) / (2 * R)
    xo = L - math.sqrt((rho - rn) ** 2 - (rho - R) ** 2)
    yt = rn * (rho - R) / (rho - rn)
    xt = xo - math.sqrt(rn * rn - yt * yt)
    xa = xo - rn
    pts = []
    # ogive from the base (x = L) up to the tangency point xt (x from tip)
    for i in range(n_ogive + 1):
        x = L - (L - xt) * (i / n_ogive) ** 0.85
        y = math.sqrt(max(rho * rho - (L - x) ** 2, 0.0)) + R - rho
        pts.append((y, z0 + (L - x)))
    # spherical cap from the tangency point to the apex
    for i in range(1, n_cap + 1):
        x = xt + (xa - xt) * i / n_cap
        y = math.sqrt(max(rn * rn - (x - xo) ** 2, 0.0))
        pts.append((y if i < n_cap else 0.0, z0 + (L - x)))
    return pts


def ship_radius_at(z):
    if z <= SHIP_BARREL_TOP:
        return SHIP_R
    prof = nose_profile()
    for (r0, z0), (r1, z1) in zip(prof, prof[1:]):
        if z0 <= z <= z1:
            t = (z - z0) / max(z1 - z0, 1e-9)
            return r0 + (r1 - r0) * t
    return 0.0


def ship_hull(b, tiles_mat, steel_mat, lee_mat=None, lift=0.0, tiles=True):
    """Barrel + nose as one lathe. Faces whose centre is on the -Y half get
    the tile material (a real TPS boundary, not an overlay shell)."""
    lee = lee_mat or steel_mat

    def pick(a, z):
        if tiles and math.sin(a) < 0:
            return tiles_mat
        return lee if z > SHIP_BARREL_TOP + 0.5 and lee_mat else steel_mat

    prof = [(SHIP_R - 0.14, 0.0), (SHIP_R, 0.22)]
    for z in (4.0, 9.0, 15.0, 21.0, 27.0):
        prof.append((SHIP_R, z))
    prof += nose_profile()
    M = T(0, 0, lift)
    lathe(b, prof, 112, pick, M, phase=math.pi / 2, sharp=(1,))
    return prof


def ship_aft_bay(b, lift=0.0, firing_mat=None):
    """Skirt interior, aft heat shield and the six-engine cluster: three
    vacuum Raptors on the outer ring, three sea-level Raptors inside."""
    dark = mat('engine-dark', (0.045, 0.045, 0.05), metallic=0.5, roughness=0.55)
    bell = mat('nozzle', (0.24, 0.2, 0.17), metallic=0.85, roughness=0.38)
    inner = firing_mat or mat('nozzle-inner', (0.09, 0.075, 0.07), metallic=0.6, roughness=0.5)
    M = T(0, 0, lift)
    # skirt inner wall + heat shield disc
    lathe(b, [(SHIP_R - 0.14, 0.0), (SHIP_R - 0.22, 0.0), (SHIP_R - 0.22, 1.9)], 96, dark, M, sharp=(1,), flip=True)
    lathe(b, [(0.0, 1.9), (SHIP_R - 0.22, 1.9)], 96, dark, M)

    def raptor(x, y, r_exit, r_throat, z_exit, length, segs=32):
        prof_out = []
        prof_in = []
        n = 8
        for i in range(n + 1):
            s = i / n
            r = r_throat + (r_exit - r_throat) * (1 - (1 - s) ** 2.2)
            z = z_exit + length * (1 - s)
            prof_out.append((r + 0.035, z))
            prof_in.append((r, z))
        prof_out = prof_out[::-1]  # bottom -> top
        MM = M @ T(x, y, 0)
        lathe(b, prof_out, segs, bell, MM)
        lathe(b, prof_in[::-1], segs, inner, MM, flip=True)
        # exit lip
        lathe(b, [(r_exit, z_exit), (r_exit + 0.035, z_exit)], segs, bell, MM)
        # throat / powerhead stub up into the bay
        cylinder(b, r_throat * 1.9, z_exit + length, z_exit + length + 0.9, 12, dark, MM, caps=False)

    for k in range(3):
        a = math.radians(90 + 120 * k)
        raptor(3.02 * math.cos(a), 3.02 * math.sin(a), 1.16, 0.2, 0.05, 2.75)
    for k in range(3):
        a = math.radians(30 + 120 * k)
        raptor(1.05 * math.cos(a), 1.05 * math.sin(a), 0.66, 0.17, 0.32, 1.45, segs=24)


def ship_flaps(b, tiles_mat, steel_mat, lift=0.0, fwd=True, aft=True):
    """Aft flaps on the sides, forward flaps up on the nose shifted leeward
    (Block-2-like). Each gets a steel aero cover over its hinge."""
    M = T(0, 0, lift)

    def flap(phi, outline, thick, inset=0.12):
        c, s_ = math.cos(phi), math.sin(phi)
        # tangential direction (across the flap thickness)
        tx, ty = -s_, c

        def mapper(s, t, w):
            r = ship_radius_at(t) - inset + s
            p = Vector((r * c + tx * w * thick / 2, r * s_ + ty * w * thick / 2, t))
            return M @ p
        # heat-shield tiles on the windward (-Y) face and the edges, bare
        # steel on the lee face (w=+1 points along +ty)
        lee_is_back = ty > 0
        plate(b, outline, thick, steel_mat if not lee_is_back else tiles_mat, mapper,
              material_back=steel_mat if lee_is_back else tiles_mat, material_edge=tiles_mat)

    def cover(phi, z0, z1, rad, lean=0.0):
        # half-buried capsule along the hull just leeward of the flap root
        steps = 10
        c, s_ = math.cos(phi), math.sin(phi)
        prof = []
        for i in range(steps + 1):
            t = -math.pi / 2 + math.pi * i / steps
            prof.append((rad * math.cos(t), (z0 + z1) / 2 + math.sin(t) * (z1 - z0) / 2))
        prof[0] = (0.0, prof[0][1])
        prof[-1] = (0.0, prof[-1][1])
        # squash radially so it reads as a fairing, not a pipe
        zc = (z0 + z1) / 2
        rc = (ship_radius_at(z0) + ship_radius_at(z1)) / 2
        MM = M @ T(rc * c, rc * s_, 0) @ Rz(phi) @ Ry(lean) @ S(0.55, 1.0, 1.0)
        lathe(b, prof, 20, steel_mat, MM)

    if aft:
        outline = fillet_polygon([
            (0.0, 0.9), (3.6, 0.9), (4.15, 1.4), (4.15, 5.2), (3.3, 8.6), (1.9, 11.6), (0.0, 13.9),
        ], 0.45)
        for phi in (0.0, math.pi):
            flap(phi, outline, 0.34)
            lee = phi + (math.radians(9) if phi == 0.0 else -math.radians(9))
            cover(lee, 1.1, 13.2, 0.62)
    if fwd:
        outline = fillet_polygon([
            (0.0, 35.2), (2.75, 35.5), (2.95, 36.3), (2.35, 40.1), (1.0, 43.7), (0.0, 45.6),
        ], 0.35)
        for phi in (math.radians(18), math.pi - math.radians(18)):
            flap(phi, outline, 0.26, inset=0.1)
            lee = phi + (math.radians(10) if phi < math.pi / 2 else -math.radians(10))
            lean = -0.2 if phi < math.pi / 2 else 0.2
            cover(lee, 35.3, 45.0, 0.42, lean=0.0)


def ship_details(b, steel_mat, lift=0.0, windows=False, qd=True):
    dark = mat('engine-dark', (0.045, 0.045, 0.05), metallic=0.5, roughness=0.55)
    M = T(0, 0, lift)

    def on_hull(phi, z, out=0.0):
        r = ship_radius_at(z) + out
        return M @ T(r * math.cos(phi), r * math.sin(phi), z) @ Rz(phi)

    if qd:
        # propellant quick-disconnect plate on the lee aft skirt
        box(b, 0.22, 1.5, 1.3, dark, on_hull(math.radians(90), 2.4, 0.06), bevel=0.05)
    # RCS pods (paired) near the nose base and the aft
    for phi in (math.radians(62), math.radians(118)):
        for z in (6.2, 31.8):
            box(b, 0.42, 0.7, 0.9, steel_mat, on_hull(phi, z, 0.16), bevel=0.08, bevel_segs=2)
    # catch pins under the forward flaps
    for phi in (math.radians(8), math.pi - math.radians(8)):
        cylinder(b, 0.28, 0.0, 0.7, 12, dark, on_hull(phi, 34.6, -0.1) @ Ry(math.pi / 2))
    if windows:
        glass = mat('window', (1.0, 0.86, 0.62), emission=(1.0, 0.74, 0.42), strength=6.0)
        for k in range(7):
            phi = math.radians(58 + k * 10.5)
            box(b, 0.12, 0.72, 0.52, glass, on_hull(phi, 40.6, 0.0), bevel=0.04)
        for k in range(5):
            phi = math.radians(66 + k * 12)
            box(b, 0.12, 0.66, 0.48, glass, on_hull(phi, 38.6, 0.02), bevel=0.04)


def landing_legs(b, lift, reach=7.6, count=6, phase=math.radians(30)):
    leg = mat('leg', (0.2, 0.2, 0.22), metallic=0.7, roughness=0.45)
    pad = mat('footpad', (0.26, 0.26, 0.28), metallic=0.6, roughness=0.6)
    for k in range(count):
        a = phase + TAU * k / count
        c, s_ = math.cos(a), math.sin(a)
        top = (SHIP_R * 0.98 * c, SHIP_R * 0.98 * s_, lift + 6.2)
        mid = (SHIP_R * 0.98 * c, SHIP_R * 0.98 * s_, lift + 1.4)
        foot = (reach * c, reach * s_, 0.42)
        knee = ((SHIP_R + (reach - SHIP_R) * 0.72) * c, (SHIP_R + (reach - SHIP_R) * 0.72) * s_, 1.3)
        strut(b, top, foot, 0.32, leg, segs=10)
        strut(b, mid, knee, 0.2, leg, segs=8)
        # telescoping lower sleeve
        strut(b, (foot[0] + (top[0] - foot[0]) * 0.35, foot[1] + (top[1] - foot[1]) * 0.35,
                  foot[2] + (top[2] - foot[2]) * 0.35), foot, 0.42, leg, segs=10)
        cylinder(b, 1.0, 0.0, 0.34, 20, pad, T(reach * c, reach * s_, 0.02), r_top=0.85)
        # hinge block on the skirt
        box(b, 0.8, 0.9, 1.1, leg, T(*top) @ Rz(a), bevel=0.1)


def build_starship():
    """Flight Starship (transit): tiles, flaps, six Raptors. Tail at z=0."""
    reset_scene()
    b = Builder('starship')
    steel = mat('steel', (0.8, 0.82, 0.85), metallic=1.0, roughness=0.32)
    tiles = mat('tiles', (0.03, 0.03, 0.034), metallic=0.1, roughness=0.5)
    ship_hull(b, tiles, steel)
    ship_aft_bay(b)
    ship_flaps(b, tiles, steel)
    ship_details(b, steel)
    export_glb('starship', b.finish())


def build_starship_lander():
    """Mars-landed Starship: crew windows, six landing legs, dust-ready.
    Footpads at z=0; the hull is lifted on its legs."""
    reset_scene()
    lift = 2.6
    b = Builder('starship_lander')
    steel = mat('steel', (0.8, 0.82, 0.85), metallic=1.0, roughness=0.32)
    tiles = mat('tiles', (0.03, 0.03, 0.034), metallic=0.1, roughness=0.5)
    ship_hull(b, tiles, steel, lift=lift)
    ship_aft_bay(b, lift=lift)
    ship_flaps(b, tiles, steel, lift=lift)
    ship_details(b, steel, lift=lift, windows=True)
    landing_legs(b, lift)
    export_glb('starship_lander', b.finish())


def build_hls():
    """Lunar lander variant (original design): no flaps, no heat shield, a
    white upper hull, a band of solar arrays, high-mounted landing thrusters,
    an elevator down the side and six legs."""
    reset_scene()
    lift = 2.8
    b = Builder('hls')
    steel = mat('steel', (0.8, 0.82, 0.85), metallic=1.0, roughness=0.32)
    white = mat('hls-white', (0.86, 0.86, 0.85), metallic=0.0, roughness=0.55)
    solar = mat('solar', (0.06, 0.1, 0.22), metallic=0.4, roughness=0.3)
    dark = mat('engine-dark', (0.045, 0.045, 0.05), metallic=0.5, roughness=0.55)
    glass = mat('window', (1.0, 0.86, 0.62), emission=(1.0, 0.74, 0.42), strength=6.0)

    def pick(a, z):
        if 27.8 < z < 33.6:
            return solar
        return white if z > 24.0 else steel

    prof = [(SHIP_R - 0.14, 0.0), (SHIP_R, 0.22)]
    for z in (6.0, 12.0, 18.0, 24.0, 27.8, 33.6):
        prof.append((SHIP_R, z))
    prof += nose_profile()
    rings_prof = [p for p in prof]
    lathe(b, rings_prof, 112, pick, T(0, 0, lift), phase=math.pi / 2, sharp=(1,), u_repeat=24.0,
          v_scale=1.0 / (33.6 - 27.8))
    ship_aft_bay(b, lift=lift)

    def on_hull(phi, z, out=0.0):
        r = ship_radius_at(z) + out
        return T(0, 0, lift) @ T(r * math.cos(phi), r * math.sin(phi), z) @ Rz(phi)

    # landing thruster pods ring, high on the hull
    bell = mat('nozzle', (0.24, 0.2, 0.17), metallic=0.85, roughness=0.38)
    for k in range(4):
        phi = math.radians(45 + 90 * k)
        box(b, 1.3, 2.6, 3.4, white, on_hull(phi, 37.2, 0.5), bevel=0.2, bevel_segs=2)
        for dx in (-0.7, 0.0, 0.7):
            MM = on_hull(phi, 35.2, 0.75) @ T(0, dx, 0)
            lathe(b, [(0.36, -0.6), (0.2, 0.0), (0.0, 0.05)], 16, bell, MM)
    # windows + airlock band
    for k in range(9):
        phi = math.radians(210 + k * 9)
        box(b, 0.12, 0.8, 0.6, glass, on_hull(phi, 43.2, 0.0), bevel=0.04)
    box(b, 0.3, 2.6, 3.2, dark, on_hull(math.radians(270), 35.4, 0.05), bevel=0.08)
    lit = mat('window', (1.0, 0.86, 0.62), emission=(1.0, 0.74, 0.42), strength=6.0)
    box(b, 0.1, 2.2, 2.8, lit, on_hull(math.radians(270), 35.4, 0.22))
    # elevator: twin rails from the airlock to the ground + a platform
    for dy in (-1.5, 1.5):
        rail_top = on_hull(math.radians(270), 34.0, 0.9) @ T(0, dy, 0)
        p1 = rail_top.to_translation()
        p0 = Vector((p1.x, p1.y, 0.2))
        strut(b, tuple(p0), tuple(p1), 0.14, dark, segs=6)
    box(b, 3.0, 3.6, 0.35, steel, T(0, -(SHIP_R + 1.9), 0.4), bevel=0.06)
    box(b, 0.12, 3.6, 1.1, steel, T(0, -(SHIP_R + 3.35), 0.95))
    landing_legs(b, lift, reach=8.0)
    export_glb('hls', b.finish())



# ------------------------------------------------------------ settlements ---
# Positions come from src/client/atlas/bases/layout.json in base-local
# three.js metres (x east, z south); Blender takes (x, -z). A three.js yaw of
# theta is Blender Rz(theta).

def P(x, z, y=0.0):
    return T(x, -z, y)


def place(x, z, rot_deg=0.0, y=0.0):
    return P(x, z, y) @ Rz(math.radians(rot_deg))


def disc_planar(b, r, z, material, M=None, segs=64):
    """Flat disc facing +Z with planar UVs 0..1 (pad markings)."""
    c = b.v((0.0, 0.0, z), M)
    ring = [b.v((r * math.cos(TAU * k / segs), r * math.sin(TAU * k / segs), z), M) for k in range(segs)]
    for k in range(segs):
        k2 = (k + 1) % segs
        a0 = TAU * k / segs
        a1 = TAU * k2 / segs
        b.f([c, ring[k], ring[k2]],
            [(0.5, 0.5), (0.5 + 0.5 * math.cos(a0), 0.5 + 0.5 * math.sin(a0)),
             (0.5 + 0.5 * math.cos(a1), 0.5 + 0.5 * math.sin(a1))], material, smooth=False)


def landing_pad(b, x, z, r, pad_mat, berm_mat):
    M = P(x, z)
    # sintered deck: slightly raised, bevelled rim
    lathe(b, [(0.0, 0.05), (r + 0.6, 0.05), (r + 0.3, 0.32), (r, 0.36)], 72, pad_mat, M, sharp=(1, 2))
    disc_planar(b, r, 0.36, pad_mat, M, segs=72)
    # low blast berm ring around it
    lathe(b, [(r + 13.0, -0.2), (r + 10.0, 1.6), (r + 7.5, 1.4), (r + 5.0, -0.2)], 72, berm_mat, M)


def light_pole(b, x, z, h, frame, lamp):
    M = P(x, z)
    cylinder(b, 0.18, 0.0, h, 8, frame, M)
    box(b, 1.2, 0.5, 0.3, lamp, M @ T(0, 0, h + 0.1))


def hab_dome(b, x, z, r, m, windows=10, door_dir=0.0):
    """Inflatable habitat: a wall ring and a shallow dome, ribbed, half
    buried in a regolith berm, a band of lit windows and an airlock."""
    M = P(x, z)
    wall = 3.2
    prof = [(0.0, 0.0), (r, 0.0), (r, wall)]
    for i in range(1, 13):
        t = (i / 12) * (math.pi / 2)
        prof.append((r * math.cos(t) if i < 12 else 0.0, wall + r * 0.72 * math.sin(t)))
    lathe(b, prof, 48, m['shell'], M, sharp=(1, 2))
    # ribs: meridians + a ring at the shoulder
    for k in range(6):
        a = TAU * k / 6 + 0.2
        pts = []
        for i in range(0, 9):
            t = (i / 8) * (math.pi / 2) * 0.97
            rr = r * math.cos(t) + 0.12
            pts.append((rr * math.cos(a), rr * math.sin(a), wall + r * 0.72 * math.sin(t) + 0.05))
        for p0, p1 in zip(pts, pts[1:]):
            strut(b, tuple(M @ Vector(p0)), tuple(M @ Vector(p1)), 0.16, m['rib'], segs=4)
    torus(b, r + 0.1, 0.22, m['rib'], M @ T(0, 0, wall), segs=48, tsegs=5)
    # regolith berm
    lathe(b, [(r * 1.55, -0.4), (r * 1.3, 1.1), (r * 1.06, 2.4), (r * 1.0, 2.5)], 48, m['regolith'], M)
    # window band on the dome shoulder
    for k in range(windows):
        a = TAU * (k + 0.5) / windows
        t = math.radians(16)
        rr = r * math.cos(t)
        zz = wall + r * 0.72 * math.sin(t)
        box(b, 0.25, 1.7, 0.9, m['window'], M @ T(rr * math.cos(a), rr * math.sin(a), zz) @ Rz(a) @ Ry(math.radians(-24)),
            bevel=0.05)
    # airlock vestibule
    ax, ay = math.cos(door_dir), math.sin(door_dir)
    MM = M @ T(ax * (r + 2.2), ay * (r + 2.2), 0) @ Rz(door_dir)
    box(b, 4.6, 4.0, 3.4, m['shell'], MM @ T(0, 0, 1.7), bevel=0.35, bevel_segs=2)
    box(b, 0.2, 1.8, 2.3, m['window'], MM @ T(2.35, 0, 1.25))


def tunnel(b, x1, z1, x2, z2, r, m):
    a = Vector((x1, -z1, r * 0.75))
    c = Vector((x2, -z2, r * 0.75))
    strut(b, tuple(a), tuple(c), r, m['shell'], segs=16)
    # regolith cover over the top half
    d = (c - a)
    L = d.length
    mid = (a + c) / 2
    ang = math.atan2(d.y, d.x)
    MM = T(mid.x, mid.y, 0) @ Rz(ang)
    box(b, L, r * 2.9, r * 0.9, m['regolith'], MM @ T(0, 0, r * 0.45), bevel=r * 0.4, bevel_segs=3)


def greenhouse(b, x, z, length, width, rot, m):
    """Glazed vault with arched ribs and a warm grow-light floor inside."""
    M = place(x, z, rot)
    R = width / 2
    n = 14
    # vault: half-cylinder along local X, open glazing
    for i in range(n):
        t0 = math.pi * i / n
        t1 = math.pi * (i + 1) / n
        y0, z0 = R * math.cos(t0), R * 0.82 * math.sin(t0) + 1.2
        y1, z1 = R * math.cos(t1), R * 0.82 * math.sin(t1) + 1.2
        v = [b.v((-length / 2, y0, z0), M), b.v((length / 2, y0, z0), M),
             b.v((length / 2, y1, z1), M), b.v((-length / 2, y1, z1), M)]
        b.f(v, [(0, i / n), (1, i / n), (1, (i + 1) / n), (0, (i + 1) / n)], m['glass'])
    # end walls
    for sx in (-1, 1):
        pts = [(sx * length / 2, R * math.cos(math.pi * i / n), R * 0.82 * math.sin(math.pi * i / n) + 1.2) for i in range(n + 1)]
        base = [(sx * length / 2, -R, 0.0), (sx * length / 2, R, 0.0)]
        verts = [b.v(p, M) for p in [base[1]] + pts + [base[0]]]
        if sx < 0:
            verts = verts[::-1]
        try:
            b.f(verts, [(0.5, 0.5)] * len(verts), m['glass'], smooth=False)
        except ValueError:
            pass
    # low plinth wall
    box(b, length, width, 1.2, m['shell'], M @ T(0, 0, 0.6), bevel=0.15)
    # arched ribs
    k = int(length // 6)
    for j in range(k + 1):
        xx = -length / 2 + length * j / k
        pts = [(xx, R * math.cos(math.pi * i / 7) * 1.01, R * 0.82 * math.sin(math.pi * i / 7) * 1.01 + 1.2) for i in range(8)]
        for p0, p1 in zip(pts, pts[1:]):
            strut(b, tuple(M @ Vector(p0)), tuple(M @ Vector(p1)), 0.12, m['frame'], segs=4)
    # grow beds: glowing strips inside
    for yy in (-R * 0.45, 0.0, R * 0.45):
        box(b, length * 0.92, R * 0.3, 0.2, m['grow'], M @ T(0, yy, 1.3))


def solar_rows(b, cx, cz, rows, length, pitch, rot, sun_az, m):
    """Ground-mount rows facing the sun, tilted 38 degrees."""
    M = place(cx, cz, rot)
    for i in range(rows):
        yy = (i - (rows - 1) / 2) * pitch
        MM = M @ T(0, yy, 0) @ Rz(sun_az) if False else M @ T(0, yy, 0)
        # panel slab: UV repeats one module per 2 m along its length
        tilt = math.radians(38)
        panel = MM @ T(0, 0, 2.2) @ Rx(-tilt)
        box(b, length, 4.2, 0.12, m['solar'], panel, uv='world', uv_scale=0.5)
        # posts + rails
        for j in range(int(length // 8) + 1):
            px = -length / 2 + length * j / (length // 8)
            cylinder(b, 0.09, 0.0, 2.2, 4, m['frame'], MM @ T(px, 0, 0), caps=False)
        box(b, length, 0.18, 0.18, m['frame'], MM @ T(0, 0, 2.1))


def sphere_tank(b, x, z, r, m, y=0.0):
    M = P(x, z, y)
    sphere(b, r, 24, m['tank'], M @ T(0, 0, r + 1.8))
    for k in range(4):
        a = TAU * k / 4 + 0.4
        strut(b, tuple(M @ Vector((math.cos(a) * r * 0.7, math.sin(a) * r * 0.7, r * 0.9 + 1.8))),
              tuple(M @ Vector((math.cos(a) * r * 0.95, math.sin(a) * r * 0.95, 0.0))), 0.22, m['frame'], segs=6)
    torus(b, r * 0.72, 0.18, m['frame'], M @ T(0, 0, r + 1.8 - r * 0.7), segs=32, tsegs=6)


def pipe(b, pts, r, m):
    for p0, p1 in zip(pts, pts[1:]):
        strut(b, p0, p1, r, m['pipe'], segs=8)
    for p in pts[1:-1]:
        sphere(b, r * 1.25, 10, m['pipe'], T(*p))


def isru_plant(b, x, z, rot, m):
    M = place(x, z, rot)
    # process building
    box(b, 26, 14, 9, m['shell'], M @ T(0, 0, 4.5), bevel=0.4, bevel_segs=2)
    box(b, 10, 8, 4, m['dark'], M @ T(-6, 0, 11), bevel=0.2)
    for k in range(6):
        box(b, 0.2, 1.6, 0.8, m['window'], M @ T(13.05, -5 + k * 2, 5.5))
    # stacks + flare
    cylinder(b, 0.8, 9.0, 21.0, 12, m['pipe'], M @ T(6, 3, 0))
    cylinder(b, 0.5, 9.0, 16.0, 10, m['pipe'], M @ T(9, 3, 0))
    # spherical LOX/CH4 tanks
    for k, (tx, ty) in enumerate(((24, -12), (36, -12), (24, 12), (36, 12))):
        wx, wy = (M @ Vector((tx, ty, 0)))[:2]
        sphere_tank(b, wx, -wy, 5.2, m)
    # horizontal tanks
    for ty in (-26, -32):
        c = M @ Vector((6, ty, 3.2))
        MM = T(*c) @ Rz(math.radians(rot)) @ Ry(math.pi / 2)
        cylinder(b, 3.0, -9.0, 9.0, 28, m['tank'], MM)
        for dx in (-6, 0, 6):
            box(b, 1.0, 5.0, 1.4, m['frame'], T(*c) @ Rz(math.radians(rot)) @ T(dx, 0, -2.6))
    # radiator wall
    for k in range(6):
        box(b, 0.2, 7.0, 6.0, m['radiator'], M @ T(-22 + k * 0.1, -18 + k * 7.4, 4.5) @ Rz(math.radians(90)))
        cylinder(b, 0.15, 0.0, 7.5, 6, m['frame'], M @ T(-22, -18 + k * 7.4 - 3.6, 0))
    # piping between the plant and tanks
    p0 = tuple(M @ Vector((13, 4, 3)))
    p1 = tuple(M @ Vector((24, 4, 3)))
    p2 = tuple(M @ Vector((24, -12, 3)))
    pipe(b, [p0, p1, p2], 0.45, m)


def reactor(b, x, z, m):
    M = P(x, z)
    lathe(b, [(0.0, 0.0), (7.0, 0.0), (6.5, 1.2), (3.2, 1.3), (0.0, 1.3)], 48, m['regolith'], M)
    cylinder(b, 1.6, 1.2, 6.5, 24, m['tank'], M)
    lathe(b, [(1.6, 6.5), (1.0, 7.6), (0.0, 7.8)], 24, m['tank'], M)
    for k in range(10):
        a = TAU * k / 10
        MM = M @ Rz(a) @ T(3.4, 0, 6.0)
        box(b, 3.4, 0.08, 7.0, m['radiator'], MM @ Ry(math.radians(-14)))
    # fence
    for k in range(24):
        a = TAU * k / 24
        cylinder(b, 0.08, 0.0, 2.2, 4, m['frame'], M @ T(18 * math.cos(a), 18 * math.sin(a), 0), caps=False)
    torus(b, 18.0, 0.06, m['frame'], M @ T(0, 0, 2.1), segs=64, tsegs=4)
    box(b, 0.3, 0.3, 0.3, m['beacon'], M @ T(0, 0, 8.0))


def comms_dish(b, x, z, rot, m):
    M = place(x, z, rot)
    cylinder(b, 1.2, 0.0, 4.0, 16, m['shell'], M)
    box(b, 2.0, 2.0, 1.5, m['dark'], M @ T(0, 0, 4.6))
    # parabolic dish, tilted up toward the sky
    prof = []
    for i in range(0, 11):
        rr = 6.2 * i / 10
        prof.append((rr, rr * rr / (4 * 5.5)))
    prof[0] = (0.0, 0.0)
    D = M @ T(0, 0, 6.2) @ Rx(math.radians(-38))
    lathe(b, prof, 32, m['dish'], D, flip=True)
    lathe(b, [(p[0], p[1] - 0.12) for p in prof][::-1], 32, m['dish'], D, flip=True)
    for k in range(3):
        a = TAU * k / 3
        strut(b, tuple(D @ Vector((5.5 * math.cos(a), 5.5 * math.sin(a), 1.4))), tuple(D @ Vector((0, 0, 4.4))), 0.08, m['frame'], segs=5)
    # lattice mast with a beacon
    mm = M @ T(9, 4, 0)
    for k in range(3):
        a = TAU * k / 3
        strut(b, tuple(mm @ Vector((1.2 * math.cos(a), 1.2 * math.sin(a), 0))), tuple(mm @ Vector((0.3 * math.cos(a), 0.3 * math.sin(a), 30))), 0.12, m['frame'], segs=5)
    for j in range(1, 10):
        zz = j * 3.0
        rr = 1.2 - 0.9 * zz / 30
        torus(b, rr, 0.06, m['frame'], mm @ T(0, 0, zz), segs=8, tsegs=3)
    sphere(b, 0.45, 12, m['beacon'], mm @ T(0, 0, 30.4))


def rover(b, x, z, rot, m, pressurized=True):
    M = place(x, z, rot)
    if pressurized:
        box(b, 8.2, 3.6, 2.8, m['rover'], M @ T(0, 0, 2.6), bevel=0.7, bevel_segs=3)
        box(b, 0.3, 2.8, 1.0, m['window'], M @ T(4.1, 0, 3.1) @ Ry(math.radians(-20)), bevel=0.1)
        for k in range(3):
            box(b, 1.2, 0.1, 0.6, m['window'], M @ T(-1.5 + k * 1.7, 1.82, 3.0))
        box(b, 2.4, 3.0, 0.6, m['solar'], M @ T(-1.8, 0, 4.2), uv='unit')
        wheels = (-2.8, 0.0, 2.8)
    else:
        box(b, 3.4, 2.0, 0.5, m['frame'], M @ T(0, 0, 1.0), bevel=0.1)
        box(b, 0.8, 1.6, 1.0, m['rover'], M @ T(-0.6, 0, 1.6), bevel=0.1)
        wheels = (-1.2, 1.2)
    for wx in wheels:
        for wy in (-1.9, 1.9) if pressurized else (-1.15, 1.15):
            cylinder(b, 0.75 if pressurized else 0.45, -0.35, 0.35, 16, m['tire'],
                     M @ T(wx, wy, 0.75 if pressurized else 0.45) @ Rx(math.pi / 2))


def cargo_stack(b, x, z, rot, m):
    M = place(x, z, rot)
    for i, (dx, dy, dz) in enumerate(((0, 0, 0), (3.2, 0, 0), (0, 2.6, 0), (1.6, 1.3, 2.4))):
        box(b, 3.0, 2.4, 2.3, m['crate'] if i % 2 == 0 else m['shell'], M @ T(dx, dy, dz + 1.15), bevel=0.12)


def settlement_mats(kind):
    mars = kind == 'mars'
    return {
        'shell': mat('hab-shell', (0.84, 0.83, 0.8), roughness=0.55),
        'regolith': mat('regolith', (0.45, 0.26, 0.16) if mars else (0.42, 0.41, 0.4), roughness=1.0),
        'rib': mat('rib', (0.55, 0.56, 0.58), metallic=0.7, roughness=0.4),
        'window': mat('window', (1.0, 0.86, 0.62), emission=(1.0, 0.74, 0.42), strength=6.0),
        'glass': mat('glass', (0.6, 0.7, 0.75), roughness=0.08, alpha=0.35),
        'grow': mat('grow', (1.0, 0.55, 0.85), emission=(1.0, 0.45, 0.8), strength=5.0),
        'solar': mat('solar', (0.06, 0.1, 0.22), metallic=0.4, roughness=0.3),
        'frame': mat('frame', (0.3, 0.31, 0.33), metallic=0.8, roughness=0.45),
        'tank': mat('tank', (0.86, 0.86, 0.84), metallic=0.1, roughness=0.4),
        'pipe': mat('pipe', (0.62, 0.63, 0.65), metallic=0.9, roughness=0.35),
        'radiator': mat('radiator', (0.9, 0.9, 0.9), roughness=0.3),
        'dark': mat('dark', (0.06, 0.06, 0.07), metallic=0.5, roughness=0.6),
        'pad': mat('pad', (0.62, 0.52, 0.46) if mars else (0.6, 0.6, 0.6), roughness=0.9),
        'beacon': mat('beacon', (1.0, 0.1, 0.05), emission=(1.0, 0.1, 0.05), strength=8.0),
        'rover': mat('rover-body', (0.9, 0.89, 0.86), roughness=0.5),
        'tire': mat('tire', (0.05, 0.05, 0.05), roughness=0.9),
        'dish': mat('dish', (0.88, 0.88, 0.88), roughness=0.45),
        'crate': mat('crate', (0.75, 0.42, 0.18), roughness=0.6),
        'lamp': mat('lamp', (1.0, 0.95, 0.85), emission=(1.0, 0.92, 0.8), strength=8.0),
    }


def build_marsbase():
    reset_scene()
    L = LAYOUT['mars']
    b = Builder('marsbase')
    m = settlement_mats('mars')
    for x, z, r in L['pads']:
        landing_pad(b, x, z, r, m['pad'], m['regolith'])
        for k in range(4):
            a = TAU * k / 4 + 0.6
            light_pole(b, x + (r + 18) * math.cos(a), z + (r + 18) * math.sin(a), 11.0, m['frame'], m['lamp'])
    hx, hz = L['hub']
    # central hub: a low drum with a skylight dome
    M = P(hx, hz)
    cylinder(b, 9.5, 0.0, 6.0, 64, m['shell'], M)
    lathe(b, [(9.6, 6.0), (6.0, 7.6), (0.0, 8.4)], 64, m['shell'], M)
    lathe(b, [(10.8 * 1.3, -0.3), (10.8, 2.8), (9.6, 3.0)], 64, m['regolith'], M)
    for k in range(12):
        a = TAU * k / 12
        box(b, 0.2, 1.8, 1.0, m['window'], M @ T(9.55 * math.cos(a), 9.55 * math.sin(a), 4.4) @ Rz(a))
    for dx, dz, r in L['domes']:
        door = math.atan2(-(hz - dz), hx - dx)  # face the hub (Blender axes)
        hab_dome(b, dx, dz, r, m, door_dir=door)
        tunnel(b, hx, hz, dx, dz, 2.2, m)
    for gx, gz, length, width, rot in L['greenhouses']:
        greenhouse(b, gx, gz, length, width, rot, m)
    tunnel(b, hx, hz, L['greenhouses'][0][0], L['greenhouses'][0][1] - 8, 2.0, m)
    s = L['solar']
    solar_rows(b, s['x'], s['z'], s['rows'], s['len'], s['pitch'], s['rot'], 0, m)
    ix, iz, irot = L['isru']
    isru_plant(b, ix, iz, irot, m)
    rx_, rz_ = L['reactor']
    reactor(b, rx_, rz_, m)
    dx, dz, drot = L['dish']
    comms_dish(b, dx, dz, drot, m)
    for i, (vx, vz, vrot) in enumerate(L['rovers']):
        rover(b, vx, vz, vrot, m, pressurized=(i == 0))
    for x, z, r in L['pads']:
        cargo_stack(b, x - r - 22, z + 8, 20, m)
    export_glb('marsbase', b.finish())


def moon_dome(b, x, z, r, m, door_dir=0.0):
    """Inflatable dome under a 3D-printed regolith shell of open cells."""
    M = P(x, z)
    # inner pressure dome (white)
    prof = [(0.0, 0.0), (r * 0.92, 0.0)]
    for i in range(1, 13):
        t = (i / 12) * (math.pi / 2)
        prof.append((r * 0.92 * math.cos(t) if i < 12 else 0.0, r * 0.84 * math.sin(t)))
    lathe(b, prof, 64, m['shell'], M, sharp=(1,))
    # cellular shell: icosphere wireframe cut to a hemisphere
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=r, location=(0, 0, 0))
    ob = bpy.context.active_object
    ob.scale = (1.0, 1.0, 0.95)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.bisect(plane_co=(0, 0, -0.4), plane_no=(0, 0, 1), clear_inner=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    wf = ob.modifiers.new('cells', 'WIREFRAME')
    wf.thickness = 0.9
    wf.use_even_offset = True
    ob.matrix_world = M @ ob.matrix_world
    b.append_object(ob, m['regolith'], smooth=True)
    # footing ring + berm
    lathe(b, [(r * 1.25, -0.3), (r * 1.06, 1.0), (r * 0.98, 1.1)], 64, m['regolith'], M)
    # airlock with a lit door
    ax, ay = math.cos(door_dir), math.sin(door_dir)
    MM = M @ T(ax * (r + 1.8), ay * (r + 1.8), 0) @ Rz(door_dir)
    box(b, 4.2, 3.6, 3.2, m['shell'], MM @ T(0, 0, 1.6), bevel=0.3, bevel_segs=2)
    box(b, 0.2, 1.6, 2.2, m['window'], MM @ T(2.15, 0, 1.2))


def solar_tower(b, x, z, h, sun_yaw, m):
    """Vertical solar array on a lattice mast: at the lunar poles the sun
    skims the horizon, so the panels stand up tall and track it."""
    M = P(x, z)
    for k in range(3):
        a = TAU * k / 3
        strut(b, tuple(M @ Vector((1.4 * math.cos(a), 1.4 * math.sin(a), 0))),
              tuple(M @ Vector((0.4 * math.cos(a), 0.4 * math.sin(a), h))), 0.14, m['frame'], segs=5)
    for j in range(1, int(h // 3)):
        zz = j * 3.0
        rr = 1.4 - 1.0 * zz / h
        torus(b, rr, 0.07, m['frame'], M @ T(0, 0, zz), segs=8, tsegs=3)
    lathe(b, [(2.0, -0.2), (1.6, 0.8), (0.0, 0.9)], 16, m['dark'], M)
    PM = M @ T(0, 0, h) @ Rz(sun_yaw)
    box(b, 0.25, 5.0, 18.0, m['solar'], PM @ T(0, 0, 9.0), uv='world', uv_scale=0.5)
    box(b, 0.5, 5.4, 0.3, m['frame'], PM @ T(0, 0, 0.1))
    box(b, 0.5, 5.4, 0.3, m['frame'], PM @ T(0, 0, 18.0))


def build_moonbase():
    reset_scene()
    L = LAYOUT['moon']
    b = Builder('moonbase')
    m = settlement_mats('moon')
    for x, z, r in L['pads']:
        landing_pad(b, x, z, r, m['pad'], m['regolith'])
        for k in range(3):
            a = TAU * k / 3 + 0.9
            light_pole(b, x + (r + 16) * math.cos(a), z + (r + 16) * math.sin(a), 9.0, m['frame'], m['lamp'])
    hx, hz = L['hub']
    M = P(hx, hz)
    cylinder(b, 7.0, 0.0, 4.2, 48, m['shell'], M)
    lathe(b, [(7.1, 4.2), (4.5, 5.4), (0.0, 5.9)], 48, m['shell'], M)
    lathe(b, [(7.0 * 1.45, -0.3), (7.4, 2.4), (7.0, 2.6)], 48, m['regolith'], M)
    for dx, dz, r in L['domes']:
        door = math.atan2(-(hz - dz), hx - dx)
        moon_dome(b, dx, dz, r, m, door_dir=door)
        tunnel(b, hx, hz, dx, dz, 1.8, m)
    for tx, tz, th in L['towers']:
        solar_tower(b, tx, tz, th, math.radians(30), m)
    for rx_, rz_, rl in L['radiators']:
        for k in range(4):
            box(b, 0.15, 6.0, 5.0, m['radiator'], P(rx_ + k * 0.2, rz_ + k * 6.4 - 9, 3.2) @ Rz(math.radians(90)))
            cylinder(b, 0.12, 0.0, 6.0, 6, m['frame'], P(rx_, rz_ + k * 6.4 - 12.2))
    cx_, cz_ = L['comms']
    comms_dish(b, cx_, cz_, 200, m)
    for i, (vx, vz, vrot) in enumerate(L['rovers']):
        rover(b, vx, vz, vrot, m, pressurized=(i == 0))
    x, z, r = L['pads'][0]
    cargo_stack(b, x + r + 20, z - 6, -30, m)
    export_glb('moonbase', b.finish())


if __name__ == '__main__':
    build_starship()
    build_starship_lander()
    build_hls()
    build_marsbase()
    build_moonbase()
    print('[build_assets] all assets exported')
