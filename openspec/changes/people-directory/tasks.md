# Tasks: People Directory (User-Facing)

## Phase 1: My Profile

### Backend Tasks

- [x] **TASK-PD-001**: Create user media table migration
  - Store voice_intro, video_intro, name_pronunciation
  - Link to MinIO storage
  - File: `database/migrations/033_add_people_directory_tables.sql`

- [x] **TASK-PD-002**: Create user profile extended fields migration
  - fun_facts, expertise_topics, interests tables
  - current_status field on organization_users
  - File: `database/migrations/033_add_people_directory_tables.sql`

- [x] **TASK-PD-003**: Create /api/me/profile endpoints
  - GET - fetch own profile for editing
  - PUT - update own profile fields
  - File: `backend/src/routes/me.routes.ts`

- [x] **TASK-PD-004**: Create /api/me/media endpoints
  - POST - upload media file to MinIO
  - DELETE - remove media file
  - File: `backend/src/routes/me.routes.ts`

- [x] **TASK-PD-005**: Create media upload service
  - Handle file validation (type, size, duration)
  - Upload to MinIO with proper path structure
  - Generate presigned URLs for playback
  - File: `backend/src/services/media-upload.service.ts`

### Frontend Tasks

- [x] **TASK-PD-006**: Create MyProfile page component
  - Profile editing form layout
  - Tab sections or collapsible sections
  - File: `frontend/src/pages/MyProfile.tsx`

- [x] **TASK-PD-007**: Create MediaRecorder component
  - Audio recording with waveform visualization
  - Timer countdown to max duration
  - Preview and re-record options
  - File: `frontend/src/components/MediaRecorder.tsx`
  - **Completed:** Full MediaRecorder component with recording, playback, upload

- [x] **TASK-PD-008**: Create FunFactsEditor component
  - Add/edit/delete fun facts
  - Optional emoji picker
  - Drag to reorder (basic reorder API exists)
  - File: `frontend/src/pages/MyProfile.tsx` (integrated inline)

- [x] **TASK-PD-009**: Create InterestTagsEditor component
  - Tag input for interests
  - Autocomplete from common interests (basic)
  - Category grouping (optional)
  - File: `frontend/src/pages/MyProfile.tsx` (integrated inline)

- [x] **TASK-PD-010**: Add profile completeness indicator
  - Calculate completion percentage (backend function)
  - Show missing fields with prompts
  - File: `frontend/src/pages/MyProfile.tsx` (completeness ring)

## Phase 2: People Directory

### Backend Tasks

- [x] **TASK-PD-011**: Create /api/people endpoints
  - GET /api/people - list with pagination, filtering
  - GET /api/people/:id - view profile
  - GET /api/people/search - search by name, skills
  - GET /api/people/new - recently joined
  - GET /api/people/filters - get department/location filter options
  - GET /api/people/by-skill/:topic - find people by expertise
  - File: `backend/src/routes/people.routes.ts`
  - **Completed:** Full People API with pagination, search, and filtering

- [x] **TASK-PD-012**: Implement privacy filtering in people API
  - Check visibility settings per field
  - Filter response based on viewer's relationship (self, manager, team, other)
  - File: `backend/src/services/people.service.ts`
  - **Completed:** Privacy-aware profile fetching with relationship checks

### Frontend Tasks

- [x] **TASK-PD-013**: Create People directory page
  - Grid/list view toggle
  - Search bar with debounce
  - Department/location filters
  - Sort by name, department, or start date
  - Load more pagination
  - File: `frontend/src/pages/People.tsx`
  - **Completed:** Full People directory with grid/list views and filtering

- [x] **TASK-PD-014**: Create PersonCard component
  - Photo, name, title, department
  - Media indicators (has video/audio)
  - Expertise/interests counts
  - New joiner badge
  - Grid and list view variants
  - File: `frontend/src/components/PersonCard.tsx`
  - **Completed:** Responsive card component with media indicators

- [x] **TASK-PD-015**: Create PersonProfile page
  - Full profile view via slide-out panel
  - Media playback (voice intro, name pronunciation)
  - Contact information (based on privacy)
  - Manager info, expertise topics, interests, fun facts
  - File: `frontend/src/components/PersonSlideOut.tsx`
  - **Completed:** PersonSlideOut with Overview and About tabs

- [x] **TASK-PD-016**: Create NewJoiners section
  - Filter people by start date (last 30 days)
  - Highlight on directory page with sparkle badge
  - Integrated into People page header
  - File: `frontend/src/pages/People.tsx` (integrated)
  - **Completed:** New Joiners section shows at top of directory

## Phase 3: Rich Media

### Backend Tasks

- [ ] **TASK-PD-017**: Add audio transcription (optional)
  - Transcribe voice intros for accessibility
  - Store transcription in user_media table
  - File: `backend/src/services/transcription.service.ts`

- [x] **TASK-PD-018**: Add video thumbnail generation
  - Extract thumbnail from uploaded video
  - Store thumbnail in MinIO
  - File: `backend/src/services/video.service.ts`
  - **Completed:** Video service with ffmpeg-based thumbnail generation

### Frontend Tasks

- [x] **TASK-PD-019**: Create video upload component
  - File picker with preview
  - Duration validation
  - Upload progress indicator
  - File: `frontend/src/components/VideoUploader.tsx`
  - **Completed:** Full VideoUploader with drag-drop, preview, validation

- [x] **TASK-PD-020**: Create audio player component
  - Custom styled player
  - Waveform visualization
  - Play/pause, seek
  - File: `frontend/src/components/AudioPlayer.tsx`
  - **Completed:** AudioPlayer with waveform visualization, progress seeking

- [x] **TASK-PD-021**: Create video player component
  - Inline player in profile
  - Fullscreen option
  - File: `frontend/src/components/VideoPlayer.tsx`
  - **Completed:** VideoPlayer with fullscreen, progress bar, keyboard controls

## Phase 4: My Team & Discovery

### Backend Tasks

- [x] **TASK-PD-022**: Create /api/me/team endpoint
  - Return manager, peers, direct reports
  - Include basic profile info
  - File: `backend/src/routes/me.routes.ts`
  - **Completed:** Full team endpoint with manager, peers, and direct reports

- [x] **TASK-PD-023**: Create /api/people/by-skill endpoint
  - Search people by "ask me about" topics
  - Return matching profiles
  - File: `backend/src/routes/people.routes.ts`
  - **Completed:** /api/people/by-skill/:topic endpoint

### Frontend Tasks

- [x] **TASK-PD-024**: Create MyTeam page
  - Manager section
  - Peers section
  - Direct reports section (if manager)
  - File: `frontend/src/pages/MyTeam.tsx`
  - **Completed:** Full MyTeam page with responsive layout

- [x] **TASK-PD-025**: Add skill/interest search
  - Click on skill tag → search
  - Find people with similar interests
  - File: `frontend/src/pages/People.tsx` (enhance)
  - **Completed:** Clickable expertise/interest tags in PersonSlideOut

## Phase 5: Privacy Settings

### Backend Tasks

- [x] **TASK-PD-026**: Create field_visibility_settings table
  - Per-user visibility preferences
  - Per-field granularity
  - File: `database/migrations/033_add_people_directory_tables.sql` (user_field_visibility table)
  - **Completed:** Table and initialization function created

- [x] **TASK-PD-027**: Create /api/me/privacy endpoints
  - GET - current settings
  - PUT - update settings
  - File: `backend/src/routes/me.routes.ts`
  - **Completed:** GET/PUT /api/me/privacy endpoints implemented

### Frontend Tasks

- [x] **TASK-PD-028**: Create PrivacySettings component
  - Per-field visibility dropdowns
  - Four visibility levels: Everyone, Team, Manager, Only Me
  - File: `frontend/src/pages/MyProfile.tsx` (Privacy tab integrated)
  - **Completed:** Privacy tab with field visibility controls

## Testing Tasks

- [x] **TASK-PD-T01**: E2E tests for My Profile
  - Edit bio, save successfully
  - Record voice intro
  - Add/remove fun facts
  - File: `e2e/tests/my-profile.spec.ts`
  - **Completed:** 30+ test cases covering all tabs, form editing, privacy settings

- [x] **TASK-PD-T02**: E2E tests for People Directory
  - Search by name
  - Filter by department
  - View coworker profile
  - File: `e2e/tests/people-directory.spec.ts`
  - **Completed:** 35+ test cases covering search, filters, views, slideout

- [x] **TASK-PD-T03**: API tests for privacy filtering
  - Verify fields hidden based on settings
  - Verify manager can see manager-only fields
  - File: `backend/src/__tests__/people.routes.test.ts`
  - **Completed:** Comprehensive tests for privacy filtering by relationship

## Estimated Effort

| Phase | Tasks | Effort |
|-------|-------|--------|
| Phase 1: My Profile | 10 tasks | 3-4 days |
| Phase 2: Directory | 6 tasks | 2-3 days |
| Phase 3: Rich Media | 5 tasks | 2 days |
| Phase 4: Discovery | 4 tasks | 1-2 days |
| Phase 5: Privacy | 3 tasks | 1 day |
| Testing | 3 tasks | 1-2 days |

**Total: ~10-14 days**

## Dependencies

```
Migration (TASK-PD-001, PD-002)
  └── Backend routes (TASK-PD-003, PD-004)
       └── Media service (TASK-PD-005)
            └── Frontend MyProfile (TASK-PD-006)
                 └── MediaRecorder (TASK-PD-007)

Directory backend (TASK-PD-011)
  └── Privacy filtering (TASK-PD-012)
       └── Directory frontend (TASK-PD-013)
            └── PersonCard (TASK-PD-014)
                 └── PersonProfile (TASK-PD-015)
```
