# Hospital Admin Service

Manages hospital-specific operations, health services, and health packages.

## Features

- Health Service Management (Lab Tests, Imaging, Consultations)
- Health Package Management
- Service-Package Relationships
- Pricing and Discount Management
- Service Status Management

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Validation**: Joi (optional)
- **Security**: Helmet, HPP, CORS, Rate Limiting

## Getting Started

### Prerequisites

- Node.js (v18+)
- PostgreSQL database
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp env.example .env
# Update .env with your database credentials
```

3. Generate Prisma Client:
```bash
npx prisma generate
```

4. Run database migrations:
```bash
npx prisma migrate dev
```

5. Start the development server:
```bash
npm run dev
```

The service will be available at `http://localhost:3009`

## Project Structure

```
src/
├── controllers/        # Request handlers
│   ├── healthService.controller.ts
│   └── healthPackage.controller.ts
├── services/          # Business logic
│   ├── healthService.service.ts
│   └── healthPackage.service.ts
├── routes/            # API routes
│   ├── healthService.routes.ts
│   ├── healthPackage.routes.ts
│   └── index.ts
├── middlewares/       # Express middlewares
├── utils/             # Utility functions
├── validators/        # Request validators
├── types/             # TypeScript types
├── generated/         # Prisma generated client
├── app.ts            # Express app setup
└── server.ts         # Server entry point
```

## API Documentation

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for detailed API endpoints and usage examples.

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm test` - Run tests
- `npm run lint` - Check code quality
- `npm run lint:fix` - Fix linting issues
- `npm run format` - Format code with Prettier

## Database Models

### HealthService
- Health services (lab tests, imaging, consultations)
- Pricing information
- Service status (ACTIVE/INACTIVE)
- Service type categorization

### HealthPackage
- Bundled health service packages
- Package pricing and discounts
- Validity period
- Associated services

### PackageService
- Junction table linking packages to services
- Manages many-to-many relationships

## Environment Variables

See `env.example` for required environment variables:
- `PORT` - Server port (default: 5001)
- `DATABASE_URL` - PostgreSQL connection string
- `NODE_ENV` - Environment (development/production)

