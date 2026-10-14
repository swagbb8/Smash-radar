from ep import sh

MARCH = dict(
    title='The march', when='Morning', place='canopy', look='dry', new=False,
    note='From your Episode 1 script and the comic.',
    summary='The troop moves through the golden morning canopy. They called him Seven — it just fit. He keeps up, '
            'badly: he stops to stare at a leaf, the light, a beetle, and checks his arm like someone waiting for a '
            'text. Petch drops back beside him: you don\'t remember the bad berries? The big red thing you bit on the '
            'nose? Not me — your best friend, second best, top-five friend? Seven sniffs his face. Petch: this is '
            'fine, I\'m not sad at all. Grub calls them on to the feeding ground.',
    shots=[
        sh(10, 'SGPD', 'The troop moving through the golden jungle',
           'The four chimpanzees move through the high branches in golden morning light, climbing and swinging in a '
           'line: Grub in front, then Petch, then Dolo, and last, falling behind, Seven.',
           'wide, slow tracking alongside them',
           lines=[('CAP', 'They called him Seven.'), ('CAP', 'He didn\'t know why. It just… fit.')]),
        sh(10, 'SGPD', 'Mist far below: four small figures in the giant canopy',
           'Extreme wide: far below the troop the jungle floor is lost in mist; four small dark figures move along a '
           'huge mossy branch high in the canopy.', 'extreme wide, static'),
        sh(8, 'S', 'He keeps up — badly',
           'Seven climbs after the others; his hands and feet find the branches on their own, but he keeps stopping.',
           'medium, tracking'),
        sh(6, 'S', 'He stops dead to stare at a leaf',
           'Seven stops dead on a branch and stares at a single huge leaf, turning it in his fingers, studying its '
           'shape.', 'close-up'),
        sh(8, '', 'His POV: the light coming down through the leaves',
           'First-person view looking up: morning light filtering down through layers of leaves, green and gold, '
           'dust and tiny insects drifting in the beams.', 'slow look upward'),
        sh(6, 'S', 'A beetle crawls over his knuckles — he watches it go',
           'A big iridescent beetle crawls across Seven\'s knuckles; he holds perfectly still and watches it go, '
           'fascinated.', 'close-up on his hand, his face soft in the background'),
        sh(5, 'S', 'He checks his arm', 'Seven glances down at the device in his forearm, checks it, looks away.',
           'close'),
        sh(5, 'S', '…checks it again, like waiting for a text',
           'A moment later Seven checks the device in his forearm again, like someone waiting for a text message.',
           'close'),
        sh(6, 'G', 'Up ahead, Grub hoots back at him to hurry',
           'Up ahead, Grub turns on a branch and hoots impatiently back toward the camera.', 'medium, long lens',
           snd='an impatient hoot'),
        sh(5, 'D', 'Dolo glances back at him, watchful',
           'Dolo pauses on a branch and glances back at the camera, watchful.', 'medium, long lens'),
        sh(8, 'SGPD', 'They leap a gap between two trees — Seven hesitates, then makes it',
           'One after another the chimpanzees leap across a gap between two giant trees: Grub, Petch, Dolo. Seven '
           'stops at the edge and looks down at the long drop, then jumps — and makes it, clumsily.',
           'wide, side on'),
        sh(6, 'P', 'Petch drops back to walk beside him',
           'Petch lets the others go ahead and drops back along the branch to walk beside the camera, glancing '
           'sideways, nervous.', 'medium, tracking'),
        sh(8, 'SP', 'So you really don\'t remember anything?',
           'Petch walks alongside Seven on a wide mossy branch, chattering, gesturing, peering at his face.',
           'two-shot, tracking', lines=[('PETCH', 'So you really don\'t remember anything? Like… nothing?')]),
        sh(7, 'P', '…the bad berries',
           'Petch mimes stuffing something in his mouth and clutching his belly, eyes wide.', 'medium',
           lines=[('PETCH', 'Not the time Grub ate the bad berries and screamed for two days?')]),
        sh(5, 'S', 'Seven: empty', 'Seven looks back at him. Completely empty.', 'close-up'),
        sh(9, 'P', '…the big red thing — you bit it on the nose',
           'Petch acts it out: running, ducking, then a big bite at the air, grinning hopefully.', 'medium',
           lines=[('PETCH', 'Not the time we got chased into the ravine by that big red thing and you bit it on the '
                            'nose?'), ('PETCH', 'You were a legend.')]),
        sh(4, 'S', 'Nothing.', 'Seven: nothing. A slow blink.', 'close-up'),
        sh(9, 'P', 'Not… me? Top-five friend?',
           'Petch\'s face falls a little; he points at himself, hopeful.', 'close-up',
           lines=[('PETCH', 'Not… me? Your best friend?'), ('PETCH', 'Second best friend?'),
                  ('PETCH', 'Top-five friend?')]),
        sh(6, 'SP', 'Seven leans in and sniffs his face',
           'Seven leans in close and sniffs Petch\'s face, slowly, all over.', 'close two-shot'),
        sh(6, 'P', 'Petch goes very still and lets it happen',
           'Close-up: Petch goes completely still and lets it happen, eyes darting.', 'close-up'),
        sh(7, 'P', 'This is fine.',
           'Petch, quietly, to himself, looking away and blinking fast.', 'close-up',
           lines=[('PETCH', 'This is fine. This is completely fine.'), ('PETCH', 'I\'m not sad at all.')]),
        sh(6, 'G', 'Grub calls out — they\'ve reached the feeding ground',
           'Up ahead, Grub stands tall on a branch at the edge of the trees and hoots loudly, waving them on.',
           'medium wide', snd='loud hooting'),
        sh(10, '', 'The trees open onto the feeding ground',
           'The trees open onto a broad, sun-drenched clearing where fruit hangs heavy and the soft ground is covered '
           'in fallen fruit.', 'crane down out of the canopy into the clearing', place='clearing'),
    ])

FIRST_WORD = dict(
    title='The first word', when='Late morning', place='clearing', look='dry', new=False,
    note='From your Episode 1 script and the comic. Seven\'s word is spoken in English — record it or pick a voice; '
         'the troop\'s lines are grunts with subtitles.',
    summary='The troop feeds. Seven stands apart and looks at the sky — a memory flash: a smear of light, something '
            'huge and silver overhead, a blurred face looking down. The device pulses once. Dolo: it happened again. '
            'That thing on your arm lights up when your eyes go far away. She touches it — nothing. "I don\'t know '
            'what you came back from, Seven. But whatever it was, it changed you into something I don\'t have a word '
            'for yet." Seven reaches for something deep inside and says the first human word this world has heard: '
            '"…Fuck." Dolo: "…What?" Grub, across the clearing: what\'s happening? Dolo: he said a sound. An angry '
            'one. Is he going to keep doing it? Probably.',
    shots=[
        sh(10, 'GPD', 'The troop spreads out to feed',
           'In the sunny clearing the troop spreads out to feed: Grub stuffs fruit into his mouth with both hands, '
           'Petch picks at his fur between bites, Dolo sits calmly peeling a fruit.', 'wide, slow drift'),
        sh(6, 'G', 'Grub crams a whole fruit in',
           'Grub crams a whole fruit into his mouth, juice running down his chin, already reaching for another.',
           'close-up'),
        sh(6, 'P', 'Petch nibbles, picks at his fur, glances around',
           'Petch nibbles a fruit while nervously picking at his fur and glancing around.', 'medium close-up'),
        sh(8, 'S', 'Seven stands apart at the edge, looking up at the sky',
           'At the edge of the clearing, apart from the others, Seven stands and looks up at the sky.',
           'wide, from behind'),
        sh(6, '', 'His POV: bright sky through a gap in the trees',
           'First-person view: a ragged circle of bright sky through the canopy, white clouds, a bird far up.',
           'looking up, slow'),
        sh(4, '', 'FLASH: a smear of light, a sliver of metal',
           'A smear of white light; a sliver of polished metal flashing past.', kind='flash'),
        sh(5, '', 'FLASH: something huge and silver moving fast overhead',
           'Looking straight up: the smooth silver underside of something enormous moving fast overhead, blotting out '
           'the sky.', kind='flash', snd='a deep mechanical roar that does not belong in this world'),
        sh(4, '', 'FLASH: a blurred face looking down',
           'A blurred, out-of-focus human face looking down into the camera, washed out by white light, too fast to '
           'see.', kind='flash'),
        sh(5, 'S', 'He jerks back, hand over his eyes',
           'Seven jerks back, blinking hard, and presses a hand over his eyes, gasping.', 'close-up'),
        sh(6, 'S', 'The device pulses once — then goes dark',
           'Close-up of Seven\'s left forearm: the shattered screen pulses once with a faint cold blue light, then '
           'goes dark again.', 'macro', snd='a faint electronic hum'),
        sh(6, 'SD', 'Dolo is suddenly beside him',
           'Dolo has quietly appeared beside Seven; she sits watching him closely.', 'two-shot',
           lines=[('DOLO', 'It happened again. Didn\'t it.')]),
        sh(5, 'S', 'He looks at her, shaken', 'Seven turns and looks at her, shaken.', 'close-up'),
        sh(6, 'D', 'In your head. Something flashed.', 'Close-up of Dolo, calm, studying him.', 'close-up',
           lines=[('DOLO', 'In your head. Something flashed.')]),
        sh(5, 'S', 'He doesn\'t answer — looks down at his arm',
           'Seven does not answer. He looks down at his forearm.', 'close-up'),
        sh(11, 'D', 'That thing on your arm… it lights up',
           'Dolo nods at the camera\'s forearm, speaking softly, her eyes never leaving it.', 'close-up',
           lines=[('DOLO', 'That thing on your arm… I\'ve been watching it since we found you.'),
                  ('DOLO', 'It moves sometimes. When you go still and your eyes get far away.'),
                  ('DOLO', 'It lights up.')]),
        sh(8, 'SD', 'She touches it with one finger. Nothing.',
           'Dolo reaches out slowly and touches the edge of the device in Seven\'s forearm with one finger. Nothing '
           'happens.', 'close two-shot'),
        sh(10, 'D', 'I don\'t know what you came back from, Seven…',
           'Close-up of Dolo, no drama, simply stating a fact.', 'close-up',
           lines=[('DOLO', 'I don\'t know what you came back from, Seven.'),
                  ('DOLO', 'But whatever it was… it changed you into something I don\'t have a word for yet.')]),
        sh(6, 'S', 'He looks at her for a long moment', 'Seven looks at her for a long moment.', 'close-up'),
        sh(6, 'S', '…F—', 'Close-up: Seven opens his mouth; a rough sound starts and stops. He frowns at it.',
           'close-up', lines=[('SEVEN', '…F—')]),
        sh(7, 'S', '…Fff… — straining for it',
           'Seven tries again, straining, brow furrowed, lips working, chasing something deep in the dark of his own '
           'mind.', 'close-up', lines=[('SEVEN', '…Fff…')]),
        sh(6, 'S', '…Fuck.',
           'Extreme close-up: Seven\'s mouth slowly forms one short word, very quietly, confused — like finding a coin '
           'in an old coat pocket.', 'extreme close-up', lines=[('SEVEN', '…Fuck.')]),
        sh(4, 'S', 'He blinks', 'Seven blinks, surprised at himself.', 'close-up'),
        sh(4, 'D', 'Dolo stares', 'Dolo stares at him.', 'close-up'),
        sh(5, 'S', 'Fuck. (louder, testing it)',
           'Seven says it again, slightly louder, testing the shape of it in his mouth.', 'close-up',
           lines=[('SEVEN', 'Fuck.')]),
        sh(4, 'D', '…What?', 'Dolo, deadpan.', 'close-up', lines=[('DOLO', '…What?')]),
        sh(4, 'S', 'Fuck.', 'Seven, with total conviction.', 'close-up', lines=[('SEVEN', 'Fuck.')]),
        sh(5, 'D', 'Okay.', 'Dolo slowly turns her head away and looks at nothing.', 'close-up',
           lines=[('DOLO', 'Okay.')]),
        sh(6, 'G', 'Grub, across the clearing: WHAT\'S HAPPENING?',
           'Across the clearing, Grub rears up with his mouth full of fruit and shouts over.', 'medium, long lens',
           lines=[('GRUB', 'WHAT\'S HAPPENING OVER THERE?')]),
        sh(4, 'D', 'He said a sound.', 'Dolo calls back, perfectly calm.', 'medium',
           lines=[('DOLO', 'He said a sound.')]),
        sh(4, 'G', 'WHAT KIND OF SOUND?', 'Grub, louder.', 'medium', lines=[('GRUB', 'WHAT KIND OF SOUND?')]),
        sh(4, 'D', 'An angry one.', 'Dolo, calm.', 'medium', lines=[('DOLO', 'I don\'t know. An angry one.')]),
        sh(5, 'G', '…IS HE GOING TO KEEP DOING IT?', 'Grub, suspicious, juice on his chin.', 'close-up',
           lines=[('GRUB', '…IS HE GOING TO KEEP DOING IT?')]),
        sh(8, 'S', 'Seven saying it to himself over and over, fascinated',
           'Seven sits murmuring one short word to himself over and over, deeply fascinated by the shape of it in '
           'his mouth.', 'medium close-up', lines=[('SEVEN', 'fuck. fuck. fuck.')]),
        sh(5, 'D', 'Probably.', 'Dolo, watching him.', 'close-up', lines=[('DOLO', 'Probably.')]),
        sh(8, 'SGPD', 'Wide: the clearing',
           'Wide shot of the sunny clearing: Grub, Petch and Dolo feeding, and at the edge Seven, muttering to '
           'himself.', 'wide, static',
           lines=[('CAP', 'It would, eventually, change the world.'),
                  ('CAP', 'But not today. Today it just annoyed everyone.')]),
    ])

STREAM = dict(
    title='The stream', when='Late morning', place='stream', look='dry', new=True,
    note='NEW — not in your script. Seven sees his own face for the first time, plus a Grub gross-out joke. '
         'Cut it if you don\'t want it.',
    summary='The troop comes down to a stream to drink. Seven leans over a still pool and sees a face looking back — '
            'he jerks away, creeps back, bares his teeth at it, touches the water and the face breaks apart. He holds '
            'his arm over the pool and the reflection does the same. Petch makes faces at himself, then notices Grub '
            'upstream, squatting in the water looking very relieved. Petch spits: "GRUB. WE ARE DRINKING THAT." Grub: '
            '"IT\'S MOVING WATER." Dolo moves upstream. Seven, oblivious, puts his face in the pool and drinks deep. '
            'Petch: "…Nobody tell him."',
    shots=[
        sh(10, '', 'A clear jungle stream', 'A clear, slow jungle stream winds between mossy rocks and roots, '
           'sunlight glittering on the water.', 'wide, slow drift'),
        sh(8, 'SGPD', 'The troop comes down to drink',
           'Grub, Petch, Dolo and Seven come down out of the trees to the stream bank to drink.', 'wide'),
        sh(8, 'PD', 'Petch and Dolo drink',
           'Petch and Dolo crouch at the water\'s edge and drink, lips to the water, the way chimpanzees do.',
           'medium, low over the water'),
        sh(6, 'S', 'Seven leans over a still pool',
           'Seven crouches at a still pool at the edge of the stream and leans over the water.', 'medium'),
        sh(8, 'S', 'A face looks back up at him',
           'In the still water Seven\'s reflection looks back up at him — a big, ragged, mud-streaked chimpanzee '
           'face.', 'over his shoulder, looking down into the pool'),
        sh(4, 'S', 'He jerks back', 'Seven jerks back from the water in alarm.', 'medium'),
        sh(6, 'S', 'He creeps back to look again', 'Seven creeps forward again and peers into the pool, very '
           'suspicious.', 'close-up'),
        sh(6, 'S', 'He bares his teeth — so does the face',
           'Seven bares his teeth at his reflection; the reflection bares its teeth back. He freezes.',
           'over his shoulder into the pool'),
        sh(6, 'S', 'He touches the water — the face breaks apart',
           'Seven reaches out and touches the surface; his reflection breaks apart into ripples.', 'close-up'),
        sh(6, 'S', 'He looks at his wet fingers, then his arm',
           'Seven looks at his wet fingers, then turns his left forearm over to look at the shattered screen, then '
           'looks back at the water, putting it together.', 'medium close-up'),
        sh(8, 'S', 'He holds his arm over the pool — so does the reflection',
           'Seven slowly holds his forearm out over the pool; in the water the reflection holds out the same arm, the '
           'cracked screen catching the light.', 'looking down into the pool'),
        sh(6, 'P', 'Petch sidles up and pulls a face at himself',
           'Petch sidles up, looks into the pool and pulls a goofy face at his own reflection.', 'close-up'),
        sh(5, 'P', '…then checks nobody saw', 'Petch catches himself and looks around to see if anyone saw.',
           'close-up'),
        sh(8, 'P', 'Petch drinks — then looks upstream',
           'Petch leans down to drink again, slurps, then slowly looks up and upstream, his face changing.',
           'medium, low'),
        sh(6, 'G', 'Upstream: Grub squatting in the water, looking very relieved',
           'Upstream, Grub squats in the shallow water with his back half turned, staring into the distance with a '
           'look of deep, private relief.', 'medium wide, long lens'),
        sh(4, 'P', 'Petch spits it out', 'Petch spits out a mouthful of water and gags.', 'close-up'),
        sh(6, 'P', 'GRUB. WE ARE DRINKING THAT.', 'Petch, outraged, pointing upstream.', 'medium',
           lines=[('PETCH', 'GRUB. WE ARE DRINKING THAT.')]),
        sh(6, 'G', 'IT\'S MOVING WATER.', 'Grub, not moving, completely unbothered, waves a hand.', 'medium',
           lines=[('GRUB', 'IT\'S MOVING WATER.')]),
        sh(4, 'D', 'Dolo quietly moves upstream of him',
           'Dolo, without a word, gets up and moves to drink upstream of Grub.', 'wide'),
        sh(6, 'S', 'Seven, oblivious, drinks deep from the pool',
           'Seven, oblivious, puts his whole face in the pool and drinks deeply.', 'medium, low over the water'),
        sh(4, 'P', 'Petch, horrified: nobody tell him', 'Petch watches him, horrified.', 'close-up',
           lines=[('PETCH', '…Nobody tell him.')]),
    ])

SCENES = [MARCH, FIRST_WORD, STREAM]
