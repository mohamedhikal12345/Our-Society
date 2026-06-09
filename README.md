<div align="center">

# 🌐 Our Society

### A full-featured social networking REST API built with Node.js, Express & MongoDB

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.x-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101?style=for-the-badge&logo=socket.io&logoColor=white)](https://socket.io/)
[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://our-society-ashen.vercel.app)

**[🚀 Live Demo](https://our-society-ashen.vercel.app)** · **[📖 API Docs](#-api-reference)** · **[🐛 Report Bug](https://github.com/mohamedhikal12345/our-society/issues)**

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [API Reference](#-api-reference)
- [Project Structure](#-project-structure)
- [Deployment](#-deployment)
- [License](#-license)

---

## 📌 Overview

**Our Society** is a production-ready RESTful API for a social networking platform. It supports user authentication with JWT, a follow/unfollow system, post creation with comments and likes, and real-time messaging powered by Socket.IO. The API is secured with rate limiting, helmet, and bcrypt, and uses AWS SES for transactional emails.

---

## ✨ Features

- 🔐 **Authentication** — Register, login, logout, JWT access & refresh tokens
- 📧 **Password Recovery** — Email-based password reset via AWS SES / Nodemailer
- 👥 **Follow System** — Send, accept, reject follow requests; manage followers & following
- 📝 **Posts** — Create, delete, like/unlike posts, and view a personalized home feed
- 💬 **Comments** — Nested comments with replies; fetch and delete comment threads
- 💬 **Real-Time Chat** — One-on-one messaging and group chats via Socket.IO
- 🛡️ **Security** — Helmet, CORS, rate limiting, cookie-parser, bcrypt password hashing
- 📊 **Logging** — Winston logger with MongoDB transport
- ⚡ **Performance** — Compression middleware enabled

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express 5.x |
| Database | MongoDB (Mongoose) |
| Real-time | Socket.IO 4.x |
| Auth | JSON Web Tokens (JWT) |
| Email | AWS SES + Nodemailer |
| File Uploads | Multer |
| Security | Helmet, express-rate-limit, bcrypt |
| Logging | Winston + winston-mongodb |
| Deployment | Vercel |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- [MongoDB](https://www.mongodb.com/) (local or Atlas)
- npm or yarn

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/mohamedhikal12345/our-society.git
cd our-society
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure environment variables**

```bash
cp .env.example .env
```

Fill in the required values in `.env` (see [Environment Variables](#-environment-variables)).

4. **Run the development server**

```bash
npm run dev
```

The server will start at `http://localhost:3000`.

---

## 🔑 Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server
PORT=3000
NODE_ENV=development

# Database
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/our-society

# Authentication
JWT_ACCESS_SECRET=your_access_token_secret
JWT_REFRESH_SECRET=your_refresh_token_secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# AWS SES (Email)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
SES_FROM_EMAIL=no-reply@yourdomain.com

# Client
CLIENT_URL=http://localhost:5173
```

---

## 📖 API Reference

> **Base URL:** `https://our-society-ashen.vercel.app`

All protected routes require a valid JWT in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

---

### 🔐 Auth — `/api/users`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/register` | Register a new user | ❌ |
| `POST` | `/login` | Login and receive tokens | ❌ |
| `POST` | `/logout` | Logout current session | ✅ |
| `POST` | `/refresh-token` | Issue a new access token | ✅ |
| `GET` | `/me` | Get authenticated user data | ✅ |
| `POST` | `/request-password-reset` | Send password reset email | ❌ |
| `POST` | `/new-password` | Set a new password via token | ❌ |

---

### 👥 Follow System — `/api/follow`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/follow` | Send a follow request | ✅ |
| `POST` | `/accept` | Accept a follow request | ✅ |
| `POST` | `/reject` | Reject a follow request | ✅ |
| `DELETE` | `/unfollow` | Unfollow a user | ✅ |
| `DELETE` | `/cancel` | Cancel a sent follow request | ✅ |
| `GET` | `/followers/:userId` | Get all followers of a user | ✅ |
| `GET` | `/following/:userId` | Get all users a user is following | ✅ |

---

### 📝 Posts — `/api/posts`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/` | Create a new post | ✅ |
| `GET` | `/me` | Fetch authenticated user's posts | ✅ |
| `GET` | `/feed` | Fetch personalized home feed | ✅ |
| `DELETE` | `/:postId` | Delete a post | ✅ |
| `POST` | `/:postId/like` | Like or unlike a post | ✅ |
| `GET` | `/:postId/likes` | Get users who liked a post | ✅ |
| `POST` | `/:postId/comments` | Add a comment to a post | ✅ |
| `GET` | `/:postId/comments` | Fetch top-level comments | ✅ |
| `POST` | `/comments/:commentId/replies` | Reply to a comment | ✅ |
| `GET` | `/comments/:commentId/replies` | Get all replies of a comment | ✅ |
| `DELETE` | `/comments/:commentId` | Delete a comment or reply | ✅ |

---

### 💬 Chat — `/api/chat`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/` | Send a message or create a chat | ✅ |
| `POST` | `/group` | Create a group chat | ✅ |

> Real-time messaging is handled via **Socket.IO**. Connect to the server with your token to listen for and emit events.

---

## 📁 Project Structure

```
our-society/
├── index.js                  # Entry point
├── src/
│   ├── routes/
│   │   ├── users.js          # Auth & user routes
│   │   ├── posts.js          # Post routes
│   │   └── chat.js           # Chat routes
│   └── startups/
│       ├── db.js             # MongoDB connection
│       ├── prod.js           # Production middleware (helmet, compression, etc.)
│       ├── routes.js         # Route registration
│       └── socket.js         # Socket.IO initialization
├── .env.example
├── package.json
└── README.md
```

---

## ☁️ Deployment

This project is deployed on **Vercel**.

### Deploy Your Own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/mohamedhikal12345/our-society)

1. Push your project to a GitHub repository.
2. Import the repository on [Vercel](https://vercel.com/).
3. Add all required environment variables in the Vercel project settings.
4. Deploy — Vercel handles the rest.

> ⚠️ **Note:** Socket.IO has limited support on Vercel's serverless functions. For full real-time functionality in production, consider pairing with a dedicated server (e.g., Railway or Render) for Socket.IO connections.

---

## 📜 License

This project is licensed under the **ISC License**.

---

<div align="center">

Made with ❤️ by [Mohamed Hikal](https://github.com/mohamedhikal12345)

</div>
