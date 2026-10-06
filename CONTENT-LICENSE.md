# Content licence

The code in this repository is under the AGPL-3.0 or later, in [LICENSE](LICENSE). This note is about what the museum shows. Almost everything shown is one of three things: a reproduction, a reconstruction, or a place the museum designed itself. A few props are CC0 models from an open library. Each kind has its own terms.

## The museum's own texts and pictures

The texts and pictures the museum makes itself are under the [Creative Commons Attribution-ShareAlike 4.0 International licence](https://creativecommons.org/licenses/by-sa/4.0/) (CC BY-SA 4.0). ChipMates gemeinnützige GmbH holds the rights in what the museum made and grants this licence for it. A contributor keeps the rights in what they sent and grants the same licence for it.

You may copy, share and adapt them for any purpose, commercial ones too. When you share them, credit them as shown below, link to the licence and say if you changed them. Keep any earlier note of changes. If you change them or build on them and share the result, share it under CC BY-SA 4.0, a later version of it, or a licence Creative Commons lists as compatible. You may not add terms or technical locks that stop others from doing what the licence allows.

This covers the displayed texts of the wing in English and German, the texts of museumofages.org, and the stills and films the museum renders, the film on the start page among them. The wing's displayed texts sit in source files of this repository, in the `en` and `de` fields of its content files under `museum/src/wings/vinci/`, and the texts of museumofages.org in `site/_src/words.en.json`, `words.de.json`, the wing files under `site/_src/wings/` and `site/_src/museum-texts.json`. As files they are under the AGPL-3.0 or later. The displayed texts in them are also under CC BY-SA 4.0, so you may take a text on its own under CC BY-SA. Quotations and translations by others in these files keep their own terms, as below. Code and code comments are under the AGPL-3.0 or later, not under CC BY-SA. The records are files of this repository too, and a credit line a record quotes from a holder stays the holder's.

A credit can read: "Museum of Ages, © ChipMates gemeinnützige GmbH and contributors, CC BY-SA 4.0". Link "Museum of Ages" to the page or the still you took, and "CC BY-SA 4.0" to https://creativecommons.org/licenses/by-sa/4.0/. If you changed it, say so, for example "cropped". A picture of the house also names its data: "Map data © OpenStreetMap contributors, ODbL. Relief: IGN, RGE ALTI®, consulted 8 September 2026, Licence Ouverte 2.0." Link "OpenStreetMap contributors" to https://www.openstreetmap.org/copyright. Where a link is not possible, write out openstreetmap.org/copyright.

Not covered:

- **Works of others inside our pictures.** A reproduction keeps its own licence line wherever it appears, inside a still or a film of ours too. When you share a still or a film that shows one, credit it as well: its label in the wing and its record give the line. No still or film of ours shows a file under a non-commercial licence or under one that forbids changes. Check the label before a commercial use.
- **The music.** The film on the start page is ours. Its music is not: "Adrift Among Infinite Stars" by Scott Buckley, shortened by us, under CC BY 4.0. If you reuse the film with its sound, credit the music too: "Adrift Among Infinite Stars" by Scott Buckley, shortened, CC BY 4.0. Link "Scott Buckley" to https://www.scottbuckley.com.au and "CC BY 4.0" to https://creativecommons.org/licenses/by/4.0/.
- **Words of others.** Quotations of other people's words, and translations made by others, keep their own terms. Most of them are in the public domain, and the record names each source. A translation the museum made itself is covered.
- **Data of others.** The map and relief data below, and the star positions named in [THIRD-PARTY.md](THIRD-PARTY.md).
- **The name and the logo.** The licence grants no trademark rights. The name Museum of Ages and the museum's logo are not licensed. You may name the museum to credit it, but not in a way that suggests we endorse you or your use.

The CC0 textures and props carry no conditions, so they need no exception.

## Map and relief data

The reconstructions and the places the museum designed are built in code. Where a built thing rests on someone else's data, its record says so. The house rests on two outside sources, and each value in its data files names its source in a `source` field.

- Values whose source is `OSM` or `OSM-AREA` come from OpenStreetMap, © OpenStreetMap contributors, available under the [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) from [openstreetmap.org/copyright](https://www.openstreetmap.org/copyright). They are in `museum/src/wings/vinci/data/closluce.json`, so that file as a whole is under the ODbL 1.0. We took the outline of the manor and about a dozen mapped features around it, such as the park's boundary, the street, the stream, the ponds and the outbuildings. These values stay under the ODbL 1.0 wherever they go, and we credit OpenStreetMap wherever the house is shown.
- Values whose source is `IGN` or `IGN-EXT` come from IGN (RGE ALTI®, consulted 8 September 2026. The service gives no date of the data's last update) under the [Licence Ouverte 2.0](https://www.data.gouv.fr/pages/legal/licences/etalab-2.0). They are in `terrain.json`, `light-rig.json` and `closluce.json` in the same folder.

The rest of `terrain.json` and `light-rig.json` is the museum's own and under the AGPL-3.0 or later. Our licences do not reach the outside data. It keeps the terms above. Our pages name that data in the footer, and the credit for a picture of the house names it too.

The house was modelled with the help of photographs from Wikimedia Commons and IGN orthophotos. We read counts, positions and forms from them, such as the openings and the roofs. No texture, pattern or outline is cut or traced from a photograph. Their photographers and licences are named in the `sources` of `closluce.json`.

[THIRD-PARTY.md](THIRD-PARTY.md) lists the data, code, fonts and music the museum and its site take from others.

## Reproductions

The paintings, drawings and notebook pages are digital copies of works in the public domain. Each copy carries the name of its holder, its source and its licence line. The originals stay with their holders. Where a holder claims rights in the image of a public domain work, the label says so.

These kinds of licence and rights note are in the Leonardo da Vinci wing today:

- CC0
- A public domain mark
- CC BY
- CC BY-SA
- Public domain by age, for old printed copies
- Faithful reproductions of public domain works from Wikimedia Commons
- Scans of the Bibliothèque de l'Institut de France, CC BY-NC-ND 3.0 FR

A scan under a licence that allows no changes is shown whole and kept byte for byte, with no crop and no retouching of tone or colour. Resizing it, converting the zoom tiles to the web's colour space, cutting it into tiles and framing the first view are technical steps, and its record names each one. No page or view that shows a file under a non-commercial licence carries a donation request, a sponsor line or advertising.

To reuse a reproduction, follow the licence line on its record. The CC BY-SA above does not reach it.

## The records

Every reproduction and every built thing has a record, and every record carries a licence line. A built thing's line says that its source code is under the repository's licence. Pictures of it are under CC BY-SA 4.0, as above. A reproduction's record also names its holder, its source and a hash of its file. The records live in two places, in this repository under `museum/assets/` and beside the files in the asset store outside it. The museum's build checks the records and stops when something the museum shows has none. It writes them all into one file, `na-manifest.json`, which ships with the museum.

## Contributions

A change you send comes in under the terms of the file it changes: code under the AGPL-3.0 or later, displayed texts under the AGPL-3.0 or later and CC BY-SA 4.0. By sending it you confirm that you may offer it under those terms. Pictures, and data taken from others, never come in by pull request. Propose them in an issue, and we fetch them ourselves if their licence allows it.

## Corrections and questions

If a credit, a date or a sentence is wrong, tell us. We correct it as soon as we have checked it.

If your institution holds a work shown here and something on its label should change, write to [contact@museumofages.org](mailto:contact@museumofages.org). Questions about these terms go to the same address.

Museum of Ages is a project of ChipMates gemeinnützige GmbH, Freiburg im Breisgau, Germany.
