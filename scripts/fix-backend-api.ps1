$content = Get-Content "backend/src/routes/organization.routes.ts" -Raw

# Fix the status filtering logic
$content = $content -replace "AND \(ou\.user_status = 'active' OR ou\.is_active = true\) AND ou\.deleted_at IS NULL", "AND ou.user_status = 'active'"
$content = $content -replace "AND ou\.user_status = 'pending' AND ou\.deleted_at IS NULL", "AND ou.user_status = 'pending'"
$content = $content -replace "AND ou\.user_status = 'suspended' AND ou\.deleted_at IS NULL", "AND ou.user_status = 'suspended'"
$content = $content -replace "AND ou\.deleted_at IS NOT NULL", "AND ou.user_status = 'deleted'"
$content = $content -replace "// 'all' or unrecognized - exclude soft-deleted by default[\r\n\s]+statusCondition = `"AND ou\.deleted_at IS NULL`";", "// 'all' means ALL users - no filter at all`r`n      statusCondition = '';"

Set-Content -Path "backend/src/routes/organization.routes.ts" -Value $content -NoNewline

Write-Host "Backend API filtering fixed!"
Write-Host " - Active: Only user_status='active'"
Write-Host " - Pending/Suspended/Deleted: Only user_status field"
Write-Host " - All: No filter (returns everything)"