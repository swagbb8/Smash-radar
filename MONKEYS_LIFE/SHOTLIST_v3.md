# Episode 1 "ARISE" — v3 shot list (script doctor, Oct 25 2026). Target ~30:00. Implementation brief for the ep1_*.py scene files.

Rules for every new shot: the troop NEVER speaks before scene 9 (no `lines` for grub/petch/dolo except in W shots); only seven,
scientist_a, scientist_b, 'voice' (a scientist heard in a memory flash) and 'cap' (captions) have lines. Flash shots = lab set,
exposure up (~1.3–1.5), f/1.4–2.0 shallow focus, 1.5–3 s. Use behavior.py for real chimp acting (pant_hoot, pant_grunt, fear_grin,
scream, play_face, lip_smack, chew, bob, sway, rock, scratch, slap_ground, hand_out, look_away). Shot IDs must be unique across ALL
files (frames folders are named by shot id). Existing: lab B01–B20 C01–C05; alone A01–A12; bow K01–K09 I01–I15 N01–N07; fire F01–F11
LabFire S01–S04 G01–G09 W01–W07; fish K01–K24 L04 L05; night R01–R20 X01–X06 N01–N09.

STORY TIMELINE: Day 1 (wake, alone, taken, interrogation, crowned) · Night 1 (can't climb) · Day 2 (school, fire) · Night 2 (fire night,
Dolo keeps it alive) · Day 3 (spear, fishing, rescue, ridge) · Night 3 (challenge, first words, nest).
EPISODE ORDER: 1 Lab · 2 Arise · TITLE · 3 Alone · 4 Taken · 5 Interrogation · 6 New One · 6n Night One · 6b School · 7 Fire + 8a Spear ·
8b Fishing/One Petch · 8c Ridge · 7b Challenge + 9 First Words · 10 Under the Stars · END.
KEY LOGIC: "FUCK YOU" worked in scene 5 because the device FLARED with it (I09 device_power 1.0). Overuse wears the bows down
(N05 Grub late -> Q08 token nod -> Q09 fraction -> K26 Grub refuses -> G04 charges through it; G14 macro: device dark — it was never
the word). The spear solves the high-fruit problem; Grub's status returns through it (rival-troop hoots) -> motive for the Challenge.
"Seven" is planted by "Not food, Seven." (C02, Q03) and paid by W12 flash + W04. Seven's "giving" arc: Z rescue, G17 gives the spear
back, G18 gives up the best spot.

## SCENE 1 — THE LAB (ep1_lab.py) add D01–D11 (+64 s)
Order: B01, B02, D01, C01, B03, D03, B04, B05, C02, B06, D11, D02, B07, B08, B09, C03, D04, C04, D05, B10, B11, B12, D06, B13, D07, C05, B14, B15, D08, B16, D09, B17, B18, B19, B20, D10
- D01 6.5 Seven,A,B medium — Dr A scratches the back of his head reading the screen; Seven on the stool does the same, same moment. lines [(1.0,'scientist_b',"He's doing you again."),(3.6,'scientist_a',"He's not doing me.")] — on "me" both scratch again.
- D03 6.5 Seven,A close — Dr A over-articulates at the fishing card; Seven leans in, lips funnelled, a full pant-hoot in his face. [(0.4,'scientist_a',"Fish. Fiiish. Say it, Seven."),(4.4,'scientist_b',"…He said it.")]
- D11 6.0 Seven,B medium — the tower taller than he can reach: he stands up ON the stool to finish it. [(3.8,'scientist_b',"He's never done that.")]
- D02 6.5 Seven,A close on hands — Dr A holds out his hand, Seven puts his in it, one shake. Dr A lets go; Seven's hand stays out, he stares at it. [(1.8,'scientist_a',"Good job, Seven. Shake.")]
- D04 8.0 Seven between A and B, medium; his eyes slide to the door. [(0.8,'scientist_b',"Do they ever tell you what it's for?"),(3.4,'scientist_a',"Recall. That's all they ever say. Recall."),(6.3,'scientist_a',"Don't get attached.")]
- D05 5.0 POV through the door window: square of daylight; something small and dark crosses it.
- D06 4.5 Seven close — after the screen dies: his face faint in the black glass; he touches it.
- D07 6.0 Seven,B close — Dr B holds fruit on a flat palm; he takes it delicately with his lips. Over her shoulder on the counter: the syringe. He stops chewing.
- D08 3.0 Seven POV — the needle swims in and out of focus (alarm light).
- D09 4.0 Seven,A medium handheld — Dr A grabs his arm; Seven whips round, canines bared, bites the coat sleeve; Dr A rips free. [(0.3,'scientist_a',"Hold—"),(2.0,'scientist_a',"He BIT me!")]
- D10 8.0 A,B medium-wide — white-out over, alarm still going. Dr A picks the fire card up off the floor, turns it over. [(2.0,'scientist_b',"Where did it send him?"),(5.2,'scientist_a',"…Not where.")]

## SCENE 2 — ARISE (old footage; optional new E01–E03 +20 s, after the device stare, before the title)
- E01 4.0 macro — cracked screen stutters: one heartbeat of white light, the stool in the white room, gone.
- E02 6.0 close — he sniffs the device, smacks the side with his palm like Dr A smacked the screen. Nothing.
- E03 10.0 extreme wide — morning mist; one small figure on a branch above the swamp; no human sound anywhere.

## SCENE 3 — ALONE (ep1_alone.py) add A13–A19, A21, A23 (+58 s)
Order: A13, A14, A01, A02, A03, A04, A05, A06, A19, A10, A15, A11, A16, A23, A12, A21, A07, A08, A09, A17, A18
- A13 8.0 Seven wide (forest set) — knuckle-walking but keeps rising onto two legs like someone used to floors, wobbling, tipping back down; stops dead at every sound.
- A14 6.0 Seven medium (forest) — tries to climb a trunk, gets halfway, slides down.
- A19 5.0 Seven macro->close — caterpillar on a leaf; he picks it up, considers it seriously, puts it back very gently.
- A15 8.0 Seven medium — idly stacks three flat stream stones into a tower, fast, like the blocks; sits back and waits for praise, looking round. One stone dark and glassy. Nobody comes. He knocks it over. (Seven silent.) [(4.2,'voice',"Good. Again.")]
- A16 6.0 Seven close — the device stings; he scratches the skin round it hard and fast (anxious self-scratching).
- A23 6.0 Seven wide — after A11 he snaps: scream-tantrum, slapping the water, hurling a stone into the pool; sits, panting.
- A21 7.0 Seven medium, late light — curls on the bank to sleep, eyes open. A rustle; he's up again.
- A17 5.0 Grub medium (in the tree, after A09) — drops low, a long pant-hoot; far off two answering hoots. Calling the troop.
- A18 7.0 Seven wide (SWAMP set) — back on the swamp bank where he woke; sits turning the device in the evening light. Leads into K01.

## SCENE 4 — TAKEN (ep1_bow.py) add T01–T09 (+46.5 s)
Order: K01, K02, T01, K03, K04, K05, T02, K06, K07, T03, T04, K08, T05, T06, T07, K09, T08, T09
- T01 4.0 POV from the canopy looking down at Seven; a huge hand closes on the branch; heavy breathing.
- T02 5.0 Seven,Grub medium — Seven tries palm up and out like at the scientists; Grub slaps it aside, screams louder; Petch fear grin.
- T03 8.0 all wide (swamp->forest) — he bolts along the bank half upright; Grub thunders after on all fours; Seven trips over a root.
- T04 4.0 Seven POV low ragged — crashing through ferns, Grub's hoots closing in.
- T05 6.0 Seven,Grub,Petch medium — dragged, Seven grabs a sapling with hands and feet; Grub yanks; tug; all three tumble.
- T06 2.5 FLASH — white sleeves holding his arms down. [(0.2,'voice',"Hold him.")]
- T07 5.0 Petch,Seven close — Petch keeps poking the device and leaping back.
- T08 6.0 extreme wide — the clearing and giant tree as they haul him in.
- T09 6.0 Dolo,Seven medium — at the edge of the clearing he digs in his heels; Dolo lays one hand flat on his back and pushes, not rough. He goes.

## SCENE 5 — THE INTERROGATION (ep1_bow.py) add I16–I24 (+44.5 s)
Order: I01, I02, I16, I03, I17, I04, I18, I19, I20, I05, I21, I06, I07, I08, I09, I10, I11, I12, I13, I14, I15, I24, I22, I23
- I16 6.0 Petch,Seven close — Petch pulls Seven's lip down to look at his teeth; Seven snaps; Petch leaps into Dolo's arms, she embraces him.
- I17 2.5 FLASH on Dolo's finger touching the device. [(0.2,'voice',"Recall's up four percent.")]
- I18 4.0 Grub,Seven close — Grub snatches the arm, sniffs the device, puts his teeth to it. Seven shrieks.
- I19 6.0 Grub,Seven,Dolo medium — Grub digs fingers in to pry it out; device flares red-white; Seven screams; Dolo one sharp bark; Grub lets go, furious.
- I20 5.0 Seven close — cradling the arm, holds the other palm up: "stop" — means nothing here.
- I21 4.0 Grub close — hair on end, starts rocking and swaying: the display building.
- I24 4.0 Petch,Grub medium — after the handshake, Petch proudly shows Grub his shaken hand; Grub slaps it down.
- I22 7.0 Dolo,Seven close — Dolo offers the back of her hand to his mouth (chimp peace); Seven shakes it firmly instead. Dolo looks at her hand a long time.
- I23 6.0 Grub medium — he will NOT give his hand; turns his back, sits apart, scratches himself hard.

## SCENE 6 — THE NEW ONE (ep1_bow.py) add Q01–Q10, Q12, Q15 (+70 s)
Order: N01, Q01, N02, Q10, N03, Q12, N04, N05, N06, Q15, Q02, Q03, Q04, Q05, Q06, Q07, Q08, N07, Q09
- Q01 6.0 Petch,Seven close — Petch eats a caterpillar loudly, offers half on an open palm; Seven takes it politely, hides it behind his back.
- Q10 7.0 Dolo,Seven close — grooming near the device; he flinches hard (1 s syringe flash); she lip-smacks, waits; he lets her.
- Q12 6.0 Grub medium-wide — exiled from the shade, in full sun, squinting, slapping flies, glaring at the shade.
- Q15 7.0 Seven,Grub wide — Seven rides on Grub's back (like young chimps) pointing across the clearing; Grub, murder in his face, carries him.
- Q02 7.0 Seven,Dolo medium — Seven "reads" a big flat leaf held like the newspaper, frowning; Dolo leans in and smells it.
- Q03 6.0 Petch,Seven close — Petch puts a stone in his mouth; Seven takes it out, Dr A's flat tone. [(1.2,'seven',"Not food, Seven.")]
- Q04 5.0 Petch,Seven medium — Petch hands him fruit; Seven, as thanks: [(1.4,'seven',"Fuck you.")]; Petch bows, thrilled.
- Q05 5.0 Grub,Seven medium — Seven wants Grub's fruit, points: [(1.0,'seven',"FUCK YOU.")]; Grub bobs and lets go; Seven takes it.
- Q06 6.0 Seven,Petch medium — says it to a tree; nothing; louder. [(0.8,'seven',"…fuck you."),(3.0,'seven',"FUCK YOU!")] Petch bows to the tree to be safe.
- Q07 6.0 all wide — from a low branch like a king giving a speech: [(0.6,'seven',"FUCK YOU!")]; all crouch-bob-pant-grunt; Grub barely dips.
- Q08 4.0 Grub close — his bow is a nod now, still chewing.
- Q09 5.0 Seven,Grub close two-shot — softly [(0.8,'seven',"…fuck you.")]; Grub holds his eyes a long time, bows a fraction, eyes never leaving him. Seven's grin fades.

## SCENE 6n — NIGHT ONE (night set) V01–V09 (56 s)
- V01 8.0 all wide — dusk to dark; the troop climbs into nests in the giant tree; Seven left alone at its foot.
- V02 6.0 Seven medium — jumps for the trunk, hugs it, slides down. Again.
- V03 5.0 Petch close — face over the edge of his nest, watching.
- V04 7.0 Petch,Seven medium — Petch climbs down, slaps the trunk, shoots up a body length, looks back: like this. Seven copies, a little higher.
- V05 6.0 Petch,Seven close — Petch reaches down, grips his hand the way they shook, hauls him up to a fork.
- V06 7.0 Seven medium — on a bare branch he sits upright like on the lab stool, arms folded, eyes closing; tips, catches himself, tips.
- V07 4.0 wide — he falls out (not far) into the leaf litter. Thump.
- V08 6.0 Seven,Dolo close — on the ground, leaves in his fur, looks up; Grub snoring above; Dolo's eyes open, watching.
- V09 7.0 Seven close — curls at the foot of the tree, the device to his chest, its faint blue the only light.

## SCENE 6b — SCHOOL (clearing, Day 2 morning) H01–H14 (78 s)
Order: H01, H14, H02, H03, H04, H05, H06, H07, H08, H09, H10, H11, H13, H12
- H01 7.0 all wide — in the shade he sits the three in a row facing a flat rock ("table"), squats behind it like Dr A; Grub led there by the hand.
- H14 6.0 all medium — the handshake has spread: Petch shakes Dolo's, Dolo Grub's, Grub shakes Petch's so hard Petch flies.
- H02 5.0 Seven,Petch close — Seven holds a leaf up like a card at Petch's face. Petch eats it. [(0.6,'seven',"What's he doing, Seven?")]
- H03 4.0 Seven close — deadpan, Dr A's tone; another leaf; Petch eats that too. [(0.4,'seven',"Good. Again.")]
- H04 7.0 Seven,Grub medium — stacks three stones fast in front of Grub, taps the ground [(3.6,'seven',"Again.")]; Grub flicks it over with one finger; Petch's panting laugh offscreen.
- H05 6.0 Dolo,Seven medium — unasked, Dolo restacks them slowly, perfectly. Seven stares. [(4.4,'seven',"…Eleven seconds.")]
- H06 5.0 Petch medium — balances one stone on his own head, enormously proud. [(3.2,'seven',"…Good.")]
- H07 7.0 Seven,Petch close — Seven takes Petch's arm like Dr B took his, taps the inside of the forearm with a twig. [(2.0,'seven',"Easy. Easy. Little scratch.")]
- H08 3.0 Petch close — eyes on the twig; full fear grin.
- H09 4.0 Petch medium — screams, rips free, flies up the big tree. Hard cut 1 s flash: Seven on the lab table screaming (B16).
- H10 7.0 Seven close — alone behind his rock table; looks at the twig, drops it, looks at the device in his own arm.
- H11 6.0 Seven,Petch medium — climbs (badly) below Petch's branch, holds his palm up open (the troop's peace gesture). Long moment; Petch touches it.
- H13 6.0 Grub close — alone, Grub sets one stone on another, checks nobody saw, knocks it over.
- H12 5.0 Seven medium — throws the twig away; bored, picks up two of the stones, the dark glassy one. Leads into F01.

## SCENE 7 — FIRE (ep1_fire.py) add F12, F13, F15–F23 (+68 s)
Order: F01, F02, LabFire, F03, F04, F12, F13, F05, F06, F07, F15, F16, F08, F17, F09, F10, F18, F22, F11, F19, F20, F23, F21
- F12 6.0 Petch medium — copying, bangs two stones, crushes his own finger, hoots, shakes the hand. Grub snorts.
- F13 5.0 Seven close — strike, nothing; slaps the ground, snarls at the stone. [(1.8,'seven',"…fuck you.")] Stones don't bow. Picks it back up.
- F15 7.0 Seven medium — the fire jumps to a dry tuft, spreads; he panics, stamps, kicks dirt on it. [(2.0,'voice',"Hot. Hot, Seven. No.")]
- F16 6.0 troop medium (in the trees) — huge eyes in the branches; Petch fear grin, Dolo embraces him.
- F17 7.0 Seven wide — time passing: he feeds it stick after stick as the light fades.
- F18 5.0 Petch close — hands warm, turns to Dolo with play face + panting laughter, holds his hands out again.
- F22 6.0 Petch,Seven close — Petch touches a flame on a dare; Seven grabs the hand and blows on it. [(2.8,'seven',"Hot.")]
- F19 6.0 Grub close — leans in too far, singes his brow hair, sniffs, leaps back, glares at Seven as if Seven did it.
- F20 6.0 Dolo,Seven medium — Dolo feeds in a stick, copying him exactly; he watches.
- F23 6.0 Seven,Dolo wide (night) — Seven asleep by the fire; Dolo climbs down from her nest and sits by it, awake.
- F21 8.0 Dolo,Seven medium (dawn, clearing) — embers; Dolo blows on them gently like he did; a flame comes back; Seven wakes and sees.

## SCENE 8a — THE SPEAR (ep1_fire.py) add S05–S15 (+59 s)
Order: S05, S06, S07, S08, S09, S01, S10, S02, S03, S04, S11, S12, S13, S14, S15
- S05 6.0 Grub wide morning — red fruit at the tip of a thin high branch; Grub crawls out, branch bends, backs off snapping his teeth at it.
- S06 5.0 Petch medium — gets further, branch dips, drops into the bushes.
- S07 4.0 Seven close — watching; the device pulses once.
- S08 2.0 FLASH the block tower, his hand. [(0.2,'voice',"Eleven seconds. Faster than yesterday.")]
- S09 6.0 Seven medium — reaches up with a long stick; blunt, slides off the fruit.
- S10 6.0 Seven,all medium — jabs up; the point skewers the fruit; brings it down on the tip. Silence. Dolo's eyes.
- S11 6.0 Grub,Petch medium — Grub stabs a fruit on the ground, lifts it proudly; Petch eats it off the tip.
- S12 7.0 all wide — distant pant-hoots: a rival troop (sound only). Everyone freezes, hair rising, Petch clings to Dolo. Grub stands, spear up, answers with a huge pant-hoot display, drumming the big tree's buttress roots with the spear. The far hoots stop. Grub magnificent.
- S13 5.0 Grub close — spear across his knees, eyes on Seven.
- S14 6.0 Seven,Grub medium — Seven reaches for his spear; Grub swings it away, bares teeth.
- S15 6.0 Seven medium — spear-less, stares down the slope toward the stream; picks up another long stick.

## SCENE 8b — FISHING + "ONE PETCH" (ep1_fish.py) add K25–K27, Z01–Z12 (+78 s)
Order: K01, K02, K03, K04, K25, K05, K06, K07, L04, L05, K08 … K23, K26, K27, Z01–Z12, K24 (new captions)
- K25 6.0 Grub medium — after his face-plant, stabs at the water with the spear over and over; fish scatter; soaks himself. Petch play face.
- K26 7.0 Seven,Grub,Petch medium — after Grub swallows the fish, Seven loses it: hair up, slapping stones, full display [(2.0,'seven',"FUCK YOU!")]. Grub, chewing, does NOT bow. Petch bows out of habit, sees Grub isn't, slowly un-bows.
- K27 5.0 Petch medium — copying, dangles a vine with no stick into the deep end, tremendously serious.
- Z01 5.0 Petch medium — out on a mossy stone at the deep pool, leaning further and further.
- Z02 2.0 macro — his foot slides on the moss.
- Z03 4.0 wide — splash; he's gone under.
- Z04 5.0 Petch medium — comes up thrashing, screaming, mouth full of water, goes under again. (Chimps can't swim.)
- Z05 6.0 Grub,Dolo wide — Grub charges the bank screaming, slapping the water, can't go in; Dolo reaches, too short.
- Z06 3.0 Seven close — 1 s flash: himself coming up out of the swamp water (Arise).
- Z07 5.0 Seven medium — runs out onto a stone, lays the pole across the water; Petch can't see it, goes under.
- Z08 6.0 Seven,Dolo medium — Seven goes in chest-deep, one hand on the pole; Dolo holds the other end on the bank; he grabs Petch by the scruff.
- Z09 6.0 Dolo,Grub medium — Dolo and Grub haul on the pole; Seven and Petch come up onto the stones.
- Z10 7.0 Petch,Dolo,Seven close — Petch coughs, shaking, Dolo embraces him; Seven sits down hard in the shallows.
- Z11 6.0 Petch,Seven close — Petch crawls over, buries his face in Seven's chest; Seven stiff, doesn't know what to do with his arms; then holds him.
- Z12 5.0 Grub close — wet only to the elbows, watches; grateful and humiliated; walks off with the spear.
- K24 re-staged 7.5 all wide — four wet chimps on the bank, the pole across the stones. [(0.8,'cap',"Invention number three."),(3.0,'cap',"It caught one fish."),(5.2,'cap',"And one Petch.")]

## SCENE 8c — THE RIDGE (ep1_night.py: reuse R/X silently + Y01–Y05, R21)
Keep R01–R09, R11, X01–X06, R14, R15, R20. CUT R10, R12, R13, R16–R19 (Dolo must not talk). X02 line -> [(0.2,'voice',"…recall is holding… Seven. Seven, look at me.")]. Insert Y shots between X06 and R14.
- Y01 6.0 Seven,B wide (lab after hours, half-lit blue-grey) — Seven in a corner on the floor; Dr B sits on the floor beside him with the cards.
- Y02 8.0 B,Seven close — tired, soft, Dr B holds up the fire card. [(1.0,'scientist_b',"This one's fire. You don't touch it."),(4.6,'scientist_b',"But you're going to need it.")]
- Y03 7.0 Seven,B close — [(1.0,'scientist_b',"They don't tell us why."),(3.8,'scientist_b',"They just keep saying: make sure he remembers.")]
- Y04 6.0 B,Seven close on hands — Dr B holds a hand out flat; Seven puts his in it; Dr B doesn't shake, just holds it.
- Y05 4.0 Seven,Dolo close (ridge) — his own hand open on the rock beside Dolo's.
- R21 6.0 Dolo,Seven close — replaces R16–R19: Dolo grooms the fur round the device, lip-smacking. No words. He lets his head drop.

## SCENE 7b — THE CHALLENGE (ep1_fire.py G01–G09 exist) add G10–G18, G20 (+44.5 s)
Order: G10, G01, G11, G02, G12, G03, G13, G04, G14, G05, G15, G16, G06, G07, G08, G09, G17, G18, G20
- G10 6.0 Seven,Petch,Dolo medium — night at the fire: Seven eats fruit, Petch pressed against him, Dolo grooming his arm. All the warmth to him. Grub a shape at the edge.
- G11 3.5 Grub macro — fingers tighten on the shaft; hair along his forearm rises.
- G12 4.0 Dolo close — sees it first: a sharp alarm bark ("wraa"); grabs Petch.
- G13 2.0 Seven POV — Grub coming out of the dark into the firelight, screaming.
- G14 2.0 device macro — dark. Nothing. (It was never the word.)
- G15 6.0 both wide — standoff: Grub bluff-charges twice bare-handed, slapping the ground, stamping; each time the swinging flame stops him short.
- G16 4.0 Seven close — Seven roars back: his own display, torch high, the lab-rampage face; 1 s flash of B16.
- G17 6.0 Seven,Grub close — Seven picks the spear out of the dirt, holds it out to Grub flat across his palms; Grub takes it.
- G18 6.0 Seven,Grub medium — Seven gets up off the best place by the fire, moves aside; as Grub sits, Seven gives him a clumsy crouch-bob-pant-grunt. Grub's mouth twitches into a play face.
- G20 5.0 Petch,Grub close — Petch sneaks back in, offers Grub a handshake; for the first time Grub shakes back, gently.

## SCENE 9 — FIRST WORDS (ep1_fire.py) add W08–W17 (+50.5 s)
Order: W08, W01, W02, W09, W10, W03, W11, W12, W04, W05, W13, W06, W14, W17, W15, W16, W07
- W08 6.0 all medium — quiet after the laughter; Petch watches Seven's mouth while he chews.
- W09 4.0 Seven close — warm, not Dr A's tone: [(0.8,'seven',"Good. Again.")]
- W10 4.0 Petch close — sprays spit, proud: [(0.5,'petch',"Fff— FFFF!")]
- W11 4.0 Seven,Petch two-shot — after Dolo's "…Fi-ah": Seven stunned; Petch looks at Dolo, outraged.
- W12 2.5 FLASH SUBJECT 7 on the screen. [(0.2,'voice',"Not food, Seven.")] He realises the word is him.
- W13 5.0 Grub close — after "SEH!" pounds the ground, tries the other word he knows [(1.0,'grub',"…Fuh… koo.")], drops into a bow out of habit. Seven loses it laughing.
- W14 4.0 Seven,Petch close — [(0.6,'seven',"Good.")]; Petch rolls on his back, play face, panting laughter.
- W17 7.0 Dolo,Seven close — Dolo lays a finger on the device as in I03; this time it glows soft blue; barely audible: [(3.0,'dolo',"…Seh-ven.")]
- W15 6.0 Seven,Petch close — Seven puts a fruit in Petch's open palm. [(1.2,'seven',"Food."),(3.4,'petch',"…Foo.")]
- W16 8.0 all wide — all four try words at once: mangled fire, "Seh!", hoots, collapsing into laughter. No subtitles.

## SCENE 10 — UNDER THE STARS (ep1_night.py) add (prefixed) U10–U16 (+38 s)
Order: U10, U11, N01, N02, U15, N03, U16, N04, U12, N05, N06, N07, N08, N09, U13
- U10 7.0 Seven,Dolo medium — foot of the tree again; Dolo reaches down; he takes her hand (no shake) and she pulls him up.
- U11 7.0 Dolo,Seven close — Dolo bends branches into a nest beside hers, lip-smacking, pats it; he climbs in, tries lying flat like on a lab floor, then curls up like her.
- U15 6.0 Grub close — half awake with the spear, looks at Seven's nest, lays the spear down along the rim, sleeps.
- U16 6.0 Petch close — reaches a hand across to the edge of Seven's nest, leaves it there.
- U12 3.0 dissolve — the lab door's daylight square becomes a square of stars through the leaves (match N04 framing).
- U13 9.0 Seven close (stinger, next morning, clearing) — by the dead fire picks up a round flat stone, lets it roll away, watches; 1.5 s flash of the wheel card [(4.0,'voice',"And this one?")]. He looks up. Cut to black.
