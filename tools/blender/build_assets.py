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

import math
import os

import bpy

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


def tube(name, r1, r2, depth, z, vertices=48, mat=None):
    """Cone/cylinder along native +Z, centered at height z."""
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=depth, location=(0, 0, z))
    obj = bpy.context.active_object
    obj.name = name
    if mat:
        assign(obj, mat)
    return obj


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


def build_starship():
    """Stylized Starship along +Z (unit height), proportioned after the classic
    render: blunt ogive nose, delta forward flaps, large trapezoid aft flaps
    reaching the engine skirt, weld rings, 3+4 engine cluster."""
    reset_scene()

    steel = material('steel', (0.78, 0.80, 0.84), metallic=0.95, roughness=0.32)
    weld = material('weld', (0.55, 0.57, 0.62), metallic=0.9, roughness=0.5)
    tiles = material('tiles', (0.08, 0.09, 0.11), metallic=0.2, roughness=0.75)
    dark = material('engine-dark', (0.05, 0.05, 0.06), metallic=0.6, roughness=0.5)

    # Real-ish proportions: 9m dia / 50m tall -> R = 0.09 of height.
    R = 0.09
    body_h = 0.66
    nose_h = 0.30
    skirt_h = 0.04

    tube('skirt', R * 1.015, R, skirt_h, skirt_h / 2, mat=steel)
    body = tube('body', R, R, body_h, skirt_h + body_h / 2, mat=steel)
    smooth(body)

    # Blunt ogive nose: spin the profile to 90% then cap with a sphere tip.
    steps = 22
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
    bpy.ops.mesh.spin(steps=48, angle=2 * math.pi, center=(0, 0, 0), axis=(0, 0, 1))
    bpy.ops.object.mode_set(mode='OBJECT')
    assign(obj, steel)
    smooth(obj)
    obj.select_set(False)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=tip_r * 1.02,
                                         location=(0, 0, tip_z))
    cap = bpy.context.active_object
    cap.name = 'nose-tip'
    cap.scale = (1, 1, 0.85)
    assign(cap, steel)
    smooth(cap)

    # Weld rings: subtle ring lines segmenting the barrel (like the render).
    for i in range(1, 8):
        z = skirt_h + body_h * i / 8
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=R * 1.003, depth=0.0035, location=(0, 0, z))
        ring = bpy.context.active_object
        ring.name = f'weld-{i}'
        assign(ring, weld)

    # Windward thermal-tile band: thin half-shell on the -Y side.
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=R * 1.012, depth=body_h + nose_h * 0.5,
                                        location=(0, 0, skirt_h + (body_h + nose_h * 0.5) / 2))
    shell = bpy.context.active_object
    shell.name = 'tile-band'
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.bisect(plane_co=(0, 0, 0), plane_no=(0, 1, 0), clear_outer=True, clear_inner=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    assign(shell, tiles)
    smooth(shell)

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

    # Engine cluster: 3 sea-level bells in the middle, 4 vacuum bells outside.
    for k in range(3):
        a = k * 2 * math.pi / 3 + math.pi / 6
        rr = R * 0.30
        bpy.ops.mesh.primitive_cone_add(vertices=20, radius1=0.018, radius2=0.009, depth=0.045,
                                        location=(rr * math.cos(a), rr * math.sin(a), 0.012))
        assign(bpy.context.active_object, dark)
        smooth(bpy.context.active_object)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        rr = R * 0.66
        bpy.ops.mesh.primitive_cone_add(vertices=20, radius1=0.027, radius2=0.012, depth=0.05,
                                        location=(rr * math.cos(a), rr * math.sin(a), 0.014))
        assign(bpy.context.active_object, dark)
        smooth(bpy.context.active_object)

    export_glb('starship')


# ---------------------------------------------------------------- booster ---

def build_booster():
    """Unit-height stylized booster along +Z: barrel, grid fins, raceway."""
    reset_scene()

    steel = material('steel', (0.72, 0.74, 0.78), metallic=0.95, roughness=0.38)
    dark = material('dark', (0.06, 0.06, 0.07), metallic=0.5, roughness=0.6)

    R = 0.062

    body = tube('body', R, R, 0.94, 0.47, mat=steel)
    smooth(body)
    tube('skirt', R * 1.05, R, 0.05, 0.025, mat=steel)
    tube('cap', R, R * 0.96, 0.03, 0.955, mat=dark)

    # Grid fins: subdivided plane + wireframe modifier, standing parallel to
    # the body axis, facing radially outward.
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        bpy.ops.mesh.primitive_grid_add(x_subdivisions=5, y_subdivisions=7, size=1,
                                        location=((R + 0.024) * math.cos(a), (R + 0.024) * math.sin(a), 0.9))
        fin = bpy.context.active_object
        fin.name = f'gridfin-{k}'
        fin.scale = (0.05, 0.034, 1)
        fin.rotation_euler = (math.radians(90), 0, a)
        wf = fin.modifiers.new('wire', 'WIREFRAME')
        wf.thickness = 0.006
        assign(fin, dark)

    # Raceway conduit up the side.
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.008, depth=0.9, location=(R + 0.004, 0, 0.47))
    rw = bpy.context.active_object
    rw.name = 'raceway'
    assign(rw, dark)

    # Engine ring.
    for k in range(7):
        a = (k / 7) * 2 * math.pi
        rr = R * 0.6 if k > 0 else 0
        bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.016, radius2=0.008, depth=0.035,
                                        location=(rr * math.cos(a), rr * math.sin(a), 0.008))
        bell = bpy.context.active_object
        assign(bell, dark)
        smooth(bell)

    export_glb('booster')


# ------------------------------------------------------------- moon base ---

def build_moonbase():
    """Lunar outpost, Z-up: ribbed domes, tunnels, dish, pad with lit ring."""
    reset_scene()

    shell = material('hab-shell', (0.88, 0.89, 0.93), metallic=0.15, roughness=0.5)
    rib = material('rib', (0.62, 0.64, 0.70), metallic=0.4, roughness=0.45)
    glow = material('window', (1.0, 0.85, 0.6), emission=(1.0, 0.72, 0.35), emission_strength=4.0)
    deck = material('deck', (0.45, 0.46, 0.5), metallic=0.1, roughness=0.9)

    def dome(name, r, x, y, ribs=3):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=16, radius=r, location=(x, y, 0))
        d = bpy.context.active_object
        d.name = name
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.bisect(plane_co=(x, y, 0), plane_no=(0, 0, 1), clear_inner=True, use_fill=True)
        bpy.ops.object.mode_set(mode='OBJECT')
        assign(d, shell)
        smooth(d)
        for i in range(1, ribs + 1):
            t = i / (ribs + 1)
            ring_r = r * math.sin(math.acos(t))
            bpy.ops.mesh.primitive_torus_add(major_radius=ring_r, minor_radius=r * 0.035,
                                             location=(x, y, r * t), major_segments=32, minor_segments=8)
            tor = bpy.context.active_object
            assign(tor, rib)
            smooth(tor)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y + r * 0.92, r * 0.34))
        w = bpy.context.active_object
        w.scale = (r * 0.34, r * 0.1, r * 0.22)
        assign(w, glow)

    tube('pad', 0.5, 0.54, 0.03, 0.015, mat=deck)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.38, minor_radius=0.008, location=(0, 0, 0.032),
                                     major_segments=48, minor_segments=8)
    ring = bpy.context.active_object
    assign(ring, glow)

    dome('hab-a', 0.16, 0.16, 0.10, ribs=3)
    dome('hab-b', 0.12, -0.16, -0.02, ribs=2)
    dome('hab-c', 0.09, 0.02, -0.2, ribs=2)

    def tunnel(x1, y1, x2, y2):
        dx, dy = x2 - x1, y2 - y1
        ln = math.hypot(dx, dy)
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.035, depth=ln,
                                            location=((x1 + x2) / 2, (y1 + y2) / 2, 0.045))
        t = bpy.context.active_object
        t.rotation_euler = (math.radians(90), 0, math.atan2(dx, dy))
        assign(t, rib)
        smooth(t)

    tunnel(0.16, 0.10, -0.16, -0.02)
    tunnel(-0.16, -0.02, 0.02, -0.2)

    # Comms dish on a mast, bowl opening up-tilted.
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.008, depth=0.22, location=(-0.34, 0.22, 0.13))
    mast = bpy.context.active_object
    assign(mast, rib)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.07, location=(-0.34, 0.22, 0.26))
    dish = bpy.context.active_object
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.bisect(plane_co=(-0.34, 0.22, 0.26 - 0.045), plane_no=(0, 0, 1), clear_inner=True, use_fill=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    dish.rotation_euler = (math.radians(-35), 0, 0)
    assign(dish, shell)
    smooth(dish)

    export_glb('moonbase')


# ------------------------------------------------------------- mars base ---

def build_marsbase():
    """Mars settlement, Z-up: capsule habitats, glowing greenhouse, solar field."""
    reset_scene()

    hull = material('hull', (0.85, 0.78, 0.70), metallic=0.2, roughness=0.55)
    rib = material('rib', (0.55, 0.46, 0.40), metallic=0.35, roughness=0.5)
    green = material('greenhouse', (0.65, 0.95, 0.82), emission=(0.35, 0.95, 0.65), emission_strength=2.2, alpha=0.85)
    panel = material('solar', (0.08, 0.14, 0.28), metallic=0.6, roughness=0.3)
    deck = material('deck', (0.52, 0.33, 0.24), metallic=0.05, roughness=0.95)
    glow = material('window', (1.0, 0.85, 0.6), emission=(1.0, 0.72, 0.35), emission_strength=4.0)

    tube('pad', 0.5, 0.55, 0.028, 0.014, mat=deck)

    # Horizontal capsule habitats lying on the pad.
    def hab(name, x, y, ln, r, angle):
        axis = (math.sin(angle), math.cos(angle))
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=r, depth=ln, location=(x, y, r + 0.02))
        h = bpy.context.active_object
        h.name = name
        h.rotation_euler = (math.radians(90), 0, angle)
        assign(h, hull)
        smooth(h)
        for s in (-1, 1):
            bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=r,
                                                 location=(x + s * (ln / 2) * axis[0], y + s * (ln / 2) * axis[1], r + 0.02))
            cap = bpy.context.active_object
            assign(cap, hull)
            smooth(cap)
        for i in (-1, 0, 1):
            bpy.ops.mesh.primitive_torus_add(major_radius=r * 1.02, minor_radius=r * 0.07,
                                             location=(x + i * ln * 0.3 * axis[0], y + i * ln * 0.3 * axis[1], r + 0.02),
                                             major_segments=24, minor_segments=8)
            tor = bpy.context.active_object
            tor.rotation_euler = (math.radians(90), 0, angle)
            assign(tor, rib)
            smooth(tor)
        # window strip along the sunny side
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x - axis[1] * r * 0.8, y + axis[0] * r * 0.8, r * 1.5 + 0.02))
        w = bpy.context.active_object
        w.scale = (ln * 0.3, r * 0.12, r * 0.16)
        w.rotation_euler = (0, 0, angle)
        assign(w, glow)

    hab('hab-a', 0.1, 0.12, 0.34, 0.07, math.radians(15))
    hab('hab-b', -0.18, -0.04, 0.26, 0.055, math.radians(-25))

    # Greenhouse: elongated glass vault.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=16, radius=0.105, location=(0.05, -0.2, 0))
    g = bpy.context.active_object
    g.name = 'greenhouse'
    g.scale = (1.7, 1.0, 0.8)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.bisect(plane_co=(0.05, -0.2, 0), plane_no=(0, 0, 1), clear_inner=True, use_fill=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    assign(g, green)
    smooth(g)

    # Solar field: tilted panels in two rows.
    for row in range(2):
        for col in range(3):
            bpy.ops.mesh.primitive_cube_add(size=1, location=(0.3 + row * 0.1, 0.05 - col * 0.12, 0.05))
            p = bpy.context.active_object
            p.scale = (0.04, 0.05, 0.002)
            p.rotation_euler = (0, math.radians(-32), 0)
            assign(p, panel)

    export_glb('marsbase')


# ------------------------------------------------------------------- main ---

if __name__ == '__main__':
    build_starship()
    build_booster()
    build_moonbase()
    build_marsbase()
    print('[build_assets] all assets exported')
