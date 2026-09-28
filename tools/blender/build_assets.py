# Builds the atlas 3D assets with Blender (headless) and exports GLBs.
#
#   /Applications/Blender.app/Contents/MacOS/Blender \
#     --background --factory-startup --python tools/blender/build_assets.py
#
# Normals are quantized to int8 on export (KHR_mesh_quantization, see
# quantize_normals). Positions stay float: the in-app shaders read
# object-space metres (weld seams, dust, the planet-curve bend).
#
# Build only some assets:  ... --python tools/blender/build_assets.py -- booster starbase
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


def quantize_normals(path):
    """Rewrite a GLB with its NORMAL attributes as normalized int8 (padded
    to 4 bytes; KHR_mesh_quantization, which three.js reads natively): a
    third of the bytes of float normals, no visible difference. Positions
    and UVs stay float (the app's shaders read object-space metres)."""
    import struct
    with open(path, 'rb') as fh:
        data = fh.read()
    jlen = struct.unpack('<I', data[12:16])[0]
    gltf = json.loads(data[20:20 + jlen])
    bin_off = 20 + jlen + 8
    blob = data[bin_off:bin_off + struct.unpack('<I', data[20 + jlen:24 + jlen])[0]]
    views = gltf['bufferViews']
    accs = gltf['accessors']
    normal_accs = set()
    for mesh in gltf['meshes']:
        for prim in mesh['primitives']:
            if 'NORMAL' in prim['attributes']:
                normal_accs.add(prim['attributes']['NORMAL'])
    out = bytearray()
    new_views = []
    remap = {}
    for vi, v in enumerate(views):
        users = [ai for ai, a in enumerate(accs) if a.get('bufferView') == vi]
        src = blob[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
        while len(out) % 4:
            out.append(0)
        nv = {k: val for k, val in v.items() if k not in ('byteOffset', 'byteLength', 'byteStride')}
        if users and all(ai in normal_accs for ai in users) and len(users) == 1:
            a = accs[users[0]]
            n = a['count']
            floats = struct.unpack(f'<{n * 3}f', src[a.get('byteOffset', 0):a.get('byteOffset', 0) + n * 12])
            start = len(out)
            for i in range(n):
                x, y, z = floats[i * 3:i * 3 + 3]
                out += struct.pack('<bbbb', *(max(-127, min(127, round(c * 127))) for c in (x, y, z)), 0)
            nv['byteOffset'] = start
            nv['byteLength'] = n * 4
            nv['byteStride'] = 4
            a['componentType'] = 5120
            a['normalized'] = True
            a['byteOffset'] = 0
            a.pop('min', None)
            a.pop('max', None)
        else:
            nv['byteOffset'] = len(out)
            nv['byteLength'] = len(src)
            if 'byteStride' in v:
                nv['byteStride'] = v['byteStride']
            out += src
        remap[vi] = len(new_views)
        new_views.append(nv)
    gltf['bufferViews'] = new_views
    gltf['buffers'][0]['byteLength'] = len(out)
    for key in ('extensionsUsed', 'extensionsRequired'):
        lst = gltf.setdefault(key, [])
        if 'KHR_mesh_quantization' not in lst:
            lst.append('KHR_mesh_quantization')
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    while len(out) % 4:
        out.append(0)
    total = 12 + 8 + len(js) + 8 + len(out)
    with open(path, 'wb') as fh:
        fh.write(struct.pack('<III', 0x46546C67, 2, total))
        fh.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
        fh.write(struct.pack('<II', len(out), 0x004E4942) + bytes(out))


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
    quantize_normals(path)
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    print(f'[build_assets] wrote {path}  ({tris} tris, {len(ob.data.materials)} materials, {os.path.getsize(path) // 1024} KB)')


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
        'lawn': mat('lawn', (0.2, 0.38, 0.12), roughness=0.9),
        'tree': mat('tree', (0.1, 0.24, 0.08), roughness=0.85),
        'pool': mat('pool', (0.05, 0.12, 0.16), roughness=0.08),
    }


def geodesic_dome(b, x, z, r, h, m, freq=3):
    """A big geodesic glass dome over a park: an icosphere cut at the
    equator and squashed to height h, glass panes in a steel frame, on a
    ring wall, with lawn, trees, a pond and low buildings inside."""
    M = P(x, z)
    tmp = bmesh.new()
    bmesh.ops.create_icosphere(tmp, subdivisions=freq, radius=1.0)
    # keep the upper hemisphere
    doomed = [v for v in tmp.verts if v.co.z < -0.02]
    bmesh.ops.delete(tmp, geom=doomed, context='VERTS')
    for v in tmp.verts:
        v.co.x *= r
        v.co.y *= r
        v.co.z = max(v.co.z, 0.0) * h + 3.0
    tmp.loops.layers.uv.new('UVMap')
    for f in tmp.faces:
        f.smooth = False
    b.append_bm(tmp, m['glass'], M)
    for e in tmp.edges:
        p0 = M @ e.verts[0].co
        p1 = M @ e.verts[1].co
        beam(b, tuple(p0), tuple(p1), 0.45, m['frame'], thin=True)
    tmp.free()
    # ring wall with airlocks, and a regolith apron
    lathe(b, [(r + 0.6, 0.0), (r + 0.6, 3.2), (r - 0.6, 3.2), (r - 0.6, 0.0)], 96, m['shell'], M, sharp=(0, 1, 2))
    lathe(b, [(r * 1.18, -0.3), (r + 3.0, 1.4), (r + 0.6, 1.6)], 96, m['regolith'], M)
    for k in range(6):
        a = TAU * k / 6 + 0.26
        MM = M @ Rz(a) @ T(r + 4.0, 0, 0)
        box(b, 7.0, 6.0, 4.4, m['shell'], MM @ T(0, 0, 2.2), bevel=0.4, bevel_segs=2)
        box(b, 0.3, 2.6, 2.6, m['window'], MM @ T(3.55, 0, 1.6))
    # the park
    disc_planar(b, r - 1.0, 0.25, m['lawn'], M, segs=96)
    rnd = lcg(91)
    for i in range(46):
        a = rnd() * TAU
        rr = (0.15 + 0.78 * math.sqrt(rnd())) * r
        tx, ty = rr * math.cos(a), rr * math.sin(a)
        th = 5.0 + rnd() * 7.0
        cylinder(b, 0.35, 0.2, th * 0.45, 6, m['frame'], M @ T(tx, ty, 0), caps=False)
        sphere(b, th * 0.32, 8, m['tree'], M @ T(tx, ty, th * 0.62), squash=1.25)
    lathe(b, [(0.0, 0.3), (r * 0.22, 0.3)], 48, m['pool'], M @ T(r * 0.3, -r * 0.2, 0))
    for i, (bx, by, sx, sy, sh) in enumerate(((-0.35, 0.3, 16, 10, 7), (-0.5, -0.1, 12, 18, 5), (0.05, 0.55, 20, 9, 9), (0.45, 0.35, 10, 10, 12))):
        box(b, sx, sy, sh, m['shell'], M @ T(bx * r, by * r, sh / 2), bevel=0.4)
        for k in range(3):
            box(b, sx * 0.8, 0.2, 0.9, m['window'], M @ T(bx * r, by * r - sy / 2 - 0.05, 1.8 + k * 2.4))


def control_tower(b, x, z, h, m):
    M = P(x, z)
    cylinder(b, 3.2, 0.0, h * 0.82, 32, m['shell'], M, r_top=2.4)
    lathe(b, [(2.4, h * 0.82), (6.5, h * 0.84), (7.2, h * 0.9), (6.2, h * 0.97), (0.0, h)], 48, m['shell'], M, sharp=(1, 2, 3))
    cylinder(b, 6.9, h * 0.9, h * 0.935, 48, m['window'], M, caps=False)
    for k in range(3):
        a = TAU * k / 3
        cylinder(b, 0.25, h, h + 9.0 - k * 2, 6, m['frame'], M @ T(1.6 * math.cos(a), 1.6 * math.sin(a), 0), caps=False)
    sphere(b, 0.6, 10, m['beacon'], M @ T(1.6, 0, h + 9.2))
    lathe(b, [(9.0, -0.3), (6.0, 1.8), (3.4, 2.0)], 48, m['regolith'], M)


def propellant_farm(b, x, z, m):
    M = P(x, z)
    for k, (tx, ty) in enumerate(((0, 0), (26, 0), (52, 0), (13, 24), (39, 24))):
        wx, wy = (M @ Vector((tx, ty, 0)))[:2]
        sphere_tank(b, wx, -wy, 10.5, m)
    for ty in (-24, -34, -44):
        c = M @ Vector((26, ty, 4.4))
        MM = T(*c) @ Ry(math.pi / 2)
        cylinder(b, 4.0, -24.0, 24.0, 32, m['tank'], MM)
        for dx in (-16, 0, 16):
            box(b, 1.2, 6.5, 1.8, m['frame'], T(*c) @ T(dx, 0, -3.5))
    pipe(b, [tuple(M @ Vector((0, -12, 2))), tuple(M @ Vector((52, -12, 2)))], 0.6, m)


def excavator(b, x, z, rot, m):
    M = place(x, z, rot)
    box(b, 7.0, 4.2, 1.6, m['dark'], M @ T(0, 0, 1.0), bevel=0.2)
    box(b, 5.0, 3.6, 3.0, m['crate'], M @ T(-0.6, 0, 3.2), bevel=0.3)
    box(b, 1.8, 1.8, 1.6, m['window'], M @ T(1.6, 1.0, 4.0))
    beam(b, tuple(M @ Vector((1.6, 0, 4.0))), tuple(M @ Vector((8.0, 0, 7.5))), 0.8, m['crate'])
    beam(b, tuple(M @ Vector((8.0, 0, 7.5))), tuple(M @ Vector((11.0, 0, 1.4))), 0.6, m['crate'])
    box(b, 2.4, 2.8, 1.8, m['dark'], M @ T(11.4, 0, 1.2), bevel=0.2)


def conveyor(b, p0, p1, m):
    a, c = Vector(p0), Vector(p1)
    d = c - a
    n = max(2, int(d.length // 12))
    for k in range(n + 1):
        q = a + d * (k / n)
        beam(b, (q.x, q.y, 0.0), (q.x, q.y, q.z), 0.4, m['frame'])
    beam(b, tuple(a), tuple(c), 1.6, m['frame'], h=0.8)
    beam(b, tuple(a + Vector((0, 0, 0.6))), tuple(c + Vector((0, 0, 0.6))), 1.3, m['dark'], h=0.3)


def tunnel_portal(b, x, z, rot, m):
    """A tunnel boring machine's portal: a concrete arch in a regolith
    berm, a dark bore beyond, a ramp and lights."""
    M = place(x, z, rot)
    # berm mound
    lathe(b, [(34.0, -0.3), (26.0, 6.0), (14.0, 10.5), (0.0, 11.5)], 48, m['regolith'], M @ S(1.0, 0.7, 1.0))
    # arch frame and the dark bore
    R = 6.0
    for k in range(14):
        t0 = math.pi * k / 14
        t1 = math.pi * (k + 1) / 14
        p0 = M @ Vector((24.0, R * math.cos(t0), 1.0 + R * math.sin(t0)))
        p1 = M @ Vector((24.0, R * math.cos(t1), 1.0 + R * math.sin(t1)))
        beam(b, tuple(p0), tuple(p1), 1.6, m['shell'], h=2.4)
    lathe(b, [(0.0, 0.0), (R - 0.4, 0.0)], 32, m['dark'], M @ T(23.0, 0, 1.0) @ Ry(math.pi / 2) @ Rz(math.pi / 2) @ S(1.0, 1.0, 1.0))
    box(b, 14.0, 2 * R - 1.0, 0.4, m['pad'], M @ T(31.0, 0, 0.2))
    for sy in (-1, 1):
        light_pole(b, *(lambda v: (v.x, -v.y))(M @ Vector((34.0, sy * 9.0, 0))), 8.0, m['frame'], m['lamp'])


def berm_hab(b, x, z, length, width, rot, m):
    """Buried habitat: a vaulted module under a thick regolith mound, lit
    windows at the ends, a vestibule."""
    M = place(x, z, rot)
    R = width / 2
    n = 12
    for i in range(n):
        t0 = math.pi * i / n
        t1 = math.pi * (i + 1) / n
        y0, z0 = (R + 2.2) * math.cos(t0), (R * 0.75 + 1.8) * math.sin(t0)
        y1, z1 = (R + 2.2) * math.cos(t1), (R * 0.75 + 1.8) * math.sin(t1)
        v = [b.v((-length / 2, y0, z0), M), b.v((length / 2, y0, z0), M), b.v((length / 2, y1, z1), M), b.v((-length / 2, y1, z1), M)]
        b.f(v, [(0, i / n), (1, i / n), (1, (i + 1) / n), (0, (i + 1) / n)], m['regolith'])
    for sx in (-1, 1):
        box(b, 1.2, width * 0.8, R * 1.1, m['shell'], M @ T(sx * length / 2, 0, R * 0.55), bevel=0.2)
        for k in range(4):
            box(b, 0.2, 1.4, 0.9, m['window'], M @ T(sx * (length / 2 + 0.62), -width * 0.3 + k * width * 0.2, R * 0.6))
    box(b, 5.0, 4.0, 3.6, m['shell'], M @ T(length / 2 + 3.0, 0, 1.8), bevel=0.3)


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
        cargo_stack(b, x - r - 20, z + 10, 20, m)
    gx, gz, gr, gh = L['bigDome']
    geodesic_dome(b, gx, gz, gr, gh, m)
    for dx, dz, r in L['domes']:
        door = math.atan2(-(gz - dz), gx - dx)
        hab_dome(b, dx, dz, r, m, door_dir=door)
        # tunnel from the big dome's rim to the habitat
        d = math.hypot(dx - gx, dz - gz)
        ux, uz = (dx - gx) / d, (dz - gz) / d
        tunnel(b, gx + ux * (gr + 6), gz + uz * (gr + 6), dx - ux * (r + 4), dz - uz * (r + 4), 2.2, m)
    tx, tz, th = L['tower']
    control_tower(b, tx, tz, th, m)
    for gx2, gz2, length, width, rot in L['greenhouses']:
        greenhouse(b, gx2, gz2, length, width, rot, m)
    s = L['solar']
    solar_rows(b, s['x'], s['z'], s['rows'], s['len'], s['pitch'], s['rot'], 0, m)
    for ix, iz, irot in L['isru']:
        isru_plant(b, ix, iz, irot, m)
    px_, pz_ = L['propellant']
    propellant_farm(b, px_, pz_, m)
    mx_, mz_, mr_ = L['mine']
    excavator(b, mx_ - 10, mz_ + 20, 30, m)
    excavator(b, mx_ + 25, mz_ - 15, 200, m)
    conveyor(b, (mx_ - mr_ * 0.7, -(mz_ - mr_ * 0.2), -8.0), (mx_ - mr_ - 70, -(mz_ - 40), 14.0), m)
    ptx, ptz, prot = L['portal']
    tunnel_portal(b, ptx, ptz, prot, m)
    for bx, bz, length, width, rot in L['berms']:
        berm_hab(b, bx, bz, length, width, rot, m)
    for rx_, rz_ in L['reactor']:
        reactor(b, rx_, rz_, m)
    dx, dz, drot = L['dish']
    comms_dish(b, dx, dz, drot, m)
    for i, (vx, vz, vrot) in enumerate(L['rovers']):
        rover(b, vx, vz, vrot, m, pressurized=(i % 2 == 0))
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
    px_, pz_, prot = L['plant']
    lunar_plant(b, px_, pz_, prot, m)
    for bx, bz, length, width, rot in L['berms']:
        berm_hab(b, bx, bz, length, width, rot, m)
    export_glb('moonbase', b.finish())


def lunar_plant(b, x, z, rot, m):
    """Regolith processing: a hopper fed by a conveyor, a furnace hall
    pulling oxygen out of the soil, tanks for the product."""
    M = place(x, z, rot)
    box(b, 30.0, 14.0, 9.0, m['shell'], M @ T(0, 0, 4.5), bevel=0.4, bevel_segs=2)
    box(b, 12.0, 10.0, 5.0, m['dark'], M @ T(-6, 0, 11.5), bevel=0.2)
    for k in range(5):
        box(b, 0.2, 1.6, 0.8, m['window'], M @ T(15.05, -4 + k * 2, 5.5))
    lathe(b, [(0.0, 6.0), (3.5, 10.0), (5.0, 13.0), (5.2, 13.2)], 24, m['frame'], M @ T(-22, 0, 0))
    for k in range(4):
        a = TAU * k / 4 + 0.4
        strut(b, tuple(M @ Vector((-22 + 3.8 * math.cos(a), 3.8 * math.sin(a), 0))),
              tuple(M @ Vector((-22 + 3.2 * math.cos(a), 3.2 * math.sin(a), 10.5))), 0.25, m['frame'], segs=6)
    conveyor(b, tuple(M @ Vector((-26, 0, 12.5))), tuple(M @ Vector((-80, 18, 1.0))), m)
    for k, (tx, ty) in enumerate(((20, -10), (20, 10), (30, 0))):
        wx, wy = (M @ Vector((tx, ty, 0)))[:2]
        sphere_tank(b, wx, -wy, 4.0, m)


def build_massdriver():
    """A lunar mass driver (a concept Musk has floated for launching
    lunar-made payloads): a two-kilometre line of accelerator coils on
    pylons over a guideway, a capacitor farm and loading hall at the
    breech. Built in base-local metres; the app bends it onto the Moon's
    curve (materials.ts `curve`)."""
    reset_scene()
    L = LAYOUT['moon']
    b = Builder('massdriver')
    m = settlement_mats('moon')
    x0, z0, x1, z1 = L['massDriver']
    A = Vector((x0, -z0, 0.0))
    B = Vector((x1, -z1, 0.0))
    u = (B - A).normalized()
    v = Vector((-u.y, u.x, 0.0))
    length = (B - A).length
    ang = math.atan2(u.y, u.x)
    n = int(length // 22)
    for i in range(n + 1):
        c = A + u * (22.0 * i + 30.0)
        if (c - A).length > length:
            break
        # coil ring standing across the guideway
        torus(b, 3.2, 0.36, m['frame'], T(c.x, c.y, 5.2) @ Rz(ang) @ Ry(math.pi / 2), segs=14, tsegs=4)
        for s_ in (-1, 1):
            beam(b, tuple(c + v * (2.6 * s_)), tuple(c + v * (2.4 * s_) + Vector((0, 0, 3.0))), 0.45, m['frame'], thin=True)
        if i % 4 == 0:
            box(b, 2.2, 1.2, 1.0, m['dark'], T(c.x, c.y, 0.5) @ Rz(ang), bevel=0.1)
    # guideway and rails
    beam(b, tuple(A + Vector((0, 0, 2.4))), tuple(B + Vector((0, 0, 2.4))), 1.3, m['shell'], h=0.8)
    for s_ in (-0.45, 0.45):
        beam(b, tuple(A + v * s_ + Vector((0, 0, 2.95))), tuple(B + v * s_ + Vector((0, 0, 2.95))), 0.18, m['pipe'])
    for i in range(int(length // 40) + 1):
        c = A + u * (40.0 * i)
        beam(b, tuple(c), tuple(c + Vector((0, 0, 2.0))), 0.9, m['frame'])
    # breech: loading hall, capacitor banks, radiators
    H = T(A.x, A.y, 0) @ Rz(ang)
    box(b, 34.0, 18.0, 11.0, m['shell'], H @ T(-20, 0, 5.5), bevel=0.5, bevel_segs=2)
    box(b, 0.3, 8.0, 5.0, m['window'], H @ T(-2.9, 0, 4.0))
    for r_ in range(3):
        for c_ in range(6):
            box(b, 4.0, 2.6, 3.2, m['dark'], H @ T(-12 - c_ * 5.0, 16 + r_ * 4.0, 1.6), bevel=0.15)
    for k in range(5):
        box(b, 0.15, 7.0, 6.0, m['radiator'], H @ T(-40 + k * 7.5, -16, 4.0) @ Rz(math.radians(90)))
    export_glb('massdriver', b.finish())



# ---------------------------------------------------------------- Starbase ---
# The launch site at Boca Chica (original stylized designs, laid out from
# layout.json 'starbase'): two lattice launch towers, launch mounts, the tank
# farm, the production site's bays in the distance. The Pad A catch arms, their
# carriage and the ship quick-disconnect arm move, so they are separate
# objects in their own GLB (mechazilla.glb), each built around its pivot.

SB = LAYOUT['starbase']
TOWER_W = SB['tower']['width']
TOWER_H = SB['tower']['height']
ARM_HINGE = SB['tower']['armHinge']
ARM_LEN = SB['tower']['armLen']
OLM_TOP = SB['tower']['olmHeight']
LATTICE_TOP = 140.0
CARRIAGE_W = TOWER_W + 2.4
CARRIAGE_H = 10.0


def beam(b, p1, p2, w, material, h=None, up=(0.0, 0.0, 1.0), thin=False):
    """Rectangular-section member from p1 to p2 (w across, h deep). `thin`:
    an open four-sided tube with smooth normals (8 vertices instead of 24),
    for lattice members that are only ever seen from a distance."""
    h = w if h is None else h
    a, c = Vector(p1), Vector(p2)
    d = c - a
    L = d.length
    if L < 1e-6:
        return
    zax = d / L
    xax = zax.cross(Vector(up))
    if xax.length < 1e-4:
        xax = zax.cross(Vector((1.0, 0.0, 0.0)))
    xax.normalize()
    yax = zax.cross(xax)
    if thin:
        ring0 = []
        ring1 = []
        for sx, sy in ((1, 1), (-1, 1), (-1, -1), (1, -1)):
            o = xax * (sx * w / 2) + yax * (sy * h / 2)
            ring0.append(b.v(a + o))
            ring1.append(b.v(c + o))
        for k in range(4):
            k2 = (k + 1) % 4
            try:
                b.f([ring0[k], ring0[k2], ring1[k2], ring1[k]], [(k / 4, 0), ((k + 1) / 4, 0), ((k + 1) / 4, 1), (k / 4, 1)], material)
            except ValueError:
                pass
        return
    M = Matrix(((xax.x, yax.x, zax.x, a.x),
                (xax.y, yax.y, zax.y, a.y),
                (xax.z, yax.z, zax.z, a.z),
                (0.0, 0.0, 0.0, 1.0)))
    box(b, w, h, L, material, M @ T(0, 0, L / 2))


def starbase_mats():
    return {
        'girder': mat('girder', (0.5, 0.5, 0.49), metallic=0.55, roughness=0.6),
        'deck': mat('grating', (0.2, 0.2, 0.21), metallic=0.6, roughness=0.7),
        'concrete': mat('concrete', (0.62, 0.61, 0.58), roughness=0.9),
        'plate': mat('flame-plate', (0.3, 0.29, 0.28), metallic=0.7, roughness=0.55),
        'steel': mat('steel', (0.8, 0.82, 0.85), metallic=1.0, roughness=0.32),
        'tank': mat('tank', (0.86, 0.86, 0.84), metallic=0.1, roughness=0.4),
        'pipe': mat('pipe', (0.62, 0.63, 0.65), metallic=0.9, roughness=0.35),
        'frame': mat('frame', (0.3, 0.31, 0.33), metallic=0.8, roughness=0.45),
        'dark': mat('dark', (0.06, 0.06, 0.07), metallic=0.5, roughness=0.6),
        'clad': mat('cladding', (0.82, 0.83, 0.84), roughness=0.55),
        'beacon': mat('beacon', (1.0, 0.1, 0.05), emission=(1.0, 0.1, 0.05), strength=8.0),
        'soot': mat('soot', (0.1, 0.09, 0.085), metallic=0.3, roughness=0.8),
        'grid': mat('grid', (0.3, 0.3, 0.32), metallic=0.8, roughness=0.5),
    }


def lattice_tower(b, cx, cy, m, arms=None):
    """Square steel lattice: corner columns, girders every section, X bracing
    on each face, decks now and then, risers inside, carriage rails up the
    east face, a machinery house and lightning mast on top. `arms`: static
    catch arms (dict with height/open) for a tower whose arms don't move."""
    hw = TOWER_W / 2
    n = 16
    sh = LATTICE_TOP / n
    c = hw - 0.6
    corners = [(c, c), (-c, c), (-c, -c), (c, -c)]
    G = m['girder']
    for (x, y) in corners:
        beam(b, (cx + x, cy + y, 0.0), (cx + x, cy + y, LATTICE_TOP), 1.2, G)
    for i in range(n + 1):
        z = i * sh
        for k in range(4):
            (x0, y0), (x1, y1) = corners[k], corners[(k + 1) % 4]
            beam(b, (cx + x0, cy + y0, z), (cx + x1, cy + y1, z), 0.7, G, h=0.9)
        if i % 4 == 2:
            box(b, TOWER_W - 1.6, TOWER_W - 1.6, 0.3, m['deck'], T(cx, cy, z + 0.2))
        elif i < n:
            beam(b, (cx + c, cy + c, z), (cx - c, cy - c, z), 0.45, G, thin=True)
    for i in range(n):
        z0, z1 = i * sh, (i + 1) * sh
        for k in range(4):
            (x0, y0), (x1, y1) = corners[k], corners[(k + 1) % 4]
            beam(b, (cx + x0, cy + y0, z0 + 0.5), (cx + x1, cy + y1, z1 - 0.5), 0.5, G, thin=True)
            beam(b, (cx + x1, cy + y1, z0 + 0.5), (cx + x0, cy + y0, z1 - 0.5), 0.5, G, thin=True)
    # propellant risers and a cable tray inside the west half
    for j, (x, y) in enumerate(((-2.8, -2.0), (-2.8, 0.2), (-3.2, 2.4))):
        cylinder(b, 0.55 if j < 2 else 0.35, 0.0, LATTICE_TOP - 4, 12, m['pipe'], T(cx + x, cy + y, 0), caps=False)
    # carriage rails on the east face
    for y in (-(hw - 2.0), hw - 2.0):
        beam(b, (cx + hw + 0.45, cy + y, 6.0), (cx + hw + 0.45, cy + y, LATTICE_TOP), 0.7, m['frame'])
    # machinery house, sheave frame and lightning mast
    box(b, TOWER_W + 0.4, TOWER_W + 0.4, 6.5, m['clad'], T(cx, cy, LATTICE_TOP + 3.25), bevel=0.2)
    box(b, 7.0, 9.0, 3.5, m['girder'], T(cx + 1.0, cy, LATTICE_TOP + 8.2))
    for sy in (-3.2, 3.2):
        beam(b, (cx + hw + 1.2, cy + sy, LATTICE_TOP + 6.5), (cx + 1.0, cy + sy, LATTICE_TOP + 10.0), 0.6, m['frame'])
    cylinder(b, 0.35, LATTICE_TOP + 9.9, TOWER_H + 12.0, 8, m['frame'], T(cx - 3.0, cy - 3.0, 0))
    for (x, y) in corners:
        box(b, 0.5, 0.5, 0.5, m['beacon'], T(cx + x * 1.06, cy + y * 1.06, LATTICE_TOP + 6.9))
    box(b, 0.6, 0.6, 0.6, m['beacon'], T(cx - 3.0, cy - 3.0, TOWER_H + 12.3))
    # foundation
    box(b, TOWER_W + 5, TOWER_W + 5, 1.6, m['concrete'], T(cx, cy, 0.3), bevel=0.2)
    if arms:
        z = arms['height']
        carriage(b, m, T(cx, cy, z - CARRIAGE_H))
        for side in (1, -1):
            catch_arm(b, m, side, T(cx + CARRIAGE_W / 2, cy + side * ARM_HINGE, z) @ Rz(side * arms['open']))


def carriage(b, m, M):
    """The catch-arm carriage: a box frame riding the tower, origin on the
    tower axis at its bottom; the arm hinges sit at its top east corners."""
    hw = CARRIAGE_W / 2
    c = hw - 0.5
    corners = [(c, c), (-c, c), (-c, -c), (c, -c)]
    G = m['girder']
    for (x, y) in corners:
        beam(b, M @ Vector((x, y, 0.0)), M @ Vector((x, y, CARRIAGE_H)), 1.0, G)
    for z in (0.4, CARRIAGE_H / 2, CARRIAGE_H - 0.5):
        for k in range(4):
            (x0, y0), (x1, y1) = corners[k], corners[(k + 1) % 4]
            beam(b, M @ Vector((x0, y0, z)), M @ Vector((x1, y1, z)), 0.8, G, h=1.0)
    for k in range(4):
        (x0, y0), (x1, y1) = corners[k], corners[(k + 1) % 4]
        beam(b, M @ Vector((x0, y0, 0.6)), M @ Vector((x1, y1, CARRIAGE_H / 2 - 0.3)), 0.5, G)
        beam(b, M @ Vector((x1, y1, CARRIAGE_H / 2 + 0.3)), M @ Vector((x0, y0, CARRIAGE_H - 0.6)), 0.5, G)
    # hinge knuckles on the east corners, a drive house on the west side
    for sy in (1, -1):
        cylinder(b, 1.0, CARRIAGE_H - 5.0, CARRIAGE_H + 0.6, 16, m['frame'], M @ T(hw + 0.3, sy * ARM_HINGE, 0))
    box(b, 3.0, 8.0, 4.0, m['clad'], M @ T(-hw - 1.2, 0, CARRIAGE_H - 2.4), bevel=0.15)


def catch_arm(b, m, side, M):
    """One chopstick: a tapering box truss along +x from its hinge (origin, at
    the arm's top face). `side` +1 hangs on the +y hinge: its inner face (and
    the catch rail the vehicle's pins land on) looks toward -y."""
    L = ARM_LEN
    W = 2.0
    G = m['girder']
    inner = -side * (W / 2 - 0.25)

    def depth(x):
        return 4.2 + (2.4 - 4.2) * (x / L)
    # chords: top pair and bottom pair
    for sy in (-W / 2 + 0.25, W / 2 - 0.25):
        beam(b, M @ Vector((0.0, sy, -0.3)), M @ Vector((L, sy, -0.3)), 0.5, G, h=0.6)
        beam(b, M @ Vector((0.0, sy, -depth(0) + 0.3)), M @ Vector((L, sy, -depth(L) + 0.3)), 0.45, G, h=0.5)
    # verticals and Warren diagonals on both sides, cross ties on top/bottom
    nseg = 9
    for i in range(nseg + 1):
        x = L * i / nseg
        for sy in (-W / 2 + 0.25, W / 2 - 0.25):
            beam(b, M @ Vector((x, sy, -0.3)), M @ Vector((x, sy, -depth(x) + 0.3)), 0.35, G, thin=True)
        beam(b, M @ Vector((x, -W / 2 + 0.25, -0.3)), M @ Vector((x, W / 2 - 0.25, -0.3)), 0.3, G, thin=True)
        beam(b, M @ Vector((x, -W / 2 + 0.25, -depth(x) + 0.3)), M @ Vector((x, W / 2 - 0.25, -depth(x) + 0.3)), 0.3, G, thin=True)
        if i < nseg:
            x1 = L * (i + 1) / nseg
            for sy in (-W / 2 + 0.25, W / 2 - 0.25):
                if i % 2 == 0:
                    beam(b, M @ Vector((x, sy, -0.3)), M @ Vector((x1, sy, -depth(x1) + 0.3)), 0.3, G, thin=True)
                else:
                    beam(b, M @ Vector((x, sy, -depth(x) + 0.3)), M @ Vector((x1, sy, -0.3)), 0.3, G, thin=True)
    # the catch rail with its shock-absorbing carts, on the inner top edge
    beam(b, M @ Vector((3.0, inner, 0.05)), M @ Vector((L - 1.0, inner, 0.05)), 0.55, m['frame'], h=0.5)
    for x in (13.0, 22.5):
        box(b, 2.6, 0.9, 0.9, m['dark'], M @ T(x, inner, 0.45), bevel=0.1)
    # hinge sleeve and the actuator back to the carriage
    cylinder(b, 1.2, -4.8, 0.4, 16, m['frame'], M)
    beam(b, M @ Vector((0.6, side * 1.4, -2.0)), M @ Vector((7.5, 0.0, -1.2)), 0.55, m['pipe'])


def qd_arm(b, m, M):
    """Ship quick-disconnect arm: a truss boom along +x from its pivot (origin,
    centred), ending in the QD plate that mates with the ship's aft skirt."""
    L = 13.2
    G = m['girder']
    for sy in (-0.9, 0.9):
        for z in (-1.1, 1.1):
            beam(b, M @ Vector((0.0, sy, z)), M @ Vector((L, sy, z)), 0.4, G)
    for i in range(7):
        x = L * i / 6
        for sy in (-0.9, 0.9):
            beam(b, M @ Vector((x, sy, -1.1)), M @ Vector((x, sy, 1.1)), 0.3, G)
        beam(b, M @ Vector((x, -0.9, 1.1)), M @ Vector((x, 0.9, 1.1)), 0.3, G)
        if i < 6:
            x1 = L * (i + 1) / 6
            for sy in (-0.9, 0.9):
                beam(b, M @ Vector((x, sy, -1.1)), M @ Vector((x1, sy, 1.1)), 0.25, G)
    box(b, 1.6, 3.4, 2.8, m['clad'], M @ T(L + 0.6, 0, 0), bevel=0.15)
    box(b, 0.3, 2.2, 1.9, m['dark'], M @ T(L + 1.5, 0, 0))
    cylinder(b, 1.0, -1.8, 1.8, 14, m['frame'], M)
    for z in (-0.5, 0.5):
        beam(b, M @ Vector((0.0, 0.0, z)), M @ Vector((L + 0.5, 0.0, z * 0.6)), 0.3, m['pipe'])


def launch_mount(b, cx, cy, m, top=OLM_TOP):
    """Launch table on six legs over a water-cooled steel flame plate."""
    M = T(cx, cy, 0)
    lathe(b, [(0.0, 0.55), (4.0, 0.5), (10.5, 0.1), (11.5, 0.0)], 64, m['plate'], M)
    for k in range(6):
        a = TAU * k / 6 + TAU / 12
        p0 = (cx + 10.2 * math.cos(a), cy + 10.2 * math.sin(a), 0.0)
        p1 = (cx + 8.8 * math.cos(a), cy + 8.8 * math.sin(a), top - 2.6)
        beam(b, p0, p1, 3.4, m['concrete'])
        box(b, 4.6, 4.6, 1.0, m['concrete'], T(p0[0], p0[1], 0.5), bevel=0.1)
    # the table: an annulus with a raised clamp ring
    lathe(b, [(5.4, top - 3.0), (12.4, top - 3.0), (12.4, top), (5.4, top), (5.4, top - 3.0)], 72, m['girder'], M,
          sharp=(0, 1, 2, 3))
    for k in range(20):
        a = TAU * k / 20
        box(b, 0.9, 1.2, 1.1, m['frame'], M @ Rz(a) @ T(5.25, 0, top + 0.1), bevel=0.08)
    # booster quick disconnect and deluge manifolds
    box(b, 3.2, 4.6, 3.0, m['clad'], M @ T(-9.4, 0, top + 1.5), bevel=0.15)
    torus(b, 11.8, 0.45, m['pipe'], M @ T(0, 0, top - 3.6), segs=64, tsegs=8)
    for k in range(6):
        a = TAU * k / 6
        beam(b, (cx + 11.8 * math.cos(a), cy + 11.8 * math.sin(a), top - 3.6),
             (cx + 11.8 * math.cos(a), cy + 11.8 * math.sin(a), 0.0), 0.7, m['pipe'])


def tank_v(b, x, y, r, h, material, m):
    cylinder(b, r, 1.0, h - r * 0.55, 32, material, T(x, y, 0), caps=False)
    sphere(b, r, 32, material, T(x, y, h - r * 0.55), z_cut=0.0, squash=0.55)
    cylinder(b, r + 0.35, 0.0, 1.2, 32, m['concrete'], T(x, y, 0))
    for zz in (h * 0.3, h * 0.62):
        torus(b, r + 0.12, 0.12, m['frame'], T(x, y, zz), segs=32, tsegs=4)


def mega_bay(b, x, y, length, width, height, m, doors=True):
    box(b, length, width, height, m['clad'], T(x, y, height / 2), bevel=0.4)
    # vertical ribs along the long walls and a roof parapet
    n = int(length // 9)
    for i in range(n + 1):
        xx = x - length / 2 + length * i / n
        for sy in (-1, 1):
            box(b, 0.6, 0.5, height, m['frame'], T(xx, y + sy * (width / 2 + 0.2), height / 2))
    box(b, length + 1.0, width + 1.0, 1.4, m['frame'], T(x, y, height + 0.4))
    if doors:
        for sx in (-1, 1):
            box(b, 0.4, width * 0.62, height * 0.9, m['dark'], T(x + sx * (length / 2 + 0.1), y, height * 0.45))


def rocket_prototype(b, x, y, h, m, nose=True):
    cylinder(b, 4.5, 0.0, h, 48, m['steel'], T(x, y, 0))
    if nose:
        lathe(b, [(4.5, h), (4.2, h + 4.0), (3.0, h + 9.0), (1.2, h + 13.0), (0.0, h + 14.0)], 48, m['steel'], T(x, y, 0))
    else:
        lathe(b, [(4.5, h), (4.6, h + 1.6), (0.0, h + 2.0)], 48, m['soot'], T(x, y, 0))
    cylinder(b, 5.5, 0.0, 1.2, 24, m['frame'], T(x, y, 0))


def build_starbase():
    reset_scene()
    b = Builder('starbase')
    m = starbase_mats()
    ax, az = SB['padA']['tower']
    lattice_tower(b, ax, -az, m)
    ox, oz = SB['padA']['olm']
    launch_mount(b, ox, -oz, m)
    bx, bz = SB['padB']['tower']
    lattice_tower(b, bx, -bz, m, arms={'height': 70.0, 'open': math.radians(28)})
    ox, oz = SB['padB']['olm']
    launch_mount(b, ox, -oz, m)
    # tank farm, and the pipe rack out to the pad
    for i, (x, z, r, h) in enumerate(SB['tanks']):
        tank_v(b, x, -z, r, h, m['steel'] if i < 8 else m['tank'], m)
    rack = [(-160.0, -40.0), (-60.0, -40.0), (-32.0, -8.0)]
    for (x0, y0), (x1, y1) in zip(rack, rack[1:]):
        d = math.hypot(x1 - x0, y1 - y0)
        for k in range(int(d // 12) + 1):
            t = k / max(1, int(d // 12))
            px, py = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            beam(b, (px, py - 1.5, 0), (px, py - 1.5, 6.0), 0.4, m['frame'])
            beam(b, (px, py + 1.5, 0), (px, py + 1.5, 6.0), 0.4, m['frame'])
            beam(b, (px, py - 1.8, 6.0), (px, py + 1.8, 6.0), 0.5, m['frame'])
        for dy in (-0.9, 0.0, 0.9):
            beam(b, (x0, y0 + dy, 6.8), (x1, y1 + dy, 6.8), 0.55, m['pipe'])
    for x, z, sx, sz, h in SB['sheds']:
        box(b, sx, sz, h, m['clad'], T(x, -z, h / 2), bevel=0.2)
        box(b, sx + 0.6, sz + 0.6, 0.4, m['frame'], T(x, -z, h + 0.1))
    for x, z in SB['lights']:
        cylinder(b, 0.3, 0.0, 34.0, 8, m['frame'], T(x, -z, 0))
        box(b, 3.2, 1.2, 1.6, m['frame'], T(x, -z, 34.6))
    for x, z, length, width, h, rot in SB['megabays']:
        mega_bay(b, x, -z, length, width, h, m, doors=h > 50)
    for i, (x, z) in enumerate(SB['rocketGarden']):
        rocket_prototype(b, x, -z, (50.0, 38.0, 62.0, 44.0)[i % 4], m, nose=i % 2 == 1)
    export_glb('starbase', b.finish())


def build_mechazilla():
    """Pad A's moving parts, each its own object around its pivot."""
    reset_scene()
    m = starbase_mats()
    obs = []
    b = Builder('carriage')
    carriage(b, m, Matrix.Identity(4))
    obs.append(b.finish())
    for name, side in (('arm_n', 1), ('arm_s', -1)):
        b = Builder(name)
        catch_arm(b, m, side, Matrix.Identity(4))
        obs.append(b.finish())
    b = Builder('qd_arm')
    qd_arm(b, m, Matrix.Identity(4))
    obs.append(b.finish())
    export_glb_multi('mechazilla', obs)


def export_glb_multi(name, obs):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f'{name}.glb')
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
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
    quantize_normals(path)
    tris = sum(sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in obs)
    print(f'[build_assets] wrote {path}  ({tris} tris, {len(obs)} objects, {os.path.getsize(path) // 1024} KB)')


# ------------------------------------------------------------ Super Heavy ---
# ~71 m, 9 m. Thirty-three sea-level Raptors under a recessed heat shield,
# four grid fins under a vented hot-staging ring, catch pins under the two
# fins that face the tower's arms (Blender +/-Y -> three.js -/+Z).

BOOSTER_H = 71.0
BOOSTER_R = 4.5
BOOSTER_PIN_Z = 63.5


def build_booster():
    reset_scene()
    b = Builder('booster')
    m = starbase_mats()
    steel = m['steel']
    R = BOOSTER_R
    # barrel, from the aft skirt edge to the hot-staging ring
    prof = [(R - 0.12, 0.6), (R, 0.8)]
    for z in (6.0, 14.0, 24.0, 34.0, 44.0, 54.0, 62.0, 68.6):
        prof.append((R, z))
    lathe(b, prof, 112, steel, sharp=(1,))
    # vented hot-staging ring: dark band, bright frame, a flat top
    cylinder(b, R - 0.2, 68.6, 70.8, 64, m['soot'], caps=False)
    for k in range(24):
        a = TAU * k / 24
        box(b, 0.5, 0.35, 2.2, steel, Rz(a) @ T(R - 0.1, 0, 69.7))
    torus(b, R - 0.05, 0.16, steel, T(0, 0, 70.85), segs=96, tsegs=6)
    torus(b, R - 0.05, 0.16, steel, T(0, 0, 68.65), segs=96, tsegs=6)
    lathe(b, [(0.0, 70.95), (R - 0.2, 70.8)], 64, m['soot'])
    # aft: skirt interior, recessed heat shield, 33 engines
    lathe(b, [(R - 0.12, 0.6), (R - 0.3, 0.6), (R - 0.3, 2.1)], 96, m['dark'], sharp=(1,), flip=True)
    lathe(b, [(0.0, 2.1), (R - 0.3, 2.1)], 96, m['dark'])
    bell = mat('nozzle', (0.24, 0.2, 0.17), metallic=0.85, roughness=0.38)
    inner = mat('nozzle-inner', (0.09, 0.075, 0.07), metallic=0.6, roughness=0.5)

    def raptor(x, y, segs):
        prof_out = []
        prof_in = []
        n = 6
        for i in range(n + 1):
            s_ = i / n
            r = 0.24 + (0.64 - 0.24) * (1 - (1 - s_) ** 2.2)
            z = 0.1 + 1.95 * (1 - s_)
            prof_out.append((r + 0.03, z))
            prof_in.append((r, z))
        MM = T(x, y, 0)
        lathe(b, prof_out[::-1], segs, bell, MM)
        lathe(b, prof_in, segs, inner, MM, flip=False)
        lathe(b, [(0.64, 0.1), (0.67, 0.1)], segs, bell, MM)
    for k in range(20):
        a = TAU * k / 20
        raptor(3.72 * math.cos(a), 3.72 * math.sin(a), 16)
    for k in range(10):
        a = TAU * k / 10 + 0.3
        raptor(2.2 * math.cos(a), 2.2 * math.sin(a), 16)
    for k in range(3):
        a = TAU * k / 3 + 0.5
        raptor(0.78 * math.cos(a), 0.78 * math.sin(a), 18)
    # grid fins at +/-x and +/-y, lattice panels standing out radially
    for k in range(4):
        a = TAU * k / 4
        F = Rz(a)
        r0, r1 = R + 0.25, R + 4.3
        hw = 1.9
        z0, z1 = 64.2, 64.9
        zc = (z0 + z1) / 2
        th = z1 - z0
        for (p, q) in (((r0, -hw), (r1, -hw)), ((r0, hw), (r1, hw)), ((r1, -hw), (r1, hw)), ((r0, -hw), (r0, hw))):
            beam(b, F @ Vector((p[0], p[1], zc)), F @ Vector((q[0], q[1], zc)), 0.22, m['grid'], h=th)
        for i in range(1, 6):
            rr = r0 + (r1 - r0) * i / 6
            beam(b, F @ Vector((rr, -hw, zc)), F @ Vector((rr, hw, zc)), 0.07, m['grid'], h=th)
        for i in range(1, 5):
            yy = -hw + 2 * hw * i / 5
            beam(b, F @ Vector((r0, yy, zc)), F @ Vector((r1, yy, zc)), 0.07, m['grid'], h=th)
        box(b, 1.2, 2.6, 2.4, m['grid'], F @ T(R + 0.3, 0, 65.4), bevel=0.15)
    # catch pins (and their fairings) under the +/-y fins
    for sy in (1, -1):
        cylinder(b, 0.34, 0.0, 1.3, 16, m['frame'], T(0, sy * (R - 0.1), BOOSTER_PIN_Z) @ Rx(-sy * math.pi / 2))
        box(b, 1.4, 0.7, 1.6, steel, T(0, sy * (R + 0.2), BOOSTER_PIN_Z + 0.9), bevel=0.15)
    # a raceway up the side and the chines by the engine bay
    beam(b, (R * math.cos(0.8), R * math.sin(0.8), 3.0), (R * math.cos(0.8), R * math.sin(0.8), 62.0), 0.6, steel, h=0.35)
    for a in (math.pi * 0.5 + 0.35, math.pi * 1.5 + 0.35):
        box(b, 0.5, 0.25, 9.0, steel, Rz(a) @ T(R + 0.1, 0, 6.0))
    export_glb('booster', b.finish())


# ------------------------------------------------------------------- depot ---
# A propellant depot (original design): a Starship that never comes home, so
# no heat shield and no flaps; bare steel, a white insulated band over the
# tanks, a pair of solar wings, radiators, and the aft docking ring that
# mates with a tanker tail-to-tail for ship-to-ship transfer.

def build_depot():
    reset_scene()
    b = Builder('depot')
    steel = mat('steel', (0.8, 0.82, 0.85), metallic=1.0, roughness=0.32)
    white = mat('hls-white', (0.86, 0.86, 0.85), metallic=0.0, roughness=0.55)
    solar = mat('solar', (0.06, 0.1, 0.22), metallic=0.4, roughness=0.3)
    frame = mat('frame', (0.3, 0.31, 0.33), metallic=0.8, roughness=0.45)
    dark = mat('engine-dark', (0.045, 0.045, 0.05), metallic=0.5, roughness=0.55)
    rad = mat('radiator', (0.9, 0.9, 0.9), roughness=0.3)

    def pick(a, z):
        return white if 12.0 < z < 26.0 else steel

    prof = [(SHIP_R - 0.14, 0.0), (SHIP_R, 0.22)]
    for z in (6.0, 12.0, 19.0, 26.0, 30.0):
        prof.append((SHIP_R, z))
    prof += nose_profile()
    lathe(b, prof, 112, pick, phase=math.pi / 2, sharp=(1,))
    ship_aft_bay(b)
    # docking ring and guide petals around the aft skirt
    torus(b, SHIP_R + 0.1, 0.28, frame, T(0, 0, 0.1), segs=96, tsegs=8)
    for k in range(3):
        a = TAU * k / 3 + 0.3
        box(b, 0.3, 1.4, 1.6, frame, Rz(a) @ T(SHIP_R + 0.2, 0, -0.5), bevel=0.1)
    # solar wings on booms, facing the sun side (+/-y)
    for sy in (1, -1):
        beam(b, (0.0, sy * SHIP_R, 22.0), (0.0, sy * (SHIP_R + 3.0), 22.0), 0.35, frame)
        for k in range(4):
            y0 = sy * (SHIP_R + 3.0 + k * 4.2)
            box(b, 0.12, 4.0, 9.0, solar, T(0, y0 + sy * 2.0, 22.0), uv='unit')
        beam(b, (0.0, sy * (SHIP_R + 3.0), 22.0), (0.0, sy * (SHIP_R + 19.8), 22.0), 0.18, frame)
    # radiator panels along the lee side
    for z in (34.0, 39.0):
        box(b, 0.1, 6.0, 4.0, rad, Rz(math.radians(45)) @ T(SHIP_R + 0.1, 0, z))
    # a few dark access panels and the transfer lines' fairing near the tail
    box(b, 0.2, 1.8, 2.2, dark, Rz(math.radians(90)) @ T(SHIP_R + 0.05, 0, 3.2))
    beam(b, (SHIP_R * 0.7, SHIP_R * 0.7, 0.4), (SHIP_R * 0.7, SHIP_R * 0.7, 8.0), 0.5, steel, h=0.4)
    export_glb('depot', b.finish())


BUILDERS = {
    'starship': lambda: build_starship(),
    'starship_lander': lambda: build_starship_lander(),
    'hls': lambda: build_hls(),
    'marsbase': lambda: build_marsbase(),
    'moonbase': lambda: build_moonbase(),
    'starbase': lambda: build_starbase(),
    'mechazilla': lambda: build_mechazilla(),
    'booster': lambda: build_booster(),
    'depot': lambda: build_depot(),
    'massdriver': lambda: build_massdriver(),
}

if __name__ == '__main__':
    import sys
    # optional: build only some assets, e.g. `-- booster starbase`
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    for key in (argv or list(BUILDERS)):
        BUILDERS[key]()
    print('[build_assets] done:', ', '.join(argv or BUILDERS))
