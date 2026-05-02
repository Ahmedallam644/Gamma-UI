import { pgTable, text, serial, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  topic: text("topic").notNull(),
  studentNames: jsonb("student_names").$type<string[]>().notNull(),
  supervisorName: text("supervisor_name").notNull(),
  department: text("department").notNull(),
  language: text("language").notNull().default("ar"),
  documentType: text("document_type").notNull().default("word"),
  pageCount: integer("page_count").default(20),
  templateName: text("template_name").default("default"),
  status: text("status").notNull().default("draft"),
  generatedContent: text("generated_content"),
  selectedImages: jsonb("selected_images").$type<string[]>(),
  receiptUrl: text("receipt_url"),
  universityLogoUrl: text("university_logo_url"),
  facultyLogoUrl: text("faculty_logo_url"),
  docxDownloadUrl: text("docx_download_url"),
  pptxDownloadUrl: text("pptx_download_url"),
  rejectionReason: text("rejection_reason"),
  studentId: text("student_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
