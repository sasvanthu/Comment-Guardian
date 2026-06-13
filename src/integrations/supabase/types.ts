export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          target: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          target?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          target?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_analysis: {
        Row: {
          comment_id: string
          confidence_score: number
          created_at: string
          emotions: Json
          explanation: string | null
          harassment_score: number
          id: string
          model: string
          priority: string
          raw: Json | null
          reason: string | null
          recommendation: string
          risk_score: number
          scores: Json
          sentiment: string
          spam_score: number
          toxicity_score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          comment_id: string
          confidence_score?: number
          created_at?: string
          emotions?: Json
          explanation?: string | null
          harassment_score?: number
          id?: string
          model?: string
          priority?: string
          raw?: Json | null
          reason?: string | null
          recommendation?: string
          risk_score?: number
          scores?: Json
          sentiment?: string
          spam_score?: number
          toxicity_score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          confidence_score?: number
          created_at?: string
          emotions?: Json
          explanation?: string | null
          harassment_score?: number
          id?: string
          model?: string
          priority?: string
          raw?: Json | null
          reason?: string | null
          recommendation?: string
          risk_score?: number
          scores?: Json
          sentiment?: string
          spam_score?: number
          toxicity_score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_analysis_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: true
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      api_usage: {
        Row: {
          cost_estimate: number
          created_at: string
          day: string
          id: string
          metadata: Json
          operation: string | null
          service: string
          units: number
          user_id: string
        }
        Insert: {
          cost_estimate?: number
          created_at?: string
          day?: string
          id?: string
          metadata?: Json
          operation?: string | null
          service: string
          units?: number
          user_id: string
        }
        Update: {
          cost_estimate?: number
          created_at?: string
          day?: string
          id?: string
          metadata?: Json
          operation?: string | null
          service?: string
          units?: number
          user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          new_state: Json | null
          previous_state: Json | null
          user_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          new_state?: Json | null
          previous_state?: Json | null
          user_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          new_state?: Json | null
          previous_state?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      blacklist: {
        Row: {
          created_at: string
          id: string
          type: Database["public"]["Enums"]["blacklist_type"]
          user_id: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          type: Database["public"]["Enums"]["blacklist_type"]
          user_id: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["public"]["Enums"]["blacklist_type"]
          user_id?: string
          value?: string
        }
        Relationships: []
      }
      case_comments: {
        Row: {
          added_at: string
          case_id: string
          comment_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          case_id: string
          comment_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          case_id?: string
          comment_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_comments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_comments_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          assignee_id: string | null
          closed_at: string | null
          created_at: string
          id: string
          metadata: Json
          severity: Database["public"]["Enums"]["review_priority"]
          status: Database["public"]["Enums"]["case_status"]
          subject_author: string | null
          subject_platform: string | null
          summary: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assignee_id?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          severity?: Database["public"]["Enums"]["review_priority"]
          status?: Database["public"]["Enums"]["case_status"]
          subject_author?: string | null
          subject_platform?: string | null
          summary?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assignee_id?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          severity?: Database["public"]["Enums"]["review_priority"]
          status?: Database["public"]["Enums"]["case_status"]
          subject_author?: string | null
          subject_platform?: string | null
          summary?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          author: string
          category: Database["public"]["Enums"]["comment_category"]
          created_at: string
          external_id: string | null
          id: string
          language: string | null
          permalink: string | null
          platform: string
          post_id: string | null
          review_status: Database["public"]["Enums"]["review_status"]
          sentiment: Database["public"]["Enums"]["comment_sentiment"]
          status: Database["public"]["Enums"]["comment_status"]
          text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          author: string
          category?: Database["public"]["Enums"]["comment_category"]
          created_at?: string
          external_id?: string | null
          id?: string
          language?: string | null
          permalink?: string | null
          platform: string
          post_id?: string | null
          review_status?: Database["public"]["Enums"]["review_status"]
          sentiment?: Database["public"]["Enums"]["comment_sentiment"]
          status?: Database["public"]["Enums"]["comment_status"]
          text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          author?: string
          category?: Database["public"]["Enums"]["comment_category"]
          created_at?: string
          external_id?: string | null
          id?: string
          language?: string | null
          permalink?: string | null
          platform?: string
          post_id?: string | null
          review_status?: Database["public"]["Enums"]["review_status"]
          sentiment?: Database["public"]["Enums"]["comment_sentiment"]
          status?: Database["public"]["Enums"]["comment_status"]
          text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      moderation_actions: {
        Row: {
          action: Database["public"]["Enums"]["moderation_action_type"]
          actor_id: string | null
          comment_id: string | null
          created_at: string
          id: string
          metadata: Json
          new_state: Json | null
          previous_state: Json | null
          reason: string | null
          review_queue_id: string | null
          user_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["moderation_action_type"]
          actor_id?: string | null
          comment_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          new_state?: Json | null
          previous_state?: Json | null
          reason?: string | null
          review_queue_id?: string | null
          user_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["moderation_action_type"]
          actor_id?: string | null
          comment_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          new_state?: Json | null
          previous_state?: Json | null
          reason?: string | null
          review_queue_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_actions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_review_queue_id_fkey"
            columns: ["review_queue_id"]
            isOneToOne: false
            referencedRelation: "review_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      moderator_feedback: {
        Row: {
          comment_id: string
          created_at: string
          feedback: Database["public"]["Enums"]["feedback_type"]
          id: string
          notes: string | null
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          feedback: Database["public"]["Enums"]["feedback_type"]
          id?: string
          notes?: string | null
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          feedback?: Database["public"]["Enums"]["feedback_type"]
          id?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderator_feedback_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json
          read_at: string | null
          severity: Database["public"]["Enums"]["notification_severity"]
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          read_at?: string | null
          severity?: Database["public"]["Enums"]["notification_severity"]
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          read_at?: string | null
          severity?: Database["public"]["Enums"]["notification_severity"]
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_connections: {
        Row: {
          created_at: string
          id: string
          imported_count: number
          last_error: string | null
          last_sync_at: string | null
          platform: string
          rate_limit_remaining: number | null
          rate_limit_reset_at: string | null
          status: string
          sync_cursor: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          imported_count?: number
          last_error?: string | null
          last_sync_at?: string | null
          platform: string
          rate_limit_remaining?: number | null
          rate_limit_reset_at?: string | null
          status?: string
          sync_cursor?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          imported_count?: number
          last_error?: string | null
          last_sync_at?: string | null
          platform?: string
          rate_limit_remaining?: number | null
          rate_limit_reset_at?: string | null
          status?: string
          sync_cursor?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_health: {
        Row: {
          connection_id: string | null
          error_count: number
          error_rate: number | null
          id: string
          last_error: string | null
          latency_ms: number | null
          metadata: Json
          observed_at: string
          platform: string
          status: Database["public"]["Enums"]["platform_health_status"]
          success_count: number
          user_id: string
        }
        Insert: {
          connection_id?: string | null
          error_count?: number
          error_rate?: number | null
          id?: string
          last_error?: string | null
          latency_ms?: number | null
          metadata?: Json
          observed_at?: string
          platform: string
          status?: Database["public"]["Enums"]["platform_health_status"]
          success_count?: number
          user_id: string
        }
        Update: {
          connection_id?: string | null
          error_count?: number
          error_rate?: number | null
          id?: string
          last_error?: string | null
          latency_ms?: number | null
          metadata?: Json
          observed_at?: string
          platform?: string
          status?: Database["public"]["Enums"]["platform_health_status"]
          success_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_health_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "platform_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      research_queries: {
        Row: {
          analysis_results: Json | null
          created_at: string
          id: string
          text: string
          user_id: string
        }
        Insert: {
          analysis_results?: Json | null
          created_at?: string
          id?: string
          text: string
          user_id: string
        }
        Update: {
          analysis_results?: Json | null
          created_at?: string
          id?: string
          text?: string
          user_id?: string
        }
        Relationships: []
      }
      review_queue: {
        Row: {
          assigned_at: string | null
          assignee_id: string | null
          comment_id: string
          created_at: string
          id: string
          metadata: Json
          priority: Database["public"]["Enums"]["review_priority"]
          reason: string | null
          resolved_at: string | null
          risk_score: number
          status: Database["public"]["Enums"]["review_queue_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assignee_id?: string | null
          comment_id: string
          created_at?: string
          id?: string
          metadata?: Json
          priority?: Database["public"]["Enums"]["review_priority"]
          reason?: string | null
          resolved_at?: string | null
          risk_score?: number
          status?: Database["public"]["Enums"]["review_queue_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assignee_id?: string | null
          comment_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          priority?: Database["public"]["Enums"]["review_priority"]
          reason?: string | null
          resolved_at?: string | null
          risk_score?: number
          status?: Database["public"]["Enums"]["review_queue_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_queue_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: true
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_jobs: {
        Row: {
          attempts: number
          created_at: string
          failure_reason: string | null
          finished_at: string | null
          id: string
          job_type: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_attempt_at: string | null
          parent_job_id: string | null
          payload: Json
          related_comment_id: string | null
          related_connection_id: string | null
          result: Json | null
          retry_count: number
          scheduled_for: string
          started_at: string | null
          status: Database["public"]["Enums"]["sync_job_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          failure_reason?: string | null
          finished_at?: string | null
          id?: string
          job_type: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          parent_job_id?: string | null
          payload?: Json
          related_comment_id?: string | null
          related_connection_id?: string | null
          result?: Json | null
          retry_count?: number
          scheduled_for?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["sync_job_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          failure_reason?: string | null
          finished_at?: string | null
          id?: string
          job_type?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          parent_job_id?: string | null
          payload?: Json
          related_comment_id?: string | null
          related_connection_id?: string | null
          result?: Json | null
          retry_count?: number
          scheduled_for?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["sync_job_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "sync_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_jobs_related_comment_id_fkey"
            columns: ["related_comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_jobs_related_connection_id_fkey"
            columns: ["related_connection_id"]
            isOneToOne: false
            referencedRelation: "platform_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workflow_executions: {
        Row: {
          actions_taken: Json
          comment_id: string | null
          created_at: string
          error: string | null
          id: string
          rule_id: string
          status: string
          user_id: string
        }
        Insert: {
          actions_taken?: Json
          comment_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          rule_id: string
          status?: string
          user_id: string
        }
        Update: {
          actions_taken?: Json
          comment_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          rule_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_executions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_executions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "workflow_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_rules: {
        Row: {
          actions: Json
          conditions: Json
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          last_run_at: string | null
          name: string
          priority: number
          run_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          actions?: Json
          conditions?: Json
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          name: string
          priority?: number
          run_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          actions?: Json
          conditions?: Json
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          name?: string
          priority?: number
          run_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      blacklist_type: "keyword" | "user_handle"
      case_status:
        | "open"
        | "investigating"
        | "escalated"
        | "closed"
        | "archived"
      comment_category:
        | "toxic"
        | "spam"
        | "cyberbullying"
        | "neutral"
        | "positive"
      comment_sentiment: "positive" | "neutral" | "negative"
      comment_status: "allowed" | "hidden" | "deleted"
      feedback_type:
        | "correct"
        | "false_positive"
        | "wrong_category"
        | "missed_context"
      moderation_action_type:
        | "approve"
        | "reject"
        | "hide"
        | "delete"
        | "escalate"
        | "reassign"
        | "blacklist"
        | "whitelist"
        | "bypass"
        | "restore"
        | "note"
      notification_severity: "info" | "success" | "warning" | "danger"
      platform_health_status: "healthy" | "degraded" | "down" | "unknown"
      review_priority: "low" | "medium" | "high" | "critical"
      review_queue_status:
        | "pending"
        | "assigned"
        | "reviewed"
        | "approved"
        | "ignored"
        | "escalated"
        | "resolved"
      review_status:
        | "pending"
        | "reviewed"
        | "approved"
        | "ignored"
        | "escalated"
      sync_job_status:
        | "queued"
        | "running"
        | "succeeded"
        | "failed"
        | "dead_letter"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      blacklist_type: ["keyword", "user_handle"],
      case_status: ["open", "investigating", "escalated", "closed", "archived"],
      comment_category: [
        "toxic",
        "spam",
        "cyberbullying",
        "neutral",
        "positive",
      ],
      comment_sentiment: ["positive", "neutral", "negative"],
      comment_status: ["allowed", "hidden", "deleted"],
      feedback_type: [
        "correct",
        "false_positive",
        "wrong_category",
        "missed_context",
      ],
      moderation_action_type: [
        "approve",
        "reject",
        "hide",
        "delete",
        "escalate",
        "reassign",
        "blacklist",
        "whitelist",
        "bypass",
        "restore",
        "note",
      ],
      notification_severity: ["info", "success", "warning", "danger"],
      platform_health_status: ["healthy", "degraded", "down", "unknown"],
      review_priority: ["low", "medium", "high", "critical"],
      review_queue_status: [
        "pending",
        "assigned",
        "reviewed",
        "approved",
        "ignored",
        "escalated",
        "resolved",
      ],
      review_status: [
        "pending",
        "reviewed",
        "approved",
        "ignored",
        "escalated",
      ],
      sync_job_status: [
        "queued",
        "running",
        "succeeded",
        "failed",
        "dead_letter",
        "cancelled",
      ],
    },
  },
} as const
