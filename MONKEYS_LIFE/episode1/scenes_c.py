from ep import sh

MIDDAY = dict(
    title='Petch remembers', when='Midday', place='shade', look='dry', new=False,
    note='From your Episode 1 script.',
    summary='The troop rests in the shade. Seven sits apart, cross-legged, staring at the shattered screen — like a '
            'window with the shutters pulled. Petch plops down and gives him fruit. Before you disappeared, three '
            'nights ago, you were standing at the top of the ridge looking up at the sky. Then there was a feeling in '
            'the ground, like the big storms but with no storm — and you were just gone. I know you can\'t tell me '
            'anything; I\'m just telling you, in case some of it gets back in there. Seven puts his hand on Petch\'s '
            'arm. "Okay. Yeah. Okay."',
    shots=[
        sh(8, '', 'Midday: the sun blazing, heat haze, the jungle goes quiet',
           'Through the leaves: the midday sun blazing overhead, heat haze shimmering over the canopy, the jungle '
           'gone quiet.', 'looking up, static'),
        sh(10, 'GPD', 'The troop rests in the shade',
           'Midday heat. In deep green shade under giant trees the troop rests: Grub sprawled on his back, Petch '
           'grooming Dolo.', 'wide, static', snd='buzzing insects, the hum of the hot jungle'),
        sh(8, 'S', 'Seven sits apart, cross-legged, staring at his arm',
           'Seven sits apart from the others, cross-legged on a big root, staring at his forearm.', 'medium'),
        sh(8, 'S', 'Close: the screen — like a window with the shutters pulled',
           'Extreme close-up of the shattered glass screen fused into Seven\'s forearm: dark, with the faintest '
           'suggestion of something behind the cracks, like a window with the shutters pulled.', 'macro, very slow'),
        sh(6, 'SP', 'Petch plops down and offers him fruit',
           'Petch plops down next to Seven and holds out a piece of fruit.', 'two-shot'),
        sh(6, 'S', 'He eats it without looking away from his arm',
           'Seven takes the fruit and eats it without looking away from his arm.', 'medium close-up'),
        sh(10, 'P', 'Before you disappeared… three nights ago',
           'Petch talks quietly, fiddling with a leaf.', 'close-up',
           lines=[('PETCH', 'I\'ve been thinking. Before you disappeared — three nights ago, right? — you were acting '
                            'weird.')]),
        sh(9, 'P', '…on top of the ridge, looking up at the sky',
           'Petch points up toward a distant ridge visible through the trees.', 'medium',
           lines=[('PETCH', 'Standing at the top of the ridge, looking up at the sky.'),
                  ('PETCH', 'I figured you were being dramatic. You do that sometimes.')]),
        sh(7, 'P', 'Did. Used to. Before…',
           'Petch trails off and gestures vaguely at the camera\'s whole situation.', 'close-up',
           lines=[('PETCH', 'Did. Used to. Before…')]),
        sh(5, '', 'A high ridge above the jungle, hazy in the heat',
           'Through a gap in the trees: a high rocky ridge above the jungle, hazy in the midday heat.',
           'long lens, static'),
        sh(10, 'P', 'A feeling in the ground — like a storm with no storm',
           'Petch lays his palm flat on the ground, remembering, uneasy.', 'close-up',
           lines=[('PETCH', 'Then there was this… feeling. In the ground.'),
                  ('PETCH', 'Like when the big storms come but with no storm.')]),
        sh(6, 'P', 'And then you were just gone.', 'Petch looks up at the camera.', 'close-up',
           lines=[('PETCH', 'And then you were just gone.')]),
        sh(6, 'S', 'Seven turns and looks at him', 'Seven turns from his arm and looks at Petch.', 'close-up'),
        sh(10, 'P', 'I\'m just telling you…', 'Petch, gently.', 'close-up',
           lines=[('PETCH', 'I know you can\'t tell me anything. I\'m just… telling you.'),
                  ('PETCH', 'In case some of it gets back in there eventually.')]),
        sh(8, '', 'The jungle hums', 'Insects drift through slanted beams of light in the hot, still jungle.',
           'static', snd='the low hum of the jungle'),
        sh(7, 'SP', 'Seven puts his hand on Petch\'s arm',
           'Seven slowly, deliberately places his hand on Petch\'s arm — not grabbing, just a gesture.',
           'close two-shot'),
        sh(6, 'P', 'Petch stares at the hand', 'Petch stares down at the hand on his arm.', 'close-up'),
        sh(6, 'P', 'Okay. Yeah. Okay.', 'Petch, very quietly.', 'close-up',
           lines=[('PETCH', 'Okay. Yeah. Okay.')]),
    ])

ARM = dict(
    title='The arm thing', when='Midday', place='shade', look='dry', new=False,
    note='From your Episode 1 script. Seven\'s second "Fuck."',
    summary='Grub crashes through a bush and sits down heavily; Petch jumps three feet. "I\'ve been thinking about the '
            'arm thing." "We were having a moment." The arm thing is a problem — everybody in the valley will want to '
            'know, Old Kesso\'s troop by the river. We ARE weird, but this is the kind of weird that brings trouble. '
            'Not saying we get rid of you — even though you grabbed my ear — but don\'t go showing that arm around. '
            'Seven holds his arm up to the whole jungle. "…I\'m saying the OPPOSITE of that." "Fuck." Did he just— '
            'Yes. Is that a thing now? Dolo says yes. What does it mean? No idea. Does HE know? Seven is staring at a '
            'caterpillar. "Unclear."',
    shots=[
        sh(5, 'G', 'Grub crashes out of a bush and sits down heavily',
           'Grub crashes out through a bush and drops down heavily right next to the camera.', 'medium',
           snd='crashing leaves, a heavy thump'),
        sh(4, 'P', 'Petch jumps three feet', 'Petch jumps three feet in the air in fright.', 'medium'),
        sh(5, 'G', 'I\'ve been thinking about the arm thing.', 'Grub, serious.', 'close-up',
           lines=[('GRUB', 'I\'ve been thinking about the arm thing.')]),
        sh(4, 'P', 'We were having a moment.', 'Petch, annoyed.', 'close-up',
           lines=[('PETCH', 'We were having a moment.')]),
        sh(11, 'G', 'The arm thing is a problem — Old Kesso\'s troop…',
           'Grub, deadly serious, hooting low and gesturing out at the whole jungle.', 'medium close-up',
           lines=[('GRUB', 'The arm thing is a problem. Everybody in the whole valley is going to want to know about '
                           'the arm thing.'), ('GRUB', 'Old Kesso\'s troop, the ones by the river—')]),
        sh(4, 'P', 'They already think we\'re weird—', 'Petch cuts in.', 'close-up',
           lines=[('PETCH', 'They already think we\'re weird—')]),
        sh(8, 'G', 'We ARE weird.', 'Grub, jabbing a finger.', 'close-up',
           lines=[('GRUB', 'We ARE weird. But this is a different kind of weird.'),
                  ('GRUB', 'This is the kind of weird that brings trouble.')]),
        sh(10, 'SG', 'Not saying we get rid of you… even though you grabbed my ear',
           'Grub leans in close to Seven, serious, one finger raised.', 'two-shot',
           lines=[('GRUB', 'I\'m not saying we get rid of you. Obviously.'),
                  ('GRUB', 'Even though you grabbed my ear. Which was disrespectful and I want you to know I remember '
                           'it.')]),
        sh(6, 'G', '…don\'t go showing that arm around.', 'Grub, final word.', 'close-up',
           lines=[('GRUB', 'But… you should probably not go showing that arm around.')]),
        sh(6, 'S', 'Seven looks at his arm. At Grub. At his arm.',
           'Seven looks at his arm. Looks at the camera. Looks at his arm again.', 'close-up'),
        sh(8, 'S', 'He holds his arm up high to the whole jungle',
           'Seven holds his left arm straight up in the air, the device facing out, as if showing it to the whole '
           'jungle.', 'low angle, medium'),
        sh(5, 'G', '…I\'m saying the OPPOSITE of that.', 'Grub, flat with despair.', 'close-up',
           lines=[('GRUB', '…I\'m saying the OPPOSITE of that.')]),
        sh(5, 'S', 'Fuck.', 'Seven, arm still held high, says one short word with total conviction.', 'medium',
           lines=[('SEVEN', 'Fuck.')]),
        sh(5, 'GP', 'Did he just— / Yes.', 'Grub points at Petch, outraged; Petch nods.', 'two-shot',
           lines=[('GRUB', 'Did he just—'), ('PETCH', 'Yes.')]),
        sh(5, 'GP', 'Is that going to be a thing now?', 'Grub and Petch, side by side, staring.', 'two-shot',
           lines=[('GRUB', 'Is that going to be a thing now?'), ('PETCH', 'Dolo says yes.')]),
        sh(6, 'G', 'Grub stares at Seven', 'Grub stares at the camera for a long, suspicious moment.', 'close-up'),
        sh(5, 'GP', 'What does it mean? / No idea.', 'Grub, quietly; Petch shrugs.', 'two-shot',
           lines=[('GRUB', '…What does it mean?'), ('PETCH', 'No idea.')]),
        sh(4, 'G', 'Does HE know?', 'Grub.', 'close-up', lines=[('GRUB', 'Does HE know?')]),
        sh(8, 'S', 'Seven is staring at a caterpillar',
           'Seven has lowered his arm and is staring, utterly absorbed, at a fat caterpillar crawling along a leaf in '
           'front of his face.', 'close-up'),
        sh(4, 'P', 'Unclear.', 'Petch.', 'close-up', lines=[('PETCH', 'Unclear.')]),
    ])

GROOMING = dict(
    title='Grooming', when='Afternoon', place='afternoon', look='dry', new=True,
    note='NEW — not in your script. The troop grooms Seven: the bruise from his fall, the lines under his fur, and a '
         'Grub gross-out joke. Ends with Seven heading off alone to the ridge. Cut it if you don\'t want it.',
    summary='Afternoon. The troop lounges and grooms. Dolo starts grooming Seven; he goes stiff, then relaxes. She '
            'finds a big bruise on his back from the fall and he flinches. Down his left arm she finds a scar line and '
            'faint lines of light under the fur, branching out from the device. Petch: "Is that INSIDE him? Oh, I hate '
            'that." Grub, half asleep: "I\'m not grooming that arm." Grub picks a tick off his belly and eats it. Dolo '
            'keeps grooming around the device as if it is part of him. While the others doze, Seven looks at the ridge '
            'Petch talked about, and slips away. Dolo opens her eyes and watches him go.',
    shots=[
        sh(10, 'GPD', 'Afternoon: the troop grooming in a big tree',
           'Afternoon light. The troop lounges on huge branches: Dolo combs through Petch\'s fur with her fingers; '
           'Grub dozes on his back.', 'wide, slow drift'),
        sh(8, 'SD', 'Dolo moves over and starts grooming Seven',
           'Dolo shifts over to Seven and starts grooming him, parting his fur with her fingers, picking out dried '
           'mud.', 'two-shot'),
        sh(6, 'S', 'He goes stiff — then relaxes',
           'Seven goes stiff, unsure what is happening, then slowly relaxes, eyes half closing.', 'close-up'),
        sh(8, 'SD', 'She finds the bruise on his back — he flinches',
           'Dolo parts the fur on Seven\'s back and finds a big dark bruise; she presses it gently and Seven flinches '
           'with a sharp breath.', 'close, over his shoulder'),
        sh(6, 'D', 'Dolo looks at the bruise, thinking', 'Dolo studies the bruise, thoughtful, saying nothing.',
           'close-up'),
        sh(8, 'SD', 'Down his arm she finds the scar — and lines of light under the fur',
           'Dolo works her way down Seven\'s left arm and stops: under the fur there is a thin scar line and faint '
           'lines of cold light branching out from the device like veins.', 'macro on the arm and her fingers'),
        sh(6, 'P', 'Petch leans in — and gags',
           'Petch leans over to look at the glowing lines under the fur, recoils and gags.', 'close-up',
           lines=[('PETCH', 'Is that INSIDE him? It\'s inside him.'), ('PETCH', 'Oh, I hate that.')]),
        sh(6, 'G', 'Grub opens one eye: not grooming that arm', 'Grub opens one eye from his nap.', 'close-up',
           lines=[('GRUB', 'I\'m not grooming that arm.')]),
        sh(5, 'P', 'Nobody asked you to.', 'Petch, snippy.', 'close-up', lines=[('PETCH', 'Nobody asked you to.')]),
        sh(8, 'G', 'Grub picks a tick off his belly and eats it',
           'Grub picks a fat tick off his own belly, inspects it, and eats it with great satisfaction.', 'close-up'),
        sh(4, 'P', 'Petch gags again', 'Petch gags again.', 'close-up'),
        sh(8, 'SD', 'Dolo keeps grooming around the device, calm',
           'Dolo, unbothered, keeps grooming carefully around the device in Seven\'s forearm, as if it is simply part '
           'of him.', 'close two-shot'),
        sh(6, 'S', 'Seven watches her hands', 'Seven watches her hands moving through his fur.', 'close-up'),
        sh(10, 'SGPD', 'The troop dozes in the warm afternoon',
           'The troop dozes in the warm afternoon; leaves stir; the light turns gold.', 'wide, static'),
        sh(8, 'S', 'Seven, awake, looks off at the ridge',
           'Seven, awake while the others doze, looks off through the trees at a high rocky ridge glowing in the '
           'late sun.', 'close-up'),
        sh(6, '', 'His POV: the ridge in the late sun',
           'First-person view through the leaves: a high rocky ridge above the jungle, glowing in the late afternoon '
           'sun.', 'long lens, static'),
        sh(8, 'S', 'He slips away, alone',
           'Seven quietly climbs down out of the tree and heads off alone toward the ridge.', 'wide'),
        sh(5, 'D', 'Dolo opens her eyes and watches him go', 'Dolo opens her eyes and watches him go.', 'close-up'),
    ])

SCENES = [MIDDAY, ARM, GROOMING]
