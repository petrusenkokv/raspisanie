# FlowCraft - Workflow Automation Platform

## Overview

FlowCraft is a comprehensive workflow automation platform that enables users to create, manage, and execute automated workflows through a visual node-based interface. The application allows users to connect various third-party services and applications to build powerful automation sequences without coding. It features a modern React frontend with TypeScript, an Express.js backend, and PostgreSQL database for data persistence.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend is built using React 18 with TypeScript and follows a modern component-based architecture:

- **Framework**: React with TypeScript and Vite for fast development and building
- **UI Components**: Utilizes shadcn/ui component library built on Radix UI primitives for consistent, accessible design
- **Styling**: TailwindCSS with CSS variables for theming and responsive design
- **State Management**: Zustand for global state management with separate stores for workflows, templates, and user data
- **Routing**: Wouter for lightweight client-side routing
- **Data Fetching**: TanStack Query (React Query) for server state management, caching, and API calls
- **Forms**: React Hook Form with Zod validation for type-safe form handling

### Backend Architecture
The backend follows a RESTful API design pattern with Express.js:

- **Framework**: Express.js with TypeScript for type safety
- **API Design**: RESTful endpoints for workflows, templates, integrations, and analytics
- **Middleware**: Custom logging middleware for API request/response tracking
- **Error Handling**: Centralized error handling with proper HTTP status codes
- **Validation**: Zod schema validation for request data integrity

### Data Storage Solutions
- **Database**: PostgreSQL as the primary database with Drizzle ORM for type-safe database operations
- **Database Provider**: Neon serverless PostgreSQL for scalable cloud database hosting
- **Schema Management**: Drizzle Kit for database migrations and schema management
- **Connection**: @neondatabase/serverless for optimized serverless database connections

### Authentication and Authorization
The application uses a simplified authentication system:
- **User Management**: Basic user model with username/password authentication
- **Session Management**: Session-based authentication (implementation indicated by session-related dependencies)
- **Authorization**: User-scoped data access for workflows, integrations, and analytics

### External Dependencies
- **Node.js Runtime**: ESM modules with TypeScript compilation
- **Build System**: Vite for frontend bundling and esbuild for backend compilation
- **Development Tools**: Replit-specific plugins for development environment integration
- **UI Framework**: Comprehensive Radix UI component suite for accessible interface components
- **Date Handling**: date-fns for date manipulation and formatting
- **Validation**: Zod for runtime type checking and schema validation
- **HTTP Client**: Native fetch API with custom wrapper functions for API requests

### Key Features
- **Visual Workflow Builder**: Drag-and-drop interface for creating workflow nodes and connections
- **Template System**: Pre-built workflow templates for common automation scenarios
- **Integration Hub**: Connect and manage third-party application integrations
- **Analytics Dashboard**: Real-time metrics and performance tracking for workflows
- **Brand Customization**: User-specific theming and branding options
- **Mobile Responsive**: Adaptive design that works across desktop and mobile devices

The architecture prioritizes type safety, developer experience, and scalability while maintaining a clean separation of concerns between frontend and backend systems.