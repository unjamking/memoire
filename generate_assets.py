import os
import json
import base64
import struct

def generate_gltf_from_boxes(boxes):
    vertices = []
    indices = []
    vertex_offset = 0

    for box in boxes:
        tx, ty, tz, sx, sy, sz, r, g, b = box
        
        # 24 vertices for the 6 faces of the box
        faces = [
            # Front (+Z)
            (0.0, 0.0, 1.0, [
                (-0.5, -0.5, 0.5), (0.5, -0.5, 0.5), (0.5, 0.5, 0.5), (-0.5, 0.5, 0.5)
            ]),
            # Back (-Z)
            (0.0, 0.0, -1.0, [
                (0.5, -0.5, -0.5), (-0.5, -0.5, -0.5), (-0.5, 0.5, -0.5), (0.5, 0.5, -0.5)
            ]),
            # Top (+Y)
            (0.0, 1.0, 0.0, [
                (-0.5, 0.5, 0.5), (0.5, 0.5, 0.5), (0.5, 0.5, -0.5), (-0.5, 0.5, -0.5)
            ]),
            # Bottom (-Y)
            (0.0, -1.0, 0.0, [
                (-0.5, -0.5, -0.5), (0.5, -0.5, -0.5), (0.5, -0.5, 0.5), (-0.5, -0.5, 0.5)
            ]),
            # Right (+X)
            (1.0, 0.0, 0.0, [
                (0.5, -0.5, 0.5), (0.5, -0.5, -0.5), (0.5, 0.5, -0.5), (0.5, 0.5, 0.5)
            ]),
            # Left (-X)
            (-1.0, 0.0, 0.0, [
                (-0.5, -0.5, -0.5), (-0.5, -0.5, 0.5), (-0.5, 0.5, 0.5), (-0.5, 0.5, -0.5)
            ])
        ]
        
        for nx, ny, nz, corners in faces:
            for cx, cy, cz in corners:
                # global position
                px = tx + cx * sx
                py = ty + cy * sy
                pz = tz + cz * sz
                vertices.append({
                    'pos': (px, py, pz),
                    'norm': (nx, ny, nz),
                    'color': (r, g, b)
                })
            
            # Add indices for this face (two triangles)
            indices.extend([
                vertex_offset + 0, vertex_offset + 1, vertex_offset + 2,
                vertex_offset + 0, vertex_offset + 2, vertex_offset + 3
            ])
            vertex_offset += 4

    # Pack binary data
    v_data = bytearray()
    for v in vertices:
        v_data.extend(struct.pack('fffffffff', *v['pos'], *v['norm'], *v['color']))
        
    i_data = bytearray()
    for idx in indices:
        i_data.extend(struct.pack('H', idx))

    vertex_count = len(vertices)
    index_count = len(indices)
    vertex_byte_length = len(v_data)
    index_byte_length = len(i_data)
    total_byte_length = vertex_byte_length + index_byte_length

    # Min/max bounds for positions
    xs = [v['pos'][0] for v in vertices]
    ys = [v['pos'][1] for v in vertices]
    zs = [v['pos'][2] for v in vertices]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    min_z, max_z = min(zs), max(zs)

    # Encode binary data
    total_data = v_data + i_data
    b64_data = base64.b64encode(total_data).decode('utf-8')
    uri = f"data:application/octet-stream;base64,{b64_data}"

    # Build glTF JSON
    gltf = {
        "asset": {
            "version": "2.0",
            "generator": "antigravity-gltf-builder"
        },
        "scenes": [
            {
                "nodes": [0]
            }
        ],
        "nodes": [
            {
                "mesh": 0
            }
        ],
        "meshes": [
            {
                "primitives": [
                    {
                        "attributes": {
                            "POSITION": 0,
                            "NORMAL": 1,
                            "COLOR_0": 2
                        },
                        "indices": 3,
                        "material": 0
                    }
                ]
            }
        ],
        "materials": [
            {
                "pbrMetallicRoughness": {
                    "roughnessFactor": 0.8,
                    "metallicFactor": 0.1
                }
            }
        ],
        "bufferViews": [
            {
                "buffer": 0,
                "byteOffset": 0,
                "byteLength": vertex_byte_length,
                "byteStride": 36,
                "target": 34962
            },
            {
                "buffer": 0,
                "byteOffset": vertex_byte_length,
                "byteLength": index_byte_length,
                "target": 34963
            }
        ],
        "accessors": [
            {
                "bufferView": 0,
                "byteOffset": 0,
                "componentType": 5126,
                "count": vertex_count,
                "type": "VEC3",
                "max": [max_x, max_y, max_z],
                "min": [min_x, min_y, min_z]
            },
            {
                "bufferView": 0,
                "byteOffset": 12,
                "componentType": 5126,
                "count": vertex_count,
                "type": "VEC3"
            },
            {
                "bufferView": 0,
                "byteOffset": 24,
                "componentType": 5126,
                "count": vertex_count,
                "type": "VEC3"
            },
            {
                "bufferView": 1,
                "byteOffset": 0,
                "componentType": 5123,
                "count": index_count,
                "type": "SCALAR"
            }
        ],
        "buffers": [
            {
                "byteLength": total_byte_length,
                "uri": uri
            }
        ]
    }
    return gltf

def get_character_boxes(r, g, b):
    return [
        # Head
        (0.0, 1.5, 0.0, 0.3, 0.3, 0.3, 0.85, 0.75, 0.65),
        # Torso (Coat)
        (0.0, 0.9, 0.0, 0.4, 0.6, 0.3, 0.24, 0.26, 0.32),
        # Scarf
        (0.0, 1.25, 0.0, 0.44, 0.1, 0.34, r, g, b),
        # Leg Left (Slacks)
        (-0.1, 0.3, 0.0, 0.15, 0.6, 0.15, 0.18, 0.2, 0.24),
        # Leg Right
        (0.1, 0.3, 0.0, 0.15, 0.6, 0.15, 0.18, 0.2, 0.24),
        # Arm Left (Coat)
        (-0.25, 0.9, 0.0, 0.1, 0.5, 0.1, 0.24, 0.26, 0.32),
        # Arm Right
        (0.25, 0.9, 0.0, 0.1, 0.5, 0.1, 0.24, 0.26, 0.32)
    ]

# Define box lists for all expected model assets
MODELS = {
    # 1. desk
    "desk.glb": [
        (0, 0.72, 0, 2.0, 0.05, 1.0, 0.45, 0.32, 0.2), # top
        (-0.9, 0.36, 0, 0.05, 0.72, 0.9, 0.35, 0.24, 0.15), # left panel
        (0.9, 0.36, 0, 0.05, 0.72, 0.9, 0.35, 0.24, 0.15), # right panel
        (0, 0.36, -0.42, 1.76, 0.72, 0.05, 0.35, 0.24, 0.15), # back panel
        (0.6, 0.4, 0, 0.45, 0.55, 0.8, 0.25, 0.18, 0.12) # drawers
    ],
    # 2. chairDesk
    "chairDesk.glb": [
        (0, 0.45, 0, 0.5, 0.06, 0.5, 0.15, 0.15, 0.18), # seat
        (0, 0.75, -0.22, 0.46, 0.4, 0.06, 0.15, 0.15, 0.18), # backrest
        (0, 0.55, -0.18, 0.08, 0.3, 0.08, 0.3, 0.3, 0.3), # back support
        (0, 0.22, 0, 0.06, 0.4, 0.06, 0.3, 0.3, 0.3), # stem
        (0, 0.03, 0, 0.5, 0.04, 0.5, 0.1, 0.1, 0.1) # feet
    ],
    # 3. bookcaseOpen -> bookcase.glb
    "bookcaseOpen.glb": [
        (0, 0.95, -0.18, 0.9, 1.9, 0.04, 0.45, 0.32, 0.2), # back
        (-0.43, 0.95, 0, 0.04, 1.9, 0.38, 0.4, 0.28, 0.16), # left wall
        (0.43, 0.95, 0, 0.04, 1.9, 0.38, 0.4, 0.28, 0.16), # right wall
        (0, 1.88, 0, 0.9, 0.04, 0.38, 0.4, 0.28, 0.16), # top
        (0, 0.45, 0, 0.82, 0.03, 0.36, 0.4, 0.28, 0.16), # shelves
        (0, 0.9, 0, 0.82, 0.03, 0.36, 0.4, 0.28, 0.16),
        (0, 1.35, 0, 0.82, 0.03, 0.36, 0.4, 0.28, 0.16),
        (0, 0.05, 0, 0.82, 0.04, 0.36, 0.4, 0.28, 0.16),
        # Books
        (-0.25, 0.6, 0.05, 0.06, 0.25, 0.22, 0.7, 0.2, 0.2),
        (-0.18, 0.6, 0.05, 0.06, 0.22, 0.22, 0.2, 0.4, 0.7),
        (-0.11, 0.6, 0.05, 0.06, 0.26, 0.22, 0.2, 0.6, 0.3),
        (0.12, 1.05, 0.05, 0.08, 0.24, 0.22, 0.8, 0.7, 0.2),
        (0.2, 1.05, 0.05, 0.06, 0.22, 0.22, 0.6, 0.3, 0.7)
    ],
    # 4. bookcaseClosed -> bookcaseClosed.glb
    "bookcaseClosed.glb": [
        (0, 0.95, -0.18, 0.9, 1.9, 0.04, 0.45, 0.32, 0.2), # back
        (-0.43, 0.95, 0, 0.04, 1.9, 0.38, 0.4, 0.28, 0.16), # left wall
        (0.43, 0.95, 0, 0.04, 1.9, 0.38, 0.4, 0.28, 0.16), # right wall
        (0, 1.88, 0, 0.9, 0.04, 0.38, 0.4, 0.28, 0.16), # top
        (0, 0.05, 0, 0.82, 0.1, 0.36, 0.35, 0.24, 0.14), # bottom base
        (-0.21, 0.95, 0.18, 0.4, 1.76, 0.03, 0.5, 0.38, 0.24), # left door
        (0.21, 0.95, 0.18, 0.4, 1.76, 0.03, 0.5, 0.38, 0.24), # right door
        (-0.03, 0.95, 0.2, 0.02, 0.12, 0.02, 0.8, 0.7, 0.3), # handles
        (0.03, 0.95, 0.2, 0.02, 0.12, 0.02, 0.8, 0.7, 0.3)
    ],
    # 5. bedSingle
    "bedSingle.glb": [
        (0, 0.15, 0, 1.0, 0.2, 2.0, 0.4, 0.28, 0.18), # frame bottom
        (0, 0.6, -0.98, 1.0, 0.8, 0.05, 0.35, 0.24, 0.14), # headboard
        (0, 0.32, 0.02, 0.96, 0.22, 1.9, 0.88, 0.88, 0.88), # mattress
        (0, 0.36, 0.3, 0.98, 0.16, 1.3, 0.25, 0.4, 0.55), # sheets
        (0, 0.4, -0.72, 0.75, 0.1, 0.42, 0.85, 0.82, 0.78) # pillow
    ],
    # 6. loungeSofa
    "loungeSofa.glb": [
        (0, 0.18, 0, 1.8, 0.16, 0.85, 0.22, 0.26, 0.32), # base
        (-0.43, 0.32, 0.05, 0.82, 0.16, 0.65, 0.38, 0.45, 0.54), # cushions
        (0.43, 0.32, 0.05, 0.82, 0.16, 0.65, 0.38, 0.45, 0.54),
        (0, 0.62, -0.32, 1.76, 0.5, 0.16, 0.34, 0.4, 0.48), # backrest
        (-0.85, 0.46, 0.02, 0.12, 0.42, 0.82, 0.28, 0.34, 0.42), # arms
        (0.85, 0.46, 0.02, 0.12, 0.42, 0.82, 0.28, 0.34, 0.42)
    ],
    # 7. lampRoundTable
    "lampRoundTable.glb": [
        (0, 0.08, 0, 0.16, 0.16, 0.16, 0.4, 0.4, 0.4), # base
        (0, 0.24, 0, 0.04, 0.24, 0.04, 0.6, 0.6, 0.6), # stem
        (0, 0.42, 0, 0.25, 0.2, 0.25, 0.9, 0.85, 0.65), # shade
        (0, 0.34, 0, 0.08, 0.08, 0.08, 1.0, 0.95, 0.4) # bulb
    ],
    # 8. lampRoundFloor
    "lampRoundFloor.glb": [
        (0, 0.03, 0, 0.3, 0.04, 0.3, 0.2, 0.2, 0.2), # base
        (0, 0.85, 0, 0.04, 1.6, 0.04, 0.7, 0.7, 0.7), # pole
        (0, 1.65, 0, 0.42, 0.34, 0.42, 0.92, 0.88, 0.75), # shade
        (0, 1.55, 0, 0.1, 0.1, 0.1, 1.0, 0.96, 0.4) # light
    ],
    # 9. rugRound
    "rugRound.glb": [
        (0, 0.005, 0, 1.8, 0.01, 1.8, 0.45, 0.38, 0.32), # rug disc
        (0, 0.006, 0, 1.6, 0.01, 1.6, 0.32, 0.25, 0.2) # border
    ],
    # 10. kitchenCabinet
    "kitchenCabinet.glb": [
        (0, 0.45, 0, 1.0, 0.9, 0.6, 0.88, 0.88, 0.88), # base body
        (0, 0.91, 0, 1.04, 0.04, 0.64, 0.25, 0.22, 0.2), # countertop
        (0, 0.04, 0.02, 0.96, 0.08, 0.56, 0.15, 0.15, 0.15), # kickboard
        (-0.25, 0.65, 0.31, 0.02, 0.1, 0.02, 0.6, 0.6, 0.6), # handles
        (0.25, 0.65, 0.31, 0.02, 0.1, 0.02, 0.6, 0.6, 0.6)
    ],
    # 11. kitchenSink
    "kitchenSink.glb": [
        (0, 0.45, 0, 1.0, 0.9, 0.6, 0.88, 0.88, 0.88), # body
        (0, 0.91, 0, 1.04, 0.04, 0.64, 0.25, 0.22, 0.2), # countertop
        (0, 0.04, 0.02, 0.96, 0.08, 0.56, 0.15, 0.15, 0.15), # kickboard
        (0, 0.89, 0, 0.6, 0.02, 0.44, 0.55, 0.58, 0.62), # basin
        (0, 0.96, -0.18, 0.04, 0.08, 0.04, 0.7, 0.7, 0.7), # faucet base
        (0, 1.06, -0.14, 0.03, 0.12, 0.1, 0.7, 0.7, 0.7) # faucet neck
    ],
    # 12. kitchenCoffeeMachine
    "kitchenCoffeeMachine.glb": [
        (0, 0.08, 0, 0.22, 0.16, 0.22, 0.15, 0.15, 0.15), # base
        (0, 0.22, -0.07, 0.22, 0.28, 0.08, 0.15, 0.15, 0.15), # back wall
        (0, 0.32, 0.03, 0.18, 0.08, 0.12, 0.15, 0.15, 0.15), # top
        (0, 0.16, 0.05, 0.15, 0.18, 0.15, 0.8, 0.9, 0.96) # pot
    ],
    # 13. cabinetTelevision
    "cabinetTelevision.glb": [
        (0, 0.22, 0, 1.6, 0.45, 0.5, 0.4, 0.28, 0.18), # body
        (-0.7, 0.05, 0, 0.08, 0.1, 0.3, 0.2, 0.15, 0.1), # feet
        (0.7, 0.05, 0, 0.08, 0.1, 0.3, 0.2, 0.15, 0.1),
        (0, 0.25, 0, 1.5, 0.03, 0.46, 0.3, 0.2, 0.12) # shelf
    ],
    # 14. books
    "books.glb": [
        (-0.12, 0.08, 0, 0.06, 0.16, 0.22, 0.7, 0.25, 0.2), # book 1
        (-0.06, 0.09, 0.02, 0.05, 0.18, 0.24, 0.2, 0.35, 0.65), # book 2
        (0, 0.07, -0.01, 0.07, 0.14, 0.2, 0.2, 0.55, 0.3), # book 3
        (0.08, 0.08, 0, 0.06, 0.16, 0.22, 0.7, 0.55, 0.18) # book 4
    ],
    # 15. tableRound
    "tableRound.glb": [
        (0, 0.74, 0, 1.2, 0.04, 1.2, 0.48, 0.35, 0.22), # top
        (0, 0.36, 0, 0.12, 0.72, 0.12, 0.35, 0.24, 0.15), # column
        (0, 0.02, 0, 0.6, 0.04, 0.6, 0.3, 0.2, 0.12) # base
    ],
    # 16. chairCushion (chairDine)
    "chairCushion.glb": [
        (0, 0.45, 0, 0.44, 0.05, 0.44, 0.7, 0.55, 0.38), # seat
        (0, 0.78, -0.19, 0.44, 0.38, 0.04, 0.4, 0.28, 0.18), # backrest frame
        (0, 0.74, -0.17, 0.36, 0.26, 0.02, 0.7, 0.55, 0.38), # backrest pad
        (-0.18, 0.22, 0.18, 0.04, 0.45, 0.04, 0.4, 0.28, 0.18), # legs
        (0.18, 0.22, 0.18, 0.04, 0.45, 0.04, 0.4, 0.28, 0.18),
        (-0.18, 0.22, -0.18, 0.04, 0.45, 0.04, 0.4, 0.28, 0.18),
        (0.18, 0.22, -0.18, 0.04, 0.45, 0.04, 0.4, 0.28, 0.18)
    ],
    # 17. pottedPlant (plantBig)
    "pottedPlant.glb": [
        (0, 0.18, 0, 0.42, 0.36, 0.42, 0.62, 0.48, 0.38), # pot
        (0, 0.34, 0, 0.38, 0.02, 0.38, 0.18, 0.12, 0.08), # soil
        (0, 0.62, 0, 0.04, 0.6, 0.04, 0.4, 0.3, 0.2), # stem
        (-0.15, 0.8, 0.1, 0.3, 0.08, 0.3, 0.25, 0.52, 0.28), # leaves
        (0.15, 0.88, -0.1, 0.34, 0.08, 0.28, 0.25, 0.52, 0.28),
        (0.05, 0.95, 0.15, 0.26, 0.08, 0.32, 0.25, 0.52, 0.28)
    ],
    # 18. plantSmall2 (plantSmall)
    "plantSmall2.glb": [
        (0, 0.08, 0, 0.18, 0.16, 0.18, 0.85, 0.85, 0.88), # pot
        (-0.06, 0.2, 0.03, 0.12, 0.12, 0.12, 0.3, 0.65, 0.32), # leaves
        (0.06, 0.24, -0.04, 0.14, 0.14, 0.14, 0.3, 0.65, 0.32)
    ],
    # 19. trashcan
    "trashcan.glb": [
        (0, 0.18, 0, 0.28, 0.36, 0.28, 0.32, 0.36, 0.4), # bin body
        (0, 0.36, 0, 0.3, 0.02, 0.3, 0.45, 0.5, 0.55) # rim
    ],
    # 20. cardboardBoxOpen (boxOpen)
    "cardboardBoxOpen.glb": [
        (0, 0.18, 0, 0.52, 0.36, 0.52, 0.72, 0.58, 0.42), # bottom base
        (-0.27, 0.42, 0, 0.02, 0.14, 0.5, 0.72, 0.58, 0.42), # flaps
        (0.27, 0.42, 0, 0.02, 0.14, 0.5, 0.72, 0.58, 0.42),
        (0, 0.42, -0.27, 0.5, 0.14, 0.02, 0.72, 0.58, 0.42),
        (0, 0.42, 0.27, 0.5, 0.14, 0.02, 0.72, 0.58, 0.42)
    ],
    # 21. toaster
    "toaster.glb": [
        (0, 0.1, 0, 0.26, 0.18, 0.16, 0.8, 0.8, 0.8), # metal body
        (0, 0.1, 0, 0.28, 0.16, 0.18, 0.18, 0.18, 0.18), # plastic ends
        (0.12, 0.08, 0.09, 0.03, 0.06, 0.03, 0.8, 0.18, 0.18) # knob
    ],
    # 22. rugDoormat (doormat)
    "rugDoormat.glb": [
        (0, 0.005, 0, 0.75, 0.01, 0.45, 0.35, 0.25, 0.18), # main mat
        (0, 0.006, 0, 0.78, 0.01, 0.48, 0.18, 0.15, 0.12) # border
    ],
    # 23. kitchenFridgeSmall (fridge)
    "kitchenFridgeSmall.glb": [
        (0, 0.62, 0, 0.6, 1.24, 0.6, 0.85, 0.85, 0.85), # fridge body
        (0.26, 0.75, 0.31, 0.04, 0.25, 0.03, 0.75, 0.75, 0.75) # door handle
    ],
    # 24. televisionVintage (tvVintage)
    "televisionVintage.glb": [
        (0, 0.24, 0, 0.54, 0.48, 0.42, 0.32, 0.22, 0.12), # wood box
        (-0.04, 0.24, 0.21, 0.4, 0.38, 0.02, 0.15, 0.16, 0.18), # screen glass
        (0.19, 0.28, 0.22, 0.04, 0.04, 0.02, 0.7, 0.7, 0.7) # knob
    ],
    # 25. tableCoffee
    "tableCoffee.glb": [
        (0, 0.41, 0, 1.1, 0.04, 0.6, 0.45, 0.32, 0.2), # top
        (-0.5, 0.2, 0.26, 0.05, 0.4, 0.05, 0.3, 0.2, 0.12), # legs
        (0.5, 0.2, 0.26, 0.05, 0.4, 0.05, 0.3, 0.2, 0.12),
        (-0.5, 0.2, -0.26, 0.05, 0.4, 0.05, 0.3, 0.2, 0.12),
        (0.5, 0.2, -0.26, 0.05, 0.4, 0.05, 0.3, 0.2, 0.12)
    ],
    # 26. pillowBlue (pillowB)
    "pillowBlue.glb": [
        (0, 0.06, 0, 0.45, 0.12, 0.45, 0.24, 0.38, 0.54), # pillow body
        (0, 0.06, 0, 0.47, 0.08, 0.47, 0.18, 0.3, 0.44) # soft edge
    ],
    # 27. sideTable
    "sideTable.glb": [
        (0, 0.54, 0, 0.5, 0.04, 0.5, 0.4, 0.28, 0.18), # top
        (0, 0.26, 0, 0.46, 0.5, 0.46, 0.35, 0.24, 0.14), # body
        (0, 0.4, 0.24, 0.08, 0.03, 0.02, 0.7, 0.7, 0.7) # drawer knob
    ],
    
    # --- Characters ---
    # character-a: Vasic, clerk (gold/amber accent)
    "character-a.glb": get_character_boxes(0.8, 0.65, 0.35),
    # character-c: Auditor (crimson accent)
    "character-c.glb": get_character_boxes(0.75, 0.25, 0.2),
    # character-f: blue accent
    "character-f.glb": get_character_boxes(0.25, 0.55, 0.75),
    # character-h: green accent
    "character-h.glb": get_character_boxes(0.3, 0.6, 0.35),
    # character-l: purple accent
    "character-l.glb": get_character_boxes(0.65, 0.35, 0.7),
    # character-o: yellow/amber accent
    "character-o.glb": get_character_boxes(0.8, 0.75, 0.3),

    # --- Buildings ---
    # building-d
    "building-d.glb": [
        (0, 4.0, 0, 1.2, 8.0, 1.2, 0.25, 0.26, 0.28), # main structure
        (0, 4.0, 0.61, 0.8, 7.6, 0.02, 0.9, 0.85, 0.4) # windows block
    ],
    # building-e
    "building-e.glb": [
        (0, 5.0, 0, 1.4, 10.0, 1.4, 0.18, 0.2, 0.22)
    ],
    # building-g
    "building-g.glb": [
        (0, 6.0, 0, 1.6, 12.0, 1.6, 0.2, 0.24, 0.3)
    ],
    # building-h
    "building-h.glb": [
        (0, 4.5, 0, 1.5, 9.0, 1.5, 0.42, 0.26, 0.2)
    ],
    # building-n
    "building-n.glb": [
        (0, 7.0, 0, 1.8, 14.0, 1.8, 0.15, 0.16, 0.18)
    ]
}

def main():
    out_dir = "assets/models"
    os.makedirs(out_dir, exist_ok=True)
    print(f"Generating 3D assets to: {out_dir}")
    
    for filename, boxes in MODELS.items():
        gltf = generate_gltf_from_boxes(boxes)
        filepath = os.path.join(out_dir, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(gltf, f, indent=2)
        print(f"  ✓ Created {filename} ({len(boxes)} box(es))")
        
    print("\nAll assets created successfully!")

if __name__ == "__main__":
    main()
