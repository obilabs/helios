// Profile API service for My Profile page

import { apiPath, authFetch } from '../config/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// Profile types
export interface Profile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  department: string | null;
  bio: string | null;
  pronouns: string | null;
  currentStatus: string | null;
  avatarUrl: string | null;
  mobilePhone: string | null;
  workPhone: string | null;
  timezone: string | null;
  preferredLanguage: string | null;
  location: string | null;
  organizationalUnit: string | null;
  employeeType: string | null;
  startDate: string | null;
  profileCompleteness: number;
  profileUpdatedAt: string | null;
  createdAt: string;
}

export interface FunFact {
  id: string;
  emoji: string | null;
  content: string;
  displayOrder: number;
}

export interface Interest {
  id: string;
  interest: string;
  category: string | null;
}

export interface ExpertiseTopic {
  id: string;
  topic: string;
  skillLevel: string | null;
}

export interface MediaInfo {
  id: string;
  mediaType: string;
  fileName: string;
  durationSeconds: number | null;
  transcription: string | null;
  presignedUrl: string;
  createdAt: string;
}

export interface ProfileData {
  profile: Profile;
  funFacts: FunFact[];
  interests: Interest[];
  expertiseTopics: ExpertiseTopic[];
  media: Record<string, MediaInfo | null>;
  visibility: Record<string, string>;
}

export interface MediaConstraints {
  [key: string]: {
    maxDurationSeconds: number;
    maxSizeBytes: number;
    allowedMimeTypes: string[];
  };
}

export interface TeamData {
  manager: Profile | null;
  peers: Profile[];
  directReports: Profile[];
}

export interface UserGroup {
  id: string;
  name: string;
  description: string | null;
  email: string | null;
  platform: string;
  groupType: string;
  externalId: string | null;
  externalUrl: string | null;
  isActive: boolean;
  createdAt: string;
  memberType: string;
  joinedAt: string;
  memberCount: number;
}

// Helper to get content-type headers (auth is handled by authFetch via cookies)
function getJsonHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
  };
}

// Profile API functions
export const profileService = {
  // Get current user's profile
  async getProfile(): Promise<ProfileData | null> {
    try {
      const response = await authFetch(apiPath('/me/profile'));
      const data: ApiResponse<ProfileData> = await response.json();
      return data.success ? data.data! : null;
    } catch (error) {
      console.error('Failed to fetch profile:', error);
      return null;
    }
  },

  // Update profile
  async updateProfile(updates: Partial<Profile>): Promise<boolean> {
    try {
      const response = await authFetch(apiPath('/me/profile'), {
        method: 'PUT',
        headers: getJsonHeaders(),
        body: JSON.stringify(updates),
      });
      const data: ApiResponse<void> = await response.json();
      return data.success;
    } catch (error) {
      console.error('Failed to update profile:', error);
      return false;
    }
  },

  // Fun Facts
  async addFunFact(emoji: string | null, content: string): Promise<FunFact | null> {
    try {
      const response = await authFetch(apiPath('/me/fun-facts'), {
        method: 'POST',
        headers: getJsonHeaders(),
        body: JSON.stringify({ emoji, content }),
      });
      const data: ApiResponse<FunFact> = await response.json();
      return data.success ? data.data! : null;
    } catch (error) {
      console.error('Failed to add fun fact:', error);
      return null;
    }
  },

  async updateFunFact(id: string, emoji: string | null, content: string): Promise<boolean> {
    try {
      const response = await authFetch(apiPath(`/me/fun-facts/${id}`), {
        method: 'PUT',
        headers: getJsonHeaders(),
        body: JSON.stringify({ emoji, content }),
      });
      const data: ApiResponse<void> = await response.json();
      return data.success;
    } catch (error) {
      console.error('Failed to update fun fact:', error);
      return false;
    }
  },

  async deleteFunFact(id: string): Promise<boolean> {
    try {
      const response = await authFetch(apiPath(`/me/fun-facts/${id}`), {
        method: 'DELETE',
      });
      const data: ApiResponse<void> = await response.json();
      return data.success;
    } catch (error) {
      console.error('Failed to delete fun fact:', error);
      return false;
    }
  },

  // Interests
  async addInterest(interest: string, category?: string): Promise<Interest | null> {
    try {
      const response = await authFetch(apiPath('/me/interests'), {
        method: 'POST',
        headers: getJsonHeaders(),
        body: JSON.stringify({ interest, category }),
      });
      const data: ApiResponse<Interest> = await response.json();
      return data.success ? data.data! : null;
    } catch (error) {
      console.error('Failed to add interest:', error);
      return null;
    }
  },

  async deleteInterest(id: string): Promise<boolean> {
    try {
      const response = await authFetch(apiPath(`/me/interests/${id}`), {
        method: 'DELETE',
      });
      const data: ApiResponse<void> = await response.json();
      return data.success;
    } catch (error) {
      console.error('Failed to delete interest:', error);
      return false;
    }
  },

  // Expertise Topics
  async addExpertise(topic: string, skillLevel?: string): Promise<ExpertiseTopic | null> {
    try {
      const response = await authFetch(apiPath('/me/expertise'), {
        method: 'POST',
        headers: getJsonHeaders(),
        body: JSON.stringify({ topic, skillLevel }),
      });
      const data: ApiResponse<ExpertiseTopic> = await response.json();
      return data.success ? data.data! : null;
    } catch (error) {
      console.error('Failed to add expertise:', error);
      return null;
    }
  },

  async deleteExpertise(id: string): Promise<boolean> {
    try {
      const response = await authFetch(apiPath(`/me/expertise/${id}`), {
        method: 'DELETE',
      });
      const data: ApiResponse<void> = await response.json();
      return data.success;
    } catch (error) {
      console.error('Failed to delete expertise:', error);
      return false;
    }
  },

  // Privacy Settings
  async getPrivacySettings(): Promise<Record<string, string>> {
    try {
      const response = await authFetch(apiPath('/me/privacy'));
      const data: ApiResponse<Record<string, string>> = await response.json();
      return data.success ? data.data! : {};
    } catch (error) {
      console.error('Failed to fetch privacy settings:', error);
      return {};
    }
  },

  async updatePrivacySettings(settings: Record<string, string>): Promise<boolean> {
    try {
      const response = await authFetch(apiPath('/me/privacy'), {
        method: 'PUT',
        headers: getJsonHeaders(),
        body: JSON.stringify({ settings }),
      });
      const data: ApiResponse<void> = await response.json();
      return data.success;
    } catch (error) {
      console.error('Failed to update privacy settings:', error);
      return false;
    }
  },

  // Media
  async getMediaConstraints(): Promise<MediaConstraints | null> {
    try {
      const response = await authFetch(apiPath('/me/media/constraints'));
      const data: ApiResponse<MediaConstraints> = await response.json();
      return data.success ? data.data! : null;
    } catch (error) {
      console.error('Failed to fetch media constraints:', error);
      return null;
    }
  },

  async uploadMedia(
    mediaType: 'voice_intro' | 'video_intro' | 'name_pronunciation',
    file: Blob,
    duration?: number
  ): Promise<{ mediaId: string; presignedUrl: string } | null> {
    try {
      const formData = new FormData();
      formData.append('file', file, `${mediaType}.webm`);
      if (duration !== undefined) {
        formData.append('duration', duration.toString());
      }

      // Note: Don't set Content-Type for FormData - browser sets it with boundary
      const response = await authFetch(apiPath(`/me/media/${mediaType}`), {
        method: 'POST',
        body: formData,
      });
      const data: ApiResponse<{ mediaId: string; presignedUrl: string }> = await response.json();
      return data.success ? data.data! : null;
    } catch (error) {
      console.error('Failed to upload media:', error);
      return null;
    }
  },

  async deleteMedia(mediaType: 'voice_intro' | 'video_intro' | 'name_pronunciation'): Promise<boolean> {
    try {
      const response = await authFetch(apiPath(`/me/media/${mediaType}`), {
        method: 'DELETE',
      });
      const data: ApiResponse<void> = await response.json();
      return data.success;
    } catch (error) {
      console.error('Failed to delete media:', error);
      return false;
    }
  },

  // Team
  async getTeam(): Promise<TeamData | null> {
    try {
      const response = await authFetch(apiPath('/me/team'));
      const data: ApiResponse<TeamData> = await response.json();
      return data.success ? data.data! : null;
    } catch (error) {
      console.error('Failed to fetch team:', error);
      return null;
    }
  },

  // Groups
  async getMyGroups(): Promise<UserGroup[]> {
    try {
      const response = await authFetch(apiPath('/me/groups'));
      const data: ApiResponse<UserGroup[]> = await response.json();
      return data.success ? data.data! : [];
    } catch (error) {
      console.error('Failed to fetch groups:', error);
      return [];
    }
  },
};
