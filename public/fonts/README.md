# Bengali font files

Two `.ttf` files belong in this directory. They are not committed here —
drop them in before printing any Bengali document.

| File | Encoding | Used for |
|---|---|---|
| `SolaimanLipi.ttf` | Unicode | Anything read out of the database (customer names, addresses, product descriptions) |
| `SutonnyMJ.ttf` | Bijoy / ANSI | Static form labels that were typed in Bijoy layout |

The `@font-face` rules and the reasoning behind keeping the two families
strictly apart live in `public/css/bangla-fonts.css`.

Until the files are present the rules resolve to nothing and the browser
falls back to a default font, so Bengali will render but not in the intended
typeface.
