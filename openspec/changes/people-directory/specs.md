# Specifications: People Directory (User-Facing)

## SPEC-PD-001: My Profile Page

**Requirement:** Users can view and edit their own profile information.

### Scenario: View my profile
```gherkin
Given I am logged in as a regular user
When I navigate to My Profile (Settings > My Profile)
Then I should see my current profile information
And I should see a "Profile Completeness" indicator
And I should see edit buttons/icons for each section
```

### Scenario: Edit bio
```gherkin
Given I am on My Profile page
When I click edit on the "About Me" section
Then the bio field should become editable
And I should see a rich text editor with basic formatting

When I type my bio and click Save
Then the API should receive PUT /api/me/profile
And a success message should appear
And my bio should be updated
```

### Scenario: Profile completeness
```gherkin
Given I am on My Profile page
And I have not added a bio, voice intro, or fun facts
Then the profile completeness should show approximately 40%
And I should see prompts like "Add a bio" with an [Add] button

When I complete all suggested fields
Then the completeness should increase to 100%
```

---

## SPEC-PD-002: Name Pronunciation Recording

**Requirement:** Users can record a short audio clip of how to pronounce their name.

### Scenario: Record name pronunciation
```gherkin
Given I am on My Profile page
And I have not recorded my name pronunciation
When I click "Record" next to Name Pronunciation
Then a recording modal should appear
And I should see a microphone button
And I should see "Max 10 seconds"

When I click the microphone and speak my name
Then I should see a timer counting up
And I should see a waveform visualization
And after 10 seconds it should auto-stop

When I click Stop
Then I should hear a preview of my recording
And I should see [Re-record] and [Save] buttons
```

### Scenario: Play name pronunciation on profile
```gherkin
Given a user has recorded their name pronunciation
When I view their profile
Then I should see a speaker icon next to their name
And clicking the icon should play the audio
```

---

## SPEC-PD-003: Voice Introduction

**Requirement:** Users can record a 60-second voice introduction.

### Scenario: Record voice intro
```gherkin
Given I am on My Profile page
When I click "Record" next to Voice Introduction
Then a recording modal should appear
And I should see "Max 60 seconds"
And I should see recording tips

When I record and save
Then the API should receive POST /api/me/media/voice_intro
And the file should be uploaded to storage
And my profile should show "Voice intro recorded"
```

### Scenario: Delete voice intro
```gherkin
Given I have a recorded voice intro
When I click Delete on my voice intro
And I confirm deletion
Then the API should receive DELETE /api/me/media/voice_intro
And the voice intro should be removed
```

---

## SPEC-PD-004: Video Introduction

**Requirement:** Users can upload a 90-second video introduction.

### Scenario: Upload video intro
```gherkin
Given I am on My Profile page
When I click "Upload" next to Video Introduction
Then a file picker should open
And only video files (mp4, webm) should be selectable

When I select a video file
Then I should see upload progress
And if the video is longer than 90 seconds, I should see an error
And if successful, a thumbnail should appear
```

### Scenario: View video intro on profile
```gherkin
Given a user has uploaded a video intro
When I view their profile
Then I should see a video thumbnail with a play button
When I click the thumbnail
Then the video should play inline or in a modal
```

---

## SPEC-PD-005: Fun Facts

**Requirement:** Users can add fun facts about themselves.

### Scenario: Add fun fact
```gherkin
Given I am on My Profile page
When I click [+ Add] in the Fun Facts section
Then an input field should appear

When I type "I have 3 cats" and optionally select an emoji 🐱
And I press Enter or click Add
Then the fun fact should appear in my list
And I should be able to add more (up to 10)
```

### Scenario: Edit fun fact
```gherkin
Given I have fun facts on my profile
When I click Edit on a fun fact
Then I should be able to modify the text
And I should be able to change the emoji
When I save
Then the fun fact should be updated
```

### Scenario: Reorder fun facts
```gherkin
Given I have multiple fun facts
When I drag a fun fact to a new position
Then the order should update
And the new order should be saved
```

---

## SPEC-PD-006: Ask Me About Topics

**Requirement:** Users can list topics they're happy to help others with.

### Scenario: Add expertise topic
```gherkin
Given I am on My Profile page
When I click [+ Add] in "Ask Me About" section
Then a tag input should appear

When I type "React" and press Enter
Then "React" should appear as a tag
And I should be able to add more topics
```

### Scenario: Topic autocomplete
```gherkin
Given other users have added similar topics
When I start typing "Reac"
Then I should see autocomplete suggestions like "React", "React Native"
When I select a suggestion
Then it should be added as my topic
```

---

## SPEC-PD-007: People Directory Listing

**Requirement:** Users can browse and search the people directory.

### Scenario: View directory
```gherkin
Given I am logged in
When I navigate to People
Then I should see a grid of person cards
And each card should show photo, name, title, department
And I should see a search bar
And I should see filter dropdowns for Department, Location
```

### Scenario: Search by name
```gherkin
Given I am on the People directory
When I type "Sarah" in the search bar
Then the list should filter to show only people with "Sarah" in their name
And the search should be case-insensitive
And results should update as I type (debounced)
```

### Scenario: Filter by department
```gherkin
Given I am on the People directory
When I select "Engineering" from the Department dropdown
Then only people in Engineering department should be shown
And the count should update to reflect filtered results
```

### Scenario: Grid/List view toggle
```gherkin
Given I am on the People directory in grid view
When I click the List view toggle
Then the layout should change to a list/table format
And my preference should be remembered
```

---

## SPEC-PD-008: Person Profile View

**Requirement:** Users can view detailed profiles of coworkers.

### Scenario: View coworker profile
```gherkin
Given I am on the People directory
When I click on a person card
Then I should be taken to their profile page
And I should see their full profile information
And I should see their media (voice/video if available)
And I should see their fun facts and interests
```

### Scenario: Contact information visibility
```gherkin
Given I am viewing a coworker's profile
And they have set their phone number to "Manager only"
And I am not their manager
Then I should NOT see their phone number

Given I am their manager
Then I should see their phone number
```

### Scenario: Play voice intro
```gherkin
Given I am viewing a profile with a voice intro
When I click "Listen to intro"
Then the audio should play
And I should see a waveform or progress indicator
```

---

## SPEC-PD-009: New Joiners Section

**Requirement:** Highlight recently joined team members.

### Scenario: View new joiners
```gherkin
Given there are employees who started within the last 30 days
When I view the People directory
Then I should see a "New to the Team" section at the top
And it should show cards for recent joiners
And it should show their start date or "Started X days ago"
```

### Scenario: New joiner highlight
```gherkin
Given a user started within the last 7 days
When I view their profile or card
Then I should see a "New" badge
```

---

## SPEC-PD-010: My Team View

**Requirement:** Users can see their team structure.

### Scenario: View my manager
```gherkin
Given I have a manager assigned
When I navigate to My Team
Then I should see my manager's card at the top
And I should be able to click to view their profile
```

### Scenario: View peers
```gherkin
Given I have a manager with other direct reports
When I view My Team
Then I should see a "Peers" section
And it should show others who report to my manager
```

### Scenario: View direct reports (manager only)
```gherkin
Given I am a manager with direct reports
When I view My Team
Then I should see a "Your Direct Reports" section
And it should list all my direct reports
```

---

## SPEC-PD-011: Privacy Settings

**Requirement:** Users can control who sees their personal information.

### Scenario: Configure field visibility
```gherkin
Given I am on My Profile > Privacy Settings
Then I should see a list of fields with visibility dropdowns
And options should include: "Everyone", "My Team", "My Manager", "Only Me"

When I set "Mobile Phone" to "My Manager Only"
And I click Save
Then my phone should only be visible to my manager
```

### Scenario: Preview privacy
```gherkin
Given I am on Privacy Settings
When I click "Preview how others see me"
Then I should see my profile as others would see it
And hidden fields should show as "[Hidden]" or not appear
```

---

## SPEC-PD-012: Search by Skills/Interests

**Requirement:** Find coworkers with specific expertise or interests.

### Scenario: Search by expertise
```gherkin
Given I am on the People directory
When I search for "kubernetes"
Then I should see people who have "Kubernetes" in their "Ask Me About" topics
And results should include the matched topic highlighted
```

### Scenario: Click to find similar
```gherkin
Given I am viewing someone's profile
And they have "Photography" as an interest
When I click on the "Photography" tag
Then I should be taken to the People directory
And it should be filtered to show others with "Photography" interest
```
