export const feedbackCategories = ["problem", "improvement", "suggestion", "support"] as const
export type FeedbackCategory = (typeof feedbackCategories)[number]

export const feedbackStatuses = ["open", "in_review", "in_progress", "resolved", "closed"] as const
export type FeedbackStatus = (typeof feedbackStatuses)[number]

export const feedbackPriorities = ["low", "normal", "high", "urgent"] as const
export type FeedbackPriority = (typeof feedbackPriorities)[number]

export interface FeedbackTicket {
  id: string
  organizationId: string
  folio: string
  createdBy: string
  creatorName: string | null
  title: string
  category: FeedbackCategory
  status: FeedbackStatus
  priority: FeedbackPriority
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  closedAt: string | null
}

export interface FeedbackTicketMessage {
  id: string
  ticketId: string
  organizationId: string
  authorId: string
  authorName: string | null
  message: string
  createdAt: string
}
