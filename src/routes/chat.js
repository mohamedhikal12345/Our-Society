const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/auth.middleware");
const Chat = require("../models/chat");
const Message = require("../models/message");

// ====================== FETCH USER CHATS ======================
router.get("/", verifyToken, async (req, res) => {
  try {
    const chats = await Chat.find({
      members: { $in: [req.user._id] },
    })
      .populate("members", "username profileName profilePicture isOnline lastSeen")
      .populate("lastMessage.sender", "username profileName profilePicture")
      .sort({ updatedAt: -1 }); // Better to sort by updatedAt

    // Format private chats to show only the other member
    const formattedChats = chats.map((chat) => {
      if (chat.isGroup) {
        return chat;
      }

      const otherMember = chat.members.find((m) => m._id.toString() !== req.user._id.toString());

      return {
        _id: chat._id,
        isGroup: false,
        otherMember,
        lastMessage: chat.lastMessage,
        updatedAt: chat.updatedAt,
      };
    });

    res.status(200).json({ success: true, chats: formattedChats });
  } catch (error) {
    console.error("Fetch chats error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ====================== FETCH MESSAGES FOR A CHAT ======================
router.get("/:chatId/messages", verifyToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const cursor = req.query.cursor;

    // Verify user is member of this chat
    const chat = await Chat.findOne({
      _id: req.params.chatId,
      members: { $in: [req.user._id] },
    });

    if (!chat) {
      return res.status(404).json({ success: false, message: "Chat not found" });
    }

    const query = { chatId: req.params.chatId }; // ← Updated to chatId

    if (cursor) {
      query._id = { $lt: cursor };
    }

    const messages = await Message.find(query).populate("sender", "username profileName profilePicture").sort({ _id: -1 }).limit(limit);

    // Reverse so oldest messages come first (better UX)
    messages.reverse();

    const nextCursor = messages.length === limit ? messages[0]._id : null;

    res.status(200).json({
      success: true,
      messages,
      nextCursor,
      hasMore: !!nextCursor,
    });
  } catch (error) {
    console.error("Fetch messages error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ======================   MESSAGE (REST API) ======================
router.post("/:receiverId/send", verifyToken, async (req, res) => {
  try {
    const { text } = req.body;
    const senderId = req.user._id;
    const { receiverId } = req.params;

    if (!text?.trim()) {
      return res.status(400).json({ success: false, message: "Message text is required" });
    }

    // Find or create private chat
    let chat = await Chat.findOne({
      isGroup: false,
      members: { $all: [senderId, receiverId] },
    });

    if (!chat) {
      chat = await Chat.create({
        members: [senderId, receiverId],
        isGroup: false,
      });
    }

    const newMessage = await Message.create({
      chatId: chat._id, // ← Updated to chatId
      sender: senderId,
      text: text.trim(),
      status: "sent",
    });

    // Update chat's lastMessage
    await Chat.findByIdAndUpdate(chat._id, {
      lastMessage: {
        text: text.trim(),
        sender: senderId,
        sentAt: new Date(),
      },
      updatedAt: new Date(),
    });

    await newMessage.populate("sender", "username profileName profilePicture");

    res.status(201).json({
      success: true,
      message: newMessage,
      chatId: chat._id,
    });
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ====================== CREATE GROUP CHAT ======================
router.post("/createGroup", verifyToken, async (req, res) => {
  try {
    const { groupName, members } = req.body;

    if (!groupName || !members || members.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Group name and at least 2 members are required",
      });
    }

    const allMembers = [...new Set([req.user._id.toString(), ...members])];

    const chat = await Chat.create({
      isGroup: true,
      groupName,
      groupAdmin: req.user._id,
      members: allMembers,
    });

    await chat.populate("members", "username profileName profilePicture");

    res.status(201).json({ success: true, chat });
  } catch (error) {
    console.error("Create group error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
