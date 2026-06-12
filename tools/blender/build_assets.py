# Builds the atlas 3D assets with Blender (headless) and exports GLBs.
#
#   /Applications/Blender.app/Contents/MacOS/Blender \
#     --background --factory-startup --python tools/blender/build_assets.py
#
# Reproducible source of truth for public/models/*.glb. All designs are
# original stylized models (compliance: not official SpaceX geometry).
# Conventions: each asset is built around the origin, +Y up, unit height
# (ships) or unit pad-diameter-ish footprint (bases); the app scales them.

import math
import os
import sys

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
    # Blender 4.1+ replaces auto-smooth with the modifier-backed operator.
    try:
        bpy.ops.object.shade_auto_smooth(angle=angle)
    except Exception:
        pass
    obj.select_set(False)


def cylinder(name, r1, r2, depth, y, vertices=48, mat=None):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=depth, location=(0, 0, 0))
    obj = bpy.context.active_object
    obj.name = name
    obj.rotation_euler = (math.radians(90), 0, 0)  # cone axis Z -> Y
    obj.location = (0, y, 0)
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

def build_starship():
    """Unit-height stylized Starship along +Y: ogive nose, flaps, engine skirt."""
    reset_scene()

    steel = material('steel', (0.78, 0.80, 0.84), metallic=0.95, roughness=0.32)
    tiles = material('tiles', (0.08, 0.09, 0.11), metallic=0.2, roughness=0.75)
    dark = material('engine-dark', (0.05, 0.05, 0.06), metallic=0.6, roughness=0.5)

    H = 1.0
    R = 0.085
    body_h = 0.62
    nose_h = 0.30
    skirt_h = 0.08

    # Engine skirt with a slight flare.
    cylinder('skirt', R * 1.04, R, skirt_h, skirt_h / 2, mat=steel)

    # Main barrel.
    body = cylinder('body', R, R, body_h, skirt_h + body_h / 2, mat=steel)
    smooth(body)

    # Ogive nose via spin profile.
    verts = []
    steps = 24
    for i in range(steps + 1):
        t = i / steps
        # tangent-ogive-ish profile
        r = R * math.cos(t * math.pi / 2) ** 0.72
        y = skirt_h + body_h + t * nose_h
        verts.append((r, y))
    mesh = bpy.data.meshes.new('nose-profile')
    obj = bpy.data.objects.new('nose', mesh)
    bpy.context.collection.objects.link(obj)
    mesh.from_pydata([(x, y, 0) for x, y in verts], [(i, i + 1) for i in range(len(verts) - 1)], [])
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.spin(steps=48, angle=2 * math.pi, center=(0, 0, 0), axis=(0, 1, 0))
    bpy.ops.object.mode_set(mode='OBJECT')
    assign(obj, steel)
    smooth(obj)
    obj.select_set(False)

    # Windward thermal-tile band: a thin half-shell hugging one side.
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=R * 1.012, depth=body_h + nose_h * 0.55, location=(0, 0, 0))
    shell = bpy.context.active_object
    shell.name = 'tile-band'
    shell.rotation_euler = (math.radians(90), 0, 0)
    shell.location = (0, skirt_h + (body_h + nose_h * 0.55) / 2, 0)
    # cut away the leeward half
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.bisect(plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_outer=False, clear_inner=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    assign(shell, tiles)
    smooth(shell)

    # Flaps: tapered, beveled plates. (fwd small near nose, aft large near tail)
    def flap(name, y, w, h, side):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(side * (R + w * 0.32), y, 0.0))
        f = bpy.context.active_object
        f.name = name
        f.scale = (w, h, R * 0.34)
        f.rotation_euler = (0, 0, side * math.radians(-14))
        m = f.modifiers.new('bevel', 'BEVEL')
        m.width = 0.006
        m.segments = 2
        assign(f, tiles)
        return f

    flap('flap-aft-l', skirt_h + body_h * 0.16, 0.075, 0.16, +1)
    flap('flap-aft-r', skirt_h + body_h * 0.16, 0.075, 0.16, -1)
    flap('flap-fwd-l', skirt_h + body_h + nose_h * 0.34, 0.05, 0.105, +1)
    flap('flap-fwd-r', skirt_h + body_h + nose_h * 0.34, 0.05, 0.105, -1)

    # Engine bells.
    for i, (ring_r, n, bell_r) in enumerate([(0.0, 1, 0.024), (R * 0.55, 5, 0.02)]):
        for k in range(n):
            a = (k / n) * 2 * math.pi
            bpy.ops.mesh.primitive_cone_add(
                vertices=20, radius1=bell_r, radius2=bell_r * 0.45, depth=0.05,
                location=(ring_r * math.cos(a), 0.012, ring_r * math.sin(a)),
            )
            bell = bpy.context.active_object
            bell.name = f'bell-{i}-{k}'
            bell.rotation_euler = (math.radians(90), 0, 0)
            assign(bell, dark)
            smooth(bell)

    export_glb('starship')


# ---------------------------------------------------------------- booster ---

def build_booster():
    """Unit-height stylized booster: long barrel, grid fins, raceway, skirt."""
    reset_scene()

    steel = material('steel', (0.72, 0.74, 0.78), metallic=0.95, roughness=0.38)
    dark = material('dark', (0.06, 0.06, 0.07), metallic=0.5, roughness=0.6)

    H = 1.0
    R = 0.062

    body = cylinder('body', R, R, 0.94, 0.47, mat=steel)
    smooth(body)
    cylinder('skirt', R * 1.05, R, 0.05, 0.025, mat=steel)
    # interstage cap
    cylinder('cap', R, R * 0.96, 0.03, 0.955, vertices=48, mat=dark)

    # Grid fins: subdivided plane + wireframe modifier = lattice look.
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        bpy.ops.mesh.primitive_grid_add(x_subdivisions=5, y_subdivisions=7, size=1,
                                        location=((R + 0.024) * math.cos(a), 0.9, (R + 0.024) * math.sin(a)))
        fin = bpy.context.active_object
        fin.name = f'gridfin-{k}'
        fin.scale = (0.05, 0.034, 1)
        fin.rotation_euler = (0, -a, math.radians(90))
        wf = fin.modifiers.new('wire', 'WIREFRAME')
        wf.thickness = 0.006
        assign(fin, dark)

    # Raceway conduit.
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.008, depth=0.9, location=(R + 0.004, 0.47, 0))
    rw = bpy.context.active_object
    rw.name = 'raceway'
    rw.rotation_euler = (math.radians(90), 0, 0)
    assign(rw, dark)

    # Engine ring.
    for k in range(7):
        a = (k / 7) * 2 * math.pi
        rr = R * 0.6 if k > 0 else 0
        bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.016, radius2=0.008, depth=0.035,
                                        location=(rr * math.cos(a), 0.008, rr * math.sin(a)))
        bell = bpy.context.active_object
        bell.rotation_euler = (math.radians(90), 0, 0)
        assign(bell, dark)
        smooth(bell)

    export_glb('booster')


# ------------------------------------------------------------- moon base ---

def build_moonbase():
    """Lunar outpost on a unit-ish footprint: ribbed domes, tunnels, dish, pad."""
    reset_scene()

    shell = material('hab-shell', (0.88, 0.89, 0.93), metallic=0.15, roughness=0.5)
    rib = material('rib', (0.62, 0.64, 0.70), metallic=0.4, roughness=0.45)
    glow = material('window', (1.0, 0.85, 0.6), emission=(1.0, 0.72, 0.35), emission_strength=4.0)
    deck = material('deck', (0.45, 0.46, 0.5), metallic=0.1, roughness=0.9)

    def dome(name, r, x, z, ribs=3):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=16, radius=r, location=(x, 0, z))
        d = bpy.context.active_object
        d.name = name
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.bisect(plane_co=(x, 0, z), plane_no=(0, -1, 0), clear_inner=True, use_fill=True)
        bpy.ops.object.mode_set(mode='OBJECT')
        assign(d, shell)
        smooth(d)
        for i in range(1, ribs + 1):
            t = i / (ribs + 1)
            ring_r = r * math.sin(math.acos(t))
            bpy.ops.mesh.primitive_torus_add(major_radius=ring_r, minor_radius=r * 0.035,
                                             location=(x, r * t, z), major_segments=32, minor_segments=8)
            tor = bpy.context.active_object
            assign(tor, rib)
            smooth(tor)
        # door/window block
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, r * 0.34, z + r * 0.92))
        w = bpy.context.active_object
        w.scale = (r * 0.34, r * 0.22, r * 0.1)
        assign(w, glow)
        return d

    # Pad with ring marking.
    cylinder('pad', 0.5, 0.54, 0.03, 0.015, vertices=48, mat=deck)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.38, minor_radius=0.008, location=(0, 0.032, 0),
                                     major_segments=48, minor_segments=8)
    ring = bpy.context.active_object
    assign(ring, glow)

    dome('hab-a', 0.16, 0.16, 0.10, ribs=3)
    dome('hab-b', 0.12, -0.16, -0.02, ribs=2)
    dome('hab-c', 0.09, 0.02, -0.2, ribs=2)

    # Connecting tunnels.
    def tunnel(x1, z1, x2, z2):
        dx, dz = x2 - x1, z2 - z1
        ln = math.hypot(dx, dz)
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.035, depth=ln,
                                            location=((x1 + x2) / 2, 0.045, (z1 + z2) / 2))
        t = bpy.context.active_object
        t.rotation_euler = (math.radians(90), 0, math.atan2(dx, dz))
        assign(t, rib)
        smooth(t)

    tunnel(0.16, 0.10, -0.16, -0.02)
    tunnel(-0.16, -0.02, 0.02, -0.2)

    # Comms dish on a mast.
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.008, depth=0.22, location=(-0.34, 0.13, 0.22))
    mast = bpy.context.active_object
    assign(mast, rib)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.07, location=(-0.34, 0.26, 0.22))
    dish = bpy.context.active_object
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.bisect(plane_co=(-0.34, 0.26 - 0.045, 0.22), plane_no=(0, 1, 0), clear_inner=True, use_fill=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    dish.rotation_euler = (math.radians(-35), 0, 0)
    assign(dish, shell)
    smooth(dish)

    export_glb('moonbase')


# ------------------------------------------------------------- mars base ---

def build_marsbase():
    """Mars settlement: ribbed horizontal habs, glowing greenhouse, solar field."""
    reset_scene()

    hull = material('hull', (0.85, 0.78, 0.70), metallic=0.2, roughness=0.55)
    rib = material('rib', (0.55, 0.46, 0.40), metallic=0.35, roughness=0.5)
    green = material('greenhouse', (0.65, 0.95, 0.82), emission=(0.35, 0.95, 0.65), emission_strength=2.2, alpha=0.85)
    panel = material('solar', (0.08, 0.14, 0.28), metallic=0.6, roughness=0.3)
    deck = material('deck', (0.52, 0.33, 0.24), metallic=0.05, roughness=0.95)
    glow = material('window', (1.0, 0.85, 0.6), emission=(1.0, 0.72, 0.35), emission_strength=4.0)

    cylinder('pad', 0.5, 0.55, 0.028, 0.014, vertices=48, mat=deck)

    # Horizontal habitat modules (capsules with ribs).
    def hab(name, x, z, ln, r, angle):
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=r, depth=ln, location=(x, r + 0.02, z))
        h = bpy.context.active_object
        h.name = name
        h.rotation_euler = (0, angle, math.radians(90))
        assign(h, hull)
        smooth(h)
        for s in (-1, 1):
            bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=r,
                                                 location=(x + s * (ln / 2) * math.cos(angle), r + 0.02, z - s * (ln / 2) * math.sin(angle)))
            cap = bpy.context.active_object
            assign(cap, hull)
            smooth(cap)
        for i in (-1, 0, 1):
            bpy.ops.mesh.primitive_torus_add(major_radius=r * 1.02, minor_radius=r * 0.07,
                                             location=(x + i * ln * 0.3 * math.cos(angle), r + 0.02, z - i * ln * 0.3 * math.sin(angle)),
                                             major_segments=24, minor_segments=8)
            tor = bpy.context.active_object
            tor.rotation_euler = (0, angle, math.radians(90))
            assign(tor, rib)
            smooth(tor)
        # window strip
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, r * 1.5 + 0.02, z + r * 0.8))
        w = bpy.context.active_object
        w.scale = (ln * 0.3, r * 0.16, r * 0.12)
        w.rotation_euler = (0, angle, 0)
        assign(w, glow)

    hab('hab-a', 0.1, 0.12, 0.34, 0.07, math.radians(15))
    hab('hab-b', -0.18, -0.04, 0.26, 0.055, math.radians(-25))

    # Greenhouse: elongated glass vault.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=16, radius=0.105, location=(0.05, 0, -0.2))
    g = bpy.context.active_object
    g.name = 'greenhouse'
    g.scale = (1.7, 0.8, 1.0)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.bisect(plane_co=(0.05, 0, -0.2), plane_no=(0, -1, 0), clear_inner=True, use_fill=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    assign(g, green)
    smooth(g)

    # Solar field: two rows of tilted panels on legs.
    for row in range(2):
        for col in range(3):
            x = 0.3 + row * 0.1
            z = 0.05 - col * 0.12
            bpy.ops.mesh.primitive_cube_add(size=1, location=(x, 0.05, z))
            p = bpy.context.active_object
            p.scale = (0.04, 0.002, 0.05)
            p.rotation_euler = (0, 0, math.radians(-32))
            assign(p, panel)

    export_glb('marsbase')


# ------------------------------------------------------------------- main ---

if __name__ == '__main__':
    build_starship()
    build_booster()
    build_moonbase()
    build_marsbase()
    print('[build_assets] all assets exported')
