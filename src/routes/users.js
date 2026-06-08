const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { getRefreshTokenOptions, clearCookieOptions } = require("../config/cookieOptions");
const verifyToken = require("../middleware/auth.middleware");
const { loginLimiter, registerLimiter } = require("../middleware/rateLimit.middleware");
const RefreshToken = require("../models/RefreshToken.model");
const { generateAccessToken, generateRefreshToken, generateToken } = require("../utils/generateTokens");
const User = require("../models/users");
const sendSMTPEmail = require("../config/smtp");
const FollowRequest = require("../models/FollowRequest.model");
const router = express.Router();

router.post("/register", registerLimiter, async (req, res) => {
  try {
    const { username, email, password, isPrivate } = req.body;

    // Validate required fields
    if (!username || !email || !password) {
      return res.status(400).json({
        message: "All fields are required!",
        success: false,
      });
    }

    // Validate email format
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        message: "Invalid email format!",
        success: false,
      });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters!",
        success: false,
      });
    }

    // Check if username or email already exists
    const existingUser = await User.findOne({
      $or: [{ username }, { email }],
    });

    if (existingUser) {
      return res.status(400).json({
        message: existingUser.username === username ? "Username is already taken!" : "Email is already registered!",
        success: false,
      });
    }

    // Hash password
    const hashedPass = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = new User({
      username,
      email,
      password: hashedPass,
      profileName: username, // ✅ default profileName to username
      isPrivate,
    });

    await newUser.save();

    // Generate tokens
    const accessToken = generateAccessToken({
      _id: newUser._id,
      username: newUser.username,
    });

    const refreshToken = generateRefreshToken({
      _id: newUser._id,
      username: newUser.username,
    });

    // ✅ Fixed: No rememberMe in register
    // Always 7 days for new users
    const expiryDays = 7;

    // ✅ Save refresh token to DB
    await RefreshToken.create({
      token: refreshToken,
      userId: newUser._id,
      expiresAt: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
      rememberMe: false, // ✅ Always false in register
      lastUsedAt: new Date(), // ✅ Set activity time
    });

    // ✅ Set cookie (auto login after register)
    res.cookie(
      "refreshToken",
      refreshToken,
      getRefreshTokenOptions(expiryDays), // ✅ Fixed 7 days
    );

    res.status(201).json({
      message: "User registered successfully",
      success: true,
      accessToken,
      user: {
        _id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        profilePicture: newUser.profilePicture,
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { username, password, rememberMe } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        message: "Missing required fields!",
        success: false,
      });
    }

    // ✅ Allow login with username OR email
    const user = await User.findOne({
      $or: [{ username }, { email: username }],
    });

    if (!user) {
      return res.status(401).json({
        message: "Invalid username or password",
        success: false,
      });
    }

    // ✅ Check if account is active
    if (user.accountStatus !== "active") {
      return res.status(403).json({
        message: `Account is ${user.accountStatus}. Contact support.`,
        success: false,
      });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid username or password",
        success: false,
      });
    }

    // Generate tokens
    const accessToken = generateAccessToken({
      _id: user._id,
      username: user.username,
    });

    const refreshToken = generateRefreshToken({
      _id: user._id,
      username: user.username,
    });

    // ✅ Fixed: Added lastUsedAt
    const expiryDays = rememberMe ? 30 : 7;
    await RefreshToken.create({
      token: refreshToken,
      userId: user._id,
      expiresAt: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
      rememberMe: rememberMe || false,
      lastUsedAt: new Date(), // ✅ Added!
    });

    // ✅ Fixed: lastSeen = null on login
    await User.findByIdAndUpdate(user._id, {
      isOnline: true,
      lastSeen: null,
    });

    // Set cookie
    res.cookie("refreshToken", refreshToken, getRefreshTokenOptions(expiryDays));

    res.status(200).json({
      message: "Login successful",
      success: true,
      accessToken,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
        profileName: user.profileName,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error", success: false });
  }
});
router.post("/refresh", async (req, res) => {
  try {
    const oldRefreshToken = req.cookies.refreshToken;

    if (!oldRefreshToken) {
      return res.status(401).json({
        message: "No refresh token! Please login.",
        success: false,
      });
    }

    jwt.verify(oldRefreshToken, process.env.REFRESH_TOKEN_SECRET, async (err, user) => {
      try {
        if (err) {
          res.clearCookie("refreshToken");

          if (err.name === "TokenExpiredError") {
            const decoded = jwt.decode(oldRefreshToken);
            if (decoded?._id) {
              await RefreshToken.findOneAndDelete({
                token: oldRefreshToken,
                userId: decoded._id,
              });
            }
            return res.status(401).json({
              message: "Session expired! Please login again.",
              success: false,
              reason: "EXPIRED",
            });
          }

          if (err.name === "JsonWebTokenError") {
            return res.status(403).json({
              message: "Invalid token! Please login again.",
              success: false,
              reason: "INVALID",
            });
          }

          return res.status(403).json({
            message: "Token error! Please login again.",
            success: false,
            reason: "TOKEN_ERROR",
          });
        }

        const existingToken = await RefreshToken.findOne({
          token: oldRefreshToken,
          userId: user._id,
        });

        if (!existingToken) {
          res.clearCookie("refreshToken");

          const userHasOtherTokens = await RefreshToken.findOne({
            userId: user._id,
          });

          if (userHasOtherTokens) {
            await RefreshToken.deleteMany({ userId: user._id });
            return res.status(403).json({
              message: "Security breach! All sessions terminated.",
              success: false,
              reason: "REUSE_DETECTED",
            });
          }

          return res.status(401).json({
            message: "Session not found! Please login again.",
            success: false,
            reason: "SESSION_NOT_FOUND",
          });
        }

        // ✅ UPDATE 1 - SLIDING SESSION
        // Check last activity instead of just expiry
        // If rememberMe → 30 days of inactivity allowed
        // If not rememberMe → 7 days of inactivity allowed
        const inactiveDays = existingToken.rememberMe ? 30 : 7;
        const inactiveLimit = new Date(existingToken.lastUsedAt.getTime() + inactiveDays * 24 * 60 * 60 * 1000);

        if (new Date() > inactiveLimit) {
          // User has been inactive too long → force login
          await RefreshToken.findOneAndDelete({ token: oldRefreshToken });
          res.clearCookie("refreshToken");
          return res.status(401).json({
            message: "Session expired due to inactivity! Please login again.",
            success: false,
            reason: "INACTIVE_EXPIRED",
          });
        }

        if (existingToken.expiresAt < new Date()) {
          await RefreshToken.findOneAndDelete({ token: oldRefreshToken });
          res.clearCookie("refreshToken");
          return res.status(401).json({
            message: "Session expired! Please login again.",
            success: false,
            reason: "EXPIRED",
          });
        }

        // Generate new tokens
        const newAccessToken = generateAccessToken({
          _id: user._id,
          username: user.username,
        });

        const newRefreshToken = generateRefreshToken({
          _id: user._id,
          username: user.username,
        });

        // ✅ UPDATE 2 - REMEMBER ME + SLIDING SESSION COMBINED
        // Calculate new expiry based on rememberMe
        const expiryDays = existingToken.rememberMe ? 30 : 7;
        const newExpiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
        // ↑ Every refresh → expiry resets from NOW
        // This is the sliding window effect!

        // Rotate tokens in DB
        await RefreshToken.findOneAndDelete({ token: oldRefreshToken });
        await RefreshToken.create({
          token: newRefreshToken,
          userId: user._id,
          expiresAt: newExpiresAt, // ✅ Dynamic expiry
          rememberMe: existingToken.rememberMe, // ✅ Carry over rememberMe
          lastUsedAt: new Date(), // ✅ Reset last activity
        });

        // ✅ UPDATE 3 - SILENT REFRESH
        // Cookie maxAge matches the token expiry
        // So cookie never expires before token does
        // Frontend can silently call /refresh before expiry
        res.cookie("refreshToken", newRefreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: expiryDays * 24 * 60 * 60 * 1000, // ✅ Matches token expiry
        });

        // ✅ UPDATE 4 - Send expiry info to frontend
        // So frontend knows WHEN to silently refresh
        res.status(200).json({
          success: true,
          accessToken: newAccessToken,
          sessionInfo: {
            rememberMe: existingToken.rememberMe,
            expiresAt: newExpiresAt, // ✅ Frontend uses this to
            expiryDays, //    schedule silent refresh
          },
        });
      } catch (innerError) {
        console.error("Refresh inner error:", innerError);
        res.status(500).json({ message: "Server error", success: false });
      }
    });
  } catch (error) {
    console.error("Refresh error:", error);
    res.status(500).json({ message: "Server error", success: false });
  }
});
// ✅ LOGOUT
router.post("/logout", async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      await RefreshToken.findOneAndDelete({ token: refreshToken });

      // ✅ Verify the token before using decoded data
      try {
        const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
        if (decoded?._id) {
          await User.findByIdAndUpdate(decoded._id, {
            isOnline: false,
            lastSeen: new Date(),
          });
        }
      } catch (verifyError) {
        // Token is invalid or expired - still clear it, jus t don't update user
        console.log("Invalid refresh token during logout:", verifyError.message);
      }
    }

    res.clearCookie("refreshToken", clearCookieOptions);
    res.status(200).json({
      success: true,
      message: "Logged out successfully!",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ message: "Server error", success: false });
  }
});

// ==========================================
// 👤 PROFILE ROUTES (Protected)
// ==========================================

// ✅ GET current user profile
router.get("/me", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password -blockedUsers");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({ success: true, user });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ message: "Server error", success: false });
  }
});

// ==========================================
// 👤 Password Reset ROUTES
// ==========================================

// ========== REQUEST PASSWORD RESET ==========
router.post("/request-password-reset", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: "Email required" });
  }

  try {
    const user = await User.findOne({ email });

    // ✅ Security: Same response whether email exists or not
    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If an account exists, you'll receive a reset link.",
      });
    }

    // ✅ Generate JWT for password reset (NOT access/refresh token)
    const resetToken = jwt.sign(
      {
        _id: user._id,
        purpose: "password_reset", // Prevents token reuse for other purposes
      },
      process.env.JWT_KEY, // Your existing secret
      { expiresIn: "1h" },
    );

    // Save to database (optional but recommended)
    user.resetToken = resetToken;
    user.resetTokenExpires = Date.now() + 60 * 60 * 1000;
    await user.save();

    // ✅ Send email - NEVER return token in response
    const subject = "Password Rest Request for your ourSociety account ";
    const text = `Click this link to reset your password : https://ourSociety.com/reset-password?resetToken=${resetToken}`;

    sendSMTPEmail(user.email, subject, text);

    res.json({
      message: "Password reset link sent to email",
      resetToken: resetToken, // ⚠️ Remove this in production - security risk!
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ========== RESET PASSWORD ==========
router.post("/reset-password", async (req, res) => {
  const { resetToken, newPassword } = req.body;

  if (!resetToken || !newPassword) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }

  try {
    // ✅ Verify the reset token
    const decoded = jwt.verify(resetToken, process.env.JWT_KEY);

    // Optional: Check purpose
    if (decoded.purpose !== "password_reset") {
      return res.status(400).json({ success: false, message: "Invalid token type" });
    }

    const user = await User.findById(decoded._id);

    if (!user || user.resetToken !== resetToken || user.resetTokenExpires <= Date.now()) {
      return res.status(400).json({ success: false, message: "Invalid or expired token" });
    }

    // Update password
    user.password = await bcrypt.hash(newPassword, 10);
    user.resetToken = null;
    user.resetTokenExpires = null;
    await user.save();

    // ✅ Invalidate all refresh tokens (force re-login)
    await RefreshToken.deleteMany({ userId: user._id });

    res.json({ success: true, message: "Password reset successfully!" });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(400).json({ success: false, message: "Token expired" });
    }
    res.status(500).json({ success: false, message: "Server error" });
  }
});
// ─────────────────────────────────────────────
// POST /follow/:userId
// Send a follow request OR follow instantly
// ─────────────────────────────────────────────
router.post("/:userId", verifyToken, async (req, res) => {
  try {
    const senderId = req.user._id;
    const receiverId = req.params.userId;

    // Can't follow yourself
    if (senderId.toString() === receiverId) {
      return res.status(400).json({
        success: false,
        message: "You can't follow yourself",
      });
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if already following
    const alreadyFollowing = receiver.followers.includes(senderId);
    if (alreadyFollowing) {
      return res.status(400).json({
        success: false,
        message: "You are already following this user",
      });
    }

    // Check if a pending request already exists
    const existingRequest = await FollowRequest.findOne({
      sender: senderId,
      receiver: receiverId,
      status: "pending",
    });

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: "Follow request already sent",
      });
    }

    // ── PRIVATE ACCOUNT → send request ──
    if (receiver.isPrivate) {
      await FollowRequest.create({
        sender: senderId,
        receiver: receiverId,
        status: "pending",
      });

      return res.status(200).json({
        success: true,
        message: "Follow request sent",
        type: "request_sent",
      });
    }

    // ── PUBLIC ACCOUNT → follow instantly ──
    await User.findByIdAndUpdate(receiverId, {
      $addToSet: { followers: senderId },
    });

    await User.findByIdAndUpdate(senderId, {
      $addToSet: { following: receiverId },
    });

    return res.status(200).json({
      success: true,
      message: "Followed successfully",
      type: "followed",
    });
  } catch (error) {
    console.error("Follow error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─────────────────────────────────────────────
// POST /follow/:requestId/accept
// Accept a pending follow request (receiver only)
// ─────────────────────────────────────────────
router.post("/:requestId/accept", verifyToken, async (req, res) => {
  try {
    const receiverId = req.user._id;
    const { requestId } = req.params;

    const request = await FollowRequest.findById(requestId);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Follow request not found",
      });
    }

    // Only the receiver can accept
    if (request.receiver.toString() !== receiverId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    if (request.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Request already ${request.status}`,
      });
    }

    // Update request status
    request.status = "accepted";
    await request.save();

    // Update both users' followers/following arrays
    await User.findByIdAndUpdate(request.receiver, {
      $addToSet: { followers: request.sender },
    });

    await User.findByIdAndUpdate(request.sender, {
      $addToSet: { following: request.receiver },
    });

    res.status(200).json({
      success: true,
      message: "Follow request accepted",
    });
  } catch (error) {
    console.error("Accept follow error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─────────────────────────────────────────────
// POST /follow/:requestId/reject
// Reject a pending follow request (receiver only)
// ─────────────────────────────────────────────
router.post("/:requestId/reject", verifyToken, async (req, res) => {
  try {
    const receiverId = req.user._id;
    const { requestId } = req.params;

    const request = await FollowRequest.findById(requestId);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Follow request not found",
      });
    }

    // Only the receiver can reject
    if (request.receiver.toString() !== receiverId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    if (request.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Request already ${request.status}`,
      });
    }

    // Simply delete the request — no need to keep rejected ones
    await FollowRequest.findByIdAndDelete(requestId);

    res.status(200).json({
      success: true,
      message: "Follow request rejected",
    });
  } catch (error) {
    console.error("Reject follow error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─────────────────────────────────────────────
// DELETE /follow/:userId/unfollow
// Unfollow a user you are currently following
// ─────────────────────────────────────────────
router.delete("/:userId/unfollow", verifyToken, async (req, res) => {
  try {
    const senderId = req.user._id;
    const receiverId = req.params.userId;

    if (senderId.toString() === receiverId) {
      return res.status(400).json({
        success: false,
        message: "You can't unfollow yourself",
      });
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if actually following
    const isFollowing = receiver.followers.includes(senderId);
    if (!isFollowing) {
      return res.status(400).json({
        success: false,
        message: "You are not following this user",
      });
    }

    // Remove from both sides
    await User.findByIdAndUpdate(receiverId, {
      $pull: { followers: senderId },
    });

    await User.findByIdAndUpdate(senderId, {
      $pull: { following: receiverId },
    });

    // Also cancel any pending request if exists
    await FollowRequest.findOneAndDelete({
      sender: senderId,
      receiver: receiverId,
    });

    res.status(200).json({
      success: true,
      message: "Unfollowed successfully",
    });
  } catch (error) {
    console.error("Unfollow error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─────────────────────────────────────────────
// DELETE /follow/:userId/cancel
// Cancel a pending follow request you sent
// ─────────────────────────────────────────────
router.delete("/:userId/cancel", verifyToken, async (req, res) => {
  try {
    const senderId = req.user._id;
    const receiverId = req.params.userId;

    const request = await FollowRequest.findOneAndDelete({
      sender: senderId,
      receiver: receiverId,
      status: "pending",
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "No pending follow request found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Follow request cancelled",
    });
  } catch (error) {
    console.error("Cancel request error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─────────────────────────────────────────────
// GET /follow/:userId/followers
// Get all followers of a user
// ─────────────────────────────────────────────
router.get("/:userId/followers", verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // If private account, only the owner can see followers
    if (user.isPrivate && userId !== req.user._id.toString()) {
      const isFollowing = user.followers.includes(req.user._id);
      if (!isFollowing) {
        return res.status(403).json({
          success: false,
          message: "This account is private",
        });
      }
    }

    const populatedUser = await User.findById(userId).select("followers").populate({
      path: "followers",
      select: "username profileName profilePicture isPrivate",
      options: { skip, limit },
    });

    res.status(200).json({
      success: true,
      followers: populatedUser.followers,
      total: user.followers.length,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(user.followers.length / limit),
      },
    });
  } catch (error) {
    console.error("Get followers error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─────────────────────────────────────────────
// GET /follow/:userId/following
// Get all users that a user is following
// ─────────────────────────────────────────────
router.get("/:userId/following", verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // If private account, only the owner or followers can see following
    if (user.isPrivate && userId !== req.user._id.toString()) {
      const isFollowing = user.followers.includes(req.user._id);
      if (!isFollowing) {
        return res.status(403).json({
          success: false,
          message: "This account is private",
        });
      }
    }

    const populatedUser = await User.findById(userId).select("following").populate({
      path: "following",
      select: "username profileName profilePicture isPrivate",
      options: { skip, limit },
    });

    res.status(200).json({
      success: true,
      following: populatedUser.following,
      total: user.following.length,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(user.following.length / limit),
      },
    });
  } catch (error) {
    console.error("Get following error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
