Supplied Furniture Adaptation

Original model filenames, hashes, authors and source URLs are recorded in
sources.json. Only the three entries in that file are used. The supplied
character files are not included in the asset collection.

Editable result:
  art/blender/sunny-supplied.blend

Export existing Blender edits without replacing the source:
  npm run supplied:export

Rebuild from the verified original downloads:
  npm run supplied:rebuild -- --source-dir=/path/to/downloads

The rebuild scans that directory recursively, matches file hashes, converts
legacy specular/glossiness materials, and prepares inputs in .runtime/.
Blender closes and bakes appliance poses, selects the relevant geometry,
fits existing game dimensions, and creates interaction controls.

The exported web pack uses deduplicated geometry, 512px-or-smaller WebP
textures and gzip delivery. Existing furniture type IDs and save positions
are unchanged. Baked appliances do not expose new open-door interactions.
Handwashing and toilet flushing use the existing activity system.

All attribution, adaptation details and the asset-pack license are in:
  public/models/supplied/LICENSE.txt

The adapted collection is CC BY-SA 4.0. This does not relicense the rest
of the game or the separately distributed CC0 resident models.
