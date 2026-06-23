export interface AdminStats {
  total_users: number;
  today_interviews: number;
  total_interviews: number;
  active_users_7d: number;
}

export interface AdminUserItem {
  id: string;
  username: string;
  email: string | null;
  is_admin: boolean;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  interview_count: number;
}

export interface AdminUserDetail {
  id: string;
  username: string;
  email: string | null;
  is_admin: boolean;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  stats: {
    total_interviews: number;
    avg_score: number | null;
    by_category: Record<string, number>;
  };
}

export interface AdminInterviewItem {
  id: string;
  user_id: string;
  username: string;
  interview_category: string;
  position: string;
  difficulty: string;
  total_score: number | null;
  status: string;
  question_count: number | null;
  created_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}
