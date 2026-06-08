const express = require("express");
const verifyToken = require("../middleware/auth.middleware");
const postUpload = require("../config/multer-upload");
const Post = require("../models/posts");
const Comment = require("../models/comment");
const router = express.Router();
const User = require("../models/users");

router.post("/", verifyToken, postUpload.array("media", 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "At least one media file is required" });
    }

    const { caption, tags, location } = req.body;

    const media = req.files.map((file) => {
      return {
        name: file.filename,
        type: file.mimetype.startsWith("image") ? "image" : "video",
        publicId: null,
      };
    });

    const newPost = new Post({
      user: req.user._id,
      caption,
      tags,
      location,
      media,
    });

    await newPost.save();

    res.status(201).json({
      success: true,
      message: "Post created successfully",
      post: newPost,
    });
  } catch (error) {
    console.error("Create post error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// FETCH MY POSTS (Current User Feed)
router.get("/me", verifyToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    const posts = await Post.find({ user: req.user._id }).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("user", "username profileName profilePicture");

    const total = await Post.countDocuments({ user: req.user._id });

    res.status(200).json({
      success: true,
      posts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + posts.length < total,
      },
    });
  } catch (error) {
    console.error("Fetch my posts error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
// FETCH HOME FEED (Cursor Pagination)
router.get("/feed", verifyToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const cursor = req.query.cursor;

    const currentUser = await User.findById(req.user._id).select("following");
    const feedUserIds = [...(currentUser.following || []), req.user._id];

    const query = { user: { $in: feedUserIds } };

    if (cursor) {
      query._id = { $lt: cursor };
    }

    const posts = await Post.find(query).sort({ _id: -1 }).limit(limit).populate("user", "username profileName profilePicture");

    const nextCursor = posts.length === limit ? posts[posts.length - 1]._id : null;

    res.status(200).json({
      success: true,
      posts,
      nextCursor,
      hasMore: !!nextCursor,
    });
  } catch (error) {
    console.error("Feed error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
// DELETE OWN POST
router.delete("/:postId", verifyToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);

    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    // Only the owner can delete
    if (post.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own posts",
      });
    }

    await Post.findByIdAndDelete(req.params.postId);

    // Delete all comments and replies on this post
    await Comment.deleteMany({ post: req.params.postId });

    res.status(200).json({
      success: true,
      message: "Post deleted successfully",
    });
  } catch (error) {
    console.error("Delete post error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// LIKE & UNLIKE (Toggle)
router.post("/:postId/like", verifyToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);

    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    const alreadyLiked = post.likes.some((id) => id.toString() === req.user._id.toString());

    if (alreadyLiked) {
      // ── UNLIKE ──
      await Post.findByIdAndUpdate(req.params.postId, {
        $pull: { likes: req.user._id },
        $inc: { likesCount: -1 },
      });

      return res.status(200).json({
        success: true,
        message: "Post unliked",
        liked: false,
        likesCount: Math.max(0, post.likesCount - 1),
      });
    }

    // ── LIKE ──
    await Post.findByIdAndUpdate(req.params.postId, {
      $addToSet: { likes: req.user._id },
      $inc: { likesCount: 1 },
    });

    return res.status(200).json({
      success: true,
      message: "Post liked",
      liked: true,
      likesCount: post.likesCount + 1,
    });
  } catch (error) {
    console.error("Like/unlike error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
//  GET /api/posts/:postId/likes → who liked this post
router.get("/:postId/likes", verifyToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const post = await Post.findById(req.params.postId).select("likes likesCount").populate({
      path: "likes",
      select: "username profileName profilePicture",
      options: { skip, limit },
    });

    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    res.status(200).json({
      success: true,
      likes: post.likes,
      total: post.likesCount,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(post.likesCount / limit),
      },
    });
  } catch (error) {
    console.error("Get likes error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
// ADD COMMENT TO POST
router.post("/:postId/comments", verifyToken, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || text.trim() === "") {
      return res.status(400).json({ success: false, message: "Comment text is required" });
    }

    const post = await Post.findById(req.params.postId);
    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    // parentComment: null means this is a top-level comment not a reply
    const comment = await Comment.create({
      post: req.params.postId,
      user: req.user._id,
      text: text.trim(),
      parentComment: null,
    });

    await Post.findByIdAndUpdate(req.params.postId, {
      $inc: { commentsCount: 1 },
    });

    await comment.populate("user", "username profileName profilePicture");

    res.status(201).json({
      success: true,
      message: "Comment added",
      comment,
    });
  } catch (error) {
    console.error("Add comment error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
// fetch top-level comments
router.get("/:postId/comments", verifyToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const comments = await Comment.find({
      post: req.params.postId,
      parentComment: null,
    })
      .populate("user", "username profileName profilePicture")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Comment.countDocuments({
      post: req.params.postId,
      parentComment: null,
    });

    res.status(200).json({
      success: true,
      comments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + comments.length < total,
      },
    });
  } catch (error) {
    console.error("Get comments error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
//  ADD REPLY TO A COMMENT
router.post("/:postId/comments/:commentId/reply", verifyToken, async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || text.trim() === "") {
      return res.status(400).json({ success: false, message: "Reply text is required" });
    }

    const post = await Post.findById(req.params.postId);
    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    // Find parent — must be top-level (parentComment: null)
    const parentComment = await Comment.findOne({
      _id: req.params.commentId,
      post: req.params.postId,
      parentComment: null,
    });

    if (!parentComment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found or you cannot reply to a reply",
      });
    }

    const reply = await Comment.create({
      post: req.params.postId,
      user: req.user._id,
      text: text.trim(),
      parentComment: req.params.commentId,
    });

    // Update counters
    await Comment.findByIdAndUpdate(req.params.commentId, {
      $inc: { repliesCount: 1 },
    });

    await Post.findByIdAndUpdate(req.params.postId, {
      $inc: { commentsCount: 1 },
    });

    await reply.populate("user", "username profileName profilePicture");

    res.status(201).json({
      success: true,
      message: "Reply added",
      reply,
    });
  } catch (error) {
    console.error("Add reply error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
// GET /api/posts/:postId/comments/:commentId/replies
router.get("/:postId/comments/:commentId/replies", verifyToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const replies = await Comment.find({
      post: req.params.postId,
      parentComment: req.params.commentId,
    })
      .populate("user", "username profileName profilePicture")
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit);

    const total = await Comment.countDocuments({
      post: req.params.postId,
      parentComment: req.params.commentId,
    });

    res.status(200).json({
      success: true,
      replies,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + replies.length < total,
      },
    });
  } catch (error) {
    console.error("Get replies error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
//  DELETE COMMENT OR REPLY
router.delete("/:postId/comments/:commentId", verifyToken, async (req, res) => {
  try {
    const comment = await Comment.findOne({
      _id: req.params.commentId,
      post: req.params.postId,
    });

    if (!comment) {
      return res.status(404).json({ success: false, message: "Comment not found" });
    }

    const post = await Post.findById(req.params.postId);

    const isCommentUser = comment.user.toString() === req.user._id.toString();
    const isPostOwner = post && post.user.toString() === req.user._id.toString();

    if (!isCommentUser && !isPostOwner) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this comment",
      });
    }

    // ── Top-level comment → delete it + all its replies ──
    if (comment.parentComment === null) {
      const repliesCount = await Comment.countDocuments({
        parentComment: req.params.commentId,
      });

      await Comment.findByIdAndDelete(req.params.commentId);
      await Comment.deleteMany({ parentComment: req.params.commentId });

      await Post.findByIdAndUpdate(req.params.postId, {
        $inc: { commentsCount: -(1 + repliesCount) },
      });

      return res.status(200).json({
        success: true,
        message: "Comment and its replies deleted",
        deletedCount: 1 + repliesCount,
      });
    }

    // ── Reply → delete only this reply ──
    await Comment.findByIdAndDelete(req.params.commentId);

    await Comment.findByIdAndUpdate(comment.parentComment, {
      $inc: { repliesCount: -1 },
    });

    await Post.findByIdAndUpdate(req.params.postId, {
      $inc: { commentsCount: -1 },
    });

    return res.status(200).json({
      success: true,
      message: "Reply deleted",
      deletedCount: 1,
    });
  } catch (error) {
    console.error("Delete comment error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
