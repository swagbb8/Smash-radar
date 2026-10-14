from ep import sh

RIDGE = dict(
    title='The ridge', when='Sunset', place='ridge', look='dry', new=False,
    note='From your Episode 1 script and the comic. The second, longer memory flash; Seven\'s second word.',
    summary='Seven climbs the ridge — the spot Petch described — and sits at the edge above the valley. Dolo finds him '
            'and sits beside him. They watch the sun drop. The device pulses once, twice, a third time slower; his '
            'face does something complicated. "You were somewhere else. And then you were here. Everything you were '
            'is still in you somewhere — it just got scrambled. That must be the loneliest thing." A longer flash: '
            'smooth white walls, tall upright figures, voices, the device lit up fully, a face too fast to see, a '
            'sound like the world exhaling. He gasps and grips the rock; Dolo\'s hand on his back. Then, gravely: '
            '"…Shit." "Shit." Dolo: "…Sure." They sit together as the sun goes down over the oldest world.',
    shots=[
        sh(8, 'S', 'Seven walks alone through the jungle toward the ridge',
           'Seven moves alone on all fours through the late-afternoon jungle, determined, glancing up at a high ridge '
           'through the trees.', 'tracking alongside', place='afternoon'),
        sh(8, 'S', 'He climbs the steep rocks below the ridge',
           'Seven hauls himself up steep, mossy rocks, breathing hard, the jungle dropping away below him.',
           'from below, looking up'),
        sh(10, '', 'The ridge above the valley, late afternoon',
           'Late afternoon. A high rocky ridge stands above an endless jungle valley, a river glittering far below.',
           'wide aerial, slow orbit'),
        sh(10, 'S', 'Seven climbs up onto the ridge, alone',
           'Seven climbs the last rocks onto the top of the ridge, alone, and stops at the edge.', 'medium wide'),
        sh(10, 'S', 'He sits at the edge; the whole valley below',
           'Seven sits at the very edge of the ridge, small against the vast valley: miles of unbroken jungle, the '
           'glitter of a river far off, purple mountains at the edge of the world.', 'wide, from behind'),
        sh(8, 'D', 'Dolo climbs up and finds him',
           'Dolo climbs up onto the ridge and stops, seeing Seven sitting at the edge.', 'medium'),
        sh(8, 'SD', 'She sits beside him — not touching, just there',
           'Dolo sits down beside Seven — not touching, just there.', 'two-shot from the side'),
        sh(10, 'SD', 'They watch the sun drop',
           'From behind: the two of them sit side by side on the ridge and watch the sun sink toward the mountains, '
           'the sky turning orange.', 'wide, from behind, static'),
        sh(6, 'S', 'The device pulses — once',
           'Close-up of Seven\'s forearm: the shattered screen pulses with a faint cold blue light — once.', 'macro',
           snd='one low hum'),
        sh(6, 'S', '…twice. A third time, slower.',
           'The screen pulses again. Then a third time, slower.', 'macro', snd='two more low hums, the last one longer'),
        sh(10, 'S', 'His face does something complicated',
           'Close-up of Seven in the sunset light: his face does something complicated — not memory, not quite; the '
           'shadow of it; something just out of reach.', 'close-up, very slow push in'),
        sh(6, 'S', 'He covers the device with his hand',
           'Seven covers the device in his forearm with his other hand.', 'close'),
        sh(5, 'D', 'Dolo glances at his covered arm', 'Dolo glances down at his covered arm, then back out at the '
           'valley.', 'close-up'),
        sh(10, 'D', 'You were somewhere else…',
           'Dolo speaks quietly, looking out at the valley.', 'close-up, profile',
           lines=[('DOLO', 'You were somewhere else. And then you were here.'),
                  ('DOLO', 'And everything you were is still in you somewhere, it just got… scrambled.')]),
        sh(6, '', 'The valley at sunset', 'The vast jungle valley at sunset, the river shining like a thread of gold.',
           'wide, static'),
        sh(6, 'D', 'That must be the loneliest thing.', 'Dolo, still looking out.', 'close-up',
           lines=[('DOLO', 'That must be the loneliest thing.')]),
        sh(10, 'SD', 'A long silence',
           'The two of them sit in silence on the ridge, the wind moving their fur, the sun nearly gone.',
           'wide, static', snd='wind'),
        sh(6, '', 'The sun touches the mountains', 'The sun touches the far purple mountains and begins to sink '
           'behind them.', 'long lens, static'),
        sh(3, '', 'FLASH: smooth white walls', 'Smooth white walls; a clean, bright corridor rushing past.',
           kind='flash'),
        sh(3, '', 'FLASH: tall upright figures, voices',
           'Tall upright human figures standing around the camera, faceless silhouettes against hard white light.',
           kind='flash', snd='human voices, unintelligible'),
        sh(4, '', 'FLASH: the device lit up fully',
           'A chimpanzee\'s forearm with the embedded device lit up fully, alive with glowing, unreadable symbols.',
           kind='flash'),
        sh(3, '', 'FLASH: a face, too fast to see', 'A human face very close, looking down, blurred — gone.',
           kind='flash'),
        sh(3, '', 'FLASH: white light swallows everything', 'White light swallows everything.', kind='flash',
           snd='a sound like the world exhaling'),
        sh(6, 'S', 'He gasps and grips the rock',
           'Seven gasps, hands gripping the rock beneath him, overwhelmed, shaking.', 'close-up'),
        sh(8, 'SD', 'Dolo\'s hand on his back. She doesn\'t ask.',
           'Dolo puts her hand on Seven\'s back and leaves it there. She does not ask anything. He breathes.',
           'two-shot'),
        sh(8, 'S', '…Shit.',
           'After a while Seven turns to her with the gravity of someone delivering the most important news in the '
           'world, and says one short word.', 'close-up', lines=[('SEVEN', '…Shit.')]),
        sh(5, 'D', 'Dolo stares', 'Dolo stares at him.', 'close-up'),
        sh(6, 'S', 'Shit. (nodding, as if that explains everything)',
           'Seven nods slowly, as if this clarifies everything, and says it again.', 'close-up',
           lines=[('SEVEN', 'Shit.')]),
        sh(8, 'D', '…Sure.', 'Dolo, after a very long pause.', 'close-up', lines=[('DOLO', '…Sure.')]),
        sh(13, 'SD', 'The two of them, small on the ridge, as the sun goes down',
           'Wide: the two chimpanzees, small on the ridge, as the sun dies behind the mountains over the oldest world.',
           'wide, very slow pull back',
           lines=[('CAP', 'He didn\'t know where he came from.'),
                  ('CAP', 'He didn\'t know what was on his arm, or whose face kept finding him in the dark.'),
                  ('CAP', 'He didn\'t know why, of everything, THOSE were the first words back.')]),
    ])

NESTS = dict(
    title='Nests', when='Dusk', place='dusk', look='dry', new=True,
    note='NEW — not in your script. Real chimps build a fresh sleeping nest every night; Seven has forgotten how. '
         'Leads into your night scene. Cut it if you don\'t want it.',
    summary='Dusk. The troop climbs high into a giant tree to sleep. Dolo weaves a nest from leafy branches; Grub flops '
            'into his and the branches creak. Seven tries to copy them; the branch snaps back into his face. Petch '
            'climbs over and shows him how. Seven ends up in a lopsided nest he made himself, pleased. "…Good. That\'s '
            'good."',
    shots=[
        sh(10, 'SGPD', 'Dusk: the troop climbs high into a giant tree',
           'Dusk. The troop climbs high into a giant tree as the last light fades.', 'wide, looking up'),
        sh(8, 'D', 'Dolo weaves a sleeping nest',
           'Dolo expertly bends and weaves leafy branches into a sleeping nest in a fork of the tree.', 'medium'),
        sh(6, 'G', 'Grub flops into his nest — the branches creak',
           'Grub flops heavily into a leafy nest; the branches creak dangerously.', 'medium',
           snd='creaking wood, a heavy sigh'),
        sh(8, 'S', 'Seven watches, then tries to copy them',
           'Seven watches the others, then grabs a leafy branch and bends it, copying them, clumsily.', 'medium'),
        sh(6, 'S', 'The branch snaps back into his face',
           'The branch snaps back and smacks Seven in the face.', 'medium close-up', snd='a leafy whack'),
        sh(8, 'SP', 'Petch climbs over and shows him how',
           'Petch climbs over and patiently shows Seven how, bending a branch down and tucking it under.', 'two-shot'),
        sh(8, 'S', 'His nest: lopsided, but his',
           'Seven sits in a lopsided, messy nest he made himself, looking pleased.', 'medium'),
        sh(4, 'P', '…Good. That\'s good.', 'Petch, quietly proud.', 'close-up',
           lines=[('PETCH', '…Good. That\'s good.')]),
        sh(6, 'S', 'He lies back — the nest sags, but holds',
           'Seven carefully lies back; the nest sags but holds.', 'medium'),
        sh(6, 'SGPD', 'The last light goes; the troop settles in',
           'The last light goes; the troop settles into their nests high in the tree, dark shapes against a deepening '
           'blue sky.', 'wide, static'),
    ])

STARS = dict(
    title='Under the stars', when='Night', place='night', look='dry', new=False,
    note='From your Episode 1 script and the comic. Ends on "He remembers the future."',
    summary='Night. The troop sleeps high in the branches: Grub snoring, Petch with his face buried in his arms. Seven '
            'is awake. He holds his arm up against a sky exploding with stars. Somewhere down in the scrambled dark of '
            'him, something is still running — still working, still putting itself back together. The device gives '
            'one soft point of blue light, then dark. He lowers his arm, closes his eyes, and for the first time since '
            'waking in the mud, he sleeps. Slow pull back over the jungle. MONKEY\'S LIFE — "He remembers the future."',
    shots=[
        sh(10, '', 'Night over the jungle — a sky full of stars',
           'Night over an endless jungle; a sky exploding with stars.', 'wide, slow drift', place='world'),
        sh(8, '', 'Fireflies drifting far below in the dark',
           'Far below in the dark jungle, fireflies drift between the trunks.', 'slow drift'),
        sh(8, 'G', 'Grub asleep in his nest, snoring',
           'High in the tree, Grub sleeps sprawled in his nest, snoring.', 'medium', snd='snoring, night insects'),
        sh(6, 'P', 'Petch asleep, face buried in his arms',
           'Petch sleeps curled up tight with his face buried in his arms.', 'close'),
        sh(6, 'D', 'Dolo asleep', 'Dolo sleeps calmly nearby.', 'close'),
        sh(8, 'S', 'Seven is awake', 'Seven lies awake in his lopsided nest, eyes open, looking up at the stars.',
           'close-up'),
        sh(10, 'S', 'He holds his arm up against the stars',
           'Seven slowly raises his left forearm against the night sky; the device is a dark shape against thousands '
           'of stars.', 'low angle beside him',
           lines=[('CAP', 'But somewhere down in the scrambled dark of him… something was still running.')]),
        sh(6, 'S', 'One soft blue light. Gone.',
           'Close-up: the shattered screen in Seven\'s raised forearm gives one soft pulse of blue light — one tiny '
           'point — then goes dark.', 'macro against the stars', snd='a tiny hum',
           lines=[('CAP', 'Still working.'), ('CAP', 'Still putting itself back together.')]),
        sh(8, 'S', 'He lowers his arm and closes his eyes', 'Seven lowers his arm and closes his eyes.', 'close-up'),
        sh(8, 'S', 'For the first time, he sleeps',
           'Close-up of Seven\'s face asleep in the starlight, breathing slowly, at peace for the first time.',
           'close-up, static'),
        sh(14, '', 'Slow pull back over the jungle under the stars',
           'Slow pull back and up from a giant tree, out over an endless dark jungle under a sky full of stars.',
           'slow aerial pull back', place='world'),
        sh(6, '', 'Title: MONKEY\'S LIFE — "He remembers the future."', kind='mine'),
        sh(60, '', 'End credits', kind='mine'),
    ])

SCENES = [RIDGE, NESTS, STARS]
