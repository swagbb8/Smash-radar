from ep import sh

COLD_OPEN = dict(
    title='Cold open — ARISE', when='Dawn', place='swamp_dawn', look='mud', new=False,
    note="Ash's own words are the script. Movement heavy and exhausted, never graceful; the only stillness is when he "
         "sees the device. Sound: swamp, insects, dripping water; one low wrong hum when he touches the device.",
    summary="Black. Seven's eyes slide open in the swamp grass. He lies face-down, covered head to toe in cold mud, "
            "rises to sitting, looks around in confusion, stands knee-deep in the mud among endless rows of trees and "
            "hanging vines. Looking up, the sun barely gets through the leaves. A branch is close enough: he jumps, "
            "catches it with one hand, sees a device dug into his arm, freezes, slips, falls on his back into the "
            "water, swims up, latches on, hauls himself up through sharp pain in his back, sits on the branch and "
            "stares at the shattered palm-sized screen, mesmerized. Smash cut to black.",
    shots=[
        sh(3, '', 'Black. The swamp fades in: insects, dripping water.', kind='mine'),
        sh(8, '', 'His POV: eyes slide open, grass right at eye level',
           'First-person point of view of someone lying flat on the ground and waking up: wet blades of swamp grass '
           'right in front of the lens, blurry, slowly sliding into focus as heavy eyes open for the first time. Dim '
           'green light filters down, mist drifts, a drop of water runs down a blade of grass.',
           'locked at ground level, a tiny groggy drift', snd='insects, dripping water, one slow breath',
           his='i slid my eyes open the grass met up to my eye view'),
        sh(6, 'S', 'His eye opens in the mud',
           'Extreme close-up of Seven\'s face lying sideways in black mud: one amber eye opens, unfocused, mud '
           'clinging to his brow. He does not move. A slow blink.', 'extreme close-up, static, very shallow focus',
           his='i felt cold as the mud covers my body head to toe'),
        sh(8, 'S', 'Lying face-down, mud head to toe, shivering',
           'Seven lies face-down and motionless at the edge of the swamp, his whole body buried in cold black mud as '
           'if he was dropped there. A slow shiver runs through him; his fingers twitch and close in the mud.',
           'low wide shot at ground level, slow push in', his='quickly then i realized i was laying on the ground'),
        sh(10, 'S', 'He pushes up and drags himself round to sit',
           'Seven slowly pushes himself up out of the mud — heavy, exhausted, arms shaking, nothing graceful about it '
           '— the mud peeling off his arms and chest in thick sheets, then drags himself round into a sitting '
           'position, breathing hard.', 'medium-wide, eye level, static', his='i rose up in a sitting position'),
        sh(7, 'S', 'Sitting in the mud, eyes wandering, lost',
           'Close-up of Seven sitting in the mud: his eyes wander left and right in confusion, his breath steaming in '
           'the cold air, mud dripping from his chin. He has no idea where he is.', 'close-up, slow drift',
           his='my eyes started wandering in confusion'),
        sh(10, '', 'His POV: looking round the swamp',
           'First-person view from someone sitting in the mud, slowly looking around a dark swamp: rows and rows of '
           'tall trunks fading into darkness, more rows behind them, vines hanging down from tree to tree, black '
           'water, mist.', 'slow handheld pan from left to right at sitting height',
           his='of why i woke from swamp lands'),
        sh(8, 'S', 'He stands — cold mud up to his knees',
           'Low angle on Seven\'s legs as he stands up in the swamp: cold black mud sucks at his feet and swallows '
           'his legs up to the knees; he straightens and rises tall on two legs, mud sliding down his body.',
           'low angle, tilting up from the mud to his chest',
           his='the ground filled my feet of cold mud up to my knees when i was standing tall'),
        sh(10, 'S', 'Wide: small among rows and rows of trees',
           'Wide shot from behind: Seven stands knee-deep in the swamp, small among rows and rows of giant trunks '
           'leading into darkness, more rows of trees behind them, vines hanging down connected together from one '
           'tree to another.', 'wide, slow push forward',
           his='the trees were rows and rows leading to darkness of more rows of trees with viens hanging down '
               'connected together to one another'),
        sh(5, 'S', 'He looks up', 'Close-up: Seven slowly tips his head back and looks up, squinting at the faint '
           'light far above.', 'close-up from slightly below', his='Looking up'),
        sh(10, '', 'His POV: the sun barely getting through the leaves',
           'First-person view looking straight up through a thick canopy: the sun trying to climb through the leaves '
           'but barely getting through, a few dim shafts of light falling down into the swamp.',
           'looking straight up, a slow turn',
           his='i saw the sun trying to climb through the leaves of the trees but just barely brings a dim light '
               'down below'),
        sh(6, '', 'Dim light on the swamp water',
           'Dim shafts of sunlight touch the black surface of the swamp water and reflect off it; tiny insects drift '
           'through the light; slow ripples spread.', 'low over the water, slow slide sideways',
           his='reflecting off the water of the swamp'),
        sh(6, '', 'His POV: a branch, close enough',
           'First-person view: a thick mossy branch reaches out low over the swamp water, close enough to grab.',
           'slow push toward the branch', his='there was a branch close enough to me so i can get out of the swamp'),
        sh(6, 'S', 'He crouches, eyes on the branch',
           'Seven crouches in the mud with his eyes locked on a thick branch above him, gathering himself, muscles '
           'bunching.', 'medium shot, static'),
        sh(5, 'S', 'He jumps, both hands reaching',
           'Seven launches himself up out of the mud, both arms reaching desperately for a thick branch above, mud '
           'flying off his body. Desperate, not athletic.', 'from behind and below, slow motion',
           his='I only then jumped up reached out my hands to try to cling on'),
        sh(5, 'S', 'One hand catches — the other arm swings up in front of his face',
           'Seven catches the branch with his right hand and hangs; his left forearm swings up in front of his face '
           '— and something on it catches his eye.', 'medium close-up, from slightly below',
           his='but by the time i did'),
        sh(6, 'S', 'The device dug into his arm',
           'Extreme close-up of Seven\'s left forearm under the mud: a palm-sized device dug into the arm under the '
           'skin — a scar line, faint circuit patterns in the flesh beneath the fur, a small shattered glass screen.',
           'macro, slow push in', his='i noticed a device dug into my arm'),
        sh(5, 'S', 'He freezes',
           'Close-up of Seven\'s face as he hangs from the branch: he freezes completely, eyes locked on his own '
           'forearm. Total stillness.', 'close-up, static', his='i froze'),
        sh(4, 'S', 'His fingers slip',
           'Close-up of Seven\'s fingers on wet, mossy bark: they slide, one by one, and lose their grip.',
           'macro on the hand', his='slipped off the branch'),
        sh(5, 'S', 'He falls backwards into the water',
           'Seven drops off the branch and falls backwards into the swamp water with a huge splash.',
           'wide, slow motion', snd='a heavy splash', his='falling to the water'),
        sh(6, 'S', 'Under water: his back hits the bottom',
           'Under water: Seven sinks and hits his back hard on the muddy bottom; a cloud of silt bursts up; bubbles '
           'stream from his mouth.', 'under water, side view', place='under', look='wet',
           his='hitting my back on the ground'),
        sh(5, 'S', 'He swims back up',
           'Under water: Seven kicks off the bottom and swims hard up toward the dim light at the surface, bubbles '
           'trailing behind him.', 'under water, looking up toward the surface', place='under', look='wet',
           his='swimming back up quickly'),
        sh(6, 'S', 'He bursts up and grabs the branch — both hands, tight',
           'Seven bursts up out of the black water gasping and grabs the branch again — this time with both hands, '
           'latching on tight.', 'medium, at water level', look='wet',
           his='grabbing the branch again this time i latched on tightly'),
        sh(8, 'S', 'He hauls himself up — sharp pain in his back',
           'Seven hauls himself up the branch, muscles straining, water pouring off him; halfway up he winces hard '
           'and arches as a sharp pain stabs through his back, but he keeps pulling.', 'medium close-up, from below',
           look='wet', his='pulling myself up as i feel sharp pain in my back'),
        sh(8, 'S', 'He gets on top of the branch',
           'Seven drags himself on top of the thick branch, clings to it, and works his way into position against '
           'the tree, breathing hard, water dripping into the swamp below.', 'medium-wide, slow move round him',
           look='wet', his='i managed to get on top of the branch and position myself hanging from the tree'),
        sh(8, 'S', 'He sits and stares at his arm',
           'Seven sits down on the branch above the swamp, dripping, and slowly lifts his left forearm in front of '
           'his face, staring at it.', 'medium shot, slow push in', look='wet',
           his='i sit down and stare at whatever this thing on my arm is'),
        sh(8, 'S', 'Close: the shattered screen, the size of his palm',
           'Extreme close-up: Seven\'s right fingertip touches the small shattered glass screen fused into his left '
           'forearm; it is about the size of his palm. A faint cold flicker of light moves under the cracks.',
           'macro, very slow push in', snd='one low, wrong electronic hum', look='wet',
           his='the screen was shattered it fit the size of my palm'),
        sh(8, 'S', 'His face: mesmerized',
           'Close-up of Seven\'s face, mesmerized, staring down at his arm; a faint cold blue light flickers in his '
           'eyes; water drips from his brow. He does not blink.', 'close-up, very slow push in, then completely still',
           look='wet', his='i was mezmorized … i never seen anything like it'),
        sh(1, '', 'SMASH CUT TO BLACK', kind='mine'),
        sh(6, '', 'Title: MONKEY\'S LIFE — Episode 1 — "ARISE"', kind='mine'),
    ])

TITLES = dict(
    title='The world', when='Morning', place='world', look='wet', new=True,
    note='NEW — not in your script: after the title card, a look at the world he woke up in, then back down to him. '
         'The words on screen are from your MagicLight version.',
    summary='Slow aerial views of an ancient Earth with no humans anywhere — misty jungle, a river, mountains — then '
            'down through the canopy into the swamp, to a tiny figure still sitting on the branch. Words on screen: '
            '"This is the world before words. Before fire. Before any of it."',
    shots=[
        sh(10, '', 'Aerial: endless misty jungle at dawn',
           'Slow aerial flight over an endless primeval jungle at dawn, mist pouring between the trees, no sign of '
           'any human anywhere.', 'aerial, slow glide', lines=[('CAP', 'This is the world before words.')]),
        sh(10, '', 'Aerial: a river winding through the jungle',
           'A wide river winds through endless jungle under low clouds; a flock of birds lifts off the trees.',
           'aerial, slow glide along the river', lines=[('CAP', 'Before fire. Before any of it.')]),
        sh(10, '', 'Aerial: mountains over the jungle, first sun',
           'Purple mountains rise out of a sea of jungle and mist as the first sun touches the peaks.',
           'aerial, slow push toward the mountains'),
        sh(10, 'S', 'Down through the canopy to Seven, tiny on his branch',
           'The camera sinks down through the jungle canopy into a dark swamp and finds Seven, tiny far below, still '
           'sitting on a thick branch above black water, staring at his arm.', 'slow aerial descent',
           place='swamp_morning'),
    ])

TROOP = dict(
    title='The troop', when='Morning', place='swamp_morning', look='wet', new=False,
    note='From your Episode 1 script (comic lines added). Grub, Petch and Dolo are chimps like Seven, so no tails: '
         'the tail grab is now Seven grabbing Grub\'s foot.',
    summary='Seven, still on the branch, licks the device, tries to bite it, looks around, wiggles his toes — the most '
            'satisfying thing that has ever happened to him. Whooping in the distance. Three chimps drop out of the '
            'tree and land around him screaming: Grub (furious display — where were you, we thought you were dead), '
            'Petch (what is on your arm, is it a growth), Dolo (he doesn\'t remember anything; look at his eyes). '
            'Seven touches Grub\'s ear and Grub loses his mind. Seven grabs Grub\'s foot and studies it. Petch: is he '
            'going to be like this forever? The troop climbs away and Seven follows.',
    shots=[
        sh(8, 'S', 'Still on the branch, turning his arm in the light',
           'Seven sits on a thick branch above the swamp, still staring at his forearm, turning it slowly in a thin '
           'shaft of morning light.', 'wide, static'),
        sh(6, 'S', 'He licks the device — makes a face',
           'Close-up: Seven brings his forearm to his mouth and licks the shattered screen, then pulls back and makes '
           'a disgusted face.', 'close-up'),
        sh(6, 'S', 'He tries to bite it — nothing',
           'Close-up: Seven bites down on the device in his forearm, worrying at it with his teeth. Nothing happens. '
           'He stops and glares at it.', 'close-up'),
        sh(8, 'S', 'Tree. Tree. Dead bird. Tree.',
           'Seven looks around with slow, deliberate attention, his head turning from one thing to the next — a '
           'trunk, another trunk, a dead bird in the roots, another trunk — cataloguing everything with no idea what '
           'any of it is.', 'medium close-up, slow'),
        sh(5, '', 'A dead bird in the roots', 'A small dead bird lying in tangled wet roots at the swamp\'s edge.',
           'close, static'),
        sh(6, 'S', 'He wiggles his toes',
           'Close-up of Seven\'s bare foot gripping the branch: the toes wiggle, curl and spread.',
           'close-up on the foot'),
        sh(6, 'S', 'Best thing ever. He does it again.',
           'Seven watches his own toes wiggle with wide-eyed delight, as if it is the most satisfying thing that has '
           'ever happened to him — then does it again.', 'medium close-up'),
        sh(6, 'S', 'Whooping in the distance — he freezes',
           'Seven suddenly freezes mid-wiggle and lifts his head, listening hard.', 'close-up',
           snd='distant chimpanzee hoots and shrieks and crashing branches, getting louder'),
        sh(8, '', 'Far off, the canopy shakes — something coming',
           'Far off through the rows of trunks, high branches shake and leaves rain down as several large dark shapes '
           'crash through the canopy toward the camera.', 'wide, looking up through the trees',
           snd='whooping, shrieking, bodies thundering through branches'),
        sh(5, 'S', 'He looks left. Right.', 'Seven looks left. Looks right. Nervous.', 'medium close-up'),
        sh(4, 'S', '…Up.', 'Seven slowly looks straight up.', 'close-up from above'),
        sh(6, 'GPD', 'Three chimps drop out of the tree and land around him screaming',
           'Grub, Petch and Dolo drop out of the tree directly above the camera and land hard on the big branch and '
           'roots in a semicircle, screaming at the top of their lungs.', 'low angle looking up, then they land in '
           'frame', snd='chimpanzee screams'),
        sh(10, 'G', 'Grub\'s full display — WHERE WERE YOU?!',
           'Grub does a full, furious chimpanzee display right in the camera\'s face: hair bristling, chest puffed, '
           'screaming, slapping the branch, shaking a vine.', 'medium close-up, handheld',
           lines=[('GRUB', 'WHERE WERE YOU?! WE LOOKED EVERYWHERE!'), ('GRUB', 'DOLO SAID YOU WERE DEAD! I SAID YOU '
                  'WERE DEAD!')], snd='furious chimpanzee screams and hoots'),
        sh(8, 'G', 'Grub keeps raging — the eastern ridge',
           'Grub keeps raging, pacing along the branch, jabbing a finger, hooting furiously.', 'medium, handheld',
           lines=[('GRUB', 'PETCH SAID YOU RAN OFF WITH THAT GROUP FROM THE EASTERN RIDGE'),
                  ('GRUB', 'AND HONESTLY THAT MADE ME THE MADDEST!')]),
        sh(6, 'G', 'We thought you were DEAD. I cried.',
           'Grub stops, breathing hard; his lip trembles for a second, then he scowls and looks away.', 'close-up',
           lines=[('GRUB', 'We thought you were DEAD. I cried. I\'m not ashamed.'), ('GRUB', 'Well — a little ashamed.')]),
        sh(10, 'P', 'Petch freaks out about the arm',
           'Petch points frantically at something on the camera\'s side while leaning back as far as he can, as if it '
           'might explode, shrieking.', 'medium close-up',
           lines=[('PETCH', 'WHAT IS THAT. WHAT IS ON YOUR ARM. IS THAT A GROWTH. DO YOU HAVE SOMETHING.'),
                  ('PETCH', 'BECAUSE IF YOU HAVE SOMETHING I NEED YOU TO STAY AWAY FROM ME.')]),
        sh(6, 'S', 'Seven just stares at them, blank',
           'Seven stares back at them with wide, completely blank eyes.', 'close-up'),
        sh(8, 'D', 'Dolo, very still: he doesn\'t remember anything',
           'Dolo sits very still on the branch, not screaming, staring hard into the camera.', 'close-up, static',
           lines=[('DOLO', 'He doesn\'t remember anything.')]),
        sh(4, 'G', 'Grub: What?', 'Grub whips his head round.', 'close-up', lines=[('GRUB', 'What?')]),
        sh(7, 'D', 'Look at his eyes.', 'Close-up of Dolo, calm and certain, still watching.', 'close-up',
           lines=[('DOLO', 'Look at his eyes. He doesn\'t know who we are.')]),
        sh(6, 'GPD', 'They all look at Seven',
           'Grub, Petch and Dolo turn and stare at the camera in total silence.', 'wide, static'),
        sh(6, 'SG', 'Seven is looking at Grub\'s ear',
           'Seven is not listening; he is staring with fascination at Grub\'s ear.',
           'over Seven\'s shoulder onto Grub\'s ear'),
        sh(6, 'SG', 'He reaches out and touches it',
           'Seven slowly reaches out and gently touches Grub\'s ear with one finger, curious.', 'close two-shot'),
        sh(10, 'G', 'Grub loses his mind',
           'Grub completely loses his mind: leaping back, screaming, hair standing on end, slapping the branch, '
           'clutching his ear.', 'medium, handheld',
           lines=[('GRUB', 'HE TOUCHED MY EAR! DO NOT TOUCH MY EAR!'),
                  ('GRUB', 'THAT IS EXTREMELY DISRESPECTFUL! THAT IS—')], snd='outraged chimpanzee screaming'),
        sh(3, 'D', 'Dolo, flat: Grub.', 'Dolo, flat and unbothered, does not even raise her voice.', 'close-up',
           lines=[('DOLO', 'Grub.')]),
        sh(5, 'G', 'I KNOW, I KNOW…', 'Grub, still clutching his ear, waves a hand at her.', 'medium',
           lines=[('GRUB', 'I KNOW, I KNOW, HE DOESN\'T REMEMBER, BUT MY EAR—')]),
        sh(3, 'D', 'Grub.', 'Dolo, unmoved.', 'close-up', lines=[('DOLO', 'Grub.')]),
        sh(5, 'G', '…Fine.', 'Grub deflates and sulks, arms folded.', 'medium', lines=[('GRUB', '…Fine.')]),
        sh(8, 'SG', 'Seven grabs Grub\'s foot and studies it like a scientist',
           'Seven has grabbed Grub\'s big foot and is turning it over in his hands, spreading the toes and studying '
           'them with deep scientific interest, while Grub stands frozen on one leg, his dignity gone.',
           'medium two-shot'),
        sh(6, 'PD', 'Petch whispers to Dolo',
           'Petch leans in to Dolo and whispers, wringing his hands.', 'two-shot',
           lines=[('PETCH', 'Is he going to be like this forever?'),
                  ('PETCH', 'Because I cannot emotionally handle this.')]),
        sh(4, 'D', 'Dolo doesn\'t answer — she\'s watching his eyes',
           'Dolo does not answer; she keeps watching, thinking.', 'close-up'),
        sh(10, 'SGPD', 'The troop climbs away into the trees — Seven follows',
           'Grub and Petch climb away from the swamp up into the trees; Dolo stops and looks back; after a moment '
           'Seven follows, climbing clumsily but surely — his body knows how, even if he doesn\'t.', 'wide'),
    ])

SCENES = [COLD_OPEN, TITLES, TROOP]
