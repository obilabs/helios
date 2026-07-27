$content = Get-Content "frontend/src/components/UserList.tsx" -Raw

# Fix all the count issues
$content = $content -replace '!u\.deletedAt && \(', '('
$content = $content -replace 'u\.deletedAt !== null', "(u.status === 'deleted' || u.userStatus === 'deleted' || u.user_status === 'deleted')"

# Make sure active doesn't have trailing space and closing paren issue
$content = $content -replace '\|\| u\.userStatus === ''active'' \)', "|| u.userStatus === 'active' || u.user_status === 'active')"

Set-Content -Path "frontend/src/components/UserList.tsx" -Value $content -NoNewline

Write-Host "Final fixes applied!"