"""Blender panel: "3D FOOTBALL HIGHLIGHT MAKER" (3D Viewport > Sidebar (N) > Football tab).

Load it with:   blender --python blender/ui.py        (or Scripting tab > open ui.py > Run Script)
Buttons: LOAD PLAY, BUILD SCENE, SIMULATE PLAY, GENERATE CAMERAS, GENERATE REPLAY, RENDER PREVIEW, RENDER FINAL, EXPORT VIDEO.
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from bpy.props import StringProperty, EnumProperty, IntProperty, BoolProperty

STATE = {'json': None, 'ctx': None, 'name': 'custom_play'}


def _play(context):
    import play_parser
    s = context.scene.fh; js = STATE['json'] or play_parser.parse_text(s.text or '40-yard touchdown pass')
    js = dict(js); teams = dict(js.get('teams') or play_parser.DEFAULT_TEAMS)
    if s.home_name: teams['HOME'] = dict(teams.get('HOME', {}), name=s.home_name, abbr=s.home_name[:3].upper())
    if s.away_name: teams['AWAY'] = dict(teams.get('AWAY', {}), name=s.away_name, abbr=s.away_name[:3].upper())
    js['teams'] = teams; play = play_parser.normalize(js); play['lighting'] = s.style; play['replay'] = s.replay
    if s.camera_style != 'cinematic' or not s.cameras: play['camera_style'] = s.camera_style if s.cameras else 'broadcast'
    return play


def _build(context, preset=None):
    import scene_builder, render
    s = context.scene.fh; play = _play(context); keep = (s.text, s.filepath, s.home_name, s.away_name, s.style, s.preset, s.aspect, s.replay, s.cameras, s.camera_style)
    ctx = scene_builder.build_scene(play, preset=preset or s.preset, aspect=s.aspect)
    n = bpy.context.scene.fh; n.text, n.filepath, n.home_name, n.away_name, n.style, n.preset, n.aspect, n.replay, n.cameras, n.camera_style = keep     # the factory reset wiped the panel settings
    n.play_type = play['label']; n.duration = round(ctx['total'], 1); STATE['ctx'] = ctx; render.save_meta(ctx, STATE['name']); return ctx


class FH_Props(bpy.types.PropertyGroup):
    filepath: StringProperty(name='Play file', subtype='FILE_PATH')
    text: StringProperty(name='Describe the play', default='QB rolls left, avoids a defender, throws a 35-yard pass on a post route, receiver catches it over a defender and scores')
    play_type: StringProperty(name='Play Type', default='-')
    duration: bpy.props.FloatProperty(name='Duration', default=0.0)
    home_name: StringProperty(name='Home Team', default='Sharks')
    away_name: StringProperty(name='Away Team', default='Wolves')
    preset: EnumProperty(name='Resolution', items=[('DRAFT', 'Draft 540p 24fps', ''), ('PREVIEW', 'Preview 720p 30fps', ''), ('STANDARD', 'Standard 1080p 30fps', ''), ('HIGH', 'High 1080p 60fps', ''), ('CINEMATIC', 'Cinematic 1440p 60fps', '')], default='PREVIEW')
    aspect: EnumProperty(name='Aspect', items=[('9:16', '9:16 vertical', ''), ('16:9', '16:9 wide', ''), ('1:1', '1:1 square', '')], default='9:16')
    style: EnumProperty(name='Visual Style', items=[('PRIMETIME', 'Primetime', ''), ('NIGHT', 'Night', ''), ('DAY', 'Day', ''), ('CINEMATIC', 'Cinematic (golden hour)', '')], default='PRIMETIME')
    camera_style: EnumProperty(name='Cameras', items=[('cinematic', 'Cinematic (auto cuts)', ''), ('broadcast', 'Broadcast wide', ''), ('behind', 'Behind the offense', ''), ('sideline', 'Sideline', ''), ('endzone', 'End zone', '')], default='cinematic')
    replay: BoolProperty(name='Replay', default=True)
    cameras: BoolProperty(name='Auto cameras', default=True)


class FH_OT_load(bpy.types.Operator):
    bl_idname = 'fh.load_play'; bl_label = 'LOAD PLAY'; bl_description = 'Load a play JSON file (or use the description box if no file is set)'
    def execute(self, context):
        import play_parser
        s = context.scene.fh; path = bpy.path.abspath(s.filepath) if s.filepath else ''
        if path and os.path.exists(path):
            with open(path) as f: STATE['json'] = json.load(f)
            STATE['name'] = os.path.splitext(os.path.basename(path))[0]
        else: STATE['json'] = play_parser.parse_text(s.text); STATE['name'] = 'custom_play'
        play = play_parser.normalize(dict(STATE['json'])); s.play_type = play['label']; s.home_name = play['teams']['HOME']['name']; s.away_name = play['teams']['AWAY']['name']; s.style = play['lighting']
        self.report({'INFO'}, f"Loaded: {play['label']} — {play['desc'][:60]}"); return {'FINISHED'}


class FH_OT_build(bpy.types.Operator):
    bl_idname = 'fh.build_scene'; bl_label = 'BUILD SCENE'; bl_description = 'Stadium, lights, 22 players, ball — fully animated'
    def execute(self, context): ctx = _build(context); self.report({'INFO'}, f"Built {ctx['frames']} frames"); return {'FINISHED'}


class FH_OT_simulate(bpy.types.Operator):
    bl_idname = 'fh.simulate'; bl_label = 'SIMULATE PLAY'; bl_description = 'Run the play simulation and play it back in the viewport'
    def execute(self, context):
        if not STATE['ctx']: _build(context)
        bpy.context.scene.frame_set(1); bpy.ops.screen.animation_play(); return {'FINISHED'}


class FH_OT_cameras(bpy.types.Operator):
    bl_idname = 'fh.cameras'; bl_label = 'GENERATE CAMERAS'; bl_description = 'Rebuild with the automatic cinematic camera cuts'
    def execute(self, context): context.scene.fh.cameras = True; _build(context); return {'FINISHED'}


class FH_OT_replay(bpy.types.Operator):
    bl_idname = 'fh.replay'; bl_label = 'GENERATE REPLAY'; bl_description = 'Rebuild with the slow-motion replay of the key moment'
    def execute(self, context): context.scene.fh.replay = True; ctx = _build(context); self.report({'INFO'}, 'Replay added' if ctx['key'] else 'This play has no replay moment'); return {'FINISHED'}


class FH_OT_preview(bpy.types.Operator):
    bl_idname = 'fh.render_preview'; bl_label = 'RENDER PREVIEW'; bl_description = 'Fast low-resolution video'
    def execute(self, context):
        import render
        ctx = _build(context, 'DRAFT'); render.render_frames(ctx, STATE['name']); out = render.finish(STATE['name']); self.report({'INFO'}, out); return {'FINISHED'}


class FH_OT_final(bpy.types.Operator):
    bl_idname = 'fh.render_final'; bl_label = 'RENDER FINAL'; bl_description = 'Render every frame at the chosen resolution'
    def execute(self, context):
        import render
        ctx = STATE['ctx'] or _build(context); render.render_frames(ctx, STATE['name']); self.report({'INFO'}, 'Frames rendered — press EXPORT VIDEO'); return {'FINISHED'}


class FH_OT_export(bpy.types.Operator):
    bl_idname = 'fh.export'; bl_label = 'EXPORT VIDEO'; bl_description = 'Add broadcast graphics + sound and encode the MP4'
    def execute(self, context):
        import render
        out = render.finish(STATE['name']); self.report({'INFO'}, f'Saved {out}'); return {'FINISHED'}


class FH_PT_panel(bpy.types.Panel):
    bl_label = '3D FOOTBALL HIGHLIGHT MAKER'; bl_idname = 'FH_PT_panel'; bl_space_type = 'VIEW_3D'; bl_region_type = 'UI'; bl_category = 'Football'
    def draw(self, context):
        s = context.scene.fh; l = self.layout; l.prop(s, 'filepath'); l.prop(s, 'text'); col = l.column(align=True); col.scale_y = 1.3
        for op in ('fh.load_play', 'fh.build_scene', 'fh.simulate', 'fh.cameras', 'fh.replay', 'fh.render_preview', 'fh.render_final', 'fh.export'): col.operator(op)
        box = l.box(); box.label(text=f'Play Type: {s.play_type}'); box.label(text=f'Duration: {s.duration:.1f} s'); box.prop(s, 'home_name'); box.prop(s, 'away_name'); box.prop(s, 'preset'); box.prop(s, 'aspect')
        sc = context.scene; box.label(text=f'FPS: {sc.render.fps}   {sc.render.resolution_x}x{sc.render.resolution_y}'); box.prop(s, 'style'); box.prop(s, 'camera_style'); box.prop(s, 'replay')


CLASSES = (FH_Props, FH_OT_load, FH_OT_build, FH_OT_simulate, FH_OT_cameras, FH_OT_replay, FH_OT_preview, FH_OT_final, FH_OT_export, FH_PT_panel)


def _ensure_props(*_):
    if not hasattr(bpy.types.Scene, 'fh'): bpy.types.Scene.fh = bpy.props.PointerProperty(type=FH_Props)


def register():
    for c in CLASSES: bpy.utils.register_class(c)
    bpy.types.Scene.fh = bpy.props.PointerProperty(type=FH_Props)


def unregister():
    del bpy.types.Scene.fh
    for c in reversed(CLASSES): bpy.utils.unregister_class(c)


if __name__ == '__main__': register()
