#!/bin/bash
# Script to carefully remove console.log/warn/info/debug statements

for file in $(find src -name "*.ts" -o -name "*.tsx"); do
    echo "Processing: $file"
    
    # Create backup
    cp "$file" "${file}.backup"
    
    # Remove standalone console statements (full lines)
    sed -i '/^[[:space:]]*console\.\(log\|warn\|info\|debug\).*;[[:space:]]*$/d' "$file"
    
    # Check if file still compiles by running tsc --noEmit
    if ! npx tsc --noEmit --skipLibCheck > /dev/null 2>&1; then
        echo "  ERROR: Compilation failed for $file, restoring backup"
        mv "${file}.backup" "$file"
    else
        echo "  SUCCESS: $file processed successfully"
        rm "${file}.backup"
    fi
done

echo "Final compilation check..."
npx tsc --noEmit --skipLibCheck