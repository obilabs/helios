// People Directory API service

import { apiPath, authFetch } from '../config/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  pagination?: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// Types for People Directory
export interface PersonCard {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  jobTitle?: string;
  department?: string;
  location?: string;
  avatarUrl?: string;
  hasMedia: boolean;
  hasVoiceIntro: boolean;
  hasVideoIntro: boolean;
  interestCount: number;
  expertiseCount: number;
  isNewJoiner: boolean;
}

export interface PersonProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  jobTitle?: string;
  department?: string;
  location?: string;
  avatarUrl?: string;
  pronouns?: string;
  bio?: string;
  currentStatus?: string;
  startDate?: string;
  mobilePhone?: string;
  workPhone?: string;
  timezone?: string;
  organizationalUnit?: string;
  employeeType?: string;
  reportingManagerId?: string;
  manager?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    jobTitle?: string;
  };
  funFacts?: Array<{
    id: string;
    emoji?: string;
    content: string;
  }>;
  interests?: Array<{
    id: string;
    interest: string;
    category?: string;
  }>;
  expertiseTopics?: Array<{
    id: string;
    topic: string;
    skillLevel?: string;
  }>;
  media?: {
    hasVoiceIntro: boolean;
    hasVideoIntro: boolean;
    hasNamePronunciation: boolean;
  };
  profileCompleteness?: number;
  isNewJoiner?: boolean;
}

export interface FilterOptions {
  departments: string[];
  locations: string[];
}

export interface ListPeopleParams {
  search?: string;
  department?: string;
  location?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'name' | 'department' | 'startDate';
  sortOrder?: 'asc' | 'desc';
  newJoinersOnly?: boolean;
  hasMedia?: boolean;
}

class PeopleService {
  /**
   * List people in the directory
   */
  async listPeople(params: ListPeopleParams = {}): Promise<{
    people: PersonCard[];
    pagination: { total: number; limit: number; offset: number; hasMore: boolean };
  } | null> {
    try {
      const queryParams = new URLSearchParams();
      if (params.search) queryParams.set('search', params.search);
      if (params.department) queryParams.set('department', params.department);
      if (params.location) queryParams.set('location', params.location);
      if (params.limit) queryParams.set('limit', params.limit.toString());
      if (params.offset) queryParams.set('offset', params.offset.toString());
      if (params.sortBy) queryParams.set('sortBy', params.sortBy);
      if (params.sortOrder) queryParams.set('sortOrder', params.sortOrder);
      if (params.newJoinersOnly) queryParams.set('newJoinersOnly', 'true');
      if (params.hasMedia) queryParams.set('hasMedia', 'true');

      const response = await authFetch(apiPath(`/people?${queryParams}`));

      if (!response.ok) {
        console.error('Failed to list people:', response.status);
        return null;
      }

      const result: ApiResponse<PersonCard[]> = await response.json();
      if (result.success && result.data && result.pagination) {
        return {
          people: result.data,
          pagination: result.pagination,
        };
      }
      return null;
    } catch (error) {
      console.error('Error listing people:', error);
      return null;
    }
  }

  /**
   * Search people by name, skills, or interests
   */
  async searchPeople(
    query: string,
    options: { limit?: number; fields?: string[] } = {}
  ): Promise<PersonCard[]> {
    try {
      const queryParams = new URLSearchParams();
      queryParams.set('q', query);
      if (options.limit) queryParams.set('limit', options.limit.toString());
      if (options.fields) queryParams.set('fields', options.fields.join(','));

      const response = await authFetch(apiPath(`/people/search?${queryParams}`));

      if (!response.ok) {
        console.error('Failed to search people:', response.status);
        return [];
      }

      const result: ApiResponse<PersonCard[]> = await response.json();
      return result.success && result.data ? result.data : [];
    } catch (error) {
      console.error('Error searching people:', error);
      return [];
    }
  }

  /**
   * Get new joiners (recently started)
   */
  async getNewJoiners(limit = 10): Promise<PersonCard[]> {
    try {
      const response = await authFetch(apiPath(`/people/new?limit=${limit}`));

      if (!response.ok) {
        console.error('Failed to get new joiners:', response.status);
        return [];
      }

      const result: ApiResponse<PersonCard[]> = await response.json();
      return result.success && result.data ? result.data : [];
    } catch (error) {
      console.error('Error getting new joiners:', error);
      return [];
    }
  }

  /**
   * Get filter options (departments, locations)
   */
  async getFilterOptions(): Promise<FilterOptions | null> {
    try {
      const response = await authFetch(apiPath('/people/filters'));

      if (!response.ok) {
        console.error('Failed to get filter options:', response.status);
        return null;
      }

      const result: ApiResponse<FilterOptions> = await response.json();
      return result.success && result.data ? result.data : null;
    } catch (error) {
      console.error('Error getting filter options:', error);
      return null;
    }
  }

  /**
   * Get a single person's profile
   */
  async getPersonProfile(personId: string): Promise<PersonProfile | null> {
    try {
      const response = await authFetch(apiPath(`/people/${personId}`));

      if (!response.ok) {
        console.error('Failed to get person profile:', response.status);
        return null;
      }

      const result: ApiResponse<PersonProfile> = await response.json();
      return result.success && result.data ? result.data : null;
    } catch (error) {
      console.error('Error getting person profile:', error);
      return null;
    }
  }

  /**
   * Find people by expertise topic
   */
  async findByExpertise(topic: string, limit = 10): Promise<PersonCard[]> {
    try {
      const response = await authFetch(
        apiPath(`/people/by-skill/${encodeURIComponent(topic)}?limit=${limit}`)
      );

      if (!response.ok) {
        console.error('Failed to find by expertise:', response.status);
        return [];
      }

      const result: ApiResponse<PersonCard[]> = await response.json();
      return result.success && result.data ? result.data : [];
    } catch (error) {
      console.error('Error finding by expertise:', error);
      return [];
    }
  }

  /**
   * Get person's media URL
   */
  async getPersonMedia(
    personId: string,
    mediaType: 'voice_intro' | 'video_intro' | 'name_pronunciation'
  ): Promise<{ presignedUrl: string } | null> {
    try {
      const response = await authFetch(apiPath(`/people/${personId}/media/${mediaType}`));

      if (!response.ok) {
        console.error('Failed to get person media:', response.status);
        return null;
      }

      const result: ApiResponse<{ presignedUrl: string }> = await response.json();
      return result.success && result.data ? result.data : null;
    } catch (error) {
      console.error('Error getting person media:', error);
      return null;
    }
  }
}

export const peopleService = new PeopleService();
