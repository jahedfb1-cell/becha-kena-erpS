#!/usr/bin/env bash
#
# Frontend deploy for dhakablinds.shop
#
# Uses OpenSSH (ssh/scp), which prompts for the account password
# interactively rather than taking it on the command line — so the
# password never lands in shell history, a process list, or this file.
#
# Run from the repo root:  bash deploy-frontend.sh
#
# WHY TWO DESTINATIONS (see persistent_memory.md section 2):
# Hostinger forces the document root to public_html/, but the Laravel app
# lives in the sibling laravel_app/. Static /assets/* requests are served
# straight off disk from public_html/assets/, while every SPA route (/,
# /dashboard, /orders, ...) falls through to PHP, which reads
# public_path('index.html') — that is laravel_app/public/index.html.
# Syncing only public_html/ therefore ships the new chunks but keeps the
# OLD index.html deciding which chunk hashes to load, which presents
# exactly like a CDN cache problem and is not one.
set -euo pipefail

HOST=195.35.44.69
PORT=65002
USER=u574978612
DOMAIN=/home/$USER/domains/dhakablinds.shop

DIST="frontend/dist"
[ -d "$DIST/assets" ] || { echo "No build at $DIST — run: cd frontend && npx vite build"; exit 1; }

echo "==> Packaging $DIST"
TARBALL=$(mktemp -t dbdist.XXXXXX).tar.gz
tar -czf "$TARBALL" -C "$DIST" .
echo "    $(du -h "$TARBALL" | cut -f1)"

echo "==> Uploading (password prompt #1)"
scp -P "$PORT" "$TARBALL" "$USER@$HOST:/tmp/dbdist.tar.gz"

echo "==> Installing (password prompt #2)"
ssh -p "$PORT" "$USER@$HOST" DOMAIN="$DOMAIN" 'bash -s' <<'REMOTE'
set -euo pipefail
STAGE=$(mktemp -d)
tar -xzf /tmp/dbdist.tar.gz -C "$STAGE"

# No --delete anywhere. Old hashed chunks are left in place on purpose:
# a tab that has been open since before this deploy still lazy-loads
# chunks by their old filenames, and removing them turns that tab into a
# reload loop. They are a few KB each and get cleaned up separately.
for TARGET in "$DOMAIN/public_html" "$DOMAIN/laravel_app/public"; do
  echo "    -> $TARGET"
  # index.php differs between these two locations and .htaccess exists in
  # only one of them. Neither is in the build output, so copying the build
  # over the top cannot clobber them.
  cp -r "$STAGE"/. "$TARGET"/
done

cd "$DOMAIN/laravel_app"
git fetch origin main -q && git merge --ff-only origin/main
php artisan config:clear && php artisan route:clear && php artisan cache:clear && php artisan view:clear

echo "    index.html served by PHP: $(php artisan tinker --execute='echo public_path("index.html");' 2>/dev/null | tail -1)"
echo "    bundle referenced:"
grep -o 'assets/index-[A-Za-z0-9_-]*\.js' "$DOMAIN/laravel_app/public/index.html"

rm -rf "$STAGE" /tmp/dbdist.tar.gz
REMOTE

rm -f "$TARBALL"
echo "==> Done. Hard-reload the site (Ctrl+Shift+R) to pick up the new service worker."
