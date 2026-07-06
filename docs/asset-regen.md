# Asset regeneration — Higgsfield photoreal pipeline

Old Kenney low-poly kit and the box-mesh `generate_assets.py` are deleted.
Every model below regenerates through Higgsfield (image → 3D), so all future
graphics are Higgsfield-made. The game runs on procedural fallbacks until a
GLB lands at its path — no code change needed, `MODEL_SRC` paths are unchanged.

**Blocked on:** Higgsfield credits (balance was 0.38, free plan). Top up, then
run the pipeline below.

## Pipeline (per asset)

1. `generate_image` — model `nano_banana_pro`, aspect 1:1, prompt =
   MASTER STYLE + the asset line below.
2. `generate_3d` — model `image_to_3d`, media role `image` = image job_id,
   PBR + texturing on.
3. Download GLB → target path. Loader Box3-normalizes scale and pivot, so any
   source scale works; only the `h` in `MODEL_SRC` matters.
4. After first character lands: check facing. Kenney faced +X
   (`MODEL_YAW = -Math.PI/2` in `src/ui_three.js`). New rigs likely face +Z →
   set `MODEL_YAW = 0`.

## MASTER STYLE (prepend to every asset prompt)

> Photorealistic AAA game asset, GTA V production quality. Single isolated
> object, full object in frame, 3/4 view, on plain neutral grey studio
> background, even soft lighting, no shadows on background. Worn, lived-in,
> grounded realism: subtle scratches, dust, edge wear, realistic PBR
> materials. Muted noir palette — rain-city detective fiction, not cartoon,
> not stylized, no outlines, no text.

## Assets

Furniture → `assets/models/furn/` (28):

| file | prompt subject | h |
|---|---|---|
| desk.glb | worn wooden detective's office desk with drawers | 0.75 |
| chairDesk.glb | old leather office swivel chair | 0.95 |
| bookcaseOpen.glb | tall open wooden bookcase, cluttered shelves | 1.9 |
| bookcaseClosed.glb | tall closed wooden cabinet bookcase | 1.9 |
| bedSingle.glb | single bed, rumpled grey blanket, metal frame | 0.65 |
| loungeSofa.glb | worn mid-century fabric sofa, muted olive | 0.8 |
| lampRoundTable.glb | small brass table lamp, warm fabric shade | 0.45 |
| lampRoundFloor.glb | tall brass floor lamp, fabric shade | 1.5 |
| rugRound.glb | round worn persian rug, faded burgundy | 0.025 |
| kitchenCabinet.glb | 1970s kitchen counter cabinet, chipped laminate | 0.9 |
| kitchenSink.glb | kitchen sink counter unit, stainless basin | 0.9 |
| kitchenCoffeeMachine.glb | old drip coffee machine, stained carafe | 0.35 |
| cabinetTelevision.glb | low wooden TV cabinet / media console | 0.5 |
| books.glb | small stack of worn hardcover books | 0.26 |
| tableRound.glb | round wooden dining table | 0.75 |
| chairCushion.glb | wooden dining chair with worn cushion | 0.95 |
| pottedPlant.glb | large potted monstera, ceramic pot | 1.1 |
| plantSmall2.glb | small potted succulent | 0.3 |
| trashcan.glb | dented metal office trash can | 0.6 |
| cardboardBoxOpen.glb | open cardboard moving box, flaps up | 0.45 |
| toaster.glb | vintage chrome two-slot toaster | 0.22 |
| rugDoormat.glb | rectangular coir doormat, worn | 0.02 |
| kitchenFridgeSmall.glb | small vintage refrigerator, cream enamel | 1.55 |
| televisionVintage.glb | 1980s CRT television, wood-grain body | 0.5 |
| tableCoffee.glb | low wooden coffee table, ring stains | 0.45 |
| pillowBlue.glb | rumpled blue throw pillow | 0.15 |
| sideTable.glb | small wooden side table | 0.55 |

Characters → `assets/models/char/` (3 unique, copied to 6 files; add
`3d_rigging` + `enable_animation` when idle/walk clips wanted):

| files | prompt subject | h |
|---|---|---|
| character-a.glb, character-h.glb | tired male detective, 40s, trench coat over rumpled suit, standing A-pose, neutral expression, full body | 1.72 |
| character-c.glb, character-l.glb | woman, 30s, dark coat, professional archivist look, standing A-pose, full body | 1.72 |
| character-f.glb, character-o.glb | older man, grey hair, cardigan, standing A-pose, full body | 1.72 |

Buildings → `assets/models/city/` (3 unique, copied to 5 files):

| files | prompt subject | h |
|---|---|---|
| building-d.glb, building-h.glb | rain-stained mid-rise brick apartment block, fire escapes, lit and dark windows, night | 9 / 9.5 |
| building-e.glb, building-n.glb | concrete brutalist office tower, glowing window grid, rooftop units | 10 / 13 |
| building-g.glb | narrow noir tenement with ground-floor neon storefront | 12 |

~34 image jobs + ~34 3D jobs total. Preflight each with `get_cost:true`.
