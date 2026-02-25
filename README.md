🚀 Ilissiot Messenger Core<br>
Ilissiot is a real-time messaging system built with Node.js, Socket.io, and Prisma. This repository contains the backend core capable of processing real-time messages and storing them in a cloud PostgreSQL database.<br>

🛠 Features<br>
Real-time communication via WebSockets.<br>

Persistent message storage with PostgreSQL (Neon.tech).<br>

Type-safe database operations using Prisma ORM (v7+).<br>

Environment variable protection for sensitive data.<br>

🏗 Setup Instructions<br>
To get this project running on another machine, follow these steps:<br>

1. Prerequisites<br>
Make sure you have Node.js (v18 or higher) installed.<br>

2. Clone the repository<br>
Bash<br>
git clone https://github.com/your-username/Ilissiot.git<br>
cd Ilissiot<br>
3. Install Dependencies<br>
Bash<br>
npm install<br>
4. Configure Environment Variables<br>
Create a .env file in the root directory and add your database connection string:<br>

Code snippet<br>
DATABASE_URL="postgresql://user:password@endpoint/dbname?sslmode=require"<br>
Note: Never commit this file to GitHub!<br>

5. Database Synchronization<br>
Generate the Prisma Client and push the schema to your database:<br>

Bash<br>
npx prisma generate<br>
npx prisma db push<br>
6. Run the Server<br>
Start the development server with automatic reloading:<br>

Bash<br>
npm run dev<br>
📂 Project Structure<br>
index.ts - The main server file (Socket.io logic).<br>

prisma/schema.prisma - Database models (User, Message).<br>

prisma.config.ts - Prisma 7 configuration for secure DB connection.<br>

test.html - A simple client-side file for testing the connection.<br>

🛠 Commands Reference<br>
npm run dev - Starts the backend.<br>

npx prisma studio - Opens a visual editor for your database.<br>

npx prisma db push - Syncs your local schema with the cloud DB.<br>
