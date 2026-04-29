#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
# apply-schema.sh
# Auto-merges v19+v20 schema additions into your existing schema.prisma.
# Backs up the original, adds 3 fields if missing, runs db push + generate.
#
# Usage (from perenne-business root):
#   chmod +x apply-schema.sh
#   ./apply-schema.sh
#
# Idempotent: safe to run multiple times.
# ════════════════════════════════════════════════════════════════════════
set -e

SCHEMA="prisma/schema.prisma"

if [ ! -f "$SCHEMA" ]; then
  echo "❌ $SCHEMA not found. Run this from the perenne-business root."
  exit 1
fi

BACKUP="prisma/schema.prisma.backup-$(date +%Y%m%d-%H%M%S)"
cp "$SCHEMA" "$BACKUP"
echo "✓ Backup: $BACKUP"

python3 << 'PYEOF'
import re, sys

PATH = 'prisma/schema.prisma'
with open(PATH) as f:
    src = f.read()
original = src
changes = []

def add_field_to_model(src, model_name, field_line, marker):
    """Append a field line right before the closing } of `model {name} { ... }`"""
    if marker in src:
        return src, False
    # Match model block — non-greedy, balanced by counting { }
    pattern = re.compile(r'(model\s+' + re.escape(model_name) + r'\s*\{)([^}]*?)(\n\})', re.DOTALL)
    m = pattern.search(src)
    if not m:
        print(f"  ⚠ could not find `model {model_name}` block — skipping {marker}")
        return src, False
    new_block = m.group(1) + m.group(2) + '\n  ' + field_line + m.group(3)
    return src[:m.start()] + new_block + src[m.end():], True

# 1. User.themePreference
src, ok = add_field_to_model(
    src, 'User',
    'themePreference     String   @default("dark")  // "dark" | "light"',
    'themePreference'
)
if ok: changes.append('User.themePreference')

# 2. CoverConfig.backgroundImageUrl
src, ok = add_field_to_model(
    src, 'CoverConfig',
    'backgroundImageUrl  String?',
    'backgroundImageUrl'
)
if ok: changes.append('CoverConfig.backgroundImageUrl')

# 3. CoverConfig.pageWatermarksJson
src, ok = add_field_to_model(
    src, 'CoverConfig',
    'pageWatermarksJson  Json?',
    'pageWatermarksJson'
)
if ok: changes.append('CoverConfig.pageWatermarksJson')

if src != original:
    with open(PATH, 'w') as f:
        f.write(src)
    print('✓ Schema updated:')
    for c in changes:
        print(f'  + {c}')
else:
    print('✓ Schema already has all required fields — no changes needed.')
PYEOF

echo ""
echo "▸ Running prisma db push..."
npx prisma db push --skip-generate

echo ""
echo "▸ Running prisma generate..."
npx prisma generate

echo ""
echo "✅ Done. Schema applied and Prisma client regenerated."
echo ""
echo "If something looks wrong, restore the backup:"
echo "  cp $BACKUP $SCHEMA"
