# Builds the atlas 3D assets with Blender (headless) and exports GLBs.
#
#   /Applications/Blender.app/Contents/MacOS/Blender \
#     --background --factory-startup --python tools/blender/build_assets.py
#
# Reproducible source of truth for public/models/*.glb. All designs are
# original stylized models (compliance: not official SpaceX geometry).
#
# COORDINATES: Blender is Z-up. Everything here is built with +Z as "up" /
# the ship's long axis, tail at z=0. The glTF exporter (export_yup=True)
# converts to glTF's Y-up, so in three.js the models stand along +Y with
# the tail at y=0 exactly as the app expects. (v1 of this script wrongly
# built along Blender +Y, which left the hull perpendicular to the flight
# tangent in-app: ships flew sideways.)
#
# The bases are built on the XY plane around the origin (Z = surface normal),
# scaled down and posed onto each body in-app (src/client/atlas/bases/*).

import math
import os

import bpy
from mathutils import Vector

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'models')


# ---------------------------------------------------------------- helpers ---

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, color, metallic=0.0, roughness=0.5, emission=None, emission_strength=0.0, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if emission is not None:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1.0)
        bsdf.inputs['Emission Strength'].default_value = emission_strength
    if alpha < 1.0:
        bsdf.inputs['Alpha'].default_value = alpha
        mat.surface_render_method = 'BLENDED'
    return mat


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def smooth(obj, angle=math.radians(35)):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth()
    try:
        bpy.ops.object.shade_auto_smooth(angle=angle)
    except Exception:
        pass
    obj.select_set(False)


def tube(name, r1, r2, depth, z, vertices=48, mat=None, x=0.0, y=0.0):
    """Cone/cylinder along native +Z, centered at height z."""
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=depth, location=(x, y, z))
    obj = bpy.context.active_object
    obj.name = name
    if mat:
        assign(obj, mat)
    return obj


def cyl(name, r, depth, x, y, z, mat, verts=20, rot=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=(x, y, z))
    o = bpy.context.active_object
    o.name = name
    if rot:
        o.rotation_euler = rot
    if mat:
        assign(o, mat)
    return o


def box(name, sx, sy, sz, x, y, z, mat, rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z))
    o = bpy.context.active_object
    o.name = name
    o.scale = (sx, sy, sz)
    if rot:
        o.rotation_euler = rot
    if mat:
        assign(o, mat)
    return o


def ball(name, r, x, y, z, mat, segs=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=r, location=(x, y, z))
    o = bpy.context.active_object
    o.name = name
    if mat:
        assign(o, mat)
    smooth(o)
    return o


def strut(p1, p2, r, mat, verts=8):
    """A thin cylinder spanning two 3D points (legs, masts, braces)."""
    a = Vector(p1)
    b = Vector(p2)
    d = b - a
    ln = d.length
    if ln < 1e-6:
        return None
    mid = (a + b) / 2.0
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=ln, location=(mid.x, mid.y, mid.z))
    o = bpy.context.active_object
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    assign(o, mat)
    return o


def steel_pbr(name='steel', color=(0.82, 0.84, 0.88)):
    """Plain factor-based stainless. Deliberately NO texture nodes: arbitrary
    node graphs are where the glTF exporter silently drops things. The brushed
    roughness/normal maps and final metal tuning are applied at load time in the
    app (src/client/atlas/useModel.ts), keyed by these material names."""
    return material(name, color, metallic=1.0, roughness=0.35)


def split_windward(obj, mat_lee, mat_tiles):
    """Two material slots on one mesh: faces on the -Y half become tiles.

    This is how the real TPS reads: the black half IS the hull surface,
    flush from nose tip to skirt, no overlaid shell.
    """
    obj.data.materials.clear()
    obj.data.materials.append(mat_lee)
    obj.data.materials.append(mat_tiles)
    for poly in obj.data.polygons:
        if poly.center.y < -1e-4:
            poly.material_index = 1


def uv_project(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66))
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.select_set(False)


def export_glb(name):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f'{name}.glb')
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        export_apply=True,
        export_yup=True,
    )
    print(f'[build_assets] wrote {path}')


# --------------------------------------------------------------- starship ---

def prism(name, outline, y_half, mat):
    """Solid plate from a 2D outline in the XZ plane, extruded +-y_half.

    outline: list of (x, z) tuples, counter-clockwise.
    """
    n = len(outline)
    verts = [(x, -y_half, z) for x, z in outline] + [(x, y_half, z) for x, z in outline]
    faces = [list(range(n))[::-1], [i + n for i in range(n)]]
    for i in range(n):
        j = (i + 1) % n
        faces.append([i, j, j + n, i + n])
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    m = obj.modifiers.new('bevel', 'BEVEL')
    m.width = 0.004
    m.segments = 2
    assign(obj, mat)
    return obj


def raptor_cluster(steel, dark, R, z_skirt):
    """Recessed engine bay: a dark thrust dome with 3 inner + 6 outer bells,
    so the tail reads as an engine cluster instead of a flat cap."""
    # Thrust dome the bells sit in.
    dome = tube('thrust-dome', R * 0.98, R * 0.62, z_skirt * 1.6, z_skirt * 0.8, vertices=48, mat=dark)
    smooth(dome)
    nozzle = material('nozzle', (0.18, 0.16, 0.15), metallic=0.8, roughness=0.35)
    for k in range(3):
        a = k * 2 * math.pi / 3 + math.pi / 6
        rr = R * 0.30
        b = tube('bell', 0.022, 0.011, 0.05, 0.024, vertices=20, mat=nozzle,
                 x=rr * math.cos(a), y=rr * math.sin(a))
        smooth(b)
    for k in range(6):
        a = k * math.pi / 3
        rr = R * 0.66
        b = tube('bell', 0.03, 0.014, 0.055, 0.026, vertices=20, mat=nozzle,
                 x=rr * math.cos(a), y=rr * math.sin(a))
        smooth(b)


def build_starship():
    """Stylized Starship along +Z (unit height), proportioned after the classic
    render. The thermal-protection half is NOT an overlaid shell: every hull
    part carries two material slots split at the y=0 plane, so matte-black
    tiles run flush from the nose tip to the skirt and the lee half is
    brushed stainless (PBR roughness + normal maps applied in-app)."""
    reset_scene()

    steel = steel_pbr('steel')
    # Glossy black ceramic: real TPS has a specular sheen, not chalk-matte.
    tiles = material('tiles', (0.035, 0.035, 0.04), metallic=0.1, roughness=0.42)
    dark = material('engine-dark', (0.05, 0.05, 0.06), metallic=0.6, roughness=0.5)

    # Real-ish proportions: 9m dia / 50m tall -> R = 0.09 of height.
    R = 0.09
    body_h = 0.66
    nose_h = 0.30
    skirt_h = 0.04

    skirt = tube('skirt', R * 1.015, R, skirt_h, skirt_h / 2)
    split_windward(skirt, steel, tiles)
    body = tube('body', R, R, body_h, skirt_h + body_h / 2)
    split_windward(body, steel, tiles)
    smooth(body)

    # Blunt ogive nose: spin the profile to 90% then cap with a sphere tip.
    steps = 30
    blunt = 0.90
    verts = []
    for i in range(steps + 1):
        t = (i / steps) * blunt
        r = R * math.cos(t * math.pi / 2) ** 0.62
        z = skirt_h + body_h + t * nose_h
        verts.append((r, 0, z))
    tip_r = verts[-1][0]
    tip_z = verts[-1][2]
    mesh = bpy.data.meshes.new('nose-profile')
    obj = bpy.data.objects.new('nose', mesh)
    bpy.context.collection.objects.link(obj)
    mesh.from_pydata(verts, [(i, i + 1) for i in range(len(verts) - 1)], [])
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.spin(steps=64, angle=2 * math.pi, center=(0, 0, 0), axis=(0, 0, 1))
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.select_set(False)
    uv_project(obj)  # spin meshes have no UVs; the roughness/normal maps need them
    split_windward(obj, steel, tiles)
    smooth(obj)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=tip_r * 1.02,
                                         location=(0, 0, tip_z))
    cap = bpy.context.active_object
    cap.name = 'nose-tip'
    cap.scale = (1, 1, 0.85)
    split_windward(cap, steel, tiles)
    smooth(cap)

    # Weld rings on the steel half only reach the eye; the tile half of each
    # ring goes black and disappears against the TPS. Finer + more of them now.
    for i in range(1, 11):
        z = skirt_h + body_h * i / 11
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=R * 1.002, depth=0.003, location=(0, 0, z))
        ring = bpy.context.active_object
        ring.name = f'weld-{i}'
        ring_steel = material(f'weld-steel-{i}', (0.55, 0.57, 0.62), metallic=0.9, roughness=0.5)
        split_windward(ring, ring_steel, tiles)

    # Flaps: thin tiled plates on the +-X sides (one plane, like the render).
    # Aft pair: big trapezoids whose lower tip reaches beside the skirt.
    aft_root_lo = skirt_h * 0.4
    aft_root_hi = skirt_h + 0.205
    aft = [
        (R * 0.96, aft_root_hi),          # hinge top
        (R * 0.96, aft_root_lo),          # hinge bottom
        (R + 0.085, aft_root_lo - 0.012), # outer lower tip (flares past the skirt)
        (R + 0.062, aft_root_hi - 0.085), # swept outer edge
    ]
    # Forward pair: smaller deltas at the nose-body junction, swept back.
    fwd_root_lo = skirt_h + body_h - 0.012
    fwd = [
        (R * 0.80, fwd_root_lo + 0.150),  # hinge top (on the nose curve)
        (R * 0.92, fwd_root_lo),          # hinge bottom
        (R + 0.052, fwd_root_lo + 0.012), # outer lower tip
        (R + 0.034, fwd_root_lo + 0.085), # swept leading edge
    ]
    for side in (+1, -1):
        for name, outline in (('aft', aft), ('fwd', fwd)):
            pts = [(side * x, z) for x, z in outline]
            if side < 0:
                pts = pts[::-1]  # keep winding consistent
            prism(f'flap-{name}-{"l" if side > 0 else "r"}', pts, R * 0.10, tiles)
            # Hinge fairing: a small steel cylinder where the flap meets the hull.
            hz = (outline[0][1] + outline[1][1]) / 2
            cyl(f'hinge-{name}', R * 0.05, R * 0.22, side * R * 0.93, 0, hz,
                steel_pbr(f'hinge-steel-{name}-{side}'), verts=12,
                rot=(0, math.radians(90), 0))

    # Recessed Raptor cluster instead of a flat cap.
    raptor_cluster(steel, dark, R, skirt_h)

    export_glb('starship')


# ---------------------------------------------------------------- booster ---

def build_booster():
    """Unit-height stylized booster along +Z: barrel, grid fins, raceway, and a
    full 33-bell thrust ring."""
    reset_scene()

    steel = steel_pbr('booster-steel', (0.72, 0.74, 0.78))
    dark = material('dark', (0.06, 0.06, 0.07), metallic=0.5, roughness=0.6)
    nozzle = material('booster-nozzle', (0.16, 0.15, 0.14), metallic=0.8, roughness=0.4)

    R = 0.062

    body = tube('body', R, R, 0.94, 0.47, mat=steel)
    smooth(body)
    tube('skirt', R * 1.05, R, 0.05, 0.025, mat=steel)
    tube('cap', R, R * 0.96, 0.03, 0.955, mat=dark)

    # Hot-stage ring vents near the top: a darker band.
    cyl('hotstage', R * 1.02, 0.04, 0, 0, 0.9, dark, verts=48)

    # Weld bands down the barrel.
    for i in range(1, 9):
        z = 0.05 + 0.88 * i / 9
        cyl(f'bweld-{i}', R * 1.004, 0.0028, 0, 0, z,
            material(f'bweld-steel-{i}', (0.5, 0.52, 0.57), metallic=0.9, roughness=0.5), verts=48)

    # Grid fins: subdivided plane + wireframe modifier, standing parallel to
    # the body axis, facing radially outward.
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        bpy.ops.mesh.primitive_grid_add(x_subdivisions=6, y_subdivisions=8, size=1,
                                        location=((R + 0.024) * math.cos(a), (R + 0.024) * math.sin(a), 0.86))
        fin = bpy.context.active_object
        fin.name = f'gridfin-{k}'
        fin.scale = (0.05, 0.038, 1)
        fin.rotation_euler = (math.radians(90), 0, a)
        wf = fin.modifiers.new('wire', 'WIREFRAME')
        wf.thickness = 0.006
        assign(fin, dark)
        # fin frame
        cyl(f'finframe-{k}', 0.006, 0.09, (R + 0.024) * math.cos(a), (R + 0.024) * math.sin(a), 0.86,
            steel, verts=8, rot=(math.radians(90), 0, a))

    # Raceway conduit up the side.
    cyl('raceway', 0.008, 0.9, R + 0.004, 0, 0.47, dark, verts=12)

    # 33-engine thrust ring: 3 inner, 10 mid, 20 outer.
    def ring_of(n, rr, r1, r2, depth):
        for k in range(n):
            a = (k / n) * 2 * math.pi
            b = tube('bell', r1, r2, depth, depth / 2 + 0.002, vertices=14, mat=nozzle,
                     x=rr * math.cos(a), y=rr * math.sin(a))
            smooth(b)
    tube('thrust-dome', R * 0.98, R * 0.7, 0.05, 0.02, vertices=48, mat=dark)
    ring_of(3, R * 0.16, 0.009, 0.005, 0.02)
    ring_of(10, R * 0.46, 0.009, 0.005, 0.022)
    ring_of(20, R * 0.82, 0.0085, 0.0045, 0.024)

    export_glb('booster')


# ----------------------------------------------------- shared base furniture ---

def comms_dish(cx, cy, h, mast_mat, dish_mat, tilt=math.radians(-32)):
    """A mast topped by an up-tilted parabolic bowl."""
    cyl('mast', 0.01, h, cx, cy, h / 2, mast_mat, verts=10)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.07, location=(cx, cy, h + 0.04))
    dish = bpy.context.active_object
    dish.name = 'dish'
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.bisect(plane_co=(cx, cy, h + 0.04 - 0.045), plane_no=(0, 0, 1), clear_inner=True, use_fill=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    dish.rotation_euler = (tilt, 0, 0)
    assign(dish, dish_mat)
    smooth(dish)
    cyl('feed', 0.004, 0.05, cx, cy + 0.02, h + 0.06, mast_mat, verts=6)


def solar_field(cx, cy, rows, cols, panel_mat, frame_mat, pitch=0.07, step=0.16, tilt=math.radians(-34)):
    """Rows of tilted panels on short posts."""
    for r in range(rows):
        for c in range(cols):
            x = cx + c * pitch
            y = cy + r * step
            box('panel', 0.028, 0.06, 0.003, x, y, 0.05, panel_mat, rot=(tilt, 0, 0))
            cyl('post', 0.004, 0.05, x, y, 0.024, frame_mat, verts=6)


def storage_tank(cx, cy, r, h, mat):
    cyl('tank', r, h, cx, cy, h / 2 + 0.01, mat, verts=20)
    ball('tank-cap', r, cx, cy, h + 0.01, mat, segs=20, rings=10)
    # support legs
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        strut((cx + math.cos(a) * r, cy + math.sin(a) * r, h * 0.4),
              (cx + math.cos(a) * r * 1.2, cy + math.sin(a) * r * 1.2, 0.0),
              r * 0.06, mat, verts=6)


def rover(cx, cy, angle, body_mat, wheel_mat, glass_mat):
    fwd = (math.cos(angle), math.sin(angle))
    box('rover-body', 0.055, 0.032, 0.018, cx, cy, 0.028, body_mat, rot=(0, 0, angle))
    box('rover-cab', 0.026, 0.03, 0.016, cx + fwd[0] * 0.018, cy + fwd[1] * 0.018, 0.05, glass_mat, rot=(0, 0, angle))
    # 6 wheels
    side = (-fwd[1], fwd[0])
    for fi in (-1, 0, 1):
        for si in (-1, 1):
            wx = cx + fwd[0] * fi * 0.02 + side[0] * si * 0.03
            wy = cy + fwd[1] * fi * 0.02 + side[1] * si * 0.03
            cyl('wheel', 0.011, 0.008, wx, wy, 0.012, wheel_mat, verts=12,
                rot=(math.radians(90), 0, angle))


def lit_strip(cx, cy, cz, sx, sy, sz, glow, rot=None):
    box('window', sx, sy, sz, cx, cy, cz, glow, rot=rot)


def scatter_rocks(cx, cy, spread, n, mat):
    """A few deterministic small rocks for a lived-in pad edge (LCG, no random)."""
    seed = 991
    def nxt():
        nonlocal seed
        seed = (seed * 1103515245 + 12345) & 0x7fffffff
        return seed / 0x7fffffff
    for _ in range(n):
        a = nxt() * 2 * math.pi
        d = (0.6 + nxt() * 0.4) * spread
        r = 0.006 + nxt() * 0.012
        o = ball('rock', r, cx + math.cos(a) * d, cy + math.sin(a) * d, r * 0.5, mat, segs=8, rings=6)
        o.scale = (1.0, 0.8 + nxt() * 0.4, 0.6)


# ------------------------------------------------------------- moon base ---

def build_moonbase():
    """Lunar outpost, Z-up: regolith-bermed domes, tunnels, comms tower, solar
    field, an HLS-style lander, a rover and storage tanks on a lit pad."""
    reset_scene()

    deck = material('deck', (0.42, 0.43, 0.47), metallic=0.1, roughness=0.95)
    shell = material('hab-shell', (0.78, 0.79, 0.83), metallic=0.1, roughness=0.6)
    berm = material('regolith-berm', (0.5, 0.5, 0.53), metallic=0.0, roughness=1.0)
    rib = material('rib', (0.62, 0.64, 0.70), metallic=0.45, roughness=0.4)
    glow = material('window', (1.0, 0.85, 0.6), emission=(1.0, 0.72, 0.35), emission_strength=5.0)
    panel = material('solar', (0.07, 0.12, 0.26), metallic=0.6, roughness=0.3)
    white = material('moon-white', (0.9, 0.91, 0.94), metallic=0.1, roughness=0.5)
    steel = steel_pbr('steel')
    tiles = material('tiles', (0.035, 0.035, 0.04), metallic=0.1, roughness=0.42)
    dark = material('dark', (0.06, 0.06, 0.07), metallic=0.5, roughness=0.6)

    # Landing pad with a lit perimeter ring.
    tube('pad', 0.52, 0.56, 0.03, 0.015, mat=deck)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.4, minor_radius=0.008, location=(0, 0, 0.034),
                                     major_segments=64, minor_segments=8)
    assign(bpy.context.active_object, glow)

    def dome(name, r, x, y, ribs=3, bermed=True):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=18, radius=r, location=(x, y, 0))
        d = bpy.context.active_object
        d.name = name
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.bisect(plane_co=(x, y, 0), plane_no=(0, 0, 1), clear_inner=True, use_fill=True)
        bpy.ops.object.mode_set(mode='OBJECT')
        assign(d, shell)
        smooth(d)
        if bermed:
            # regolith berm skirt around the dome base
            bpy.ops.mesh.primitive_cone_add(vertices=40, radius1=r * 1.18, radius2=r * 0.86,
                                            depth=r * 0.5, location=(x, y, r * 0.18))
            assign(bpy.context.active_object, berm)
            smooth(bpy.context.active_object)
        for i in range(1, ribs + 1):
            t = i / (ribs + 1)
            ring_r = r * math.sin(math.acos(t))
            bpy.ops.mesh.primitive_torus_add(major_radius=ring_r, minor_radius=r * 0.03,
                                             location=(x, y, r * t), major_segments=32, minor_segments=8)
            assign(bpy.context.active_object, rib)
            smooth(bpy.context.active_object)
        # airlock + lit window on the sunny face
        box('airlock', r * 0.34, r * 0.12, r * 0.3, x + r * 0.9, y, r * 0.28, rib)
        lit_strip(x + r * 1.0, y, r * 0.28, r * 0.16, r * 0.04, r * 0.14, glow)

    dome('hab-a', 0.17, 0.15, 0.1, ribs=3)
    dome('hab-b', 0.12, -0.17, -0.02, ribs=2)
    dome('hab-c', 0.1, 0.04, -0.22, ribs=2)

    def tunnel(x1, y1, x2, y2):
        dx, dy = x2 - x1, y2 - y1
        ln = math.hypot(dx, dy)
        cyl('tunnel', 0.035, ln, (x1 + x2) / 2, (y1 + y2) / 2, 0.05, rib, verts=16,
            rot=(math.radians(90), 0, math.atan2(dx, dy)))

    tunnel(0.15, 0.1, -0.17, -0.02)
    tunnel(-0.17, -0.02, 0.04, -0.22)

    # HLS-style lander: tall steel can on long legs, parked on the pad edge.
    lx, ly = -0.34, 0.28
    leg_h = 0.12
    cyl('hls-body', 0.07, 0.34, lx, ly, leg_h + 0.17, steel, verts=28)
    ball('hls-cap', 0.07, lx, ly, leg_h + 0.34, white, segs=24, rings=10)
    tube('hls-skirt', 0.072, 0.05, 0.04, leg_h + 0.01, vertices=24, mat=dark, x=lx, y=ly)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        strut((lx + math.cos(a) * 0.05, ly + math.sin(a) * 0.05, leg_h + 0.02),
              (lx + math.cos(a) * 0.16, ly + math.sin(a) * 0.16, 0.0), 0.006, dark, verts=6)
        ball('foot', 0.012, lx + math.cos(a) * 0.16, ly + math.sin(a) * 0.16, 0.006, dark, segs=8, rings=6)
    # landing thruster pods near the top (HLS mounts them high)
    for k in range(2):
        a = k * math.pi
        box('rcs', 0.02, 0.02, 0.03, lx + math.cos(a) * 0.075, ly + math.sin(a) * 0.075, leg_h + 0.28, dark)
    lit_strip(lx, ly + 0.071, leg_h + 0.2, 0.02, 0.02, 0.08, glow)

    # Comms tower, solar field, tanks, rover, scatter.
    comms_dish(-0.36, -0.2, 0.22, rib, white)
    solar_field(0.22, -0.12, 2, 3, panel, rib)
    storage_tank(0.36, 0.24, 0.05, 0.12, white)
    storage_tank(0.46, 0.18, 0.04, 0.1, white)
    rover(0.0, 0.34, math.radians(200), white, dark, glow)
    scatter_rocks(0, 0, 0.5, 10, berm)

    # flag/marker mast
    strut((0.28, 0.32, 0.0), (0.28, 0.32, 0.14), 0.004, white, verts=6)
    box('flag', 0.001, 0.05, 0.03, 0.28, 0.355, 0.125, material('flag', (0.85, 0.2, 0.2)))

    export_glb('moonbase')


# ------------------------------------------------------------- mars base ---

def landed_ship(cx, cy, s, steel, tiles, dark, nozzle, spin=0.0):
    """A compact Starship standing on landing legs at (cx, cy). Reuses the
    steel/tiles material names so the in-app PBR tuning styles it too."""
    R = 0.085 * s
    leg_h = 0.05 * s
    body_h = 0.5 * s
    nose_h = 0.22 * s
    z0 = leg_h

    body = tube('lander-body', R, R, body_h, z0 + body_h / 2, vertices=28, x=cx, y=cy)
    split_windward(body, steel, tiles)
    smooth(body)
    # ogive nose: cone to a small radius, capped with a sphere
    nose = tube('lander-nose', R, R * 0.2, nose_h, z0 + body_h + nose_h / 2, vertices=28, x=cx, y=cy)
    split_windward(nose, steel, tiles)
    smooth(nose)
    cap = ball('lander-tip', R * 0.21, cx, cy, z0 + body_h + nose_h, dark, segs=20, rings=8)
    split_windward(cap, steel, tiles)  # overwrites the placeholder material
    # weld bands
    for i in range(1, 6):
        z = z0 + body_h * i / 6
        ring = cyl(f'lweld-{i}', R * 1.004, 0.0026, cx, cy, z,
                   material(f'lweld-{cx:.2f}-{i}', (0.5, 0.52, 0.57), metallic=0.9, roughness=0.5), verts=28)
        split_windward(ring, ring.data.materials[0], tiles)
    # aft + fwd flap stubs on +-X
    for sx in (1, -1):
        box('lflap-aft', 0.02 * s, R * 0.5, 0.1 * s, cx + sx * (R + 0.03 * s), cy, z0 + 0.08 * s, tiles,
            rot=(0, math.radians(sx * 12), 0))
        box('lflap-fwd', 0.016 * s, R * 0.4, 0.07 * s, cx + sx * (R + 0.02 * s), cy, z0 + body_h + 0.04 * s, tiles,
            rot=(0, math.radians(sx * 10), 0))
    # engine skirt + legs
    tube('lander-skirt', R * 1.02, R * 0.85, leg_h * 0.9, z0 - leg_h * 0.1, vertices=24, mat=dark, x=cx, y=cy)
    tube('lander-bell', 0.02 * s, 0.01 * s, 0.04 * s, z0 - leg_h * 0.3, vertices=14, mat=nozzle, x=cx, y=cy)
    for k in range(3):
        a = spin + k * 2 * math.pi / 3
        hip = (cx + math.cos(a) * R * 0.7, cy + math.sin(a) * R * 0.7, z0)
        foot = (cx + math.cos(a) * R * 1.9, cy + math.sin(a) * R * 1.9, 0.0)
        strut(hip, foot, 0.007 * s, dark, verts=6)
        ball('lfoot', 0.012 * s, foot[0], foot[1], 0.005, dark, segs=8, rings=6)


def build_marsbase():
    """Mars settlement, Z-up: two landed Starships, capsule habitats with
    tunnels, a glowing greenhouse, an ISRU tank farm, solar rows, comms mast,
    a rover and a flag on a cleared, dusted pad."""
    reset_scene()

    deck = material('deck', (0.5, 0.34, 0.26), metallic=0.05, roughness=0.97)
    hull = material('hull', (0.85, 0.8, 0.73), metallic=0.18, roughness=0.55)
    rib = material('rib', (0.55, 0.46, 0.4), metallic=0.35, roughness=0.5)
    green = material('greenhouse', (0.65, 0.95, 0.82), emission=(0.3, 0.95, 0.6), emission_strength=2.6, alpha=0.85)
    panel = material('solar', (0.07, 0.12, 0.26), metallic=0.6, roughness=0.3)
    glow = material('window', (1.0, 0.85, 0.6), emission=(1.0, 0.72, 0.35), emission_strength=5.0)
    white = material('mars-white', (0.88, 0.86, 0.84), metallic=0.1, roughness=0.5)
    steel = steel_pbr('steel')
    tiles = material('tiles', (0.035, 0.035, 0.04), metallic=0.1, roughness=0.42)
    dark = material('dark', (0.06, 0.06, 0.07), metallic=0.5, roughness=0.6)
    nozzle = material('nozzle', (0.18, 0.16, 0.15), metallic=0.8, roughness=0.35)

    tube('pad', 0.54, 0.6, 0.028, 0.014, mat=deck)

    # Two landed Starships — the signature Mars-colony silhouette.
    landed_ship(-0.18, 0.24, 0.85, steel, tiles, dark, nozzle, spin=0.4)
    landed_ship(0.16, 0.34, 0.7, steel, tiles, dark, nozzle, spin=-0.8)

    # Horizontal capsule habitats lying on the pad, linked by tunnels.
    def hab(name, x, y, ln, r, angle):
        axis = (math.sin(angle), math.cos(angle))
        cyl(name, r, ln, x, y, r + 0.02, hull, verts=24, rot=(math.radians(90), 0, angle))
        for sgn in (-1, 1):
            ball('cap', r, x + sgn * (ln / 2) * axis[0], y + sgn * (ln / 2) * axis[1], r + 0.02, hull, segs=20, rings=12)
        for i in (-1, 0, 1):
            bpy.ops.mesh.primitive_torus_add(major_radius=r * 1.02, minor_radius=r * 0.06,
                                             location=(x + i * ln * 0.3 * axis[0], y + i * ln * 0.3 * axis[1], r + 0.02),
                                             major_segments=24, minor_segments=8)
            tor = bpy.context.active_object
            tor.rotation_euler = (math.radians(90), 0, angle)
            assign(tor, rib)
            smooth(tor)
        lit_strip(x - axis[1] * r * 0.8, y + axis[0] * r * 0.8, r * 1.5 + 0.02,
                  ln * 0.3, r * 0.1, r * 0.16, glow, rot=(0, 0, angle))

    hab('hab-a', 0.08, -0.04, 0.32, 0.07, math.radians(18))
    hab('hab-b', -0.2, -0.12, 0.24, 0.055, math.radians(-28))

    def tunnel(x1, y1, x2, y2):
        dx, dy = x2 - x1, y2 - y1
        ln = math.hypot(dx, dy)
        cyl('tunnel', 0.028, ln, (x1 + x2) / 2, (y1 + y2) / 2, 0.04, rib, verts=14,
            rot=(math.radians(90), 0, math.atan2(dx, dy)))

    tunnel(0.08, -0.04, -0.2, -0.12)

    # Greenhouse: elongated glass vault with internal grow-light glow.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=18, radius=0.1, location=(0.04, -0.26, 0))
    g = bpy.context.active_object
    g.name = 'greenhouse'
    g.scale = (1.9, 1.0, 0.85)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.bisect(plane_co=(0.04, -0.26, 0), plane_no=(0, 0, 1), clear_inner=True, use_fill=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    assign(g, green)
    smooth(g)
    for i in (-1, 0, 1):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.085, minor_radius=0.006,
                                         location=(0.04 + i * 0.06, -0.26, 0.02), major_segments=20, minor_segments=6)
        assign(bpy.context.active_object, rib)

    # ISRU tank farm (methane/oxygen) near a landed ship.
    storage_tank(0.34, 0.14, 0.05, 0.13, white)
    storage_tank(0.44, 0.08, 0.045, 0.11, white)
    storage_tank(0.4, 0.2, 0.04, 0.1, white)

    # Solar rows, comms mast, rover, flag, scatter.
    solar_field(-0.42, -0.1, 2, 3, panel, rib)
    comms_dish(-0.36, 0.22, 0.2, rib, white)
    rover(-0.04, 0.06, math.radians(120), white, dark, glow)
    strut((0.24, -0.34, 0.0), (0.24, -0.34, 0.14), 0.004, white, verts=6)
    box('flag', 0.001, 0.05, 0.03, 0.24, -0.305, 0.125, material('flag', (0.85, 0.2, 0.2)))
    scatter_rocks(0, 0, 0.52, 12, material('mars-rock', (0.45, 0.3, 0.22), roughness=1.0))

    export_glb('marsbase')


# ------------------------------------------------------------------- main ---

if __name__ == '__main__':
    build_starship()
    build_booster()
    build_moonbase()
    build_marsbase()
    print('[build_assets] all assets exported')
