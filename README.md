# Nanoportal (munka)

Többképernyős, szabadulószoba-jellegű vezérlőrendszer: PHP + fájlalapú `state.json`, natív JS-kliensek (admin, kvíz, kijelző, regisztráció). A teljes magyar nyelvű dokumentációt lásd a [DOKUMENTACIO.md](DOKUMENTACIO.md) fájlban.

## Közzététel GitHubon (`csaba2007cs`)

A gép GitHub CLI-ja másik felhasználóval van bejelentkezve, ezért **a repót `csaba2007cs` felhasználóként hozd létre**, majd ebből a mappából pushold.

### A lehetőség — GitHub CLI (fiókváltás után)

1. Jelentkezz be a megfelelő felhasználóval: `gh auth login` (GitHub.com → HTTPS → hitelesítés **csaba2007cs** felhasználóként).
2. Több fiók használatakor: `gh auth switch -h github.com -u csaba2007cs`
3. Ebből a könyvtárból:

```bash
gh repo create munka --public --source=. --remote=origin --push --description "Nanoportal - escape room control (PHP + JS)"
```

Ha az `origin` már létezik, hozz létre egy üres `munka` repót a GitHubon, majd használd ezt: `git push -u origin main`.

### B lehetőség — Böngésző + git

1. **csaba2007cs** felhasználóként bejelentkezve hozz létre egy új, **nyilvános**, `munka` nevű repót (README és `.gitignore` nélkül — ebben a repóban már van első commit).
2. Ezután:

```bash
git remote add origin https://github.com/csaba2007cs/munka.git
git push -u origin main
```

 (Ha az `origin` már erre az URL-re mutat, hagyd ki a `remote add` lépést, és csak a `git push -u origin main` parancsot futtasd.)
