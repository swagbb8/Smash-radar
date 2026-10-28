"""Monkey's Life, Episode 1 "ARISE": the whole episode as shots for an AI video app (Kling, Veo, Sora...).

Each scene file (s*.py) holds a SCENE dict; build.py turns them into the production page, a plain prompt list and a
MagicLight script. Canon: Ash's cold-open words, the Episode 1 screenplay ("Waking Up"), comic Issue #1, the bible.
Scenes marked new=True are NOT in Ash's script yet (added to reach 30 min): say so wherever they are shown.
"""

# Who is who. {look} is filled from the scene / shot (how muddy Seven is at that point of the day).
CHAR = {
    'S': "Seven — a huge, ragged adult chimpanzee, bigger and more powerfully built than a normal chimp, scrappy and "
         "scarred, dark fur {look}, deep dark-brown eyes; fused into his LEFT forearm is a palm-sized device: a thin scar "
         "line, faint circuit patterns under the skin and fur, and a small shattered glass screen",
    'G': "Grub — an enormous, heavyset adult male chimpanzee with a barrel chest, thick neck, heavy brow and coarse "
         "black fur, permanently suspicious",
    'P': "Petch — a small, wiry young male chimpanzee with scruffy brown-black fur, big anxious eyes and twitchy hands",
    'D': "Dolo — a sleek adult female chimpanzee with smooth dark fur and calm, watchful eyes",
}
NAME = {'S': 'Seven', 'G': 'Grub', 'P': 'Petch', 'D': 'Dolo'}
LOOK = {
    'mud': 'caked head to toe in wet black swamp mud',
    'wet': 'soaking wet, swamp water streaming off it, the mud half washed away',
    'dry': 'clumped and streaked with dried grey mud',
}
STYLE = ("Photorealistic live action, nature-documentary realism: real chimpanzee anatomy, skin and fur. Cinematic 35mm "
         "film look, shallow depth of field, natural light. No text, no subtitles, no humans.")
FLASH = ("A memory flash: photoreal fragments in cold blue-white light, overexposed, jagged digital glitches and frame "
         "tearing, gone in an instant. No text.")

PLACE = {
    'swamp_dawn': "a dark primeval swamp forest at first light: rows and rows of tall trunks fading into darkness, vines "
                  "hanging down connected tree to tree, knee-deep black mud and still black water, swamp grass, low "
                  "mist, dim cold light",
    'swamp_morning': "a dark primeval swamp forest in the morning: rows of tall trunks fading into darkness, hanging "
                     "vines, still black water below a thick mossy branch, a few thin shafts of sunlight breaking "
                     "through the leaves, mist",
    'canopy': "high in the canopy of an ancient jungle in the morning: huge mossy branches, hanging vines, giant "
              "leaves, golden-green light filtering down, mist far below",
    'clearing': "a broad, sun-drenched clearing in an ancient jungle: fruit trees heavy with fruit, soft ground covered "
                "in fallen fruit and leaves, bright golden late-morning light, insects in the air",
    'stream': "a clear, slow jungle stream winding between mossy rocks and roots, a still pool at its edge, sunlight "
              "glittering on the water, late morning",
    'shade': "deep green shade under giant jungle trees at midday: big roots, ferns, dappled light, heat haze beyond "
             "the shade, insects drifting",
    'afternoon': "huge branches of a giant jungle tree in the warm afternoon: leaves stirring, soft golden light",
    'ridge': "a high rocky ridge above an endless jungle valley in the late afternoon turning to sunset: miles of "
             "unbroken jungle, a river glittering far below, purple mountains at the edge of the world",
    'dusk': "a giant jungle tree at dusk: the last orange light fading, deep blue sky, the jungle going dark below",
    'night': "the high branches of a giant jungle tree at night: dark leaves, a sky exploding with stars, faint "
             "moonlight",
    'world': "an ancient Earth with no humans anywhere: endless primeval jungle, mist, rivers, mountains",
    'under': "under murky green-brown swamp water: drifting silt, tangled roots, dim green light from the surface above",
}


def sh(sec, who, what, act='', cam='', lines=(), snd='', place=None, look=None, kind='ai', his=''):
    """One shot. sec = seconds on screen; who = letters of the characters in it (S G P D); what = plain words for the
    page; act = the action for the prompt; lines = ((speaker, text), ...) with speaker SEVEN (spoken English),
    CAP (words on screen) or a troop name (grunts, shown as subtitles); kind = ai | flash | mine (made in the edit);
    his = Ash's own words this shot shows (cold open)."""
    return dict(sec=sec, who=who, what=what, act=act, cam=cam, lines=list(lines), snd=snd, place=place, look=look,
                kind=kind, his=his)


def prompt(shot, scene):
    """The text to paste into the video app."""
    if shot['kind'] == 'mine': return ''
    look = LOOK[shot['look'] or scene.get('look', 'dry')]
    parts = [CHAR[c].format(look=look) + '.' for c in shot['who']]
    parts.append(shot['act'].strip())
    if shot['kind'] == 'flash':
        parts.append(FLASH)
    else:
        parts.append('Setting: ' + PLACE[shot['place'] or scene['place']] + '.')
        if shot['cam']: parts.append('Camera: ' + shot['cam'] + '.')
        parts.append(STYLE)
    if shot['snd']: parts.append('Sound: ' + shot['snd'] + '.')
    return ' '.join(parts)


def make_len(sec):
    """Clip length to generate (5 or 10 s, the two lengths every app offers); the edit trims it."""
    return 5 if sec <= 5 else 10
