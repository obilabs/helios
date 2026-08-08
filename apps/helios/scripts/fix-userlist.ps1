$content = Get-Content "frontend/src/components/UserList.tsx" -Raw

# Fix 1: Status field mapping - include all fallbacks
$content = $content -replace 'status: user\.status,', 'status: user.status || user.userStatus || user.user_status || (user.isActive ? "active" : "inactive"),'

# Fix 2: Also add user_status to the count filters (add fallback)
$content = $content -replace '\(u\.status === ''active'' \|\| u\.userStatus === ''active''\)', '(u.status === ''active'' || u.userStatus === ''active'' || u.user_status === ''active'')'
$content = $content -replace '\(u\.status === ''pending'' \|\| u\.userStatus === ''pending''\)', '(u.status === ''pending'' || u.userStatus === ''pending'' || u.user_status === ''pending'')'
$content = $content -replace '\(u\.status === ''suspended'' \|\| u\.userStatus === ''suspended''\)', '(u.status === ''suspended'' || u.userStatus === ''suspended'' || u.user_status === ''suspended'')'

# Fix 3: Status display logic - check for 'active' explicitly instead of defaulting to it
$content = $content -replace '(\s+)else if \(!user\.isActive\) \{', '$1else if (user.status === ''active'') {
$1  statusClass = ''active'';
$1  statusText = ''Active'';
$1} else if (!user.isActive) {'

# Save the fixed content
Set-Content -Path "frontend/src/components/UserList.tsx" -Value $content -NoNewline

Write-Host "UserList.tsx has been fixed!"