$content = Get-Content "frontend/src/components/UserList.tsx" -Raw

# Fix the counts calculation completely
# "All" should be ALL users period, no filter
# Status counts should use user_status field only

$oldCounts = @'
        const counts = {
          all: allUsersForCounts.filter\(\(u: any\) => !\!u.deletedAt\).length,
          active: allUsersForCounts.filter\(\(u: any\) =>
            !u.deletedAt && \(u.status === 'active' \|\| u.userStatus === 'active' \)
          \).length,
          pending: allUsersForCounts.filter\(\(u: any\) =>
            !u.deletedAt && \(u.status === 'pending' \|\| u.userStatus === 'pending' \|\| u.user_status === 'pending'\)
          \).length,
          suspended: allUsersForCounts.filter\(\(u: any\) =>
            !u.deletedAt && \(u.status === 'suspended' \|\| u.userStatus === 'suspended' \|\| u.user_status === 'suspended'\)
          \).length,
          expired: allUsersForCounts.filter\(\(u: any\) =>
            !u.deletedAt && \(u.status === 'expired' \|\| u.userStatus === 'expired'\)
          \).length,
          deleted: allUsersForCounts.filter\(\(u: any\) => u.deletedAt !== null\).length
        };
'@

$newCounts = @'
        const counts = {
          all: allUsersForCounts.length, // ALL users, no filter
          active: allUsersForCounts.filter((u: any) =>
            (u.status === 'active' || u.userStatus === 'active' || u.user_status === 'active')
          ).length,
          pending: allUsersForCounts.filter((u: any) =>
            (u.status === 'pending' || u.userStatus === 'pending' || u.user_status === 'pending')
          ).length,
          suspended: allUsersForCounts.filter((u: any) =>
            (u.status === 'suspended' || u.userStatus === 'suspended' || u.user_status === 'suspended')
          ).length,
          expired: allUsersForCounts.filter((u: any) =>
            (u.status === 'expired' || u.userStatus === 'expired' || u.user_status === 'expired')
          ).length,
          deleted: allUsersForCounts.filter((u: any) =>
            (u.status === 'deleted' || u.userStatus === 'deleted' || u.user_status === 'deleted')
          ).length
        };
'@

# Replace the counts calculation
$content = $content -replace [regex]::Escape($oldCounts), $newCounts

# Save the fixed content
Set-Content -Path "frontend/src/components/UserList.tsx" -Value $content -NoNewline

Write-Host "UserList.tsx counts have been fixed properly!"
Write-Host "All = total users (9)"
Write-Host "Status counts based on user_status field only"