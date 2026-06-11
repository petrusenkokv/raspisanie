CREATE TABLE "bookings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" varchar NOT NULL,
	"time_slot_id" varchar NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"booked_by" varchar NOT NULL,
	"notes" text,
	"recurring_booking_id" varchar,
	"attendance_status" text,
	"attendance_note" text,
	"attendance_marked_at" timestamp,
	"consumed_trainer_payment_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"confirmed_at" timestamp,
	"cancelled_at" timestamp
);

CREATE TABLE "documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"kind" text DEFAULT 'required' NOT NULL,
	"price_surcharge_rub" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE "holidays" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" text NOT NULL,
	"name" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "holidays_date_unique" UNIQUE("date")
);

CREATE TABLE "membership_payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" varchar NOT NULL,
	"type" text NOT NULL,
	"month" text,
	"paid_date" text,
	"date" text,
	"note" text,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE "notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"related_booking_id" varchar,
	"related_user_id" varchar,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE "parent_children" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" varchar NOT NULL,
	"child_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE "payment_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" varchar NOT NULL,
	"type" text NOT NULL,
	"paid_date" text,
	"date" text,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"resolved_at" timestamp,
	"resolved_by" varchar
);

CREATE TABLE "recurring_booking_exceptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recurring_booking_id" varchar NOT NULL,
	"date" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE "recurring_bookings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" varchar NOT NULL,
	"weekdays" integer[] NOT NULL,
	"hour" integer NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE "time_slots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"time" time NOT NULL,
	"max_capacity" integer DEFAULT 2 NOT NULL,
	"is_manual_capacity" boolean DEFAULT false NOT NULL,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"block_reason" text,
	"block_note" text,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE "trainer_payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" varchar NOT NULL,
	"type" text NOT NULL,
	"total_sessions" integer NOT NULL,
	"start_date" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"note" text,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);

CREATE TABLE "trainer_services" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"price_rub" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE "trainer_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_start_hour" integer DEFAULT 8 NOT NULL,
	"day_end_hour" integer DEFAULT 20 NOT NULL,
	"weekly_template" text DEFAULT '{}' NOT NULL,
	"cancel_deadline_hours" integer DEFAULT 3 NOT NULL,
	"booking_deadline_hours" integer DEFAULT 1 NOT NULL,
	"default_capacity" integer DEFAULT 2 NOT NULL,
	"reminder_minutes" integer,
	"welcome_message" text,
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "user_consents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"document_id" varchar NOT NULL,
	"accepted_at" timestamp DEFAULT now()
);

CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"middle_name" text,
	"birth_date" text,
	"trainer_notes" text,
	"parent_full_name" text,
	"parent_phone" text,
	"mother_full_name" text,
	"mother_phone" text,
	"father_full_name" text,
	"father_phone" text,
	"guardian_full_name" text,
	"guardian_phone" text,
	"legal_representative_confirmed" boolean DEFAULT false NOT NULL,
	"sick_until" text,
	"sick_note" text,
	"exempt_membership" boolean DEFAULT false NOT NULL,
	"exempt_trainer_payment" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_pending_approval" boolean DEFAULT false NOT NULL,
	"welcome_shown" boolean DEFAULT false NOT NULL,
	"cv_restart_date" text,
	"role" text DEFAULT 'student' NOT NULL,
	"is_parent" boolean DEFAULT false NOT NULL,
	"is_also_student" boolean DEFAULT false NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"verification_code" text,
	"password" text DEFAULT '' NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"last_login" timestamp,
	"selected_service_id" varchar,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_time_slot_id_time_slots_id_fk" FOREIGN KEY ("time_slot_id") REFERENCES "public"."time_slots"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_booked_by_users_id_fk" FOREIGN KEY ("booked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_recurring_booking_id_recurring_bookings_id_fk" FOREIGN KEY ("recurring_booking_id") REFERENCES "public"."recurring_bookings"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "membership_payments" ADD CONSTRAINT "membership_payments_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "membership_payments" ADD CONSTRAINT "membership_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_related_booking_id_bookings_id_fk" FOREIGN KEY ("related_booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_related_user_id_users_id_fk" FOREIGN KEY ("related_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "parent_children" ADD CONSTRAINT "parent_children_parent_id_users_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "parent_children" ADD CONSTRAINT "parent_children_child_id_users_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "recurring_booking_exceptions" ADD CONSTRAINT "recurring_booking_exceptions_recurring_booking_id_recurring_bookings_id_fk" FOREIGN KEY ("recurring_booking_id") REFERENCES "public"."recurring_bookings"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "recurring_bookings" ADD CONSTRAINT "recurring_bookings_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "recurring_bookings" ADD CONSTRAINT "recurring_bookings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "trainer_payments" ADD CONSTRAINT "trainer_payments_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "trainer_payments" ADD CONSTRAINT "trainer_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;
