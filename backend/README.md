Folder Structure
backend/
    src/
    │
    ├── server.ts
    ├── app.ts
    │
    ├── config/
    │     env.ts
    │     prisma.ts
    │
    ├── plugins/
    │
    ├── modules/
    │
    ├── routes/
    │
    ├── middleware/
    │
    ├── utils/
    │
    └── types/

    prisma/
        schema.prisma

    .env

Project Structure (Feature-Based)

As the application grows, organize it by feature rather than by file type:

src/
├── app.ts
├── server.ts
├── config/
│   ├── env.ts
│   └── prisma.ts
├── common/
│   ├── errors/
│   ├── plugins/
│   ├── middleware/
│   └── utils/
├── modules/
│   ├── auth/
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── auth.repository.ts
│   │   ├── auth.routes.ts
│   │   ├── auth.schema.ts
│   │   └── auth.types.ts
│   ├── users/
│   ├── projects/
│   └── tasks/
└── prisma/