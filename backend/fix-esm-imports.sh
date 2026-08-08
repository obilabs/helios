#!/bin/bash
# Fix ESM imports by adding .js extensions to relative imports

find src -name "*.ts" -type f | while read file; do
  # Add .js to relative imports that don't already have an extension
  # Match: from './path' or from "../path" (without .js, .json, etc.)
  sed -i -E "s/(from ['\"]\.\.?\/[^'\"]+)(['\"])/\1.js\2/g" "$file"
  
  # Fix double extensions (.js.js)
  sed -i 's/\.js\.js/.js/g' "$file"
  
  # Fix imports that already had .json extension
  sed -i 's/\.json\.js/.json/g' "$file"
  
  # Fix imports that already had .css extension  
  sed -i 's/\.css\.js/.css/g' "$file"
done

echo "Fixed ESM imports in $(find src -name '*.ts' -type f | wc -l) files"
