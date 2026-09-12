# Quaternius Character Sources

- Author: Quaternius.
- Pack: Universal Base Characters, Standard/free edition.
- Source: https://quaternius.com/packs/universalbasecharacters.html
- Download page: https://quaternius.itch.io/universal-base-characters
- License: CC0 1.0 Universal. The original license is preserved in `LICENSE.txt`.

The files here were downloaded through the author's free download option. No paid Source-edition files are used.

Sunny Life uses the authored head, eye, eyebrow and hairstyle geometry. `art/blender/artist_parts.py` crops the original bodies to the neck/head region, fits them to the existing resident skeleton, normalizes skin/hair colors for the game's swatches, and embeds resized textures into the generated GLB. Original source files are not served by the web application.

The clothing, body adaptation, resident skeleton, eating/standing/conversation animation tracks and runtime interaction system are project code. This is a modified combination, not an unmodified Quaternius full character.

The two `*_Normal_png.png` files in `base/` are filename aliases of the corresponding original normal maps, required by references in the published glTF files.

The head adaptation also reshapes the neck base, welds cut-edge duplicates, and extends a connected neck surface into the project's clothing with Chest/Neck skin-weight blending. This geometry is generated into the Blender source and GLB; the vendor source meshes remain unchanged.
