#!/bin/bash
# Execute the content backfill SQL batches against Supabase
# Requires SUPABASE_PROJECT_REF environment variable
# Usage: ./tools/backfill-content-sync.sh

set -e

PROJECT_ID="${SUPABASE_PROJECT_ID:-daxvmlcryvplxibjxrkx}"
BATCH_DIR=".tmp"

if [ ! -d "$BATCH_DIR" ]; then
  echo "ERROR: .tmp directory not found. Run 'node tools/sync-content-to-supabase.mjs' first."
  exit 1
fi

echo "🔄 Backfilling content to Supabase..."
echo "  Project: $PROJECT_ID"

# Count total files to sync
TOTAL=$(ls "$BATCH_DIR"/sync-*.sql 2>/dev/null | wc -l)
if [ $TOTAL -eq 0 ]; then
  echo "ERROR: no SQL files found in $BATCH_DIR"
  exit 1
fi

echo "  Files to sync: $TOTAL"
echo ""

# Execute each file via the Supabase MCP connector
# Note: this script is intended to be called by Claude, which has access to the MCP tools.
# From your CLI, you would run:
#   cd <repo>
#   node tools/sync-content-to-supabase.mjs
#   # Then ask Claude to execute the following SQL files via MCP execute_sql:
#   cat .tmp/sync-areas-*.sql | grep "FROM jsonb_array"
#
# Or use a local supabase-js client with service role credentials:
#   npx node << 'EOF'
#   const { createClient } = require('@supabase/supabase-js');
#   const fs = require('fs');
#   const project_ref = process.env.SUPABASE_PROJECT_ID || 'qxmyrahqsopmaeokxdub';
#   const supabase_url = `https://${project_ref}.supabase.co`;
#   const service_role_key = process.env.SUPABASE_SERVICE_ROLE_KEY;
#   if (!service_role_key) {
#     console.error('ERROR: set SUPABASE_SERVICE_ROLE_KEY env var');
#     process.exit(1);
#   }
#   const client = createClient(supabase_url, service_role_key);
#   // Read and execute each SQL file...
#   EOF

echo "📝 Generated SQL files:"
ls -lh "$BATCH_DIR"/sync-*.sql

echo ""
echo "Next steps:"
echo "1. Claude will execute these SQL files via the Supabase MCP connector"
echo "2. After execution, run: node tools/sync-content-to-supabase.mjs --snapshot"
echo ""
echo "See docs/SUPABASE_SYNC.md for the full sync contract."
