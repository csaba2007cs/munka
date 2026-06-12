# Design tokenek (Atlas előkészítés)

Referencia kép **még nincs** a repóban — a tokenek a jelenlegi sci-fi Nanoportal témából indulnak, és később finomhangolhatók egy „Atlas alignment” sprintben.

## Forrásfájlok

| Fájl | Szerep |
|------|--------|
| [shared/css/theme.css](../shared/css/theme.css) | Színek, spacing, tipográfia, árnyékok (`:root`) |
| [shared/css/components.css](../shared/css/components.css) | Gombok, panelek, mezők, badge, fókusz |

Minden kliens HTML: `theme.css` → `components.css` → app-specifikus CSS.

Az **admin** felület ([`admin/admin.css`](../admin/admin.css)) felülírja a gomb/stílus egy részét operátori olvashatóságra (nagyobb betű, kevesebb HUD-glow, magyar feliratok).

## Tipográfiai hierarchia

| Szerep | Token / osztály | Használat |
|--------|-----------------|-----------|
| HUD cím | `.hud-title` | Operátor, sync sorok |
| HUD alcím | `.hud-sub` | Státusz, magyarázó szöveg |
| Panel cím | `.panel-block h2` | Admin szekciók |
| Kicker | `.reg-kicker`, `.task-label` | Kis, nagy betűköz |
| Hero kérdés | `.text-hero`, `.question-lede` | Kvíz fő szöveg |
| Test | `.text-body`, `--text-md` | Űrlapok, bekezdések |
| Mono HUD | `--font-mono` | Lábléc, időbélyegek |

## Színek (rövid)

- **Háttér:** `--void-900` … `--void-700`
- **Kiemező:** `--cyan-400`, `--cyan-300`
- **Siker:** `--success` / `--green-400`
- **Veszély:** `--danger`
- **Szöveg:** `--text-primary`, `--text-muted`

## Spacing

`--space-1` (4px) … `--space-6` (40px) — padding, gap, margin.

## Következő lépés (referencia érkezésekor)

1. Referencia kép elhelyezése: lásd [design-reference.md](design-reference.md).
2. Csak a `:root` értékek cseréje — komponens osztályok maradnak.
3. Kvíz `quiz.css` második hullám: maradék hardcoded `rgba` → token / `color-mix`.
