🚀 Ilissiot Messenger Core
Ilissiot is a real-time messaging system built with Node.js, Socket.io, and Prisma. This repository contains the backend core capable of processing real-time messages and storing them in a cloud PostgreSQL database.

🛠 Features
Real-time communication via WebSockets.

Persistent message storage with PostgreSQL (Neon.tech).

Type-safe database operations using Prisma ORM (v7+).

Environment variable protection for sensitive data.

🏗 Setup Instructions
To get this project running on another machine, follow these steps:

1. Prerequisites
Make sure you have Node.js (v18 or higher) installed.

2. Clone the repository
Bash
git clone https://github.com/your-username/Ilissiot.git
cd Ilissiot
3. Install Dependencies
Bash
npm install
4. Configure Environment Variables
Create a .env file in the root directory and add your database connection string:

Code snippet
DATABASE_URL="postgresql://user:password@endpoint/dbname?sslmode=require"
Note: Never commit this file to GitHub!

5. Database Synchronization
Generate the Prisma Client and push the schema to your database:

Bash
npx prisma generate
npx prisma db push
6. Run the Server
Start the development server with automatic reloading:

Bash
npm run dev
📂 Project Structure
index.ts - The main server file (Socket.io logic).

prisma/schema.prisma - Database models (User, Message).

prisma.config.ts - Prisma 7 configuration for secure DB connection.

test.html - A simple client-side file for testing the connection.

🛠 Commands Reference
npm run dev - Starts the backend.

npx prisma studio - Opens a visual editor for your database.

npx prisma db push - Syncs your local schema with the cloud DB.
