# Nanoportal (munka)

Multi-screen escape-room style control stack: PHP + file-backed `state.json`, vanilla JS clients (admin, quiz, display, register). See [DOKUMENTACIO.md](DOKUMENTACIO.md) for full Hungarian documentation.

## Publish to GitHub (`csaba2007cs`)

Your machine’s GitHub CLI is logged in as another user, so **create the repo as `csaba2007cs`**, then push from this folder.

### Option A — GitHub CLI (after switching account)

1. Log in as the right user: `gh auth login` (GitHub.com → HTTPS → authenticate **csaba2007cs**).
2. If you use multiple accounts: `gh auth switch -h github.com -u csaba2007cs`
3. From this directory:

```bash
gh repo create munka --public --source=. --remote=origin --push --description "Nanoportal - escape room control (PHP + JS)"
```

If `origin` already exists, use: `git push -u origin main` after creating an empty `munka` repo on GitHub.

### Option B — Browser + git

1. While logged in as **csaba2007cs**, create a new **public** repository named `munka` (no README / no .gitignore — this repo already has a first commit).
2. Then:

```bash
git remote add origin https://github.com/csaba2007cs/munka.git
git push -u origin main
```

(If `origin` is already set to that URL, skip `remote add` and only run `git push -u origin main`.)
