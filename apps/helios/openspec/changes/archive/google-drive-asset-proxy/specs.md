# Specifications: Google Drive Asset Proxy

## SPEC-ASSET-001: Asset Proxy Endpoint

**Requirement:** Public endpoint serves files with direct URLs.

### Scenario: Access asset via public URL
```gherkin
Given an asset "logo.png" exists with token "abc123"
When I request GET /a/abc123
Then I should receive the image file
And the Content-Type should be "image/png"
And the Cache-Control should be "public, max-age=3600"
And no authentication should be required
```

### Scenario: Access asset with filename
```gherkin
Given an asset "logo.png" exists with token "abc123"
When I request GET /a/abc123/logo.png
Then I should receive the same image file
And the response should be identical to GET /a/abc123
```

### Scenario: Use asset in email signature
```gherkin
Given an asset "banner.png" has public URL "https://helios.example.com/a/xyz789"
When I embed this URL in an email signature: <img src="https://helios.example.com/a/xyz789">
And a recipient opens the email in Gmail
Then the image should display correctly
And the image should load without authentication prompts
```

### Scenario: Asset not found
```gherkin
Given no asset exists with token "notfound"
When I request GET /a/notfound
Then I should receive a 404 status
And the response should NOT expose internal details
```

### Scenario: Rate limiting
```gherkin
Given rate limit is 100 requests per minute per IP
When I make 101 requests in one minute from the same IP
Then the 101st request should receive 429 Too Many Requests
And the response should include Retry-After header
```

---

## SPEC-ASSET-002: Caching

**Requirement:** Files are cached to reduce Drive API calls.

### Scenario: Cache hit
```gherkin
Given asset "logo.png" was accessed within the last hour
When I request the asset again
Then the file should be served from Redis cache
And no Google Drive API call should be made
```

### Scenario: Cache miss
```gherkin
Given asset "logo.png" has not been accessed recently
And cache has expired
When I request the asset
Then the file should be fetched from Google Drive
And the file should be stored in Redis cache
And subsequent requests should hit the cache
```

### Scenario: Cache invalidation
```gherkin
Given asset "logo.png" is cached
When an admin clicks "Refresh" on the asset
Then the cache should be invalidated
And the next request should fetch fresh from Drive
```

---

## SPEC-ASSET-003: Asset Upload

**Requirement:** Admins can upload files via Helios UI.

### Scenario: Upload image file
```gherkin
Given I am an admin on the Files & Assets page
When I click "Upload"
And I select a PNG file under 10MB
And I enter name "Company Logo"
And I select folder "/brand"
And I click "Upload"
Then the file should upload to Google Drive
And an asset record should be created
And I should see the asset in the grid
And I should get a public URL I can copy
```

### Scenario: Upload validation - file type
```gherkin
Given I am uploading a file
When I select an executable file (.exe)
Then I should see an error "File type not allowed"
And the upload should be blocked
```

### Scenario: Upload validation - file size
```gherkin
Given the max file size is 10MB
When I try to upload a 15MB file
Then I should see an error "File exceeds maximum size of 10MB"
And the upload should be blocked
```

### Scenario: Drag and drop upload
```gherkin
Given I am on the Files & Assets page
When I drag a PNG file onto the upload zone
Then I should see a visual indicator
And when I drop the file
Then the upload should begin
And I should see a progress bar
```

---

## SPEC-ASSET-004: Google Drive Setup

**Requirement:** Initial setup creates Shared Drive and folder structure.

### Scenario: First-time setup
```gherkin
Given Google Workspace is configured
And asset storage has not been set up
When I navigate to Files & Assets
Then I should see a setup wizard
And it should offer to create "Helios Assets" Shared Drive
```

### Scenario: Create Shared Drive
```gherkin
Given I am in the setup wizard
When I click "Create Shared Drive"
Then a Shared Drive named "Helios Assets" should be created
And the service account should be added as Content Manager
And the default folder structure should be created:
  | /brand |
  | /signatures |
  | /signatures/banners |
  | /signatures/social-icons |
  | /profiles |
  | /campaigns |
And I should see a success message
```

### Scenario: Shared Drive already exists
```gherkin
Given a "Helios Assets" Shared Drive already exists
When I navigate to Files & Assets
Then I should see the existing Drive is connected
And I should NOT see the setup wizard
And I should see the asset browser
```

---

## SPEC-ASSET-005: Folder Management

**Requirement:** Admins can organize assets in folders.

### Scenario: Create folder
```gherkin
Given I am on the Files & Assets page
When I click "New Folder"
And I enter name "Q1 Campaign"
And I select parent "/campaigns"
And I click "Create"
Then the folder should be created in Google Drive
And it should appear in the folder tree
And I should be able to upload assets to it
```

### Scenario: Navigate folders
```gherkin
Given folders exist: /brand, /signatures, /signatures/banners
When I click on "signatures" in the folder tree
Then I should see assets in the signatures folder
And I should see the "banners" subfolder
When I click on "banners"
Then I should see assets in the banners folder
```

---

## SPEC-ASSET-006: Asset Detail

**Requirement:** Users can view asset details and copy URL.

### Scenario: View asset details
```gherkin
Given asset "banner.png" exists
When I click on the asset in the grid
Then I should see a detail panel with:
  | Field | Value |
  | Preview | [image thumbnail] |
  | Name | banner.png |
  | Size | 45 KB |
  | Type | image/png |
  | Created | Dec 8, 2025 |
  | Accessed | 1,234 times |
```

### Scenario: Copy public URL
```gherkin
Given I am viewing asset details
When I click "Copy" next to the public URL
Then the URL should be copied to clipboard
And I should see a "Copied!" confirmation
```

### Scenario: Replace asset
```gherkin
Given asset "logo.png" exists
When I click "Replace" in the detail panel
And I select a new PNG file
Then the file in Drive should be replaced
And the public URL should remain the same
And the cache should be invalidated
```

---

## SPEC-ASSET-007: MinIO Fallback

**Requirement:** Assets work without Google Workspace.

### Scenario: MinIO as default for non-Google
```gherkin
Given Google Workspace is NOT configured
When I navigate to Files & Assets
Then storage backend should default to MinIO
And the setup wizard should create MinIO buckets
And asset uploads should work with MinIO
```

### Scenario: Switch storage backend
```gherkin
Given both Google Workspace and MinIO are available
When I go to asset settings
Then I should be able to choose storage backend
And changing backend should NOT affect existing assets
And new assets should use the selected backend
```

---

## SPEC-ASSET-008: Integration with Signatures

**Requirement:** Signature templates can use assets.

### Scenario: Insert asset in signature template
```gherkin
Given I am editing a signature template
And asset "logo.png" exists with URL "/a/abc123/logo.png"
When I click "Insert Image"
And I select "logo.png" from the asset picker
Then the image should be inserted in the template
And the src should be the full public URL
```

### Scenario: Preview signature with assets
```gherkin
Given a signature template includes asset "banner.png"
When I preview the signature
Then the banner image should display correctly
And the URL should be the public asset URL
```

---

## SPEC-ASSET-009: Access Tracking

**Requirement:** Asset access is tracked for analytics.

### Scenario: Track access count
```gherkin
Given asset "logo.png" has been accessed 100 times
When the asset is accessed again
Then the access_count should increment to 101
And last_accessed_at should update to current time
```

### Scenario: View access stats
```gherkin
Given asset "logo.png" has been accessed 1,234 times
When I view the asset details
Then I should see "Accessed: 1,234 times"
And I should see when it was last accessed
```
