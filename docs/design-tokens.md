# Nanoportal dizájn-tokenek

A kioszkoldalak a `shared/css/theme.css` és a
`shared/css/components.css` fájlokat importálják. Az új felületek a meglévő
CSS-egyéni tulajdonságokat használják a keményen kódolt színek, betűméretek
vagy `rgba()` értékek helyett.

Példák:

```css
color: var(--text-primary);
background: var(--void-900);
font-family: var(--font-mono);
font-size: var(--text-sm);
padding: var(--space-2);
```

Az önellenőrzés a kioszkstílusokban keresi a keményen kódolt hexadecimális
színeket, pixeles betűméreteket és az `rgba()` deklarációkat.
