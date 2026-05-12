#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "v47-hotfix: rimuove riquadro nero 'no design' dalla grid /codes"
echo ""
echo "Premi INVIO, Ctrl+C per annullare."
read -r _

cp -v "_v47_hotfix_payload/app/codes/page.tsx" "app/codes/page.tsx"
rm -rf _v47_hotfix_payload

git add -A
git commit -m "v47-hotfix: hide cover preview strip when batch has no design"
git push

echo "FATTO."
